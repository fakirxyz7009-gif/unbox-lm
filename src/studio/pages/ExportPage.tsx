/**
 * Export: mix / stems / MIDI, any format the app can encode, range (song, loop, bars),
 * sample rate, bit depth, dither, normalization, metadata, plus the real-time bounce, freeze and
 * MIDI import.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileMusic } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { supportedBitrates } from '../../audio/export/compressed.ts';
import { DEFAULT_EXPORT, FORMAT_INFO, exportRange, runExport, type ExportFormat, type ExportResult, type ExportSettings } from '../../audio/export/exporter.ts';
import { importMidi } from '../../audio/export/midi.ts';
import { downloadBlob } from '../../audio/export/wav.ts';
import { useEngineVersion } from '../../nexa/useEngine.ts';
import { projectManager } from '../../project/ProjectManager.ts';
import { Btn, NumField, Panel, Sel } from '../ui/controls.tsx';

const fmtDb = (v: number | undefined, unit: string) => (v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(1)} ${unit}`);
const STANDARD_BITRATES = [96, 128, 160, 192, 256, 320];

export function ExportPage() {
  useEngineVersion();
  const [s, setS] = useState<ExportSettings>(() => ({
    ...DEFAULT_EXPORT,
    fileName: projectManager.currentName,
    meta: { title: projectManager.meta.title || projectManager.currentName, artist: projectManager.meta.artist, album: projectManager.meta.album, genre: projectManager.meta.genre, year: projectManager.meta.year, isrc: projectManager.meta.isrc, comment: projectManager.meta.comment },
  }));
  const [encoderBitrates, setEncoderBitrates] = useState<{ ogg: number[]; aac: Record<44100 | 48000, number[]> }>({
    ogg: [],
    aac: { 44100: [], 48000: [] },
  });
  const [busy, setBusy] = useState<{ f: number; label: string } | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const midiRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([supportedBitrates('opus'), supportedBitrates('aac', 44_100), supportedBitrates('aac', 48_000)]).then(([ogg, aac44, aac48]) => {
      if (!cancelled) setEncoderBitrates({ ogg, aac: { 44100: aac44, 48000: aac48 } });
    });
    return () => { cancelled = true; };
  }, []);
  const set = (patch: Partial<ExportSettings>) => setS((x) => ({ ...x, ...patch }));
  const channels = audioEngine.mixer.channels();
  const range = exportRange(audioEngine, s);
  const seconds = useMemo(() => ((range.end - range.start) * 60) / audioEngine.bpm / 4, [range.start, range.end]);
  const info = FORMAT_INFO[s.format];
  const available = (f: ExportFormat) => (f === 'ogg' ? encoderBitrates.ogg.length > 0 : f === 'aac' ? Object.values(encoderBitrates.aac).some((rates) => rates.length > 0) : true);
  const chooseFormat = (format: ExportFormat) => {
    const supportedRates = format === 'aac'
      ? FORMAT_INFO.aac.rates.filter((rate) => encoderBitrates.aac[rate as 44100 | 48000].length > 0)
      : FORMAT_INFO[format].rates;
    const sampleRate = supportedRates.includes(s.sampleRate) ? s.sampleRate : supportedRates[0] ?? FORMAT_INFO[format].rates[0];
    const supported = format === 'aac'
      ? encoderBitrates.aac[sampleRate as 44100 | 48000]
      : format === 'ogg' ? encoderBitrates.ogg : [];
    const kbps = supported.length && !supported.includes(s.kbps) ? supported[supported.length - 1]! : s.kbps;
    set({ format, kbps, sampleRate });
  };
  const sampleRateOptions = s.format === 'aac'
    ? info.rates.filter((rate) => encoderBitrates.aac[rate as 44100 | 48000].length > 0)
    : info.rates;
  const bitrateOptions = s.format === 'aac'
    ? encoderBitrates.aac[s.sampleRate as 44100 | 48000]
    : s.format === 'ogg' ? encoderBitrates.ogg : STANDARD_BITRATES;
  const chooseSampleRate = (sampleRate: number) => {
    const supported = s.format === 'aac' ? encoderBitrates.aac[sampleRate as 44100 | 48000] : [];
    const kbps = supported.length && !supported.includes(s.kbps) ? supported[supported.length - 1]! : s.kbps;
    set({ sampleRate, kbps });
  };

  const go = async () => {
    setErr(null);
    setResult(null);
    setBusy({ f: 0, label: 'Starting' });
    try {
      const r = await runExport(audioEngine, s, (f, label) => setBusy({ f, label }));
      setResult(r);
      r.files.forEach((f) => downloadBlob(f.blob, f.name));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 bg-[#070a10] text-slate-200 text-[11px]" data-testid="export-page">
      <div className="flex items-center gap-2 mb-3">
        <Download className="w-4 h-4 text-orange-400" />
        <h2 className="text-[13px] font-black text-white">Export</h2>
        <span className="text-slate-500">Offline render of the arrangement: every device, insert, send, bus, automation and audio clip, then the master section.</span>
      </div>
      <div className="grid grid-cols-[minmax(320px,1fr)_minmax(320px,1fr)_minmax(280px,0.8fr)] gap-3">
        <Panel title="What">
          <div className="flex gap-1 mb-2">
            {(['mix', 'stems', 'midi'] as const).map((w) => (
              <Btn key={w} on={s.what === w} onClick={() => set({ what: w })}>{w === 'mix' ? 'Master mix' : w === 'stems' ? 'Stems' : 'MIDI file'}</Btn>
            ))}
          </div>
          {s.what === 'mix' && (
            <label className="flex items-center gap-1"><input type="checkbox" checked={s.masterProcessing} onChange={(e) => set({ masterProcessing: e.target.checked })} /> Through the master section (EQ, width, limiter, clipper)</label>
          )}
          {s.what === 'stems' && (
            <div className="flex flex-col gap-1">
              <div className="flex gap-1">
                <Btn onClick={() => set({ stems: channels.map((c) => c.id) })}>All</Btn>
                <Btn onClick={() => set({ stems: channels.filter((c) => c.kind === 'track' || c.kind === 'audio').map((c) => c.id) })}>Tracks only</Btn>
                <Btn onClick={() => set({ stems: [] })}>None</Btn>
              </div>
              <div className="grid grid-cols-2 gap-x-2 max-h-48 overflow-y-auto">
                {channels.map((c) => (
                  <label key={c.id} className="flex items-center gap-1 truncate">
                    <input type="checkbox" checked={s.stems.includes(c.id)} onChange={(e) => set({ stems: e.target.checked ? [...s.stems, c.id] : s.stems.filter((x) => x !== c.id) })} />
                    <span className="w-2 h-2 rounded-full" style={{ background: c.settings.color }} /> {c.settings.name}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-1">Stem type
                <Sel value={s.stemMode} onChange={(v) => set({ stemMode: v })} options={[{ value: 'wet', label: 'Wet (with its sends / returns)' }, { value: 'dry', label: 'Dry (channel only)' }]} />
              </label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={s.stemMaster} onChange={(e) => set({ stemMaster: e.target.checked })} /> Through the master section</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={s.stemNotes} onChange={(e) => set({ stemNotes: e.target.checked })} /> MIDI notes with each stem (drum pattern included)</label>
              <span className="text-slate-500">Each stem is rendered on its own; with notes on, each instrument also gets a .mid. All come as one .zip with a manifest.json.</span>
            </div>
          )}
          {s.what === 'midi' && <p className="text-slate-400">Standard MIDI File (type 1, 480 PPQ): tempo map, time signature, markers and one track per instrument (drums on channel 10).</p>}

          <div className="mt-3 text-[11px] uppercase tracking-widest text-slate-500">Range</div>
          <div className="flex flex-wrap items-center gap-1">
            {(['song', 'loop', 'custom'] as const).map((r) => (
              <Btn key={r} on={s.range === r} onClick={() => set({ range: r })}>{r === 'song' ? 'Whole song' : r === 'loop' ? 'Loop L–R' : 'Bars'}</Btn>
            ))}
            {s.range === 'custom' && (
              <>
                <NumField title="From bar" value={s.startBar} min={1} step={1} onChange={(v) => set({ startBar: v })} width={50} suffix="to" />
                <NumField title="To bar" value={s.endBar} min={s.startBar + 1} step={1} onChange={(v) => set({ endBar: v })} width={50} />
              </>
            )}
            <span className="text-slate-500">{(range.end - range.start) / audioEngine.stepsPerBar} bars · {seconds.toFixed(1)} s</span>
          </div>
          {s.what !== 'midi' && (
            <label className="flex items-center gap-1 mt-1">Tail <NumField value={s.tailSec} min={0} max={30} step={0.5} onChange={(v) => set({ tailSec: v })} width={48} suffix="s (reverb / delay ring-out)" /></label>
          )}
        </Panel>

        {s.what !== 'midi' && (
          <Panel title="Format">
            <div className="grid grid-cols-3 gap-1 mb-2">
              {(Object.keys(FORMAT_INFO) as ExportFormat[]).map((f) => (
                <Btn key={f} on={s.format === f} disabled={!available(f)} title={available(f) ? undefined : 'This browser has no encoder for it'} onClick={() => chooseFormat(f)}>
                  {FORMAT_INFO[f].label}
                </Btn>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex items-center justify-between gap-1">Sample rate
                <Sel value={String(s.sampleRate)} onChange={(v) => chooseSampleRate(Number(v))} options={sampleRateOptions.map((r) => ({ value: String(r), label: `${r / 1000} kHz` }))} />
              </label>
              {!info.lossy ? (
                <label className="flex items-center justify-between gap-1">Bit depth
                  <Sel value={String(s.bitDepth)} onChange={(v) => set({ bitDepth: Number(v) as 16 | 24 | 32 })} options={(s.format === 'wav' ? [16, 24, 32] : [16, 24]).map((b) => ({ value: String(b), label: b === 32 ? '32-bit float' : `${b}-bit` }))} />
                </label>
              ) : (
                <label className="flex items-center justify-between gap-1">Bitrate
                  <Sel value={String(s.kbps)} onChange={(v) => set({ kbps: Number(v) })} options={bitrateOptions.map((k) => ({ value: String(k), label: `${k} kbps` }))} />
                </label>
              )}
              <label className="flex items-center gap-1 col-span-2"><input type="checkbox" checked={s.dither} onChange={(e) => set({ dither: e.target.checked })} /> TPDF dither when reducing to 16 / 24 bit</label>
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-widest text-slate-500">Normalize (mix)</div>
            <div className="flex flex-wrap items-center gap-1">
              {(['off', 'peak', 'lufs'] as const).map((n) => (
                <Btn key={n} on={s.normalize === n} onClick={() => set({ normalize: n })}>{n === 'off' ? 'Off' : n === 'peak' ? 'True peak' : 'Loudness (LUFS)'}</Btn>
              ))}
              {s.normalize === 'peak' && <NumField value={s.peakDb} min={-24} max={0} step={0.1} onChange={(v) => set({ peakDb: v })} width={52} suffix="dBTP" />}
              {s.normalize === 'lufs' && (
                <>
                  <Sel value={String(s.lufs)} onChange={(v) => set({ lufs: Number(v) })} options={[[-8, 'Club −8'], [-9, 'Loud −9'], [-14, 'Spotify / YouTube −14'], [-16, 'Apple Music / podcast −16'], [-23, 'Broadcast EBU R128 −23'], [-24, 'Broadcast ATSC −24']].map(([v, l]) => ({ value: String(v), label: `${l} LUFS` }))} />
                  <NumField title="Ceiling" value={s.ceilingDb} min={-6} max={0} step={0.1} onChange={(v) => set({ ceilingDb: v })} width={48} suffix="dBTP ceiling" />
                </>
              )}
            </div>
            <p className="text-slate-500 mt-1">Normalization is clean gain; it stops below the target rather than clip the true-peak ceiling (use the Mastering page's limiter for loudness).</p>
          </Panel>
        )}

        <Panel title="File & metadata">
          <label className="flex flex-col gap-0.5 mb-1">File name
            <input value={s.fileName} onChange={(e) => set({ fileName: e.target.value })} className="bg-black/60 border border-slate-700 rounded px-1.5 py-0.5 outline-none focus:border-orange-500" />
          </label>
          {s.what !== 'midi' &&
            (['title', 'artist', 'album', 'genre', 'year', 'isrc', 'comment'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1 mb-0.5">
                <span className="w-14 text-slate-500 uppercase text-[11px]">{k}</span>
                <input value={s.meta[k] ?? ''} onChange={(e) => set({ meta: { ...s.meta, [k]: e.target.value } })} className="flex-1 bg-black/60 border border-slate-700 rounded px-1.5 py-0.5 outline-none focus:border-orange-500" />
              </label>
            ))}
          <div className="mt-2 flex flex-col gap-1">
            <Btn tone="green" on onClick={() => void go()} disabled={!!busy || (s.what === 'stems' && !s.stems.length)}>
              <Download className="inline w-3 h-3" /> {s.what === 'stems' ? `Export ${s.stems.length} stems` : s.what === 'midi' ? 'Export MIDI' : `Export ${info.label}`}
            </Btn>
            {busy && (
              <div>
                <div className="h-2 rounded bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.round(busy.f * 100)}%` }} /></div>
                <div className="text-slate-400 mt-0.5">{busy.label}</div>
              </div>
            )}
            {err && <div className="text-red-400">Export failed: {err}</div>}
            {result && (
              <div className="text-emerald-300">
                Saved {result.files.map((f) => f.name).join(', ')}
                {result.loudness && (
                  <div className="text-slate-300">
                    {fmtDb(result.loudness.integrated, 'LUFS')} integrated · {fmtDb(result.loudness.truePeakDb, 'dBTP')} true peak · LRA {fmtDb(result.loudness.lra, 'LU')}
                    {result.gainDb ? ` · normalized ${result.gainDb > 0 ? '+' : ''}${result.gainDb.toFixed(1)} dB` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800 flex flex-col gap-1">
            <div className="text-[11px] uppercase tracking-widest text-slate-500">Other</div>
            <Btn onClick={() => void audioEngine.bounceRealtimeWav()} title="Plays the song once and records the speakers' signal before the monitor section (catches anything live)">Real-time bounce (WAV)</Btn>
            <Btn onClick={() => midiRef.current?.click()}><FileMusic className="inline w-3 h-3" /> Import MIDI file…</Btn>
            <input ref={midiRef} type="file" accept=".mid,.midi,audio/midi" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const n = importMidi(audioEngine, await f.arrayBuffer(), { setTempo: window.confirm('Use the MIDI file tempo?'), atBar: 0 }); window.alert(`Imported ${n} MIDI track(s) as note clips.`); } catch (er) { window.alert(`MIDI import failed: ${(er as Error).message}`); } }} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
