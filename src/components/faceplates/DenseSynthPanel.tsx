/**
 * Dense control matrix for the generic synth faceplates. Every real parameter stays on the
 * panel, but the layout is a fixed-height 7-8 column matrix rather than stacked section cards,
 * so a 3U synth keeps the same face height as the bespoke 3U instruments.
 */
import React, { useEffect, useReducer } from 'react';
import type { SpecDevice } from '../../audio/spec/SpecDevice.ts';
import { paramDef, type DeviceSpec, type KnobStyle, type ParamDef } from '../../../shared/rack/devices/index.ts';
import { automateMenuAt } from '../AutomateMenu.tsx';
import { SpecKnob } from './specKnob.tsx';

interface Props {
  device: SpecDevice;
  onUpdate: () => void;
  accent: string;
  text: string;
  knob: KnobStyle;
}

const LABEL: Record<string, string> = {
  Attack: 'Atk',
  Decay: 'Dec',
  Sustain: 'Sus',
  Release: 'Rel',
  Resonance: 'Res',
  Velocity: 'Vel',
  Unison: 'Uni',
  Detune: 'Det',
  'Uni Detune': 'UniD',
  'Cross Mod': 'XMod',
  'Key Track': 'Trk',
  Cutoff: 'Cut',
  Voices: 'Vcs',
  Motion: 'MOT',
  Partials: 'Part',
  'Odd ⇄ Even': 'O/E',
  'Spec Peak': 'Spec',
  'Filter Type': 'Type',
  'Osc 2 Lvl': '2 Lvl',
  'Osc 3 Lvl': '3 Lvl',
  'Pulse W': 'Pulse',
  'Env Amt': 'Env',
  'LFO Rate': 'Rate',
  'Motion Amt': 'Depth',
  'Mod Index': 'Mod',
  'Mod Decay': 'M Dec',
  'Mod Sustain': 'M Sus',
  Brightness: 'Bright',
  Hardness: 'Hard',
  Feedback: 'Fdbk',
  'Vel → Mod': 'VMod',
  'Spring Rev': 'Spring',
  'Table A': 'Tbl A',
  'Table B': 'Tbl B',
  'Oct A': 'Oct A',
  'Oct B': 'Oct B',
  'Semi B': 'Semi B',
  'Semi 2': 'Sem2',
  'Detune B': 'Det B',
  'FM Index': 'FM',
  'Mod Ratio': 'Ratio',
  'Pitch Env': 'Pitch',
  'Amp Env': 'Amp',
  'Low Pass Gate': 'LPG',
  'Formant A-E-I-O-U': 'Vowel',
  'Body Type': 'Body',
  'Room Size': 'Room',
  'Noise Level': 'Noise',
  'Sub Level': 'Sub',
  'Audio In': 'Audio',
  Algorithm: 'Algo',
  'Detune 3': 'Det 3',
  'To Pitch': 'Pitch',
  'To Filter': 'Filter',
  'To Amp': 'Amp',
  'Index A': 'Idx A',
  'Index B': 'Idx B',
  'A ⇄ B': 'A/B',
  'Hammer/Pick': 'Hammer',
  'LPG Decay': 'LPG Dec',
  'Fn → Fold': 'Fn Fold',
  Symmetry: 'Sym',
  'Body Size': 'Body',
  'Vib Depth': 'Vib',
  Ensemble: 'Ens',
  'Bow Pressure': 'Bow Pres',
  'Bow Noise': 'Bow Nz',
  'Bow Position': 'Bow Pos',
  'LFO → Index': 'LIdx',
  Volume: 'Vol',
  'Delay FX': 'Delay',
  'Reverb FX': 'Rev',
};

const compactLabel = (label: string): string => {
  const operator = /^Op(\d) (Ratio|Level)$/.exec(label);
  if (operator) return `Op${operator[1]}${operator[2] === 'Ratio' ? 'R' : 'L'}`;
  return LABEL[label] ?? (label.length > 9 ? label.slice(0, 8) : label);
};

