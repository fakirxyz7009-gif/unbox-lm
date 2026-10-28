/**
 * Deterministic four-way heuristic split. The named outputs are frequency/transient estimates,
 * not isolated sources; `other` is their exact residual so unity-gain recombination preserves input.
 */
export interface FourBandSplitChannels {
  vocalsL: Float32Array;
  vocalsR: Float32Array;
  bassL: Float32Array;
  bassR: Float32Array;
  drumsL: Float32Array;
  drumsR: Float32Array;
  otherL: Float32Array;
  otherR: Float32Array;
}

export interface FourBandSplitState {
  bassL1: number;
  bassL2: number;
  bassR1: number;
  bassR2: number;
  envL: number;
  envR: number;
  vocalLp: number;
  vocalHp: number;
}

export function createFourBandSplitState(): FourBandSplitState {
  return { bassL1: 0, bassL2: 0, bassR1: 0, bassR2: 0, envL: 0, envR: 0, vocalLp: 0, vocalHp: 0 };
}

/** Processes a half-open sample range, carrying IIR/envelope state across chunks. */
export function processFourBandSplitChunk(
  sourceL: Float32Array,
  sourceR: Float32Array,
  sampleRate: number,
  channels: FourBandSplitChannels,
  state: FourBandSplitState,
  start: number,
  end: number
): void {
  const bassAlpha = Math.exp(-2 * Math.PI * 220 / sampleRate);
  const envDecay = Math.exp(-1 / (sampleRate * 0.05));
  const envAttack = Math.exp(-1 / (sampleRate * 0.003));
  const vocalLpAlpha = Math.exp(-2 * Math.PI * 3600 / sampleRate);
  const vocalHpAlpha = Math.exp(-2 * Math.PI * 350 / sampleRate);

  for (let i = start; i < end; i++) {
    const l = sourceL[i];
    const r = sourceR[i];
    const mid = (l + r) * 0.5;

    state.bassL1 = state.bassL1 * bassAlpha + l * (1 - bassAlpha);
    state.bassL2 = state.bassL2 * bassAlpha + state.bassL1 * (1 - bassAlpha);
    state.bassR1 = state.bassR1 * bassAlpha + r * (1 - bassAlpha);
    state.bassR2 = state.bassR2 * bassAlpha + state.bassR1 * (1 - bassAlpha);
    const bassL = state.bassL2 * 1.25;
    const bassR = state.bassR2 * 1.25;
    channels.bassL[i] = bassL;
    channels.bassR[i] = bassR;

    const absL = Math.abs(l);
    const absR = Math.abs(r);
    state.envL = absL > state.envL ? state.envL * envAttack + absL * (1 - envAttack) : state.envL * envDecay;
    state.envR = absR > state.envR ? state.envR * envAttack + absR * (1 - envAttack) : state.envR * envDecay;
    const drumsL = (l - state.bassL2 * 0.9) * (state.envL > 0.04 ? 1.05 : 0.25) * 0.85;
    const drumsR = (r - state.bassR2 * 0.9) * (state.envR > 0.04 ? 1.05 : 0.25) * 0.85;
    channels.drumsL[i] = drumsL;
    channels.drumsR[i] = drumsR;

    state.vocalLp = state.vocalLp * vocalLpAlpha + mid * (1 - vocalLpAlpha);
    state.vocalHp = state.vocalHp * vocalHpAlpha + state.vocalLp * (1 - vocalHpAlpha);
    const vocal = (state.vocalLp - state.vocalHp) * 1.35 * (1 - Math.min(0.65, absL * 1.5));
    channels.vocalsL[i] = vocal;
    channels.vocalsR[i] = vocal;

    // Preserve the original mix when the four estimates are recombined at unity gain.
    channels.otherL[i] = l - bassL - drumsL - vocal;
    channels.otherR[i] = r - bassR - drumsR - vocal;
  }
}
