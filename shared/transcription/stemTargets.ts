/**
 * Recorded instruments used when a separated stem is turned into editable MIDI notes.
 * These are intentionally stable device types: source analysis must not quietly create a
 * modeled/algorithmic instrument for a musician who has chosen recorded sound sources.
 */
export interface RecordedStemTarget {
  readonly deviceType: `rec_${string}`;
  readonly instrumentName: string;
  /** The target kit's actual MIDI layout, when note classification produces drum roles. */
  readonly drumNotes?: Readonly<Record<'kick' | 'snare' | 'hat', number>>;
}

export const RECORDED_STEM_TARGETS = {
  drums: {
    deviceType: 'rec_big_rusty_drums',
    instrumentName: 'Big Rusty Drums (recorded)',
    drumNotes: { kick: 36, snare: 38, hat: 42 },
  },
  bass: {
    deviceType: 'rec_growlybass',
    instrumentName: 'Growlybass (recorded)',
  },
  // A piano is an honest pitch guide for a monophonic vocal line. It deliberately does not
  // misrepresent the estimate as recreated vocals, and uses the bundled CC0 piano recordings.
  vocals: {
    deviceType: 'rec_meta_piano',
    instrumentName: 'Meta Piano (recorded vocal pitch guide)',
  },
} as const satisfies Readonly<Record<'drums' | 'bass' | 'vocals', RecordedStemTarget>>;

export type TranscribedStem = keyof typeof RECORDED_STEM_TARGETS;

export function recordedStemTarget(stem: string): RecordedStemTarget | null {
  return Object.prototype.hasOwnProperty.call(RECORDED_STEM_TARGETS, stem)
    ? RECORDED_STEM_TARGETS[stem as TranscribedStem]
    : null;
}
