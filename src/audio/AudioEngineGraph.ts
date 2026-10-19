/**
 * @file AudioEngineGraph.ts
 * @brief Encapsulated Web Audio graph manager sharing the single studio AudioContext.
 */
const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
export const sharedAudioContext: AudioContext = new AudioCtx({ latencyHint: 'interactive' });

export class AudioEngineGraph {
  public ctx: AudioContext;
  public masterBus: GainNode;

  constructor(existingCtx: AudioContext = sharedAudioContext) {
    this.ctx = existingCtx;
    this.masterBus = this.ctx.createGain();
    this.masterBus.connect(this.ctx.destination);
  }

  public createTrackGainNode(): GainNode {
    const gainNode = this.ctx.createGain();
    gainNode.connect(this.masterBus);
    return gainNode;
  }

  public setGainSmooth(node: GainNode, value: number, time: number = 0.01) {
    node.gain.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  public resume() {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

export const audioGraph = new AudioEngineGraph(sharedAudioContext);
