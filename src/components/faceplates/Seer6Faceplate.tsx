/**
 * Seer-6 Analog Poly — a bespoke six-voice polysynth panel in cream enamel, walnut and brass.
 * Its 35 parameters fit a 7 × 5 layout, giving each control more room than the denser Duotone.
 */
import React, { useEffect, useReducer, useRef } from 'react';
import type { SpecDevice } from '../../audio/spec/SpecDevice.ts';
import { paramDef, type ParamDef } from '../../../shared/rack/devices/index.ts';
import { scheduleAudition } from '../../audio/audition.ts';
import { useDeviceAutomation, useMeterFrame } from '../../nexa/useEngine.ts';
import { automateMenuAt } from '../AutomateMenu.tsx';
import { SpecKnob } from './specKnob.tsx';

const INK = '#2b2118';
const MUTED = '#6b543d';
const ACCENT = '#8d3434';
const ACCENT_DARK = '#5f2020';
const GOLD = '#b18449';
const CREAM = '#f8e9cf';

const PANEL_BG = [
  'radial-gradient(120% 85% at 50% 0%, rgba(255,255,255,0.62), transparent 60%)',
  'repeating-linear-gradient(90deg, rgba(78,50,30,0.025) 0 1px, transparent 1px 4px)',
  'linear-gradient(180deg, #f5e9d3 0%, #eadcc4 52%, #d1bfa2 100%)',
].join(', ');

const WOOD = [
  'repeating-linear-gradient(90deg, rgba(0,0,0,0.24) 0 1px, transparent 1px 4px)',
  'linear-gradient(180deg, #3b2416, #1a0f0a 55%, #2b1a10)',
].join(', ');

const BRASS_PLATE = [
  'linear-gradient(180deg, rgba(255,255,255,0.48), transparent 46%)',
  'linear-gradient(180deg, #e4c58c 0%, #c39b5d 52%, #a87b43 100%)',
].join(', ');

const VOICE_BADGE = [
  'repeating-linear-gradient(90deg, rgba(0,0,0,0.25) 0 1px, transparent 1px 4px)',
  'linear-gradient(180deg, #3c2516, #1a0f09 62%, #2d1b10)',
].join(', ');

const FACE_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -12px 22px rgba(58,34,18,0.2), 0 1px 0 rgba(255,255,255,0.25)';

const SHORT_OPTION: Record<string, string> = {
  Saw: 'SAW',
  Square: 'SQR',
  Tri: 'TRI',
  Sine: 'SIN',
  Pulse: 'PLS',
  'S&H': 'S&H',
  'LP 4-Pole': 'LP4',
  'HP 2-Pole': 'HP2',
  BP: 'BP',
  Poly: 'POLY',
  Mono: 'MONO',
  Legato: 'LEG',
  Unison: 'UNI',
};

const shortOption = (option: string) =>
  SHORT_OPTION[option] ?? option.replace(/\s+/g, '').slice(0, 5).toUpperCase();

type Cell =
  | { kind: 'knob'; key: string; label: string }
  | { kind: 'option'; key: string; label: string };

interface Band {
  label: readonly string[];
  cells: readonly Cell[];
  tint?: string;
}

