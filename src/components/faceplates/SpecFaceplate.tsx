/**
 * Front panel for spec-driven devices (Reason lineup + hardware emulations), drawn from the
 * device spec: finish, wordmark, knob style, display and a layout per engine —
 *  drums: per-instrument columns (Tune / Decay / Tone / Level) + trigger pads,
 *  groove: 4×4 pads (click = play, Shift-click / drop = load sample) + selected-pad editor,
 *  mixer: channel strips + master, patchbay: routing panel, players: target selector,
 *  everything else: parameter sections.
 * Displays animate in requestAnimationFrame (DOM / canvas writes only).
 */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Upload, Play } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import type { SpecDevice } from '../../audio/spec/SpecDevice.ts';
import { paramDef, type DeviceSpec, type ParamDef } from '../../../shared/rack/devices/index.ts';
import { SHIPPED_PACKS } from '../../../shared/instruments/packs.ts';
import { packStatus } from '../../audio/spec/engines/multisample.ts';
import { automateMenuAt } from '../AutomateMenu.tsx';
import { SpecControl, SpecKnob } from './specKnob.tsx';
import { setText, setWidth } from '../../ui/skin/dom.ts';

interface Props {
  device: SpecDevice;
  onUpdate: () => void;
}

const FINISH: Record<string, (c: string) => string> = {
  brushed: (c) => `repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 3px), linear-gradient(180deg, ${c}, #2b2e33)`,
  black: (c) => `linear-gradient(180deg, ${c}, #050505)`,
  wood: (c) => `linear-gradient(180deg, ${c}, #0a0a0a)`,
  cream: (c) => `linear-gradient(180deg, ${c}, #d6ccb4)`,
  white: (c) => `linear-gradient(180deg, ${c}, #cfcfcf)`,
  gloss: (c) => `linear-gradient(180deg, rgba(255,255,255,0.15), transparent 40%), ${c}`,
  retro: (c) => `repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 6px), linear-gradient(180deg, ${c}, #140c06)`,
};
const background = (spec: DeviceSpec) => (FINISH[spec.panel.finish] ?? ((c: string) => `linear-gradient(180deg, ${c}, rgba(0,0,0,0.85))`))(spec.panel.color);

const WOOD = 'linear-gradient(90deg, #4a2a12, #7a4a24 40%, #5a3418)';

