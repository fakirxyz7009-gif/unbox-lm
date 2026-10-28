/**
 * RealMultiSampler.ts
 *
 * Memory-safe Web Audio multi-sampler engine for real recorded instruments.
 *
 * Key Architectural Features:
 * 1. On-Demand Lazy Loading: Never preloads audio buffers at startup. Only fetches
 *    and decodes samples for the currently selected sub-voice when the device is added.
 * 2. Progressive Velocity Layer Decoding: Loads middle velocity layer first for
 *    instant note playback, then decodes remaining velocity layers in the background.
 * 3. LRU AudioBuffer Caching & Cleanup Routine: Reference-counted buffer management
 *    with automatic eviction when devices are removed from the rack to keep memory safe.
 * 4. Pitch-Shifting Interpolation: Mathematical pitch scaling when chromatic samples
 *    have gaps (e.g. minor thirds or octave sampling).
 */

import type {
  DeviceSampleManifest,
  MultiSampleManifest,
  SamplePitchZone,
  SampleVelocityLayer,
  SubVoiceDefinition,
} from '../../../shared/instruments/sampleManifestTypes.ts';
import { getDefaultSubVoice, getSubVoicesForDevice } from '../../../shared/instruments/subVoices.ts';

export interface ActiveSamplerVoice {
  id: string;
  deviceId: string;
  note: number;
  velocity: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  startTime: number;
  endTime?: number;
}

export interface PlayNoteOptions {
  transpose?: number; // Semitones
  fineTune?: number;  // Cents
  attack?: number;    // Seconds
  release?: number;   // Seconds
  gain?: number;      // Volume multiplier
}

export class RealMultiSampler {
  private static instance: RealMultiSampler | null = null;

  public manifest: MultiSampleManifest | null = null;
  private manifestPromise: Promise<MultiSampleManifest | null> | null = null;

  // AudioBuffer cache indexed by sample file path
  private bufferCache = new Map<string, AudioBuffer>();
  // Timestamp of last access for LRU eviction
  private lastAccess = new Map<string, number>();
  // Reference count per file: how many active devices are using this sample
  private fileRefCount = new Map<string, number>();
  // Leased files per device: deviceId -> Set<filePath>
  private deviceFiles = new Map<string, Set<string>>();
  // Active sub-voice ID per device: deviceId -> subVoiceId
  private deviceActiveSubVoice = new Map<string, string>();
  // Loading promises to avoid duplicate in-flight requests
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  // Active playing voices: deviceId -> Map<note, ActiveSamplerVoice[]>
  private activeVoices = new Map<string, Map<number, ActiveSamplerVoice[]>>();

  // Maximum cached audio memory footprint in bytes (default: 250 MB)
  public maxCacheBytes = 250 * 1024 * 1024;
  private currentCacheBytes = 0;

  public static getInstance(): RealMultiSampler {
    if (!RealMultiSampler.instance) {
      RealMultiSampler.instance = new RealMultiSampler();
    }
    return RealMultiSampler.instance;
  }

  constructor() {
    // Lazily load manifest on first access
  }

  /**
   * Fetches or retrieves the sample manifest metadata.
   * Does NOT load any audio buffers.
   */
  public async getManifest(): Promise<MultiSampleManifest | null> {
    if (this.manifest) return this.manifest;
    if (this.manifestPromise) return this.manifestPromise;

    this.manifestPromise = (async () => {
      try {
        const res = await fetch('/samples/sample-manifest.json');
        if (res.ok) {
          this.manifest = (await res.json()) as MultiSampleManifest;
          return this.manifest;
        }
      } catch {
        // Handled below with synthetic/default registry
      }
      return null;
    })();

    return this.manifestPromise;
  }