const BANDS: readonly Band[] = [
  {
    label: ['OSC', 'VCO'],
    cells: [
      { kind: 'option', key: 'osc1Wave', label: 'Osc 1' },
      { kind: 'knob', key: 'osc1Oct', label: 'Oct 1' },
      { kind: 'option', key: 'osc2Wave', label: 'Osc 2' },
      { kind: 'knob', key: 'osc2Oct', label: 'Oct 2' },
      { kind: 'knob', key: 'osc2Semi', label: 'Semi' },
      { kind: 'knob', key: 'osc2Detune', label: 'Detune' },
      { kind: 'knob', key: 'xmod', label: 'X Mod' },
    ],
  },
  {
    label: ['MIX', 'FILTER'],
    tint: 'rgba(255,255,255,0.12)',
    cells: [
      { kind: 'knob', key: 'osc2Level', label: '2 Lvl' },
      { kind: 'knob', key: 'pw', label: 'Width' },
      { kind: 'knob', key: 'subLevel', label: 'Sub' },
      { kind: 'knob', key: 'noiseLevel', label: 'Noise' },
      { kind: 'option', key: 'filterType', label: 'Filter' },
      { kind: 'knob', key: 'cutoff', label: 'Cutoff' },
      { kind: 'knob', key: 'resonance', label: 'Res' },
    ],
  },
  {
    label: ['FILTER', 'ENV'],
    cells: [
      { kind: 'knob', key: 'keyTrack', label: 'Track' },
      { kind: 'knob', key: 'drive', label: 'Drive' },
      { kind: 'knob', key: 'envAmount', label: 'Amt' },
      { kind: 'knob', key: 'fAttack', label: 'F.Atk' },
      { kind: 'knob', key: 'fDecay', label: 'F.Dec' },
      { kind: 'knob', key: 'fSustain', label: 'F.Sus' },
      { kind: 'knob', key: 'fRelease', label: 'F.Rel' },
    ],
  },
  {
    label: ['AMP', 'LFO'],
    tint: 'rgba(255,255,255,0.12)',
    cells: [
      { kind: 'knob', key: 'attack', label: 'Atk' },
      { kind: 'knob', key: 'decay', label: 'Dec' },
      { kind: 'knob', key: 'sustain', label: 'Sus' },
      { kind: 'knob', key: 'release', label: 'Rel' },
      { kind: 'option', key: 'lfoWave', label: 'LFO' },
      { kind: 'knob', key: 'lfoRate', label: 'Rate' },
      { kind: 'knob', key: 'lfoPitch', label: 'Pitch' },
    ],
  },
  {
    label: ['MOD', 'VOICE'],
    tint: 'rgba(141,52,52,0.055)',
    cells: [
      { kind: 'knob', key: 'lfoCutoff', label: 'Filter' },
      { kind: 'knob', key: 'lfoAmp', label: 'Amp' },
      { kind: 'option', key: 'voiceMode', label: 'Voice' },
      { kind: 'knob', key: 'glide', label: 'Glide' },
      { kind: 'knob', key: 'unisonDetune', label: 'Spread' },
      { kind: 'knob', key: 'velAmount', label: 'Vel' },
      { kind: 'knob', key: 'volume', label: 'Level' },
    ],
  },
];

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

const OptionCell: React.FC<{
  def: ParamDef;
  label: string;
  value: number;
  onChange: (v: number) => void;
  onMenu: (e: React.MouseEvent) => void;
}> = ({ def, label, value, onChange, onMenu }) => {
  const options = def.options ?? [];
  const index = Math.max(0, Math.min(options.length - 1, Math.round(value)));
  const option = options[index] ?? '';
  return (
    <div className="flex flex-col items-center select-none" style={{ width: 44 }} data-param={def.key} title={def.label}>
      <button
        type="button"
        className="relative flex h-[32px] w-[34px] items-center justify-center rounded-[2px] border outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#8d3434]/70"
        style={{
          background: 'linear-gradient(180deg, #3b2721 0%, #221310 60%, #120a08 100%)',
          borderColor: '#8f6b42',
          boxShadow:
            'inset 0 1px 0 rgba(255,233,190,0.24), inset 0 -3px 5px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)',
        }}
        onClick={(event) => {
          if (!options.length) return;
          onChange((index + (event.shiftKey ? -1 : 1) + options.length) % options.length);
        }}
        onContextMenu={onMenu}
        title={`${def.label}: ${option} — click to step${options.length > 1 ? ', Shift-click to go back' : ''}`}
        aria-label={`${def.label}: ${option}`}
      >
        <span className="text-[11px] font-mono font-black leading-none tracking-[-0.03em]" style={{ color: CREAM }}>
          {shortOption(option)}
        </span>
        <span
          aria-hidden="true"
          className="absolute right-[3px] top-[3px] h-1 w-1 rounded-full"
          style={{ background: '#d27d45', boxShadow: '0 0 4px #c66c39' }}
        />
        <span aria-hidden="true" className="absolute inset-x-1 bottom-[3px] h-px" style={{ background: 'rgba(232,205,124,0.2)' }} />
      </button>
      <span className="mt-[1px] max-w-full truncate text-center text-[11px] font-mono font-bold uppercase leading-none tracking-[-0.04em]" style={{ color: INK }}>
        {label}
      </span>
    </div>
  );
};

