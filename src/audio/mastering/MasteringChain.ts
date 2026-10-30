/**
 * Mastering chain on the master bus (`audioEngine.mastering`), between the master EQ and the
 * final safety limiter:
 *   input gain → EQ (5 bands + HP/LP, each band stereo / mid / side) → 3-band multiband compressor
 *   → saturation (tape / tube / console) → exciter → stereo imager (width + mono bass)
 *   → clipper → look-ahead limiter (ceiling, release)
 * Every section is bypassable with a click-free wet/dry switch. `buildOn()` builds the same chain
 * on any context (offline export).
 */
import { ensureDynamicsWorklet } from '../spec/worklets.ts';
import { undoJournal } from '../undoJournal.ts';
import { clipCurve } from './clipCurve.ts';

export type BandType = 'lowshelf' | 'peaking' | 'highshelf';
export type BandTarget = 'stereo' | 'mid' | 'side';

export interface MasteringState {
  enabled: boolean;
  inputDb: number;
  eq: { on: boolean; hp: number; lp: number; bands: { type: BandType; freq: number; gain: number; q: number; target: BandTarget }[] };
  multiband: { on: boolean; lowX: number; highX: number; bands: { threshold: number; ratio: number; attack: number; release: number; gain: number }[] };
  saturation: { on: boolean; mode: 'tape' | 'tube' | 'console'; drive: number; mix: number };
  exciter: { on: boolean; freq: number; amount: number };
  imager: { on: boolean; width: number; monoBelow: number };
  clipper: { on: boolean; driveDb: number };
  limiter: { on: boolean; gainDb: number; ceiling: number; release: number; lookaheadMs: number };
}

export const DEFAULT_MASTERING: MasteringState = {
  enabled: false,
  inputDb: 0,
  eq: {
    on: true, hp: 0, lp: 0,
    bands: [
      { type: 'lowshelf', freq: 90, gain: 0, q: 0.7, target: 'stereo' },
      { type: 'peaking', freq: 300, gain: 0, q: 1, target: 'stereo' },
      { type: 'peaking', freq: 1500, gain: 0, q: 1, target: 'stereo' },
      { type: 'peaking', freq: 5000, gain: 0, q: 1, target: 'stereo' },
      { type: 'highshelf', freq: 10000, gain: 0, q: 0.7, target: 'stereo' },
    ],
  },
  multiband: {
    on: false, lowX: 150, highX: 4000,
    bands: [
      { threshold: -18, ratio: 2, attack: 0.03, release: 0.25, gain: 0 },
      { threshold: -18, ratio: 2, attack: 0.02, release: 0.2, gain: 0 },
      { threshold: -18, ratio: 2, attack: 0.01, release: 0.15, gain: 0 },
    ],
  },
  saturation: { on: false, mode: 'tape', drive: 0.2, mix: 1 },
  exciter: { on: false, freq: 4000, amount: 0.15 },
  imager: { on: false, width: 1, monoBelow: 0 },
  clipper: { on: false, driveDb: 0 },
  limiter: { on: true, gainDb: 0, ceiling: -1, release: 0.12, lookaheadMs: 5 },
};

