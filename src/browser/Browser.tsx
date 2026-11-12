/**
 * The browser: one place to find instruments, effects, utilities, stems, samples, plugin-library
 * units and the project's audio. One search over everything (every section tab shows its matches),
 * the same row everywhere (name, detail, badges, preview, actions), keyboard navigation (↑ ↓ to
 * move, Enter = main action, Space = preview, typing searches) and rows drag onto the piano roll.
 * Hosts (rack, LOAD, piano roll) supply what the actions do.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderCog, Loader2, Play, RefreshCw, Search, Square, Upload, X } from 'lucide-react';
import { audioStore } from '../audio/clips/audioStore.ts';
import { STEM_DRAG_TYPE, stemLibrary, useStemLibrary } from '../audio/stemLibraryClient.ts';
import { useAudioStoreVersion } from '../components/sequencer/arrangement/AudioClipWave.tsx';
import { toast } from '../shell/toast.ts';
import { openStemTools } from '../shell/stemTools.ts';
import { useVstLibrary, vstLibrary } from '../vst/libraryClient.ts';
import { STEM_TYPES, type StemType } from '../../shared/audio/stemLibrary.ts';
import { SHARE_BUILD } from '../../shared/buildMode.ts';
import {
  BROWSER_DRAG_TYPE,
  SECTION_META,
  assetEntries,
  builtinEntries,
  libraryEntries,
  stemEntries,
  type BrowserEntry,
  type BrowserSection,
} from './entries.ts';
import { StemFolders } from './StemFolders.tsx';
import { togglePreview, usePreviewKey } from './preview.ts';

export interface BrowserAction {
  label: string;
  title?: string;
  /** Runs the action; a returned string is shown as a success message. */
  run: () => Promise<string | void> | string | void;
}

interface Props {
  /** Remembers section and filters per place. */
  host: 'rack' | 'load' | 'dock';
  sections: BrowserSection[];
  /** 'panel': narrow side panel; 'wide': section rail beside the list (dialogs). */
  layout: 'panel' | 'wide';
  /** The row's buttons; the first is the main action (double-click / Enter). */
  actionsFor: (entry: BrowserEntry) => BrowserAction[];
  /** Host controls under the search box (e.g. "This part / New part"). */
  toolbar?: React.ReactNode;
  className?: string;
  autoFocus?: boolean;
}

interface Prefs {
  section: BrowserSection;
  group: string;
  recordedOnly: boolean;
  stemType: StemType | 'all';
}

const prefKey = (host: string) => `unbox.browser.${host}`;
function readPrefs(host: string, sections: BrowserSection[]): Prefs {
  const def: Prefs = { section: sections[0], group: 'all', recordedOnly: false, stemType: 'all' };
  try {
    const raw = JSON.parse(localStorage.getItem(prefKey(host)) ?? '{}') as Partial<Prefs>;
    return {
      section: raw.section && sections.includes(raw.section) ? raw.section : def.section,
      group: typeof raw.group === 'string' ? raw.group : 'all',
      recordedOnly: raw.recordedOnly === true,
      stemType: raw.stemType && (STEM_TYPES as readonly string[]).includes(raw.stemType) ? raw.stemType : 'all',
    };
  } catch {
    return def;
  }
}

/** Name hits rank above description hits. */
function score(e: BrowserEntry, tokens: string[]): number {
  const n = e.name.toLowerCase();
  return tokens.reduce((s, t) => s + (n.startsWith(t) ? 4 : n.includes(t) ? 2 : 1), 0);
}

type Row = { kind: 'head'; group: string; count: number } | { kind: 'entry'; entry: BrowserEntry };

