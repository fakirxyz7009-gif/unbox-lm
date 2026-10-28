/**
 * Utility / routing engines.
 *  - 'stereo': gain (trim, per-side polarity, mono, swap), stereo (width, balance, output
 *    Stereo / Mid / Side / M-S encode, mono below a frequency, swap), imager (two-band width).
 *  - 'mixer': channel strips (level dB, pan, mute, solo, bass / treble, aux send) → master;
 *    summing models add their colour (Silk, harmonics, Nicerizer, transformer, passive loss,
 *    monitor mono / dim) and width.
 *  - 'di': pad, polarity, merge, 80 Hz low cut, fat (low lift), transformer saturation.
 *  - 'patchbay': N stereo channels; outputs take their input (normal), another input (front
 *    patch) or nothing, following Normalled / Half-Normalled / Isolated rules.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { buildWidth, clamp, dbToGain, satCurve, setSmooth, tubeCurve } from '../dsp.ts';

/** 2×2 channel matrix: L' = a·L + b·R, R' = c·L + d·R. */
function matrix2(ctx: BaseAudioContext, input: AudioNode, output: AudioNode) {
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  input.connect(split);
  const g = [ctx.createGain(), ctx.createGain(), ctx.createGain(), ctx.createGain()];
  split.connect(g[0], 0).connect(merge, 0, 0);
  split.connect(g[1], 1).connect(merge, 0, 0);
  split.connect(g[2], 0).connect(merge, 0, 1);
  split.connect(g[3], 1).connect(merge, 0, 1);
  merge.connect(output);
  return {
    set(a: number, b: number, c: number, d: number) {
      [a, b, c, d].forEach((v, i) => setSmooth(g[i].gain, v, ctx, 0.015));
    },
  };
}

export function stereoEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const model = String(host.cfg.model ?? 'stereo');
  const out = host.outs[0];
  if (model === 'gain') {
    const trim = ctx.createGain();
    const m = matrix2(ctx, host.ins[0], trim);
    trim.connect(out);
    const sync = () => {
      const sl = host.p('invertL', 0) >= 0.5 ? -1 : 1;
      const sr = host.p('invertR', 0) >= 0.5 ? -1 : 1;
      let a = sl, b = 0, c = 0, d = sr;
      if (host.p('mono', 0) >= 0.5) {
        a = c = sl / 2;
        b = d = sr / 2;
      }
      if (host.p('swap', 0) >= 0.5) [a, b, c, d] = [c, d, a, b];
      m.set(a, b, c, d);
      setSmooth(trim.gain, dbToGain(host.p('gain', 0)), ctx, 0.015);
    };
    sync();
    return { onParam: () => sync() };
  }
  if (model === 'imager') {
    const xLo = ctx.createBiquadFilter();
    xLo.type = 'lowpass';
    const xHi = ctx.createBiquadFilter();
    xHi.type = 'highpass';
    const wLo = buildWidth(ctx);
    const wHi = buildWidth(ctx);
    host.ins[0].connect(xLo).connect(wLo.input);
    host.ins[0].connect(xHi).connect(wHi.input);
    wLo.output.connect(out);
    wHi.output.connect(out);
    const sync = () => {
      const f = host.p('crossover', 250);
      setSmooth(xLo.frequency, f, ctx, 0.02);
      setSmooth(xHi.frequency, f, ctx, 0.02);
      xLo.Q.value = xHi.Q.value = 0.5;
      wLo.set(host.p('loWidth', 0.6));
      wHi.set(host.p('hiWidth', 1.3));
    };
    sync();
    return { onParam: (k) => k !== 'output' && sync() };
  }
  // Stereo Tool
  const monoLo = ctx.createBiquadFilter();
  monoLo.type = 'lowpass';
  const restHi = ctx.createBiquadFilter();
  restHi.type = 'highpass';
  const sumLo = ctx.createGain();
  const loMatrix = matrix2(ctx, monoLo, sumLo);
  const width = buildWidth(ctx);
  const post = ctx.createGain();
  const outM = matrix2(ctx, post, out);
  host.ins[0].connect(monoLo);
  host.ins[0].connect(restHi).connect(width.input);
  sumLo.connect(post);
  width.output.connect(post);
  const sync = () => {
    const f = host.p('monoBelow', 20);
    setSmooth(monoLo.frequency, f, ctx, 0.02);
    setSmooth(restHi.frequency, f, ctx, 0.02);
    // below the split: mono (unless the split is at its minimum = off)
    if (f <= 21) loMatrix.set(1, 0, 0, 1);
    else loMatrix.set(0.5, 0.5, 0.5, 0.5);
    width.set(host.p('width', 1));
    const bal = clamp(host.p('balance', 0), -1, 1);
    const gl = bal > 0 ? 1 - bal : 1;
    const gr = bal < 0 ? 1 + bal : 1;
    const o = host.opt('output') || 'Stereo';
    let a = gl, b = 0, c = 0, d = gr;
    if (o === 'Mid') [a, b, c, d] = [0.5, 0.5, 0.5, 0.5];
    else if (o === 'Side') [a, b, c, d] = [0.5, -0.5, -0.5, 0.5];
    else if (o === 'M/S Encode') [a, b, c, d] = [0.5, 0.5, 0.5, -0.5];
    if (host.p('swap', 0) >= 0.5) [a, b, c, d] = [c, d, a, b];
    outM.set(a, b, c, d);
  };
  sync();
  return { onParam: () => sync() };
}

