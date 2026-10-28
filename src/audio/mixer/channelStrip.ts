/**
 * One mixer channel strip as a Web Audio graph. Built the same way on the live AudioContext and on
 * OfflineAudioContexts (export), so what you render is what you hear.
 *
 *   inL / inR (device cables) → duck L/R → merge → trim → polarity → EQ → dynamics
 *     → width (M/S matrix) → preTap → fader → pan → mute → postTap → out → destination
 *   postTap → analyser L / R (meters);  preTap / postTap → send gains → bus inputs
 *
 * EQ and dynamics are built once and switched with dry / wet gains (never rebuilt). The dynamics
 * worklet is attached the first time a channel turns its compressor or gate on; `dyn.ready`
 * resolves once it is in place (offline renders wait for it).
 */
import type { ChannelDyn, ChannelEq, ChannelSettings } from '../types.ts';
import { ensureDynamicsWorklet } from '../spec/worklets.ts';

interface EqNodes {
  input: GainNode;
  dry: GainNode;
  wet: GainNode;
  out: GainNode;
  hp: BiquadFilterNode;
  low: BiquadFilterNode;
  lm: BiquadFilterNode;
  hm: BiquadFilterNode;
  high: BiquadFilterNode;
  lp: BiquadFilterNode;
}

interface DynNodes {
  input: GainNode;
  dry: GainNode;
  wet: GainNode;
  out: GainNode;
  node: AudioWorkletNode | null;
  ready: Promise<void> | null;
  /** Latest gain reduction reported by the worklet (dB, <= 0). */
  grDb: number;
}

export interface StripNodes {
  inL: GainNode;
  inR: GainNode;
  duckL: GainNode;
  duckR: GainNode;
  pdcDelay: DelayNode;
  trim: GainNode;
  phase: GainNode;
  eq: EqNodes;
  dyn: DynNodes;
  /** Width matrix: L' = L·ll + R·rl, R' = R·rr + L·lr. */
  wLL: GainNode;
  wRL: GainNode;
  wRR: GainNode;
  wLR: GainNode;
  preTap: GainNode;
  fader: GainNode;
  pan: StereoPannerNode;
  mute: GainNode;
  postTap: GainNode;
  out: GainNode;
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  /** Send gain per bus id (connected to that bus input). */
  sends: Map<string, { gain: GainNode; pre: boolean; dest: AudioNode }>;
  /** Node `out` is currently connected to. */
  dest: AudioNode | null;
  /** Values last applied (EQ / dynamics are only re-scheduled when they change). */
  last: StripValues | null;
  bufL: Float32Array<ArrayBuffer>;
  bufR: Float32Array<ArrayBuffer>;
}

const stereo = (ctx: BaseAudioContext, value = 1): GainNode => {
  const g = ctx.createGain();
  g.gain.value = value;
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  return g;
};

const biquad = (ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode => {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
};

// ---------------------------------------------------------------------------------------------
// settings → values

export const DEFAULT_EQ: ChannelEq = {
  on: false,
  hpOn: false,
  hpHz: 80,
  lpOn: false,
  lpHz: 16000,
  lowDb: 0,
  lowHz: 100,
  lmDb: 0,
  lmHz: 500,
  lmQ: 1,
  hmDb: 0,
  hmHz: 2500,
  hmQ: 1,
  highDb: 0,
  highHz: 8000,
};

export const DEFAULT_DYN: ChannelDyn = {
  compOn: false,
  threshold: -18,
  ratio: 3,
  attack: 0.01,
  release: 0.15,
  makeup: 0,
  gateOn: false,
  gateThreshold: -50,
  gateRange: -40,
  gateRelease: 0.2,
};

/** Parameter ranges (shared by the UI, the strip and project loading). */
export const EQ_RANGE = {
  hpHz: [20, 1000],
  lpHz: [1000, 20000],
  lowHz: [30, 600],
  lmHz: [100, 4000],
  hmHz: [500, 15000],
  highHz: [1500, 18000],
  db: [-18, 18],
  q: [0.3, 8],
} as const;
export const DYN_RANGE = {
  threshold: [-60, 0],
  ratio: [1, 20],
  attack: [0.0001, 0.2],
  release: [0.01, 2],
  makeup: [0, 24],
  gateThreshold: [-80, 0],
  gateRange: [-80, 0],
  gateRelease: [0.01, 2],
} as const;

const num = (v: unknown, def: number, [lo, hi]: readonly [number, number]) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);

