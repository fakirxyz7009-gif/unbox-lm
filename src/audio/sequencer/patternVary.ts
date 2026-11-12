/**
 * Variations of a generated pattern, and the loop length of Pattern mode. Pure (no engine, no DOM).
 *
 * `varySteps` turns a style's base riff into a different take per seed: same feel (the downbeat of
 * every bar stays), other notes move by scale steps, drop out or fill gaps, and later bars drift
 * further than the first, so a multi-bar pattern develops instead of repeating one bar.
 */
import type { SequencerNote } from '../types.ts';

/** Small deterministic generator (mulberry32): the same seed gives the same take. */
export function seededRandom(seed: number): () => number {
  let a = (seed >>> 0) + 0x6d2b79f5;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VaryOptions {
  /** Drum kits: hits may only use these notes (the kit's pads). */
  drumNotes?: number[];
  /** Melodic parts: fits a pitch to the song's scale. */
  snap?: (midi: number) => number;
  stepsPerBar?: number;
}

/** A new take on `base` for `seed` (seed 0 returns the base riff unchanged). */
export function varySteps(base: readonly (SequencerNote | null)[], seed: number, opts: VaryOptions = {}): (SequencerNote | null)[] {
  const out: (SequencerNote | null)[] = base.map((s) => (s ? { ...s, ...(s.chordNotes ? { chordNotes: [...s.chordNotes] } : {}) } : null));
  if (!seed) return out;
  const rnd = seededRandom(seed);
  const spb = Math.max(1, opts.stepsPerBar ?? 16);
  const snap = opts.snap ?? ((m: number) => m);
  const drums = opts.drumNotes?.length ? opts.drumNotes : null;
  const clampNote = (m: number) => Math.max(0, Math.min(127, Math.round(m)));

  for (let i = 0; i < out.length; i++) {
    const bar = Math.floor(i / spb);
    const inBar = i % spb;
    // later bars change more, so the phrase goes somewhere
    const depth = Math.min(1, 0.55 + bar * 0.2);
    const cur = out[i];
    if (cur) {
      if (inBar === 0) {
        cur.velocity = Math.min(1, cur.velocity);
        continue; // the bar's downbeat anchors the groove
      }
      const r = rnd();
      if (r < 0.14 * depth) {
        out[i] = null;
        continue;
      }
      if (drums) {
        // swap a hat / ghost for another pad now and then; kicks on the beat stay
        if (inBar % 4 !== 0 && rnd() < 0.2 * depth) {
          cur.note = drums[Math.floor(rnd() * drums.length)];
          // a pad sounds once per step
          const rest = cur.chordNotes?.filter((n) => n !== cur.note);
          if (rest?.length) cur.chordNotes = rest;
          else delete cur.chordNotes;
        }
      } else if (r < 0.14 * depth + 0.4 * depth) {
        const move = [-5, -3, -2, 2, 3, 5, 7, 12, -12][Math.floor(rnd() * 9)];
        const moved = clampNote(snap(cur.note + move));
        const shift = moved - cur.note;
        cur.note = moved;
        if (cur.chordNotes) cur.chordNotes = cur.chordNotes.map((n) => clampNote(snap(n + shift)));
      }
      cur.velocity = Math.max(0.35, Math.min(1, cur.velocity + (rnd() - 0.5) * 0.24));
      // a short note may ring into the next free step
      if ((cur.length || 1) === 1 && !out[i + 1] && rnd() < 0.18) cur.length = 2;
    } else if (rnd() < 0.1 * depth) {
      // fill a gap from the nearest earlier note
      let j = i - 1;
      while (j >= 0 && !out[j]) j--;
      const src = j >= 0 ? out[j] : null;
      const held = src ? j + Math.max(1, src.length || 1) > i : false;
      if (src && !held) {
        const note = drums ? drums[Math.floor(rnd() * drums.length)] : clampNote(snap(src.note + [0, 2, 3, 7, -2][Math.floor(rnd() * 5)]));
        out[i] = { note, velocity: Math.max(0.4, src.velocity * 0.8), length: 1 };
      }
    }
  }
  return out;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Pattern mode's loop length in 16ths: the point where every playing pattern is back at its start
 * (their common multiple), so the transport and the timeline loop with the patterns instead of
 * counting bars forever. Null when there is no whole-16th cycle within `maxBars` (odd polymeters):
 * the transport then runs on as before.
 */
export function patternCycle16ths(patternTicks: readonly number[], ticksPer16th: number, stepsPerBar: number, maxBars = 64): number | null {
  const lens = patternTicks.filter((t) => t > 0);
  if (!lens.length) return null;
  let cycle = stepsPerBar * ticksPer16th; // whole bars, so the bar counter restarts cleanly
  for (const t of lens) {
    cycle = (cycle / gcd(cycle, t)) * t;
    if (cycle > maxBars * stepsPerBar * ticksPer16th) return null;
  }
  return cycle % ticksPer16th === 0 ? cycle / ticksPer16th : null;
}
