/**
 * Studio hardware emulations (Web Audio models, not the manufacturers' code or samples).
 * Names identify the hardware being modelled; see FIXES.md about trademarks before distributing.
 */
import {
  compParams,
  drumParams,
  grooveParams,
  polyParams,
  wavetableParams,
  westcoastParams,
} from './builders.ts';
import { db, knob, pct, sel, toggle, type DeviceSpec, type PadDef, type ParamDef } from './types.ts';

const H = 'hardware' as const;

// ---------------------------------------------------------------- drum pad sets

const P = (name: string, note: number, voice: string, extra: Partial<PadDef> = {}): PadDef => ({ name, note, voice, ...extra });

const PADS_808: PadDef[] = [
  P('Bass Drum', 36, 'kick808', { decay: 0.6 }),
  P('Snare', 38, 'snare808'),
  P('Low Tom', 41, 'tomLo'),
  P('Mid Tom', 45, 'tomMid'),
  P('Hi Tom', 48, 'tomHi'),
  P('Rim Shot', 37, 'rim'),
  P('Hand Clap', 39, 'clap'),
  P('Cowbell', 56, 'cowbell'),
  P('Cymbal', 49, 'cymbal', { decay: 0.7 }),
  P('Open Hat', 46, 'hatO', { choke: 1 }),
  P('Closed Hat', 42, 'hatC', { choke: 1 }),
  P('Low Conga', 64, 'congaLo'),
  P('Mid Conga', 63, 'congaMid'),
  P('Hi Conga', 62, 'congaHi'),
  P('Claves', 75, 'clave'),
  P('Maracas', 70, 'maracas'),
];

const PADS_TR8S: PadDef[] = [
  P('Bass Drum', 36, 'kick'),
  P('Snare', 38, 'snare'),
  P('Low Tom', 41, 'tomLo'),
  P('Mid Tom', 45, 'tomMid'),
  P('Hi Tom', 48, 'tomHi'),
  P('Rim Shot', 37, 'rim'),
  P('Hand Clap', 39, 'clap'),
  P('Closed Hat', 42, 'hatC', { choke: 1 }),
  P('Open Hat', 46, 'hatO', { choke: 1 }),
  P('Crash', 49, 'cymbal'),
  P('Ride', 51, 'ride'),
];

const PADS_VOLCA: PadDef[] = [
  P('Kick', 36, 'kickAnalog'), P('Snare', 38, 'snareAnalog'), P('Lo Tom', 41, 'tomLo'), P('Hi Tom', 48, 'tomHi'),
  P('Cl Hat', 42, 'hatC', { choke: 1 }), P('Op Hat', 46, 'hatO', { choke: 1 }), P('Clap', 39, 'clap'), P('Claves', 75, 'clave'),
  P('Agogo', 67, 'agogo'), P('Crash', 49, 'cymbal'),
];

const GROOVE_PADS: PadDef[] = [
  P('Kick', 36, 'kick'),
  P('Snare', 37, 'snare'),
  P('Clap', 38, 'clap'),
  P('Rim', 39, 'rim'),
  P('Closed Hat', 40, 'hatC', { choke: 1 }),
  P('Open Hat', 41, 'hatO', { choke: 1 }),
  P('Low Tom', 42, 'tomLo'),
  P('Hi Tom', 43, 'tomHi'),
  P('Shaker', 44, 'maracas'),
  P('Perc', 45, 'congaMid'),
  P('Cowbell', 46, 'cowbell'),
  P('Crash', 47, 'cymbal'),
  P('Ride', 48, 'ride'),
  P('808 Bass', 49, 'bass808', { decay: 0.7 }),
  P('Zap', 50, 'zap'),
  P('Noise FX', 51, 'noiseSweep'),
];

const KITS_MPC = ['Boom Bap', 'Trap', 'Lo-Fi', 'House', 'Techno', 'Drill'] as const;
const KITS_ELEKTRON = ['Techno', 'Industrial', 'Minimal', 'Glitch', 'Ambient'] as const;

// ---------------------------------------------------------------- helpers

function synth(o: Omit<DeviceSpec, 'family' | 'kind' | 'group'> & { group?: string }): DeviceSpec {
  return { family: H, kind: 'instrument', group: 'Hardware Synths', ...o };
}
function groove(o: Omit<DeviceSpec, 'family' | 'kind' | 'group' | 'engine' | 'category'>): DeviceSpec {
  return { family: H, kind: 'instrument', group: 'Grooveboxes & Production Centers', engine: 'groove', category: 'drums', ...o };
}
function drums(o: Omit<DeviceSpec, 'family' | 'kind' | 'group' | 'category'>): DeviceSpec {
  return { family: H, kind: 'instrument', group: 'Drum Machines', category: 'drums', ...o };
}
function outboard(o: Omit<DeviceSpec, 'family' | 'kind' | 'group'>): DeviceSpec {
  return { family: H, kind: 'effect', group: 'Outboard Compressors & EQ', ...o };
}

function summingParams(channels: number, extra: ParamDef[]): ParamDef[] {
  const p: ParamDef[] = [];
  for (let i = 1; i <= channels; i++) {
    const section = `Ch ${i}`;
    p.push(
      db(`ch${i}Level`, `Ch ${i}`, -60, 6, 0, { section, control: 'fader' }),
      knob(`ch${i}Pan`, 'Bal', -1, 1, 0, { section }),
      toggle(`ch${i}Mute`, 'Mute', 0, { section })
    );
  }
  p.push(...extra, db('output', 'Output', -24, 12, 0, { section: 'Master', cv: true }));
  return p;
}

function routes(channels: number): ParamDef[] {
  const opts = ['Normal', ...Array.from({ length: channels }, (_, i) => `In ${i + 1}`), 'Off'];
  return Array.from({ length: channels }, (_, i) => sel(`route${i + 1}`, `Out ${i + 1}`, opts, 0, { section: 'Front Patch', control: 'select' }));
}

const DI_COMMON = (o: { merge?: boolean; filter?: boolean; fat?: boolean; pads?: readonly string[] }): ParamDef[] => {
  const p: ParamDef[] = [
    sel('pad', 'Pad', o.pads ?? ['0 dB', '-15 dB', '-30 dB'], 0, { section: 'Input' }),
    toggle('polarity', '180° Polarity', 0, { section: 'Input' }),
  ];
  if (o.merge) p.push(toggle('merge', 'Merge (mono)', 0, { section: 'Input' }));
  if (o.filter) p.push(toggle('lowCut', 'Low Cut 80 Hz', 0, { section: 'Input' }));
  if (o.fat) p.push(toggle('fat', 'Fat / Thru', 0, { section: 'Input' }));
  p.push(pct('color', 'Transformer', 0.35, { section: 'Output' }), db('output', 'Level', -24, 12, 0, { section: 'Output' }));
  return p;
};

// ---------------------------------------------------------------- specs

