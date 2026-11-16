/**
 * Duotone Dual-Layer Synthesizer — bespoke cream enamel / walnut / brass hardware.
 * Five dense bands keep all 40 real parameters on the 3U face; the layer morph gets a
 * dedicated brass fader in the walnut header instead of a tiny grid knob.
 */
import React, { useEffect, useReducer } from 'react';
import type { SpecDevice } from '../../audio/spec/SpecDevice.ts';
import { paramDef, type ParamDef } from '../../../shared/rack/devices/index.ts';
import { scheduleAudition } from '../../audio/audition.ts';
import { useDeviceAutomation } from '../../nexa/useEngine.ts';
import { automateMenuAt } from '../AutomateMenu.tsx';
import { SpecKnob } from './specKnob.tsx';

const INK = '#2b2118';
const MUTED = '#65503b';
const ACCENT = '#b24a26';
const ACCENT_DARK = '#743018';
const GOLD = '#b3864e';
const CREAM = '#f4e6cb';

const PANEL_BG = [
  'radial-gradient(115% 80% at 50% 0%, rgba(255,255,255,0.56), transparent 58%)',
  'repeating-linear-gradient(90deg, rgba(74,47,30,0.027) 0 1px, transparent 1px 4px)',
  'linear-gradient(180deg, #f2e6cf 0%, #e5d7bf 54%, #cdbb9e 100%)',
].join(', ');

const WALNUT = [
  'repeating-linear-gradient(90deg, rgba(0,0,0,0.26) 0 1px, transparent 1px 4px)',
  'linear-gradient(180deg, #4a2c19, #24140c 56%, #392213)',
].join(', ');

const WOOD = [
  'repeating-linear-gradient(90deg, rgba(0,0,0,0.24) 0 1px, transparent 1px 4px)',
  'linear-gradient(180deg, #3b2416, #1a0f0a 55%, #2b1a10)',
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
  'LP 24': 'LP24',
  'LP 12': 'LP12',
  'HP 12': 'HP12',
  BP: 'BP',
  Poly: 'POLY',
  Mono: 'MONO',
  Legato: 'LEG',
  Unison: 'UNI',
  Off: 'OFF',
  I: 'I',
  II: 'II',
  'I+II': 'I+II',
};

const shortOption = (option: string) =>
  SHORT_OPTION[option] ?? option.replace(/\s+/g, '').slice(0, 5).toUpperCase();

type Cell =
  | { kind: 'knob'; key: string; label: string }
  | { kind: 'option'; key: string; label: string; wide?: boolean };

interface Band {
  label: readonly string[];
  cells: readonly Cell[];
  tint?: string;
  balance?: boolean;
}

