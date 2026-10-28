/**
 * Web Audio building blocks shared by the spec engines. Everything here builds or schedules
 * nodes; no samples are computed on the main thread except one-off tables (curves, impulse
 * responses, noise, periodic waves), which are cached per context.
 */

type Ctx = BaseAudioContext;

const perCtx = <T>() => new WeakMap<Ctx, Map<string, T>>();
function cached<T>(store: WeakMap<Ctx, Map<string, T>>, ctx: Ctx, key: string, make: () => T): T {
  let m = store.get(ctx);
  if (!m) store.set(ctx, (m = new Map()));
  let v = m.get(key);
  if (v === undefined) m.set(key, (v = make()));
  return v;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(Math.max(1e-9, g));
export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Smoothly moves a running AudioParam (never assigns .value while audio runs). */
export function setSmooth(param: AudioParam, value: number, ctx: Ctx, tau = 0.015): void {
  if (!Number.isFinite(value)) return;
  param.setTargetAtTime(value, ctx.currentTime, tau);
}

// ---------------------------------------------------------------- buffers

const noiseStore = perCtx<AudioBuffer>();
/** 2 s of white noise (stereo-decorrelated), shared per context. */
export function noiseBuffer(ctx: Ctx, kind: 'white' | 'pink' = 'white'): AudioBuffer {
  return cached(noiseStore, ctx, kind, () => {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
        } else d[i] = w;
      }
    }
    return buf;
  });
}

export function noiseSource(ctx: Ctx, kind: 'white' | 'pink' = 'white'): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, kind);
  s.loop = true;
  s.loopStart = 0;
  s.loopEnd = s.buffer.duration;
  return s;
}

const irStore = perCtx<AudioBuffer>();
/**
 * Stereo reverb impulse: diffuse exponentially decaying noise, optional early reflections,
 * high-frequency damping over time (a one-pole lowpass whose coefficient falls with time).
 */
export function impulseResponse(
  ctx: Ctx,
  o: { seconds: number; decay?: number; predelay?: number; damping?: number; early?: number; density?: number; gated?: boolean; seed?: number }
): AudioBuffer {
  const key = JSON.stringify(o);
  return cached(irStore, ctx, key, () => {
    const sr = ctx.sampleRate;
    const pre = Math.floor((o.predelay ?? 0) * sr);
    const len = Math.max(1, Math.floor(o.seconds * sr) + pre);
    const buf = ctx.createBuffer(2, len, sr);
    const decay = o.decay ?? 3;
    const damping = clamp(o.damping ?? 0.4, 0, 0.99);
    const density = clamp(o.density ?? 1, 0.05, 1);
    let seed = (o.seed ?? 1) * 9301 + 49297;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        const env = o.gated ? (t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) * 8)) : Math.pow(1 - t, decay);
        const r = rnd();
        const x = density < 1 && r > density ? 0 : rnd() * 2 - 1;
        const a = 1 - damping * (0.3 + 0.7 * t);
        lp = lp + (x - lp) * clamp(a, 0.02, 1);
        d[i] = lp * env;
      }
      if (o.early) {
        for (let k = 0; k < 8; k++) {
          const idx = pre + Math.floor((0.004 + rnd() * 0.06) * sr);
          if (idx < len) d[idx] += (rnd() * 2 - 1) * o.early * (1 - k / 8);
        }
      }
      // normalise energy so different sizes have similar loudness
      let e = 0;
      for (let i = 0; i < len; i++) e += d[i] * d[i];
      const g = 1 / Math.sqrt(Math.max(1e-9, e / Math.max(1, sr * 0.5)));
      for (let i = 0; i < len; i++) d[i] *= g * 0.35;
    }
    return buf;
  });
}