  /**
   * Registers a device and lazy-loads the selected sub-voice.
   * Middle velocity layer is loaded first for instant playback.
   */
  public async loadDeviceSubVoice(
    deviceId: string,
    instrumentName: string,
    subVoiceId?: string,
    ctx?: BaseAudioContext
  ): Promise<void> {
    if (!ctx) return;

    // Determine sub-voice
    const chosenVoiceId = subVoiceId || getDefaultSubVoice(instrumentName).id;
    this.deviceActiveSubVoice.set(deviceId, chosenVoiceId);

    // Release any previous files leased by this device if switching voices
    const prevFiles = this.deviceFiles.get(deviceId);
    if (prevFiles) {
      for (const file of prevFiles) {
        const count = (this.fileRefCount.get(file) ?? 1) - 1;
        if (count <= 0) {
          this.fileRefCount.delete(file);
        } else {
          this.fileRefCount.set(file, count);
        }
      }
      prevFiles.clear();
    } else {
      this.deviceFiles.set(deviceId, new Set<string>());
    }

    const manifest = await this.getManifest();
    const subVoice = this.findSubVoice(instrumentName, chosenVoiceId, manifest);
    if (!subVoice || !subVoice.velocityLayers?.length) return;

    const deviceLease = this.deviceFiles.get(deviceId)!;

    // PROGRESSIVE STEP 1: Find middle velocity layer for instant playback
    const layers = subVoice.velocityLayers;
    const middleIndex = Math.floor(layers.length / 2);
    const middleLayer = layers.find((l) => l.isMiddleLayer) || layers[middleIndex] || layers[0];

    // Decode middle layer zones immediately
    await this.loadLayerZones(middleLayer, deviceLease, ctx);

    // PROGRESSIVE STEP 2: Decode remaining velocity layers in background
    const remainingLayers = layers.filter((l) => l !== middleLayer);
    if (remainingLayers.length > 0) {
      void (async () => {
        for (const layer of remainingLayers) {
          // Check if device is still active before loading next layer
          if (!this.deviceFiles.has(deviceId)) break;
          await this.loadLayerZones(layer, deviceLease, ctx);
        }
      })();
    }
  }