export const SpecFaceplate: React.FC<Props> = ({ device, onUpdate }) => {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const spec = device.spec;
  const accent = spec.panel.accent;
  const text = spec.panel.text ?? '#f2f2f2';
  const knob = spec.panel.knob ?? 'cap';
  useEffect(() => device.subscribe(force), [device]);

  const val = (k: string) => {
    const v = device.params[k];
    return typeof v === 'number' ? v : paramDef(spec, k)?.default ?? 0;
  };
  const set = (k: string, v: number) => {
    device.setParam(k, v);
    force();
  };
  const ctl = (def: ParamDef, size = 38) =>
    def.control === undefined && !def.options ? (
      <SpecKnob
        key={def.key}
        def={def}
        value={val(def.key)}
        onChange={(v) => set(def.key, v)}
        style={knob}
        accent={accent}
        text={text}
        size={size}
        onMenu={(e) => automateMenuAt(e, `${device.name} · ${def.label}`, { kind: 'device', deviceId: device.id, param: def.key })}
      />
    ) : (
      <SpecControl key={def.key} def={def} value={val(def.key)} onChange={(v) => set(def.key, v)} style={knob} accent={accent} text={text} />
    );

  const body = (() => {
    switch (spec.engine) {
      case 'drums':
        return <DrumsPanel device={device} ctl={ctl} accent={accent} text={text} />;
      case 'groove':
        return <GroovePanel device={device} ctl={ctl} accent={accent} text={text} />;
      case 'mixer':
        return <MixerPanel device={device} ctl={ctl} text={text} />;
      case 'patchbay':
        return <PatchbayPanel device={device} ctl={ctl} accent={accent} text={text} />;
      case 'multisample':
        return <PackPanel device={device} ctl={ctl} accent={accent} text={text} />;
      default:
        return <Sections spec={spec} ctl={ctl} text={text} exclude={new Set()} />;
    }
  })();

  return (
    <div
      className="relative flex-1 flex flex-col min-h-0 font-sans"
      style={{ background: background(spec), color: text, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 6px rgba(0,0,0,0.5)' }}
      data-testid="spec-faceplate"
      data-device-type={spec.type}
    >
      {spec.panel.finish === 'wood' && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-3" style={{ background: WOOD }} />
          <div className="absolute right-0 top-0 bottom-0 w-3" style={{ background: WOOD }} />
        </>
      )}
      <div className={`flex items-center gap-3 px-4 pt-1.5 pb-1 ${spec.panel.finish === 'wood' ? 'mx-3' : ''}`}>
        <div className="flex flex-col leading-none">
          <span className="font-black tracking-wider text-[13px]" style={{ color: text, fontFamily: spec.family === 'hardware' ? 'ui-sans-serif, system-ui' : 'ui-monospace, monospace' }}>
            {spec.panel.logo ?? spec.short}
          </span>
          <span className="text-[11px] opacity-75 mt-0.5" style={{ color: text }}>
            {spec.panel.tagline ?? spec.name}
          </span>
        </div>
        {spec.engine === 'multisample' ? (
          <span
            className="text-[11px] font-bold px-1.5 py-0.5 rounded border"
            style={{ borderColor: `${accent}88`, color: accent }}
            title="Real recordings (multisampled instrument pack)"
          >
            RECORDED SAMPLES
          </span>
        ) : (
          <span
            className="text-[11px] font-bold px-1.5 py-0.5 rounded border"
            style={{ borderColor: `${accent}88`, color: accent }}
            title="Modelled with Web Audio in this app — not the manufacturer's code or samples"
          >
            WEB AUDIO MODEL
          </span>
        )}
        {spec.kind === 'player' && <PlayerTarget device={device} onChanged={onUpdate} accent={accent} text={text} />}
        <div className="flex-1" />
        <Display device={device} accent={accent} text={text} set={set} val={val} />
        {spec.kind === 'instrument' && spec.engine !== 'drums' && spec.engine !== 'groove' && !spec.pads?.length && (
          <TestNote device={device} accent={accent} />
        )}
        {(spec.engine === 'sampler' || spec.engine === 'granular' || spec.engine === 'loops') && <SampleLoader device={device} accent={accent} text={text} />}
      </div>
      <div className={`flex-1 min-h-0 px-3 pb-2 ${spec.panel.finish === 'wood' ? 'mx-3' : ''}`}>{body}</div>
    </div>
  );
};

type Ctl = (def: ParamDef, size?: number) => React.ReactNode;

const Sections: React.FC<{ spec: DeviceSpec; ctl: Ctl; text: string; exclude: Set<string> }> = ({ spec, ctl, text, exclude }) => {
  const groups = new Map<string, ParamDef[]>();
  for (const p of spec.params) {
    if (exclude.has(p.key)) continue;
    const s = p.section ?? 'Main';
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s)!.push(p);
  }
  return (
    <div className="flex flex-wrap gap-1.5 items-stretch">
      {[...groups.entries()].map(([title, params]) => (
        <section key={title} className="rounded-md px-2 py-1 bg-black/25 border border-black/40 flex flex-col">
          <h4 className="text-[11px] font-black uppercase tracking-widest opacity-80 mb-0.5" style={{ color: text }}>
            {title}
          </h4>
          <div className="flex flex-wrap items-end gap-1">{params.map((p) => ctl(p))}</div>
        </section>
      ))}
    </div>
  );
};

// ------------------------------------------------------------------ displays

