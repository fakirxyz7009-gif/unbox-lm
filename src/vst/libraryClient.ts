/**
 * Browser side of the plugin / content library. The app runs from the in-app copy
 * (/library/library.json + copied preview audio), so no external folder is needed; the server
 * (when present) can rescan the source folder and rebuild that copy. Searches locally
 * (shared/vst/search.ts) and decodes preview audio.
 */
import { useSyncExternalStore } from 'react';
import type { ManifestItem, PresetItem, Product, VstManifest } from '../../shared/vst/manifestTypes.ts';
import { searchManifest, type SearchHit, type SearchOptions } from '../../shared/vst/search.ts';
import { sharedAudioContext } from '../audio/AudioEngineGraph.ts';

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'scanning' | 'offline' | 'error';

export interface LibraryState {
  status: LibraryStatus;
  manifest: VstManifest | null;
  roots: string[];
  /** A source folder exists on this computer, so Rescan can refresh the in-app library. */
  canRescan: boolean;
  error?: string;
}

class VstLibraryClient {
  private state: LibraryState = { status: 'idle', manifest: null, roots: [], canRescan: false };
  private items = new Map<string, ManifestItem>();
  private products = new Map<string, Product>();
  private listeners = new Set<() => void>();
  private loading: Promise<VstManifest | null> | null = null;
  private decoded = new Map<string, Promise<AudioBuffer>>();
  private audition: { id: string; source: AudioBufferSourceNode } | null = null;

  readonly getState = (): LibraryState => this.state;

  readonly subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  get manifest(): VstManifest | null {
    return this.state.manifest;
  }

  item(id: string | undefined): ManifestItem | undefined {
    return id ? this.items.get(id) : undefined;
  }

  product(id: string): Product | undefined {
    return this.products.get(id);
  }

  presetsFor(itemId: string): PresetItem[] {
    return (this.state.manifest?.items ?? []).filter((i): i is PresetItem => i.kind === 'preset' && i.targetId === itemId && !i.duplicateOf);
  }

  /**
   * Browsable items: things this app can actually run (hostable 64-bit units, playable samples)
   * without duplicate copies. The raw manifest stays available for details and rescan.
   */
  browsableItems(): ManifestItem[] {
    return (this.state.manifest?.items ?? []).filter((i) => {
      if (i.duplicateOf) return false;
      if (i.kind === 'plugin') return i.hostable;
      if (i.kind === 'instrument') return true;
      return i.kind === 'sample' || i.kind === 'sample-pack';
    });
  }

  search(query: string, opts?: SearchOptions): SearchHit[] {
    if (!this.state.manifest) return [];
    const items = opts?.includeDuplicates ? this.state.manifest.items : this.browsableItems();
    return searchManifest(items, query, opts);
  }

  previewUrl(sampleId: string): string {
    const item = this.items.get(sampleId);
    if (item?.kind === 'sample' && item.file) return `/${item.file}`;
    return `/api/vst/file/${encodeURIComponent(sampleId)}`;
  }

