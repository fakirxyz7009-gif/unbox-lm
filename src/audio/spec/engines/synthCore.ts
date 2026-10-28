/**
 * Shared parts of the keyboard instrument engines:
 *  - output bus with tremolo,
 *  - one free-running LFO feeding pitch / filter / amp modulation,
 *  - global pitch and cutoff offsets (ConstantSource → detune) so knob moves and CV reach
 *    voices that are already sounding,
 *  - the per-voice filter (all spec filter types) with its ADSR envelope.
 */
import type { SpecHost } from '../SpecDevice.ts';
import { adsrRelease, adsrStart, clamp, createLfo, releaseTail, satCurve, setSmooth, type LfoHandle } from '../dsp.ts';

export interface FilterModel {
  kind: BiquadFilterType | 'comb+' | 'comb-' | 'formant' | 'am';
  poles: number;
  extraHp?: boolean;
}

export function parseFilter(label: string): FilterModel {
  const l = label.toLowerCase();
  const poles = /24|4-pole/.test(l) ? 4 : /18/.test(l) ? 3 : /\b6\b|hp 6/.test(l) ? 1 : 2;
  if (l.includes('comb+') || l === 'comb') return { kind: 'comb+', poles: 1 };
  if (l.includes('comb-')) return { kind: 'comb-', poles: 1 };
  if (l.includes('formant')) return { kind: 'formant', poles: 2 };
  if (l === 'am') return { kind: 'am', poles: 1 };
  if (l.includes('notch')) return { kind: 'notch', poles: 2 };
  if (l.includes('lp+hp')) return { kind: 'lowpass', poles: 2, extraHp: true };
  if (l.includes('bp') || l.includes('band')) return { kind: 'bandpass', poles: 2 };
  if (l.includes('hp')) return { kind: 'highpass', poles };
  if (l.includes('peak')) return { kind: 'peaking', poles: 2 };
  return { kind: 'lowpass', poles };
}

const resQ = (res: number, kind: string) => (kind === 'bandpass' || kind === 'notch' ? 0.7 + res * 12 : 0.5 + res * res * 18);

export interface FilterVoice {
  input: AudioNode;
  output: AudioNode;
  setRes(res: number, now: number): void;
  release(t: number): void;
  stop(t: number): void;
}

const VOWELS = [
  [800, 1150, 2900],
  [400, 1600, 2700],
  [350, 2300, 3000],
  [450, 800, 2830],
  [325, 700, 2530],
];

export class SynthCore {
  readonly bus: GainNode;
  readonly trem: GainNode;
  readonly pitchDetune: ConstantSourceNode;
  readonly cutDetune: ConstantSourceNode;
  private readonly lfo: LfoHandle;
  private readonly lfoPitch: GainNode;
  private readonly lfoCut: GainNode;
  private readonly lfoAmp: GainNode;
  private readonly lfoOut: GainNode;
  readonly cutoffRef: number;
  private driveCurve: Float32Array<ArrayBuffer> | null = null;
  private driveAmt = -1;

  constructor(private readonly host: SpecHost, opts: { cutoffKey?: string; trim?: number } = {}) {
    const ctx = host.ctx;
    this.bus = ctx.createGain();
    // gain staging: a two-note chord at full velocity peaks around -3 dBFS
    this.bus.gain.value = opts.trim ?? 0.5;
    this.trem = ctx.createGain();
    this.bus.connect(this.trem);
    this.pitchDetune = ctx.createConstantSource();
    this.pitchDetune.offset.value = 0;
    this.cutDetune = ctx.createConstantSource();
    this.cutDetune.offset.value = 0;
    this.cutoffRef = host.p(opts.cutoffKey ?? 'cutoff', 2000) || 2000;
    this.lfo = createLfo(ctx, host.opt('lfoWave') || 'Tri', host.p('lfoRate', 4));
    this.lfoOut = ctx.createGain();
    this.lfo.node.connect(this.lfoOut);
    this.lfoPitch = ctx.createGain();
    this.lfoCut = ctx.createGain();
    this.lfoAmp = ctx.createGain();
    this.lfoOut.connect(this.lfoPitch).connect(this.pitchDetune.offset);
    this.lfoOut.connect(this.lfoCut).connect(this.cutDetune.offset);
    this.lfoOut.connect(this.lfoAmp).connect(this.trem.gain);
    const t = ctx.currentTime;
    this.lfo.start(t);
    this.pitchDetune.start(t);
    this.cutDetune.start(t);
    this.syncAll();
  }

