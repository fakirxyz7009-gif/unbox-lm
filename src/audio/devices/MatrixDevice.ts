import { BaseDevice } from '../BaseDevice.ts';

export interface MatrixPatternData {
  notes: number[];    // -12 to +12
  gates: boolean[];
  curveCV: number[];  // 0.0 to 1.0
}

interface MatrixCvStep {
  time: number;
  note: number;
  gate: boolean;
  curve: number;
}

const GATE_PULSE_SECONDS = 0.07;

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
  /** Scheduled look-ahead values, read by CV cables at AudioContext time. */
  private cvSteps: MatrixCvStep[] = [];

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

    this.cvOutputs.set('note_cv', { getter: (time) => this.cvAt(time).note });
    this.cvOutputs.set('gate_cv', { getter: (time) => this.cvAt(time).gate });
    this.cvOutputs.set('curve_cv', { getter: (time) => this.cvAt(time).curve });
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

  /** Restores saved step patterns. Values are clamped to the sequencer's ranges; a malformed pattern keeps its defaults. */
  public loadPatterns(saved: { patterns?: unknown }): void {
    if (!Array.isArray(saved.patterns)) return;
    saved.patterns.slice(0, this.patterns.length).forEach((raw: unknown, p: number) => {
      const pattern = raw as { notes?: unknown; gates?: unknown; curveCV?: unknown } | null;
      if (!pattern || !Array.isArray(pattern.notes) || !Array.isArray(pattern.gates) || !Array.isArray(pattern.curveCV)) return;
      const target = this.patterns[p];
      for (let i = 0; i < 32; i++) {
        const note = Number(pattern.notes[i]);
        target.notes[i] = Number.isFinite(note) ? Math.max(-24, Math.min(24, note)) : 0;
        target.gates[i] = pattern.gates[i] === true;
        const curve = Number(pattern.curveCV[i]);
        target.curveCV[i] = Number.isFinite(curve) ? Math.max(0, Math.min(1, curve)) : 0.5;
      }
    });
  }

  /** Offline renders step through the same patterns as the live unit. */
  public override cloneForOfflineContext(ctx: BaseAudioContext): BaseDevice {
    const copy = new MatrixDevice(ctx as AudioContext, this.id, this.name);
    Object.entries(this.params).forEach(([k, v]) => typeof v === 'number' && copy.setParam(k, v));
    copy.loadPatterns({ patterns: this.patterns });
    return copy;
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
    this.scheduleCvStep({ time, note, gate, curve });
  }

  private scheduleCvStep(step: MatrixCvStep): void {
    const existing = this.cvSteps.findIndex((entry) => Math.abs(entry.time - step.time) < 1e-9);
    if (existing >= 0) this.cvSteps[existing] = step;
    else {
      this.cvSteps.push(step);
      this.cvSteps.sort((a, b) => a.time - b.time);
    }
    // Keep a small history for UI/readback without growing on long arrangements. Future
    // look-ahead events are never discarded, so offline scheduling gets the same values.
    const retainAfter = Math.min(this.ctx.currentTime, step.time) - 1;
    while (this.cvSteps.length > 1 && this.cvSteps[1].time < retainAfter) this.cvSteps.shift();
  }

  private cvAt(audioTime: number | undefined): { note: number; gate: number; curve: number } {
    const time = audioTime ?? this.ctx.currentTime;
    let current: MatrixCvStep | undefined;
    for (let i = this.cvSteps.length - 1; i >= 0; i--) {
      if (this.cvSteps[i].time <= time) {
        current = this.cvSteps[i];
        break;
      }
    }
    if (!current) return { note: 0, gate: 0, curve: 0 };
    return {
      note: current.note,
      gate: current.gate && time < current.time + GATE_PULSE_SECONDS ? 1 : 0,
      curve: current.curve,
    };
  }
}
