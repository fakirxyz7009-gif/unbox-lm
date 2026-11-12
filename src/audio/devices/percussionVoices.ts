/**
 * Voices for the named percussion instruments of the universal percussion device:
 * tuned instruments use modal synthesis (instrument-specific inharmonic partials and decays),
 * untuned ones use the drum-machine voice that matches (tuned by the played key).
 */
import { playDrum } from '../spec/engines/drumVoices.ts';

type Partial3 = [ratio: number, amp: number, decay: number];

export type PercussionVoice =
  | { kind: 'modal'; partials: Partial3[]; decay: number; octave?: number; noise?: number; tremolo?: number }
  | { kind: 'drum'; model: string; tune?: number; decay?: number };

const MODAL: [RegExp, PercussionVoice][] = [
  [/marimba|balafon/i, { kind: 'modal', partials: [[1, 1, 1], [3.99, 0.35, 0.35], [10.65, 0.12, 0.15]], decay: 0.9, noise: 0.06 }],
  [/xylophone/i, { kind: 'modal', partials: [[1, 1, 1], [3, 0.4, 0.4], [6.4, 0.2, 0.2]], decay: 0.45, octave: 1, noise: 0.08 }],
  [/vibraphone|vibes/i, { kind: 'modal', partials: [[1, 1, 1], [4, 0.3, 0.4], [10, 0.1, 0.2]], decay: 2.6, tremolo: 5.5 }],
  [/glockenspiel|music box/i, { kind: 'modal', partials: [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.3, 0.4], [8.93, 0.15, 0.3]], decay: 2, octave: 2 }],
  [/celesta/i, { kind: 'modal', partials: [[1, 1, 1], [2, 0.4, 0.5], [3, 0.15, 0.4]], decay: 1.2, octave: 1 }],
  [/tubular|chime|bell/i, { kind: 'modal', partials: [[0.5, 0.6, 1.2], [1, 1, 1], [1.19, 0.4, 0.8], [1.56, 0.3, 0.6], [2, 0.4, 0.6], [2.51, 0.25, 0.4]], decay: 4 }],
  [/kalimba|mbira/i, { kind: 'modal', partials: [[1, 1, 1], [5.9, 0.25, 0.15]], decay: 0.8, octave: 1 }],
  [/steel ?pan|handpan|hang/i, { kind: 'modal', partials: [[1, 1, 1], [2, 0.5, 0.7], [3, 0.25, 0.5], [4.1, 0.15, 0.4]], decay: 1.6 }],
  [/jalatarang/i, { kind: 'modal', partials: [[1, 1, 1], [2.32, 0.2, 0.4]], decay: 2.2, octave: 1 }],
  [/gong|tam-?tam/i, { kind: 'modal', partials: [[0.5, 0.8, 1], [0.74, 0.6, 1], [1, 0.5, 0.8], [1.35, 0.4, 0.7], [1.72, 0.3, 0.6], [2.25, 0.2, 0.5]], decay: 6, octave: -1, noise: 0.05 }],
  [/triangle/i, { kind: 'modal', partials: [[1, 1, 1], [2.76, 0.6, 0.9], [5.4, 0.4, 0.7], [8.9, 0.3, 0.6]], decay: 2.5, octave: 3 }],
  [/boomwhacker|pitch tube/i, { kind: 'modal', partials: [[1, 1, 1], [2, 0.15, 0.3]], decay: 0.3 }],
  [/anklung/i, { kind: 'modal', partials: [[1, 1, 1], [2, 0.3, 0.6]], decay: 0.7, tremolo: 9 }],
  [/berimbau/i, { kind: 'modal', partials: [[1, 1, 1], [2, 0.5, 0.4], [3, 0.3, 0.3]], decay: 0.9, noise: 0.05 }],
];