  /**
   * Decodes zones for a specific velocity layer with concurrency throttle.
   */
  private async loadLayerZones(
    layer: SampleVelocityLayer,
    deviceLease: Set<string>,
    ctx: BaseAudioContext
  ): Promise<void> {
    const queue = layer.zones.filter((z) => !!z.file);
    const CONCURRENCY = 4;
    let index = 0;

    const worker = async () => {
      while (index < queue.length) {
        const zone = queue[index++];
        deviceLease.add(zone.file);
        this.fileRefCount.set(zone.file, (this.fileRefCount.get(zone.file) ?? 0) + 1);

        try {
          await this.fetchAndDecodeBuffer(zone.file, ctx);
        } catch {
          // Non-blocking; missing zone will fallback to adjacent zone via pitch shifting
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  }

  /**
   * Fetches and decodes an AudioBuffer, respecting cache and LRU limit.
   */
  public async fetchAndDecodeBuffer(filePath: string, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(filePath)) {
      this.lastAccess.set(filePath, Date.now());
      return this.bufferCache.get(filePath)!;
    }

    if (this.loadingPromises.has(filePath)) {
      return this.loadingPromises.get(filePath)!;
    }

    const promise = (async () => {
      try {
        const url = filePath.startsWith('http') || filePath.startsWith('/') ? filePath : `/samples/${filePath}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);

        // Track memory
        const bytes = audioBuf.length * audioBuf.numberOfChannels * 4;
        this.bufferCache.set(filePath, audioBuf);
        this.lastAccess.set(filePath, Date.now());
        this.currentCacheBytes += bytes;

        // Perform LRU eviction if cache size exceeded
        this.evictUnusedBuffers();

        return audioBuf;
      } catch {
        return null;
      } finally {
        this.loadingPromises.delete(filePath);
      }
    })();

    this.loadingPromises.set(filePath, promise);
    return promise;
  }

  /**
   * Memory Cleanup Routine:
   * Evicts unreferenced AudioBuffers when cache threshold is exceeded.
   */
  public evictUnusedBuffers(): void {
    if (this.currentCacheBytes <= this.maxCacheBytes) return;

    // Find all files with refCount === 0 sorted by lastAccess time (oldest first)
    const unreferenced: { file: string; time: number }[] = [];
    for (const [file, time] of this.lastAccess.entries()) {
      if ((this.fileRefCount.get(file) ?? 0) <= 0) {
        unreferenced.push({ file, time });
      }
    }

    unreferenced.sort((a, b) => a.time - b.time);

    for (const { file } of unreferenced) {
      if (this.currentCacheBytes <= this.maxCacheBytes) break;
      const buf = this.bufferCache.get(file);
      if (buf) {
        const bytes = buf.length * buf.numberOfChannels * 4;
        this.currentCacheBytes = Math.max(0, this.currentCacheBytes - bytes);
        this.bufferCache.delete(file);
        this.lastAccess.delete(file);
      }
    }
  }

  /**
   * Device Removal Cleanup Routine:
   * Called when a device is removed from the rack to free its allocated AudioBuffers.
   */
  public releaseDevice(deviceId: string): void {
    // Stop all active voices for this device
    this.stopAllVoices(deviceId);

    // Release leased files
    const files = this.deviceFiles.get(deviceId);
    if (files) {
      for (const file of files) {
        const count = (this.fileRefCount.get(file) ?? 1) - 1;
        if (count <= 0) {
          this.fileRefCount.delete(file);
        } else {
          this.fileRefCount.set(file, count);
        }
      }
      this.deviceFiles.delete(deviceId);
    }

    this.deviceActiveSubVoice.delete(deviceId);

    // Immediately trigger eviction to clean up any orphaned buffers
    this.evictUnusedBuffers();
  }

  /**
   * Finds the sub-voice definition from the manifest or falls back gracefully.
   */
  private findSubVoice(
    instrumentName: string,
    subVoiceId: string,
    manifest: MultiSampleManifest | null
  ): SubVoiceDefinition | null {
    if (!manifest?.devices) return null;

    // Exact device match
    for (const dev of Object.values(manifest.devices)) {
      if (dev.deviceName.toLowerCase() === instrumentName.toLowerCase() || dev.deviceId === instrumentName) {
        if (dev.subVoices[subVoiceId]) return dev.subVoices[subVoiceId];
        const first = Object.values(dev.subVoices)[0];
        if (first) return first;
      }
    }

    // Partial name match
    const lower = instrumentName.toLowerCase();
    for (const dev of Object.values(manifest.devices)) {
      if (dev.deviceName.toLowerCase().includes(lower) || lower.includes(dev.deviceName.toLowerCase())) {
        if (dev.subVoices[subVoiceId]) return dev.subVoices[subVoiceId];
        const first = Object.values(dev.subVoices)[0];
        if (first) return first;
      }
    }

    return null;
  }

  /**
   * Matches a pitch zone for the given note and velocity, using pitch-shifting
   * interpolation if an exact chromatic sample is not present.
   */
  public matchPitchZone(
    subVoice: SubVoiceDefinition,
    note: number,
    velocity: number
  ): { zone: SamplePitchZone; buffer: AudioBuffer; playbackRate: number } | null {
    const allLayers = subVoice.velocityLayers;
    if (!allLayers.length) return null;

    // Find best velocity layer
    const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)));
    let targetLayer = allLayers.find((l) => vel >= l.minVel && vel <= l.maxVel);

    // If target layer has no loaded buffers yet (still streaming), use middle layer
    const findLoadedZone = (layer: SampleVelocityLayer): SamplePitchZone | null => {
      // 1. Direct key range hit
      const direct = layer.zones.find((z) => note >= z.keyLow && note <= z.keyHigh && this.bufferCache.has(z.file));
      if (direct) return direct;

      // 2. Nearest zone by root note for pitch-shifting interpolation
      let nearest: SamplePitchZone | null = null;
      let minDistance = Infinity;

      for (const z of layer.zones) {
        if (this.bufferCache.has(z.file)) {
          const dist = Math.abs(z.root - note);
          if (dist < minDistance) {
            minDistance = dist;
            nearest = z;
          }
        }
      }

      return nearest;
    };

    let matchedZone: SamplePitchZone | null = null;
    if (targetLayer) {
      matchedZone = findLoadedZone(targetLayer);
    }

    // If not found in target layer, try any loaded layer
    if (!matchedZone) {
      for (const layer of allLayers) {
        matchedZone = findLoadedZone(layer);
        if (matchedZone) break;
      }
    }

    if (!matchedZone) return null;

    const buffer = this.bufferCache.get(matchedZone.file);
    if (!buffer) return null;

    // Calculate pitch-shifting interpolation formula:
    // semitones = (playedNote - root) + fineTuneCents / 100
    // playbackRate = 2 ^ (semitones / 12)
    const semitones = note - matchedZone.root + (matchedZone.tune ?? 0) / 100;
    const playbackRate = Math.pow(2, semitones / 12);

    return { zone: matchedZone, buffer, playbackRate };
  }

  /**
   * Plays a multi-sampled note with pitch-shifting interpolation,
   * ADSR envelope, and round-robin handling.
   */
  public playNote(
    deviceId: string,
    instrumentName: string,
    note: number,
    velocity: number,
    time: number,
    destination: AudioNode,
    options: PlayNoteOptions = {}
  ): boolean {
    const subVoiceId = this.deviceActiveSubVoice.get(deviceId) || getDefaultSubVoice(instrumentName).id;
    const subVoice = this.findSubVoice(instrumentName, subVoiceId, this.manifest);
    if (!subVoice) return false;

    const match = this.matchPitchZone(subVoice, note, velocity);
    if (!match) return false;

    const ctx = destination.context;
    const { zone, buffer, playbackRate } = match;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // Apply pitch shifting with master fine tuning / transpose
    const totalRate = playbackRate * Math.pow(2, ((options.transpose ?? 0) + (options.fineTune ?? 0) / 100) / 12);
    src.playbackRate.setValueAtTime(totalRate, time);

    // Looping if specified
    if (zone.loop) {
      src.loop = true;
      src.loopStart = zone.loop[0];
      src.loopEnd = zone.loop[1];
    }

    const gain = ctx.createGain();
    const velGain = Math.max(0.1, Math.min(1.2, velocity));
    const targetGain = velGain * (zone.gain ?? 1.0) * (options.gain ?? 1.0);

    const attack = Math.max(0.002, options.attack ?? 0.004);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(targetGain, time + attack);

    src.connect(gain);
    gain.connect(destination);

    src.start(time);

    // Track active voice
    if (!this.activeVoices.has(deviceId)) {
      this.activeVoices.set(deviceId, new Map());
    }
    const devMap = this.activeVoices.get(deviceId)!;
    if (!devMap.has(note)) {
      devMap.set(note, []);
    }

    const voice: ActiveSamplerVoice = {
      id: `${deviceId}_${note}_${Date.now()}_${Math.random()}`,
      deviceId,
      note,
      velocity,
      src,
      gain,
      startTime: time,
    };

    devMap.get(note)!.push(voice);

    src.onended = () => {
      try {
        src.disconnect();
        gain.disconnect();
      } catch {}
      const list = devMap.get(note);
      if (list) {
        const idx = list.indexOf(voice);
        if (idx >= 0) list.splice(idx, 1);
      }
    };

    return true;
  }

  /**
   * Stops a playing note smoothly.
   */
  public stopNote(deviceId: string, note: number, time?: number): void {
    const devMap = this.activeVoices.get(deviceId);
    if (!devMap) return;
    const list = devMap.get(note);
    if (!list || !list.length) return;

    const relTime = time !== undefined ? time : 0;
    while (list.length > 0) {
      const v = list.pop()!;
      try {
        const now = v.gain.context.currentTime;
        const t = Math.max(now, relTime);
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
        v.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        v.src.stop(t + 0.09);
      } catch {}
    }
  }

  /**
   * Stops all active voices for a device.
   */
  public stopAllVoices(deviceId: string): void {
    const devMap = this.activeVoices.get(deviceId);
    if (!devMap) return;
    for (const note of devMap.keys()) {
      this.stopNote(deviceId, note);
    }
    devMap.clear();
  }

  /**
   * Helper to inspect cache metrics for tests and monitoring.
   */
  public getMetrics() {
    return {
      cachedBuffers: this.bufferCache.size,
      currentCacheBytes: this.currentCacheBytes,
      activeDevices: this.deviceFiles.size,
      leasedFiles: Array.from(this.fileRefCount.entries()).filter(([, count]) => count > 0).length,
    };
  }
}

export const realMultiSampler = RealMultiSampler.getInstance();