export const MASTERING_PRESETS: { name: string; patch: (s: MasteringState) => MasteringState }[] = [
  { name: 'Clean (limiter only)', patch: () => ({ ...structuredClone(DEFAULT_MASTERING), enabled: true }) },
  {
    name: 'Streaming −14 LUFS',
    patch: () => {
      const s = structuredClone(DEFAULT_MASTERING);
      s.enabled = true;
      s.eq.hp = 25;
      s.eq.bands[4].gain = 1;
      s.multiband.on = true;
      s.multiband.bands.forEach((b) => (b.ratio = 1.8));
      s.imager = { on: true, width: 1.05, monoBelow: 120 };
      s.limiter = { on: true, gainDb: 3, ceiling: -1, release: 0.15, lookaheadMs: 5 };
      return s;
    },
  },
  {
    name: 'Loud club',
    patch: () => {
      const s = structuredClone(DEFAULT_MASTERING);
      s.enabled = true;
      s.eq.hp = 28;
      s.eq.bands[0].gain = 1.5;
      s.multiband.on = true;
      s.multiband.bands.forEach((b) => {
        b.ratio = 3;
        b.threshold = -20;
      });
      s.saturation = { on: true, mode: 'tape', drive: 0.35, mix: 0.6 };
      s.clipper = { on: true, driveDb: 2 };
      s.imager = { on: true, width: 1.1, monoBelow: 150 };
      s.limiter = { on: true, gainDb: 7, ceiling: -0.8, release: 0.08, lookaheadMs: 4 };
      return s;
    },
  },
  {
    name: 'Warm & gentle',
    patch: () => {
      const s = structuredClone(DEFAULT_MASTERING);
      s.enabled = true;
      s.eq.bands[0].gain = 1;
      s.eq.bands[4].gain = -0.5;
      s.saturation = { on: true, mode: 'tube', drive: 0.25, mix: 0.5 };
      s.limiter = { on: true, gainDb: 2, ceiling: -1, release: 0.2, lookaheadMs: 5 };
      return s;
    },
  },
  {
    name: 'Vinyl prep (mono bass, soft highs)',
    patch: () => {
      const s = structuredClone(DEFAULT_MASTERING);
      s.enabled = true;
      s.eq.hp = 30;
      s.eq.lp = 18000;
      s.eq.bands[4] = { type: 'highshelf', freq: 9000, gain: -1.5, q: 0.7, target: 'side' };
      s.imager = { on: true, width: 0.95, monoBelow: 200 };
      s.limiter = { on: true, gainDb: 1, ceiling: -2, release: 0.25, lookaheadMs: 5 };
      return s;
    },
  },
  {
    name: 'Brighten & widen',
    patch: () => {
      const s = structuredClone(DEFAULT_MASTERING);
      s.enabled = true;
      s.eq.bands[3].gain = 1.5;
      s.eq.bands[4].gain = 2;
      s.eq.bands[4].target = 'side';
      s.exciter = { on: true, freq: 5000, amount: 0.2 };
      s.imager = { on: true, width: 1.25, monoBelow: 140 };
      s.limiter = { on: true, gainDb: 3, ceiling: -1, release: 0.12, lookaheadMs: 5 };
      return s;
    },
  },
];

const dbg = (db: number) => Math.pow(10, db / 20);

function satCurve(mode: MasteringState['saturation']['mode'], drive: number): Float32Array<ArrayBuffer> {
  // Odd length keeps x = 0 on a sample (an even curve mixes across the centre and adds DC).
  const n = 2049;
  const c = new Float32Array(n);
  const k = 1 + drive * 8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    let y: number;
    if (mode === 'tube') y = x >= 0 ? (1 - Math.exp(-k * x)) / (1 - Math.exp(-k)) : -(1 - Math.exp(k * 0.8 * x)) / (1 - Math.exp(-k * 0.8));
    else if (mode === 'console') y = (x - (drive * x * x * x) / 3) / (1 - drive / 3);
    else y = Math.tanh(k * x) / Math.tanh(k);
    c[i] = y;
  }
  return c;
}

/** Click-free bypass: wet path and dry path crossfaded. */
interface Section {
  input: GainNode;
  output: GainNode;
  wet: GainNode;
  dry: GainNode;
}

function section(ctx: BaseAudioContext): Section {
  const g = () => {
    const n = ctx.createGain();
    n.channelCount = 2;
    n.channelCountMode = 'explicit';
    return n;
  };
  const s = { input: g(), output: g(), wet: g(), dry: g() };
  s.input.connect(s.dry).connect(s.output);
  s.wet.connect(s.output);
  return s;
}

interface Nodes {
  input: GainNode;
  output: AudioNode;
  inGain: GainNode;
  eq: Section & { mid: BiquadFilterNode[]; side: BiquadFilterNode[] };
  mb: Section & { comps: DynamicsCompressorNode[]; gains: GainNode[]; filters: BiquadFilterNode[][] };
  sat: Section & { shaper: WaveShaperNode; pre: GainNode; post: GainNode; mixWet: GainNode; mixDry: GainNode };
  exc: Section & { hp1: BiquadFilterNode; hp2: BiquadFilterNode; amt: GainNode };
  img: Section & { sideHp: BiquadFilterNode; sideGain: GainNode };
  clip: Section & { pre: GainNode; post: GainNode };
  lim: Section & { node: AudioWorkletNode | null; gain: GainNode };
}

