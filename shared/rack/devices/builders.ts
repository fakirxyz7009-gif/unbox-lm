/**
 * Param sets per DSP engine. Each engine in src/audio/spec/engines reads exactly these keys
 * (with the defaults below), so specs stay short and always match their engine.
 */
import {
  ampEnv,
  db,
  filterBlock,
  filterEnv,
  hz,
  knob,
  lfoBlock,
  mixBlock,
  outBlock,
  pct,
  secs,
  sel,
  toggle,
  type PadDef,
  type ParamDef,
} from './types.ts';

export const WAVES = ['Saw', 'Square', 'Tri', 'Sine', 'Pulse'] as const;
export const WAVETABLES = ['Analog', 'PWM', 'Vocal', 'Digital', 'Bell', 'Organ', 'Growl', 'Glass', 'Strings', 'Choir', 'Formant', 'Metal'] as const;
export const VOICE_MODES = ['Poly', 'Mono', 'Legato', 'Unison'] as const;

export interface PolyOpts {
  oscs?: 2 | 3;
  waves?: readonly string[];
  filters: readonly string[];
  cutoff?: number;
  resonance?: number;
  chorus?: boolean;
  reverb?: boolean;
  layers?: boolean;
  xmod?: boolean;
  env?: [number, number, number, number];
  fenv?: [number, number, number, number, number];
  voiceMode?: number;
  glide?: number;
}

export function polyParams(o: PolyOpts): ParamDef[] {
  const waves = o.waves ?? WAVES;
  const p: ParamDef[] = [
    sel('osc1Wave', 'Osc 1', waves, 0, { section: 'Oscillators' }),
    knob('osc1Oct', 'Oct 1', -2, 2, 0, { step: 1, section: 'Oscillators' }),
    sel('osc2Wave', 'Osc 2', waves, 1, { section: 'Oscillators' }),
    knob('osc2Oct', 'Oct 2', -2, 2, 0, { step: 1, section: 'Oscillators' }),
    knob('osc2Semi', 'Semi 2', -12, 12, 0, { step: 1, unit: 'st', section: 'Oscillators' }),
    knob('osc2Detune', 'Detune', -50, 50, 7, { unit: 'ct', section: 'Oscillators' }),
    pct('osc2Level', 'Osc 2 Lvl', 0.7, { section: 'Mixer' }),
  ];
  if (o.oscs === 3) {
    p.push(
      sel('osc3Wave', 'Osc 3', waves, 2, { section: 'Oscillators' }),
      knob('osc3Oct', 'Oct 3', -2, 2, -1, { step: 1, section: 'Oscillators' }),
      knob('osc3Detune', 'Detune 3', -50, 50, -5, { unit: 'ct', section: 'Oscillators' }),
      pct('osc3Level', 'Osc 3 Lvl', 0.5, { section: 'Mixer' })
    );
  }
  p.push(
    pct('pw', 'Pulse W', 0.5, { section: 'Oscillators', cv: true }),
    pct('subLevel', 'Sub', 0.2, { section: 'Mixer' }),
    pct('noiseLevel', 'Noise', 0, { section: 'Mixer' })
  );
  if (o.xmod) p.push(pct('xmod', 'Cross Mod', 0, { section: 'Oscillators', cv: true }));
  p.push(...filterBlock(o.filters, o.cutoff ?? 2200, o.resonance ?? 0.25));
  const fe = o.fenv ?? [0.004, 0.35, 0.25, 0.4, 0.45];
  p.push(...filterEnv(fe[0], fe[1], fe[2], fe[3], fe[4]));
  const ae = o.env ?? [0.004, 0.3, 0.75, 0.35];
  p.push(...ampEnv(ae[0], ae[1], ae[2], ae[3]));
  p.push(...lfoBlock(5));
  p.push(
    sel('voiceMode', 'Voices', VOICE_MODES, o.voiceMode ?? 0, { section: 'Voice' }),
    secs('glide', 'Glide', 0.001, 2, o.glide ?? 0.001, { section: 'Voice' }),
    pct('unisonDetune', 'Uni Detune', 0.25, { section: 'Voice' }),
    pct('velAmount', 'Velocity', 0.6, { section: 'Voice' })
  );
  if (o.layers) {
    p.push(
      sel('bWave', 'Layer B', waves, 3, { section: 'Layer B' }),
      knob('bOct', 'B Oct', -2, 2, 1, { step: 1, section: 'Layer B' }),
      knob('bDetune', 'B Detune', -50, 50, 0, { unit: 'ct', section: 'Layer B' }),
      hz('bCutoff', 'B Cutoff', 20, 20000, 5000, { section: 'Layer B' }),
      pct('morph', 'A ⇄ B Morph', 0.35, { section: 'Layer B', cv: true })
    );
  }
  if (o.chorus) p.push(sel('chorus', 'Chorus', ['Off', 'I', 'II', 'I+II'], 1, { section: 'Effects' }));
  if (o.reverb) p.push(pct('reverb', 'Spring Rev', 0, { section: 'Effects' }));
  p.push(...outBlock(0.75));
  return p;
}