export function mixerEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const cfg = host.cfg;
  const n = Number(cfg.channels ?? host.ins.length);
  const color = String(cfg.color ?? 'none');
  const bus = ctx.createGain();
  const auxBus = ctx.createGain();
  if (host.aux) auxBus.connect(host.aux);
  const retG = ctx.createGain();
  if (host.ret) host.ret.connect(retG).connect(bus);
  const strips = host.ins.slice(0, n).map((inp) => {
    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 120;
    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 6000;
    const level = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const mute = ctx.createGain();
    const aux = ctx.createGain();
    aux.gain.value = 0;
    inp.connect(bass).connect(treble).connect(level).connect(pan).connect(mute).connect(bus);
    mute.connect(aux).connect(auxBus);
    return { bass, treble, level, pan, mute, aux };
  });
  // master colour chain
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 4000;
  const shelfLo = ctx.createBiquadFilter();
  shelfLo.type = 'lowshelf';
  shelfLo.frequency.value = 100;
  const sat = ctx.createWaveShaper();
  sat.oversample = '2x';
  const width = buildWidth(ctx);
  const master = ctx.createGain();
  bus.connect(shelfLo).connect(shelf).connect(sat).connect(width.input);
  // monitor controllers: mono switch through a matrix; others straight
  const monoOut = ctx.createGain();
  const monoMatrix = matrix2(ctx, width.output, monoOut);
  monoOut.connect(master);
  master.connect(host.outs[0]);

  const sync = () => {
    const anySolo = strips.some((_, i) => host.p(`ch${i + 1}Solo`, 0) >= 0.5);
    strips.forEach((s, i) => {
      const k = i + 1;
      setSmooth(s.level.gain, host.p(`ch${k}Level`, 0) <= -59.5 ? 0 : dbToGain(host.p(`ch${k}Level`, 0)), ctx, 0.015);
      setSmooth(s.pan.pan, host.p(`ch${k}Pan`, 0), ctx, 0.015);
      const muted = host.p(`ch${k}Mute`, 0) >= 0.5 || (anySolo && host.p(`ch${k}Solo`, 0) < 0.5);
      setSmooth(s.mute.gain, muted ? 0 : 1, ctx, 0.01);
      setSmooth(s.bass.gain, host.p(`ch${k}Bass`, 0), ctx, 0.02);
      setSmooth(s.treble.gain, host.p(`ch${k}Treble`, 0), ctx, 0.02);
      setSmooth(s.aux.gain, host.p(`ch${k}Aux`, 0), ctx, 0.02);
    });
    setSmooth(retG.gain, host.p('auxReturn', 0.8), ctx, 0.02);
    // colour per model
    let hi = 0, lo = 0, drive = host.p('drive', 0);
    let curve: Float32Array<ArrayBuffer> | null = null;
    if (color === 'neve') {
      const silk = host.opt('silk');
      const tex = host.p('texture', 0.35);
      if (silk === 'Red') hi = tex * 3;
      if (silk === 'Blue') lo = tex * 3;
      drive = silk === 'Off' ? 0 : tex * 0.35;
    } else if (color === 'clean') {
      const h = host.opt('harmonics');
      drive = h === 'High' ? 0.35 : h === 'Low' ? 0.15 : 0;
      if (host.p('xformer', 0) >= 0.5) lo = 1.5;
      if (host.p('paralimit', 0) >= 0.5) drive = Math.max(drive, 0.25);
    } else if (color === 'nicerizer') {
      drive = host.p('nicerizer', 1) >= 0.5 ? 0.3 : 0;
      lo = drive ? 1.2 : 0;
      hi = drive ? 0.8 : 0;
    } else if (color === 'burl') lo = 1.5 + drive * 2;
    else if (color === 'api') hi = drive * 2;
    else if (color === 'passive') drive = 0;
    if (drive > 0.02) curve = color === 'neve' || color === 'burl' || color === 'nicerizer' ? tubeCurve(drive) : satCurve(drive * 0.5);
    sat.curve = curve;
    setSmooth(shelf.gain, hi, ctx, 0.03);
    setSmooth(shelfLo.gain, lo, ctx, 0.03);
    width.set(host.p('width', 1));
    const mono = host.p('mono', 0) >= 0.5;
    if (mono) monoMatrix.set(0.5, 0.5, 0.5, 0.5);
    else monoMatrix.set(1, 0, 0, 1);
    // passive summing loses ~6 dB per doubling of channels; the Output knob is the make-up
    const passiveLoss = color === 'passive' ? 1 / Math.sqrt(n) : 1;
    const dim = host.p('dim', 0) >= 0.5 ? dbToGain(-20) : 1;
    const masterDb = host.p('master', 0) <= -59.5 ? -200 : host.p('master', 0);
    setSmooth(master.gain, dbToGain(host.p('output', 0)) * dbToGain(masterDb) * passiveLoss * dim, ctx, 0.015);
  };
  sync();
  return { handles: { output: true }, onParam: () => sync() };
}