/** A channel's EQ with defaults filled in and every value in range (saved data is untrusted). */
export function eqOf(e: Partial<ChannelEq> | undefined): ChannelEq {
  const d = DEFAULT_EQ;
  return {
    on: !!e?.on,
    hpOn: !!e?.hpOn,
    hpHz: num(e?.hpHz, d.hpHz, EQ_RANGE.hpHz),
    lpOn: !!e?.lpOn,
    lpHz: num(e?.lpHz, d.lpHz, EQ_RANGE.lpHz),
    lowDb: num(e?.lowDb, 0, EQ_RANGE.db),
    lowHz: num(e?.lowHz, d.lowHz, EQ_RANGE.lowHz),
    lmDb: num(e?.lmDb, 0, EQ_RANGE.db),
    lmHz: num(e?.lmHz, d.lmHz, EQ_RANGE.lmHz),
    lmQ: num(e?.lmQ, d.lmQ, EQ_RANGE.q),
    hmDb: num(e?.hmDb, 0, EQ_RANGE.db),
    hmHz: num(e?.hmHz, d.hmHz, EQ_RANGE.hmHz),
    hmQ: num(e?.hmQ, d.hmQ, EQ_RANGE.q),
    highDb: num(e?.highDb, 0, EQ_RANGE.db),
    highHz: num(e?.highHz, d.highHz, EQ_RANGE.highHz),
  };
}

export function dynOf(x: Partial<ChannelDyn> | undefined): ChannelDyn {
  const d = DEFAULT_DYN;
  const r = DYN_RANGE;
  return {
    compOn: !!x?.compOn,
    threshold: num(x?.threshold, d.threshold, r.threshold),
    ratio: num(x?.ratio, d.ratio, r.ratio),
    attack: num(x?.attack, d.attack, r.attack),
    release: num(x?.release, d.release, r.release),
    makeup: num(x?.makeup, d.makeup, r.makeup),
    gateOn: !!x?.gateOn,
    gateThreshold: num(x?.gateThreshold, d.gateThreshold, r.gateThreshold),
    gateRange: num(x?.gateRange, d.gateRange, r.gateRange),
    gateRelease: num(x?.gateRelease, d.gateRelease, r.gateRelease),
  };
}

// ---------------------------------------------------------------------------------------------
// graph