const BANDS: readonly Band[] = [
  {
    label: ['OSC', 'A / B'],
    cells: [
      { kind: 'option', key: 'osc1Wave', label: 'Osc 1' },
      { kind: 'knob', key: 'osc1Oct', label: 'Oct 1' },
      { kind: 'knob', key: 'pw', label: 'Width' },
      { kind: 'option', key: 'osc2Wave', label: 'Osc 2' },
      { kind: 'knob', key: 'osc2Oct', label: 'Oct 2' },
      { kind: 'knob', key: 'osc2Semi', label: 'Semi' },
      { kind: 'knob', key: 'osc2Detune', label: 'Detune' },
      { kind: 'knob', key: 'osc2Level', label: '2 Lvl' },
    ],
  },
  {
    label: ['MIX', 'FILTER'],
    tint: 'rgba(255,255,255,0.12)',
    cells: [
      { kind: 'knob', key: 'subLevel', label: 'Sub' },
      { kind: 'knob', key: 'noiseLevel', label: 'Noise' },
      { kind: 'option', key: 'filterType', label: 'Type' },
      { kind: 'knob', key: 'cutoff', label: 'Cutoff' },
      { kind: 'knob', key: 'resonance', label: 'Res' },
      { kind: 'knob', key: 'keyTrack', label: 'Track' },
      { kind: 'knob', key: 'drive', label: 'Drive' },
      { kind: 'knob', key: 'envAmount', label: 'Amt' },
    ],
  },
  {
    label: ['ENV', 'F / A'],
    cells: [
      { kind: 'knob', key: 'fAttack', label: 'F.Atk' },
      { kind: 'knob', key: 'fDecay', label: 'F.Dec' },
      { kind: 'knob', key: 'fSustain', label: 'F.Sus' },
      { kind: 'knob', key: 'fRelease', label: 'F.Rel' },
      { kind: 'knob', key: 'attack', label: 'Atk' },
      { kind: 'knob', key: 'decay', label: 'Dec' },
      { kind: 'knob', key: 'sustain', label: 'Sus' },
      { kind: 'knob', key: 'release', label: 'Rel' },
    ],
  },
  {
    label: ['LFO', 'VOICE'],
    tint: 'rgba(255,255,255,0.12)',
    cells: [
      { kind: 'option', key: 'lfoWave', label: 'LFO' },
      { kind: 'knob', key: 'lfoRate', label: 'Rate' },
      { kind: 'knob', key: 'lfoPitch', label: 'Pitch' },
      { kind: 'knob', key: 'lfoCutoff', label: 'Filter' },
      { kind: 'knob', key: 'lfoAmp', label: 'Amp' },
      { kind: 'option', key: 'voiceMode', label: 'Voice' },
      { kind: 'knob', key: 'glide', label: 'Glide' },
      { kind: 'knob', key: 'unisonDetune', label: 'Spread' },
    ],
  },
  {
    label: ['LAYER', 'B', 'OUT'],
    tint: 'rgba(178,74,38,0.07)',
    balance: true,
    cells: [
      { kind: 'knob', key: 'velAmount', label: 'Vel' },
      { kind: 'option', key: 'bWave', label: 'B Wave', wide: true },
      { kind: 'knob', key: 'bOct', label: 'B Oct' },
      { kind: 'knob', key: 'bDetune', label: 'B Det' },
      { kind: 'knob', key: 'bCutoff', label: 'B Cut' },
      { kind: 'option', key: 'chorus', label: 'Chorus', wide: true },
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
  width?: number;
  value: number;
  onChange: (v: number) => void;
  onMenu: (e: React.MouseEvent) => void;
}> = ({ def, label, width = 38, value, onChange, onMenu }) => {
  const options = def.options ?? [];
  const index = Math.max(0, Math.min(options.length - 1, Math.round(value)));
  const option = options[index] ?? '';
  return (
    <div className="flex flex-col items-center select-none" style={{ width }} data-param={def.key} title={def.label}>
      <button
        type="button"
        className="relative flex h-[30px] w-[33px] items-center justify-center rounded-[2px] border outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#b24a26]/70"
        style={{
          background: 'linear-gradient(180deg, #332316 0%, #1a100a 58%, #0d0805 100%)',
          borderColor: '#8f6a3f',
          boxShadow:
            'inset 0 1px 0 rgba(255,233,190,0.25), inset 0 -3px 5px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)',
        }}
        onClick={(event) => {
          if (!options.length) return;
          onChange((index + (event.shiftKey ? -1 : 1) + options.length) % options.length);
        }}
        onContextMenu={onMenu}
        title={`${def.label}: ${option} — click to step${options.length > 1 ? ', Shift-click to go back' : ''}`}
        aria-label={`${def.label}: ${option}`}
      >
        <span className="text-[11px] font-mono font-black leading-none tracking-[-0.03em]" style={{ color: '#f3dfb8' }}>
          {shortOption(option)}
        </span>
        <span
          aria-hidden="true"
          className="absolute right-[3px] top-[3px] h-1 w-1 rounded-full"
          style={{ background: ACCENT, boxShadow: `0 0 4px ${ACCENT}` }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-1 bottom-[3px] h-px"
          style={{ background: 'rgba(232,205,124,0.2)' }}
        />
      </button>
      <span className="mt-[1px] max-w-full truncate text-center text-[11px] font-mono font-bold uppercase leading-none tracking-[-0.06em]" style={{ color: INK }}>
        {label}
      </span>
    </div>
  );
};

const LayerBalance: React.FC<{ morph: number }> = ({ morph }) => {
  const b = Math.round(Math.max(0, Math.min(1, morph)) * 100);
  const a = 100 - b;
  return (
    <div
      className="flex flex-col items-center justify-center gap-[2px]"
      style={{ width: 38 }}
      title={`Layer balance: A ${a}% / B ${b}% — use the MORPH fader in the header`}
      role="img"
      aria-label={`Layer balance: A ${a} percent, B ${b} percent`}
    >
      <span className="text-[11px] font-mono font-black leading-none tracking-[0.08em]" style={{ color: MUTED }}>
        A/B
      </span>
      <span
        aria-hidden="true"
        className="relative h-[5px] w-[30px] overflow-hidden rounded-[1px] border border-[#806646]"
        style={{ background: '#24170f', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.7)' }}
      >
        <span className="absolute inset-y-0 left-0" style={{ width: `${a}%`, background: ACCENT }} />
        <span className="absolute inset-y-0 right-0" style={{ width: `${b}%`, background: GOLD }} />
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ background: 'rgba(255,240,210,0.4)' }} />
      </span>
      <span className="text-[11px] font-mono font-bold leading-none" style={{ color: INK }}>
        {a}:{b}
      </span>
    </div>
  );
};

interface Props {
  device: SpecDevice;
  onUpdate: () => void;
}

export const PolytoneFaceplate: React.FC<Props> = ({ device, onUpdate }) => {
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
  const morph = valueOf('morph');
  const morphDef = defOf('morph');

  const renderCell = (cell: Cell) => {
    const def = defOf(cell.key);
    if (!def) return <span key={cell.key} style={{ width: 38 }} />;
    const onMenu = (event: React.MouseEvent) =>
      automateMenuAt(event, `${device.name} · ${def.label}`, { kind: 'device', deviceId: device.id, param: cell.key });

    if (def.options) {
      return (
        <OptionCell
          key={cell.key}
          def={def}
          label={cell.label}
          width={cell.kind === 'option' && cell.wide ? 44 : 38}
          value={valueOf(cell.key)}
          onChange={(value) => set(cell.key, value)}
          onMenu={onMenu}
        />
      );
    }

    return (
      <div key={cell.key} className="flex flex-col items-center" style={{ width: 38 }} data-param={cell.key} title={def.label}>
        <div className="relative flex justify-center">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full"
            style={{
              width: 30,
              height: 30,
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
            size={22}
            cellWidth={38}
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
      data-testid="polytone-faceplate"
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

      <header
        className="relative z-10 mx-2.5 mt-0.5 flex h-[30px] shrink-0 items-center gap-2 rounded-[1px] border px-2"
        style={{
          background: WALNUT,
          borderColor: '#9a6f3f',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 1px 2px rgba(0,0,0,0.36)',
        }}
      >
        <div className="flex shrink-0 flex-col pl-1" style={{ borderLeft: `2px solid ${ACCENT}` }}>
          <span className="text-[18px] font-black leading-none tracking-[0.14em]" style={{ color: CREAM }}>
            DUOTONE
          </span>
          <span className="mt-[1px] text-[11px] font-mono font-bold uppercase leading-none tracking-[0.1em]" style={{ color: '#cba46e' }}>
            DUAL-LAYER
          </span>
        </div>

        <span className="flex-1" />

        <div className="flex shrink-0 items-center gap-1" title="Layer A / B morph">
          <span className="text-[11px] font-mono font-black uppercase leading-none tracking-[0.08em]" style={{ color: '#cba46e' }}>
            Morph
          </span>
          <span className="text-[11px] font-mono font-black leading-none" style={{ color: CREAM }}>
            A
          </span>
          <label
            className="relative h-[18px] w-[52px] shrink-0 cursor-ew-resize select-none rounded-[1px] focus-within:ring-2 focus-within:ring-[#f3d58c]/70"
            data-param="morph"
            title={`Layer A / B morph: ${Math.round(morph * 100)}% B`}
            onContextMenu={(event) =>
              automateMenuAt(event, `${device.name} · ${morphDef?.label ?? 'Morph'}`, {
                kind: 'device',
                deviceId: device.id,
                param: 'morph',
              })
            }
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={morph}
              onChange={(event) => set('morph', Number(event.target.value))}
              onDoubleClick={() => set('morph', morphDef?.default ?? 0.35)}
              aria-label="Layer A / B morph"
              aria-valuetext={`A ${Math.round((1 - morph) * 100)} percent, B ${Math.round(morph * 100)} percent`}
              className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
            />
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-[1px] border border-[#6e4a29]"
              style={{
                background: `linear-gradient(90deg, ${ACCENT} ${morph * 100}%, #17100a ${morph * 100}%)`,
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)',
              }}
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 h-[14px] w-[7px] -translate-y-1/2 rounded-[1px] border border-[#5e4021]"
              style={{
                left: `calc(${morph * 100}% - ${morph * 7}px)`,
                background: 'linear-gradient(180deg, #f7e3b6, #bd8d4f 52%, #6f4a24)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.55), 0 1px 2px rgba(0,0,0,0.5)',
              }}
            />
          </label>
          <span className="text-[11px] font-mono font-black leading-none" style={{ color: CREAM }}>
            B
          </span>
          <span className="w-[26px] text-right text-[11px] font-mono font-bold leading-none" style={{ color: '#f3d58c' }}>
            {Math.round(morph * 100)}%
          </span>
        </div>

        <button
          type="button"
          className="h-[18px] shrink-0 rounded-[1px] border px-1.5 text-[11px] font-mono font-black uppercase leading-none tracking-[0.06em] transition-[filter] hover:brightness-110"
          style={{
            color: '#f8e8c8',
            background: ACCENT,
            borderColor: ACCENT_DARK,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.3)',
          }}
          onClick={() =>
            scheduleAudition(
              device,
              [
                { note: 48, velocity: 0.58 },
                { note: 55, velocity: 0.56 },
                { note: 60, velocity: 0.64 },
                { note: 64, velocity: 0.56 },
              ],
              1200,
            )
          }
          title="Audition Duotone"
        >
          Audition
        </button>
      </header>

      <div className="relative z-10 mx-2.5 mt-[2px] flex min-h-0 flex-1 flex-col gap-[1px] pb-0.5">
        {BANDS.map((band, bandIndex) => (
          <div
            key={band.label.join('-')}
            data-band={band.label.join(' ')}
            className="flex min-h-0 flex-1 items-stretch"
            style={{
              borderTop: bandIndex ? '1px solid rgba(111,86,57,0.3)' : undefined,
              background: band.tint,
            }}
          >
            <div
              className="flex w-[42px] shrink-0 items-center border-r border-[#8a714f]/45 pr-1"
              title={band.label.join(' ')}
            >
              <span
                className="flex flex-col gap-[1px] text-[11px] font-mono font-black uppercase leading-none tracking-[0.05em]"
                style={{ color: MUTED }}
              >
                {band.label.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-0 pl-1">
              {band.cells.map(renderCell)}
              {band.balance && <LayerBalance morph={morph} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