  /** Connect the core output (after tremolo) to a destination. */
  connect(dest: AudioNode): void {
    this.trem.connect(dest);
  }

  syncAll(): void {
    for (const k of ['lfoRate', 'lfoPitch', 'lfoCutoff', 'lfoAmp', 'cutoff', '__mod']) this.onParam(k);
  }

  /** Handles params owned by the core; returns true when handled. */
  onParam(key: string): boolean {
    const h = this.host;
    const ctx = h.ctx;
    switch (key) {
      case 'lfoRate':
        this.lfo.setRate(h.p('lfoRate', 4));
        return true;
      case 'lfoPitch':
      case '__mod': {
        const mod = h.modWheel();
        setSmooth(this.lfoPitch.gain, h.p('lfoPitch', 0) * 200 + mod * 60, ctx, 0.03);
        return true;
      }
      case 'lfoCutoff':
        setSmooth(this.lfoCut.gain, h.p('lfoCutoff', 0) * 2400, ctx, 0.03);
        return true;
      case 'lfoAmp': {
        const d = clamp(h.p('lfoAmp', 0), 0, 1);
        setSmooth(this.trem.gain, 1 - d / 2, ctx, 0.03);
        setSmooth(this.lfoAmp.gain, d / 2, ctx, 0.03);
        return true;
      }
      case 'cutoff':
        setSmooth(this.cutDetune.offset, 1200 * Math.log2(Math.max(20, h.p('cutoff', this.cutoffRef)) / this.cutoffRef), ctx, 0.012);
        return true;
      case 'lfoWave':
        this.lfo.setWave(h.opt('lfoWave') || 'Tri');
        return true;
      default:
        return false;
    }
  }

  /** Shared drive curve (pre-filter saturation). */
  drive(): Float32Array<ArrayBuffer> | null {
    const d = clamp(this.host.p('drive', 0), 0, 1);
    if (d < 0.02) return null;
    if (Math.abs(d - this.driveAmt) > 0.01) {
      this.driveAmt = d;
      this.driveCurve = satCurve(d * 0.6);
    }
    return this.driveCurve;
  }