const cabStore = perCtx<AudioBuffer>();
/** Short speaker-cabinet impulse (band-limited, resonant) for amp models. */
export function cabinetImpulse(ctx: Ctx, kind: string): AudioBuffer {
  return cached(cabStore, ctx, kind, () => {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.04);
    const buf = ctx.createBuffer(2, len, sr);
    const res = kind.includes('15') ? 85 : kind.includes('10') ? 110 : kind.includes('4×12') ? 95 : 120;
    const hi = kind.includes('1×12') ? 4200 : kind.includes('8×10') ? 4800 : 5200;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const body = Math.sin(2 * Math.PI * res * t) * Math.exp(-t * 60);
        const cone = Math.sin(2 * Math.PI * hi * t) * Math.exp(-t * 900) * 0.6;
        const n = (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.35;
        d[i] = (body + cone + n) * Math.exp(-t * 30);
      }
      d[0] += 1;
    }
    return buf;
  });
}

// ---------------------------------------------------------------- curves

const curveStore = perCtx<Float32Array<ArrayBuffer>>();
const N_CURVE = 2048;
function curve(key: string, ctx: Ctx | null, f: (x: number) => number): Float32Array<ArrayBuffer> {
  const make = () => {
    const c = new Float32Array(N_CURVE);
    for (let i = 0; i < N_CURVE; i++) c[i] = f((i / (N_CURVE - 1)) * 2 - 1);
    return c;
  };
  return ctx ? cached(curveStore, ctx, key, make) : make();
}

/** Soft saturation: tanh with makeup so drive changes timbre more than level. */
export function satCurve(drive: number, asym = 0): Float32Array<ArrayBuffer> {
  const k = 1 + clamp(drive, 0, 1) * 24;
  const norm = Math.tanh(k);
  return curve(`sat${k.toFixed(2)}_${asym.toFixed(2)}`, null, (x) => Math.tanh(k * (x + asym * x * x)) / norm);
}

/**
 * Tube-like asymmetric curve (even harmonics). Unity gain for small signals (colour, not
 * level); the positive half compresses harder than the negative half.
 */
export function tubeCurve(drive: number): Float32Array<ArrayBuffer> {
  const k = 0.5 + clamp(drive, 0, 1) * 8;
  const a = 0.7;
  return curve(`tube${k.toFixed(2)}`, null, (x) => (x >= 0 ? (1 - Math.exp(-k * x)) / k : -(1 - Math.exp(k * a * x)) / (k * a)));
}

/** Wavefolder: folds the waveform back when it exceeds ±1 (sin-based, smooth). */
export function foldCurve(amount: number, symmetry = 0): Float32Array<ArrayBuffer> {
  const g = 1 + clamp(amount, 0, 1) * 6;
  return curve(`fold${g.toFixed(2)}_${symmetry.toFixed(2)}`, null, (x) => Math.sin((x * g + symmetry * 0.5) * Math.PI * 0.5));
}

/** D-11 style foldback: clip at a threshold and fold the excess back. */
export function foldbackCurve(amount: number, fold: number): Float32Array<ArrayBuffer> {
  const drive = 1 + clamp(amount, 0, 1) * 20;
  const th = 1 - clamp(fold, 0, 1) * 0.85;
  return curve(`fb${drive.toFixed(2)}_${th.toFixed(2)}`, null, (x) => {
    let y = x * drive;
    for (let i = 0; i < 6 && Math.abs(y) > th; i++) y = y > th ? 2 * th - y : y < -th ? -2 * th - y : y;
    return clamp(y / th, -1, 1);
  });
}

/** Amplitude quantiser (bit reduction). */
export function bitCurve(bits: number): Float32Array<ArrayBuffer> {
  const steps = Math.pow(2, clamp(bits, 1, 16));
  return curve(`bits${steps}`, null, (x) => Math.round(x * steps) / steps);
}

/** Absolute value (for envelope followers). */
export function absCurve(ctx: Ctx): Float32Array<ArrayBuffer> {
  return curve('abs', ctx, (x) => Math.abs(x));
}

// ---------------------------------------------------------------- waves

const waveStore = perCtx<PeriodicWave>();

