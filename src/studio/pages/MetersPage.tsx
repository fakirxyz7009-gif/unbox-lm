/**
 * Meters: LUFS (momentary / short-term / integrated), loudness range, true peak, PLR, loudness
 * history, peak / RMS, K-meter, VU, correlation, vectorscope (goniometer), spectrum analyzer,
 * spectrogram and oscilloscope — on the master, any mixer channel or the recording input.
 */
import React, { useReducer, useRef, useState } from 'react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { useEngineVersion, useFrame } from '../../nexa/useEngine.ts';
import { Btn, Panel, Sel } from '../ui/controls.tsx';
import { StereoMeter } from '../ui/Meter.tsx';
import { gainToDb } from '../ui/levels.ts';

const TARGETS = [
  { v: -8, l: 'Club −8' },
  { v: -14, l: 'Streaming −14' },
  { v: -16, l: 'Apple / podcast −16' },
  { v: -23, l: 'EBU R128 −23' },
];

const fmt = (v: number, d = 1) => (Number.isFinite(v) && v > -69.9 ? v.toFixed(d) : '—');

function useCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useFrame(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (c && g) draw(g, c.width, c.height);
  });
  return ref;
}

function Spectrum({ hold }: { hold: boolean }) {
  const data = useRef(new Float32Array(audioEngine.meters.spectrum.frequencyBinCount));
  const peak = useRef(new Float32Array(audioEngine.meters.spectrum.frequencyBinCount).fill(-120));
  const ref = useCanvas((g, w, h) => {
    const an = audioEngine.meters.spectrum;
    an.getFloatFrequencyData(data.current);
    const sr = audioEngine.ctx.sampleRate;
    const bin = (f: number) => Math.round((f / (sr / 2)) * data.current.length);
    const x = (f: number) => (Math.log10(f / 20) / Math.log10(20000 / 20)) * w;
    const y = (db: number) => h - ((Math.max(-100, Math.min(0, db)) + 100) / 100) * h;
    g.fillStyle = '#05070b';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(148,163,184,0.15)';
    g.fillStyle = '#64748b';
    g.font = '9px monospace';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      g.beginPath();
      g.moveTo(x(f), 0);
      g.lineTo(x(f), h);
      g.stroke();
      g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x(f) + 2, h - 3);
    }
    for (const db of [-20, -40, -60, -80]) {
      g.beginPath();
      g.moveTo(0, y(db));
      g.lineTo(w, y(db));
      g.stroke();
      g.fillText(String(db), 2, y(db) - 2);
    }
    const draw = (arr: Float32Array, color: string, fill: boolean) => {
      g.beginPath();
      for (let px = 0; px < w; px++) {
        const f0 = 20 * Math.pow(1000, px / w);
        const f1 = 20 * Math.pow(1000, (px + 1) / w);
        let m = -120;
        for (let b = bin(f0); b <= Math.max(bin(f0), bin(f1)); b++) m = Math.max(m, arr[b] ?? -120);
        const yy = y(m);
        if (px === 0) g.moveTo(px, yy);
        else g.lineTo(px, yy);
      }
      if (fill) {
        g.lineTo(w, h);
        g.lineTo(0, h);
        g.closePath();
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(249,115,22,0.55)');
        grad.addColorStop(1, 'rgba(124,58,237,0.15)');
        g.fillStyle = grad;
        g.fill();
      } else {
        g.strokeStyle = color;
        g.stroke();
      }
    };
    if (hold) {
      for (let i = 0; i < data.current.length; i++) peak.current[i] = Math.max(data.current[i], peak.current[i] - 0.25);
      draw(peak.current, 'rgba(250,204,21,0.8)', false);
    }
    draw(data.current, '#f97316', true);
  });
  return <canvas ref={ref} width={760} height={220} className="w-full h-[220px] rounded" />;
}

function Spectrogram() {
  const data = useRef(new Uint8Array(audioEngine.meters.spectrum.frequencyBinCount));
  const ref = useCanvas((g, w, h) => {
    audioEngine.meters.spectrum.getByteFrequencyData(data.current);
    const img = g.getImageData(1, 0, w - 1, h);
    g.putImageData(img, 0, 0);
    const sr = audioEngine.ctx.sampleRate;
    for (let y = 0; y < h; y++) {
      const f = 20 * Math.pow(1000, 1 - y / h);
      const v = data.current[Math.min(data.current.length - 1, Math.round((f / (sr / 2)) * data.current.length))] / 255;
      const r = Math.round(255 * Math.min(1, v * 1.8));
      const gg = Math.round(255 * Math.max(0, v * 1.6 - 0.6));
      const b = Math.round(255 * Math.min(1, (1 - v) * v * 3));
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(w - 1, y, 1, 1);
    }
  });
  return <canvas ref={ref} width={760} height={140} className="w-full h-[140px] rounded bg-black" />;
}

