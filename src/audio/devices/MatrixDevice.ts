import { BaseDevice } from '../BaseDevice.ts';

export interface MatrixPatternData {
  notes: number[];    // -12 to +12
  gates: boolean[];
  curveCV: number[];  // 0.0 to 1.0
}

export class MatrixDevice extends BaseDevice {
  public patterns: MatrixPatternData[] = [];
  public currentPatternIndex: number = 0;
  public currentStep: number = 0;
  public numSteps: number = 16;
  public resolution: string = '1/16';
  public targetDeviceId: string | null = null;

  // Real-time CV values exposed for audio engine and cables
  public currentNoteCV: number = 0;
  public currentGateCV: number = 0;
  public currentCurveCV: number = 0;

  constructor(ctx: AudioContext, id: string = 'matrix_1', name: string = 'Matrix Pattern / CV Sequencer') {
    super(ctx, id, name, 'matrix', 2);

    // Initialize 8 patterns (A-H)
    for (let p = 0; p < 8; p++) {
      this.patterns.push({
        notes: Array(32).fill(0),
        gates: Array(32).fill(false),
        curveCV: Array(32).fill(0.5),
      });
    }

    // Default Pattern A: catchy melodic arp line
    const defaultNotes = [0, 0, 7, 0, 10, 0, 12, 10, 7, 0, 3, 5, 7, 0, 12, 15];
    const defaultGates = [true, false, true, false, true, false, true, true, true, false, true, true, true, false, true, true];
    const defaultCurve = [0.8, 0.2, 0.9, 0.1, 0.7, 0.3, 0.9, 0.8, 0.7, 0.2, 0.6, 0.8, 0.9, 0.3, 0.8, 0.9];

    for (let i = 0; i < 16; i++) {
      this.patterns[0].notes[i] = defaultNotes[i];
      this.patterns[0].gates[i] = defaultGates[i];
      this.patterns[0].curveCV[i] = defaultCurve[i];
    }

    this.params = {
      numSteps: 16,
      resolution: '1/16',
      activePattern: 0,
      shuffle: 0.1,
    };

    this.ports = [
      { id: 'note_cv', name: 'Note CV Out', type: 'cv_out', description: 'Outputs 1V/Oct pitch CV' },
      { id: 'gate_cv', name: 'Gate CV Out', type: 'cv_out', description: 'Outputs gate triggers' },
      { id: 'curve_cv', name: 'Curve CV Out', type: 'cv_out', description: 'Outputs step curve voltage' },
    ];

    this.cvOutputs.set('note_cv', { getter: () => this.currentNoteCV });
    this.cvOutputs.set('gate_cv', { getter: () => this.currentGateCV });
    this.cvOutputs.set('curve_cv', { getter: () => this.currentCurveCV });
  }

  public get currentPattern(): MatrixPatternData {
    return this.patterns[this.currentPatternIndex];
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    if (key === 'activePattern') {
      this.currentPatternIndex = Math.max(0, Math.min(7, Number(value)));
    } else if (key === 'numSteps') {
      this.numSteps = Number(value);
    }
  }

  public setStepNote(step: number, semitone: number): void {
    if (step >= 0 && step < 32) {
      this.currentPattern.notes[step] = Math.max(-24, Math.min(24, semitone));
    }
  }

  public toggleStepGate(step: number): void {
    if (step >= 0 && step < 32) {
      this.currentPattern.gates[step] = !this.currentPattern.gates[step];
    }
  }

  public setStepCurve(step: number, val: number): void {
    if (step >= 0 && step < 32) {
      this.currentPattern.curveCV[step] = Math.max(0, Math.min(1, val));
    }
  }

  public onStepTick(step: number, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    this.currentStep = step % this.numSteps;

    const pattern = this.currentPattern;
    const note = pattern.notes[this.currentStep];
    const gate = pattern.gates[this.currentStep];
    const curve = pattern.curveCV[this.currentStep];

    this.currentNoteCV = note;
    this.currentGateCV = gate ? 1.0 : 0.0;
    this.currentCurveCV = curve;

    // Pulse gate reset after short duration
    if (gate) {
      setTimeout(() => {
        this.currentGateCV = 0.0;
      }, 70);
    }
  }
}
