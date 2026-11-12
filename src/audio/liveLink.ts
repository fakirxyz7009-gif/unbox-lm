/**
 * Workstation "LINK": linked parts play along with the selected part from the on-screen keyboard
 * and hardware MIDI, so several instruments layer from one key press. Saved with the project.
 */
import { audioEngine } from './AudioEngine.ts';
import type { BaseDevice } from './BaseDevice.ts';

const linked = new Set<string>();

export function isLinked(deviceId: string): boolean {
  return linked.has(deviceId);
}

export function setLinked(deviceId: string, on: boolean): void {
  if (on) linked.add(deviceId);
  else linked.delete(deviceId);
  audioEngine.changed();
}

/** Moves a link to a replacement device (patch swap). */
export function relink(oldId: string, newId: string): void {
  if (!linked.delete(oldId)) return;
  linked.add(newId);
}

audioEngine.liveFanout = (dev: BaseDevice) => {
  const out = [dev];
  for (const id of linked) {
    if (id === dev.id) continue;
    const d = audioEngine.devices.get(id);
    if (!d) linked.delete(id);
    else if (d.isPowered && !d.isBypassed && audioEngine.isPlayableInstrument(d.type)) out.push(d);
  }
  return out;
};

audioEngine.registerProjectSection('liveLink', {
  save: () => [...linked],
  load: (data, idMap) => {
    linked.clear();
    if (Array.isArray(data)) for (const id of data) if (typeof id === 'string') linked.add(idMap.get(id) ?? id);
  },
});