function Vectorscope() {
  const l = useRef(new Float32Array(2048));
  const r = useRef(new Float32Array(2048));
  const ref = useCanvas((g, w, h) => {
    audioEngine.meters.scopeL.getFloatTimeDomainData(l.current);
    audioEngine.meters.scopeR.getFloatTimeDomainData(r.current);
    g.fillStyle = 'rgba(5,7,11,0.35)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(148,163,184,0.2)';
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.moveTo(0, 0);
    g.lineTo(w, h);
    g.moveTo(w, 0);
    g.lineTo(0, h);
    g.stroke();
    g.fillStyle = '#22d3ee';
    const s = Math.min(w, h) * 0.45;
    for (let i = 0; i < l.current.length; i += 2) {
      const L = l.current[i];
      const R = r.current[i];
      const x = w / 2 + ((L - R) / Math.SQRT2) * s;
      const y = h / 2 - ((L + R) / Math.SQRT2) * s;
      g.fillRect(x, y, 1.2, 1.2);
    }
    g.fillStyle = '#64748b';
    g.font = '9px monospace';
    g.fillText('M', w / 2 + 3, 10);
    g.fillText('L', 4, 12);
    g.fillText('R', w - 10, 12);
  });
  return <canvas ref={ref} width={220} height={220} className="rounded bg-black" />;
}

function Scope() {
  const l = useRef(new Float32Array(2048));
  const r = useRef(new Float32Array(2048));
  const ref = useCanvas((g, w, h) => {
    audioEngine.meters.scopeL.getFloatTimeDomainData(l.current);
    audioEngine.meters.scopeR.getFloatTimeDomainData(r.current);
    g.fillStyle = '#05070b';
    g.fillRect(0, 0, w, h);
    // trigger on a rising zero crossing of L
    let start = 0;
    for (let i = 1; i < 1024; i++) if (l.current[i - 1] < 0 && l.current[i] >= 0) {
      start = i;
      break;
    }
    const line = (buf: Float32Array, color: string, yOff: number) => {
      g.strokeStyle = color;
      g.beginPath();
      for (let x = 0; x < w; x++) {
        const v = buf[start + Math.floor((x / w) * 1024)] ?? 0;
        const y = yOff - v * (h / 4);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    };
    line(l.current, '#4ade80', h / 4);
    line(r.current, '#60a5fa', (3 * h) / 4);
  });
  return <canvas ref={ref} width={520} height={140} className="w-full h-[140px] rounded" />;
}

function History({ target }: { target: number }) {
  const ref = useCanvas((g, w, h) => {
    const hist = audioEngine.meters.history;
    g.fillStyle = '#05070b';
    g.fillRect(0, 0, w, h);
    const y = (v: number) => h - ((Math.max(-40, Math.min(0, v)) + 40) / 40) * h;
    g.strokeStyle = 'rgba(34,197,94,0.6)';
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(0, y(target));
    g.lineTo(w, y(target));
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#f97316';
    g.beginPath();
    const n = hist.length;
    for (let i = 0; i < n; i++) {
      const x = w - ((n - 1 - i) / 1200) * w;
      const v = hist[i];
      if (!Number.isFinite(v)) continue;
      if (i === 0) g.moveTo(x, y(v));
      else g.lineTo(x, y(v));
    }
    g.stroke();
    g.fillStyle = '#64748b';
    g.font = '9px monospace';
    for (const v of [-10, -20, -30]) g.fillText(`${v}`, 2, y(v) - 2);
    g.fillText('short-term LUFS · last 2 min', w - 170, 10);
  });
  return <canvas ref={ref} width={520} height={120} className="w-full h-[120px] rounded" />;
}

function VuNeedle({ side }: { side: 0 | 1 }) {
  const v = useRef(-40);
  const ref = useCanvas((g, w, h) => {
    const r = audioEngine.meters.reading;
    const rms = side ? r.rmsR : r.rmsL;
    // VU: 0 VU = -18 dBFS RMS, ~300 ms ballistics
    const target = gainToDb(rms) + 18;
    v.current += (Math.max(-20, Math.min(3, target)) - v.current) * 0.12;
    g.fillStyle = '#f5e9c8';
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 1.25;
    const ang = (db: number) => -0.75 + ((db + 20) / 23) * 1.5;
    g.strokeStyle = '#111';
    g.font = '9px serif';
    g.fillStyle = '#111';
    for (const db of [-20, -10, -7, -5, -3, -1, 0, 1, 2, 3]) {
      const a = ang(db);
      const x1 = cx + Math.sin(a) * h * 0.95;
      const y1 = cy - Math.cos(a) * h * 0.95;
      const x2 = cx + Math.sin(a) * h * 1.05;
      const y2 = cy - Math.cos(a) * h * 1.05;
      g.strokeStyle = db >= 0 ? '#b91c1c' : '#111';
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      if ([-20, -10, -5, 0, 3].includes(db)) g.fillText(String(db), cx + Math.sin(a) * h * 0.82 - 6, cy - Math.cos(a) * h * 0.82 + 3);
    }
    g.fillText('VU', cx - 7, h - 6);
    const a = ang(v.current);
    g.strokeStyle = '#111';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.sin(a) * h * 1.08, cy - Math.cos(a) * h * 1.08);
    g.stroke();
    g.lineWidth = 1;
  });
  return <canvas ref={ref} width={150} height={80} className="rounded border border-amber-900" />;
}

