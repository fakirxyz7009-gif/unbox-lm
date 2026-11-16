/**
 * How long a returning controller still continues the take it interrupted (0 = never, the MIDI
 * strip's Resume offer is then the only way). A device preference, so it lives outside projects.
 */
const STORE = 'unbox.midiAutoResumeSeconds';

export const MIDI_AUTO_RESUME_DEFAULT = 8;

export function loadMidiAutoResumeSeconds(): number {
  try {
    const raw = localStorage.getItem(STORE);
    const value = raw === null ? NaN : Number(raw);
    if (Number.isFinite(value) && value >= 0) return Math.min(60, Math.round(value));
  } catch {
    // no storage (private window …): the default
  }
  return MIDI_AUTO_RESUME_DEFAULT;
}

export function saveMidiAutoResumeSeconds(seconds: number): void {
  try {
    localStorage.setItem(STORE, String(seconds));
  } catch {
    // not saved; still applies this session
  }
}