/** M/S encode → per-channel chains → decode. Returns [mid input, side input] and the stereo output. */
function msWrap(ctx: BaseAudioContext, input: AudioNode): { mid: GainNode; side: GainNode; midOut: GainNode; sideOut: GainNode; out: GainNode } {
  const split = ctx.createChannelSplitter(2);
  input.connect(split);
  const gain = (v: number) => {
    const n = ctx.createGain();
    n.gain.value = v;
    return n;
  };
  const mid = gain(1);
  const side = gain(1);
  split.connect(gain(0.5), 0).connect(mid);
  split.connect(gain(0.5), 1).connect(mid);
  split.connect(gain(0.5), 0).connect(side);
  split.connect(gain(-0.5), 1).connect(side);
  const midOut = gain(1);
  const sideOut = gain(1);
  const merge = ctx.createChannelMerger(2);
  midOut.connect(merge, 0, 0);
  sideOut.connect(merge, 0, 0);
  midOut.connect(merge, 0, 1);
  sideOut.connect(gain(-1)).connect(merge, 0, 1);
  const out = gain(1);
  merge.connect(out);
  return { mid, side, midOut, sideOut, out };
}

function build(ctx: BaseAudioContext, workletReady: boolean): Nodes {
  const input = ctx.createGain();
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  const inGain = ctx.createGain();
  input.connect(inGain);

  // EQ (M/S domain: identical filters on M and S = plain stereo EQ)
  const eqS = section(ctx);
  inGain.connect(eqS.input);
  const ms = msWrap(ctx, eqS.input);
  const chain = (start: AudioNode, end: AudioNode) => {
    const fs: BiquadFilterNode[] = [];
    let prev: AudioNode = start;
    for (let i = 0; i < 7; i++) {
      const f = ctx.createBiquadFilter();
      prev.connect(f);
      prev = f;
      fs.push(f);
    }
    prev.connect(end);
    return fs;
  };
  const eq = { ...eqS, mid: chain(ms.mid, ms.midOut), side: chain(ms.side, ms.sideOut) };
  ms.out.connect(eq.wet);

  // multiband (LR4 crossovers, low band phase-aligned with an all-pass)
  const mbS = section(ctx);
  eq.output.connect(mbS.input);
  const bq = (type: BiquadFilterType) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = type === 'allpass' ? 0.5 : Math.SQRT1_2;
    return f;
  };
  const lowF = [bq('lowpass'), bq('lowpass'), bq('allpass')];
  const midF = [bq('highpass'), bq('highpass'), bq('lowpass'), bq('lowpass')];
  const highF = [bq('highpass'), bq('highpass')];
  const comps: DynamicsCompressorNode[] = [];
  const gains: GainNode[] = [];
  for (const fs of [lowF, midF, highF]) {
    let prev: AudioNode = mbS.input;
    for (const f of fs) {
      prev.connect(f);
      prev = f;
    }
    const c = ctx.createDynamicsCompressor();
    c.knee.value = 6;
    const g = ctx.createGain();
    prev.connect(c).connect(g).connect(mbS.wet);
    comps.push(c);
    gains.push(g);
  }
  const mb = { ...mbS, comps, gains, filters: [lowF, midF, highF] };

  // saturation (parallel mix)
  const satS = section(ctx);
  mbS.output.connect(satS.input);
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x';
  const pre = ctx.createGain();
  const post = ctx.createGain();
  const mixWet = ctx.createGain();
  const mixDry = ctx.createGain();
  satS.input.connect(pre).connect(shaper).connect(post).connect(mixWet).connect(satS.wet);
  satS.input.connect(mixDry).connect(satS.wet);
  const sat = { ...satS, shaper, pre, post, mixWet, mixDry };

  // exciter (high band → harmonics → added in parallel)
  const excS = section(ctx);
  satS.output.connect(excS.input);
  const hp1 = bq('highpass');
  const exShaper = ctx.createWaveShaper();
  exShaper.curve = satCurve('tube', 0.9);
  const hp2 = bq('highpass');
  const amt = ctx.createGain();
  excS.input.connect(excS.wet);
  excS.input.connect(hp1).connect(exShaper).connect(hp2).connect(amt).connect(excS.wet);
  const exc = { ...excS, hp1, hp2, amt };

  // imager: side gain = width; side high-passed below monoBelow (mono bass)
  const imgS = section(ctx);
  excS.output.connect(imgS.input);
  const ims = msWrap(ctx, imgS.input);
  const sideHp = bq('highpass');
  const sideGain = ctx.createGain();
  ims.mid.connect(ims.midOut);
  ims.side.connect(sideHp).connect(sideGain).connect(ims.sideOut);
  ims.out.connect(imgS.wet);
  const img = { ...imgS, sideHp, sideGain };

  // clipper
  const clipS = section(ctx);
  imgS.output.connect(clipS.input);
  const cPre = ctx.createGain();
  const cShaper = ctx.createWaveShaper();
  cShaper.curve = clipCurve();
  cShaper.oversample = '4x';
  const cPost = ctx.createGain();
  clipS.input.connect(cPre).connect(cShaper).connect(cPost).connect(clipS.wet);
  const clip = { ...clipS, pre: cPre, post: cPost };

  // limiter (look-ahead brickwall from the dynamics worklet)
  const limS = section(ctx);
  clipS.output.connect(limS.input);
  const lGain = ctx.createGain();
  let node: AudioWorkletNode | null = null;
  if (workletReady) {
    node = new AudioWorkletNode(ctx, 'unbox-dynamics', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] });
    limS.input.connect(lGain).connect(node).connect(limS.wet);
  } else limS.input.connect(lGain).connect(limS.wet);
  const lim = { ...limS, node, gain: lGain };

  return { input, output: limS.output, inGain, eq, mb, sat, exc, img, clip, lim };
}

