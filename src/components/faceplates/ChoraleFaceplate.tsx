/**
 * Chorale Vocal Ensemble — a bespoke hardware panel instead of the generic spec grid.
 * Cream enamel, walnut rails, brass hardware, a real vowel dial and a modelled formant field.
 */
import React, { useEffect, useReducer, useRef } from 'react';
import type { SpecDevice } from '../../audio/spec/SpecDevice.ts';
import { paramDef, type ParamDef } from '../../../shared/rack/devices/index.ts';
import { scheduleAudition } from '../../audio/audition.ts';
import { useDeviceAutomation } from '../../nexa/useEngine.ts';
import { automateMenuAt } from '../AutomateMenu.tsx';
import { SpecKnob } from './specKnob.tsx';

const INK = '#2b1d22';
const MUTED = '#73545a';
const ACCENT = '#8f3b4e';
const GOLD = '#b68a51';
const CREAM_TOP = '#f4ead7';
const CREAM_BOTTOM = '#c9b89c';
const VOWELS = ['A', 'E', 'I', 'O', 'U'] as const;

/** First three formant centres (Hz) for the five vowel positions. */
const FORMANTS: readonly (readonly [number, number, number])[] = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [270, 2290, 3010],
  [570, 840, 2410],
  [300, 870, 2240],
];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const PANEL_BG = [
  'radial-gradient(115% 80% at 50% 0%, rgba(255,255,255,0.58), transparent 58%)',
  'repeating-linear-gradient(90deg, rgba(74,47,30,0.028) 0 1px, transparent 1px 4px)',
  `linear-gradient(180deg, ${CREAM_TOP} 0%, #e4d7c0 54%, ${CREAM_BOTTOM} 100%)`,
].join(', ');

const WOOD = [
  'repeating-linear-gradient(90deg, rgba(0,0,0,0.24) 0 1px, transparent 1px 4px)',
  'linear-gradient(180deg, #3b2416, #1a0f0a 55%, #2b1a10)',
].join(', ');

const FACE_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -12px 22px rgba(58,34,18,0.22), 0 1px 0 rgba(255,255,255,0.25)';

interface Props {
  device: SpecDevice;
  onUpdate: () => void;
}

const Screw: React.FC<{ className: string }> = ({ className }) => (
  <span
    aria-hidden="true"
    className={`absolute z-20 h-2.5 w-2.5 rounded-full ${className}`}
    style={{
      background: 'radial-gradient(circle at 35% 30%, #f4dfb8 0%, #b58a50 46%, #4e351d 100%)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.65), 0 1px 2px rgba(0,0,0,0.5)',
    }}
  >
    <span className="absolute left-1/2 top-1/2 h-px w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#4d341e]" />
  </span>
);

const Section: React.FC<{ title: string; className?: string; children: React.ReactNode }> = ({ title, className = '', children }) => (
  <div className={`relative min-w-0 border-t border-[#7d674e]/45 pt-0.5 ${className}`}>
    <div className="mb-0.5 flex items-center gap-1 text-[11px] font-mono font-bold uppercase leading-none tracking-[0.16em]" style={{ color: MUTED }}>
      <span className="h-1 w-1 rounded-full" style={{ background: GOLD }} />
      {title}
    </div>
    <div className="flex items-start justify-between gap-0.5">{children}</div>
  </div>
);