const VOICE_LEDS = 6;
const LED_ON = '#f0b563';
const LED_OFF = '#4a2b16';
const LED_ON_SHADOW = '0 0 5px rgba(224,151,72,0.9)';
const LED_OFF_SHADOW = 'inset 0 1px 1px rgba(0,0,0,0.6)';

const VoiceBadge: React.FC<{ device: SpecDevice }> = ({ device }) => {
  const badge = useRef<HTMLDivElement | null>(null);
  const leds = useRef<Array<HTMLSpanElement | null>>([]);
  const lastActive = useRef(-1);

  useMeterFrame(() => {
    const meters = device.meter();
    const raw = Number(meters.sounding ?? meters.voices ?? 0);
    const active = Math.max(0, Math.min(VOICE_LEDS, Math.round(raw)));
    if (active === lastActive.current) return;
    lastActive.current = active;
    leds.current.forEach((led, index) => {
      if (!led) return;
      const on = index < active;
      led.style.background = on ? LED_ON : LED_OFF;
      led.style.boxShadow = on ? LED_ON_SHADOW : LED_OFF_SHADOW;
      led.style.opacity = on ? '1' : '0.62';
      led.dataset.active = on ? 'true' : 'false';
    });
    if (badge.current) {
      const label = `${active} of ${VOICE_LEDS} voices playing`;
      badge.current.setAttribute('aria-label', label);
      badge.current.title = label;
    }
  });

  return (
    <div
      ref={(el) => {
        badge.current = el;
      }}
      className="flex h-[24px] shrink-0 items-center gap-1 rounded-[1px] border px-1.5"
      style={{ background: VOICE_BADGE, borderColor: '#8f6c42', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.3)' }}
      role="img"
      aria-label="0 of 6 voices playing"
      title="0 of 6 voices playing"
    >
      <span className="flex items-center gap-[2px]" aria-hidden="true">
        {Array.from({ length: VOICE_LEDS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              leds.current[i] = el;
            }}
            data-voice-led={i}
            data-active="false"
            className="h-1.5 w-1.5 rounded-full transition-[background-color,box-shadow,opacity] duration-100"
            style={{ background: LED_OFF, boxShadow: LED_OFF_SHADOW, opacity: 0.62 }}
          />
        ))}
      </span>
      <span className="text-[11px] font-mono font-black leading-none" style={{ color: CREAM }}>
        {VOICE_LEDS}
      </span>
    </div>
  );
};

interface Props {
  device: SpecDevice;
  onUpdate: () => void;
}

