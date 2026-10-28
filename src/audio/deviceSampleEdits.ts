import { deviceSample, setPadSample, type PadSample } from './deviceSamples.ts';
import { undoJournal } from './undoJournal.ts';

interface SampleEditHost {
  readonly devices: ReadonlyMap<string, unknown>;
  undoSuspended(): boolean;
  changed(): void;
}
type PadState = ReadonlyMap<number, PadSample | null>;
const copy = (sample: PadSample | undefined | null): PadSample | null => sample ? { ...sample } : null;
const equal = (a: PadState, b: PadState) => JSON.stringify([...a]) === JSON.stringify([...b]);

function apply(host: SampleEditHost, deviceId: string, state: PadState): void {
  if (!host.devices.has(deviceId)) return;
  for (const [note, sample] of state) setPadSample(deviceId, note, copy(sample));
  host.changed();
}

/** Copies metadata only; recorded audio stays immutable in the audio store. */
export function editPadSamples(host: SampleEditHost, deviceId: string, changes: PadState, label: string, coalesceKey = ''): void {
  if (!host.devices.has(deviceId)) return;
  const before = new Map([...changes.keys()].map((note) => [note, copy(deviceSample(deviceId)?.pads?.[note])]));
  const after = new Map([...changes].map(([note, sample]) => [note, copy(sample)]));
  if (equal(before, after)) return;
  apply(host, deviceId, after);
  if (!host.undoSuspended()) undoJournal.push(coalesceKey, label, () => apply(host, deviceId, before), () => apply(host, deviceId, after));
}

export function editPadSample(host: SampleEditHost, deviceId: string, note: number, sample: PadSample | null): void {
  const before = deviceSample(deviceId)?.pads?.[note];
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(sample ?? {})])].sort()
    .filter((key) => before?.[key as keyof PadSample] !== sample?.[key as keyof PadSample]);
  editPadSamples(host, deviceId, new Map([[note, sample]]), 'Edit note audio', `sample:${deviceId}:${note}:${fields.join(',')}`);
}

/** Applies a metadata change only when the note already owns a real captured audio assignment. */
export function editCapturedPadSample(
  host: SampleEditHost,
  deviceId: string,
  note: number,
  patch: Partial<Omit<PadSample, 'audioId'>>,
): boolean {
  const current = deviceSample(deviceId)?.pads?.[note];
  if (!current) return false;
  editPadSample(host, deviceId, note, { ...current, ...patch });
  return true;
}

export interface PadSampleGesture {
  update(sample: PadSample): void;
  commit(): void;
  cancel(): void;
}

/** A long drag records one journal entry on release; cancellation restores the original trim. */
export function beginPadSampleGesture(host: SampleEditHost, deviceId: string, note: number): PadSampleGesture {
  const device = host.devices.get(deviceId);
  const before = new Map([[note, copy(deviceSample(deviceId)?.pads?.[note])]]);
  let after = before;
  let active = !!device;
  const current = () => active && host.devices.get(deviceId) === device;
  return {
    update(sample) {
      if (!current()) return;
      after = new Map([[note, copy(sample)]]);
      apply(host, deviceId, after);
    },
    commit() {
      if (current() && !equal(before, after) && !host.undoSuspended()) {
        const committed = after;
        undoJournal.push('', 'Trim note audio', () => apply(host, deviceId, before), () => apply(host, deviceId, committed));
      }
      active = false;
    },
    cancel() {
      if (current() && !equal(before, after)) apply(host, deviceId, before);
      active = false;
    },
  };
}
