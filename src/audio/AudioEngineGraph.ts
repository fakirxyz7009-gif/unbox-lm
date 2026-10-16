/**
 * @file AudioEngineGraph.ts
 * @brief Encapsulated Web Audio graph manager.
 */
export class AudioEngineGraph {
  public ctx: AudioContext;
  public masterBus: GainNode;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterBus = this.ctx.createGain();
    this.masterBus.connect(this.ctx.destination);
  }

  public createTrackGainNode(): GainNode {
    const gainNode = this.ctx.createGain();
    gainNode.connect(this.masterBus);
    return gainNode;
  }

  public setGainSmooth(node: GainNode, value: number, time: number = 0.05) {
    node.gain.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  public resume() {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

export const audioGraph = new AudioEngineGraph();