/** PeriodicWave from harmonic amplitudes (index 1 = fundamental). */
export function harmonicWave(ctx: Ctx, key: string, amps: ArrayLike<number>, phases?: ArrayLike<number>): PeriodicWave {
  return cached(waveStore, ctx, key, () => {
    const n = amps.length;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const ph = phases ? phases[i] : 0;
      real[i] = amps[i] * Math.sin(ph);
      imag[i] = amps[i] * Math.cos(ph);
    }
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  });
}

/** Band-limited pulse wave with width 0..1. */
export function pulseWave(ctx: Ctx, width: number): PeriodicWave {
  const w = Math.round(clamp(width, 0.03, 0.97) * 40) / 40;
  const n = 64;
  const amps = new Float32Array(n);
  const phases = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    // pulse Fourier series: (2/kπ) sin(kπw)
    amps[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * w);
    phases[k] = Math.PI / 2;
  }
  return harmonicWave(ctx, `pulse${w}`, amps, phases);
}

const NATIVE: Record<string, OscillatorType> = { Saw: 'sawtooth', Square: 'square', Tri: 'triangle', Sine: 'sine' };

/** Configures an oscillator for a wave name used by the specs (Saw/Square/Tri/Sine/Pulse). */
export function setWave(osc: OscillatorNode, name: string, ctx: Ctx, pw = 0.5): void {
  const t = NATIVE[name];
  if (t) osc.type = t;
  else if (name === 'Pulse') osc.setPeriodicWave(pulseWave(ctx, pw));
  else osc.type = 'sawtooth';
}

// ---------------------------------------------------------------- envelopes

export interface Adsr {
  a: number;
  d: number;
  s: number;
  r: number;
}

/**
 * Starts an ADSR on `param` at time t: from `from` to `peak` in a (linear), then towards
 * `sustain` (exponential approach). Values are absolute param values.
 */
export function adsrStart(param: AudioParam, t: number, from: number, peak: number, sustain: number, env: Adsr): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(from, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, env.a));
  param.setTargetAtTime(sustain, t + Math.max(0.001, env.a), Math.max(0.002, env.d / 3.5));
}

/** Release from wherever the envelope is at time t towards `to`. */
export function adsrRelease(param: AudioParam, t: number, to: number, r: number): void {
  const anyParam = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof anyParam.cancelAndHoldAtTime === 'function') anyParam.cancelAndHoldAtTime(t);
  else param.cancelScheduledValues(t);
  param.setTargetAtTime(to, t, Math.max(0.002, r / 4.5));
}

/** Seconds after release start until an exponential release is inaudible. */
export const releaseTail = (r: number) => Math.max(0.02, r) * 1.6 + 0.03;

// ---------------------------------------------------------------- modulation sources

export interface LfoHandle {
  /** Shared output remains stable while waveform choices crossfade underneath it. */
  node: GainNode;
  start(time: number): void;
  stop(time: number): void;
  setRate(rate: number): void;
  setWave(wave: string): void;
}