const DRUM: [RegExp, PercussionVoice][] = [
  [/cowbell/i, { kind: 'drum', model: 'cowbell' }],
  [/agogo/i, { kind: 'drum', model: 'agogo' }],
  [/clave/i, { kind: 'drum', model: 'clave' }],
  [/castanet/i, { kind: 'drum', model: 'clave', tune: 7, decay: 0.2 }],
  [/wood ?block/i, { kind: 'drum', model: 'clave', tune: -5 }],
  [/temple ?block/i, { kind: 'drum', model: 'clave', tune: -9, decay: 0.5 }],
  [/maraca|shaker|shekere|cabasa|pandeiro/i, { kind: 'drum', model: 'maracas' }],
  [/guiro/i, { kind: 'drum', model: 'maracas', decay: 0.9 }],
  [/tambourine/i, { kind: 'drum', model: 'hatO', tune: 5, decay: 0.4 }],
  [/vibraslap|jawbone|wind chime/i, { kind: 'drum', model: 'metal', decay: 0.9 }],
  [/hi-?hat/i, { kind: 'drum', model: 'hatC' }],
  [/ride/i, { kind: 'drum', model: 'ride' }],
  [/cymbal|crash/i, { kind: 'drum', model: 'cymbal' }],
  [/caj[oó]n/i, { kind: 'drum', model: 'cajon' }],
  [/conga/i, { kind: 'drum', model: 'congaMid' }],
  [/bongo/i, { kind: 'drum', model: 'congaHi' }],
  [/djembe/i, { kind: 'drum', model: 'congaLo', decay: 0.6 }],
  [/timpani|kettle/i, { kind: 'drum', model: 'tomLo', tune: -12, decay: 1 }],
  [/taiko/i, { kind: 'drum', model: 'tomLo', tune: -14, decay: 0.8 }],
  [/bodhr/i, { kind: 'drum', model: 'tomLo', tune: -5, decay: 0.5 }],
  [/log drum|slit/i, { kind: 'drum', model: 'tomMid', tune: 3, decay: 0.3 }],
  [/toms?\b/i, { kind: 'drum', model: 'tomMid' }],
  [/snare/i, { kind: 'drum', model: 'snare' }],
  [/bass drum|kick/i, { kind: 'drum', model: 'kick' }],
];

export function percussionVoiceFor(name: string): PercussionVoice | null {
  for (const [re, v] of [...MODAL, ...DRUM]) if (re.test(name)) return v;
  return null;
}

/** One hit into `dest` at time t. `brightness` / `decayScale` come from the device knobs. */
export function playPercussion(ctx: BaseAudioContext, v: PercussionVoice, dest: AudioNode, note: number, vel: number, t: number, brightness: number, decayScale: number): void {
  if (v.kind === 'drum') {
    const boost = ctx.createGain();
    boost.gain.value = 2;
    boost.connect(dest);
    // cajón: low keys = bass tone, high keys = slap
    const model = v.model === 'cajon' ? (note < 60 ? 'kickAnalog' : 'snareAnalog') : v.model;
    const tune = v.model === 'cajon' ? 0 : (v.tune ?? 0) + (note - 60);
    playDrum(ctx, model, boost, t, vel, { tune, decay: Math.max(0.05, Math.min(1, (v.decay ?? 0.5) * decayScale * 1.4)), tone: brightness, level: 0.85 });
    return;
  }
  const f0 = 440 * Math.pow(2, (note - 69) / 12) * Math.pow(2, v.octave ?? 0);
  const out = ctx.createGain();
  out.gain.value = 1;
  if (v.tremolo) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = v.tremolo;
    depth.gain.value = 0.35;
    lfo.connect(depth).connect(out.gain);
    lfo.start(t);
    lfo.stop(t + v.decay * decayScale * 2 + 0.5);
  }
  out.connect(dest);
  const total = v.decay * Math.max(0.2, decayScale * 1.8);
  for (const [ratio, amp, dec] of v.partials) {
    const hz = f0 * ratio;
    if (hz > ctx.sampleRate * 0.45) continue;
    // brighter mallets keep more of the upper partials
    const a = amp * (ratio > 1.5 ? 0.4 + brightness * 0.8 : 1) * vel * 0.6;
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.002, Math.max(0.01, (total * dec) / 4));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + total * dec + 0.3);
  }
  if (v.noise) {
    // mallet strike
    const len = Math.round(ctx.sampleRate * 0.02);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const n = ctx.createBufferSource();
    n.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(12000, f0 * 4);
    const g = ctx.createGain();
    g.gain.value = v.noise * vel * 4;
    n.connect(bp).connect(g).connect(out);
    n.start(t);
  }
}
