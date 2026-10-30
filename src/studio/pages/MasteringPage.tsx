/**
 * Mastering: the master-bus mastering chain (EQ, multiband, saturation, exciter, imager, clipper,
 * limiter) with presets and gain-reduction meters, a measured auto-master assistant, and
 * reference tracks for A/B listening.
 */
import { useEffect, useReducer, useRef, useState } from 'react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { DEFAULT_MASTERING, MASTERING_PRESETS, type BandTarget, type BandType, type MasteringState } from '../../audio/mastering/MasteringChain.ts';
import { MASTER_TARGETS, OCTAVES, analyzeMix, autoMaster, type MixAnalysis } from '../../audio/mastering/assistant.ts';
import { useFrame } from '../../nexa/useEngine.ts';
import { Btn, Panel, Sel, Slide } from '../ui/controls.tsx';

const fmt = (v: number, d = 1) => (Number.isFinite(v) && v > -69.9 ? v.toFixed(d) : '—');

function OnOff({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Btn on={on} tone="green" onClick={() => onChange(!on)} title={`${label} on / off`}>
      {on ? 'ON' : 'OFF'}
    </Btn>
  );
}

/** Gain-reduction bar (dB ≤ 0), written per frame. */
function GrMeter({ read, label }: { read: () => number; label: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const gr = Math.min(0, read());
    if (bar.current) bar.current.style.width = `${Math.min(100, (-gr / 12) * 100)}%`;
    if (txt.current) txt.current.textContent = gr < -0.05 ? gr.toFixed(1) : '0.0';
  });
  return (
    <div className="flex items-center gap-2 text-[11px]" title={`${label} gain reduction (dB)`}>
      <span className="w-20 text-slate-400">{label} GR</span>
      <div className="flex-1 h-2 bg-black/60 rounded overflow-hidden flex justify-end">
        <div ref={bar} className="h-full bg-amber-400" style={{ width: 0 }} />
      </div>
      <span ref={txt} className="w-16 text-right font-mono text-amber-300">0.0</span>
    </div>
  );
}

function LiveLoudness() {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const r = audioEngine.meters.reading;
    if (ref.current) ref.current.textContent = `Short-term ${fmt(r.shortTerm)} LUFS · Integrated ${fmt(r.integrated)} LUFS · True peak max ${fmt(r.truePeakMax)} dBTP`;
  });
  return <div ref={ref} className="font-mono text-[11px] text-emerald-300" />;
}

function OctaveBars({ a, b }: { a: number[]; b?: number[] }) {
  return (
    <div className="flex items-end gap-1 h-20" aria-label="Octave-band spectrum">
      {OCTAVES.map((f, i) => (
        <div key={f} className="flex-1 flex flex-col items-center gap-0.5">
          <div className="w-full flex items-end gap-px h-16">
            <div className="flex-1 bg-slate-500 rounded-t" style={{ height: `${Math.max(2, 100 + a[i] * 2.5)}%` }} title={`Before ${a[i].toFixed(1)} dB`} />
            {b && <div className="flex-1 bg-orange-500 rounded-t" style={{ height: `${Math.max(2, 100 + b[i] * 2.5)}%` }} title={`After ${b[i].toFixed(1)} dB`} />}
          </div>
          <span className="text-[11px] text-slate-500">{f >= 1000 ? `${f / 1000}k` : f}</span>
        </div>
      ))}
    </div>
  );
}

function AnalysisFacts({ m, label }: { m: MixAnalysis; label: string }) {
  const l = m.loudness;
  const row = (k: string, v: string, warn = false) => (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400">{k}</span>
      <span className={`font-mono ${warn ? 'text-amber-300' : 'text-slate-100'}`}>{v}</span>
    </div>
  );
  return (
    <div className="text-[11px] space-y-0.5 min-w-[180px]">
      <div className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">{label}</div>
      {row('Integrated', `${fmt(l.integrated)} LUFS`)}
      {row('True peak', `${fmt(l.truePeakDb)} dBTP`, l.truePeakDb > -1)}
      {row('Loudness range', `${fmt(l.lra)} LU`)}
      {row('PLR', `${fmt(l.plr)} dB`)}
      {row('Tilt', `${m.tilt.toFixed(1)} dB/oct`)}
      {row('Correlation', m.correlation.toFixed(2), m.correlation < 0.1)}
      {row('Low-end correlation', m.lowCorrelation.toFixed(2), m.lowCorrelation < 0.7)}
    </div>
  );
}