/** LFO node (output range ±1). 'S&H' and 'Random' use the same stepped random buffer. */
export function createLfo(ctx: Ctx, wave: string, rate: number): LfoHandle {
  const output = ctx.createGain();
  const shapes = [
    ['Sine', 'sine'],
    ['Tri', 'triangle'],
    ['Saw', 'sawtooth'],
    ['Square', 'square'],
  ] as const;
  const oscillators = shapes.map(([label, type]) => {
    const source = ctx.createOscillator();
    source.type = type;
    source.frequency.value = Math.max(0, rate);
    const gain = ctx.createGain();
    source.connect(gain).connect(output);
    return { label, source, gain };
  });

  const steps = 64;
  const per = Math.max(1, Math.floor(ctx.sampleRate / 50));
  const buffer = ctx.createBuffer(1, steps * per, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let step = 0; step < steps; step++) {
    const value = Math.random() * 2 - 1;
    data.fill(value, step * per, (step + 1) * per);
  }
  const random = ctx.createBufferSource();
  random.buffer = buffer;
  random.loop = true;
  const randomGain = ctx.createGain();
  random.connect(randomGain).connect(output);

  const isRandom = (name: string) => name === 'S&H' || name === 'Random';
  const normalShape = (name: string) => shapes.some(([label]) => label === name) ? name : 'Tri';
  const setWave = (next: string) => {
    const randomOn = isRandom(next);
    const selected = normalShape(next);
    for (const shape of oscillators) {
      setSmooth(shape.gain.gain, !randomOn && shape.label === selected ? 1 : 0, ctx, 0.01);
    }
    setSmooth(randomGain.gain, randomOn ? 1 : 0, ctx, 0.01);
  };
  const setRate = (next: number) => {
    const safeRate = Math.max(0, Number.isFinite(next) ? next : 1);
    for (const shape of oscillators) setSmooth(shape.source.frequency, safeRate, ctx, 0.05);
    // The source buffer contains 50 flat samples per second before playback-rate scaling.
    setSmooth(random.playbackRate, clamp(safeRate / 50, 0.001, 20), ctx, 0.05);
  };

  setWave(wave);
  setRate(rate);
  return {
    node: output,
    start(time) {
      for (const shape of oscillators) shape.source.start(time);
      random.start(time);
    },
    stop(time) {
      for (const shape of oscillators) shape.source.stop(time);
      random.stop(time);
    },
    setRate,
    setWave,
  };
}

/** Stereo chorus voice set: n modulated delays panned across the field. */
export function buildChorus(ctx: Ctx, input: AudioNode, output: AudioNode, o: { voices: number; delayMs: number; depthMs: number; rate: number; spread?: number; feedback?: number }) {
  const parts: { lfoGain: GainNode; delay: DelayNode; lfo: OscillatorNode; fb?: GainNode }[] = [];
  for (let i = 0; i < o.voices; i++) {
    const delay = ctx.createDelay(0.1);
    delay.delayTime.value = (o.delayMs + i * 1.7) / 1000;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = o.rate * (1 + i * 0.13);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = o.depthMs / 1000;
    lfo.connect(lfoGain).connect(delay.delayTime);
    const pan = ctx.createStereoPanner();
    pan.pan.value = o.voices === 1 ? 0 : ((i / (o.voices - 1)) * 2 - 1) * (o.spread ?? 0.8);
    const g = ctx.createGain();
    g.gain.value = 1 / Math.sqrt(o.voices);
    input.connect(delay);
    delay.connect(g).connect(pan).connect(output);
    let fb: GainNode | undefined;
    if (o.feedback) {
      fb = ctx.createGain();
      fb.gain.value = o.feedback;
      delay.connect(fb).connect(delay);
    }
    lfo.start();
    parts.push({ lfoGain, delay, lfo, fb });
  }
  return {
    parts,
    set(rate: number, depthMs: number, delayMs: number) {
      parts.forEach((p, i) => {
        setSmooth(p.lfo.frequency, rate * (1 + i * 0.13), ctx, 0.05);
        setSmooth(p.lfoGain.gain, depthMs / 1000, ctx, 0.05);
        setSmooth(p.delay.delayTime, (delayMs + i * 1.7) / 1000, ctx, 0.05);
      });
    },
    stop() {
      parts.forEach((p) => {
        try {
          p.lfo.stop();
        } catch {
          // already stopped
        }
      });
    },
  };
}

/**
 * Delay-line pitch shifter: two taps sweep through a short window with crossfaded saw
 * modulation (classic "doppler" shifter). ratio 2 = +1 octave.
 */