export function buildStrip(ctx: BaseAudioContext): StripNodes {
  const inL = ctx.createGain();
  const inR = ctx.createGain();
  const duckL = ctx.createGain();
  const duckR = ctx.createGain();
  const merge = ctx.createChannelMerger(2);
  inL.connect(duckL).connect(merge, 0, 0);
  inR.connect(duckR).connect(merge, 0, 1);
  const pdcDelay = ctx.createDelay(1.0);
  pdcDelay.delayTime.value = 0;
  const trim = stereo(ctx);
  const phase = stereo(ctx);
  merge.connect(pdcDelay).connect(trim).connect(phase);

  // EQ: input → dry → out, input → HP → low shelf → bell → bell → high shelf → LP → wet → out
  const eq: EqNodes = {
    input: stereo(ctx),
    dry: stereo(ctx, 1),
    wet: stereo(ctx, 0),
    out: stereo(ctx),
    hp: biquad(ctx, 'allpass', DEFAULT_EQ.hpHz),
    low: biquad(ctx, 'lowshelf', DEFAULT_EQ.lowHz),
    lm: biquad(ctx, 'peaking', DEFAULT_EQ.lmHz, DEFAULT_EQ.lmQ),
    hm: biquad(ctx, 'peaking', DEFAULT_EQ.hmHz, DEFAULT_EQ.hmQ),
    high: biquad(ctx, 'highshelf', DEFAULT_EQ.highHz),
    lp: biquad(ctx, 'allpass', DEFAULT_EQ.lpHz),
  };
  phase.connect(eq.input);
  eq.input.connect(eq.dry).connect(eq.out);
  eq.input.connect(eq.hp).connect(eq.low).connect(eq.lm).connect(eq.hm).connect(eq.high).connect(eq.lp).connect(eq.wet).connect(eq.out);

  // Dynamics: input → dry → out; the worklet (input → node → wet) is attached on first use.
  const dyn: DynNodes = { input: stereo(ctx), dry: stereo(ctx, 1), wet: stereo(ctx, 0), out: stereo(ctx), node: null, ready: null, grDb: 0 };
  eq.out.connect(dyn.input);
  dyn.input.connect(dyn.dry).connect(dyn.out);
  dyn.wet.connect(dyn.out);

  const split = ctx.createChannelSplitter(2);
  dyn.out.connect(split);
  const wLL = ctx.createGain();
  const wRL = ctx.createGain();
  const wRR = ctx.createGain();
  const wLR = ctx.createGain();
  wRL.gain.value = 0;
  wLR.gain.value = 0;
  const wMerge = ctx.createChannelMerger(2);
  split.connect(wLL, 0).connect(wMerge, 0, 0);
  split.connect(wRL, 1).connect(wMerge, 0, 0);
  split.connect(wRR, 1).connect(wMerge, 0, 1);
  split.connect(wLR, 0).connect(wMerge, 0, 1);

  const preTap = stereo(ctx);
  const fader = stereo(ctx, 0.85);
  const pan = ctx.createStereoPanner();
  const mute = stereo(ctx);
  const postTap = stereo(ctx);
  const out = stereo(ctx);
  wMerge.connect(preTap).connect(fader).connect(pan).connect(mute).connect(postTap).connect(out);

  const mSplit = ctx.createChannelSplitter(2);
  const analyserL = ctx.createAnalyser();
  const analyserR = ctx.createAnalyser();
  analyserL.fftSize = 1024;
  analyserR.fftSize = 1024;
  postTap.connect(mSplit);
  mSplit.connect(analyserL, 0);
  mSplit.connect(analyserR, 1);

  return {
    inL, inR, duckL, duckR, pdcDelay, trim, phase, eq, dyn, wLL, wRL, wRR, wLR, preTap, fader, pan, mute, postTap, out,
    analyserL, analyserR, sends: new Map(), dest: null, last: null,
    bufL: new Float32Array(analyserL.fftSize), bufR: new Float32Array(analyserR.fftSize),
  };
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

/** Values a channel's settings resolve to (VCA and solo state applied by the caller). */
export interface StripValues {
  trimGain: number;
  polarity: 1 | -1;
  width: number;
  fader: number;
  pan: number;
  audible: boolean;
  eq: ChannelEq;
  dyn: ChannelDyn;
}

export function stripValues(s: ChannelSettings, vcaLevel: number, audible: boolean): StripValues {
  return {
    trimGain: dbToGain(Math.max(-24, Math.min(24, s.trimDb ?? 0))),
    polarity: s.phaseInvert ? -1 : 1,
    width: Math.max(0, Math.min(2, s.width ?? 1)),
    fader: Math.max(0, Math.min(1.5, s.volume ?? 0.85)) * vcaLevel,
    pan: Math.max(-1, Math.min(1, s.pan ?? 0)),
    audible,
    eq: eqOf(s.eq),
    dyn: dynOf(s.dyn),
  };
}

const same = <T extends object>(a: T | undefined, b: T): boolean => !!a && (Object.keys(b) as (keyof T)[]).every((k) => a[k] === b[k]);

/** Applies values smoothly (instantly when `smooth` is false, e.g. while building an offline graph). */
export function applyStrip(strip: StripNodes, v: StripValues, ctx: BaseAudioContext, smooth = true, skip?: (param: 'volume' | 'pan' | 'trim' | 'width') => boolean): void {
  const t = ctx.currentTime;
  const set = (p: AudioParam, x: number) => {
    if (smooth) p.setTargetAtTime(x, t, 0.015);
    else p.value = x;
  };
  const prev = strip.last;
  strip.last = v;
  if (!skip?.('trim')) set(strip.trim.gain, v.trimGain);
  set(strip.phase.gain, v.polarity);
  if (!same(prev?.eq, v.eq)) applyEq(strip, v.eq, ctx, smooth);
  if (!same(prev?.dyn, v.dyn)) applyDyn(strip, v.dyn, ctx, smooth);
  if (!skip?.('width')) {
    // Width: w=1 identity, w=0 mono (both = (L+R)/2), w=2 doubles the side signal.
    const direct = (1 + v.width) / 2;
    const cross = (1 - v.width) / 2;
    set(strip.wLL.gain, direct);
    set(strip.wRR.gain, direct);
    set(strip.wRL.gain, cross);
    set(strip.wLR.gain, cross);
  }
  if (!skip?.('volume')) set(strip.fader.gain, v.fader);
  if (!skip?.('pan')) set(strip.pan.pan, v.pan);
  set(strip.mute.gain, v.audible ? 1 : 0);
}

function applyEq(strip: StripNodes, e: ChannelEq, ctx: BaseAudioContext, smooth: boolean): void {
  const t = ctx.currentTime;
  const set = (p: AudioParam, x: number) => {
    if (smooth) p.setTargetAtTime(x, t, 0.02);
    else p.value = x;
  };
  const n = strip.eq;
  // Off filters become all-pass (flat magnitude) instead of a far-away corner that still colours.
  const hpType: BiquadFilterType = e.hpOn ? 'highpass' : 'allpass';
  const lpType: BiquadFilterType = e.lpOn ? 'lowpass' : 'allpass';
  if (n.hp.type !== hpType) n.hp.type = hpType;
  if (n.lp.type !== lpType) n.lp.type = lpType;
  set(n.hp.frequency, e.hpHz);
  set(n.lp.frequency, Math.min(e.lpHz, ctx.sampleRate / 2 - 100));
  set(n.low.frequency, e.lowHz);
  set(n.low.gain, e.lowDb);
  set(n.lm.frequency, e.lmHz);
  set(n.lm.gain, e.lmDb);
  set(n.lm.Q, e.lmQ);
  set(n.hm.frequency, e.hmHz);
  set(n.hm.gain, e.hmDb);
  set(n.hm.Q, e.hmQ);
  set(n.high.frequency, e.highHz);
  set(n.high.gain, e.highDb);
  set(n.dry.gain, e.on ? 0 : 1);
  set(n.wet.gain, e.on ? 1 : 0);
}

function applyDyn(strip: StripNodes, d: ChannelDyn, ctx: BaseAudioContext, smooth: boolean): void {
  const n = strip.dyn;
  const active = d.compOn || d.gateOn;
  if (active && !n.ready) attachDynamics(strip, ctx);
  const t = ctx.currentTime;
  const set = (p: AudioParam | undefined, x: number) => {
    if (!p) return;
    if (smooth) p.setTargetAtTime(x, t, 0.01);
    else p.value = x;
  };
  if (n.node) {
    const p = (k: string) => n.node?.parameters.get(k);
    set(p('mode'), 0);
    set(p('knee'), 6);
    set(p('threshold'), d.compOn ? d.threshold : 0);
    set(p('ratio'), d.compOn ? d.ratio : 1);
    set(p('attack'), d.attack);
    set(p('release'), d.release);
    set(p('makeup'), d.compOn ? d.makeup : 0);
    set(p('gateThreshold'), d.gateOn ? d.gateThreshold : -100);
    set(p('gateRange'), d.gateRange);
    set(p('gateRelease'), d.gateRelease);
    set(p('gateHold'), 0.03);
  }
  // Until the worklet is in place the signal stays on the dry path.
  const wet = active && !!n.node;
  set(n.dry.gain, wet ? 0 : 1);
  set(n.wet.gain, wet ? 1 : 0);
}

function attachDynamics(strip: StripNodes, ctx: BaseAudioContext): void {
  const n = strip.dyn;
  n.ready = ensureDynamicsWorklet(ctx).then((ok) => {
    if (!ok) return;
    const node = new AudioWorkletNode(ctx, 'unbox-dynamics', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] });
    node.port.onmessage = (e: MessageEvent<number>) => {
      n.grDb = typeof e.data === 'number' ? e.data : 0;
    };
    n.input.connect(node, 0, 0);
    node.connect(n.wet);
    n.node = node;
    if (strip.last) applyDyn(strip, strip.last.dyn, ctx, !(ctx instanceof OfflineAudioContext));
  });
}

