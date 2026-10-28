/**
 * Recorded instruments: one rack device per instrument pack this build ships (shared/instruments/packs.ts)
 * (real multisampled recordings, played by the 'multisample' engine). Kits get one pad per lane
 * with its own level / tune / length. Variation varies repeated hits of keys without round robins.
 */
import { SHIPPED_PACKS } from '../../instruments/packs.ts';
import { packDeviceType, type PackEntry } from '../../instruments/catalogTypes.ts';
import { db, hz, knob, outBlock, pct, secs, type DeviceSpec, type PadDef, type PanelDef, type ParamDef } from './types.ts';

export const RECORDED_KITS = 'Recorded Drums & Percussion';
export const RECORDED_INSTRUMENTS = 'Recorded Instruments';

const LOOKS: Record<string, Pick<PanelDef, 'finish' | 'color' | 'accent' | 'text' | 'knob'>> = {
  drums: { finish: 'black', color: '#1c1916', accent: '#f0a33a', text: '#f3ece2', knob: 'metal' },
  percussion: { finish: 'wood', color: '#2a1a10', accent: '#e9b44c', text: '#f5e9d6', knob: 'vintage' },
  piano: { finish: 'wood', color: '#1d130c', accent: '#d9c8a0', text: '#f2ead8', knob: 'cap' },
  keys: { finish: 'wood', color: '#22170e', accent: '#e0b070', text: '#f2ead8', knob: 'vintage' },
  bass: { finish: 'blue', color: '#14202e', accent: '#5ab0ff', text: '#e8f1fb', knob: 'metal' },
  guitar: { finish: 'red', color: '#2a1214', accent: '#ff6b5a', text: '#fbe9e7', knob: 'chicken' },
  winds: { finish: 'gold', color: '#2a2210', accent: '#f2c94c', text: '#fbf3dc', knob: 'vintage' },
};
const DEFAULT_LOOK = { finish: 'grey', color: '#202226', accent: '#7fd1b9', text: '#eef2f0', knob: 'cap' } as const;

/** Per-pad params: level, tune, length (keys p<n>Level / p<n>Tune / p<n>Decay). */
function laneParams(pads: readonly PadDef[]): ParamDef[] {
  return pads.flatMap((_, i) => [
    db(`p${i + 1}Level`, 'Level', -30, 6, 0, { section: 'Pads' }),
    knob(`p${i + 1}Tune`, 'Tune', -12, 12, 0, { unit: 'st', section: 'Pads' }),
    pct(`p${i + 1}Decay`, 'Length', 1, { section: 'Pads' }),
  ]);
}

const toneBlock = (punch: number): ParamDef[] => [
  pct('punch', 'Punch', punch, { section: 'Tone', cv: true }),
  pct('drive', 'Drive', 0, { section: 'Tone' }),
  hz('tone', 'Tone', 800, 20000, 20000, { section: 'Tone', cv: true }),
];

function kitSpec(p: PackEntry): DeviceSpec {
  const pads: PadDef[] = (p.lanes ?? []).map((l) => ({ name: l.name, note: l.note, voice: l.role ?? 'perc' }));
  return {
    type: packDeviceType(p.id),
    name: p.name,
    short: p.name.toUpperCase(),
    kind: 'instrument',
    family: 'studio',
    group: RECORDED_KITS,
    category: p.category,
    engine: 'multisample',
    engineConfig: { pack: p.id },
    description: p.description,
    tags: ['recorded', 'samples', 'acoustic', 'real drums', p.category],
    params: [
      knob('tune', 'Tune', -12, 12, 0, { unit: 'st', section: 'Kit' }),
      knob('velSens', 'Vel Sens', 0, 1.5, 1, { section: 'Kit' }),
      pct('decay', 'Length', 1, { section: 'Kit', cv: true }),
      pct('vary', 'Variation', 0.5, { section: 'Kit' }),
      ...toneBlock(0.25),
      ...outBlock(0.85),
      ...laneParams(pads),
    ],
    pads,
    panel: { ...(LOOKS[p.category] ?? LOOKS.drums), logo: p.name, tagline: `recorded kit · ${p.author}`, display: 'pads', pads: pads.length, units: 3 },
    macro: { label: 'Punch', param: 'punch', min: 0, max: 1 },
  };
}

function instrumentSpec(p: PackEntry): DeviceSpec {
  return {
    type: packDeviceType(p.id),
    name: p.name,
    short: p.name.toUpperCase(),
    kind: 'instrument',
    family: 'studio',
    group: RECORDED_INSTRUMENTS,
    category: p.category,
    engine: 'multisample',
    engineConfig: { pack: p.id },
    description: p.description,
    tags: ['recorded', 'samples', 'acoustic', p.category],
    params: [
      knob('tune', 'Transpose', -24, 24, 0, { unit: 'st', step: 1, section: 'Play' }),
      knob('fine', 'Fine', -50, 50, 0, { unit: 'ct', section: 'Play' }),
      knob('velSens', 'Vel Sens', 0, 1.5, 1, { section: 'Play' }),
      pct('vary', 'Variation', 0.5, { section: 'Play' }),
      secs('attack', 'Attack', 0.001, 4, 0.001, { section: 'Envelope' }),
      ...(p.oneShot
        ? [pct('decay', 'Length', 1, { section: 'Envelope', cv: true })]
        : [secs('release', 'Release', 0.01, 8, p.release ?? 0.4, { section: 'Envelope' })]),
      ...toneBlock(0),
      ...outBlock(0.85),
    ],
    panel: { ...(LOOKS[p.category] ?? DEFAULT_LOOK), logo: p.name, tagline: `recorded instrument · ${p.author}`, display: 'scope', units: 2 },
    macro: { label: 'Tone', param: 'tone', min: 800, max: 20000 },
  };
}

export const SAMPLED_SPECS: DeviceSpec[] = SHIPPED_PACKS.map((p) => (p.kind === 'drums' ? kitSpec(p) : instrumentSpec(p)));
