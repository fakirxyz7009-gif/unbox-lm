import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  AudioLines,
  ChevronDown,
  ChevronRight,
  Cpu,
  Download,
  FileText,
  HardDrive,
  Package,
  Piano,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
} from 'lucide-react';
import type { DeviceType } from '../audio/types.ts';
import { INSTRUMENT_CATEGORIES } from '../audio/instrumentCatalog.ts';
import { useVstLibrary, vstLibrary } from '../vst/libraryClient.ts';
import { CATEGORY_LABELS } from '../../shared/vst/categories.ts';
import { isMountable, type ItemKind, type ManifestItem, type MountableItem } from '../../shared/vst/manifestTypes.ts';
import type { Notify } from './PatchCableLayer.tsx';

interface LibraryBrowserProps {
  onMountItem: (item: MountableItem, presetId?: string) => void;
  onMountBuiltin: (type: DeviceType, name: string, subVoiceId?: string) => void;
  onMessage: Notify;
}

const KIND_META: Record<ItemKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  plugin: { label: 'Plugins', icon: Plug },
  instrument: { label: 'Instruments', icon: Piano },
  preset: { label: 'Presets', icon: SlidersHorizontal },
  sample: { label: 'Samples', icon: AudioLines },
  'sample-pack': { label: 'Sample packs', icon: Package },
  installer: { label: 'Installers', icon: Download },
  archive: { label: 'Archives', icon: Archive },
  document: { label: 'Docs', icon: FileText },
};

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function subtitle(item: ManifestItem): string {
  switch (item.kind) {
    case 'plugin':
      return [item.vendor, `${item.format.toUpperCase()} ${item.arch}`, CATEGORY_LABELS[item.category], item.version && `v${item.version}`].filter(Boolean).join(' · ');
    case 'instrument':
      return [item.vendor, item.engine, CATEGORY_LABELS[item.category], item.presetIds.length ? `${item.presetIds.length} presets` : ''].filter(Boolean).join(' · ');
    case 'preset':
      return [item.format.toUpperCase(), item.group, item.targetId ? `for ${vstLibrary.item(item.targetId)?.name ?? 'instrument'}` : ''].filter(Boolean).join(' · ');
    case 'sample':
      return [item.format.toUpperCase(), item.durationSec ? `${item.durationSec.toFixed(1)} s` : '', item.sampleRate ? `${item.sampleRate / 1000} kHz` : '', item.isPreview ? 'preview' : ''].filter(Boolean).join(' · ');
    case 'sample-pack':
      return `${item.engine} · ${item.fileCount.toLocaleString()} files · ${formatBytes(item.sizeBytes)}`;
    case 'installer':
      return [item.platform === 'windows' ? 'Windows' : 'macOS', item.role, item.vendor, item.version].filter(Boolean).join(' · ');
    case 'archive':
      return [item.format.toUpperCase(), item.parts > 1 ? `${item.parts} parts` : '', item.entryCount ? `${item.entryCount.toLocaleString()} entries` : '', formatBytes(item.sizeBytes)].filter(Boolean).join(' · ');
    case 'document':
      return `${item.format.toUpperCase()} · ${item.role}`;
  }
}

/** Music content only: documents, installers and archives never show up in the app. */
export const MUSIC_KINDS: ItemKind[] = ['plugin', 'instrument', 'preset', 'sample', 'sample-pack'];