const Display: React.FC<{ device: SpecDevice; accent: string; text: string; set: (k: string, v: number) => void; val: (k: string) => number }> = ({ device, accent, text, set, val }) => {
  const kind = device.spec.panel.display ?? 'none';
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  const label = useRef<HTMLSpanElement | null>(null);
  const needle = useRef<SVGLineElement | null>(null);
  const leds = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (kind === 'none' || kind === 'pads' || kind === 'xy') return;
    let raf = 0;
    const buf = new Float32Array(device.analyser.fftSize);
    let vu = 0;
    let lastAngle = '';
    let lastStep = -2;
    let quiet = 0;
    const tick = () => {
      const m = device.meter();
      if (kind === 'scope' && canvas.current) {
        const c = canvas.current.getContext('2d');
        device.analyser.getFloatTimeDomainData(buf);
        let loud = false;
        for (let i = 0; i < buf.length; i += 16) if (Math.abs(buf[i]) > 0.001) loud = true;
        quiet = loud ? 0 : quiet + 1;
        // a silent scope is drawn flat once, then left alone
        if (c && quiet < 3) {
          const w = canvas.current.width;
          const h = canvas.current.height;
          c.fillStyle = 'rgba(0,0,0,0.85)';
          c.fillRect(0, 0, w, h);
          c.strokeStyle = accent;
          c.lineWidth = 1.2;
          c.beginPath();
          for (let i = 0; i < buf.length; i += 4) {
            const x = (i / buf.length) * w;
            const y = h / 2 - buf[i] * h * 0.45;
            if (i) c.lineTo(x, y);
            else c.moveTo(x, y);
          }
          c.stroke();
        }
      } else if (kind === 'gr' && bar.current) {
        const gr = Math.min(24, Math.abs(m.gr ?? 0));
        setWidth(bar.current, (gr / 24) * 100);
        setText(label.current, `GR ${gr.toFixed(1)} dB`);
      } else if ((kind === 'vu' || kind === 'meter') && (needle.current || bar.current)) {
        device.analyser.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const db = 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-6);
        const gr = Math.abs(m.gr ?? 0);
        // VU shows gain reduction when the unit reports it (like a compressor's GR mode)
        const target = device.spec.engine === 'dynamics' ? Math.max(0, 1 - gr / 20) : Math.max(0, Math.min(1, (db + 30) / 33));
        vu += (target - vu) * 0.2;
        const angle = `rotate(${(-50 + vu * 100).toFixed(1)} 40 34)`;
        if (needle.current && angle !== lastAngle) {
          lastAngle = angle;
          needle.current.setAttribute('transform', angle);
        }
        setWidth(bar.current, vu * 100);
      } else if (kind === 'steps' && leds.current) {
        const step = m.step ?? (audioEngine.isPlaying ? audioEngine.songPosition % 16 : -1);
        if (step !== lastStep) {
          lastStep = step;
          Array.from(leds.current.children).forEach((el, i) => ((el as HTMLElement).style.opacity = i === step ? '1' : '0.25'));
        }
      } else if (kind === 'lcd' && label.current) {
        const v = m.voices ?? m.loaded;
        setText(label.current, `${device.spec.short}${v !== undefined ? ` · ${Math.round(v)}${m.voices !== undefined ? ' vc' : ''}` : ''}`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [device, kind, accent]);

  if (kind === 'scope') return <canvas ref={canvas} width={150} height={44} className="rounded border border-black/60" />;
  if (kind === 'gr' || kind === 'meter')
    return (
      <div className="w-36 flex flex-col gap-0.5">
        <div className="h-2 rounded bg-black/70 overflow-hidden border border-black/60">
          <div ref={bar} className="h-full" style={{ width: '0%', background: kind === 'gr' ? '#ffb02e' : accent, marginLeft: kind === 'gr' ? 'auto' : undefined }} />
        </div>
        <span ref={label} className="text-[11px] font-mono" style={{ color: text }}>
          {kind === 'gr' ? 'GR 0.0 dB' : 'LEVEL'}
        </span>
      </div>
    );
  if (kind === 'vu')
    return (
      <svg width={80} height={44} className="rounded border border-black/60" style={{ background: '#f3e6b8' }} aria-label="VU meter">
        <path d="M 8 30 A 34 34 0 0 1 72 30" stroke="#333" fill="none" strokeWidth={1} />
        <path d="M 58 16 A 34 34 0 0 1 72 30" stroke="#c0392b" fill="none" strokeWidth={2} />
        <text x={40} y={42} fontSize={6} textAnchor="middle" fill="#333">
          VU
        </text>
        <line ref={needle} x1={40} y1={34} x2={40} y2={6} stroke="#111" strokeWidth={1} transform="rotate(-50 40 34)" />
      </svg>
    );
  if (kind === 'steps')
    return (
      <div ref={leds} className="flex gap-0.5">
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} className="w-2 h-2 rounded-full" style={{ background: i % 4 === 0 ? accent : '#ff4b4b', opacity: 0.25 }} />
        ))}
      </div>
    );
  if (kind === 'lcd')
    return (
      <span ref={label} className="px-2 py-1 rounded font-mono text-[11px] min-w-[120px]" style={{ background: '#0d1f12', color: '#7dff9b', border: '1px solid #000' }}>
        {device.spec.short}
      </span>
    );
  if (kind === 'xy') return <XyPad accent={accent} x={val('mixAB')} y={val('posA')} onChange={(x, y) => { set('mixAB', x); set('posA', y); }} />;
  return null;
};