export function Browser({ host, sections: hostSections, layout, actionsFor, toolbar, className = '', autoFocus = false }: Props) {
  // the share build carries no stem library
  const sections = useMemo(() => (SHARE_BUILD ? hostSections.filter((s) => s !== 'stems') : hostSections), [hostSections]);
  const lib = useVstLibrary();
  const stems = useStemLibrary();
  const assetsVersion = useAudioStoreVersion();
  const previewKey = usePreviewKey();
  const [prefs, setPrefsState] = useState<Prefs>(() => readPrefs(host, sections));
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showFolders, setShowFolders] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setPrefs = (patch: Partial<Prefs>) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(prefKey(host), JSON.stringify(next));
      } catch {
        // private window: this session only
      }
      return next;
    });

  const wants = (s: BrowserSection) => sections.includes(s);
  useEffect(() => {
    if (wants('library') || wants('samples')) void vstLibrary.load();
    if (wants('stems') && stemLibrary.getState().status === 'idle') void stemLibrary.load();
    if (autoFocus) searchRef.current?.focus({ preventScroll: true });
    // once: the sections are fixed per host
  }, []);

  const all = useMemo(() => {
    const map = Object.fromEntries(sections.map((s) => [s, [] as BrowserEntry[]])) as Record<BrowserSection, BrowserEntry[]>;
    const add = (e: BrowserEntry) => map[e.section]?.push(e);
    builtinEntries().forEach(add);
    libraryEntries(lib.manifest).forEach(add);
    if (map.stems) map.stems = stemEntries(stems.index);
    if (map.project) map.project = assetEntries(audioStore.all());
    return map;
    // assetsVersion changes when the project's audio changes
  }, [lib.manifest, stems.index, assetsVersion, sections.join()]);

  const tokens = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const matched = useMemo(() => {
    const m = {} as Record<BrowserSection, BrowserEntry[]>;
    for (const s of sections) m[s] = tokens.length ? all[s].filter((e) => tokens.every((t) => e.haystack.includes(t))) : all[s];
    return m;
  }, [all, tokens]);

  const section = prefs.section;
  const filtered = useMemo(
    () =>
      matched[section].filter(
        (e) => (section !== 'instruments' || !prefs.recordedOnly || e.recorded) && (section !== 'stems' || prefs.stemType === 'all' || e.stemType === prefs.stemType),
      ),
    [matched, section, prefs.recordedOnly, prefs.stemType],
  );
  const groups = useMemo(() => {
    const g = new Map<string, number>();
    for (const e of filtered) g.set(e.group, (g.get(e.group) ?? 0) + 1);
    return [...g.entries()];
  }, [filtered]);
  const group = prefs.group !== 'all' && groups.some(([g]) => g === prefs.group) ? prefs.group : 'all';
  const visible = useMemo(() => {
    const list = filtered.filter((e) => group === 'all' || e.group === group);
    return tokens.length ? list.map((e, i) => ({ e, s: score(e, tokens), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.e) : list;
  }, [filtered, group, tokens]);
  const rows: Row[] = useMemo(() => {
    if (tokens.length || group !== 'all') return visible.map((entry) => ({ kind: 'entry', entry }));
    const out: Row[] = [];
    let last = '';
    for (const entry of visible) {
      if (entry.group !== last) {
        out.push({ kind: 'head', group: entry.group, count: groups.find(([g]) => g === entry.group)?.[1] ?? 0 });
        last = entry.group;
      }
      out.push({ kind: 'entry', entry });
    }
    return out;
  }, [visible, tokens, group, groups]);

  const active = visible.find((e) => e.key === activeKey) ?? visible[0] ?? null;
  const activeIdx = active ? visible.indexOf(active) : -1;
  useEffect(() => {
    if (!active) return;
    listRef.current?.querySelector(`[data-key="${CSS.escape(active.key)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runAction = async (entry: BrowserEntry, action: BrowserAction | undefined) => {
    if (entry.blocked) {
      toast(`${entry.name}: ${entry.blocked}`, 'error');
      return;
    }
    if (!action || busy) return;
    setBusy(entry.key);
    try {
      const msg = await action.run();
      if (typeof msg === 'string' && msg) toast(msg, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const preview = (entry: BrowserEntry) => {
    if (entry.preview) void togglePreview(entry.key, entry.preview).catch((e: Error) => toast(`Preview failed: ${e.message}`, 'error'));
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const move = (to: number) => {
      const next = visible[Math.max(0, Math.min(visible.length - 1, to))];
      if (next) setActiveKey(next.key);
    };
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === 'ArrowDown') { handled(); move(activeIdx + 1); }
    else if (e.key === 'ArrowUp') { handled(); if (activeIdx <= 0) searchRef.current?.focus(); else move(activeIdx - 1); }
    else if (e.key === 'PageDown') { handled(); move(activeIdx + 10); }
    else if (e.key === 'PageUp') { handled(); move(activeIdx - 10); }
    else if (e.key === 'Home') { handled(); move(0); }
    else if (e.key === 'End') { handled(); move(visible.length - 1); }
    else if (e.key === 'Enter' && active) { handled(); void runAction(active, actionsFor(active)[0]); }
    else if (e.key === ' ' && active) { handled(); preview(active); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // typing searches (and never plays notes)
      e.stopPropagation();
      searchRef.current?.focus();
    } else if (e.key !== 'Tab' && e.key !== 'Escape' && !/^F\d+$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Delete / Backspace must not reach the rack; F-keys and Ctrl / Alt shortcuts still do
      e.stopPropagation();
    }
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      listRef.current?.focus();
    } else if (e.key === 'Enter' && active) {
      e.preventDefault();
      e.stopPropagation();
      void runAction(active, actionsFor(active)[0]);
    } else if (e.key === 'Escape' && query) {
      e.stopPropagation();
      setQuery('');
    } else if (e.key !== 'Tab' && e.key !== 'Escape') e.stopPropagation(); // letters must not play notes
  };

  const importFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    let ok = 0;
    for (const f of list) {
      try {
        await audioStore.importFile(f);
        ok++;
      } catch {
        toast(`${f.name} could not be decoded (WAV, MP3, OGG, FLAC, AIFF, M4A work)`, 'error');
      }
    }
    if (ok) toast(`Imported ${ok} audio file${ok === 1 ? '' : 's'} into the project`, 'success');
  };

  // ------------------------------------------------------------------ pieces

  const sectionButton = (s: BrowserSection) => {
    const Icon = SECTION_META[s].icon;
    const n = matched[s].length;
    const on = s === section;
    return (
      <button
        key={s}
        type="button"
        role="tab"
        aria-selected={on}
        className={layout === 'wide' ? 'bw-railtab' : 'bw-tab'}
        title={`${SECTION_META[s].label}: ${SECTION_META[s].blurb}`}
        onClick={() => {
          setPrefs({ section: s, group: 'all' });
          setActiveKey(null);
        }}
        data-testid={`bw-tab-${s}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="bw-tablabel">{SECTION_META[s].label}</span>
        <span className="bw-count">{n}</span>
      </button>
    );
  };

  const filters = (
    <div className="flex flex-wrap items-center gap-1">
      {layout === 'panel' && groups.length > 1 && (
        <select className="bw-select flex-1 min-w-0" value={group} onChange={(e) => setPrefs({ group: e.target.value })} aria-label="Group">
          <option value="all">All {section === 'stems' ? 'songs' : 'groups'} ({filtered.length})</option>
          {groups.map(([g, n]) => (
            <option key={g} value={g}>
              {g} ({n})
            </option>
          ))}
        </select>
      )}
      {section === 'instruments' && (
        <button type="button" className="bw-chip" aria-pressed={prefs.recordedOnly} onClick={() => setPrefs({ recordedOnly: !prefs.recordedOnly })} title="Only instruments made from recordings">
          Recorded only
        </button>
      )}
      {section === 'stems' && all.stems.length > 0 && (
        <select className="bw-select" value={prefs.stemType} onChange={(e) => setPrefs({ stemType: e.target.value as StemType | 'all' })} aria-label="Instrument type">
          <option value="all">All types</option>
          {STEM_TYPES.filter((t) => all.stems.some((e) => e.stemType === t)).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const empty = (() => {
    if (visible.length) return null;
    if ((section === 'library' || section === 'samples') && (lib.status === 'loading' || lib.status === 'idle')) return <Loading text="Loading the library…" />;
    if (section === 'stems') {
      if (stems.status === 'unavailable') return <p className="bw-empty">{stems.error ?? 'The stem library is part of your own build on this computer.'} Audio files still work: drag them onto the piano roll, or import them under Project.</p>;
      if (stems.status === 'loading' || stems.status === 'idle') return <Loading text="Indexing your stem folders…" />;
      if (!all.stems.length && (stems.index?.blockedFiles ?? 0) > 0) {
        return (
          <div className="bw-empty">
            <p>
              {stems.index?.blockedFiles} audio files were found, but none is declared yet. Say what they are once per folder (recordings you own or may use, who performs, where they come from) and they load:
            </p>
            {!showFolders && <StemFolders />}
          </div>
        );
      }
      if (!all.stems.length) return <p className="bw-empty">No recordings in your stem folders yet. Add a folder with the folder button below, then rescan.</p>;
    }
    if (section === 'project' && !all.project.length) return <p className="bw-empty">No audio in this project yet. Import files, record a take, or drop files on the piano roll or the timeline.</p>;
    if (tokens.length) {
      const elsewhere = sections.filter((s) => s !== section && matched[s].length);
      return (
        <div className="bw-empty">
          <p>Nothing here matches “{query.trim()}”.</p>
          {elsewhere.length > 0 && (
            <p className="flex flex-wrap gap-1 mt-2">
              Found in:
              {elsewhere.map((s) => (
                <button key={s} type="button" className="bw-chip" onClick={() => setPrefs({ section: s, group: 'all' })}>
                  {SECTION_META[s].label} {matched[s].length}
                </button>
              ))}
            </p>
          )}
        </div>
      );
    }
    return <p className="bw-empty">Nothing to show with these filters.</p>;
  })();

  const footer = (() => {
    if (section === 'library' || section === 'samples') {
      const status =
        lib.status === 'scanning' ? 'Refreshing from the source folder…' : lib.status === 'ready' ? `${all[section].length} in the library` : lib.error ?? (lib.status === 'empty' ? 'No plugin library is built into this app yet.' : '');
      return (
        <>
          <span className="truncate flex-1" title={status}>{status}</span>
          {lib.canRescan && lib.status !== 'scanning' && (
            <button type="button" className="bw-act bw-act--secondary" onClick={() => void vstLibrary.rescan()} title="Re-read the source folder (file headers only; nothing is run)">
              <RefreshCw className="w-3 h-3" /> Rescan
            </button>
          )}
        </>
      );
    }
    if (section === 'stems' && stems.index) {
      const idx = stems.index;
      const songs = new Set(all.stems.map((e) => e.group)).size;
      return (
        <>
          <span className="truncate flex-1" title={idx.issues.join('\n') || undefined}>
            {all.stems.length} sounds · {songs} songs{idx.blockedFiles > 0 ? ` · ${idx.blockedFiles} blocked` : ''}
          </span>
          <button
            type="button"
            className="bw-icon-btn"
            disabled={rescanning}
            aria-label="Rescan the stem folders"
            title="Rescan the stem folders"
            onClick={() => {
              setRescanning(true);
              void stemLibrary.load(true).finally(() => setRescanning(false));
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" className="bw-icon-btn" aria-pressed={showFolders} aria-label="Stem folders" title="Stem folders" onClick={() => setShowFolders((v) => !v)}>
            <FolderCog className="w-3.5 h-3.5" />
          </button>
        </>
      );
    }
    if (section === 'project') {
      return (
        <>
          <input ref={fileRef} type="file" multiple accept="audio/*,.wav,.mp3,.ogg,.opus,.flac,.m4a,.aac,.aif,.aiff" className="hidden" onChange={(e) => {
            void importFiles(e.target.files);
            e.target.value = '';
          }} />
          <button type="button" className="bw-act" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3 h-3" /> Import audio
          </button>
          {!SHARE_BUILD && (
            <button type="button" className="bw-act bw-act--secondary" onClick={openStemTools} title="Split a recording into vocals, drums, bass and other; import from a link">
              Stems &amp; links…
            </button>
          )}
        </>
      );
    }
    return <span className="truncate">{visible.length === all[section].length ? `${visible.length} ${SECTION_META[section].label.toLowerCase()}` : `${visible.length} of ${all[section].length}`}</span>;
  })();

  const list = (
    <div
      ref={listRef}
      className="bw-list"
      role="listbox"
      tabIndex={0}
      aria-label={SECTION_META[section].label}
      aria-activedescendant={active ? `bw-${host}-${activeIdx}` : undefined}
      onKeyDown={onListKey}
      data-testid="bw-list"
    >
      {empty}
      {rows.map((row) => {
        if (row.kind === 'head') {
          return (
            <div key={`h:${row.group}`} className="bw-group" role="presentation" title={row.group}>
              <span className="truncate">{row.group}</span>
              <span className="bw-count">{row.count}</span>
            </div>
          );
        }
        const e = row.entry;
        const idx = visible.indexOf(e);
        const actions = e.blocked ? [] : actionsFor(e);
        const playing = previewKey === e.key;
        return (
          <div
            key={e.key}
            id={`bw-${host}-${idx}`}
            data-key={e.key}
            role="option"
            aria-selected={active?.key === e.key}
            aria-disabled={!!e.blocked || undefined}
            className={`bw-row ${e.blocked ? 'bw-row--blocked' : ''} ${busy === e.key ? 'bw-row--busy' : ''}`}
            title={`${e.name}\n${e.detail}${e.blocked ? `\n${e.blocked}` : actions[0] ? `\nDouble-click: ${actions[0].label}` : ''}`}
            draggable={!e.blocked}
            onDragStart={(ev) => {
              ev.dataTransfer.setData(BROWSER_DRAG_TYPE, e.key);
              if (e.ref.kind === 'stem') ev.dataTransfer.setData(STEM_DRAG_TYPE, e.ref.item.id);
              ev.dataTransfer.setData('text/plain', e.name);
              ev.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => setActiveKey(e.key)}
            onDoubleClick={() => void runAction(e, actions[0])}
            data-testid="bw-row"
          >
            {e.preview ? (
              <button
                type="button"
                tabIndex={-1}
                className="bw-icon-btn bw-play"
                style={{ color: e.color }}
                aria-pressed={playing}
                aria-label={playing ? `Stop ${e.name}` : `Preview ${e.name}`}
                title={playing ? 'Stop the preview' : 'Preview (Space)'}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setActiveKey(e.key);
                  preview(e);
                }}
              >
                {playing ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            ) : (
              <span className="bw-dot" style={{ background: e.color }} aria-hidden />
            )}
            <span className="flex-1 min-w-0">
              <span className="bw-name">{e.name}</span>
              <span className="bw-detail">{tokens.length || group !== 'all' ? `${e.group} · ${e.detail}` : e.detail}</span>
            </span>
            {e.badges.slice(0, layout === 'wide' ? 3 : 1).map((b) => (
              <span key={b.text} className={`bw-badge bw-badge--${b.tone}`} title={b.title}>
                {b.text}
              </span>
            ))}
            {actions.length > 0 && (
              <span className="bw-acts">
                {actions.map((a, i) => (
                  <button
                    key={a.label}
                    type="button"
                    tabIndex={-1}
                    className={`bw-act ${i > 0 ? 'bw-act--secondary bw-act--extra' : ''}`}
                    title={a.title}
                    disabled={busy !== null}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setActiveKey(e.key);
                      void runAction(e, a);
                    }}
                    data-testid={i === 0 ? 'bw-main-action' : undefined}
                  >
                    {busy === e.key && i === 0 ? <Loader2 className="w-3 h-3 animate-spin" /> : a.label}
                  </button>
                ))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  const search = (
    <label className="bw-search">
      <Search className="w-3.5 h-3.5 text-[#a39683] shrink-0" />
      <input
        ref={searchRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveKey(null);
        }}
        onKeyDown={onSearchKey}
        placeholder="Search everything…"
        aria-label="Search the browser"
        data-testid="bw-search"
      />
      {query && (
        <button type="button" className="bw-icon-btn" aria-label="Clear the search" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>
          <X className="w-3 h-3" />
        </button>
      )}
    </label>
  );

  const stemNote = section === 'stems' && all.stems.length > 0 && (
    <p className="bw-note" title="Every listed sound has a local performer / source / rights declaration; AI-generated and unverified files are refused. Private recordings stay on this computer." data-testid="stem-provenance-policy">
      Recorded audio only: each sound is declared with its performer, source and rights.
    </p>
  );

  if (layout === 'wide') {
    return (
      <div className={`bw bw--wide ${className}`} data-testid="browser">
        <nav className="bw-rail" aria-label="Browser sections">
          <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-0.5">{sections.map(sectionButton)}</div>
          {groups.length > 1 && (
            <div className="bw-railgroups" aria-label="Groups">
              <button type="button" className="bw-railgroup" aria-pressed={group === 'all'} onClick={() => setPrefs({ group: 'all' })}>
                <span className="truncate">All {section === 'stems' ? 'songs' : 'groups'}</span>
                <span className="bw-count">{filtered.length}</span>
              </button>
              {groups.map(([g, n]) => (
                <button key={g} type="button" className="bw-railgroup" aria-pressed={group === g} onClick={() => setPrefs({ group: g })} title={g}>
                  <span className="bw-railname">{g}</span>
                  <span className="bw-count">{n}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5 min-h-0">
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0">{search}</div>
            {toolbar}
          </div>
          {filters}
          {stemNote}
          {section === 'stems' && showFolders && <StemFolders />}
          {list}
          <div className="bw-foot">{footer}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bw bw--panel ${className}`} data-testid="browser">
      {search}
      {toolbar}
      <div role="tablist" className="bw-tabs" aria-label="Browser sections">
        {sections.map(sectionButton)}
      </div>
      {filters}
      {stemNote}
      {section === 'stems' && showFolders && <StemFolders />}
      {list}
      <div className="bw-foot">{footer}</div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <p className="bw-empty flex items-center gap-2">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> {text}
    </p>
  );
}