export function wavetableParams(o: { tables?: readonly string[]; additive?: boolean; motion?: boolean; filters?: readonly string[]; cutoff?: number; dual?: boolean }): ParamDef[] {
  const tables = o.tables ?? WAVETABLES;
  const p: ParamDef[] = [];
  if (o.additive) {
    p.push(
      knob('harmonics', 'Partials', 1, 64, 24, { step: 1, section: 'Spectrum' }),
      knob('tilt', 'Tilt', -1, 1, -0.3, { section: 'Spectrum', cv: true }),
      knob('oddEven', 'Odd ⇄ Even', -1, 1, 0, { section: 'Spectrum' }),
      pct('specCutoff', 'Spec Filter', 0.8, { section: 'Spectrum', cv: true }),
      pct('specRes', 'Spec Peak', 0.2, { section: 'Spectrum' }),
      pct('stretch', 'Stretch', 0, { section: 'Spectrum' })
    );
  } else {
    p.push(
      sel('tableA', 'Table A', tables, 0, { section: 'Osc A' }),
      pct('posA', 'Index A', 0.2, { section: 'Osc A', cv: true }),
      knob('octA', 'Oct A', -2, 2, 0, { step: 1, section: 'Osc A' })
    );
    if (o.dual !== false) {
      p.push(
        sel('tableB', 'Table B', tables, 2, { section: 'Osc B' }),
        pct('posB', 'Index B', 0.5, { section: 'Osc B', cv: true }),
        knob('semiB', 'Semi B', -12, 12, 0, { step: 1, unit: 'st', section: 'Osc B' }),
        knob('detuneB', 'Detune B', -50, 50, 6, { unit: 'ct', section: 'Osc B' }),
        pct('mixAB', 'A ⇄ B', 0.5, { section: 'Osc B', cv: true })
      );
    }
    if (o.motion) {
      p.push(hz('motion', 'Motion', 0.05, 12, 0.6, { section: 'Motion', cv: true }), pct('motionDepth', 'Motion Amt', 0.5, { section: 'Motion' }));
    }
  }
  p.push(
    sel('unison', 'Unison', ['1', '2', '3', '4'], 0, { section: 'Voice' }),
    pct('unisonDetune', 'Uni Detune', 0.3, { section: 'Voice' }),
    ...filterBlock(o.filters ?? ['LP24', 'LP12', 'BP', 'HP', 'Notch', 'Comb'], o.cutoff ?? 5000, 0.2),
    ...filterEnv(0.01, 0.6, 0.4, 0.6, 0.25),
    ...ampEnv(0.02, 0.5, 0.8, 0.6),
    ...lfoBlock(0.8),
    pct('lfoPos', 'LFO → Index', 0.15, { section: 'LFO' }),
    sel('voiceMode', 'Voices', VOICE_MODES, 0, { section: 'Voice' }),
    secs('glide', 'Glide', 0.001, 2, 0.001, { section: 'Voice' }),
    pct('velAmount', 'Velocity', 0.5, { section: 'Voice' }),
    ...outBlock(0.7)
  );
  return p;
}

