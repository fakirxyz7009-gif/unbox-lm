/**
 * Built-in sample sources rendered offline (OfflineAudioContext) on first use and cached per
 * sample rate: tonal sources for the samplers / Grain, drum loops for Dr. Octo Rex and pad kits
 * for the grooveboxes. Users can replace any of them with their own samples.
 */
import { clamp, harmonicWave, noiseSource } from '../dsp.ts';
import { kitVoice, playDrum } from './drumVoices.ts';
import type { PadDef } from '../../../../shared/rack/devices/index.ts';

export interface SourceInfo {
  buffer: AudioBuffer;
  /** MIDI note the source was rendered at. */
  root: number;
  loopStart?: number;
  loopEnd?: number;
  /** Loops: slice start times (seconds) and the loop tempo. */
  slices?: number[];
  bpm?: number;
}

const cache = new Map<string, Promise<SourceInfo>>();
const OfflineCtor = (): typeof OfflineAudioContext =>
  (globalThis as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

async function render(sr: number, seconds: number, build: (ctx: OfflineAudioContext, out: AudioNode) => void): Promise<AudioBuffer> {
  const Ctor = OfflineCtor();
  const ctx = new Ctor(2, Math.max(1, Math.floor(sr * seconds)), sr);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  build(ctx, out);
  const buf = await ctx.startRendering();
  normalise(buf, 0.85);
  return buf;
}

function normalise(buf: AudioBuffer, peak: number): void {
  let max = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  }
  if (max < 1e-6) return;
  const g = peak / max;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

function env(g: AudioParam, a: number, d: number, s: number, end: number, r = 0.2): void {
  g.setValueAtTime(0, 0);
  g.linearRampToValueAtTime(1, a);
  g.setTargetAtTime(s, a, d / 3);
  g.setTargetAtTime(0, Math.max(a, end - r), r / 4);
}

type Builder = (ctx: OfflineAudioContext, out: AudioNode, f: number) => void;

function oscTo(ctx: BaseAudioContext, type: OscillatorType | PeriodicWave, f: number, dest: AudioNode, detune = 0, end = 10): OscillatorNode {
  const o = ctx.createOscillator();
  if (typeof type === 'string') o.type = type as OscillatorType;
  else o.setPeriodicWave(type);
  o.frequency.value = f;
  o.detune.value = detune;
  o.connect(dest);
  o.start(0);
  o.stop(end);
  return o;
}

const TONAL: Record<string, { root: number; seconds: number; loop?: [number, number]; build: Builder }> = {
  'Grand Piano': {
    root: 60,
    seconds: 3.5,
    build: (ctx, out, f) => {
      for (let n = 1; n <= 10; n++) {
        const g = ctx.createGain();
        const amp = (1 / Math.pow(n, 0.9)) * 0.3;
        g.gain.setValueAtTime(amp, 0);
        g.gain.setTargetAtTime(0, 0.002, 3.5 / (1 + n * 0.35) / 4.6);
        g.connect(out);
        oscTo(ctx, 'sine', f * n * Math.sqrt(1 + 0.0004 * n * n), g, n % 2 ? 1 : -1);
      }
    },
  },
  'Electric Piano': {
    root: 60,
    seconds: 3,
    build: (ctx, out, f) => {
      [1, 2, 3, 4.2].forEach((r, i) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime([0.5, 0.18, 0.06, 0.12][i], 0);
        g.gain.setTargetAtTime(0, 0.002, [0.9, 0.35, 0.2, 0.08][i]);
        g.connect(out);
        oscTo(ctx, 'sine', f * r, g);
      });
    },
  },
  Organ: {
    root: 60,
    seconds: 2.2,
    loop: [0.4, 1.8],
    build: (ctx, out, f) => {
      const amps = new Float32Array(17);
      [1, 2, 3, 4, 6, 8, 16].forEach((h, i) => (amps[h] = [1, 0.8, 0.6, 0.5, 0.3, 0.3, 0.15][i]));
      const g = ctx.createGain();
      env(g.gain, 0.01, 0.05, 1, 2.2, 0.05);
      g.connect(out);
      oscTo(ctx, harmonicWave(ctx, 'organ-src', amps), f, g);
    },
  },
  Strings: {
    root: 60,
    seconds: 3.2,
    loop: [0.8, 2.8],
    build: (ctx, out, f) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const g = ctx.createGain();
      env(g.gain, 0.35, 0.3, 0.9, 3.2, 0.3);
      lp.connect(g).connect(out);
      [-12, -5, 0, 6, 11].forEach((c, i) => {
        const pan = ctx.createStereoPanner();
        pan.pan.value = (i / 4) * 1.6 - 0.8;
        pan.connect(lp);
        oscTo(ctx, 'sawtooth', f, pan, c);
      });
    },
  },
  'Warm Pad': {
    root: 60,
    seconds: 3.5,
    loop: [1, 3],
    build: (ctx, out, f) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.Q.value = 2;
      const g = ctx.createGain();
      env(g.gain, 0.6, 0.5, 0.85, 3.5, 0.4);
      lp.connect(g).connect(out);
      oscTo(ctx, 'sawtooth', f, lp, -7);
      oscTo(ctx, 'sawtooth', f, lp, 7);
      oscTo(ctx, 'square', f / 2, lp, 0);
    },
  },
  Choir: {
    root: 60,
    seconds: 3.2,
    loop: [0.8, 2.8],
    build: (ctx, out, f) => {
      const g = ctx.createGain();
      env(g.gain, 0.3, 0.3, 0.9, 3.2, 0.3);
      g.connect(out);
      const src = ctx.createGain();
      [-10, -3, 4, 9].forEach((c) => oscTo(ctx, 'sawtooth', f, src, c));
      [800, 1150, 2900].forEach((fq, i) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = fq;
        bp.Q.value = 9;
        const gg = ctx.createGain();
        gg.gain.value = [1, 0.6, 0.3][i] * 2.5;
        src.connect(bp).connect(gg).connect(g);
      });
    },
  },
  'Synth Bass': {
    root: 36,
    seconds: 1.4,
    build: (ctx, out, f) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(2500, 0);
      lp.frequency.setTargetAtTime(220, 0.005, 0.12);
      const g = ctx.createGain();
      env(g.gain, 0.003, 0.4, 0.6, 1.4, 0.1);
      lp.connect(g).connect(out);
      oscTo(ctx, 'sawtooth', f, lp);
      oscTo(ctx, 'square', f / 2, lp);
    },
  },
  'Saw Lead': {
    root: 60,
    seconds: 1.8,
    loop: [0.3, 1.5],
    build: (ctx, out, f) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4500;
      const g = ctx.createGain();
      env(g.gain, 0.005, 0.2, 0.8, 1.8, 0.1);
      lp.connect(g).connect(out);
      oscTo(ctx, 'sawtooth', f, lp, -8);
      oscTo(ctx, 'sawtooth', f, lp, 8);
    },
  },
  Brass: {
    root: 60,
    seconds: 2.2,
    loop: [0.6, 1.9],
    build: (ctx, out, f) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, 0);
      lp.frequency.linearRampToValueAtTime(3200, 0.12);
      lp.frequency.setTargetAtTime(1800, 0.12, 0.3);
      const g = ctx.createGain();
      env(g.gain, 0.06, 0.3, 0.85, 2.2, 0.15);
      lp.connect(g).connect(out);
      oscTo(ctx, 'sawtooth', f, lp, -4);
      oscTo(ctx, 'sawtooth', f, lp, 5);
    },
  },
  Pluck: {
    root: 60,
    seconds: 1,
    build: (ctx, out, f) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(7000, 0);
      lp.frequency.setTargetAtTime(400, 0.002, 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(1, 0);
      g.gain.setTargetAtTime(0, 0.002, 0.18);
      lp.connect(g).connect(out);
      oscTo(ctx, 'sawtooth', f, lp);
      oscTo(ctx, 'square', f * 2, lp, 5);
    },
  },
  Bell: {
    root: 72,
    seconds: 4,
    build: (ctx, out, f) => {
      [0.5, 1, 2, 2.4, 3, 4.5, 5.33].forEach((r, i) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime([0.4, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15][i] * 0.5, 0);
        g.gain.setTargetAtTime(0, 0.002, 4 / (1 + i * 0.4) / 4.6);
        g.connect(out);
        oscTo(ctx, 'sine', f * r, g);
      });
    },
  },
  Flute: {
    root: 72,
    seconds: 2,
    loop: [0.4, 1.7],
    build: (ctx, out, f) => {
      const g = ctx.createGain();
      env(g.gain, 0.08, 0.2, 0.85, 2, 0.15);
      g.connect(out);
      oscTo(ctx, 'sine', f, g);
      const h2 = ctx.createGain();
      h2.gain.value = 0.15;
      h2.connect(g);
      oscTo(ctx, 'sine', f * 2, h2);
      const n = noiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 2;
      bp.Q.value = 3;
      const ng = ctx.createGain();
      ng.gain.value = 0.15;
      n.connect(bp).connect(ng).connect(g);
      n.start(0);
      n.stop(2);
    },
  },
  'Nylon Guitar': {
    root: 52,
    seconds: 2.8,
    build: (ctx, out, f) => {
      const amps = new Float32Array(40);
      for (let n = 1; n < 40; n++) amps[n] = (1 / n) * Math.abs(Math.sin((n * Math.PI) / 5));
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4500, 0);
      lp.frequency.setTargetAtTime(f * 1.5, 0.004, 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(1, 0.002);
      g.gain.setTargetAtTime(0, 0.003, 0.7);
      lp.connect(g).connect(out);
      oscTo(ctx, harmonicWave(ctx, 'nylon-src', amps), f, lp);
    },
  },
  'Vox Chop': {
    root: 60,
    seconds: 1.1,
    build: (ctx, out, f) => {
      const g = ctx.createGain();
      env(g.gain, 0.02, 0.2, 0.7, 1.1, 0.15);
      g.connect(out);
      const src = ctx.createGain();
      const o = oscTo(ctx, 'sawtooth', f * 1.06, src);
      o.frequency.setTargetAtTime(f, 0, 0.04);
      [[800, 350], [1150, 700], [2900, 2500]].forEach(([a, b], i) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 8;
        bp.frequency.setValueAtTime(a, 0);
        bp.frequency.linearRampToValueAtTime(b, 0.9);
        const gg = ctx.createGain();
        gg.gain.value = [1, 0.6, 0.3][i] * 3;
        src.connect(bp).connect(gg).connect(g);
      });
    },
  },
  'Field Noise': {
    root: 60,
    seconds: 4,
    loop: [0.2, 3.8],
    build: (ctx, out) => {
      const n = noiseSource(ctx, 'pink');
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(400, 0);
      bp.frequency.linearRampToValueAtTime(2400, 2);
      bp.frequency.linearRampToValueAtTime(600, 4);
      n.connect(bp).connect(out);
      n.start(0);
      n.stop(4);
    },
  },
  'Glass Drone': {
    root: 60,
    seconds: 4,
    loop: [0.5, 3.6],
    build: (ctx, out, f) => {
      const g = ctx.createGain();
      env(g.gain, 0.5, 0.5, 0.9, 4, 0.4);
      g.connect(out);
      [1, 2.01, 2.99, 4.2, 5.4].forEach((r, i) => {
        const gg = ctx.createGain();
        gg.gain.value = 0.3 / (i + 1);
        gg.connect(g);
        oscTo(ctx, 'sine', f * r, gg, i * 3);
      });
    },
  },
};