/** Gain reduction of the channel's dynamics right now (dB, <= 0; 0 when off). */
export function stripGainReduction(strip: StripNodes): number {
  const d = strip.last?.dyn;
  return d && (d.compOn || d.gateOn) && strip.dyn.node ? strip.dyn.grDb : 0;
}

/** Points the strip output at `dest` (no-op when unchanged). */
export function routeStrip(strip: StripNodes, dest: AudioNode | null): void {
  if (strip.dest === dest) return;
  if (strip.dest) {
    try {
      strip.out.disconnect(strip.dest);
    } catch {
      // already disconnected
    }
  }
  strip.dest = dest;
  if (dest) strip.out.connect(dest);
}

/** Creates / updates / removes send gains so they match `sends` (level 0 when muted). */
export function syncSends(
  strip: StripNodes,
  ctx: BaseAudioContext,
  sends: { busId: string; level: number; pre: boolean; dest: AudioNode; automated?: boolean }[],
  smooth = true
): void {
  const want = new Set(sends.map((s) => s.busId));
  for (const [id, s] of strip.sends) {
    if (!want.has(id)) {
      s.gain.disconnect();
      strip.sends.delete(id);
    }
  }
  for (const s of sends) {
    let cur = strip.sends.get(s.busId);
    if (cur && (cur.pre !== s.pre || cur.dest !== s.dest)) {
      cur.gain.disconnect();
      strip.sends.delete(s.busId);
      cur = undefined;
    }
    if (!cur) {
      const gain = stereo(ctx, 0);
      (s.pre ? strip.preTap : strip.postTap).connect(gain);
      gain.connect(s.dest);
      cur = { gain, pre: s.pre, dest: s.dest };
      strip.sends.set(s.busId, cur);
    }
    if (s.automated) continue;
    if (smooth) cur.gain.gain.setTargetAtTime(s.level, ctx.currentTime, 0.015);
    else cur.gain.gain.value = s.level;
  }
}