  /**
   * Builds a voice filter for `note` starting at t, with envelope.
   * `opts.cutoff` overrides the base cutoff (layer B).
   */
  makeFilter(t: number, note: number, vel: number, opts: { type?: string; cutoff?: number; envAmount?: number; keyTrack?: number } = {}): FilterVoice {
    const h = this.host;
    const ctx = h.ctx;
    const model = parseFilter(opts.type ?? (h.opt('filterType') || 'LP24'));
    const res = clamp(h.p('resonance', 0.2), 0, 1);
    const kt = opts.keyTrack ?? h.p('keyTrack', 0.3);
    const base = clamp((opts.cutoff ?? this.cutoffRef) * Math.pow(2, ((note - 60) / 12) * kt), 20, 20000);
    const envAmt = (opts.envAmount ?? h.p('envAmount', 0)) * (0.5 + 0.5 * vel);
    const env = { a: h.p('fAttack', 0.005), d: h.p('fDecay', 0.3), s: h.p('fSustain', 0.3), r: h.p('fRelease', 0.3) };
    const peak = clamp(base * Math.pow(2, envAmt * 5), 20, 20000);
    const sus = clamp(base * Math.pow(2, envAmt * 5 * env.s), 20, 20000);
    const input = ctx.createGain();
    const output = ctx.createGain();
    const biquads: BiquadFilterNode[] = [];
    const extras: AudioScheduledSourceNode[] = [];
    let head: AudioNode = input;

    const shaper = this.drive();
    if (shaper) {
      const ws = ctx.createWaveShaper();
      ws.curve = shaper;
      head.connect(ws);
      head = ws;
    }

    if (model.kind === 'comb+' || model.kind === 'comb-') {
      // feed-forward comb at the cutoff frequency (no feedback loop: works at any pitch)
      const delay = ctx.createDelay(0.06);
      delay.delayTime.value = 1 / base;
      const g = ctx.createGain();
      g.gain.value = (model.kind === 'comb+' ? 1 : -1) * (0.3 + res * 0.65);
      head.connect(output);
      head.connect(delay).connect(g).connect(output);
      return {
        input,
        output,
        setRes: () => undefined,
        release: () => undefined,
        stop: () => undefined,
      };
    }
    if (model.kind === 'am') {
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const car = ctx.createOscillator();
      car.frequency.value = base;
      car.connect(ring.gain);
      head.connect(ring).connect(output);
      head.connect(output);
      car.start(t);
      extras.push(car);
      return { input, output, setRes: () => undefined, release: () => undefined, stop: (st) => extras.forEach((x) => x.stop(st)) };
    }
    if (model.kind === 'formant') {
      const shift = base / 1000;
      const vowel = VOWELS[Math.round(clamp(res * 4, 0, 4))];
      for (const f of vowel) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = clamp(f * shift, 80, 16000);
        bp.Q.value = 6;
        this.cutDetune.connect(bp.detune);
        head.connect(bp).connect(output);
        biquads.push(bp);
      }
      return {
        input,
        output,
        setRes: () => undefined,
        release: () => undefined,
        stop: () => biquads.forEach((b) => this.cutDetune.disconnect(b.detune)),
      };
    }

    const stages = model.poles >= 3 ? 2 : 1;
    for (let i = 0; i < stages; i++) {
      const f = ctx.createBiquadFilter();
      f.type = model.kind as BiquadFilterType;
      // 4-pole: resonance on the 2nd stage only (ladder-like), 3-pole: softer first stage
      f.Q.value = model.poles === 1 ? 0.4 : i === 0 && stages === 2 ? (model.poles === 3 ? 0.4 : 0.54) : resQ(res, model.kind);
      if (model.kind === 'peaking') f.gain.value = 6 + res * 12;
      this.cutDetune.connect(f.detune);
      head.connect(f);
      head = f;
      biquads.push(f);
      adsrStart(f.frequency, t, base, peak, sus, env);
    }
    if (model.extraHp) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = Math.max(20, base / 4);
      head.connect(hp);
      head = hp;
    }
    head.connect(output);
    return {
      input,
      output,
      setRes: (r: number, now: number) => {
        const last = biquads[biquads.length - 1];
        if (last) last.Q.setTargetAtTime(resQ(r, model.kind), now, 0.02);
      },
      release: (rt: number) => biquads.forEach((f) => adsrRelease(f.frequency, rt, base, env.r)),
      stop: () => biquads.forEach((f) => {
        try {
          this.cutDetune.disconnect(f.detune);
        } catch {
          // already disconnected
        }
      }),
    };
  }

  /** Starts the amp envelope on `gain` at t; returns the envelope used. */
  ampStart(gain: AudioParam, t: number, vel: number, peakScale = 1): { a: number; d: number; s: number; r: number } {
    const h = this.host;
    const env = { a: h.p('attack', 0.005), d: h.p('decay', 0.3), s: h.p('sustain', 0.7), r: h.p('release', 0.3) };
    const va = clamp(h.p('velAmount', 0.6), 0, 1);
    const peak = (1 - va + va * vel) * peakScale;
    adsrStart(gain, t, 0, peak, peak * env.s, env);
    return env;
  }

  static tail(r: number): number {
    return releaseTail(r);
  }

  stop(): void {
    const t = this.host.ctx.currentTime;
    try {
      this.lfo.stop(t);
      this.pitchDetune.stop(t);
      this.cutDetune.stop(t);
    } catch {
      // already stopped
    }
  }
}