export function fmParams(ops: number, algos: readonly string[]): ParamDef[] {
  const p: ParamDef[] = [sel('algorithm', 'Algorithm', algos, 0, { section: 'Algorithm' })];
  const ratios = [1, 2, 1, 3, 0.5, 4, 1, 7, 2];
  const levels = [1, 0.55, 0.8, 0.35, 0.6, 0.25, 0.7, 0.2, 0.4];
  for (let i = 1; i <= ops; i++) {
    p.push(
      knob(`ratio${i}`, `Op${i} Ratio`, 0.5, 16, ratios[(i - 1) % ratios.length], { step: 0.5, section: `Operator ${i}` }),
      pct(`level${i}`, `Op${i} Level`, levels[(i - 1) % levels.length], { section: `Operator ${i}` })
    );
  }
  p.push(
    pct('feedback', 'Feedback', 0.15, { section: 'Algorithm' }),
    pct('brightness', 'Mod Index', 0.5, { section: 'Algorithm', cv: true }),
    secs('modDecay', 'Mod Decay', 0.01, 6, 0.6, { section: 'Algorithm' }),
    pct('modSustain', 'Mod Sustain', 0.3, { section: 'Algorithm' }),
    pct('velMod', 'Vel → Mod', 0.6, { section: 'Algorithm' }),
    hz('cutoff', 'Filter', 200, 20000, 14000, { section: 'Output', cv: true }),
    ...ampEnv(0.003, 0.8, 0.6, 0.5),
    ...lfoBlock(5),
    sel('voiceMode', 'Voices', VOICE_MODES, 0, { section: 'Voice' }),
    secs('glide', 'Glide', 0.001, 2, 0.001, { section: 'Voice' }),
    ...outBlock(0.7)
  );
  return p;
}

export function westcoastParams(): ParamDef[] {
  return [
    sel('oscWave', 'Primary', ['Sine', 'Tri', 'Saw'], 0, { section: 'Complex Osc' }),
    knob('modRatio', 'Mod Ratio', 0.25, 8, 2, { step: 0.25, section: 'Complex Osc' }),
    pct('fmIndex', 'FM Index', 0.3, { section: 'Complex Osc', cv: true }),
    pct('amDepth', 'AM', 0, { section: 'Complex Osc' }),
    pct('fold', 'Timbre/Fold', 0.35, { section: 'Wavefolder', cv: true }),
    knob('symmetry', 'Symmetry', -1, 1, 0, { section: 'Wavefolder' }),
    sel('lpgMode', 'LPG Mode', ['LP', 'VCA', 'Both'], 2, { section: 'Low Pass Gate' }),
    secs('lpgDecay', 'LPG Decay', 0.02, 4, 0.35, { section: 'Low Pass Gate', cv: true }),
    pct('lpgRes', 'LPG Res', 0.15, { section: 'Low Pass Gate' }),
    secs('rise', 'Rise', 0.001, 4, 0.002, { section: 'Function' }),
    secs('fall', 'Fall', 0.01, 6, 0.4, { section: 'Function' }),
    toggle('cycle', 'Cycle', 0, { section: 'Function' }),
    pct('envFold', 'Fn → Fold', 0.4, { section: 'Function' }),
    pct('envFm', 'Fn → FM', 0.3, { section: 'Function' }),
    pct('noise', 'Noise', 0, { section: 'Complex Osc' }),
    pct('spring', 'Spring', 0.1, { section: 'Output' }),
    sel('voiceMode', 'Voices', VOICE_MODES, 0, { section: 'Voice' }),
    secs('glide', 'Glide', 0.001, 2, 0.001, { section: 'Voice' }),
    ...outBlock(0.75),
  ];
}