function Details({ item }: { item: ManifestItem }) {
  const product = vstLibrary.product(item.productId);
  const rows: [string, React.ReactNode][] = [];
  if (item.kind === 'sample' && item.file) rows.push(['Stored', 'Inside the app (no external folder needed)']);
  if (product) rows.push(['Product', `${product.name}${product.vendor ? ` — ${product.vendor}` : ''}${product.version ? ` v${product.version}` : ''}`]);
  if (item.kind === 'plugin') {
    rows.push(['Binary', `${item.format.toUpperCase()} · ${item.arch} · entry: ${item.entryPoints.join(', ') || 'none'}`]);
    rows.push(['Hosting', item.hostable ? 'A 64-bit plugin host could load this binary. In the rack it runs as Web Audio proxy DSP.' : item.hostIssue ?? 'Not hostable']);
    rows.push(['Category', `${CATEGORY_LABELS[item.category]} (from ${item.categorySource})`]);
  }
  if (item.kind === 'instrument') rows.push(['Needs', `${item.engine} — not loaded by Unbox Studio; the rack unit uses a proxy voice`]);
  if (item.kind === 'sample-pack') rows.push(['Formats', Object.entries(item.formats).map(([k, v]) => `${k} ×${v}`).join(', ')]);
  if (item.kind === 'installer') rows.push(['Note', 'Unbox Studio never runs installers. Install it yourself, then rescan.']);
  if (item.kind === 'archive') rows.push(['Note', 'Archives are indexed only, never extracted. Extract it yourself, then rescan.']);
  if (item.duplicateOf) rows.push(['Copy of', vstLibrary.item(item.duplicateOf)?.name ?? item.duplicateOf]);
  rows.push(['Size', formatBytes(item.sizeBytes)]);
  if (item.tags.length) rows.push(['Tags', item.tags.slice(0, 14).join(', ')]);
  return (
    <dl className="mt-1.5 grid grid-cols-[64px_1fr] gap-x-2 gap-y-0.5 text-[11px] text-slate-400 bg-black/30 rounded p-2">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-slate-500 uppercase tracking-wider text-[11px] pt-px">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export const LibraryBrowser: React.FC<LibraryBrowserProps> = ({ onMountItem, onMountBuiltin, onMessage }) => {
  const lib = useVstLibrary();
  const [tab, setTab] = useState<'library' | 'devices'>('library');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ItemKind | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void vstLibrary.load();
  }, []);

  const variants = useMemo(() => {
    const counts = new Map<string, number>();
    lib.manifest?.items.forEach((i) => {
      if (i.kind === 'plugin' && !i.duplicateOf) counts.set(i.variantKey, (counts.get(i.variantKey) ?? 0) + 1);
    });
    return counts;
  }, [lib.manifest]);

  const hits = useMemo(() => {
    if (!lib.manifest) return [];
    return vstLibrary
      .search(query, { kinds: kind === 'all' ? MUSIC_KINDS : [kind], includeDuplicates: showAll, limit: 400 })
      .map((h) => h.item)
      .filter((i) => showAll || i.kind !== 'plugin' || i.primaryVariant);
  }, [lib.manifest, query, kind, showAll]);

  const builtins = useMemo(() => {
    const q = query.toLowerCase();
    return INSTRUMENT_CATEGORIES.map((c) => ({ ...c, items: c.items.filter((i) => !q || `${i.name} ${i.desc} ${c.label}`.toLowerCase().includes(q)) })).filter((c) => c.items.length);
  }, [query]);

  const audition = async (sampleId: string) => {
    try {
      await vstLibrary.toggleAudition(sampleId);
    } catch (e) {
      onMessage(`Preview failed: ${(e as Error).message}`, 'error');
    }
  };

  const mountPreset = (presetId: string, targetId?: string) => {
    const target = vstLibrary.item(targetId);
    if (target && isMountable(target)) onMountItem(target, presetId);
    else onMessage('This preset is not linked to an instrument in the library', 'error');
  };

  const stats = lib.manifest?.stats;
  const playable = (lib.manifest?.items ?? []).filter((i) => (i.kind === 'plugin' ? i.hostable : i.kind === 'instrument') && !i.duplicateOf).length;
  const scanned = lib.manifest ? new Date(lib.manifest.generatedAt) : null;

  return (
    <aside className="library-panel" aria-label="Library browser">
      <div className="flex gap-1 p-2 pb-1.5">
        {(
          [
            ['library', 'Plugin Index', HardDrive],
            ['devices', 'Built-in devices', Cpu],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[11px] font-bold ${tab === id ? 'bg-orange-500 text-black' : 'bg-slate-800/70 hover:bg-slate-700'}`}
          >
            <Icon className="w-3 h-3" /> {label}
          </button>
        ))}
      </div>

      <div className="px-2 pb-1.5">
        <label className="flex items-center gap-1.5 bg-black/50 border border-slate-700 focus-within:border-orange-500 rounded px-2 py-1">
          <Search className="w-3 h-3 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'library' ? 'Search plugins, instruments, presets…' : 'Search built-in devices…'}
            className="flex-1 min-w-0 bg-transparent outline-none text-[11px]"
            aria-label="Search"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', altKey: true }));
          }}
          className="w-full mt-1.5 py-1 px-2 rounded bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-black text-[11px] font-bold flex items-center justify-center gap-1.5 shadow"
          title="Open Samples & Stems (Alt+S)"
        >
          <Sparkles className="w-3 h-3 text-black" />
          <span>Samples &amp; Stems</span>
        </button>
      </div>

      {tab === 'library' && (
        <>
          <div className="px-2 pb-1.5 text-[11px] text-slate-400 flex items-center gap-1.5">
            {lib.status === 'loading' && <span>Loading library index…</span>}
            {lib.status === 'scanning' && (
              <span className="flex items-center gap-1 text-amber-300">
                <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing from the source folder (read-only)…
              </span>
            )}
            {lib.status === 'offline' && <span className="text-red-300">{lib.error}</span>}
            {lib.status === 'error' && <span className="text-red-300">{lib.error}</span>}
            {lib.status === 'empty' && <span>{lib.error ?? 'No plugin library is built into this app yet.'}</span>}
            {lib.status === 'ready' && stats && scanned && (
              <span className="truncate" title={`Indexed ${lib.manifest?.scan.filesSeen.toLocaleString()} files on ${scanned.toLocaleString()}. ${playable} entries can run in this app; the rest are listed for reference and cannot be mounted.`}>
                {playable} playable · {stats.plugin + stats.instrument} indexed · {scanned.toLocaleDateString()}
              </span>
            )}
            <span className="flex-1" />
            {lib.canRescan && (lib.status === 'ready' || lib.status === 'empty' || lib.status === 'error') && (
              <button
                type="button"
                onClick={() => void vstLibrary.rescan()}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-orange-500 hover:text-black"
                title="Refresh the in-app library from the source folder (reads file headers only; never runs plugins or installers)"
              >
                <RefreshCw className="w-3 h-3" /> {lib.status === 'empty' ? 'Import now' : 'Refresh'}
              </button>
            )}
            {lib.status === 'offline' && (
              <button type="button" onClick={() => void vstLibrary.load(true)} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700">
                Retry
              </button>
            )}
          </div>

          {lib.manifest && (
            <div className="px-2 pb-1.5 flex flex-wrap gap-1">
              <button type="button" onClick={() => setKind('all')} className={`lib-chip ${kind === 'all' ? 'lib-chip--on' : ''}`}>
                All
              </button>
              {MUSIC_KINDS
                .filter((k) => (lib.manifest?.stats[k] ?? 0) > 0)
                .map((k) => (
                  <button key={k} type="button" onClick={() => setKind(k)} className={`lib-chip ${kind === k ? 'lib-chip--on' : ''}`}>
                    {KIND_META[k].label} {lib.manifest?.stats[k]}
                  </button>
                ))}
              <label className="lib-chip cursor-pointer select-none" title="Also list entries that cannot run here (wrong architecture, no proxy voice) and extra copies of the same plugin">
                <input type="checkbox" className="mr-1 align-middle" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                index-only &amp; copies
              </label>
            </div>
          )}

          <ul className="flex-1 overflow-y-auto px-2 pb-2 space-y-1" aria-label="Library items">
            {lib.manifest && hits.length === 0 && <li className="text-[11px] text-slate-500 p-2">No matches.</li>}
            {hits.map((item) => {
              const Icon = KIND_META[item.kind].icon;
              const open = expanded === item.id;
              const previewId = item.kind === 'sample' && item.playable ? item.id : 'previewId' in item ? item.previewId : undefined;
              const otherFormats = item.kind === 'plugin' ? (variants.get(item.variantKey) ?? 1) - 1 : 0;
              return (
                <li key={item.id} className={`lib-row ${item.duplicateOf ? 'opacity-60' : ''}`}>
                  <div
                    className="flex items-start gap-1.5"
                    onDoubleClick={() => isMountable(item) && onMountItem(item)}
                    title={isMountable(item) ? 'Double-click to mount in the rack' : undefined}
                  >
                    <button type="button" className="mt-0.5 text-slate-500 hover:text-white" onClick={() => setExpanded(open ? null : item.id)} aria-label={open ? 'Hide details' : 'Show details'} aria-expanded={open}>
                      {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-orange-300" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-slate-100 truncate">
                        {item.name}
                        {otherFormats > 0 && !showAll && <span className="ml-1 text-[11px] text-slate-500">+{otherFormats} formats</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{subtitle(item)}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.kind === 'plugin' && !item.hostable && <span className="lib-flag" title={item.hostIssue}>{item.arch === 'x86' ? '32-bit' : item.format.toUpperCase()}</span>}
                      {previewId && (
                        <button type="button" className="lib-act" onClick={() => void audition(previewId)} aria-label={lib.auditioningId === previewId ? 'Stop preview' : 'Play preview'} title="Audition (plays straight to the speakers)">
                          {lib.auditioningId === previewId ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </button>
                      )}
                      {isMountable(item) && (
                        <button type="button" className="lib-act lib-act--mount" onClick={() => onMountItem(item)} title="Mount as a rack unit">
                          <Plus className="w-3 h-3" /> Mount
                        </button>
                      )}
                      {item.kind === 'preset' && item.targetId && (
                        <button type="button" className="lib-act lib-act--mount" onClick={() => mountPreset(item.id, item.targetId)} title="Mount its instrument with this preset">
                          <Plus className="w-3 h-3" /> Load
                        </button>
                      )}
                    </div>
                  </div>
                  {open && <Details item={item} />}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab === 'devices' && (
        <ul className="flex-1 overflow-y-auto px-2 pb-2 space-y-2" aria-label="Built-in devices">
          {builtins.map((c) => (
            <li key={c.label}>
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 px-1 pb-1">{c.label}</div>
              <ul className="space-y-1">
                {c.items.map((i) => {
                  const itemKey = `${i.type}-${i.name}`;
                  return (
                    <li key={itemKey} className="lib-row flex p-1.5 rounded bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
                      <div className="flex items-center gap-1.5 w-full">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-100 truncate">{i.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{i.desc}</div>
                        </div>
                        <button
                          type="button"
                          className="lib-act lib-act--mount shrink-0"
                          onClick={() => onMountBuiltin(i.type, i.name)}
                          title="Add instrument to rack"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
};
