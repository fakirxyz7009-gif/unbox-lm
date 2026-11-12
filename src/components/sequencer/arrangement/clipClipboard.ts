/**
 * Clipboard for arrangement clips (Ctrl+C / Ctrl+X / Ctrl+V in any timeline). Module-level, so a
 * clip copied in one timeline pastes in another, and onto another instrument: each pattern clip
 * carries a snapshot of its pattern, taken when it was copied.
 */
import type { PatternSnapshot } from '../../../audio/sequencer/editor.ts';
import type { ArrangementClip } from '../../../audio/types.ts';

export interface CopiedClip {
  clip: ArrangementClip;
  /** Track it was copied from. */
  trackId: string;
  /** Lane (track index) at copy time: pasted clips keep their lanes relative to each other. */
  lane: number;
  pattern: PatternSnapshot | null;
}

let copied: CopiedClip[] = [];

export function copyClips(items: CopiedClip[]): void {
  copied = items;
}

export function copiedClips(): readonly CopiedClip[] {
  return copied;
}
