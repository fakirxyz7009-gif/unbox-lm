/**
 * AudioWorklet processors for the spec devices.
 *
 * The processor is written as a self-contained function and loaded through a Blob URL, so it
 * works the same in the Vite dev server, the production build and Electron (no bundler worker
 * handling). Keep the function free of outside references: it runs in the AudioWorkletGlobalScope.
 *
 * 'unbox-dynamics': compressor / limiter / maximizer / gate with model-specific detectors
 * (VCA, FET, opto with program-dependent release, vari-mu with level-dependent ratio,
 * look-ahead brickwall), optional external sidechain (input 1), sidechain high-pass,
 * feed-forward or feedback topology, saturation colour and a final ceiling. Gain reduction is
 * posted to the main thread ~30 times per second.
 */

declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, ctor: unknown): void;
declare const sampleRate: number;

function dynamicsProcessorSource(): void {
  const P = [
    ['threshold', -18, -80, 20],
    ['ratio', 4, 1, 100],
    ['knee', 6, 0, 24],
    ['attack', 0.01, 0.00002, 1],
    ['release', 0.15, 0.005, 10],
    ['makeup', 0, -24, 36],
    ['input', 0, -24, 36],
    ['mode', 0, 0, 8],
    ['drive', 0, 0, 1],
    ['asym', 0, -1, 1],
    ['scHpf', 20, 10, 2000],
    ['useSc', 0, 0, 1],
    ['feedback', 0, 0, 1],
    ['autoRelease', 0, 0, 1],
    ['lookahead', 0, 0, 0.01],
    ['ceiling', 0, -24, 0],
    ['gateThreshold', -100, -100, 0],
    ['gateRange', -40, -80, 0],
    ['gateHold', 0.05, 0, 2],
    ['gateRelease', 0.2, 0.005, 4],
    ['expander', 0, 0, 1],
  ] as const;

  class Dynamics extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return P.map(([name, def, min, max]) => ({ name, defaultValue: def, minValue: min, maxValue: max, automationRate: 'k-rate' }));
    }
    private env = 0; // smoothed gain reduction (dB, <= 0)
    private slow = 0; // opto slow component
    private gateGain = 1;
    private gateHoldLeft = 0;
    private hpL = 0;
    private hpR = 0;
    private hpPrevL = 0;
    private hpPrevR = 0;
    private lastOutL = 0;
    private lastOutR = 0;
    private ring: Float32Array[] = [new Float32Array(1024), new Float32Array(1024)];
    private ringPos = 0;
    private report = 0;
    private minGr = 0;

    process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
      const input = inputs[0];
      const out = outputs[0];
      const sc = inputs[1];
      const n = out[0]?.length ?? 128;
      const v = (k: string) => params[k][0];
      const thr = v('threshold');
      const ratio = Math.max(1, v('ratio'));
      const knee = v('knee');
      const mode = Math.round(v('mode'));
      const inGain = Math.pow(10, v('input') / 20);
      const makeup = v('makeup');
      const drive = v('drive');
      const asym = v('asym');
      const useSc = v('useSc') > 0.5 && sc && sc.length > 0;
      const fb = v('feedback') > 0.5;
      const ceil = Math.pow(10, v('ceiling') / 20);
      const la = Math.max(0, Math.min(1023, Math.round((v('lookahead') || 0) * sampleRate)));
      const atk = Math.exp(-1 / (Math.max(0.00002, v('attack')) * sampleRate));
      const relBase = Math.max(0.005, v('release'));
      const auto = v('autoRelease') > 0.5;
      const hpA = Math.exp((-2 * Math.PI * v('scHpf')) / sampleRate);
      const gThr = v('gateThreshold');
      const gRange = Math.pow(10, v('gateRange') / 20);
      const gHold = v('gateHold') * sampleRate;
      const gRel = Math.exp(-1 / (Math.max(0.005, v('gateRelease')) * sampleRate));
      const expander = v('expander') > 0.5;
      const k = 1 + drive * 5;
      const kNorm = Math.tanh(k);
      const inL = input?.[0];
      const inR = input?.[1] ?? inL;
      for (let i = 0; i < n; i++) {
        const xl = (inL ? inL[i] : 0) * inGain;
        const xr = (inR ? inR[i] : 0) * inGain;
        // detector: external sidechain, feedback (output) or feed-forward (input)
        let dl = useSc ? sc[0][i] : fb ? this.lastOutL : xl;
        let dr = useSc ? (sc[1] ?? sc[0])[i] : fb ? this.lastOutR : xr;
        // one-pole high-pass on the detector
        const hl = hpA * (this.hpL + dl - this.hpPrevL);
        const hr = hpA * (this.hpR + dr - this.hpPrevR);
        this.hpPrevL = dl;
        this.hpPrevR = dr;
        this.hpL = hl;
        this.hpR = hr;
        dl = hl;
        dr = hr;
        const peak = Math.max(Math.abs(dl), Math.abs(dr));
        const lvl = 20 * Math.log10(peak + 1e-9);
        // gain computer
        let over = lvl - thr;
        let r = ratio;
        if (mode === 3) r = 1 + (ratio - 1) * Math.min(1, Math.max(0, over) / 12); // vari-mu: ratio grows with level
        if (mode === 4 || mode === 5) r = 100;
        let gr = 0;
        if (knee > 0 && 2 * Math.abs(over) <= knee) gr = ((1 / r - 1) * (over + knee / 2) * (over + knee / 2)) / (2 * knee);
        else if (over > 0) gr = (1 / r - 1) * over;
        // ballistics
        let rel = relBase;
        if (auto) rel = 0.08 + Math.min(1.2, Math.abs(this.env) / 12);
        if (mode === 2) rel = relBase * (0.4 + Math.min(3, Math.abs(this.slow) / 4)); // opto: longer after heavy reduction
        const relC = Math.exp(-1 / (rel * sampleRate));
        if (gr < this.env) this.env = atk * this.env + (1 - atk) * gr;
        else this.env = relC * this.env + (1 - relC) * gr;
        this.slow = 0.9995 * this.slow + 0.0005 * this.env;
        over = this.env;
        if (over < this.minGr) this.minGr = over;
        let g = Math.pow(10, (this.env + makeup) / 20);
        // gate / expander (channel dynamics)
        if (gThr > -99) {
          if (lvl > gThr) {
            this.gateHoldLeft = gHold;
            this.gateGain = 1 - 0.999 * (1 - this.gateGain) * 0.99;
          } else if (this.gateHoldLeft > 0) this.gateHoldLeft--;
          else {
            const target = expander ? Math.max(gRange, Math.pow(10, ((lvl - gThr) * 1) / 20)) : gRange;
            this.gateGain = gRel * this.gateGain + (1 - gRel) * target;
          }
          g *= this.gateGain;
        }
        // look-ahead: delay the signal, not the detector
        let yl = xl;
        let yr = xr;
        if (la > 0) {
          const rp = (((this.ringPos - la) % 1024) + 1024) % 1024;
          yl = this.ring[0][rp];
          yr = this.ring[1][rp];
          this.ring[0][this.ringPos] = xl;
          this.ring[1][this.ringPos] = xr;
          this.ringPos = (this.ringPos + 1) % 1024;
        }
        yl *= g;
        yr *= g;
        if (drive > 0.001) {
          yl = Math.tanh(k * (yl + asym * yl * yl)) / kNorm;
          yr = Math.tanh(k * (yr + asym * yr * yr)) / kNorm;
        }
        if (mode === 4 || mode === 5) {
          // final ceiling: soft knee into the limit
          const c = ceil;
          if (Math.abs(yl) > c * 0.9) yl = Math.sign(yl) * (c * 0.9 + c * 0.1 * Math.tanh((Math.abs(yl) - c * 0.9) / (c * 0.1)));
          if (Math.abs(yr) > c * 0.9) yr = Math.sign(yr) * (c * 0.9 + c * 0.1 * Math.tanh((Math.abs(yr) - c * 0.9) / (c * 0.1)));
        }
        this.lastOutL = Number.isFinite(yl) ? yl : 0;
        this.lastOutR = Number.isFinite(yr) ? yr : 0;
        out[0][i] = this.lastOutL;
        if (out[1]) out[1][i] = this.lastOutR;
      }
      this.report += n;
      if (this.report >= sampleRate / 30) {
        this.port.postMessage(this.minGr);
        this.report = 0;
        this.minGr = 0;
      }
      return true;
    }
  }
  registerProcessor('unbox-dynamics', Dynamics);
}

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();

/** Loads the dynamics processor into a context once; resolves false if worklets are unavailable. */
export function ensureDynamicsWorklet(ctx: BaseAudioContext): Promise<boolean> {
  let p = loaded.get(ctx);
  if (!p) {
    const worklet = (ctx as BaseAudioContext & { audioWorklet?: AudioWorklet }).audioWorklet;
    if (!worklet || typeof Blob === 'undefined' || typeof URL === 'undefined') p = Promise.resolve(false);
    else {
      const url = URL.createObjectURL(new Blob([`(${dynamicsProcessorSource.toString()})();`], { type: 'application/javascript' }));
      p = worklet
        .addModule(url)
        .then(() => true)
        .catch(() => false)
        .finally(() => URL.revokeObjectURL(url));
    }
    loaded.set(ctx, p);
  }
  return p;
}