const XyPad: React.FC<{ accent: string; x: number; y: number; onChange: (x: number, y: number) => void }> = ({ accent, x, y, onChange }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)));
  };
  return (
    <div
      ref={ref}
      className="relative w-20 h-14 rounded border border-black/60 bg-black/60 cursor-crosshair touch-none"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      title="X = layer morph, Y = index"
      role="group"
      aria-label="XY morph pad"
    >
      <span className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 translate-y-1/2" style={{ left: `${x * 100}%`, bottom: `${y * 100}%`, background: accent, boxShadow: `0 0 8px ${accent}` }} />
    </div>
  );
};

const TestNote: React.FC<{ device: SpecDevice; accent: string }> = ({ device, accent }) => (
  <button
    type="button"
    className="px-2 py-1 rounded text-[11px] font-black flex items-center gap-1 border border-black/50"
    style={{ background: accent, color: '#111' }}
    onPointerDown={() => {
      void audioEngine.resumeContext();
      [60, 64, 67].forEach((n) => audioEngine.liveNoteOn(device, n, 0.8));
    }}
    onPointerUp={() => [60, 64, 67].forEach((n) => audioEngine.liveNoteOff(device, n))}
    onPointerLeave={(e) => e.buttons && [60, 64, 67].forEach((n) => audioEngine.liveNoteOff(device, n))}
    title="Hold to play a C major chord (goes through any players on this instrument)"
  >
    <Play className="w-3 h-3" /> TEST
  </button>
);