function apply(n: Nodes, s: MasteringState, ctx: BaseAudioContext, smooth: boolean): void {
  const t = ctx.currentTime;
  const set = (p: AudioParam, v: number) => (smooth ? p.setTargetAtTime(v, t, 0.02) : (p.value = v));
  const sw = (sec: Section, on: boolean) => {
    const wet = s.enabled && on ? 1 : 0;
    set(sec.wet.gain, wet);
    set(sec.dry.gain, 1 - wet);
  };
  set(n.inGain.gain, s.enabled ? dbg(s.inputDb) : 1);
  // EQ
  sw(n.eq, s.eq.on);
  const filt = (f: BiquadFilterNode, type: BiquadFilterType, freq: number, gain: number, q: number) => {
    f.type = type;
    set(f.frequency, Math.max(10, Math.min(22000, freq)));
    set(f.gain, gain);
    set(f.Q, q);
  };
  for (const [chain, which] of [[n.eq.mid, 'mid'], [n.eq.side, 'side']] as const) {
    s.eq.bands.forEach((b, i) => filt(chain[i], b.type, b.freq, b.target === 'stereo' || b.target === which ? b.gain : 0, b.q));
    // HP / LP: a 0 dB peaking filter when off is an exact pass-through
    filt(chain[5], s.eq.hp > 0 ? 'highpass' : 'peaking', s.eq.hp > 0 ? s.eq.hp : 1000, 0, 0.707);
    filt(chain[6], s.eq.lp > 0 ? 'lowpass' : 'peaking', s.eq.lp > 0 ? s.eq.lp : 1000, 0, 0.707);
  }
  // multiband
  sw(n.mb, s.multiband.on);
  const [lowF, midF, highF] = n.mb.filters;
  lowF.slice(0, 2).forEach((f) => set(f.frequency, s.multiband.lowX));
  set(lowF[2].frequency, s.multiband.highX);
  midF.slice(0, 2).forEach((f) => set(f.frequency, s.multiband.lowX));
  midF.slice(2).forEach((f) => set(f.frequency, s.multiband.highX));
  highF.forEach((f) => set(f.frequency, s.multiband.highX));
  s.multiband.bands.forEach((b, i) => {
    const c = n.mb.comps[i];
    set(c.threshold, b.threshold);
    set(c.ratio, b.ratio);
    set(c.attack, b.attack);
    set(c.release, b.release);
    set(n.mb.gains[i].gain, dbg(b.gain));
  });
  // saturation
  sw(n.sat, s.saturation.on);
  n.sat.shaper.curve = satCurve(s.saturation.mode, s.saturation.drive);
  set(n.sat.pre.gain, 1 + s.saturation.drive);
  set(n.sat.post.gain, 1 / (1 + s.saturation.drive));
  set(n.sat.mixWet.gain, s.saturation.mix);
  set(n.sat.mixDry.gain, 1 - s.saturation.mix);
  // exciter
  sw(n.exc, s.exciter.on);
  set(n.exc.hp1.frequency, s.exciter.freq);
  set(n.exc.hp2.frequency, s.exciter.freq);
  set(n.exc.amt.gain, s.exciter.amount);
  // imager
  sw(n.img, s.imager.on);
  set(n.img.sideGain.gain, s.imager.width);
  set(n.img.sideHp.frequency, Math.max(10, s.imager.monoBelow || 10));
  // clipper
  sw(n.clip, s.clipper.on);
  set(n.clip.pre.gain, dbg(s.clipper.driveDb));
  set(n.clip.post.gain, 1 / dbg(Math.max(0, s.clipper.driveDb) * 0.5));
  // limiter
  sw(n.lim, s.limiter.on);
  set(n.lim.gain.gain, dbg(s.limiter.gainDb));
  const lp = n.lim.node?.parameters;
  if (lp) {
    const p = (k: string, v: number) => {
      const a = lp.get(k);
      if (a) set(a, v);
    };
    p('mode', 4);
    p('threshold', s.limiter.ceiling);
    p('ratio', 100);
    p('knee', 0);
    p('attack', 0.0005);
    p('release', s.limiter.release);
    p('lookahead', Math.min(0.01, s.limiter.lookaheadMs / 1000));
    p('ceiling', s.limiter.ceiling);
    p('makeup', 0);
  }
}