export const HARDWARE_SPECS: DeviceSpec[] = [
  // ================= Hardware synthesizers
  synth({
    type: 'moog_sub37', name: 'Subterra 37', short: 'SUBTERRA 37', category: 'bass', engine: 'poly',
    engineConfig: { maxVoices: 2, ladder: true, drive: 'moog' },
    description: 'Paraphonic analog: 2 VCOs + sub + noise, 4-pole ladder filter with Multidrive, dual ADSR, LFO. Duo mode plays two voices.',
    tags: ['bass', 'lead', 'analog', 'ladder', 'fat', 'mono'],
    params: polyParams({ filters: ['Ladder 24', 'Ladder 18', 'Ladder 12', 'Ladder 6'], cutoff: 900, resonance: 0.3, voiceMode: 1, glide: 0.02, env: [0.003, 0.4, 0.6, 0.25], fenv: [0.003, 0.35, 0.15, 0.3, 0.55] }),
    panel: { finish: 'wood', color: '#141414', accent: '#e8e2d0', text: '#f5f1e6', knob: 'moog', logo: 'SUBTERRA', tagline: 'paraphonic analog synthesizer', units: 3 },
    macro: { label: 'Cutoff', param: 'cutoff', min: 150, max: 6000 },
  }),
  synth({
    type: 'prophet6', name: 'Seer-6 Analog Poly', short: 'SEER-6', category: 'synth', engine: 'poly',
    engineConfig: { maxVoices: 6, drift: 0.4 },
    description: '6-voice analog poly: 2 VCOs with shape morph + sub, resonant LP and HP filters, Poly Mod (osc 2 → osc 1 FM), vintage drift.',
    tags: ['poly', 'pads', 'brass', 'chords', 'analog', 'vintage'],
    params: polyParams({ filters: ['LP 4-Pole', 'HP 2-Pole', 'BP'], xmod: true, cutoff: 2600, resonance: 0.2 }),
    panel: { finish: 'wood', color: '#191919', accent: '#d64242', text: '#eaeaea', knob: 'cap', logo: 'SEER-6', tagline: '6-voice analog polysynth', units: 3 },
    macro: { label: 'Cutoff', param: 'cutoff', min: 300, max: 9000 },
  }),
  synth({
    type: 'minilogue_xd', name: 'Polyglot XD', short: 'POLYGLOT XD', category: 'synth', engine: 'poly',
    engineConfig: { maxVoices: 4, multiEngine: true },
    description: '4-voice hybrid: 2 analog VCOs + digital multi-engine (noise / VPM), 2-pole LP, cross mod, built-in delay/reverb character.',
    tags: ['poly', 'hybrid', 'lead', 'pads', 'modern'],
    params: [...polyParams({ filters: ['LP 2-Pole', 'LP 4-Pole'], xmod: true, cutoff: 3000, resonance: 0.25 }), pct('fxDelay', 'Delay FX', 0.15, { section: 'Effects' }), pct('fxReverb', 'Reverb FX', 0.15, { section: 'Effects' })],
    panel: { finish: 'black', color: '#1b1b1d', accent: '#c9c9c9', text: '#e5e5e5', knob: 'metal', logo: 'POLYGLOT', tagline: 'polyphonic analog + digital', display: 'scope', units: 2 },
    macro: { label: 'Cutoff', param: 'cutoff', min: 300, max: 9000 },
  }),
  synth({
    type: 'matrixbrute', name: 'Gridbeast', short: 'GRIDBEAST', category: 'bass', engine: 'poly',
    engineConfig: { maxVoices: 1, brute: true },
    description: 'Monophonic analog powerhouse: 3 VCOs with Brute Factor, Steiner + ladder filters, cross mod, deep mod matrix (LFO / envelopes).',
    tags: ['mono', 'bass', 'lead', 'aggressive', 'analog'],
    params: polyParams({ oscs: 3, filters: ['Steiner LP', 'Ladder 24', 'Steiner BP', 'Steiner HP', 'Notch'], xmod: true, cutoff: 1200, resonance: 0.35, voiceMode: 1, glide: 0.03 }),
    panel: { finish: 'grey', color: '#2a2c30', accent: '#ff7a1a', text: '#f0f0f0', knob: 'metal', logo: 'GRIDBEAST', tagline: 'analog mono synth with mod matrix', display: 'steps', units: 4 },
    macro: { label: 'Cutoff', param: 'cutoff', min: 150, max: 8000 },
  }),
  synth({
    type: 'nord_lead4', name: 'Redline Lead', short: 'REDLINE LEAD', category: 'synth', engine: 'poly',
    engineConfig: { maxVoices: 8, va: true },
    description: 'Virtual analog performance synth: 2 oscillators with FM and sync character, multimode filter, unison, impulse morph.',
    tags: ['va', 'lead', 'trance', 'poly', 'red'],
    params: polyParams({ filters: ['LP 24', 'LP 12', 'HP 24', 'BP 12', 'LP+HP'], xmod: true, cutoff: 3200, resonance: 0.3 }),
    panel: { finish: 'red', color: '#b5161b', accent: '#ffffff', text: '#ffffff', knob: 'plastic', logo: 'REDLINE', tagline: 'performance synthesizer', display: 'lcd', units: 3 },
    macro: { label: 'Cutoff', param: 'cutoff', min: 300, max: 12000 },
  }),
  synth({
    type: 'juno_x', name: 'Lumen-X Poly', short: 'LUMEN-X', category: 'synth', engine: 'poly',
    engineConfig: { maxVoices: 8, juno: true },
    description: '80s chorus poly: DCO saw/pulse + sub + noise, 4-pole LPF, non-resonant HPF, LFO PWM and the classic chorus I / II / I+II.',
    tags: ['pads', 'chorus', 'synthwave', '80s', 'poly'],
    params: polyParams({ filters: ['LPF 24', 'LPF 12', 'HPF'], chorus: true, cutoff: 2600, resonance: 0.15, env: [0.02, 0.6, 0.7, 0.8] }),
    panel: { finish: 'black', color: '#202022', accent: '#e35b2a', text: '#f2f2f2', knob: 'plastic', logo: 'LUMEN-X', tagline: 'chorus polysynth', units: 3 },
    macro: { label: 'Cutoff', param: 'cutoff', min: 300, max: 9000 },
  }),
  synth({
    type: 'novation_peak', name: 'Apex Poly', short: 'APEX', category: 'synth', engine: 'poly',
    engineConfig: { maxVoices: 8, oxford: true },
    description: '8-voice hybrid poly: 3 NCO oscillators (wavetable-rich), analog distortion stages, resonant multimode filter, deep modulation.',
    tags: ['poly', 'hybrid', 'pads', 'modern', 'distortion'],
    params: polyParams({ oscs: 3, filters: ['LP 24', 'LP 12', 'BP 12', 'HP 12', 'HP 24'], xmod: true, cutoff: 3500, resonance: 0.25 }),
    panel: { finish: 'grey', color: '#25272b', accent: '#ff2d55', text: '#f2f2f2', knob: 'cap', logo: 'APEX', tagline: 'polyphonic synthesizer', display: 'lcd', units: 3 },
    macro: { label: 'Cutoff', param: 'cutoff', min: 300, max: 12000 },
  }),
  synth({
    type: 'waldorf_iridium', name: 'Prism Wavetable', short: 'PRISM', category: 'synth', engine: 'wavetable',
    engineConfig: { maxVoices: 8 },
    description: 'Digital wavetable synth: two wavetable oscillators with index modulation, multimode digital filters, unison and evolving pads.',
    tags: ['wavetable', 'digital', 'pads', 'evolving', 'ambient'],
    params: wavetableParams({ motion: true }),
    panel: { finish: 'black', color: '#151517', accent: '#c7a14a', text: '#e8e3d6', knob: 'metal', logo: 'PRISM', tagline: 'digital wavetable synthesizer', display: 'scope', units: 3 },
    macro: { label: 'Wavetable', param: 'posA', min: 0, max: 1 },
  }),
  synth({
    type: 'moog_grandmother', name: 'Heirloom Semi-Modular', short: 'HEIRLOOM', category: 'bass', engine: 'poly',
    engineConfig: { maxVoices: 1, ladder: true, semiModular: true },
    description: 'Semi-modular analog: 2 VCOs, ladder LPF + HPF, ADSR, LFO, arpeggiator-ready and the built-in spring reverb.',
    tags: ['semi-modular', 'mono', 'bass', 'spring reverb', 'vintage'],
    params: polyParams({ filters: ['Ladder 24', 'HP 6'], reverb: true, cutoff: 1200, resonance: 0.3, voiceMode: 1 }),
    panel: { finish: 'cream', color: '#e9e2cf', accent: '#d4402e', text: '#1d1d1d', knob: 'vintage', logo: 'HEIRLOOM', tagline: 'semi-modular analog', units: 3 },
    macro: { label: 'Cutoff', param: 'cutoff', min: 150, max: 7000 },
  }),
  synth({
    type: 'make_noise_shared', name: 'Westside Modular System', short: 'WESTSIDE', category: 'synth', engine: 'westcoast',
    engineConfig: { maxVoices: 1 },
    description: 'West-Coast modular: complex oscillator (FM / AM), timbre wavefolder, low-pass gate, Maths-style function generator, echo/spring.',
    tags: ['modular', 'west coast', 'buchla', 'experimental', 'percussive', 'fm'],
    params: westcoastParams(),
    panel: { finish: 'black', color: '#0f0f0f', accent: '#dcdcdc', text: '#f4f4f4', knob: 'pot', logo: 'westside', tagline: 'west-coast modular', display: 'scope', units: 4 },
    macro: { label: 'Timbre', param: 'fold', min: 0, max: 1 },
  }),

  // ================= Grooveboxes & production centers
  groove({
    type: 'mpc_one', name: 'Beatcenter One', short: 'BEATCENTER ONE', engineConfig: { pads: 16, character: 'mpc' },
    description: '16-pad sampler: kits of drum one-shots (load your own samples per pad), note repeat, master filter and compressor, vintage mode.',
    tags: ['sampler', 'hip hop', 'boom bap', 'beats', 'pads'],
    params: grooveParams(GROOVE_PADS, KITS_MPC), pads: GROOVE_PADS,
    panel: { finish: 'black', color: '#151515', accent: '#d61f2c', text: '#f2f2f2', knob: 'plastic', logo: 'BEATCENTER', tagline: 'standalone production center', display: 'pads', pads: 16, units: 4 },
    macro: { label: 'Filter', param: 'cutoff', min: 200, max: 20000 },
  }),
  groove({
    type: 'mpc_live2', name: 'Beatcenter Live', short: 'BEATCENTER LIVE', engineConfig: { pads: 16, character: 'mpc', synth: true },
    description: 'Battery-powered production center: 16 pads with sample kits, a keygroup / plugin synth track, note repeat, filter, compressor and vintage mode.',
    tags: ['sampler', 'hip hop', 'trap', 'beats', 'synth'],
    params: grooveParams(GROOVE_PADS, KITS_MPC, { synth: true }), pads: GROOVE_PADS,
    panel: { finish: 'black', color: '#171717', accent: '#d61f2c', text: '#f2f2f2', knob: 'plastic', logo: 'BEATCENTER', tagline: 'portable production center', display: 'pads', pads: 16, units: 4 },
    macro: { label: 'Filter', param: 'cutoff', min: 200, max: 20000 },
  }),
  groove({
    type: 'mpc_xse', name: 'Beatcenter XL', short: 'BEATCENTER XL', engineConfig: { pads: 16, character: 'mpc', synth: true },
    description: 'Flagship production center: 16 pads, sample kits per pad, synth track, note repeat, 12-bit vintage emulation, master filter / comp.',
    tags: ['flagship', 'sampler', 'hip hop', 'beats'],
    params: grooveParams(GROOVE_PADS, KITS_MPC, { synth: true }), pads: GROOVE_PADS,
    panel: { finish: 'grey', color: '#232425', accent: '#d61f2c', text: '#f2f2f2', knob: 'metal', logo: 'BEATCENTER', tagline: 'studio production center', display: 'pads', pads: 16, units: 4 },
    macro: { label: 'Vintage', param: 'lofi', min: 0, max: 1 },
  }),
  groove({
    type: 'akai_force', name: 'Beatcenter Grid', short: 'BEATCENTER GRID', engineConfig: { pads: 16, character: 'force', synth: true },
    description: 'Clip-launch production system: pad kit + synth track with note repeat, filter, compressor (scene-style performance).',
    tags: ['clip launch', 'electronic', 'performance', 'synth'],
    params: grooveParams(GROOVE_PADS, ['House', 'Techno', 'Trap', 'Boom Bap', 'Lo-Fi', 'Drill'], { synth: true }), pads: GROOVE_PADS,
    panel: { finish: 'black', color: '#121212', accent: '#ff3b3b', text: '#ececec', knob: 'plastic', logo: 'BEATCENTER', tagline: 'clip-launch production center', display: 'pads', pads: 16, units: 4 },
    macro: { label: 'Filter', param: 'cutoff', min: 200, max: 20000 },
  }),
  groove({
    type: 'maschine_plus', name: 'Groovemaster+', short: 'GROOVEMASTER+', engineConfig: { pads: 16, character: 'maschine', synth: true },
    description: 'Standalone groove box: 16 pad groups of drum one-shots, a bass / synth track, note repeat, filter, compressor, saturation.',
    tags: ['beats', 'hip hop', 'house', 'pads', 'synth'],
    params: grooveParams(GROOVE_PADS, ['Boom Bap', 'House', 'Trap', 'Techno', 'Lo-Fi', 'Drill'], { synth: true }), pads: GROOVE_PADS,
    panel: { finish: 'black', color: '#18191b', accent: '#ff6a00', text: '#f2f2f2', knob: 'metal', logo: 'GROOVEMASTER+', tagline: 'standalone groove production', display: 'pads', pads: 16, units: 4 },
    macro: { label: 'Filter', param: 'cutoff', min: 200, max: 20000 },
  }),
  groove({
    type: 'octatrack', name: 'Eightfold Sampler', short: 'EIGHTFOLD', engineConfig: { pads: 16, character: 'elektron' },
    description: 'Performance sampler: 16 sample slots, crossfader scenes morphing filter / pitch / decay, note repeat, master filter.',
    tags: ['sampler', 'performance', 'techno', 'crossfader', 'glitch'],
    params: grooveParams(GROOVE_PADS, KITS_ELEKTRON, { xfade: true }), pads: GROOVE_PADS,
    panel: { finish: 'black', color: '#1a1a1a', accent: '#f7c600', text: '#e8e8e8', knob: 'cap', logo: 'eightfold', tagline: 'performance sampler', display: 'lcd', pads: 16, units: 3 },
    macro: { label: 'Crossfader', param: 'xfade', min: 0, max: 1 },
  }),
  groove({
    type: 'syntakt', name: 'Synthkit Drum Computer', short: 'SYNTHKIT', engineConfig: { pads: 12, character: 'elektron', synth: true, synthDrums: true },
    description: '12-track drum & synth machine: analog-style and digital drum machines per track plus a melodic synth track.',
    tags: ['drum machine', 'synth', 'techno', 'analog'],
    params: grooveParams(GROOVE_PADS.slice(0, 12), KITS_ELEKTRON, { synth: true, lofi: false }), pads: GROOVE_PADS.slice(0, 12),
    panel: { finish: 'black', color: '#1b1b1b', accent: '#ff5a1f', text: '#e8e8e8', knob: 'cap', logo: 'synthkit', tagline: 'drum computer & synthesizer', display: 'lcd', pads: 12, units: 2 },
    macro: { label: 'Filter', param: 'cutoff', min: 200, max: 20000 },
  }),
  groove({
    type: 'mc707', name: 'Groovestation GS-8', short: 'GS-8', engineConfig: { pads: 16, character: 'roland', synth: true },
    description: 'Groovebox: drum track with classic machine kits, a synth track, note repeat, master filter and compressor.',
    tags: ['groovebox', 'house', 'techno', 'synth'],
    params: grooveParams(GROOVE_PADS, ['909-Style House', '808-Style Electro', 'Techno', 'Trap', 'Lo-Fi'], { synth: true }), pads: GROOVE_PADS,
    panel: { finish: 'black', color: '#1c1c1e', accent: '#ff7b00', text: '#f0f0f0', knob: 'plastic', logo: 'GROOVESTATION', tagline: 'GS-8 groovebox', display: 'lcd', pads: 16, units: 3 },
    macro: { label: 'Filter', param: 'cutoff', min: 200, max: 20000 },
  }),
  groove({
    type: 'circuit_tracks', name: 'Loopgrid Tracks', short: 'LOOPGRID', engineConfig: { pads: 8, character: 'circuit', synth: true },
    description: 'Grid groovebox: 4 drum parts + synth track (Nova-style poly synth), master filter, side-chain-style compression.',
    tags: ['groovebox', 'house', 'synth', 'grid'],
    params: grooveParams(GROOVE_PADS.slice(0, 8), ['Circuit House', 'Circuit Techno', 'Circuit Trap', 'Lo-Fi'], { synth: true }), pads: GROOVE_PADS.slice(0, 8),
    panel: { finish: 'black', color: '#161616', accent: '#00e1ff', text: '#e8e8e8', knob: 'led', logo: 'loopgrid', tagline: 'pad groovebox', display: 'pads', pads: 8, units: 2 },
    macro: { label: 'Filter', param: 'cutoff', min: 200, max: 20000 },
  }),
  groove({
    type: 'polyend_play', name: 'Playground+', short: 'PLAYGROUND+', engineConfig: { pads: 16, character: 'polyend', synth: true },
    description: 'Sample + synth groovebox: sample kits on 16 pads, a synth engine track, note repeat, master filter and saturation.',
    tags: ['groovebox', 'samples', 'synth', 'electronic'],
    params: grooveParams(GROOVE_PADS, ['Play House', 'Play Techno', 'Lo-Fi', 'Glitch', 'Trap'], { synth: true }), pads: GROOVE_PADS,
    panel: { finish: 'white', color: '#ececec', accent: '#ff3d00', text: '#151515', knob: 'cap', logo: 'playground', tagline: 'sample groovebox', display: 'pads', pads: 16, units: 3 },
    macro: { label: 'Filter', param: 'cutoff', min: 200, max: 20000 },
  }),

  // ================= Drum machines
  drums({
    type: 'tr08', name: 'Boomtown 8', short: 'BOOMTOWN 8', engine: 'drums', engineConfig: { character: '808' },
    description: 'Rhythm Composer 808 voices: boomy tuned bass drum, snare snappy, toms/congas, clap, cowbell, cymbal and hats (accent, tune, decay).',
    tags: ['808', 'hip hop', 'trap', 'electro', 'boom'],
    params: drumParams(PADS_808), pads: PADS_808,
    panel: { finish: 'grey', color: '#2b2b2b', accent: '#f26722', text: '#f2f2f2', knob: 'cap', logo: 'BOOMTOWN', tagline: '808-style rhythm composer', display: 'steps', pads: 16, units: 3 },
    macro: { label: 'Kick Decay', param: 'p1Decay', min: 0.2, max: 1 },
  }),
  drums({
    type: 'tr8s', name: 'Boomtown 8S', short: 'BOOMTOWN 8S', engine: 'drums', engineConfig: { character: 'tr8s', kitVoices: true },
    description: 'Rhythm Performer: switchable 808 / 909 / 707 / 606 / 727 kits, per-instrument tune / decay / tone / level, accent, drive.',
    tags: ['909', '808', 'house', 'techno', 'drum machine'],
    params: drumParams(PADS_TR8S, { kits: ['909 Kit', '808 Kit', '707 Kit', '606 Kit', '727 Kit'] }), pads: PADS_TR8S,
    panel: { finish: 'black', color: '#1a1a1a', accent: '#f26722', text: '#f2f2f2', knob: 'cap', logo: 'BOOMTOWN', tagline: 'multi-kit rhythm performer', display: 'steps', pads: 11, units: 3 },
    macro: { label: 'Drive', param: 'drive', min: 0, max: 1 },
  }),
  drums({
    type: 'digitakt2', name: 'Stepline II Drum Sampler', short: 'STEPLINE II', engine: 'groove', engineConfig: { pads: 16, character: 'elektron' },
    description: 'Drum computer & sampler: 16 sample tracks (load your own per pad), multimode filter, overdrive, note repeat / retrig.',
    tags: ['sampler', 'techno', 'drum machine', 'samples'],
    params: grooveParams(GROOVE_PADS, KITS_ELEKTRON), pads: GROOVE_PADS,
    panel: { finish: 'black', color: '#1d1d1d', accent: '#d9d9d9', text: '#f0f0f0', knob: 'cap', logo: 'stepline', tagline: 'drum computer & sampler', display: 'lcd', pads: 16, units: 2 },
    macro: { label: 'Filter', param: 'cutoff', min: 200, max: 20000 },
  }),
  drums({
    type: 'volca_beats', name: 'Pocket Beats', short: 'POCKET BEATS', engine: 'drums', engineConfig: { character: 'volca' },
    description: 'Analog kick / snare / toms / hats with PCM clap, claves, agogo and crash; stutter-ready tight analog circuits.',
    tags: ['analog', 'lo-fi', 'drum machine'],
    params: drumParams(PADS_VOLCA),
    pads: PADS_VOLCA,
    panel: { finish: 'black', color: '#202020', accent: '#ffb000', text: '#f0f0f0', knob: 'plastic', logo: 'POCKET', tagline: 'beats · analogue rhythm machine', display: 'steps', pads: 10, units: 2 },
  }),
  drums({
    type: 'rd8', name: 'Boomtown Analog', short: 'BOOMTOWN A', engine: 'drums', engineConfig: { character: '808' },
    description: 'Analog 808-style rhythm designer: the classic 16 voices with wave designer and analog filter flavour.',
    tags: ['808', 'analog', 'trap', 'electro', 'drum machine'],
    params: drumParams(PADS_808), pads: PADS_808,
    panel: { finish: 'grey', color: '#30302e', accent: '#ff8a00', text: '#f2f2f2', knob: 'cap', logo: 'BOOMTOWN', tagline: 'analog rhythm designer', display: 'steps', pads: 16, units: 3 },
  }),
  drums({
    type: 'perkons', name: 'Ironworks HD-4', short: 'IRONWORKS HD-4', engine: 'drums', engineConfig: { character: 'perkons', perVoiceDrive: true },
    description: '4-voice hybrid drum machine: each voice with drive, analog filter and mod; brutal industrial kicks to metallic perc.',
    tags: ['industrial', 'techno', 'distorted', 'drum machine'],
    params: drumParams([P('Voice 1 Kick', 36, 'kickAnalog', { decay: 0.55 }), P('Voice 2 Snare', 38, 'snareAnalog'), P('Voice 3 Metal', 42, 'metal'), P('Voice 4 FM Perc', 45, 'fmPerc')]),
    pads: [P('Voice 1 Kick', 36, 'kickAnalog', { decay: 0.55 }), P('Voice 2 Snare', 38, 'snareAnalog'), P('Voice 3 Metal', 42, 'metal'), P('Voice 4 FM Perc', 45, 'fmPerc')],
    panel: { finish: 'black', color: '#0e0e0e', accent: '#ffffff', text: '#f5f5f5', knob: 'pot', logo: 'IRONWORKS', tagline: '4-voice hybrid drums', display: 'steps', pads: 4, units: 3 },
    macro: { label: 'Drive', param: 'drive', min: 0, max: 1 },
  }),
  drums({
    type: 'drumbrute_impact', name: 'Smackdown Analog Drums', short: 'SMACKDOWN', engine: 'drums', engineConfig: { character: 'brute' },
    description: 'Analog drum machine: kick, snare, toms, cymbal, cowbell, hats and FM drum with per-voice Color distortion.',
    tags: ['analog', 'techno', 'aggressive', 'drum machine'],
    params: drumParams([
      P('Kick', 36, 'kickAnalog'), P('Snare', 38, 'snareAnalog'), P('Tom High', 48, 'tomHi'), P('Tom Low', 41, 'tomLo'), P('Cymbal', 49, 'cymbal'),
      P('Cowbell', 56, 'cowbell'), P('Closed Hat', 42, 'hatC', { choke: 1 }), P('Open Hat', 46, 'hatO', { choke: 1 }), P('FM Drum', 45, 'fmPerc'),
    ]),
    pads: [
      P('Kick', 36, 'kickAnalog'), P('Snare', 38, 'snareAnalog'), P('Tom High', 48, 'tomHi'), P('Tom Low', 41, 'tomLo'), P('Cymbal', 49, 'cymbal'),
      P('Cowbell', 56, 'cowbell'), P('Closed Hat', 42, 'hatC', { choke: 1 }), P('Open Hat', 46, 'hatO', { choke: 1 }), P('FM Drum', 45, 'fmPerc'),
    ],
    panel: { finish: 'grey', color: '#2e3034', accent: '#ff7a1a', text: '#f0f0f0', knob: 'metal', logo: 'SMACKDOWN', tagline: 'analog drum machine', display: 'steps', pads: 9, units: 3 },
  }),
  drums({
    type: 'tempest', name: 'Stormfront Analog Drums', short: 'STORMFRONT', engine: 'drums', engineConfig: { character: 'tempest' },
    description: 'Analog drum machine: 6 analog voices (2 VCOs + noise each) for punchy kicks, snares, toms, hats and percussive synth hits.',
    tags: ['dsi', 'analog', 'drum machine', 'warm'],
    params: drumParams([
      P('Kick', 36, 'kickAnalog'), P('Snare', 38, 'snareAnalog'), P('Clap', 39, 'clap'), P('Closed Hat', 42, 'hatC', { choke: 1 }),
      P('Open Hat', 46, 'hatO', { choke: 1 }), P('Tom', 45, 'tomMid'), P('Perc', 63, 'congaMid'), P('Synth Hit', 60, 'synthHit'),
    ]),
    pads: [
      P('Kick', 36, 'kickAnalog'), P('Snare', 38, 'snareAnalog'), P('Clap', 39, 'clap'), P('Closed Hat', 42, 'hatC', { choke: 1 }),
      P('Open Hat', 46, 'hatO', { choke: 1 }), P('Tom', 45, 'tomMid'), P('Perc', 63, 'congaMid'), P('Synth Hit', 60, 'synthHit'),
    ],
    panel: { finish: 'wood', color: '#1d1d1d', accent: '#d64242', text: '#eaeaea', knob: 'cap', logo: 'STORMFRONT', tagline: 'analog drum machine', display: 'pads', pads: 8, units: 3 },
  }),
  drums({
    type: 'pulsar23', name: 'Organism-23', short: 'ORGANISM-23', engine: 'drums', engineConfig: { character: 'soma' },
    description: 'Organismic drum machine: bass drum, bass, snare, hi-hat and cymbal voices with wild modulation and distortion.',
    tags: ['experimental', 'industrial', 'noise', 'drum machine'],
    params: drumParams([P('Bass Drum', 36, 'kickAnalog'), P('Bass', 37, 'bass808'), P('Snare', 38, 'snareAnalog'), P('Hi-Hat', 42, 'hatC'), P('Cymbal', 49, 'cymbal')]),
    pads: [P('Bass Drum', 36, 'kickAnalog'), P('Bass', 37, 'bass808'), P('Snare', 38, 'snareAnalog'), P('Hi-Hat', 42, 'hatC'), P('Cymbal', 49, 'cymbal')],
    panel: { finish: 'wood', color: '#2a1f16', accent: '#e0c088', text: '#f3e6cc', knob: 'vintage', logo: 'ORGANISM', tagline: 'organismic drum machine', display: 'scope', pads: 5, units: 3 },
    macro: { label: 'Drive', param: 'drive', min: 0, max: 1 },
  }),
  drums({
    type: 'drm1', name: 'Drumforge DF-1', short: 'DRUMFORGE DF-1', engine: 'drums', engineConfig: { character: 'vermona' },
    description: '8-channel analog drum synth: two drum channels, two multi channels, snare, hi-hats and hand clap with fine tone shaping.',
    tags: ['analog', 'drum synth', 'techno', 'warm'],
    params: drumParams([
      P('Drum 1', 36, 'kickAnalog'), P('Drum 2', 41, 'tomLo'), P('Multi 1', 45, 'tomMid'), P('Multi 2', 48, 'tomHi'),
      P('Snare', 38, 'snareAnalog'), P('Hand Clap', 39, 'clap'), P('Hi-Hat Cl', 42, 'hatC', { choke: 1 }), P('Hi-Hat Op', 46, 'hatO', { choke: 1 }),
    ]),
    pads: [
      P('Drum 1', 36, 'kickAnalog'), P('Drum 2', 41, 'tomLo'), P('Multi 1', 45, 'tomMid'), P('Multi 2', 48, 'tomHi'),
      P('Snare', 38, 'snareAnalog'), P('Hand Clap', 39, 'clap'), P('Hi-Hat Cl', 42, 'hatC', { choke: 1 }), P('Hi-Hat Op', 46, 'hatO', { choke: 1 }),
    ],
    panel: { finish: 'blue', color: '#16233a', accent: '#e8e8e8', text: '#f0f0f0', knob: 'metal', logo: 'DRUMFORGE', tagline: 'analog drum synthesizer', pads: 8, units: 3 },
  }),

  // ================= Outboard compressors & EQ
  outboard({
    type: 'ssl_gbus', name: 'Console Bus Compressor', short: 'BUS COMP', category: 'dynamics', engine: 'dynamics',
    engineConfig: { model: 'vca', ratioValues: [2, 4, 10], attackValues: [0.1, 0.3, 1, 3, 10, 30], releaseValues: [100, 300, 600, 1200, -1] },
    description: 'VCA bus compressor: the "glue" — threshold, ratio 2/4/10, stepped attack and release incl. Auto, make-up, mix.',
    tags: ['bus compressor', 'glue', 'mix bus', 'vca', 'mastering'],
    params: compParams({ threshold: [-20, 15, 0], ratios: ['2:1', '4:1', '10:1'], ratioDef: 1, attacks: ['0.1 ms', '0.3 ms', '1 ms', '3 ms', '10 ms', '30 ms'], releases: ['0.1 s', '0.3 s', '0.6 s', '1.2 s', 'Auto'], scHpf: true, sidechain: true }),
    ports: { sidechain: true, cvOut: ['gr_out'] },
    panel: { finish: 'grey', color: '#3b3f45', accent: '#f2f2f2', text: '#f5f5f5', knob: 'cap', logo: 'CONSOLE', tagline: 'British console-style bus compressor', display: 'gr', units: 1 },
    macro: { label: 'Glue', param: 'threshold', min: 4, max: -16 },
  }),
  outboard({
    type: 'distressor', name: 'Punisher Compressor', short: 'PUNISHER', category: 'dynamics', engine: 'dynamics',
    engineConfig: { model: 'distressor', ratioValues: [1, 2, 3, 4, 6, 10, 20, 40] },
    description: 'Hybrid compressor: input-driven, ratios 1:1 to Nuke, Dist 2 / Dist 3 harmonic modes, HP / band detector.',
    tags: ['compressor', 'drums', 'vocals', 'aggressive', 'saturation'],
    params: [
      knob('input', 'Input', 0, 10, 4, { section: 'Distressor', cv: true }),
      knob('attackKnob', 'Attack', 0, 10, 5, { section: 'Distressor' }),
      knob('releaseKnob', 'Release', 0, 10, 5, { section: 'Distressor' }),
      knob('outputKnob', 'Output', 0, 10, 4, { section: 'Distressor' }),
      toggle('sidechain', 'External SC', 0, { section: 'Distressor' }),
      sel('ratio', 'Ratio', ['1:1', '2:1', '3:1', '4:1', '6:1', '10:1', '20:1', 'Nuke'], 3, { section: 'Mode' }),
      sel('dist', 'Distortion', ['Off', 'Dist 2', 'Dist 3'], 0, { section: 'Mode' }),
      sel('detector', 'Detector', ['Normal', 'HP', 'Band'], 0, { section: 'Mode' }),
      pct('mix', 'Mix', 1, { section: 'Mode', cv: true }),
    ],
    ports: { sidechain: true, cvOut: ['gr_out'] },
    panel: { finish: 'black', color: '#1a1a1a', accent: '#c8c8c8', text: '#f0f0f0', knob: 'metal', logo: 'PUNISHER', tagline: 'colour compressor', display: 'gr', units: 1 },
    macro: { label: 'Input', param: 'input', min: 1, max: 9 },
  }),
  outboard({
    type: 'la2a', name: 'Silkopto Leveling Amp', short: 'SILKOPTO', category: 'dynamics', engine: 'dynamics',
    engineConfig: { model: 'opto', tube: 0.25 },
    description: 'Tube optical leveling amplifier: Peak Reduction and Gain, program-dependent opto release, Compress / Limit.',
    tags: ['opto', 'vocals', 'bass', 'smooth', 'tube', 'leveling'],
    params: [
      knob('peakReduction', 'Peak Reduction', 0, 100, 45, { section: 'Leveling Amplifier', cv: true }),
      knob('gain', 'Gain', 0, 100, 45, { section: 'Leveling Amplifier' }),
      toggle('sidechain', 'External SC', 0, { section: 'Leveling Amplifier' }),
      toggle('limit', 'Limit', 0, { section: 'Leveling Amplifier' }),
      pct('emphasis', 'R37 Emphasis', 0.5, { section: 'Leveling Amplifier' }),
      pct('mix', 'Mix', 1, { section: 'Leveling Amplifier' }),
    ],
    ports: { sidechain: true, cvOut: ['gr_out'] },
    panel: { finish: 'grey', color: '#8f9399', accent: '#1a1a1a', text: '#111', knob: 'vintage', logo: 'SILKOPTO', tagline: 'optical leveling amplifier', display: 'vu', units: 2 },
    macro: { label: 'Peak Red.', param: 'peakReduction', min: 20, max: 80 },
  }),
  outboard({
    type: 'ua1176', name: 'FET Fury Limiter', short: 'FET FURY', category: 'dynamics', engine: 'dynamics',
    engineConfig: { model: 'fet', ratioValues: [4, 8, 12, 20, 100] },
    description: 'FET limiting amplifier: Input drives into the threshold, ultra-fast Attack / Release (1–7), ratios 4 / 8 / 12 / 20 / all-buttons.',
    tags: ['fet', 'drums', 'vocals', 'punch', 'aggressive', 'all buttons'],
    params: [
      knob('input', 'Input', 0, 48, 24, { section: 'Limiting Amp', cv: true }),
      knob('outputKnob', 'Output', 0, 48, 20, { section: 'Limiting Amp' }),
      knob('attackKnob', 'Attack', 1, 7, 4, { section: 'Limiting Amp' }),
      knob('releaseKnob', 'Release', 1, 7, 4, { section: 'Limiting Amp' }),
      toggle('sidechain', 'External SC', 0, { section: 'Limiting Amp' }),
      sel('ratio', 'Ratio', ['4', '8', '12', '20', 'All'], 0, { section: 'Limiting Amp', control: 'buttons' }),
      pct('mix', 'Mix', 1, { section: 'Limiting Amp' }),
    ],
    ports: { sidechain: true, cvOut: ['gr_out'] },
    panel: { finish: 'black', color: '#1b1c1e', accent: '#c0c4c8', text: '#eeeeee', knob: 'metal', logo: 'FET FURY', tagline: 'FET limiting amplifier', display: 'vu', units: 1 },
    macro: { label: 'Input', param: 'input', min: 12, max: 40 },
  }),
  outboard({
    type: 'pultec_eqp1a', name: 'Tubeshelf Program EQ', short: 'TUBESHELF', category: 'eq', engine: 'eq',
    engineConfig: { model: 'pultec' },
    description: 'Passive tube program EQ: low boost + atten (the famous low-end trick), high boost with bandwidth, high atten.',
    tags: ['eq', 'tube', 'low end', 'air', 'mastering', 'vintage'],
    params: [
      sel('lowFreq', 'Low Freq', ['20', '30', '60', '100'], 2, { section: 'Low Frequency', unit: 'Hz' }),
      knob('lowBoost', 'Boost', 0, 10, 3, { section: 'Low Frequency' }),
      knob('lowAtten', 'Atten', 0, 10, 2, { section: 'Low Frequency' }),
      sel('highFreq', 'High Freq', ['3k', '4k', '5k', '8k', '10k', '12k', '16k'], 4, { section: 'High Frequency' }),
      knob('highBoost', 'Boost', 0, 10, 3, { section: 'High Frequency' }),
      knob('bandwidth', 'Bandwidth', 0, 10, 5, { section: 'High Frequency' }),
      sel('attenFreq', 'Atten Sel', ['5k', '10k', '20k'], 1, { section: 'High Frequency' }),
      knob('highAtten', 'Atten', 0, 10, 0, { section: 'High Frequency' }),
      pct('tube', 'Tube', 0.3, { section: 'Output' }),
      db('output', 'Output', -12, 12, 0, { section: 'Output' }),
    ],
    panel: { finish: 'grey', color: '#9aa3a8', accent: '#111', text: '#0d0d0d', knob: 'vintage', logo: 'TUBESHELF', tagline: 'passive tube program equalizer', units: 2 },
    macro: { label: 'Low Boost', param: 'lowBoost', min: 0, max: 8 },
  }),
  outboard({
    type: 'portico2_mbp', name: 'Masterbuss MB-2', short: 'MASTERBUSS', category: 'dynamics', engine: 'dynamics',
    engineConfig: { model: 'vca', silk: true, width: true },
    description: 'Master bus processor: compressor / limiter, Red / Blue transformer colour, stereo field width, parallel blend.',
    tags: ['mastering', 'bus', 'width', 'glue'],
    params: [
      ...compParams({ threshold: [-30, 10, -6], knee: true, sidechain: true }),
      sel('silk', 'Colour', ['Off', 'Red', 'Blue'], 1, { section: 'Colour' }),
      pct('texture', 'Texture', 0.4, { section: 'Colour' }),
      knob('width', 'Stereo Width', 0, 2, 1, { section: 'Stereo Field' }),
      db('ceiling', 'Limiter', -12, 0, -0.3, { section: 'Output' }),
    ],
    ports: { sidechain: true, cvOut: ['gr_out'] },
    panel: { finish: 'blue', color: '#1f3b63', accent: '#e6e6e6', text: '#f2f2f2', knob: 'metal', logo: 'MASTERBUSS', tagline: 'master buss processor', display: 'gr', units: 2 },
    macro: { label: 'Texture', param: 'texture', min: 0, max: 1 },
  }),
  outboard({
    type: 'api2500', name: 'Punchbus Stereo Compressor', short: 'PUNCHBUS', category: 'dynamics', engine: 'dynamics',
    engineConfig: { model: 'api', ratioValues: [1.5, 2, 3, 4, 6, 10, 100], attackValues: [0.03, 0.1, 0.3, 1, 3, 10, 30], releaseValues: [50, 100, 200, 500, 1000, 2000, -1] },
    description: 'Stereo bus compressor: Thrust (SC high-pass tilt), hard / medium / soft knee, new (feed-forward) or old (feedback) type.',
    tags: ['bus compressor', 'punch', 'drums', 'mix bus'],
    params: [
      ...compParams({ threshold: [-20, 10, -4], ratios: ['1.5', '2', '3', '4', '6', '10', '∞'], ratioDef: 3, attacks: ['.03', '.1', '.3', '1', '3', '10', '30 ms'], releases: ['.05', '.1', '.2', '.5', '1', '2 s', 'Var'], sidechain: true }),
      sel('kneeSel', 'Knee', ['Hard', 'Med', 'Soft'], 0, { section: 'Tone' }),
      sel('thrust', 'Thrust', ['Norm', 'Med', 'Loud'], 0, { section: 'Tone' }),
      sel('topology', 'Type', ['New (FF)', 'Old (FB)'], 0, { section: 'Tone' }),
    ],
    ports: { sidechain: true, cvOut: ['gr_out'] },
    panel: { finish: 'black', color: '#202224', accent: '#5fa8ff', text: '#f0f0f0', knob: 'cap', logo: 'PUNCHBUS', tagline: 'stereo bus compressor', display: 'vu', units: 1 },
    macro: { label: 'Threshold', param: 'threshold', min: 6, max: -16 },
  }),
  outboard({
    type: 'avalon747', name: 'Glasstube Spectral Compressor', short: 'GLASSTUBE', category: 'dynamics', engine: 'dynamics',
    engineConfig: { model: 'opto', eqBands: [32, 160, 500, 1400, 3300, 10000], tube: 0.3 },
    description: 'Tube opto compressor + 6-band passive EQ (32 Hz – 10 kHz) for warm, polished vocals and buses.',
    tags: ['opto', 'tube', 'eq', 'vocals', 'warm'],
    params: [
      ...compParams({ threshold: [-30, 0, -12], sidechain: true, mix: false }),
      db('eq1', '32 Hz', -10, 10, 0, { section: 'Spectral EQ' }),
      db('eq2', '160 Hz', -10, 10, 0, { section: 'Spectral EQ' }),
      db('eq3', '500 Hz', -10, 10, 0, { section: 'Spectral EQ' }),
      db('eq4', '1.4 kHz', -10, 10, 0, { section: 'Spectral EQ' }),
      db('eq5', '3.3 kHz', -10, 10, 0, { section: 'Spectral EQ' }),
      db('eq6', '10 kHz', -10, 10, 0, { section: 'Spectral EQ' }),
    ],
    ports: { sidechain: true, cvOut: ['gr_out'] },
    panel: { finish: 'black', color: '#151617', accent: '#5aa0ff', text: '#e8ecf2', knob: 'metal', logo: 'GLASSTUBE', tagline: 'stereo spectral compressor', display: 'gr', units: 2 },
    macro: { label: 'Threshold', param: 'threshold', min: 0, max: -24 },
  }),
  outboard({
    type: 'manley_varimu', name: 'Vari-Gain Tube Limiter', short: 'VARI-GAIN', category: 'dynamics', engine: 'dynamics',
    engineConfig: { model: 'varimu', attackValues: [25, 35, 50, 70, 100], releaseValues: [200, 400, 600, 1000, 2000, 8000], tube: 0.4 },
    description: 'Tube vari-mu mastering compressor: gain-reduction ratio grows with level (1.5:1 compress → 4:1 limit), smooth glue.',
    tags: ['vari-mu', 'tube', 'mastering', 'glue', 'smooth'],
    params: [
      db('threshold', 'Threshold', -30, 0, -10, { section: 'Variable Mu', cv: true }),
      db('input', 'Input', -12, 12, 0, { section: 'Variable Mu' }),
      sel('attack', 'Attack', ['25 ms', '35 ms', '50 ms', '70 ms', '100 ms'], 2, { section: 'Variable Mu' }),
      sel('release', 'Recovery', ['0.2 s', '0.4 s', '0.6 s', '1 s', '2 s', '8 s'], 2, { section: 'Variable Mu' }),
      sel('modeSel', 'Mode', ['Compress', 'Limit'], 0, { section: 'Variable Mu', control: 'buttons' }),
      toggle('scHp', 'HP Sidechain', 0, { section: 'Variable Mu' }),
      toggle('sidechain', 'External SC', 0, { section: 'Variable Mu' }),
      db('makeup', 'Output', 0, 18, 3, { section: 'Output' }),
      pct('mix', 'Mix', 1, { section: 'Output' }),
    ],
    ports: { sidechain: true, cvOut: ['gr_out'] },
    panel: { finish: 'grey', color: '#5a5f66', accent: '#ffd36e', text: '#f4f4f4', knob: 'vintage', logo: 'VARI-GAIN', tagline: 'stereo variable-mu limiter', display: 'vu', units: 2 },
    macro: { label: 'Threshold', param: 'threshold', min: -4, max: -20 },
  }),
  outboard({
    type: 'wa2a', name: 'Warmopto Tube Compressor', short: 'WARMOPTO', category: 'dynamics', engine: 'dynamics',
    engineConfig: { model: 'opto', tube: 0.3 },
    description: 'Tube optical compressor in the classic opto tradition: electro-optical cell, Peak Reduction, Gain, Compress / Limit.',
    tags: ['opto', 'tube', 'vocals', 'bass', 'smooth', 'leveling'],
    params: [
      knob('peakReduction', 'Peak Reduction', 0, 100, 45, { section: 'Opto Compressor', cv: true }),
      knob('gain', 'Gain', 0, 100, 45, { section: 'Opto Compressor' }),
      toggle('sidechain', 'External SC', 0, { section: 'Opto Compressor' }),
      toggle('limit', 'Limit', 0, { section: 'Opto Compressor' }),
      pct('emphasis', 'HF Emphasis', 0.5, { section: 'Opto Compressor' }),
      pct('mix', 'Mix', 1, { section: 'Opto Compressor' }),
    ],
    ports: { sidechain: true, cvOut: ['gr_out'] },
    panel: { finish: 'black', color: '#222', accent: '#e8c35a', text: '#f2f2f2', knob: 'vintage', logo: 'WARMOPTO', tagline: 'tube optical compressor', display: 'vu', units: 2 },
    macro: { label: 'Peak Red.', param: 'peakReduction', min: 20, max: 80 },
  }),

  // ================= Summing mixers
  ...(
    [
      ['neve5059', 'Orbiter 16 Summing Mixer', 'ORBITER 16', 8, 'neve', 'Satellite-style summing mixer: 16 channels into a transformer output with Red / Blue colour and Texture drive.', ['summing', 'transformer', 'british'], 'blue', '#1f3b63'],
      ['dangerous_2bus', 'Twobus+ Summing Mixer', 'TWOBUS+', 8, 'clean', 'Clean analog summing with Harmonics, Paralimit and X-Former colour options.', ['summing', 'clean', 'harmonics'], 'black', '#161616'],
      ['ssl_sigma', 'Delta Summing Mixer', 'DELTA SUM', 8, 'ssl', 'British console-style summing with VCA-style mix bus character and a stereo master.', ['summing', 'console', 'vca', 'british'], 'grey', '#3b3f45'],
      ['heritage_mcm24', 'Classic Sum 24', 'CLASSIC SUM 24', 12, 'neve', 'Console-style summing mixer with classic transformer-coupled colour.', ['summing', 'console', 'transformer'], 'grey', '#4b5058'],
      ['spl_mixdream', 'Dreamsum Summing Mixer', 'DREAMSUM', 8, 'spl', 'High-voltage summing: wide headroom, Classic insert colour and stereo Width.', ['summing', 'headroom', 'width'], 'black', '#1e1e20'],
      ['nicerizer16', 'Glowsum 16', 'GLOWSUM 16', 8, 'nicerizer', 'Class-A summing with a Glow switch for extra harmonic richness.', ['summing', 'class a', 'harmonics'], 'black', '#202022'],
      ['burl_b32', 'Northshore 32 Summing Mixer', 'NORTHSHORE 32', 8, 'burl', 'Discrete Class-A summing with output transformers: weighty low end and bold mids.', ['summing', 'transformer', 'class a'], 'black', '#121212'],
      ['api8200', 'Bigbus Summing Mixer', 'BIGBUS', 4, 'api', '8-channel summing with discrete op-amp punch, pan and stereo output.', ['summing', 'punch', 'discrete'], 'black', '#1f2124'],
      ['folcrom', 'Passive Sum 16', 'PASSIVE SUM 16', 8, 'passive', 'Passive 16-channel summing: transparent, needs make-up gain (Output) after the sum.', ['passive', 'summing', 'transparent'], 'black', '#111111'],
      ['antelope_satori', 'Zen Summing Controller', 'ZEN SUM', 4, 'monitor', 'Monitoring controller: source summing, Mono, Dim and level with precise stepped volume.', ['monitor controller', 'mono', 'dim'], 'black', '#0f1012'],
    ] as const
  ).map(([type, name, short, ch, color, description, tags, finish, bg]): DeviceSpec => {
    const extra: ParamDef[] = [];
    if (color === 'neve') extra.push(sel('silk', 'Colour', ['Off', 'Red', 'Blue'], 1, { section: 'Master' }), pct('texture', 'Texture', 0.35, { section: 'Master', cv: true }));
    else if (color === 'clean') extra.push(sel('harmonics', 'Harmonics', ['Off', 'Low', 'High'], 0, { section: 'Master' }), toggle('paralimit', 'Paralimit', 0, { section: 'Master' }), toggle('xformer', 'X-Former', 0, { section: 'Master' }));
    else if (color === 'nicerizer') extra.push(toggle('nicerizer', 'Nicerizer', 1, { section: 'Master' }));
    else if (color === 'monitor') extra.push(toggle('mono', 'Mono', 0, { section: 'Master' }), toggle('dim', 'Dim −20 dB', 0, { section: 'Master' }));
    else extra.push(pct('drive', 'Drive', 0.25, { section: 'Master', cv: true }));
    if (color === 'spl' || color === 'ssl' || color === 'neve') extra.push(knob('width', 'Width', 0, 2, 1, { section: 'Master' }));
    return {
      type, name, short, kind: 'utility', family: H, group: 'Summing Mixers', category: 'utility', engine: 'mixer',
      engineConfig: { channels: ch, color, summing: true }, description, tags: ['summing mixer', ...tags],
      params: summingParams(ch, extra), ports: { audioIns: ch, inLabels: Array.from({ length: ch }, (_, i) => `Ch ${i * 2 + 1}/${i * 2 + 2}`) },
      panel: { finish, color: bg, accent: '#e8e8e8', text: '#f0f0f0', knob: 'metal', logo: name.split(' ')[0].toUpperCase(), tagline: short, display: 'meter', units: ch > 8 ? 3 : 2 },
      macro: { label: 'Output', param: 'output', min: -12, max: 6 },
    };
  }),

  // ================= DI boxes
  { type: 'radial_j48', name: 'ActivBox DI', short: 'ACTIVBOX', kind: 'utility', family: H, group: 'DI Boxes & Patchbays', category: 'utility', engine: 'di',
    engineConfig: { active: true, transformer: 0.25 }, description: 'Active phantom-powered DI: -15 dB pad, merge, 80 Hz low cut, polarity; clean with a touch of transformer.',
    tags: ['di', 'active', 'bass', 'keys'], params: DI_COMMON({ merge: true, filter: true, pads: ['0 dB', '-15 dB'] }), ports: { audioIns: 1 },
    panel: { finish: 'blue', color: '#1b3a6b', accent: '#ffffff', text: '#f2f2f2', knob: 'cap', logo: 'ActivBox', tagline: 'active DI', units: 1 } },
  { type: 'radial_jdi', name: 'PassivBox DI', short: 'PASSIVBOX', kind: 'utility', family: H, group: 'DI Boxes & Patchbays', category: 'utility', engine: 'di',
    engineConfig: { active: false, transformer: 0.5 }, description: 'Passive DI with a quality transformer: smooth low-end saturation, -15 dB pad, merge, polarity.',
    tags: ['di', 'passive', 'transformer'], params: DI_COMMON({ merge: true, pads: ['0 dB', '-15 dB'] }), ports: { audioIns: 1 },
    panel: { finish: 'blue', color: '#163055', accent: '#ffffff', text: '#f2f2f2', knob: 'cap', logo: 'PassivBox', tagline: 'passive transformer DI', units: 1 } },
  { type: 'countryman85', name: 'FET Direct Box', short: 'FET DIRECT', kind: 'utility', family: H, group: 'DI Boxes & Patchbays', category: 'utility', engine: 'di',
    engineConfig: { active: true, transformer: 0.1 }, description: 'FET active DI known for clarity and headroom on bass and keys; pad, polarity.',
    tags: ['di', 'active', 'clean', 'bass'], params: DI_COMMON({ pads: ['0 dB', '-15 dB', '-30 dB'] }), ports: { audioIns: 1 },
    panel: { finish: 'grey', color: '#4a4d52', accent: '#ffcc00', text: '#f2f2f2', knob: 'cap', logo: 'FET DIRECT', tagline: 'FET direct box', units: 1 } },
  { type: 'rndi', name: 'Transformer DI', short: 'TRANSFORMER DI', kind: 'utility', family: H, group: 'DI Boxes & Patchbays', category: 'utility', engine: 'di',
    engineConfig: { active: true, transformer: 0.45, neve: true }, description: 'Class-A active transformer DI: rich transformer low end, Fat / Thru switch, polarity.',
    tags: ['di', 'transformer', 'bass', 'warm'], params: DI_COMMON({ fat: true, pads: ['0 dB', '-15 dB'] }), ports: { audioIns: 1 },
    panel: { finish: 'blue', color: '#203d66', accent: '#e8e8e8', text: '#f2f2f2', knob: 'cap', logo: 'TRANSFORMER DI', tagline: 'active transformer DI', units: 1 } },

  // ================= Patchbays
  ...(
    [
      ['spatch_plus', 'Patchpoint 48', 'PATCHPOINT 48', 8, 'Patchpoint', false],
      ['neutrik_patchbay', 'Patchline TRS', 'PATCHLINE TRS', 8, 'Patchline', false],
      ['blacklion_pbr', 'XLR Patchbay', 'XLR PATCH', 8, 'XLR PATCH', false],
      ['flock_patch_lt', 'Router LT Digital Patchbay', 'ROUTER LT', 8, 'ROUTER', true],
      ['switchcraft9625', 'Bantam 96 Patchbay', 'BANTAM 96', 8, 'BANTAM', false],
      ['art_p16', 'Patchrow 16', 'PATCHROW 16', 8, 'PATCHROW', false],
    ] as const
  ).map(([type, name, short, ch, logo, digital]): DeviceSpec => ({
    type, name, short, kind: 'utility', family: H, group: 'DI Boxes & Patchbays', category: 'utility', engine: 'patchbay',
    engineConfig: { channels: ch, digital },
    description: digital
      ? 'Digitally controlled analog patchbay: route any input to any output with recallable routing.'
      : 'Patchbay: rear inputs normalled to rear outputs; front-patch any output to another input (Normal / Half-Normal / Isolated).',
    tags: ['patchbay', 'routing', 'normalled', ...(digital ? ['digital', 'recall'] : [])],
    params: [sel('mode', 'Normalling', ['Normalled', 'Half-Normalled', 'Isolated'], 1, { section: 'Mode', control: 'buttons' }), ...routes(ch)],
    ports: { audioIns: ch, audioOuts: ch, inLabels: Array.from({ length: ch }, (_, i) => `In ${i + 1}`), outLabels: Array.from({ length: ch }, (_, i) => `Out ${i + 1}`) },
    panel: { finish: 'black', color: '#121212', accent: digital ? '#4fd1ff' : '#d9d9d9', text: '#efefef', knob: 'cap', logo, tagline: short, units: 2 },
  })),
];