export const Seer6Faceplate: React.FC<Props> = ({ device, onUpdate }) => {
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

  const renderCell = (cell: Cell) => {
    const def = defOf(cell.key);
    if (!def) return <span key={cell.key} style={{ width: 44 }} />;
    const onMenu = (event: React.MouseEvent) =>
      automateMenuAt(event, `${device.name} · ${def.label}`, { kind: 'device', deviceId: device.id, param: cell.key });

    if (def.options) {
      return (
        <OptionCell
          key={cell.key}
          def={def}
          label={cell.label}
          value={valueOf(cell.key)}
          onChange={(value) => set(cell.key, value)}
          onMenu={onMenu}
        />
      );
    }

    return (
      <div key={cell.key} className="flex flex-col items-center" style={{ width: 44 }} data-param={cell.key} title={def.label}>
        <div className="relative flex justify-center">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full"
            style={{
              width: 31,
              height: 31,
              background: 'radial-gradient(circle at 34% 26%, #f7e7c4, #b48a55 54%, #614022 100%)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.35)',
            }}
          />
          <SpecKnob
            def={{ ...def, label: cell.label }}
            value={valueOf(cell.key)}
            onChange={(value) => set(cell.key, value)}
            style="vintage"
            accent={ACCENT}
            text={INK}
            size={23}
            cellWidth={44}
            dense
            onMenu={onMenu}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden font-sans"
      data-testid="seer6-faceplate"
      style={{ background: PANEL_BG, color: INK, boxShadow: FACE_SHADOW }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 z-10 w-[7px]"
        style={{ background: WOOD, boxShadow: 'inset -1px 0 2px rgba(255,255,255,0.12), 1px 0 3px rgba(0,0,0,0.35)' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 z-10 w-[7px]"
        style={{ background: WOOD, boxShadow: 'inset 1px 0 2px rgba(255,255,255,0.12), -1px 0 3px rgba(0,0,0,0.35)' }}
      />
      <Screw className="left-2 top-1.5" />
      <Screw className="right-2 top-1.5" />
      <Screw className="bottom-1.5 left-2" />
      <Screw className="bottom-1.5 right-2" />

      <header className="relative z-10 mx-2.5 mt-0.5 flex h-[30px] shrink-0 items-center gap-1.5 border-b border-[#8a6a43]/55 pb-0.5">
        <div
          className="flex h-[26px] shrink-0 items-center gap-2 rounded-[2px] border px-2"
          style={{
            background: BRASS_PLATE,
            borderColor: '#7d5830',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.58), inset 0 -1px 0 rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.25)',
          }}
        >
          <span className="text-[18px] font-black leading-none tracking-[0.14em]" style={{ color: '#2b1a10' }}>
            SEER-6
          </span>
          <span className="truncate text-[11px] font-mono font-bold uppercase leading-none tracking-[0.06em]" style={{ color: '#5c4026' }}>
            6-Voice Poly
          </span>
        </div>

        <span className="flex-1" />
        <VoiceBadge device={device} />
        <button
          type="button"
          className="h-[18px] shrink-0 rounded-[1px] border px-1.5 text-[11px] font-mono font-black uppercase leading-none tracking-[0.06em] transition-[filter] hover:brightness-110"
          style={{
            color: CREAM,
            background: ACCENT,
            borderColor: ACCENT_DARK,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.3)',
          }}
          onClick={() =>
            scheduleAudition(
              device,
              [
                { note: 48, velocity: 0.55 },
                { note: 55, velocity: 0.52 },
                { note: 60, velocity: 0.62 },
                { note: 64, velocity: 0.55 },
                { note: 67, velocity: 0.5 },
              ],
              1100,
            )
          }
          title="Audition Seer-6"
        >
          Audition
        </button>
      </header>

      <div className="relative z-10 mx-2.5 mt-[2px] flex min-h-0 flex-1 flex-col pb-0.5">
        {BANDS.map((band, bandIndex) => (
          <div
            key={band.label.join('-')}
            data-band={band.label.join(' ')}
            className="flex min-h-0 flex-1 items-stretch"
            style={{
              borderTop: bandIndex ? '1px solid rgba(124,93,59,0.28)' : undefined,
              background: band.tint,
            }}
          >
            <div className="flex w-[48px] shrink-0 items-center border-r border-[#8a714f]/45 pr-1" title={band.label.join(' ')}>
              <span
                className="flex flex-col gap-[1px] text-[11px] font-mono font-black uppercase leading-none tracking-[0.04em]"
                style={{ color: ACCENT }}
              >
                {band.label.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-0 pl-1">
              {band.cells.map(renderCell)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