export class MasteringChain {
  state: MasteringState = structuredClone(DEFAULT_MASTERING);
  private nodes: Nodes | null = null;
  /** Live input / output (pass-through until the worklet is ready). */
  readonly input: GainNode;
  readonly output: GainNode;
  /** Gain reduction (dB, ≤ 0) of the limiter and the 3 compressor bands. */
  limiterGr = 0;
  /** Settings used by offline renders instead of `state` (analysis / auto-master passes). */
  renderOverride: MasteringState | null = null;

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
    void ensureDynamicsWorklet(ctx).then((ok) => {
      const n = build(ctx, ok);
      apply(n, this.state, ctx, false);
      this.input.disconnect(this.output);
      this.input.connect(n.input);
      n.output.connect(this.output);
      if (n.lim.node) n.lim.node.port.onmessage = (e: MessageEvent<number>) => (this.limiterGr = e.data);
      this.nodes = n;
    });
  }

  private restoringMastering = false;

  set(next: MasteringState): void {
    const prev = this.restoringMastering ? null : this.save();
    this.state = next;
    if (this.nodes) apply(this.nodes, next, this.ctx, true);
    if (prev && JSON.stringify(prev) !== JSON.stringify(next)) {
      undoJournal.push(
        'mastering',
        'Mastering change',
        () => this.applyUndo(prev),
        () => this.applyUndo(structuredClone(next))
      );
    }
  }

  private applyUndo(state: MasteringState): void {
    this.restoringMastering = true;
    try {
      this.set(state);
    } finally {
      this.restoringMastering = false;
    }
  }

  update(fn: (s: MasteringState) => void): void {
    const next = structuredClone(this.state);
    fn(next);
    this.set(next);
  }

  bandReduction(): number[] {
    return this.nodes ? this.nodes.mb.comps.map((c) => c.reduction) : [0, 0, 0];
  }

  /** The same chain with the current settings on another context (offline export). */
  async buildOn(ctx: BaseAudioContext, input: AudioNode): Promise<AudioNode> {
    const st = this.renderOverride ?? this.state;
    if (!st.enabled) return input;
    const ok = await ensureDynamicsWorklet(ctx);
    const n = build(ctx, ok);
    apply(n, st, ctx, false);
    input.connect(n.input);
    return n.output;
  }

  save(): MasteringState {
    return structuredClone(this.state);
  }

  load(data: unknown): void {
    const d = data as Partial<MasteringState> | undefined;
    this.restoringMastering = true;
    try {
      this.set(d && typeof d === 'object' ? { ...structuredClone(DEFAULT_MASTERING), ...structuredClone(d) } : structuredClone(DEFAULT_MASTERING));
    } finally {
      this.restoringMastering = false;
    }
  }
}
