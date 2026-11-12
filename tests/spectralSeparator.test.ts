import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECTRAL_STEMS, separateSpectral, type StemChannels, type StemSplitMode } from '../src/audio/ai/spectralSeparator.ts';
import { STEM_MODE_CONFIGS } from '../src/audio/ai/MusicSeparator.ts';

const SR = 48_000;

/** A mix whose parts are known: kick, bass and a voice in the centre, a hat and a chord on the sides. */
function testMix(seconds: number) {
  const n = Math.round(SR * seconds);
  const parts = { kick: new Float32Array(n), bass: new Float32Array(n), hat: new Float32Array(n), chord: new Float32Array(n), voice: new Float32Array(n) };
  const pan: Record<keyof typeof parts, [number, number]> = { kick: [1, 1], bass: [1, 1], voice: [1, 1], hat: [0.4, 1], chord: [1, -0.6] };
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const beat = 0.5;
  for (let b = 0; b * beat < seconds; b++) {
    const s0 = Math.floor(b * beat * SR);
    let ph = 0;
    for (let i = 0; i < SR * 0.25 && s0 + i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (45 + 90 * Math.exp(-t * 30))) / SR;
      parts.kick[s0 + i] += Math.sin(ph) * Math.exp(-t * 14) * 0.8;
    }
    const h0 = s0 + Math.floor((beat / 2) * SR);
    let lp = 0;
    for (let i = 0; i < SR * 0.05 && h0 + i < n; i++) {
      const w = rnd();
      const hp = w - lp;
      lp = w * 0.2 + lp * 0.8;
      parts.hat[h0 + i] += hp * Math.exp(-(i / SR) * 90) * 0.35;
    }
  }
  let vph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = [55, 55, 65.41, 49][Math.floor(t / 2) % 4];
    parts.bass[i] = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * 0.3;
    for (const m of [4, 5, 6]) parts.chord[i] += (((f * m * t) % 1) * 2 - 1) * 0.07;
    vph += (2 * Math.PI * 330 * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t))) / SR;
    parts.voice[i] = (Math.sin(vph) + 0.5 * Math.sin(2 * vph) + 0.35 * Math.sin(3 * vph)) * 0.16;
  }
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (const k of Object.keys(parts) as (keyof typeof parts)[]) {
    for (let i = 0; i < n; i++) {
      L[i] += parts[k][i] * pan[k][0];
      R[i] += parts[k][i] * pan[k][1];
    }
  }
  /** How much of a part is in a stem: 1 = all of it, 0 = none. */
  const share = (stem: StemChannels, k: keyof typeof parts): number => {
    let sp = 0;
    let pp = 0;
    for (let i = 0; i < n; i++) {
      const pl = parts[k][i] * pan[k][0];
      const pr = parts[k][i] * pan[k][1];
      sp += stem.L[i] * pl + stem.R[i] * pr;
      pp += pl * pl + pr * pr;
    }
    return sp / pp;
  };
  return { L, R, n, share };
}

const mix = testMix(4);

for (const mode of ['4stem', '6stem', '8stem'] as StemSplitMode[]) {
  test(`${mode}: the stems add up to the source, sample for sample`, () => {
    const stems = separateSpectral(mix.L, mix.R, SR, mode);
    assert.deepEqual(Object.keys(stems), [...SPECTRAL_STEMS[mode]]);
    let worst = 0;
    for (let i = 0; i < mix.n; i++) {
      let l = 0;
      let r = 0;
      for (const s of Object.values(stems)) {
        l += s.L[i];
        r += s.R[i];
        assert.ok(Number.isFinite(s.L[i]) && Number.isFinite(s.R[i]));
      }
      worst = Math.max(worst, Math.abs(l - mix.L[i]), Math.abs(r - mix.R[i]));
    }
    assert.ok(worst < 1e-5, `reconstruction error ${worst}`);
  });
}

