/**
 * EQ engine ('eq') — models:
 *  - pultec: low boost (shelf) + low atten (shelf cut just above it, the classic "trick"),
 *    high boost (bell, bandwidth), high atten (shelf), tube colour.
 *  - channel: SSL-style HPF / LPF, LF / HF shelf-or-bell, two parametric mids.
 *  - mclass: low cut, low shelf, two parametric bands, high shelf.
 *  - peq2: two parametric bands (B switchable).
 *  - graphic: ten fixed peaking bands, 31 Hz to 16 kHz, each ±12 dB (GRAPHIC_HZ).
 * The filter chain is built once; knobs move gains / frequencies smoothly.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { clamp, setSmooth, tubeCurve } from '../dsp.ts';

/** Centre frequencies of the graphic EQ's ten octave-spaced bands. */
const GRAPHIC_HZ = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const num = (s: string) => {
  const m = /([\d.]+)\s*(k?)/i.exec(s);
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : 1000;
};

export function eqEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const model = String(host.cfg.model ?? 'peq2');
  const make = (type: BiquadFilterType) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    return f;
  };
  const chain: BiquadFilterNode[] = [];
  const add = (type: BiquadFilterType) => {
    const f = make(type);
    chain.push(f);
    return f;
  };
  let shaper: WaveShaperNode | null = null;
  let sync: () => void;
  const S = (param: AudioParam, v: number) => setSmooth(param, v, ctx, 0.02);

  if (model === 'pultec') {
    const lowBoost = add('lowshelf');
    const lowCut = add('lowshelf');
    const highBoost = add('peaking');
    const highCut = add('highshelf');
    shaper = ctx.createWaveShaper();
    sync = () => {
      const lf = num(host.opt('lowFreq') || '60');
      S(lowBoost.frequency, lf);
      S(lowBoost.gain, host.p('lowBoost', 3) * 1.35);
      // attenuation sits a little higher than the boost → shelf lift with a dip above it
      S(lowCut.frequency, lf * 1.9);
      S(lowCut.gain, -host.p('lowAtten', 2) * 1.75);
      S(highBoost.frequency, num(host.opt('highFreq') || '10k'));
      S(highBoost.gain, host.p('highBoost', 3) * 1.8);
      S(highBoost.Q, 2.5 - clamp(host.p('bandwidth', 5), 0, 10) * 0.21);
      S(highCut.frequency, num(host.opt('attenFreq') || '10k'));
      S(highCut.gain, -host.p('highAtten', 0) * 2);
      const tube = clamp(host.p('tube', 0.3), 0, 1);
      shaper!.curve = tube > 0.02 ? tubeCurve(tube * 0.35) : null;
    };
  } else if (model === 'channel') {
    const hpf = add('highpass');
    const lpf = add('lowpass');
    const lf = add('lowshelf');
    const lmf = add('peaking');
    const hmf = add('peaking');
    const hf = add('highshelf');
    hpf.Q.value = 0.7;
    lpf.Q.value = 0.7;
    sync = () => {
      S(hpf.frequency, host.p('hpf', 16) <= 17 ? 5 : host.p('hpf', 16));
      S(lpf.frequency, host.p('lpf', 22000) >= 21000 ? 22000 : host.p('lpf', 22000));
      lf.type = host.p('lfBell', 0) >= 0.5 ? 'peaking' : 'lowshelf';
      hf.type = host.p('hfBell', 0) >= 0.5 ? 'peaking' : 'highshelf';
      S(lf.frequency, host.p('lfFreq', 100));
      S(lf.gain, host.p('lfGain', 0));
      S(lmf.frequency, host.p('lmfFreq', 600));
      S(lmf.gain, host.p('lmfGain', 0));
      S(lmf.Q, host.p('lmfQ', 1));
      S(hmf.frequency, host.p('hmfFreq', 2500));
      S(hmf.gain, host.p('hmfGain', 0));
      S(hmf.Q, host.p('hmfQ', 1));
      S(hf.frequency, host.p('hfFreq', 8000));
      S(hf.gain, host.p('hfGain', 0));
    };
  } else if (model === 'mclass') {
    const cut = add('highpass');
    const lo = add('lowshelf');
    const p1 = add('peaking');
    const p2 = add('peaking');
    const hi = add('highshelf');
    sync = () => {
      S(cut.frequency, host.p('loCut', 0) >= 0.5 ? 30 : 5);
      S(lo.frequency, host.p('loFreq', 120));
      S(lo.gain, host.p('loGain', 0));
      S(p1.frequency, host.p('p1Freq', 400));
      S(p1.gain, host.p('p1Gain', 0));
      S(p1.Q, host.p('p1Q', 1));
      S(p2.frequency, host.p('p2Freq', 3000));
      S(p2.gain, host.p('p2Gain', 0));
      S(p2.Q, host.p('p2Q', 1));
      S(hi.frequency, host.p('hiFreq', 9000));
      S(hi.gain, host.p('hiGain', 0));
    };
  } else if (model === 'graphic') {
    const bands = GRAPHIC_HZ.map((f) => {
      const band = add('peaking');
      band.frequency.value = f;
      band.Q.value = 1.41;
      return band;
    });
    sync = () => bands.forEach((band, i) => S(band.gain, host.p(`g${i}`, 0)));
  } else {
    const a = add('peaking');
    const b = add('peaking');
    sync = () => {
      S(a.frequency, host.p('aFreq', 250));
      S(a.Q, host.p('aQ', 1));
      S(a.gain, host.p('aGain', 0));
      S(b.frequency, host.p('bFreq', 3000));
      S(b.Q, host.p('bQ', 1));
      S(b.gain, host.p('bOn', 1) >= 0.5 ? host.p('bGain', 0) : 0);
    };
  }

  let node: AudioNode = host.ins[0];
  for (const f of chain) {
    node.connect(f);
    node = f;
  }
  if (shaper) {
    node.connect(shaper);
    node = shaper;
  }
  node.connect(host.outs[0]);
  sync();

  return {
    onParam(key) {
      if (key !== 'mix' && key !== 'output') sync();
    },
  };
}