export function disposeStrip(strip: StripNodes): void {
  const e = strip.eq;
  const d = strip.dyn;
  const nodes: AudioNode[] = [
    strip.inL, strip.inR, strip.duckL, strip.duckR, strip.pdcDelay, strip.trim, strip.phase,
    e.input, e.dry, e.wet, e.out, e.hp, e.low, e.lm, e.hm, e.high, e.lp,
    d.input, d.dry, d.wet, d.out,
    strip.wLL, strip.wRL, strip.wRR, strip.wLR,
    strip.preTap, strip.fader, strip.pan, strip.mute, strip.postTap, strip.out,
    strip.analyserL, strip.analyserR,
  ];
  if (d.node) nodes.push(d.node);
  nodes.forEach((n) => {
    try {
      n.disconnect();
    } catch {
      // ignore
    }
  });
  d.node?.port.close();
  strip.sends.forEach((s) => s.gain.disconnect());
  strip.sends.clear();
  strip.dest = null;
}

/** Peak / RMS of the post-fader signal (0..1 linear). */
export function stripLevels(strip: StripNodes): { peakL: number; peakR: number; rmsL: number; rmsR: number } {
  strip.analyserL.getFloatTimeDomainData(strip.bufL);
  strip.analyserR.getFloatTimeDomainData(strip.bufR);
  const measure = (b: Float32Array) => {
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < b.length; i++) {
      const v = Math.abs(b[i]);
      if (v > peak) peak = v;
      sum += b[i] * b[i];
    }
    return [peak, Math.sqrt(sum / b.length)];
  };
  const [peakL, rmsL] = measure(strip.bufL);
  const [peakR, rmsR] = measure(strip.bufR);
  return { peakL, peakR, rmsL, rmsR };
}