export function modalParams(models: readonly string[], def = 0): ParamDef[] {
  return [
    sel('model', 'Model', models, def, { section: 'Instrument' }),
    pct('hardness', 'Hardness', 0.5, { section: 'Exciter', cv: true }),
    pct('brightness', 'Brightness', 0.55, { section: 'Exciter', cv: true }),
    knob('decayScale', 'Decay', 0.1, 4, 1, { unit: 'x', curve: 'log', section: 'Resonator' }),
    pct('inharmonic', 'Stretch', 0.15, { section: 'Resonator' }),
    pct('damping', 'Damping', 0.3, { section: 'Resonator' }),
    pct('noise', 'Hammer/Pick', 0.25, { section: 'Exciter' }),
    pct('body', 'Body', 0.4, { section: 'Resonator' }),
    pct('tremolo', 'Tremolo', 0, { section: 'Effects' }),
    secs('release', 'Release', 0.01, 8, 0.4, { section: 'Resonator' }),
    pct('sustainPedal', 'Pedal', 0, { section: 'Instrument' }),
    pct('room', 'Room', 0.15, { section: 'Effects' }),
    ...outBlock(0.8),
  ];
}

export function formantParams(voices: readonly string[], def = 0): ParamDef[] {
  return [
    sel('voiceType', 'Voice', voices, def, { section: 'Voice' }),
    knob('vowel', 'Vowel A-E-I-O-U', 0, 4, 0, { section: 'Formants', cv: true }),
    pct('vowelMotion', 'Vowel Motion', 0.15, { section: 'Formants' }),
    knob('formantShift', 'Formant', -12, 12, 0, { unit: 'st', section: 'Formants' }),
    pct('ensemble', 'Ensemble', 0.5, { section: 'Voice' }),
    pct('breath', 'Breath', 0.2, { section: 'Voice' }),
    hz('vibRate', 'Vib Rate', 1, 10, 5.2, { section: 'Expression' }),
    pct('vibDepth', 'Vib Depth', 0.25, { section: 'Expression', cv: true }),
    pct('brightness', 'Brightness', 0.5, { section: 'Expression' }),
    ...ampEnv(0.18, 0.4, 0.85, 0.9),
    pct('room', 'Space', 0.25, { section: 'Effects' }),
    ...outBlock(0.75),
  ];
}

export function bowedParams(bodies: readonly string[], def = 0): ParamDef[] {
  return [
    sel('body', 'Body', bodies, def, { section: 'Resonator' }),
    pct('pressure', 'Bow Pressure', 0.55, { section: 'Exciter', cv: true }),
    pct('position', 'Bow Position', 0.3, { section: 'Exciter' }),
    pct('bowNoise', 'Bow Noise', 0.25, { section: 'Exciter' }),
    pct('bodySize', 'Body Size', 0.5, { section: 'Resonator' }),
    pct('brightness', 'Brightness', 0.5, { section: 'Resonator', cv: true }),
    hz('vibRate', 'Vib Rate', 1, 10, 5.5, { section: 'Expression' }),
    pct('vibDepth', 'Vib Depth', 0.2, { section: 'Expression', cv: true }),
    pct('ensemble', 'Ensemble', 0.2, { section: 'Expression' }),
    ...ampEnv(0.12, 0.3, 0.9, 0.5),
    pct('room', 'Room', 0.2, { section: 'Effects' }),
    ...outBlock(0.75),
  ];
}

export function samplerParams(sources: readonly string[], o: { zones?: boolean; def?: number } = {}): ParamDef[] {
  return [
    sel('sample', o.zones ? 'Patch' : 'Sample', sources, o.def ?? 0, { section: 'Sample' }),
    knob('root', 'Root Key', 24, 96, 60, { step: 1, section: 'Sample' }),
    knob('tune', 'Tune', -24, 24, 0, { step: 1, unit: 'st', section: 'Sample' }),
    knob('fine', 'Fine', -50, 50, 0, { unit: 'ct', section: 'Sample' }),
    pct('start', 'Start', 0, { section: 'Sample' }),
    toggle('loop', 'Loop', 0, { section: 'Sample' }),
    pct('loopStart', 'Loop Start', 0.2, { section: 'Sample' }),
    pct('loopEnd', 'Loop End', 0.9, { section: 'Sample' }),
    toggle('reverse', 'Reverse', 0, { section: 'Sample' }),
    ...filterBlock(['LP24', 'LP12', 'BP', 'HP', 'Notch'], 16000, 0.1),
    ...filterEnv(0.001, 0.4, 0.5, 0.4, 0),
    ...ampEnv(0.001, 0.4, 1, 0.3),
    pct('velToFilter', 'Vel → Filter', 0.3, { section: 'Voice' }),
    pct('spread', 'Spread', 0.2, { section: 'Voice' }),
    ...lfoBlock(4),
    sel('voiceMode', 'Voices', VOICE_MODES, 0, { section: 'Voice' }),
    ...outBlock(0.8),
  ];
}

