/**
 * Projects: browse / search / open / duplicate / rename / delete projects, start new ones from
 * genre templates or your own templates, versions (history), notes + metadata, archives,
 * missing media relinking, track & mixer templates and storage use.
 */
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Copy, Download, FileUp, FolderOpen, History, Pencil, Save, Trash2 } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { downloadBlob } from '../../audio/export/wav.ts';
import { useEngineVersion } from '../../nexa/useEngine.ts';
import { projectManager, type ProjectRecord, type VersionRecord } from '../../project/ProjectManager.ts';
import { GENRE_TEMPLATES } from '../../project/templates.ts';
import {
  applyMixerTemplate, applyTrackTemplate, deleteTemplate, listMixerTemplates, listTrackTemplates, saveMixerTemplate, saveTrackTemplate,
  type MixerTemplate, type TrackTemplate,
} from '../../project/channelTemplates.ts';
import { storageEstimate } from '../../project/db.ts';
import { audioStore } from '../../audio/clips/audioStore.ts';
import { Btn, Panel } from '../ui/controls.tsx';
import { toast } from '../../shell/toast.ts';
import { showConfirm, showPrompt } from '../../shell/dialogService.ts';

function usePM(): number {
  return useSyncExternalStore(
    (cb) => projectManager.subscribe(cb),
    () => projectManager.lastSavedAt + projectManager.status.length * 7 + projectManager.missing.length,
    () => 0
  );
}

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export function ProjectsPage() {
  usePM();
  useEngineVersion();
  const pm = projectManager;
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [userTpl, setUserTpl] = useState<ProjectRecord[]>([]);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [trackTpl, setTrackTpl] = useState<TrackTemplate[]>([]);
  const [mixTpl, setMixTpl] = useState<MixerTemplate[]>([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const relinkRef = useRef<HTMLInputElement>(null);
  const [relinkId, setRelinkId] = useState<string | null>(null);
  const [tplTrack, setTplTrack] = useState('');

  const refresh = async () => {
    setProjects(await pm.list());
    setUserTpl(await pm.userTemplates());
    setVersions(await pm.versions());
    setTrackTpl(await listTrackTemplates());
    setMixTpl(await listMixerTemplates());
    setStorage(await storageEstimate());
  };
  useEffect(() => {
    void refresh();
    return pm.subscribe(() => void refresh());
  }, []);

  const shown = useMemo(() => {
    const s = q.toLowerCase();
    const list = projects.filter((p) => !s || `${p.name} ${p.key} ${p.bpm}`.toLowerCase().includes(s));
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  }, [projects, q, sort]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(`${label} failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const askConfirm = (next: { title: string; message: string; confirmLabel?: string; run: () => void | Promise<void> }) => {
    void showConfirm({ title: next.title, message: next.message, confirmLabel: next.confirmLabel }).then((ok) => {
      if (ok) void next.run();
    });
  };
  const askPrompt = (next: { title: string; label: string; value: string; confirmLabel?: string; run: (value: string) => void | Promise<void> }) => {
    void showPrompt({
      title: next.title,
      label: next.label,
      defaultValue: next.value,
      confirmLabel: next.confirmLabel,
    }).then((value) => {
      if (value !== null) void next.run(value);
    });
  };

  const activeTrack = audioEngine.tracks[0];
  const meta = pm.meta;
  const recordingBusy = audioEngine.recorder.busy;
  const field = (k: keyof typeof meta, label: string, w = 'w-full') => (
    <label className="flex flex-col gap-0.5 text-[11px] uppercase tracking-wider text-slate-500">
      {label}
      <input
        value={Array.isArray(meta[k]) ? (meta[k] as string[]).join(', ') : (meta[k] as string)}
        onChange={(e) => pm.setMeta(k === 'tags' ? { tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } : { [k]: e.target.value })}
        className={`${w} bg-black/60 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-slate-100 outline-none focus:border-orange-500`}
      />
    </label>
  );

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 bg-[#070a10] text-slate-200 text-[11px]" data-testid="projects-page">
      {/* current project bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 bg-[#0d1119] border border-[#1c2331] rounded-lg px-3 py-2">
        <FolderOpen className="w-4 h-4 text-orange-400" />
        <input
          value={pm.currentName}
          aria-label="Project name"
          onChange={(e) => {
            pm.currentName = e.target.value;
            pm.setNotes(pm.notes);
          }}
          onBlur={() => pm.currentId && void pm.rename(pm.currentId, pm.currentName)}
          className="bg-transparent text-[13px] font-black text-white outline-none border-b border-transparent focus:border-orange-500 w-64"
        />
        <span className="text-slate-500">{pm.status}{pm.lastSavedAt ? ` · ${ago(pm.lastSavedAt)}` : ''}</span>
        {recordingBusy && <span className="text-amber-300" role="status">Finishing a take — project changes wait until it is placed.</span>}
        <div className="flex-1" />
        <Btn onClick={() => void run('Save', () => pm.save())} title="Save now (Ctrl+S)"><Save className="inline w-3 h-3" /> Save</Btn>
        <Btn onClick={() => askPrompt({ title: 'Save version', label: 'Version name', value: `Version ${new Date().toLocaleTimeString()}`, confirmLabel: 'Save version', run: (label) => run('Save version', () => pm.saveVersion(label)) })} title="Keep a named copy in the history"><History className="inline w-3 h-3" /> Save version</Btn>
        <Btn onClick={() => askPrompt({ title: 'Save as new project', label: 'Project name', value: `${pm.currentName} copy`, confirmLabel: 'Save as', run: (name) => run('Save as', () => pm.saveAs(name)) })}>Save as…</Btn>
        <Btn onClick={() => askPrompt({ title: 'Save as template', label: 'Template name', value: pm.currentName, confirmLabel: 'Save template', run: (name) => run('Save template', () => pm.saveAsTemplate(name)) })}>Save as template</Btn>
        <Btn onClick={() => void run('Export archive', async () => { const r = await pm.exportArchive(); if (r) downloadBlob(r.blob, r.name); })} title="Project + all its audio in one .unbox file (collect & consolidate)"><Download className="inline w-3 h-3" /> Export .unbox</Btn>
        <Btn onClick={() => importRef.current?.click()} title="Open a .unbox archive or a project .json"><FileUp className="inline w-3 h-3" /> Import</Btn>
        <input ref={importRef} type="file" accept=".unbox,.zip,.json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run('Import', () => pm.importArchive(f, f.name.replace(/\.[^.]+$/, ''))); }} />
        <label className="flex items-center gap-1 text-slate-400" title="Save changes automatically">
          <input type="checkbox" checked={pm.autosave} onChange={(e) => { pm.autosave = e.target.checked; pm.setNotes(pm.notes); }} /> Autosave every
          <select value={pm.autosaveSec} onChange={(e) => { pm.autosaveSec = Number(e.target.value); pm.startAutosave(); pm.setNotes(pm.notes); }} className="bg-black/60 border border-slate-700 rounded">
            {[5, 15, 30, 60, 300].map((s) => <option key={s} value={s}>{s < 60 ? `${s} s` : `${s / 60} min`}</option>)}
          </select>
        </label>
        {busy && <span className="text-orange-300 animate-pulse">{busy}…</span>}
      </div>

      <div className="grid grid-cols-[minmax(280px,1fr)_minmax(280px,1fr)_minmax(300px,1fr)] gap-3">
        {/* projects */}
        <Panel title={`Projects (${projects.length})`} right={
          <div className="flex gap-1">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search projects" className="w-28 bg-black/60 border border-slate-700 rounded px-1.5 py-0.5 outline-none focus:border-orange-500" />
            <select value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'name')} className="bg-black/60 border border-slate-700 rounded" aria-label="Sort"><option value="recent">Recent</option><option value="name">Name</option></select>
          </div>
        }>
          <ul className="space-y-1 max-h-[560px] overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 rounded px-2 py-1.5 ${p.id === pm.currentId ? 'bg-orange-500/15 border border-orange-500/40' : 'bg-slate-900/70 hover:bg-slate-800'}`}>
                <span className="w-1.5 self-stretch rounded" style={{ background: p.color }} />
                <button type="button" className="flex-1 min-w-0 text-left" onDoubleClick={() => { if (p.id !== pm.currentId) void run('Open', () => pm.open(p.id)); }} title="Double-click to open">
                  <div className="font-bold text-slate-100 truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-500">{p.bpm} BPM · {p.key} · {p.tracks} tracks · {p.bars} bars · {ago(p.updatedAt)}{p.audioIds.length ? ` · ${p.audioIds.length} audio` : ''}</div>
                </button>
                {p.id !== pm.currentId && <Btn onClick={() => void run('Open', () => pm.open(p.id))}>Open</Btn>}
                <button type="button" title="Rename" aria-label="Rename project" className="text-slate-500 hover:text-white" onClick={() => askPrompt({ title: 'Rename project', label: 'Project name', value: p.name, confirmLabel: 'Rename', run: (name) => run('Rename', () => pm.rename(p.id, name)) })}><Pencil className="w-3 h-3" /></button>
                <button type="button" title="Duplicate" aria-label="Duplicate project" className="text-slate-500 hover:text-white" onClick={() => void run('Duplicate', () => pm.duplicate(p.id))}><Copy className="w-3 h-3" /></button>
                <button type="button" title="Export .unbox" aria-label="Export project" className="text-slate-500 hover:text-white" onClick={() => void run('Export', async () => { const r = await pm.exportArchive(p.id); if (r) downloadBlob(r.blob, r.name); })}><Download className="w-3 h-3" /></button>
                <button type="button" title="Delete" aria-label="Delete project" className="text-slate-500 hover:text-red-400" onClick={() => askConfirm({ title: 'Delete project', message: `Delete “${p.name}” and its history? Audio used by other projects is kept.`, confirmLabel: 'Delete', run: () => run('Delete', () => pm.remove(p.id)) })}><Trash2 className="w-3 h-3" /></button>
              </li>
            ))}
            {!shown.length && <li className="text-slate-500 p-2">No projects match.</li>}
          </ul>
          {storage && (
            <div className="mt-2 text-[11px] text-slate-500">
              App storage: {mb(storage.usage)} used{storage.quota ? ` of ${mb(storage.quota)} available` : ''} · everything is stored inside this app.
            </div>
          )}
        </Panel>

        {/* new */}
        <Panel title="New project">
          <div className="flex gap-1 mb-2">
            <Btn onClick={() => askPrompt({ title: 'New starter-groove project', label: 'Project name', value: 'Untitled', confirmLabel: 'Create project', run: (name) => run('New project', () => pm.create('default', name)) })} title="Six tracks with an editable drum groove, bassline, pad chord and lead motif">Starter groove</Btn>
            <Btn onClick={() => askPrompt({ title: 'New empty project', label: 'Project name', value: 'Untitled', confirmLabel: 'Create project', run: (name) => run('New project', () => pm.create('empty', name)) })}>Empty</Btn>
          </div>
          <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-1">Genre templates</div>
          <div className="grid grid-cols-2 gap-1 max-h-[380px] overflow-y-auto pr-1">
            {GENRE_TEMPLATES.map((t) => (
              <button key={t.id} type="button" title={t.description} onClick={() => askPrompt({ title: `New ${t.name} project`, label: 'Project name', value: `${t.name} idea`, confirmLabel: 'Create project', run: (name) => run('New project', () => pm.create(t.id, name)) })} className="text-left rounded bg-slate-900/80 hover:bg-orange-500 hover:text-black px-2 py-1">
                <div className="font-bold truncate">{t.name}</div>
                <div className="text-[11px] opacity-70 truncate">{t.bpm} BPM · {t.description}</div>
              </button>
            ))}
          </div>
          {userTpl.length > 0 && (
            <>
              <div className="text-[11px] uppercase tracking-widest text-slate-500 mt-2 mb-1">Your templates</div>
              {userTpl.map((t) => (
                <div key={t.id} className="flex items-center gap-1">
                  <button type="button" className="flex-1 text-left rounded bg-slate-900/80 hover:bg-orange-500 hover:text-black px-2 py-1" onClick={() => void run('New project', () => pm.create(t.id, `${t.name} project`))}>{t.name} · {t.bpm} BPM</button>
                  <button type="button" aria-label="Delete template" className="text-slate-500 hover:text-red-400" onClick={() => askConfirm({ title: 'Delete template', message: `Delete template “${t.name}”?`, confirmLabel: 'Delete', run: () => run('Delete', () => pm.remove(t.id)) })}><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </>
          )}
          <div className="text-[11px] uppercase tracking-widest text-slate-500 mt-3 mb-1">Track & mixer templates</div>
          <div className="flex flex-wrap gap-1 mb-1">
            <select value={tplTrack} onChange={(e) => setTplTrack(e.target.value)} aria-label="Track to save as a template" className="bg-black/60 border border-slate-700 rounded max-w-[130px]">
              {audioEngine.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Btn onClick={() => { const t = audioEngine.tracks.find((x) => x.id === tplTrack) ?? activeTrack; if (t) void run('Save track template', () => saveTrackTemplate(t.id, t.name)); }} title="Instrument + insert effects + channel settings">Save track template</Btn>
            <Btn onClick={() => askPrompt({ title: 'Save mixer template', label: 'Template name (buses, returns + inserts, VCAs, groups)', value: 'My mixer', confirmLabel: 'Save template', run: (name) => run('Save mixer template', () => saveMixerTemplate(name)) })}>Save mixer…</Btn>
          </div>
          <ul className="space-y-0.5 max-h-32 overflow-y-auto">
            {trackTpl.map((t) => (
              <li key={t.id} className="flex items-center gap-1"><span className="flex-1 truncate">Track: {t.name} {t.inserts.length ? `(+${t.inserts.length} FX)` : ''}</span><Btn onClick={() => applyTrackTemplate(t)}>Add</Btn><button type="button" aria-label="Delete template" className="text-slate-500 hover:text-red-400" onClick={() => void run('Delete', () => deleteTemplate(t.id))}><Trash2 className="w-3 h-3" /></button></li>
            ))}
            {mixTpl.map((t) => (
              <li key={t.id} className="flex items-center gap-1"><span className="flex-1 truncate">Mixer: {t.name} ({t.buses.length} buses)</span><Btn onClick={() => applyMixerTemplate(t)}>Apply</Btn><button type="button" aria-label="Delete template" className="text-slate-500 hover:text-red-400" onClick={() => void run('Delete', () => deleteTemplate(t.id))}><Trash2 className="w-3 h-3" /></button></li>
            ))}
          </ul>
        </Panel>

        {/* current project details */}
        <div className="flex flex-col gap-3">
          <Panel title="Metadata">
            <div className="grid grid-cols-2 gap-1.5">
              {field('title', 'Title')}
              {field('artist', 'Artist')}
              {field('album', 'Album / release')}
              {field('genre', 'Genre')}
              {field('year', 'Year')}
              {field('isrc', 'ISRC')}
              {field('upc', 'UPC')}
              {field('tags', 'Tags (comma separated)')}
            </div>
            <div className="mt-1.5">{field('comment', 'Comment')}</div>
          </Panel>
          <Panel title="Project notes">
            <textarea value={pm.notes} onChange={(e) => pm.setNotes(e.target.value)} rows={4} aria-label="Project notes" placeholder="Lyrics, mix notes, to-do…" className="w-full bg-black/60 border border-slate-700 rounded p-1.5 outline-none focus:border-orange-500" />
          </Panel>
          <Panel title={`History (${versions.length})`}>
            <ul className="space-y-0.5 max-h-44 overflow-y-auto">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center gap-1">
                  <span className={`flex-1 truncate ${v.auto ? 'text-slate-500' : 'text-slate-200'}`}>{v.label}</span>
                  <span className="text-[11px] text-slate-500">{ago(v.createdAt)}</span>
                  <Btn onClick={() => askConfirm({ title: 'Restore version', message: `Restore “${v.label}”? The current state is kept as a version first.`, confirmLabel: 'Restore', run: () => run('Restore', () => pm.restoreVersion(v.id)) })}>Restore</Btn>
                  <button type="button" aria-label="Delete version" className="text-slate-500 hover:text-red-400" onClick={() => void run('Delete', () => pm.deleteVersion(v.id))}><Trash2 className="w-3 h-3" /></button>
                </li>
              ))}
            </ul>
          </Panel>
          {pm.missing.length > 0 && (
            <Panel title={`Missing audio (${pm.missing.length})`}>
              <p className="text-slate-400 mb-1">These clips' audio is not in this app (e.g. a project .json without its archive). Relink each to a file:</p>
              {pm.missing.map((id) => (
                <div key={id} className="flex items-center gap-1">
                  <span className="flex-1 truncate font-mono text-[11px]">{id}</span>
                  <Btn onClick={() => { setRelinkId(id); relinkRef.current?.click(); }}>Relink…</Btn>
                </div>
              ))}
              <input ref={relinkRef} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && relinkId) void run('Relink', () => pm.relink(relinkId, f)); }} />
            </Panel>
          )}
          <Panel title="Audio in this project">
            <div className="text-slate-400">{audioStore.all().length} audio files loaded · recordings and imports are saved inside the app automatically.</div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