export function diEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const pad = ctx.createGain();
  const polarity = ctx.createGain();
  const mono = ctx.createGain();
  const monoM = matrix2(ctx, polarity, mono);
  const lowCut = ctx.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.Q.value = 0.7;
  const fat = ctx.createBiquadFilter();
  fat.type = 'lowshelf';
  fat.frequency.value = 90;
  const xf = ctx.createWaveShaper();
  xf.oversample = '2x';
  const hf = ctx.createBiquadFilter();
  hf.type = 'lowpass';
  host.ins[0].connect(pad).connect(polarity);
  mono.connect(lowCut).connect(fat).connect(xf).connect(hf).connect(host.outs[0]);
  const transformer = Number(host.cfg.transformer ?? 0.3);
  const sync = () => {
    const padDb = [0, -15, -30][clamp(Math.round(host.p('pad', 0)), 0, 2)];
    setSmooth(pad.gain, dbToGain(padDb), ctx, 0.015);
    setSmooth(polarity.gain, host.p('polarity', 0) >= 0.5 ? -1 : 1, ctx, 0.01);
    if (host.p('merge', 0) >= 0.5) monoM.set(0.5, 0.5, 0.5, 0.5);
    else monoM.set(1, 0, 0, 1);
    setSmooth(lowCut.frequency, host.p('lowCut', 0) >= 0.5 ? 80 : 10, ctx, 0.02);
    setSmooth(fat.gain, host.p('fat', 0) >= 0.5 ? 3 : 0, ctx, 0.02);
    const c = clamp(host.p('color', 0.35), 0, 1) * transformer;
    xf.curve = c > 0.01 ? tubeCurve(c) : null;
    setSmooth(hf.frequency, host.cfg.active ? 22000 : 19000 - c * 4000, ctx, 0.02);
    // Ground lift breaks hum loops on real hardware; there is no hum to remove here.
  };
  sync();
  return { onParam: (k) => k !== 'output' && sync() };
}

export function patchbayEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const n = Math.min(host.ins.length, host.outs.length);
  // gains[out][in]
  const gains = host.outs.slice(0, n).map((out) =>
    host.ins.slice(0, n).map((inp) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      inp.connect(g).connect(out);
      return g;
    })
  );
  const sync = () => {
    const mode = Math.round(host.p('mode', 1)); // 0 normalled, 1 half-normalled, 2 isolated
    const routes = Array.from({ length: n }, (_, k) => Math.round(host.p(`route${k + 1}`, 0))); // 0 normal, 1..n input, n+1 off
    // normalled: an input patched elsewhere from the front no longer reaches its own output
    const taken = new Set<number>();
    if (mode === 0) routes.forEach((r, k) => r >= 1 && r <= n && r - 1 !== k && taken.add(r - 1));
    for (let o = 0; o < n; o++) {
      const r = routes[o];
      for (let i = 0; i < n; i++) {
        let on = false;
        if (r >= 1 && r <= n) on = i === r - 1;
        else if (r === 0) on = mode !== 2 && i === o && !taken.has(i);
        setSmooth(gains[o][i].gain, on ? 1 : 0, ctx, 0.01);
      }
    }
  };
  sync();
  return { onParam: () => sync() };
}