export function buildPitchShifter(ctx: Ctx, input: AudioNode, output: AudioNode, ratio: number, windowSec = 0.08) {
  const taps: { delay: DelayNode; mod: AudioBufferSourceNode; fade: AudioBufferSourceNode; amt: GainNode }[] = [];
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * windowSec);
  const saw = ctx.createBuffer(1, len, sr);
  const fadeBuf = ctx.createBuffer(1, len, sr);
  const s = saw.getChannelData(0);
  const f = fadeBuf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const ph = i / len;
    s[i] = ph;
    f[i] = Math.sin(Math.PI * ph);
  }
  const make = (offset: number) => {
    const delay = ctx.createDelay(1);
    const mod = ctx.createBufferSource();
    mod.buffer = saw;
    mod.loop = true;
    const amt = ctx.createGain();
    mod.connect(amt).connect(delay.delayTime);
    const fade = ctx.createBufferSource();
    fade.buffer = fadeBuf;
    fade.loop = true;
    const vca = ctx.createGain();
    vca.gain.value = 0;
    fade.connect(vca.gain);
    input.connect(delay).connect(vca).connect(output);
    const start = ctx.currentTime + 0.01;
    mod.start(start, offset * windowSec);
    fade.start(start, offset * windowSec);
    taps.push({ delay, mod, fade, amt });
  };
  make(0);
  make(0.5);
  const set = (r: number) => {
    // delay(t) = base + amt·saw(t); pitch ratio = 1 − d(delay)/dt = 1 − amt/window
    const rate = clamp(r, 0.25, 4);
    const amt = (1 - rate) * windowSec;
    const base = (amt < 0 ? -amt : 0) + 0.002;
    taps.forEach((t) => {
      setSmooth(t.amt.gain, amt, ctx, 0.03);
      setSmooth(t.delay.delayTime, base, ctx, 0.03);
    });
  };
  set(ratio);
  return {
    set,
    stop() {
      taps.forEach((t) => {
        try {
          t.mod.stop();
          t.fade.stop();
        } catch {
          // already stopped
        }
      });
    },
  };
}

/** Envelope follower: |x| → lowpass → output (0..~1 control signal). */
export function buildFollower(ctx: Ctx, input: AudioNode, smoothingHz = 12): { out: AudioNode; filter: BiquadFilterNode } {
  const rect = ctx.createWaveShaper();
  rect.curve = absCurve(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = smoothingHz;
  lp.Q.value = 0.5;
  input.connect(rect).connect(lp);
  return { out: lp, filter: lp };
}

/**
 * Stereo width (mid/side) matrix: w = 0 mono, 1 unchanged, 2 double side.
 * L' = L·(1+w)/2 + R·(1−w)/2, R' = R·(1+w)/2 + L·(1−w)/2.
 */
export function buildWidth(ctx: Ctx, initial = 1): { input: AudioNode; output: AudioNode; set(w: number): void } {
  const input = ctx.createChannelSplitter(2);
  const output = ctx.createChannelMerger(2);
  const ll = ctx.createGain();
  const rr = ctx.createGain();
  const lr = ctx.createGain();
  const rl = ctx.createGain();
  input.connect(ll, 0).connect(output, 0, 0);
  input.connect(rl, 1).connect(output, 0, 0);
  input.connect(rr, 1).connect(output, 0, 1);
  input.connect(lr, 0).connect(output, 0, 1);
  const set = (w: number) => {
    const a = (1 + clamp(w, 0, 2)) / 2;
    const b = (1 - clamp(w, 0, 2)) / 2;
    setSmooth(ll.gain, a, ctx, 0.02);
    setSmooth(rr.gain, a, ctx, 0.02);
    setSmooth(lr.gain, b, ctx, 0.02);
    setSmooth(rl.gain, b, ctx, 0.02);
  };
  ll.gain.value = rr.gain.value = (1 + initial) / 2;
  lr.gain.value = rl.gain.value = (1 - initial) / 2;
  return { input, output, set };
}

/** Disconnects nodes ignoring "not connected" errors. */
export function disconnectAll(...nodes: (AudioNode | null | undefined)[]): void {
  for (const n of nodes) {
    try {
      n?.disconnect();
    } catch {
      // not connected
    }
  }
}

/** Stops sources at time t ignoring "already stopped" errors. */
export function stopAll(t: number, ...nodes: (AudioScheduledSourceNode | null | undefined)[]): void {
  for (const n of nodes) {
    try {
      n?.stop(t);
    } catch {
      // not started / stopped
    }
  }
}