const OPTION: Record<string, string> = {
  Saw: 'SAW',
  Phase: 'PHS',
  Glass: 'GLS',
  Bell: 'BEL',
  Metal: 'MET',
  'Ladder 24': 'LP24',
  'Ladder 12': 'LP12',
  Square: 'SQR',
  Triangle: 'TRI',
  Tri: 'TRI',
  Sine: 'SIN',
  Pulse: 'PLS',
  Noise: 'NOISE',
  Random: 'RND',
  Sample: 'S&H',
  'S&H': 'S&H',
  'LP 2-Pole': 'LP2',
  'LP 4-Pole': 'LP4',
  'HP 2-Pole': 'HP2',
  BP: 'BP',
  HP: 'HP',
  Peak: 'PEAK',
  Poly: 'POLY',
  Mono: 'MONO',
  Legato: 'LEG',
  Unison: 'UNI',
  'Global': 'GLOBAL',
};

const shortOption = (option: string): string => OPTION[option] ?? option.replace(/\s+/g, '').slice(0, 5).toUpperCase();

const SECTION: Record<string, string> = {
  Oscillators: 'OSC',
  Mixer: 'MIX',
  Filter: 'FILTER',
  'Filter Env': 'F.ENV',
  'Amp Env': 'A.ENV',
  LFO: 'LFO',
  Voice: 'VOICE',
  Effects: 'FX',
  Output: 'OUT',
  Algorithm: 'ALGO',
  'Complex Osc': 'CPLX',
  Wavefolder: 'FOLD',
  'Low Pass Gate': 'LPG',
  Function: 'FN',
  Spectrum: 'SPEC',
  Motion: 'MOT',
  Instrument: 'MODEL',
  Exciter: 'EXCITE',
  Resonator: 'RESON',
  Expression: 'EXPR',
  String: 'STRING',
  Formants: 'FORMANT',
  'Layer A': 'LAYER A',
  'Layer B': 'LAYER B',
  Layers: 'LAYERS',
  Modulation: 'MOD',
  Feedback: 'FB',
  Operators: 'OPS',
};

const sectionCode = (section: string): string => {
  if (/operator/i.test(section)) return 'OP';
  return SECTION[section] ?? section.replace(/\s+env$/i, ' ENV').toUpperCase().slice(0, 9);
};

const rowSections = (row: readonly ParamDef[]): { parts: string[]; full: string; extra: number } => {
  const names = [...new Set(row.map((p) => p.section ?? 'Main'))];
  if (!names.length) return { parts: [], full: '', extra: 0 };
  if (names.every((n) => /operator/i.test(n))) return { parts: ['OPS'], full: names.join(' · '), extra: 0 };
  const codes = names.map(sectionCode);
  return {
    parts: codes.slice(0, 2),
    full: names.join(' · '),
    extra: Math.max(0, codes.length - 2),
  };
};