export function granularParams(sources: readonly string[]): ParamDef[] {
  return [
    sel('sample', 'Sample', sources, 0, { section: 'Source' }),
    pct('position', 'Position', 0.3, { section: 'Grain', cv: true }),
    pct('spray', 'Jitter', 0.15, { section: 'Grain' }),
    secs('grainSize', 'Grain Size', 0.01, 0.5, 0.08, { section: 'Grain', cv: true }),
    hz('density', 'Density', 2, 80, 22, { section: 'Grain', cv: true }),
    pct('pitchRand', 'Pitch Rand', 0.05, { section: 'Grain' }),
    hz('scan', 'Scan Rate', 0.01, 4, 0.1, { section: 'Grain' }),
    pct('stereo', 'Stereo', 0.6, { section: 'Grain' }),
    sel('playMode', 'Mode', ['Grain', 'Tape', 'Freeze'], 0, { section: 'Grain' }),
    hz('cutoff', 'Filter', 60, 20000, 12000, { section: 'Filter', cv: true }),
    pct('resonance', 'Res', 0.1, { section: 'Filter' }),
    ...ampEnv(0.15, 0.4, 0.9, 1.2),
    ...outBlock(0.75),
  ];
}

export function loopParams(loops: readonly string[]): ParamDef[] {
  const p: ParamDef[] = [sel('slot', 'Active Slot', ['1', '2', '3', '4', '5', '6', '7', '8'], 0, { section: 'Slots', control: 'buttons' })];
  for (let i = 1; i <= 8; i++) p.push(sel(`loop${i}`, `Slot ${i}`, loops, (i - 1) % loops.length, { section: 'Slots' }));
  p.push(
    toggle('run', 'Run (sync)', 0, { section: 'Global' }),
    knob('pitch', 'Pitch', -12, 12, 0, { step: 1, unit: 'st', section: 'Global' }),
    pct('decay', 'Slice Decay', 1, { section: 'Global' }),
    hz('cutoff', 'Filter', 60, 20000, 18000, { section: 'Global', cv: true }),
    pct('resonance', 'Res', 0.1, { section: 'Global' }),
    ...outBlock(0.8)
  );
  return p;
}

export function padParams(pads: readonly PadDef[], o: { pan?: boolean } = {}): ParamDef[] {
  const p: ParamDef[] = [];
  pads.forEach((pad, i) => {
    const n = i + 1;
    const section = `Pad ${n}: ${pad.name}`;
    p.push(
      knob(`p${n}Tune`, 'Tune', -12, 12, pad.tune ?? 0, { unit: 'st', section }),
      pct(`p${n}Decay`, 'Decay', pad.decay ?? 0.5, { section }),
      pct(`p${n}Tone`, 'Tone', pad.tone ?? 0.5, { section }),
      pct(`p${n}Level`, 'Level', pad.level ?? 0.8, { section })
    );
    if (o.pan) p.push(knob(`p${n}Pan`, 'Pan', -1, 1, 0, { section }));
  });
  return p;
}