function Assistant({ onApplied }: { onApplied: () => void }) {
  const [target, setTarget] = useState(MASTER_TARGETS[0].id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [before, setBefore] = useState<MixAnalysis | null>(null);
  const [after, setAfter] = useState<MixAnalysis | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const undo = useRef<MasteringState | null>(null);
  const progress = (f: number, label: string) => setBusy(`${label} · ${Math.round(f * 100)} %`);
  const t = MASTER_TARGETS.find((x) => x.id === target) ?? MASTER_TARGETS[0];
  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="Mastering assistant" right={<span className="text-[11px] text-slate-500">measured on an offline render of the whole song</span>}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Sel value={target} onChange={setTarget} options={MASTER_TARGETS.map((x) => ({ value: x.id, label: x.label }))} title="Loudness goal" />
        <Btn
          disabled={!!busy}
          onClick={() =>
            void run(async () => {
              setBusy('Rendering');
              const m = await analyzeMix(audioEngine, false, (f) => progress(f, 'Rendering the mix'));
              setBefore(m);
              setAfter(null);
              setNotes([]);
            })
          }
          title="Measures the mix without the mastering chain"
        >
          Analyze mix
        </Btn>
        <Btn
          tone="orange"
          on
          disabled={!!busy}
          onClick={() =>
            void run(async () => {
              const r = await autoMaster(audioEngine, t, progress);
              undo.current = structuredClone(audioEngine.mastering.state);
              audioEngine.mastering.set(r.state);
              setBefore(r.before);
              setAfter(r.after);
              setNotes(r.notes);
              onApplied();
            })
          }
          title="Measures the mix, sets the chain and re-renders until the loudness goal is met"
        >
          Auto-master
        </Btn>
        {undo.current && (
          <Btn
            onClick={() => {
              if (!undo.current) return;
              audioEngine.mastering.set(undo.current);
              undo.current = null;
              setAfter(null);
              onApplied();
            }}
          >
            Undo auto-master
          </Btn>
        )}
        {busy && <span className="text-[11px] text-cyan-300">{busy}</span>}
        {error && <span className="text-[11px] text-red-400">{error}</span>}
      </div>
      {before ? (
        <div className="flex flex-wrap gap-4 items-start">
          <AnalysisFacts m={before} label="Mix (no mastering)" />
          {after && <AnalysisFacts m={after} label={`Mastered · goal ${t.lufs} LUFS`} />}
          <div className="flex-1 min-w-[260px]">
            <OctaveBars a={before.octaves} b={after?.octaves} />
            <div className="text-[11px] text-slate-500 mt-1">Octave-band energy (grey = mix, orange = mastered), loudest band at the top.</div>
          </div>
          {notes.length > 0 && (
            <ul className="basis-full text-[11px] text-slate-300 list-disc pl-4 space-y-0.5">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              <li className="text-slate-500">Suggestions follow rule-of-thumb targets; adjust by ear and compare with a reference.</li>
            </ul>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-slate-500">Analyze shows loudness, true peak, spectrum balance and stereo correlation. Auto-master also sets the chain below for the chosen goal.</div>
      )}
    </Panel>
  );
}

function References() {
  const ref = audioEngine.reference;
  const [, force] = useReducer((x: number) => x + 1, 0);
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const off = ref.subscribe(force);
    if (!ref.loaded) void ref.load();
    return () => {
      off();
    };
  }, [ref]);
  const toRef = audioEngine.monitor.state.source === 'reference';
  return (
    <Panel title="Reference A/B" right={<span className="text-[11px] text-slate-500">stored in this browser · never exported</span>}>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Btn on={!toRef} tone="cyan" onClick={() => { ref.ab(false); force(); }} title="Hear your mix">A · Mix</Btn>
        <Btn on={toRef} tone="violet" disabled={!ref.activeId} onClick={() => { ref.ab(true); force(); }} title="Hear the reference (level-matched)">B · Reference</Btn>
        <Btn on={ref.levelMatch} onClick={() => { ref.levelMatch = !ref.levelMatch; ref.refreshGain(); force(); }} title="Plays the reference at your mix's integrated loudness">Level match</Btn>
        <Btn on={ref.sync} onClick={() => { ref.sync = !ref.sync; force(); }} title="Starts the reference at the song position">Sync</Btn>
        <Btn onClick={() => (ref.playing ? ref.stop() : ref.play())} disabled={!ref.activeId}>{ref.playing ? 'Stop ref' : 'Play ref'}</Btn>
        <Btn onClick={() => file.current?.click()}>+ Add reference…</Btn>
        <input
          ref={file}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void ref.add(f).catch((x: unknown) => setErr(x instanceof Error ? x.message : 'Could not decode this file'));
          }}
        />
        {err && <span className="text-[11px] text-red-400">{err}</span>}
      </div>
      {ref.refs.length === 0 ? (
        <div className="text-[11px] text-slate-500">Add a finished song you like (WAV, MP3, FLAC…). Its loudness is measured so A/B compares tone, not volume.</div>
      ) : (
        <ul className="space-y-1">
          {ref.refs.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded ${r.id === ref.activeId ? 'bg-violet-950/60 border border-violet-700' : 'bg-black/30'}`}>
              <button className="flex-1 text-left truncate text-slate-200" onClick={() => { ref.select(r.id); force(); }}>{r.name}</button>
              <span className="font-mono text-slate-400">{fmt(r.lufs)} LUFS · {fmt(r.truePeakDb)} dBTP</span>
              <Btn tone="red" onClick={() => void ref.remove(r.id)}>✕</Btn>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const BAND_TYPES: { value: BandType; label: string }[] = [
  { value: 'lowshelf', label: 'Low shelf' },
  { value: 'peaking', label: 'Bell' },
  { value: 'highshelf', label: 'High shelf' },
];
const TARGETS: { value: BandTarget; label: string }[] = [
  { value: 'stereo', label: 'Stereo' },
  { value: 'mid', label: 'Mid' },
  { value: 'side', label: 'Side' },
];
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);

export function MasteringPage() {
  const chain = audioEngine.mastering;
  const [, force] = useReducer((x: number) => x + 1, 0);
  const save = useRef<number | null>(null);
  const s = chain.state;
  const upd = (fn: (m: MasteringState) => void) => {
    chain.update(fn);
    force();
    // project autosave: one change notice after the knob settles
    if (save.current !== null) window.clearTimeout(save.current);
    save.current = window.setTimeout(() => audioEngine.changed(), 400);
  };
  const [preset, setPreset] = useState('');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-[#070a10]" data-testid="mastering-page">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-200">Mastering</h2>
        <Btn on={s.enabled} tone="green" onClick={() => upd((m) => (m.enabled = !m.enabled))} title="Whole chain in / out (click-free)">
          {s.enabled ? 'Chain ON' : 'Chain OFF (bypassed)'}
        </Btn>
        <Sel
          value={preset}
          onChange={(v) => {
            setPreset(v);
            const p = MASTERING_PRESETS.find((x) => x.name === v);
            if (p) upd((m) => Object.assign(m, p.patch(m)));
          }}
          options={[{ value: '', label: 'Preset…' }, ...MASTERING_PRESETS.map((p) => ({ value: p.name, label: p.name }))]}
          title="Mastering preset"
        />
        <Btn onClick={() => upd((m) => Object.assign(m, structuredClone(DEFAULT_MASTERING)))} title="Back to the default (flat) chain">Reset</Btn>
        <div className="flex-1" />
        <LiveLoudness />
      </div>

      <Assistant onApplied={force} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Panel title="Input & EQ" right={<OnOff label="EQ" on={s.eq.on} onChange={(v) => upd((m) => (m.eq.on = v))} />}>
          <div className="space-y-1.5">
            <Slide label="Input gain" value={s.inputDb} min={-24} max={12} step={0.1} unit=" dB" onChange={(v) => upd((m) => (m.inputDb = v))} />
            <Slide label="High-pass" value={s.eq.hp} min={0} max={200} step={1} onChange={(v) => upd((m) => (m.eq.hp = v))} format={(v) => (v > 0 ? `${v} Hz` : 'off')} />
            <Slide label="Low-pass" value={s.eq.lp} min={0} max={22000} step={100} onChange={(v) => upd((m) => (m.eq.lp = v < 1000 ? 0 : v))} format={(v) => (v > 0 ? `${hz(v)} Hz` : 'off')} />
            {s.eq.bands.map((b, i) => (
              <div key={i} className="grid grid-cols-[auto_auto_1fr] gap-x-2 gap-y-1 items-center border-t border-slate-800 pt-1">
                <Sel value={b.type} onChange={(v) => upd((m) => (m.eq.bands[i].type = v))} options={BAND_TYPES} title={`Band ${i + 1} type`} />
                <Sel value={b.target} onChange={(v) => upd((m) => (m.eq.bands[i].target = v))} options={TARGETS} title={`Band ${i + 1} stereo / mid / side`} />
                <div className="space-y-0.5">
                  <Slide label={`Band ${i + 1} freq`} value={b.freq} min={20} max={20000} step={1} onChange={(v) => upd((m) => (m.eq.bands[i].freq = v))} format={(v) => `${hz(v)} Hz`} />
                  <Slide label="Gain" value={b.gain} min={-12} max={12} step={0.1} unit=" dB" onChange={(v) => upd((m) => (m.eq.bands[i].gain = v))} />
                  {b.type === 'peaking' && <Slide label="Q" value={b.q} min={0.2} max={8} step={0.1} onChange={(v) => upd((m) => (m.eq.bands[i].q = v))} />}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Multiband compressor" right={<OnOff label="Multiband" on={s.multiband.on} onChange={(v) => upd((m) => (m.multiband.on = v))} />}>
          <div className="space-y-1.5">
            <Slide label="Low / mid" value={s.multiband.lowX} min={40} max={800} step={5} onChange={(v) => upd((m) => (m.multiband.lowX = v))} format={(v) => `${v} Hz`} />
            <Slide label="Mid / high" value={s.multiband.highX} min={1000} max={12000} step={50} onChange={(v) => upd((m) => (m.multiband.highX = v))} format={(v) => `${hz(v)} Hz`} />
            {s.multiband.bands.map((b, i) => (
              <div key={i} className="border-t border-slate-800 pt-1 space-y-0.5">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">{['Low', 'Mid', 'High'][i]} band</div>
                <Slide label="Threshold" value={b.threshold} min={-48} max={0} step={0.5} unit=" dB" onChange={(v) => upd((m) => (m.multiband.bands[i].threshold = v))} />
                <Slide label="Ratio" value={b.ratio} min={1} max={10} step={0.1} unit=":1" onChange={(v) => upd((m) => (m.multiband.bands[i].ratio = v))} />
                <Slide label="Attack" value={Math.round(b.attack * 1000)} min={1} max={200} step={1} unit=" ms" onChange={(v) => upd((m) => (m.multiband.bands[i].attack = v / 1000))} />
                <Slide label="Release" value={Math.round(b.release * 1000)} min={20} max={1000} step={5} unit=" ms" onChange={(v) => upd((m) => (m.multiband.bands[i].release = v / 1000))} />
                <Slide label="Makeup" value={b.gain} min={-12} max={12} step={0.1} unit=" dB" onChange={(v) => upd((m) => (m.multiband.bands[i].gain = v))} />
                <GrMeter label={['Low', 'Mid', 'High'][i]} read={() => chain.bandReduction()[i] ?? 0} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Color & width">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-300 w-20">Saturation</span>
              <OnOff label="Saturation" on={s.saturation.on} onChange={(v) => upd((m) => (m.saturation.on = v))} />
              <Sel value={s.saturation.mode} onChange={(v) => upd((m) => (m.saturation.mode = v))} options={[{ value: 'tape', label: 'Tape' }, { value: 'tube', label: 'Tube' }, { value: 'console', label: 'Console' }]} title="Saturation type" />
            </div>
            <Slide label="Drive" value={Math.round(s.saturation.drive * 100)} min={0} max={100} step={1} unit=" %" onChange={(v) => upd((m) => (m.saturation.drive = v / 100))} />
            <Slide label="Mix" value={Math.round(s.saturation.mix * 100)} min={0} max={100} step={1} unit=" %" onChange={(v) => upd((m) => (m.saturation.mix = v / 100))} />
            <div className="flex items-center gap-2 border-t border-slate-800 pt-1">
              <span className="text-[11px] font-bold text-slate-300 w-20">Exciter</span>
              <OnOff label="Exciter" on={s.exciter.on} onChange={(v) => upd((m) => (m.exciter.on = v))} />
            </div>
            <Slide label="From" value={s.exciter.freq} min={1000} max={12000} step={100} onChange={(v) => upd((m) => (m.exciter.freq = v))} format={(v) => `${hz(v)} Hz`} />
            <Slide label="Amount" value={Math.round(s.exciter.amount * 100)} min={0} max={100} step={1} unit=" %" onChange={(v) => upd((m) => (m.exciter.amount = v / 100))} />
            <div className="flex items-center gap-2 border-t border-slate-800 pt-1">
              <span className="text-[11px] font-bold text-slate-300 w-20">Stereo imager</span>
              <OnOff label="Imager" on={s.imager.on} onChange={(v) => upd((m) => (m.imager.on = v))} />
            </div>
            <Slide label="Width" value={Math.round(s.imager.width * 100)} min={0} max={200} step={1} unit=" %" onChange={(v) => upd((m) => (m.imager.width = v / 100))} />
            <Slide label="Mono below" value={s.imager.monoBelow} min={0} max={300} step={5} onChange={(v) => upd((m) => (m.imager.monoBelow = v))} format={(v) => (v > 0 ? `${v} Hz` : 'off')} />
          </div>
        </Panel>

        <Panel title="Clipper & limiter">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-300 w-20">Clipper</span>
              <OnOff label="Clipper" on={s.clipper.on} onChange={(v) => upd((m) => (m.clipper.on = v))} />
            </div>
            <Slide label="Drive" value={s.clipper.driveDb} min={0} max={12} step={0.1} unit=" dB" onChange={(v) => upd((m) => (m.clipper.driveDb = v))} />
            <div className="flex items-center gap-2 border-t border-slate-800 pt-1">
              <span className="text-[11px] font-bold text-slate-300 w-20">Limiter</span>
              <OnOff label="Limiter" on={s.limiter.on} onChange={(v) => upd((m) => (m.limiter.on = v))} />
            </div>
            <Slide label="Gain" value={s.limiter.gainDb} min={0} max={24} step={0.1} unit=" dB" onChange={(v) => upd((m) => (m.limiter.gainDb = v))} />
            <Slide label="Ceiling" value={s.limiter.ceiling} min={-6} max={0} step={0.1} unit=" dBFS" onChange={(v) => upd((m) => (m.limiter.ceiling = v))} />
            <Slide label="Release" value={Math.round(s.limiter.release * 1000)} min={10} max={1000} step={5} unit=" ms" onChange={(v) => upd((m) => (m.limiter.release = v / 1000))} />
            <Slide label="Look-ahead" value={s.limiter.lookaheadMs} min={0} max={10} step={0.5} unit=" ms" onChange={(v) => upd((m) => (m.limiter.lookaheadMs = v))} />
            <GrMeter label="Limiter" read={() => chain.limiterGr} />
          </div>
        </Panel>
      </div>

      <References />
    </div>
  );
}