export const DenseSynthPanel: React.FC<Props> = ({ device, onUpdate, accent, text, knob }) => {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const spec = device.spec;
  const params = spec.params;
  const units = spec.panel.units ?? 3;
  const maxRows = units <= 2 ? 4 : 5;
  const columns = Math.min(10, Math.max(6, Math.ceil(params.length / maxRows)));
  const rows = Math.max(1, Math.ceil(params.length / columns));
  const bodyHeight = units <= 2 ? 142 : 190;
  const gridGap = units <= 2 ? 2 : 3;
  const railWidth = units <= 2 && columns <= 7 ? 50 : 44;

  useEffect(() => device.subscribe(force), [device]);

  const valOf = (key: string) => {
    const v = device.params[key];
    return typeof v === 'number' ? v : paramDef(spec, key)?.default ?? 0;
  };
  const set = (key: string, value: number) => {
    device.setParam(key, value);
    force();
    onUpdate();
  };
  const menu = (event: React.MouseEvent, def: ParamDef) => {
    automateMenuAt(event, `${device.name} · ${def.label}`, { kind: 'device', deviceId: device.id, param: def.key });
  };

  const chunks: ParamDef[][] = [];
  for (let i = 0; i < params.length; i += columns) chunks.push(params.slice(i, i + columns));

  const cells = (row: ParamDef[], rowIndex: number) => {
    let previousSection = rowIndex > 0 ? chunks[rowIndex - 1]?.[chunks[rowIndex - 1].length - 1]?.section : undefined;
    return row.map((def) => {
      const section = def.section ?? 'Main';
      const startsSection = section !== previousSection;
      previousSection = section;
      const value = valOf(def.key);
      const common = {
        'data-param': def.key,
        'aria-label': `${def.label}: ${def.options?.[Math.round(value)] ?? value}`,
      };
      return (
        <div
          key={def.key}
          className={`synth-dense__cell${startsSection ? ' synth-dense__cell--start' : ''}`}
          title={`${def.label}: ${def.options?.[Math.round(value)] ?? value}`}
          {...common}
        >
          {def.control === 'toggle' ? (
            <button
              type="button"
              className="synth-dense__toggle"
              aria-pressed={value >= 0.5}
              aria-label={def.label}
              title={`${def.label}: ${value >= 0.5 ? 'on' : 'off'}`}
              onClick={() => set(def.key, value >= 0.5 ? 0 : 1)}
              onContextMenu={(e) => menu(e, def)}
            >
              <span className="synth-dense__led" style={{ background: value >= 0.5 ? accent : '#34383d', boxShadow: value >= 0.5 ? `0 0 5px ${accent}` : undefined }} />
              <span>{value >= 0.5 ? 'ON' : 'OFF'}</span>
            </button>
          ) : def.options ? (
            <div className="synth-dense__option">
              {def.options.length > 4 ? (
                <select
                  className="synth-dense__select"
                  value={Math.max(0, Math.min(def.options.length - 1, Math.round(value)))}
                  onChange={(e) => set(def.key, Number(e.target.value))}
                  onContextMenu={(e) => menu(e, def)}
                  aria-label={def.label}
                  title={`${def.label}: ${def.options[Math.round(value)] ?? ''}`}
                >
                  {def.options.map((option, index) => (
                    <option key={`${option}-${index}`} value={index}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  className="synth-dense__switch"
                  onClick={(e) => {
                    const n = def.options!.length;
                    set(def.key, (Math.round(value) + (e.shiftKey ? -1 : 1) + n) % n);
                  }}
                  onContextMenu={(e) => menu(e, def)}
                  aria-label={`${def.label}: ${def.options[Math.round(value)] ?? ''}`}
                  title={`${def.label}: ${def.options[Math.round(value)] ?? ''}`}
                >
                  {shortOption(def.options[Math.round(value)] ?? '')}
                </button>
              )}
              <span className="synth-dense__control-label" style={{ color: text }}>
                {compactLabel(def.label)}
              </span>
            </div>
          ) : (
            <SpecKnob
              def={def}
              value={value}
              onChange={(v) => set(def.key, v)}
              style={knob}
              accent={accent}
              text={text}
              size={22}
              dense
              inlineValue
              displayLabel={compactLabel(def.label)}
              cellWidth={columns > 8 ? 32 : 40}
              onMenu={(e) => menu(e, def)}
            />
          )}
        </div>
      );
    });
  };

  return (
    <div className="synth-dense" style={{ height: bodyHeight }} data-testid="synth-dense">
      <div
        className="synth-dense__grid"
        style={{
          gridTemplateColumns: `${railWidth}px repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gap: gridGap,
        }}
      >
        {chunks.map((row, rowIndex) => {
          const sections = rowSections(row);
          const label = sections.parts.map((part, index) => <span key={`${part}-${index}`}>{part}</span>);
          return (
            <React.Fragment key={`row-${rowIndex}`}>
              <div className="synth-dense__rail" title={sections.full} style={{ color: text }}>
                {label}
                {sections.extra > 0 && <span className="synth-dense__rail-extra">+{sections.extra}</span>}
              </div>
              {cells(row, rowIndex)}
              {Array.from({ length: columns - row.length }, (_, index) => (
                <span key={`empty-${rowIndex}-${index}`} className="synth-dense__empty" aria-hidden="true" />
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
