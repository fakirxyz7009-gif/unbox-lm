/**
 * Dynamics engine ('dynamics'): maps each model's front panel onto the 'unbox-dynamics'
 * AudioWorklet (src/audio/spec/worklets.ts) — SSL VCA bus, 1176 FET, LA-2A / WA-2A / Avalon
 * opto, Distressor, API 2500, Manley vari-mu, MClass maximizer, channel dynamics with gate —
 * plus model extras: Avalon 6-band EQ, Portico Silk + width + limiter.
 * While the worklet loads (a few ms) audio passes through unprocessed.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { buildWidth, clamp, satCurve, setSmooth } from '../dsp.ts';
import { ensureDynamicsWorklet } from '../worklets.ts';

type W = Record<string, number>;

/** Front-panel values → worklet parameters for a model. */
function mapModel(h: SpecHost): W {
  const cfg = h.cfg;
  const model = String(cfg.model ?? 'vca');
  const pick = (key: string, values: unknown, fallback: number) => {
    const arr = Array.isArray(values) ? (values as number[]) : null;
    return arr ? arr[clamp(Math.round(h.p(key, 0)), 0, arr.length - 1)] : h.p(key, fallback);
  };
  const tube = Number(cfg.tube ?? 0);
  switch (model) {
    case 'distressor': {
      const ratio = pick('ratio', cfg.ratioValues, 4);
      const dist = h.opt('dist');
      const det = h.opt('detector');
      return {
        input: h.p('input', 4) * 3,
        threshold: -10,
        ratio,
        knee: ratio >= 20 ? 0 : 4,
        attack: (0.05 * Math.pow(2, h.p('attackKnob', 5) * 0.95)) / 1000,
        release: (50 * Math.pow(2, h.p('releaseKnob', 5) * 0.66)) / 1000,
        makeup: (h.p('outputKnob', 4) - 5) * 3,
        mode: ratio >= 40 ? 4 : 0,
        drive: dist === 'Dist 2' ? 0.35 : dist === 'Dist 3' ? 0.5 : 0.04,
        asym: dist === 'Dist 2' ? 0.45 : 0,
        scHpf: det === 'HP' ? 120 : det === 'Band' ? 350 : 20,
      };
    }
    case 'opto': {
      if (h.spec.params.some((p) => p.key === 'peakReduction')) {
        const limit = h.p('limit', 0) >= 0.5;
        return {
          threshold: -h.p('peakReduction', 45) * 0.4,
          ratio: limit ? 20 : 3.5,
          knee: 10,
          attack: 0.01,
          release: 0.08,
          makeup: (h.p('gain', 45) - 40) * 0.4,
          mode: 2,
          drive: tube,
          asym: 0.3,
          scHpf: 20 + h.p('emphasis', 0.5) * 300,
        };
      }
      return {
        threshold: h.p('threshold', -12),
        ratio: h.p('ratio', 4),
        knee: 10,
        attack: h.p('attack', 10) / 1000,
        release: h.p('release', 150) / 1000,
        makeup: h.p('makeup', 2),
        mode: 2,
        drive: tube,
        asym: 0.3,
      };
    }
    case 'fet': {
      const ratio = pick('ratio', cfg.ratioValues, 4);
      return {
        input: h.p('input', 24) - 24,
        threshold: -18,
        ratio,
        knee: ratio >= 100 ? 0 : 2,
        attack: (0.0008 * Math.pow(0.55, h.p('attackKnob', 4) - 1)),
        release: 1.1 * Math.pow(0.58, h.p('releaseKnob', 4) - 1),
        makeup: h.p('outputKnob', 20) - 24,
        mode: 1,
        drive: ratio >= 100 ? 0.3 : 0.06,
        asym: 0,
      };
    }
    case 'api': {
      const rel = pick('release', cfg.releaseValues, 200);
      return {
        threshold: h.p('threshold', -4),
        ratio: pick('ratio', cfg.ratioValues, 4),
        knee: [0, 6, 12][clamp(Math.round(h.p('kneeSel', 0)), 0, 2)],
        attack: pick('attack', cfg.attackValues, 1) / 1000,
        release: rel < 0 ? 0.3 : rel / 1000,
        autoRelease: rel < 0 ? 1 : 0,
        makeup: h.p('makeup', 2),
        feedback: h.p('topology', 0) >= 0.5 ? 1 : 0,
        scHpf: [20, 80, 200][clamp(Math.round(h.p('thrust', 0)), 0, 2)],
        mode: 0,
        drive: 0.05,
      };
    }
    case 'varimu': {
      const limit = h.p('modeSel', 0) >= 0.5;
      return {
        input: h.p('input', 0),
        threshold: h.p('threshold', -10),
        ratio: limit ? 10 : 3,
        knee: 14,
        attack: pick('attack', cfg.attackValues, 50) / 1000,
        release: pick('release', cfg.releaseValues, 600) / 1000,
        makeup: h.p('makeup', 3),
        scHpf: h.p('scHp', 0) >= 0.5 ? 100 : 20,
        mode: 3,
        drive: tube,
        asym: 0.25,
      };
    }
    case 'maximizer': {
      const rel = h.opt('release');
      return {
        input: h.p('input', 3),
        threshold: h.p('ceiling', -0.3) - 0.5,
        ratio: 100,
        knee: 1,
        attack: [0.0005, 0.003, 0.01][clamp(Math.round(h.p('attack', 0)), 0, 2)],
        release: rel === 'Fast' ? 0.05 : rel === 'Mid' ? 0.2 : rel === 'Slow' ? 0.6 : 0.15,
        autoRelease: rel === 'Auto' ? 1 : 0,
        lookahead: h.p('lookahead', 1) >= 0.5 ? 0.003 : 0,
        ceiling: h.p('ceiling', -0.3),
        drive: h.p('softClip', 0.3) * 0.4,
        mode: 5,
      };
    }
    case 'channel': {
      return {
        threshold: h.p('threshold', -10),
        ratio: h.p('ratio', 4),
        knee: 4,
        attack: (h.p('attack', 10) / 1000) * (h.p('fastAttack', 0) >= 0.5 ? 0.1 : 1),
        release: h.p('release', 150) / 1000,
        makeup: h.p('makeup', 2),
        gateThreshold: h.p('gateThreshold', -80) <= -79.5 ? -100 : h.p('gateThreshold', -80),
        gateRange: h.p('gateRange', -40),
        gateHold: h.p('gateHold', 0.05),
        gateRelease: h.p('gateRelease', 0.2),
        expander: h.p('expander', 0),
        mode: 0,
      };
    }
    default: {
      // VCA (SSL G, Portico, MClass, COMP-01)
      const rel = pick('release', cfg.releaseValues, 150);
      return {
        threshold: h.p('threshold', -12),
        ratio: pick('ratio', cfg.ratioValues, 4),
        knee: h.p('knee', 3),
        attack: pick('attack', cfg.attackValues, 10) / 1000,
        release: rel < 0 ? 0.3 : rel / 1000,
        autoRelease: rel < 0 || h.p('adapt', 0) >= 0.5 ? 1 : 0,
        makeup: h.p('makeup', 2),
        scHpf: h.p('scHpf', 20),
        mode: 0,
      };
    }
  }
}

