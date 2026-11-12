/** Makes a device the selected part: the keyboard and MIDI target, and the piano roll's track. App listens. */
export function selectPart(deviceId: string): void {
  // Headless callers (unit tests, offline tools) have no window and no part to select.
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>('unbox:select-part', { detail: deviceId }));
}