const VowelDial: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const n = clamp(value, 0, 4);
  const angle = -135 + (n / 4) * 270;
  const active = clamp(Math.round(n), 0, 4);
  const point = (a: number, radius: number): [number, number] => [
    38 + radius * Math.sin((a * Math.PI) / 180),
    38 - radius * Math.cos((a * Math.PI) / 180),
  ];
  const arc = (radius: number) => {
    const [x1, y1] = point(-135, radius);
    const [x2, y2] = point(135, radius);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}`;
  };
  const setFromPointer = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + (38 / 80) * rect.height);
    const degrees = Math.atan2(dx, -dy) * (180 / Math.PI);
    onChange(((clamp(degrees, -135, 135) + 135) / 270) * 4);
  };
  const step = (delta: number) => onChange(clamp(n + delta, 0, 4));

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Vowel morph"
      aria-valuemin={0}
      aria-valuemax={4}
      aria-valuenow={Number(n.toFixed(2))}
      aria-valuetext={VOWELS[active]}
      className="relative h-[80px] w-[76px] shrink-0 cursor-ns-resize touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-[#8f3b4e]/70"
      title="Vowel morph: A–E–I–O–U"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromPointer(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (dragging.current) setFromPointer(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onDoubleClick={() => onChange(0)}
      onWheel={(event) => {
        event.preventDefault();
        step(event.deltaY > 0 ? -0.2 : 0.2);
      }}
      onKeyDown={(event) => {
        const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 0.25 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -0.25 : 0;
        if (event.key === 'Home') onChange(0);
        else if (event.key === 'End') onChange(4);
        else if (delta) step(delta);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <svg width={76} height={76} viewBox="0 0 76 76" aria-hidden="true">
        <defs>
          <radialGradient id="chorale-cap" cx="35%" cy="25%" r="80%">
            <stop offset="0%" stopColor="#5c2735" />
            <stop offset="55%" stopColor="#32151f" />
            <stop offset="100%" stopColor="#12080c" />
          </radialGradient>
          <linearGradient id="chorale-brass" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f7e4b8" />
            <stop offset="48%" stopColor="#bd8f51" />
            <stop offset="100%" stopColor="#704a25" />
          </linearGradient>
        </defs>
        <path d={arc(31)} fill="none" stroke="#6f5842" strokeOpacity={0.55} strokeWidth={1} />
        <path d={arc(34)} fill="none" stroke="#f8efdd" strokeOpacity={0.8} strokeWidth={1.5} />
        {VOWELS.map((vowel, index) => {
          const a = -135 + (index / 4) * 270;
          const [x, y] = point(a, 33);
          return (
            <text
              key={vowel}
              x={x}
              y={y + 2.5}
              textAnchor="middle"
              fontSize={8.5}
              fontFamily="ui-monospace, monospace"
              fontWeight={index === active ? 900 : 700}
              fill={index === active ? ACCENT : MUTED}
            >
              {vowel}
            </text>
          );
        })}
        <circle cx={38} cy={38} r={25} fill="url(#chorale-brass)" stroke="#5d3d22" strokeWidth={1} />
        <circle cx={38} cy={38} r={22.5} fill="url(#chorale-cap)" stroke="#0e0609" strokeWidth={1.2} />
        <circle cx={38} cy={38} r={18} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={0.8} />
        <g transform={`rotate(${angle} 38 38)`}>
          <line x1={38} y1={17} x2={38} y2={27} stroke={GOLD} strokeWidth={2} strokeLinecap="round" />
          <circle cx={38} cy={15} r={1.7} fill="#f7e4b8" />
        </g>
        <circle cx={38} cy={38} r={3.2} fill="url(#chorale-brass)" stroke="#3a2417" strokeWidth={0.7} />
        <text x={38} y={74} textAnchor="middle" fontSize={8} fontFamily="ui-monospace, monospace" fontWeight={700} letterSpacing={0.8} fill={MUTED}>VOWEL</text>
      </svg>
    </div>
  );
};

const FormantField: React.FC<{ vowel: number; shift: number; brightness: number }> = ({ vowel, shift, brightness }) => {
  const n = clamp(vowel, 0, 4);
  const lo = Math.floor(n);
  const hi = Math.min(4, Math.ceil(n));
  const t = n - lo;
  const formants = [0, 1, 2].map((i) => lerp(FORMANTS[lo][i], FORMANTS[hi][i], t) * Math.pow(2, shift / 12));
  const bars = Array.from({ length: 13 }, (_, i) => {
    const x = i / 12;
    const positions = formants.map((hz) => clamp(Math.log(hz / 200) / Math.log(4000 / 200), 0, 1));
    const amplitudes = [1, 0.62, 0.38];
    const envelope = positions.reduce(
      (sum, position, index) => sum + amplitudes[index] * Math.exp(-((x - position) ** 2) / 0.008),
      0,
    );
    return clamp(envelope * (0.62 + brightness * 0.78), 0.08, 1);
  });
  const active = clamp(Math.round(n), 0, 4);

  return (
    <div
      className="relative h-[80px] min-w-0 flex-1 overflow-hidden rounded-sm border-2 border-[#3b252c]"
      style={{
        background: 'radial-gradient(ellipse at 50% 35%, #34202a 0%, #160e13 58%, #090609 100%)',
        boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.88), 0 1px 0 rgba(255,255,255,0.6)',
      }}
      aria-label="Modelled formant field"
    >
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)' }} />
      <div className="relative flex h-full flex-col px-1.5 py-0.5">
        <div className="flex items-center justify-between gap-1 whitespace-nowrap text-[11px] font-mono font-bold uppercase leading-none tracking-[0.06em] text-[#c5a56c]">
          <span>FORMANT FIELD</span>
          <span>{VOWELS[active]} · {Math.round(formants[0])} HZ</span>
        </div>
        <div className="relative mt-1 flex h-[34px] items-end gap-[2px] border-b border-[#8d6841]/50">
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(90deg, rgba(197,165,108,0.12) 1px, transparent 1px), linear-gradient(0deg, rgba(197,165,108,0.12) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
          {bars.map((height, index) => (
            <span
              key={index}
              className="relative z-10 flex-1 rounded-t-[1px] transition-[height] duration-150"
              style={{
                height: `${Math.round(height * 100)}%`,
                background: index % 3 === 0 ? 'linear-gradient(180deg, #f3d58c, #b57a3f)' : 'linear-gradient(180deg, #d7a65f, #6c3e31)',
                boxShadow: '0 0 4px rgba(222, 171, 91, 0.35)',
              }}
            />
          ))}
        </div>
        <div className="mt-0.5 flex justify-between text-[11px] font-mono font-bold leading-none text-[#8f6e4d]">
          {VOWELS.map((vowel, index) => <span key={vowel} style={{ color: index === active ? '#f3d58c' : undefined }}>{vowel}</span>)}
        </div>
      </div>
    </div>
  );
};

const VoiceKeys: React.FC<{ options: readonly string[]; value: number; onChange: (v: number) => void }> = ({ options, value, onChange }) => (
  <div className="flex w-[104px] shrink-0 flex-col rounded-sm border border-[#8e7658]/70 p-1" style={{ background: 'rgba(255,255,255,0.18)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.55)' }}>
    <span className="mb-0.5 text-[11px] font-mono font-bold uppercase leading-none tracking-[0.14em]" style={{ color: MUTED }}>VOICE</span>
    <div className="grid grid-cols-2 gap-[2px]">
      {options.map((option, index) => {
        const active = Math.round(value) === index;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(index)}
            title={option}
            className="h-[17px] truncate rounded-[1px] border px-0.5 text-[11px] font-mono font-bold uppercase tracking-tight transition-colors"
            style={{
              color: active ? '#f7e7c7' : INK,
              background: active ? ACCENT : 'rgba(255,250,240,0.42)',
              borderColor: active ? '#5f2634' : '#9d876b',
              boxShadow: active ? 'inset 0 1px 2px rgba(0,0,0,0.4)' : '0 1px 0 rgba(255,255,255,0.45)',
            }}
          >
            {option === 'Soprano' ? 'SOP' : option === 'Mixed Choir' ? 'MIXED' : option === 'Children' ? 'CHILD' : option}
          </button>
        );
      })}
    </div>
  </div>
);

export const ChoraleFaceplate: React.FC<Props> = ({ device, onUpdate }) => {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useDeviceAutomation(device.id);
  useEffect(() => device.subscribe(force), [device]);

  const spec = device.spec;
  const defOf = (key: string): ParamDef | undefined => paramDef(spec, key);
  const valueOf = (key: string): number => {
    const v = device.params[key];
    return typeof v === 'number' ? v : defOf(key)?.default ?? 0;
  };
  const set = (key: string, value: number) => {
    device.setParam(key, value);
    force();
    onUpdate();
  };
  const knob = (key: string, label: string, size = 30) => {
    const def = defOf(key);
    if (!def) return null;
    return (
      <div key={key} className="relative flex justify-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full"
          style={{
            width: size + 8,
            height: size + 8,
            background: 'radial-gradient(circle at 34% 26%, #f7e7c4, #b48a55 54%, #614022 100%)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.35)',
          }}
        />
        <SpecKnob
          def={{ ...def, label }}
          value={valueOf(key)}
          onChange={(v) => set(key, v)}
          style="vintage"
          accent={ACCENT}
          text={INK}
          size={size}
          compact
          onMenu={(event) => automateMenuAt(event, `${device.name} · ${def.label}`, { kind: 'device', deviceId: device.id, param: key })}
        />
      </div>
    );
  };
  const voiceOptions = defOf('voiceType')?.options ?? [];

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden font-sans"
      data-testid="chorale-faceplate"
      style={{ background: PANEL_BG, color: INK, boxShadow: FACE_SHADOW }}
    >
      <div aria-hidden="true" className="absolute inset-y-0 left-0 z-10 w-[7px]" style={{ background: WOOD, boxShadow: 'inset -1px 0 2px rgba(255,255,255,0.12), 1px 0 3px rgba(0,0,0,0.35)' }} />
      <div aria-hidden="true" className="absolute inset-y-0 right-0 z-10 w-[7px]" style={{ background: WOOD, boxShadow: 'inset 1px 0 2px rgba(255,255,255,0.12), -1px 0 3px rgba(0,0,0,0.35)' }} />
      <Screw className="left-2 top-1.5" />
      <Screw className="right-2 top-1.5" />
      <Screw className="bottom-1.5 left-2" />
      <Screw className="bottom-1.5 right-2" />

            <header className="relative z-10 mx-2.5 mt-0.5 flex items-center gap-2 border-b border-[#7d674e]/55 pb-1">
        <div className="flex min-w-0 items-baseline gap-2 pl-1.5" style={{ borderLeft: `2px solid ${ACCENT}` }}>
          <div className="shrink-0 text-[18px] font-black leading-none tracking-[0.16em]" style={{ color: INK }}>CHORALE</div>
          <div className="truncate text-[11px] font-mono font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
            8-VOICE CHOIR
          </div>
        </div>
        <span className="flex-1" />
        <button
          type="button"
          className="rounded-[1px] border px-1.5 py-0.5 text-[11px] font-mono font-black uppercase tracking-wider"
          style={{ color: '#f8e8c8', background: ACCENT, borderColor: '#5b2432', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.3)' }}
          onClick={() => scheduleAudition(device, [{ note: 60, velocity: 0.82 }], 900)}
          title="Audition Chorale"
        >
          AUDITION
        </button>
      </header>

      <div className="relative z-10 mx-2.5 mt-1 flex min-h-0 flex-1 flex-col pb-1">
        <div className="flex h-[80px] shrink-0 items-start gap-1.5">
          <VowelDial value={valueOf('vowel')} onChange={(v) => set('vowel', v)} />
          <FormantField vowel={valueOf('vowel')} shift={valueOf('formantShift')} brightness={valueOf('brightness')} />
          <VoiceKeys options={voiceOptions} value={valueOf('voiceType')} onChange={(v) => set('voiceType', v)} />
        </div>

        <div className="mt-1 grid grid-cols-[1.15fr_0.85fr] gap-1.5">
          <Section title="Formant">
            {knob('vowelMotion', 'Motion')}
            {knob('formantShift', 'Shift')}
            {knob('ensemble', 'Choir')}
            {knob('breath', 'Air')}
          </Section>
          <Section title="Expression">
            {knob('vibRate', 'Rate')}
            {knob('vibDepth', 'Depth')}
            {knob('brightness', 'Bright')}
          </Section>
        </div>

        <div className="mt-0.5 grid grid-cols-[1.15fr_0.85fr] gap-1.5">
          <Section title="Amp Envelope">
            {knob('attack', 'Attack')}
            {knob('decay', 'Decay')}
            {knob('sustain', 'Sustain')}
            {knob('release', 'Release')}
          </Section>
          <Section title="Space · Output">
            {knob('room', 'Space')}
            {knob('volume', 'Level')}
            <div className="flex h-9 flex-col items-center justify-center gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 5px ${ACCENT}` }} />
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider" style={{ color: MUTED }}>ON</span>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};