export const TONAL_NAMES = Object.keys(TONAL);

/** Tonal / texture source (cached), optionally rendered at another root (multisample zones). */
export function tonalSource(sampleRate: number, name: string, atRoot?: number): Promise<SourceInfo> {
  const def = TONAL[name] ?? TONAL['Electric Piano'];
  const root = atRoot ?? def.root;
  const key = `tonal:${name}:${root}:${sampleRate}`;
  let p = cache.get(key);
  if (!p) {
    p = render(sampleRate, def.seconds, (ctx, out) => def.build(ctx, out, hz(root))).then((buffer) => ({
      buffer,
      root,
      loopStart: def.loop?.[0],
      loopEnd: def.loop?.[1],
    }));
    cache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- loops

const LOOPS: Record<string, { bpm: number; swing: number; kit: string; steps: string[] }> = {
  // per-instrument 16-step patterns: K kick, S snare, H closed hat, O open hat, C clap, P perc
  'Boom Bap 90': { bpm: 90, swing: 0.12, kit: 'Boom Bap', steps: ['K......K..K.....', '....S.......S...', 'H.H.H.H.H.H.H.HH', '................', '................', '.......P.....P..'] },
  'Breakbeat 120': { bpm: 120, swing: 0.05, kit: 'Breakbeat', steps: ['K.K.......KK....', '....S..S.S..S..S', 'H.HHH.H.H.HHH.H.', '..............O.', '................', '................'] },
  'House 124': { bpm: 124, swing: 0.08, kit: 'House', steps: ['K...K...K...K...', '................', '..H...H...H...H.', '..O...O...O...O.', '....C.......C...', 'P..P..P.P..P..P.'] },
  'Techno 130': { bpm: 130, swing: 0, kit: 'Techno', steps: ['K...K...K...K...', '................', 'HHHHHHHHHHHHHHHH', '..O...O...O...O.', '....C.......C...', '...P.......P..P.'] },
  'Trap 140': { bpm: 140, swing: 0, kit: 'Trap', steps: ['K......K..K.....', '........S.......', 'H.HHH.H.HHHHH.HH', '................', '........C.......', '................'] },
  'DnB 172': { bpm: 172, swing: 0, kit: 'Breakbeat', steps: ['K.........K.....', '....S.......S...', 'H.H.H.H.H.H.H.H.', '.......O........', '................', '...P......P.....'] },
  'Shuffle 110': { bpm: 110, swing: 0.25, kit: 'Boom Bap', steps: ['K.....K...K.....', '....S.......S..S', 'H.HHH.HHH.HHH.HH', '................', '................', '................'] },
  'Percussion 100': { bpm: 100, swing: 0.1, kit: 'Latin', steps: ['K.......K.......', '................', '..H...H...H...H.', '................', '....C.......C...', 'P.PP.P.PP.P.PP.P'] },
};

export function loopSource(sampleRate: number, name: string): Promise<SourceInfo> {
  const def = LOOPS[name] ?? LOOPS['Boom Bap 90'];
  const key = `loop:${name}:${sampleRate}`;
  let p = cache.get(key);
  if (!p) {
    const step = 60 / def.bpm / 4;
    const at = (i: number) => i * step + (i % 2 ? step * def.swing : 0);
    const voices = ['kick', 'snare', 'hatC', 'hatO', 'clap', 'congaMid'];
    p = render(sampleRate, step * 16 + 0.3, (ctx, out) => {
      def.steps.forEach((row, r) => {
        for (let i = 0; i < 16; i++) {
          if (row[i] === '.') continue;
          playDrum(ctx, kitVoice(voices[r], def.kit), out, at(i), i % 4 === 0 ? 1 : 0.8, { tune: 0, decay: 0.45, tone: 0.5, level: 0.8 });
        }
      });
    }).then((buffer) => ({ buffer, root: 60, slices: Array.from({ length: 16 }, (_, i) => at(i)), bpm: def.bpm }));
    cache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- kits

const KIT_TWEAKS: Record<string, { tune: number; decay: number; tone: number; drive: number }> = {
  'boom bap': { tune: -2, decay: 0.45, tone: 0.35, drive: 0.15 },
  trap: { tune: 0, decay: 0.7, tone: 0.6, drive: 0.1 },
  'lo-fi': { tune: -1, decay: 0.4, tone: 0.2, drive: 0.25 },
  house: { tune: 0, decay: 0.5, tone: 0.6, drive: 0.05 },
  techno: { tune: -1, decay: 0.45, tone: 0.55, drive: 0.35 },
  drill: { tune: 1, decay: 0.75, tone: 0.65, drive: 0.15 },
  industrial: { tune: -3, decay: 0.5, tone: 0.5, drive: 0.6 },
  minimal: { tune: 2, decay: 0.25, tone: 0.6, drive: 0 },
  glitch: { tune: 4, decay: 0.2, tone: 0.8, drive: 0.3 },
  ambient: { tune: -2, decay: 0.7, tone: 0.3, drive: 0 },
};

function tweakFor(kit: string) {
  const k = kit.toLowerCase();
  for (const [name, t] of Object.entries(KIT_TWEAKS)) if (k.includes(name)) return t;
  return { tune: 0, decay: 0.5, tone: 0.5, drive: 0.05 };
}

/** One rendered one-shot per pad for a kit. */
export function kitSources(sampleRate: number, kit: string, pads: readonly PadDef[]): Promise<SourceInfo[]> {
  return Promise.all(
    pads.map((pad) => {
      const key = `kit:${kit}:${pad.voice}:${pad.tune ?? 0}:${pad.decay ?? 0.5}:${sampleRate}`;
      let p = cache.get(key);
      if (!p) {
        const tw = tweakFor(kit);
        const voice = kitVoice(pad.voice, kit);
        const long = ['bass808', 'cymbal', 'ride', 'hatO', 'hat909O', 'noiseSweep', 'kick808'].includes(voice);
        p = render(sampleRate, long ? 3.2 : 1.4, (ctx, out) => {
          playDrum(ctx, voice, out, 0.002, 1, {
            tune: tw.tune + (pad.tune ?? 0),
            decay: clamp((pad.decay ?? 0.5) * 0.5 + tw.decay * 0.5, 0, 1),
            tone: tw.tone,
            level: 0.9,
            drive: tw.drive,
          });
        }).then((buffer) => ({ buffer, root: 60 }));
        cache.set(key, p);
      }
      return p;
    })
  );
}
