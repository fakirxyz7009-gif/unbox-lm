/**
 * Original devices: Web Audio models written for this app, not copies of any product. Each one
 * covers an item from the open-source gap list that the catalog did not have: a Karplus-Strong
 * string, a phase-distortion synth, a graphic EQ, a ladder filter, an acid bassline voicing, a
 * drive pedal, a tape / bucket-brigade echo, a rotating speaker and a stereo tremolo. Names say
 * what the device does, not which product it resembles. Panels use the 'hardware' family.
 */
import { polyParams, wavetableParams } from './builders.ts';
import { hz, knob, mixBlock, outBlock, pct, secs, sel, type DeviceSpec } from './types.ts';

const H = 'hardware' as const;
const FX = 'Classic Effects';
const SYNTH = 'Hardware Synths';

const fx = (o: Omit<DeviceSpec, 'family' | 'kind'>): DeviceSpec => ({ family: H, kind: 'effect', ...o });
const synth = (o: Omit<DeviceSpec, 'family' | 'kind'>): DeviceSpec => ({ family: H, kind: 'instrument', ...o });

const BANDS: readonly (readonly [string, string])[] = [
  ['g0', '31'],
  ['g1', '62'],
  ['g2', '125'],
  ['g3', '250'],
  ['g4', '500'],
  ['g5', '1k'],
  ['g6', '2k'],
  ['g7', '4k'],
  ['g8', '8k'],
  ['g9', '16k'],
];