function Correlation() {
  const bar = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const c = audioEngine.meters.reading.correlation;
    if (bar.current) {
      bar.current.style.left = `${((Math.min(c, 0) + 1) / 2) * 100}%`;
      bar.current.style.width = `${(Math.abs(c) / 2) * 100}%`;
      bar.current.style.background = c < 0 ? '#ef4444' : c < 0.3 ? '#eab308' : '#22c55e';
    }
    if (txt.current) txt.current.textContent = c.toFixed(2);
  });
  return (
    <div>
      <div className="relative h-3 rounded bg-black border border-slate-800">
        <div ref={bar} className="absolute top-0 bottom-0" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500" />
      </div>
      <div className="flex justify-between text-[11px] text-slate-500"><span>−1 (out of phase)</span><span ref={txt} className="text-slate-200 font-mono">0.00</span><span>+1 (mono)</span></div>
    </div>
  );
}

export function MetersPage() {
  useEngineVersion();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [target, setTarget] = useState(-14);
  const [kScale, setK] = useState<14 | 20>(14);
  const [hold, setHold] = useState(true);
  const [source, setSource] = useState('master');
  const m = audioEngine.meters;
  const big = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const r = m.reading;
    const el = big.current;
    if (!el) return;
    const set = (k: string, v: string, cls?: string) => {
      const n = el.querySelector<HTMLElement>(`[data-m="${k}"]`);
      if (n && n.textContent !== v) n.textContent = v;
      if (n && cls) n.className = cls;
    };
    set('m', fmt(r.momentary));
    set('s', fmt(r.shortTerm));
    set('i', fmt(r.integrated), `text-3xl font-black font-mono ${!Number.isFinite(r.integrated) ? 'text-slate-500' : Math.abs(r.integrated - target) <= 1 ? 'text-emerald-400' : r.integrated > target ? 'text-red-400' : 'text-amber-300'}`);
    set('lra', Number.isFinite(r.integrated) ? fmt(r.lra) : '—');
    const tp = gainToDb(r.truePeakMax);
    set('tp', fmt(tp), `text-xl font-black font-mono ${tp > -1 ? 'text-red-400' : 'text-slate-100'}`);
    set('plr', Number.isFinite(r.integrated) && r.truePeakMax > 0 ? (tp - r.integrated).toFixed(1) : '—');
    const pk = gainToDb(Math.max(r.peakL, r.peakR));
    const rms = gainToDb(Math.max(r.rmsL, r.rmsR));
    set('crest', Number.isFinite(pk - rms) && rms > -90 ? (pk - rms).toFixed(1) : '—');
    set('k', rms > -90 ? (rms + kScale).toFixed(1) : '—');
  });

  const chooseSource = (v: string) => {
    setSource(v);
    if (v === 'master') m.setSource(audioEngine.masterTap, 'Master');
    else if (v === 'input') m.setSource(audioEngine.recorder.input.gain, 'Input');
    else {
      const strip = audioEngine.mixer.strips.get(v);
      if (strip) m.setSource(strip.postTap, audioEngine.mixer.settingsOf(v)?.name ?? 'Channel');
    }
    tick();
  };

  return (
    <div ref={big} className="flex-1 min-h-0 overflow-auto p-3 bg-[#070a10] text-slate-200 text-[11px]" data-testid="meters-page">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[13px] font-black text-white">Meters</h2>
        <span className="text-slate-500">ITU-R BS.1770-4 / EBU R128 loudness, 4× true peak</span>
        <div className="flex-1" />
        <label className="flex items-center gap-1">Source
          <Sel value={source} onChange={chooseSource} options={[{ value: 'master', label: 'Master' }, { value: 'input', label: 'Recording input' }, ...audioEngine.mixer.channels().map((c) => ({ value: c.id, label: c.settings.name }))]} />
        </label>
        <label className="flex items-center gap-1">Target
          <Sel value={String(target)} onChange={(v) => setTarget(Number(v))} options={TARGETS.map((t) => ({ value: String(t.v), label: `${t.l} LUFS` }))} />
        </label>
        <Btn onClick={() => m.reset()} title="Restart integrated loudness, LRA and the true-peak hold">Reset</Btn>
      </div>
      <div className="grid grid-cols-[minmax(520px,1.4fr)_minmax(320px,1fr)] gap-3">
        <div className="flex flex-col gap-3">
          <Panel title={`Loudness · ${m.sourceLabel}`}>
            <div className="grid grid-cols-6 gap-2 items-end">
              <div><div className="text-[11px] text-slate-500">MOMENTARY</div><div data-m="m" className="text-xl font-black font-mono">—</div><div className="text-[11px] text-slate-500">LUFS · 400 ms</div></div>
              <div><div className="text-[11px] text-slate-500">SHORT-TERM</div><div data-m="s" className="text-xl font-black font-mono">—</div><div className="text-[11px] text-slate-500">LUFS · 3 s</div></div>
              <div><div className="text-[11px] text-slate-500">INTEGRATED</div><div data-m="i" className="text-3xl font-black font-mono">—</div><div className="text-[11px] text-slate-500">LUFS · target {target}</div></div>
              <div><div className="text-[11px] text-slate-500">RANGE (LRA)</div><div data-m="lra" className="text-xl font-black font-mono">—</div><div className="text-[11px] text-slate-500">LU</div></div>
              <div><div className="text-[11px] text-slate-500">TRUE PEAK MAX</div><div data-m="tp" className="text-xl font-black font-mono">—</div><div className="text-[11px] text-slate-500">dBTP</div></div>
              <div><div className="text-[11px] text-slate-500">PLR · CREST</div><div className="text-lg font-black font-mono"><span data-m="plr">—</span> · <span data-m="crest">—</span></div><div className="text-[11px] text-slate-500">dB</div></div>
            </div>
            <div className="mt-2"><History target={target} /></div>
          </Panel>
          <Panel title="Spectrum analyzer (FFT 8192)" right={<Btn on={hold} onClick={() => setHold((v) => !v)}>Peak hold</Btn>}>
            <Spectrum hold={hold} />
          </Panel>
          <Panel title="Spectrogram"><Spectrogram /></Panel>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Peak / RMS · K-meter · VU">
            <div className="flex items-end gap-4">
              <StereoMeter read={() => ({ peakL: m.reading.peakL, peakR: m.reading.peakR, rmsL: m.reading.rmsL, rmsR: m.reading.rmsR })} height={170} width={26} />
              <div className="flex flex-col gap-2">
                <div className="flex gap-2"><VuNeedle side={0} /><VuNeedle side={1} /></div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">K-{kScale}</span>
                  <span data-m="k" className="font-mono text-lg">—</span>
                  <Btn on={kScale === 14} onClick={() => setK(14)}>K-14</Btn>
                  <Btn on={kScale === 20} onClick={() => setK(20)}>K-20</Btn>
                </div>
                <span className="text-[11px] text-slate-500">VU: 0 VU = −18 dBFS RMS · K-meter: RMS + {kScale} dB</span>
              </div>
            </div>
          </Panel>
          <Panel title="Stereo: correlation & vectorscope">
            <Correlation />
            <div className="flex justify-center mt-2"><Vectorscope /></div>
          </Panel>
          <Panel title="Oscilloscope (L green, R blue)"><Scope /></Panel>
        </div>
      </div>
    </div>
  );
}