  load(force = false): Promise<VstManifest | null> {
    if (this.loading) return this.loading;
    if (this.state.manifest && !force) return Promise.resolve(this.state.manifest);
    this.set({ status: 'loading', error: undefined });
    this.loading = (async () => {
      try {
        // In-app copy first: static file, works without the server or the source folder.
        const bundled = await fetch('/library/library.json', { cache: 'no-cache' })
          .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<VstManifest>) : null))
          .catch(() => null);
        void this.probeRescan();
        if (bundled && Array.isArray(bundled.items)) {
          this.accept(bundled, []);
          return bundled;
        }
        const res = await fetch('/api/vst/manifest');
        if (res.status === 503 || res.status === 404) throw new OfflineError();
        const data = (await res.json()) as { manifest?: VstManifest | null; roots?: string[]; error?: string };
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        this.accept(data.manifest ?? null, data.roots ?? []);
        return data.manifest ?? null;
      } catch (e) {
        const offline = e instanceof OfflineError || e instanceof TypeError;
        this.set({
          status: offline ? 'empty' : 'error',
          error: offline ? 'No plugin library is built into this copy of the app yet.' : (e as Error).message,
        });
        return null;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /** Asks the server whether a source folder exists (only then is Rescan offered). */
  private async probeRescan(): Promise<void> {
    try {
      const r = await fetch('/api/vst/status');
      if (!r.ok) return;
      const s = (await r.json()) as { rootsAvailable?: boolean; roots?: string[] };
      this.set({ canRescan: !!s.rootsAvailable, roots: s.roots ?? [] });
    } catch {
      // static build without the API: no rescans
    }
  }

  async rescan(): Promise<void> {
    this.set({ status: 'scanning', error: undefined });
    try {
      const res = await fetch('/api/vst/rescan', { method: 'POST' });
      const data = (await res.json()) as { manifest?: VstManifest; error?: string };
      if (!res.ok || !data.manifest) throw new Error(data.error || `HTTP ${res.status}`);
      this.decoded.clear();
      this.accept(data.manifest, this.state.roots);
    } catch (e) {
      this.set({ status: 'error', error: `Scan failed: ${(e as Error).message}` });
    }
  }

  /** Decode a playable library sample (cached). Works for any AudioContext. */
  decode(sampleId: string, ctx: BaseAudioContext = sharedAudioContext): Promise<AudioBuffer> {
    const key = `${sampleId}@${ctx.sampleRate}`;
    let p = this.decoded.get(key);
    if (!p) {
      p = fetch(this.previewUrl(sampleId))
        .then((r) => {
          if (!r.ok) throw new Error(`Preview not available (HTTP ${r.status})`);
          return r.arrayBuffer();
        })
        .then((buf) => ctx.decodeAudioData(buf));
      p.catch(() => this.decoded.delete(key));
      this.decoded.set(key, p);
      if (this.decoded.size > 32) this.decoded.delete(this.decoded.keys().next().value as string);
    }
    return p;
  }

  /** Browser audition straight to the speakers (not through the rack). Toggles off when replayed. */
  async toggleAudition(sampleId: string): Promise<boolean> {
    const wasPlaying = this.audition?.id === sampleId;
    this.stopAudition();
    if (wasPlaying) return false;
    const ctx = sharedAudioContext;
    if (ctx.state === 'suspended') await ctx.resume();
    const buffer = await this.decode(sampleId, ctx);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.8;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => {
      if (this.audition?.source === source) this.audition = null;
      gain.disconnect();
      this.notify();
    };
    source.start();
    this.audition = { id: sampleId, source };
    this.notify();
    return true;
  }

  stopAudition(): void {
    if (!this.audition) return;
    try {
      this.audition.source.stop();
    } catch {
      // already stopped
    }
    this.audition = null;
    this.notify();
  }

  get auditioningId(): string | null {
    return this.audition?.id ?? null;
  }

  private accept(manifest: VstManifest | null, roots: string[]): void {
    this.items = new Map((manifest?.items ?? []).map((i) => [i.id, i]));
    this.products = new Map((manifest?.products ?? []).map((p) => [p.id, p]));
    this.set({ manifest, roots, status: manifest ? 'ready' : 'empty' });
  }

  private set(patch: Partial<LibraryState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }
}

class OfflineError extends Error {}

export const vstLibrary = new VstLibraryClient();

/** React binding: re-renders on manifest / status / audition changes. */
export function useVstLibrary(): LibraryState & { auditioningId: string | null } {
  const state = useSyncExternalStore(vstLibrary.subscribe, vstLibrary.getState, vstLibrary.getState);
  const auditioningId = useSyncExternalStore(vstLibrary.subscribe, () => vstLibrary.auditioningId, () => null);
  return { ...state, auditioningId };
}