export function drumParams(pads: readonly PadDef[], o: { kits?: readonly string[] } = {}): ParamDef[] {
  const p: ParamDef[] = [];
  if (o.kits) p.push(sel('kit', 'Kit', o.kits, 0, { section: 'Machine' }));
  p.push(
    pct('accent', 'Accent', 0.5, { section: 'Machine' }),
    pct('drive', 'Drive', 0.1, { section: 'Machine', cv: true }),
    knob('tone', 'Tone', -1, 1, 0, { section: 'Machine' }),
    pct('compress', 'Compress', 0.2, { section: 'Machine' }),
    ...padParams(pads),
    ...outBlock(0.85)
  );
  return p;
}

export const NOTE_REPEAT = ['Off', '1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'] as const;

export function grooveParams(pads: readonly PadDef[], kits: readonly string[], o: { synth?: boolean; xfade?: boolean; lofi?: boolean } = {}): ParamDef[] {
  const p: ParamDef[] = [
    sel('kit', 'Kit', kits, 0, { section: 'Program' }),
    sel('noteRepeat', 'Note Repeat', NOTE_REPEAT, 0, { section: 'Program' }),
    hz('cutoff', 'Filter', 60, 20000, 20000, { section: 'Master', cv: true }),
    pct('resonance', 'Res', 0.1, { section: 'Master' }),
    pct('compress', 'Compress', 0.25, { section: 'Master' }),
  ];
  if (o.lofi !== false) p.push(pct('lofi', 'Vintage', 0, { section: 'Master', cv: true }));
  if (o.xfade) p.push(pct('xfade', 'Crossfader', 0, { section: 'Scenes', cv: true }));
  if (o.synth) {
    p.push(
      sel('synthWave', 'Synth Wave', WAVES, 0, { section: 'Synth Track' }),
      hz('synthCutoff', 'Synth Cutoff', 60, 18000, 2600, { section: 'Synth Track', cv: true }),
      pct('synthRes', 'Synth Res', 0.3, { section: 'Synth Track' }),
      secs('synthDecay', 'Synth Decay', 0.02, 4, 0.5, { section: 'Synth Track' }),
      pct('synthLevel', 'Synth Level', 0.7, { section: 'Synth Track' })
    );
  }
  p.push(...padParams(pads, { pan: true }), ...outBlock(0.85));
  return p;
}

/** Common compressor front panel → engine keys: threshold, ratio, attack, release, makeup, mix, knee. */
export function compParams(o: {
  threshold?: [number, number, number];
  ratios?: readonly string[];
  ratioDef?: number;
  attacks?: readonly string[];
  releases?: readonly string[];
  knee?: boolean;
  scHpf?: boolean;
  sidechain?: boolean;
  mix?: boolean;
}): ParamDef[] {
  const t = o.threshold ?? [-40, 0, -14];
  const p: ParamDef[] = [db('threshold', 'Threshold', t[0], t[1], t[2], { section: 'Compressor', cv: true })];
  if (o.ratios) p.push(sel('ratio', 'Ratio', o.ratios, o.ratioDef ?? 1, { section: 'Compressor' }));
  else p.push(knob('ratio', 'Ratio', 1, 20, 4, { unit: ':1', curve: 'log', section: 'Compressor' }));
  if (o.attacks) p.push(sel('attack', 'Attack', o.attacks, 2, { section: 'Compressor' }));
  else p.push(knob('attack', 'Attack', 0.05, 100, 10, { unit: 'ms', curve: 'log', section: 'Compressor' }));
  if (o.releases) p.push(sel('release', 'Release', o.releases, 1, { section: 'Compressor' }));
  else p.push(knob('release', 'Release', 10, 2000, 150, { unit: 'ms', curve: 'log', section: 'Compressor' }));
  if (o.knee) p.push(db('knee', 'Knee', 0, 18, 6, { section: 'Compressor' }));
  if (o.scHpf) p.push(hz('scHpf', 'SC HPF', 20, 500, 20, { section: 'Compressor' }));
  if (o.sidechain) p.push(toggle('sidechain', 'External SC', 0, { section: 'Compressor' }));
  p.push(db('makeup', 'Makeup', 0, 24, 2, { section: 'Output' }));
  if (o.mix !== false) p.push(pct('mix', 'Mix', 1, { section: 'Output', cv: true }));
  return p;
}

export const MIX = mixBlock;
