/**
 * Magnitude response of a channel EQ, computed with real BiquadFilterNodes on a tiny offline
 * context that never renders — so the drawn curve is exactly what the strip does.
 */
import type { ChannelEq } from '../../audio/types.ts';

type Band = 'hp' | 'low' | 'lm' | 'hm' | 'high' | 'lp';

let calc: Record<Band, BiquadFilterNode> | null = null;

function calculator(): Record<Band, BiquadFilterNode> | null {
  if (calc) return calc;
  if (typeof OfflineAudioContext === 'undefined') return null;
  const ctx = new OfflineAudioContext(1, 128, 48000);
  const f = (type: BiquadFilterType) => {
    const n = ctx.createBiquadFilter();
    n.type = type;
    return n;
  };
  calc = { hp: f('highpass'), low: f('lowshelf'), lm: f('peaking'), hm: f('peaking'), high: f('highshelf'), lp: f('lowpass') };
  return calc;
}

/** Log-spaced frequencies 20 Hz … 20 kHz. */
export function logFreqs(count: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = 20 * Math.pow(1000, i / (count - 1));
  return out;
}

/** Response in dB at `freqs` (flat when the EQ is off). */
export function eqResponseDb(eq: ChannelEq, freqs: Float32Array<ArrayBuffer>): Float32Array {
  const out = new Float32Array(freqs.length);
  const c = calculator();
  if (!c || !eq.on) return out;
  // A calculator context is never started: plain `.value` writes are fine here.
  c.hp.frequency.value = eq.hpHz;
  c.lp.frequency.value = eq.lpHz;
  c.low.frequency.value = eq.lowHz;
  c.low.gain.value = eq.lowDb;
  c.lm.frequency.value = eq.lmHz;
  c.lm.gain.value = eq.lmDb;
  c.lm.Q.value = eq.lmQ;
  c.hm.frequency.value = eq.hmHz;
  c.hm.gain.value = eq.hmDb;
  c.hm.Q.value = eq.hmQ;
  c.high.frequency.value = eq.highHz;
  c.high.gain.value = eq.highDb;
  const mag = new Float32Array(freqs.length);
  const phase = new Float32Array(freqs.length);
  const bands: BiquadFilterNode[] = [c.low, c.lm, c.hm, c.high];
  if (eq.hpOn) bands.push(c.hp);
  if (eq.lpOn) bands.push(c.lp);
  for (const b of bands) {
    b.getFrequencyResponse(freqs, mag, phase);
    for (let i = 0; i < freqs.length; i++) out[i] += 20 * Math.log10(Math.max(1e-6, mag[i]));
  }
  return out;
}