const SampleLoader: React.FC<{ device: SpecDevice; accent: string; text: string }> = ({ device, accent, text }) => {
  const input = useRef<HTMLInputElement | null>(null);
  const slots = device.spec.engine === 'loops' ? 8 : device.spec.engineConfig?.zones ? 8 : 1;
  const [slot, setSlot] = useState(0);
  const names = device.engine.sampleNames?.() ?? {};
  return (
    <div className="flex items-center gap-1">
      {slots > 1 && (
        <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} className="text-[11px] bg-black/60 rounded px-1" style={{ color: text }} aria-label="Sample slot">
          {Array.from({ length: slots }, (_, i) => (
            <option key={i} value={i}>
              {device.spec.engine === 'loops' ? `Slot ${i + 1}` : `Zone C${i + 1}`}
              {names[i] ? ` · ${names[i]}` : ''}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="px-1.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 border"
        style={{ borderColor: accent, color: accent }}
        title="Load your own sample (WAV / MP3 / OGG / FLAC)"
      >
        <Upload className="w-3 h-3" /> {names[slot] ? names[slot].slice(0, 14) : 'LOAD'}
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void device.loadSampleFile(slot, f);
          e.target.value = '';
        }}
      />
    </div>
  );
};

const PlayerTarget: React.FC<{ device: SpecDevice; onChanged: () => void; accent: string; text: string }> = ({ device, onChanged, accent, text }) => {
  const instruments = Array.from(audioEngine.devices.values()).filter((d) => audioEngine.isPlayableInstrument(d.type));
  return (
    <label className="flex items-center gap-1 text-[11px] font-bold" style={{ color: text }}>
      PLAYS
      <select
        value={device.target ?? ''}
        onChange={(e) => {
          audioEngine.setPlayerTarget(device.id, e.target.value || null);
          onChanged();
        }}
        className="bg-black/60 rounded px-1 py-0.5 border"
        style={{ borderColor: accent, color: text }}
        aria-label="Instrument this player controls"
        data-testid="player-target"
      >
        <option value="">— none —</option>
        {instruments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );
};

// ------------------------------------------------------------------ layouts

const padFlash = (device: SpecDevice, ref: React.RefObject<HTMLDivElement | null>, accent: string) => {
  let raf = 0;
  let last = -1;
  let lastAt = -1;
  const tick = () => {
    const m = device.meter();
    if (ref.current && m.lastPad !== undefined && (m.lastPad !== last || m.lastAt !== lastAt)) {
      const now = device.ctx.currentTime;
      const delay = Math.max(0, (m.lastAt ?? now) - now) * 1000;
      const idx = m.lastPad;
      last = idx;
      lastAt = m.lastAt ?? 0;
      window.setTimeout(() => {
        const el = ref.current?.children[idx] as HTMLElement | undefined;
        if (!el) return;
        el.style.boxShadow = `0 0 12px ${accent}`;
        window.setTimeout(() => (el.style.boxShadow = ''), 110);
      }, delay);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
};

/** Recorded instrument pack: load status + credits, the sections, and per-pad strips on kits. */
const PackPanel: React.FC<{ device: SpecDevice; ctl: Ctl; accent: string; text: string }> = ({ device, ctl, accent, text }) => {
  const spec = device.spec;
  const id = String(spec.engineConfig?.pack ?? '');
  const entry = SHIPPED_PACKS.find((p) => p.id === id);
  const pads = spec.pads ?? [];
  const padsRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => padFlash(device, padsRef, accent), [device, accent]);
  useEffect(() => {
    // loading progress is written to the DOM, not React state
    let raf = 0;
    const tick = () => {
      const st = packStatus(id);
      if (statusRef.current)
        statusRef.current.textContent = st?.error
          ? `Could not load: ${st.error}`
          : !st || st.progress < 1
            ? `Loading samples ${Math.round((st?.progress ?? 0) * 100)}%`
            : `${st.samples} samples ready`;
      if (!st || (st.progress < 1 && !st.error)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id]);
  const exclude = new Set(spec.params.filter((p) => p.section === 'Pads').map((p) => p.key));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px]" style={{ color: text }}>
        <span ref={statusRef} className="font-mono font-bold" style={{ color: accent }} data-testid="pack-status">
          Loading samples
        </span>
        {entry && (
          <a href={entry.source} target="_blank" rel="noreferrer" className="opacity-75 hover:opacity-100 underline-offset-2 hover:underline truncate" title={entry.source}>
            {entry.author} · {entry.spdx}
          </a>
        )}
      </div>
      <Sections spec={spec} ctl={ctl} text={text} exclude={exclude} />
      {pads.length > 0 && (
        <div ref={padsRef} className="flex gap-1 overflow-x-auto pb-1">
          {pads.map((pad, i) => (
            <section key={pad.name + i} className="rounded-md px-1 py-1 bg-black/25 border border-black/40 flex flex-col items-center flex-shrink-0" style={{ minWidth: 58 }}>
              <button
                type="button"
                className="w-full px-1 py-1.5 rounded text-[11px] font-black border border-black/60 truncate"
                style={{ background: 'rgba(0,0,0,0.45)', color: text }}
                onPointerDown={(e) => {
                  void audioEngine.resumeContext();
                  // click height = velocity (top = hard)
                  const r = e.currentTarget.getBoundingClientRect();
                  audioEngine.liveNoteOn(device, pad.note, Math.max(0.25, Math.min(1, 1.15 - (e.clientY - r.top) / r.height)));
                }}
                title={`${pad.name} — note ${pad.note} (click higher = harder)`}
              >
                {pad.name}
              </button>
              {(['Level', 'Tune', 'Decay'] as const).map((k) => {
                const def = paramDef(spec, `p${i + 1}${k}`);
                return def ? ctl(def, 24) : null;
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

const DrumsPanel: React.FC<{ device: SpecDevice; ctl: Ctl; accent: string; text: string }> = ({ device, ctl, accent, text }) => {
  const spec = device.spec;
  const pads = spec.pads ?? [];
  const padsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => padFlash(device, padsRef, accent), [device, accent]);
  const machine = spec.params.filter((p) => p.section === 'Machine' || p.section === 'Output');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5 items-stretch overflow-x-auto pb-1">
        <section className="rounded-md px-2 py-1 bg-black/25 border border-black/40 flex flex-wrap gap-1 items-end flex-shrink-0">
          {machine.map((p) => ctl(p, 36))}
        </section>
        {pads.map((pad, i) => (
          <section key={pad.name + i} className="rounded-md px-1 py-1 bg-black/25 border border-black/40 flex flex-col items-center flex-shrink-0" style={{ minWidth: 56 }}>
            <span className="text-[11px] font-black uppercase truncate max-w-[60px]" style={{ color: accent }} title={pad.name}>
              {pad.name}
            </span>
            {(['Tune', 'Decay', 'Tone', 'Level'] as const).map((k) => {
              const def = paramDef(spec, `p${i + 1}${k}`);
              return def ? ctl(def, 26) : null;
            })}
          </section>
        ))}
      </div>
      <div ref={padsRef} className="flex flex-wrap gap-1">
        {pads.map((pad, i) => (
          <button
            key={pad.name + i}
            type="button"
            className="px-2 py-1.5 rounded text-[11px] font-black border border-black/60"
            style={{ background: 'rgba(0,0,0,0.45)', color: text, minWidth: 64 }}
            onPointerDown={() => {
              void audioEngine.resumeContext();
              audioEngine.liveNoteOn(device, pad.note, 0.95);
            }}
            title={`${pad.name} — note ${pad.note}`}
          >
            {pad.name}
          </button>
        ))}
      </div>
    </div>
  );
};

const GroovePanel: React.FC<{ device: SpecDevice; ctl: Ctl; accent: string; text: string }> = ({ device, ctl, accent, text }) => {
  const spec = device.spec;
  const pads = spec.pads ?? [];
  const [sel, setSel] = useState(0);
  const padsRef = useRef<HTMLDivElement | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => padFlash(device, padsRef, accent), [device, accent]);
  const names = device.engine.sampleNames?.() ?? {};
  const cols = pads.length > 12 ? 4 : pads.length > 8 ? 4 : pads.length;
  const exclude = new Set(spec.params.filter((p) => /^p\d+/.test(p.key)).map((p) => p.key));
  const load = (i: number, f: File) => {
    void device.loadSampleFile(i, f).then(force);
  };
  return (
    <div className="flex gap-2 items-start">
      <div>
        <div ref={padsRef} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 52px)` }}>
          {/* MPC layout: pad 1 bottom-left → render rows bottom-up */}
          {pads.map((pad, i) => {
            const row = Math.floor(i / cols);
            const rows = Math.ceil(pads.length / cols);
            const order = (rows - 1 - row) * cols + (i % cols);
            return (
              <button
                key={pad.name + i}
                type="button"
                style={{ order, background: i === sel ? `${accent}55` : 'rgba(10,10,10,0.75)', color: text, height: 44 }}
                className="rounded-md border border-black/70 text-[11px] font-bold flex flex-col items-center justify-center leading-tight shadow-inner"
                onPointerDown={(e) => {
                  setSel(i);
                  if (e.shiftKey) {
                    file.current!.dataset.pad = String(i);
                    file.current!.click();
                    return;
                  }
                  void audioEngine.resumeContext();
                  audioEngine.liveNoteOn(device, pad.note, 0.6 + 0.4 * Math.min(1, (e.nativeEvent.offsetY ?? 22) / 44));
                }}
                onPointerUp={() => audioEngine.liveNoteOff(device, pad.note)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) load(i, f);
                }}
                title={`Pad ${i + 1}: ${names[i] ?? pad.name} (note ${pad.note}) — Shift-click or drop a file to load your own sample`}
                data-testid="groove-pad"
              >
                <span>{names[i] ? names[i].slice(0, 8) : pad.name}</span>
                <span className="opacity-60 font-mono">{i + 1}</span>
              </button>
            );
          })}
        </div>
        <input
          ref={file}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) load(Number(e.target.dataset.pad ?? 0), f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <section className="rounded-md px-2 py-1 bg-black/25 border border-black/40">
          <h4 className="text-[11px] font-black uppercase tracking-widest opacity-80 mb-0.5">
            Pad {sel + 1}: {names[sel] ?? pads[sel]?.name}
          </h4>
          <div className="flex flex-wrap gap-1 items-end">
            {(['Tune', 'Decay', 'Tone', 'Level', 'Pan'] as const).map((k) => {
              const def = paramDef(spec, `p${sel + 1}${k}`);
              return def ? ctl(def, 34) : null;
            })}
            <button
              type="button"
              className="px-1.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 border self-center"
              style={{ borderColor: accent, color: accent }}
              onClick={() => {
                file.current!.dataset.pad = String(sel);
                file.current!.click();
              }}
            >
              <Upload className="w-3 h-3" /> LOAD SAMPLE
            </button>
          </div>
        </section>
        <Sections spec={spec} ctl={ctl} text={text} exclude={exclude} />
      </div>
    </div>
  );
};

const MixerPanel: React.FC<{ device: SpecDevice; ctl: Ctl; text: string }> = ({ device, ctl, text }) => {
  const spec = device.spec;
  const channels = Number(spec.engineConfig?.channels ?? 6);
  const master = spec.params.filter((p) => !/^ch\d+/.test(p.key));
  return (
    <div className="flex gap-1 items-stretch overflow-x-auto pb-1">
      {Array.from({ length: channels }, (_, i) => {
        const k = i + 1;
        const defs = spec.params.filter((p) => new RegExp(`^ch${k}[A-Z]`).test(p.key));
        const fader = defs.find((p) => p.key === `ch${k}Level`);
        const rest = defs.filter((p) => p !== fader);
        return (
          <section key={k} className="rounded px-1 py-1 bg-black/25 border border-black/40 flex flex-col items-center gap-0.5 flex-shrink-0" style={{ minWidth: 52 }}>
            <span className="text-[11px] font-black" style={{ color: text }}>
              {spec.ports?.inLabels?.[i] ?? `CH ${k}`}
            </span>
            {rest.map((p) => ctl(p, 24))}
            {fader && ctl(fader)}
          </section>
        );
      })}
      <section className="rounded px-2 py-1 bg-black/40 border border-black/50 flex flex-col items-center gap-1 flex-shrink-0">
        <span className="text-[11px] font-black" style={{ color: text }}>
          MASTER
        </span>
        <div className="flex flex-wrap gap-1 items-end justify-center max-w-[220px]">{master.map((p) => ctl(p, 32))}</div>
      </section>
    </div>
  );
};

const PatchbayPanel: React.FC<{ device: SpecDevice; ctl: Ctl; accent: string; text: string }> = ({ device, ctl, accent, text }) => {
  const spec = device.spec;
  const [, force] = useReducer((x: number) => x + 1, 0);
  const mode = paramDef(spec, 'mode');
  const routes = spec.params.filter((p) => p.key.startsWith('route'));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        {mode && ctl(mode)}
        <span className="text-[11px] opacity-75" style={{ color: text }}>
          Rear inputs feed the outputs below; choose another input to front-patch it.
        </span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${routes.length}, minmax(64px, 1fr))` }}>
        {routes.map((r, i) => (
          <div key={r.key} className="flex flex-col items-center gap-0.5 rounded bg-black/30 border border-black/50 py-1">
            <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: accent, background: '#111' }} title={`Top jack: In ${i + 1}`} />
            <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: '#999', background: '#111' }} title={`Bottom jack: Out ${i + 1}`} />
            <select
              value={Math.round(Number(device.params[r.key] ?? 0))}
              onChange={(e) => {
                device.setParam(r.key, Number(e.target.value));
                force();
              }}
              className="text-[11px] bg-black/60 rounded px-0.5 max-w-full"
              style={{ color: text }}
              aria-label={`Source for output ${i + 1}`}
            >
              {r.options!.map((o, k) => (
                <option key={o} value={k}>
                  {o === 'Normal' ? `In ${i + 1} (normal)` : o}
                </option>
              ))}
            </select>
            <span className="text-[11px] font-mono" style={{ color: text }}>
              OUT {i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

