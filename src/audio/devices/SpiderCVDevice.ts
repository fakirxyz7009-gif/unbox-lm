import { BaseDevice } from '../BaseDevice.ts';

export class SpiderCVDevice extends BaseDevice {
  public splitInputVal: number = 0;
  public mergedVal: number = 0;
  private mergeVal1: number = 0;
  private mergeVal2: number = 0;

  constructor(ctx: AudioContext, id: string = 'spider_cv_1', name: string = 'Spider CV Merger & Splitter') {
    super(ctx, id, name, 'spider_cv', 1);

    this.params = {
      invert1: false,
      invert2: false,
      invert3: false,
      invert4: false,
    };

    this.ports = [
      { id: 'split_in', name: 'CV Split In', type: 'cv_in' },
      { id: 'split_out_1', name: 'CV Split 1', type: 'cv_out' },
      { id: 'split_out_2', name: 'CV Split 2', type: 'cv_out' },
      { id: 'split_out_3', name: 'CV Split 3', type: 'cv_out' },
      { id: 'split_out_4', name: 'CV Split 4', type: 'cv_out' },

      { id: 'merge_in_1', name: 'CV Merge 1', type: 'cv_in' },
      { id: 'merge_in_2', name: 'CV Merge 2', type: 'cv_in' },
      { id: 'merge_out', name: 'CV Merge Out', type: 'cv_out' },
    ];

    this.cvInputs.set('split_in', {
      setter: (v: number) => { this.splitInputVal = v; },
    });
    this.cvInputs.set('merge_in_1', {
      setter: (v: number) => { this.mergeVal1 = v; this.mergedVal = (this.mergeVal1 + this.mergeVal2) * 0.5; },
    });
    this.cvInputs.set('merge_in_2', {
      setter: (v: number) => { this.mergeVal2 = v; this.mergedVal = (this.mergeVal1 + this.mergeVal2) * 0.5; },
    });

    this.cvOutputs.set('split_out_1', { getter: () => (this.params.invert1 ? -this.splitInputVal : this.splitInputVal) });
    this.cvOutputs.set('split_out_2', { getter: () => (this.params.invert2 ? -this.splitInputVal : this.splitInputVal) });
    this.cvOutputs.set('split_out_3', { getter: () => (this.params.invert3 ? -this.splitInputVal : this.splitInputVal) });
    this.cvOutputs.set('split_out_4', { getter: () => (this.params.invert4 ? -this.splitInputVal : this.splitInputVal) });
    this.cvOutputs.set('merge_out', { getter: () => this.mergedVal });
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
  }

  public getVisualData(): { inVal: number; outVal: number } {
    return { inVal: this.splitInputVal, outVal: this.mergedVal };
  }
}