test('4 stems: each known part lands mostly in its own stem', () => {
  const s = separateSpectral(mix.L, mix.R, SR, '4stem');
  // measured 0.80 / 0.90 / 0.78 / 0.92 / 0.84 when written; the floors leave room for small tuning changes
  assert.ok(mix.share(s.drums, 'kick') > 0.65, `kick in drums ${mix.share(s.drums, 'kick').toFixed(2)}`);
  assert.ok(mix.share(s.bass, 'bass') > 0.8, `bass in bass ${mix.share(s.bass, 'bass').toFixed(2)}`);
  assert.ok(mix.share(s.drums, 'hat') > 0.65, `hat in drums ${mix.share(s.drums, 'hat').toFixed(2)}`);
  assert.ok(mix.share(s.other, 'chord') > 0.8, `chord in other ${mix.share(s.other, 'chord').toFixed(2)}`);
  assert.ok(mix.share(s.vocals, 'voice') > 0.7, `voice in vocals ${mix.share(s.vocals, 'voice').toFixed(2)}`);
  // and stays out of the others
  assert.ok(Math.abs(mix.share(s.vocals, 'kick')) < 0.05 && Math.abs(mix.share(s.vocals, 'chord')) < 0.08, 'the vocal stem holds no kick and no side chord');
  assert.ok(Math.abs(mix.share(s.drums, 'voice')) < 0.1, 'a held voice stays out of the drums');
  assert.ok(Math.abs(mix.share(s.bass, 'hat')) < 0.02 && Math.abs(mix.share(s.bass, 'voice')) < 0.05, 'the bass stem holds lows only');
});

test('6 and 8 stems: the drums split by register, the out-of-phase chord goes to "wide"', () => {
  const six = separateSpectral(mix.L, mix.R, SR, '6stem');
  assert.ok(mix.share(six.kick, 'kick') > 0.65);
  assert.ok(mix.share(six.hat, 'hat') > 0.55);
  assert.ok(Math.abs(mix.share(six.hat, 'kick')) < 0.02 && Math.abs(mix.share(six.kick, 'hat')) < 0.02);
  const eight = separateSpectral(mix.L, mix.R, SR, '8stem');
  assert.ok(mix.share(eight.wide, 'chord') > 0.6, `chord in wide ${mix.share(eight.wide, 'chord').toFixed(2)}`);
  assert.ok(mix.share(eight.vocals, 'voice') > 0.7);
});

test('edge cases: silence, a clip shorter than one window, a mono source', () => {
  const none = separateSpectral(new Float32Array(0), new Float32Array(0), SR, '4stem');
  assert.equal(none.vocals.L.length, 0);
  const quiet = separateSpectral(new Float32Array(3000), new Float32Array(3000), SR, '4stem');
  assert.ok(Object.values(quiet).every((s) => s.L.every((v) => v === 0) && s.R.every((v) => v === 0)), 'silence in, silence out');
  const short = new Float32Array(700).map((_, i) => Math.sin(i / 9) * 0.5);
  const st = separateSpectral(short, short, SR, '8stem');
  for (let i = 0; i < short.length; i++) {
    let sum = 0;
    for (const s of Object.values(st)) sum += s.L[i];
    assert.ok(Math.abs(sum - short[i]) < 1e-5);
  }
  // the same signal on both sides is the centre: a held tone in the voice range goes to the vocal stem
  const tone = new Float32Array(SR).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / SR) * 0.4);
  const mono = separateSpectral(tone, tone, SR, '4stem');
  const energy = (a: Float32Array) => a.reduce((e, v) => e + v * v, 0);
  assert.ok(energy(mono.vocals.L) > 0.9 * energy(tone));
});

test('the panel lists the stems of each mode in the separator order, each with a name', () => {
  for (const mode of ['4stem', '6stem', '8stem'] as StemSplitMode[]) {
    assert.deepEqual(STEM_MODE_CONFIGS[mode].map((d) => d.id), [...SPECTRAL_STEMS[mode]]);
    assert.ok(STEM_MODE_CONFIGS[mode].every((d) => d.label && d.color));
  }
});