export const ORIGINAL_SPECS: DeviceSpec[] = [
  fx({
    type: 'graphic_eq', name: 'Graphic EQ 10-Band', short: 'GEQ-10', group: FX, category: 'eq', engine: 'eq',
    engineConfig: { model: 'graphic' },
    description: 'Ten fixed bands from 31 Hz to 16 kHz, each a peaking filter of ±12 dB. Set the sliders by ear or by a measured curve.',
    tags: ['graphic eq', 'eq', '10 band', 'mastering', 'tone'],
    params: [...BANDS.map(([key, label]) => knob(key, label, -12, 12, 0, { unit: 'dB', control: 'fader', section: 'Bands' })), ...mixBlock(1)],
    panel: { finish: 'black', color: '#202226', accent: '#ffb000', text: '#f0f0f0', knob: 'metal', logo: 'GEQ-10', tagline: 'ten-band graphic EQ', units: 2 },
  }),
  fx({
    type: 'ladder_filter', name: 'Ladder Filter LF-4', short: 'LF-4', group: FX, category: 'filter', engine: 'filter',
    engineConfig: { model: 'ladder' },
    description: 'Four-pole low-pass ladder. Resonance feeds back to self-oscillation at full setting. Cutoff takes CV; Drive pushes the input into the stages.',
    tags: ['ladder', 'low pass', 'resonant', 'self-oscillation', 'filter', 'analog'],
    params: [
      hz('freq', 'Cutoff', 30, 18000, 1200, { section: 'Filter', cv: true }),
      knob('res', 'Resonance', 0, 1.15, 0.3, { section: 'Filter', cv: true }),
      pct('drive', 'Drive', 0.2, { section: 'Filter' }),
      ...mixBlock(1),
    ],
    panel: { finish: 'gold', color: '#b58b2a', accent: '#222222', text: '#1b1409', knob: 'moog', logo: 'LF-4', tagline: 'ladder filter', units: 1 },
  }),
  fx({
    type: 'drive_pedal', name: 'Drive Pedal OD-9', short: 'OD-9', group: FX, category: 'saturation', engine: 'distortion',
    engineConfig: { model: 'drive' },
    description: 'Stompbox drive with four voicings: Overdrive (soft clip), Mid Push (mid hump before the clip), Hard Clip (diode-style knee) and Fuzz (asymmetric, high gain). Mix blends the dry signal.',
    tags: ['overdrive', 'drive', 'distortion', 'fuzz', 'pedal', 'guitar', 'clip'],
    params: [
      sel('voicing', 'Voicing', ['Overdrive', 'Mid Push', 'Hard Clip', 'Fuzz'], 0, { section: 'Drive' }),
      pct('drive', 'Drive', 0.5, { section: 'Drive', cv: true }),
      pct('tone', 'Tone', 0.5, { section: 'Tone' }),
      ...mixBlock(1),
    ],
    panel: { finish: 'red', color: '#b3261e', accent: '#f4e3c1', text: '#fff7e6', knob: 'chicken', logo: 'OD-9', tagline: 'drive pedal', units: 1 },
  }),
  fx({
    type: 'tape_echo', name: 'Tape Echo TE-1', short: 'TE-1', group: FX, category: 'delay', engine: 'delay',
    engineConfig: { model: 'tape' },
    description: 'Repeat echo with a tape or bucket-brigade voicing. Tape adds wow and flutter to the delay time; Bucket Brigade is steadier and darker. Saturation and Tone sit in the feedback loop.',
    tags: ['tape', 'echo', 'delay', 'analog', 'bucket brigade', 'dub', 'lo-fi'],
    params: [
      knob('time', 'Time', 40, 1200, 350, { unit: 'ms', curve: 'log', section: 'Echo' }),
      pct('feedback', 'Feedback', 0.45, { section: 'Echo', cv: true }),
      sel('mode', 'Mode', ['Tape', 'Bucket Brigade'], 0, { section: 'Echo' }),
      pct('wowFlutter', 'Wow & Flutter', 0.35, { section: 'Echo' }),
      pct('saturation', 'Saturation', 0.3, { section: 'Echo' }),
      hz('tone', 'Tone', 1000, 12000, 4500, { section: 'Echo' }),
      ...mixBlock(0.4),
    ],
    panel: { finish: 'brushed', color: '#8f9aa6', accent: '#e4572e', text: '#0f1215', knob: 'vintage', logo: 'TAPE ECHO', tagline: 'tape & bucket brigade', units: 2 },
  }),
  fx({
    type: 'rotary_cabinet', name: 'Rotary Cabinet RC-1', short: 'RC-1', group: FX, category: 'modulation', engine: 'modulation',
    engineConfig: { model: 'rotary' },
    description: 'Rotating speaker: a horn rotor above 800 Hz and a drum rotor below it, each with level and Doppler sweeps, miked at two points. Stop, Slow or Fast; Accel sets how fast the rotors change speed. A low Depth gives a vibrato-style wobble.',
    tags: ['rotary', 'speaker', 'organ', 'horn', 'drum', 'vibrato', 'modulation'],
    params: [
      sel('speed', 'Speed', ['Stop', 'Slow', 'Fast'], 1, { section: 'Rotors' }),
      secs('accel', 'Accel', 0.1, 4, 1.2, { section: 'Rotors' }),
      pct('depth', 'Depth', 0.6, { section: 'Rotors', cv: true }),
      ...mixBlock(1),
    ],
    panel: { finish: 'cream', color: '#d9ceb0', accent: '#7a4a22', text: '#2b2118', knob: 'vintage', logo: 'RC-1', tagline: 'rotary speaker', units: 2 },
  }),
  fx({
    type: 'stereo_tremolo', name: 'Stereo Tremolo ST-2', short: 'ST-2', group: FX, category: 'modulation', engine: 'modulation',
    engineConfig: { model: 'tremolo' },
    description: 'Amplitude tremolo with a separate LFO for each side. Stereo sets the phase between them: Mono, Quad (90°) or Opposite (180°).',
    tags: ['tremolo', 'stereo', 'amplitude', 'modulation', 'vintage'],
    params: [
      hz('rate', 'Rate', 0.1, 20, 4.5, { section: 'Tremolo', cv: true }),
      pct('depth', 'Depth', 0.6, { section: 'Tremolo', cv: true }),
      sel('phase', 'Stereo', ['Mono', 'Quad', 'Opposite'], 1, { section: 'Tremolo' }),
      ...mixBlock(1),
    ],
    panel: { finish: 'teal', color: '#0e6f6f', accent: '#f7e9b5', text: '#f7fbfb', knob: 'cap', logo: 'ST-2', tagline: 'stereo tremolo', units: 1 },
  }),
  synth({
    type: 'plucked_string', name: 'Plucked String', short: 'PLUCK', category: 'guitar', engine: 'karplus',
    description: 'Karplus-Strong plucked string: a noise burst into a tuned delay loop with a low-pass, so the tone darkens as it rings. Decay sets the ring time, Bright the opening, Pick the attack and Damp how fast a released note stops.',
    tags: ['pluck', 'string', 'karplus-strong', 'guitar', 'harp', 'physical model'],
    group: SYNTH,
    params: [
      pct('decay', 'Decay', 0.6, { section: 'String' }),
      pct('bright', 'Bright', 0.6, { section: 'String' }),
      pct('pick', 'Pick', 0.5, { section: 'String' }),
      pct('damp', 'Damp', 0.3, { section: 'String' }),
      knob('tune', 'Tune', -50, 50, 0, { unit: 'ct', section: 'String' }),
      ...outBlock(0.8),
    ],
    panel: { finish: 'wood', color: '#3b2a1c', accent: '#e8d7b0', text: '#f5ecd9', knob: 'cap', logo: 'PLUCK', tagline: 'plucked string', units: 2 },
  }),
  synth({
    type: 'phase_synth', name: 'Phase Distortion Synth', short: 'PD-1', category: 'synth', engine: 'wavetable',
    description: 'Phase-distortion synth: a sine whose phase is bent by a power curve. The index morph runs from a pure sine to a sharp, bright cycle. Two table oscillators, unison, filter and envelopes.',
    tags: ['phase distortion', 'digital', 'bells', 'keys', 'pads', 'morph'],
    group: SYNTH,
    params: wavetableParams({ tables: ['Phase', 'Glass', 'Bell', 'Metal'] }),
    panel: { finish: 'grey', color: '#6c7178', accent: '#66e0ff', text: '#f4f7fa', knob: 'cap', logo: 'PD-1', tagline: 'phase distortion', units: 2 },
  }),
  synth({
    type: 'acid_line', name: 'Acid Line AL-1', short: 'AL-1', category: 'bass', engine: 'poly',
    engineConfig: { maxVoices: 1 },
    description: 'Mono bassline voice: saw and square into a four-pole ladder with a fast filter envelope, legato glide and resonance up to self-oscillation. A voicing for squelchy basslines, not a copy of any product.',
    tags: ['acid', 'bassline', 'squelch', 'slide', 'mono', 'bass'],
    group: SYNTH,
    params: polyParams({
      waves: ['Saw', 'Square'],
      filters: ['Ladder 24', 'Ladder 12'],
      cutoff: 900,
      resonance: 0.6,
      voiceMode: 2,
      glide: 0.06,
      env: [0.001, 0.3, 0.8, 0.12],
      fenv: [0.001, 0.2, 0.05, 0.12, 0.85],
    }),
    panel: { finish: 'black', color: '#161616', accent: '#ff6a1f', text: '#f5f1e6', knob: 'chicken', logo: 'ACID LINE', tagline: 'mono bassline', units: 2 },
  }),
];