export function dynamicsEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const cfg = host.cfg;
  const input = host.ins[0];
  const out = host.outs[0];
  let node: AudioWorkletNode | null = null;
  let grDb = 0;

  // post chain: [Avalon EQ] → [Silk] → [width] → [ceiling limiter] → out
  const post = ctx.createGain();
  let tail: AudioNode = post;
  const eqBands: BiquadFilterNode[] = [];
  if (Array.isArray(cfg.eqBands)) {
    (cfg.eqBands as number[]).forEach((f, i, arr) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === arr.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 0.9;
      tail.connect(b);
      tail = b;
      eqBands.push(b);
    });
  }
  let silkShelf: BiquadFilterNode | null = null;
  let silkSat: WaveShaperNode | null = null;
  if (cfg.silk) {
    silkShelf = ctx.createBiquadFilter();
    silkSat = ctx.createWaveShaper();
    tail.connect(silkShelf).connect(silkSat);
    tail = silkSat;
  }
  let width: ReturnType<typeof buildWidth> | null = null;
  if (cfg.width) {
    width = buildWidth(ctx);
    tail.connect(width.input);
    tail = width.output;
  }
  let limiter: DynamicsCompressorNode | null = null;
  if (host.spec.params.some((p) => p.key === 'ceiling') && cfg.model !== 'maximizer') {
    limiter = ctx.createDynamicsCompressor();
    limiter.ratio.value = 20;
    limiter.knee.value = 0;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    tail.connect(limiter);
    tail = limiter;
  }
  tail.connect(out);

  // until the worklet is ready: straight through
  const through = ctx.createGain();
  input.connect(through).connect(post);

  const syncExtras = () => {
    eqBands.forEach((b, i) => setSmooth(b.gain, host.p(`eq${i + 1}`, 0), ctx, 0.02));
    if (silkShelf && silkSat) {
      const silk = host.opt('silk');
      const tex = clamp(host.p('texture', 0.4), 0, 1);
      silkShelf.type = silk === 'Blue' ? 'lowshelf' : 'highshelf';
      silkShelf.frequency.value = silk === 'Blue' ? 120 : 4000;
      setSmooth(silkShelf.gain, silk === 'Off' ? 0 : tex * 3.5, ctx, 0.03);
      silkSat.curve = silk === 'Off' || tex < 0.02 ? null : satCurve(tex * 0.3, silk === 'Red' ? 0.2 : 0.35);
    }
    width?.set(host.p('width', 1));
    if (limiter) setSmooth(limiter.threshold, host.p('ceiling', -0.3), ctx, 0.02);
  };
  syncExtras();

  const sync = () => {
    if (!node) return;
    const vals = mapModel(host);
  const all: W = { input: 0, makeup: 0, drive: 0, asym: 0, scHpf: 20, useSc: host.p('sidechain', 0) >= 0.5 ? 1 : 0, feedback: 0, autoRelease: 0, lookahead: 0, ceiling: 0, gateThreshold: -100, ...vals };
    for (const [k, v] of Object.entries(all)) {
      const param = node.parameters.get(k);
      if (param && Number.isFinite(v)) param.setTargetAtTime(v, ctx.currentTime, 0.01);
    }
  };

  const ready = ensureDynamicsWorklet(ctx).then((ok) => {
    if (!ok) return;
    node = new AudioWorkletNode(ctx, 'unbox-dynamics', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] });
    node.port.onmessage = (e: MessageEvent<number>) => {
      grDb = typeof e.data === 'number' ? e.data : 0;
    };
    sync();
    input.connect(node, 0, 0);
    if (host.sc) host.sc.connect(node, 0, 1);
    node.connect(post);
    try {
      input.disconnect(through);
    } catch {
      // already disconnected
    }
    host.changed();
  });

  return {
    onParam(key) {
      if (key === 'mix' || key === 'output') return;
      sync();
      syncExtras();
    },
    cv(id) {
      return id === 'gr_out' ? clamp(-grDb / 20, 0, 1) : 0;
    },
    meter() {
      return { gr: grDb };
    },
    ready: () => ready,
    dispose() {
      node?.disconnect();
      node?.port.close();
    },
  };
}
