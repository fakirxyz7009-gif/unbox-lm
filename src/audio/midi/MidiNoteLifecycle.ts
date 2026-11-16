/** Tracks the instrument targets for hardware MIDI keys and separates key release from sustain. */
export class MidiNoteLifecycle<T> {
  private readonly heldTargets = new Map<number, readonly T[]>();
  private readonly sustainedTargets = new Map<number, Set<T>>();

  noteOn(channel: number, note: number, targets: readonly T[]): readonly T[] {
    const key = this.key(channel, note);
    const previous = this.heldTargets.get(key) ?? [];
    this.heldTargets.set(key, [...targets]);
    return previous;
  }

  noteOff(
    channel: number,
    note: number,
    fallbackTargets: readonly T[],
    sustainDown: boolean,
    recordKeyRelease: (target: T, note: number, channel: number) => void,
    releaseSound: (target: T, note: number, channel: number) => void
  ): void {
    const key = this.key(channel, note);
    const targets = this.heldTargets.get(key) ?? fallbackTargets;
    this.heldTargets.delete(key);
    targets.forEach((target) => recordKeyRelease(target, note, channel));

    if (!sustainDown) {
      targets.forEach((target) => releaseSound(target, note, channel));
      return;
    }

    const sustained = this.sustainedTargets.get(key) ?? new Set<T>();
    targets.forEach((target) => sustained.add(target));
    this.sustainedTargets.set(key, sustained);
  }

  sustainReleased(releaseSound: (target: T, note: number, channel: number) => void, channel?: number): void {
    for (const [key, targets] of this.sustainedTargets) {
      const heldChannel = key >> 7;
      if (channel !== undefined && heldChannel !== (channel & 0x0f)) continue;
      const note = key & 0x7f;
      const held = this.heldTargets.get(key);
      targets.forEach((target) => {
        if (!held?.includes(target)) releaseSound(target, note, heldChannel);
      });
      this.sustainedTargets.delete(key);
    }
  }

  /** All Notes Off (CC 123) and System Reset: every held key on the channel, or on every channel, is released; sustained keys end too. */
  allOff(
    channel: number | undefined,
    recordKeyRelease: (target: T, note: number, channel: number) => void,
    releaseSound: (target: T, note: number, channel: number) => void
  ): void {
    for (const [key, targets] of [...this.heldTargets]) {
      const heldChannel = key >> 7;
      if (channel !== undefined && heldChannel !== (channel & 0x0f)) continue;
      const note = key & 0x7f;
      targets.forEach((target) => recordKeyRelease(target, note, heldChannel));
      targets.forEach((target) => releaseSound(target, note, heldChannel));
      this.heldTargets.delete(key);
    }
    this.sustainReleased(releaseSound, channel);
  }

  private key(channel: number, note: number): number {
    return ((channel & 0x0f) << 7) | (note & 0x7f);
  }
}
