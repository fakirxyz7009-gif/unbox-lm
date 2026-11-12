/**
 * A new part written from another part's pattern ("generate from another instrument"). Pure.
 *
 *  - bass:    the lowest note of every hit, down in the bass register (a kit: the root on its kicks)
 *  - harmony: the top voice a third higher, fitted to the scale, in the same rhythm
 *  - arp:     chords and long notes broken into single steps, up then down
 *  - rhythm:  only the hits. On a drum kit: kick on the strong hits, snare on the backbeat, hat in
 *             between; on a pitched instrument: the root on every hit.
 */
import type { SequencerNote } from '../types.ts';

export type DeriveKind = 'bass' | 'harmony' | 'arp' | 'rhythm';

export const DERIVE_KINDS: readonly { id: DeriveKind; label: string; help: string }[] = [
  { id: 'bass', label: 'Bass line', help: 'Its lowest notes, down in the bass register' },
  { id: 'harmony', label: 'Harmony', help: 'Its top voice a third higher, same rhythm' },
  { id: 'arp', label: 'Arpeggio', help: 'Its chords and long notes broken into single steps' },
  { id: 'rhythm', label: 'Rhythm', help: 'Its hits as a groove (a drum kit plays kick, snare and hat)' },
];

export interface KitRoles {
  kick: number;
  snare: number;
  hat: number;
}

export interface DeriveContext {
  /** Fits a pitch to the song's scale. */
  fit?: (midi: number) => number;
  /** Song root as a pitch class (0 = C). */
  root?: number;
  /** Steps of the source pattern per beat and per bar (its own step division). */
  stepsPerBeat?: number;
  stepsPerBar?: number;
  /** The source is a drum kit (its notes are pads, not pitches). */
  fromKit?: KitRoles | null;
  /** The destination is a drum kit. */
  toKit?: KitRoles | null;
}

type Steps = readonly (SequencerNote | null | undefined)[];

const voices = (s: SequencerNote): number[] => [s.note, ...(s.chordNotes ?? [])];
const clampNote = (m: number) => Math.max(0, Math.min(127, Math.round(m)));

/** Into the bass register (C2..B2) by whole octaves, so the line keeps its notes. */
function toBass(m: number): number {
  let n = m;
  while (n > 47) n -= 12;
  while (n < 36) n += 12;
  return n;
}

function deriveBass(src: Steps, ctx: DeriveContext): (SequencerNote | null)[] {
  const out: (SequencerNote | null)[] = src.map(() => null);
  const fit = ctx.fit ?? ((m: number) => m);
  const root = 36 + ((((ctx.root ?? 0) % 12) + 12) % 12);
  const kit = ctx.fromKit ?? null;
  // a kit gives no pitches: the bass locks to its kick (to every hit when it has none)
  const kicks = kit ? src.some((s) => !!s && voices(s).includes(kit.kick)) : false;
  const hits: number[] = [];
  src.forEach((s, i) => {
    if (!s) return;
    if (kit && kicks && !voices(s).includes(kit.kick)) return;
    // at most one bass note per two steps: fast runs become their main notes
    if (hits.length && i - hits[hits.length - 1] < 2) return;
    hits.push(i);
  });
  hits.forEach((i, k) => {
    const s = src[i]!;
    const gap = (hits[k + 1] ?? src.length) - i;
    const note = kit ? root : toBass(fit(Math.min(...voices(s))));
    const length = Math.max(1, Math.min(kit ? 2 : s.length || 1, gap));
    const velocity = Math.max(0.6, Math.min(1, s.velocity));
    if (length >= 8) {
      // a long held root is struck again halfway, so the bass keeps moving
      const half = Math.floor(length / 2);
      out[i] = { note, velocity, length: half };
      out[i + half] = { note, velocity: velocity * 0.85, length: length - half };
    } else {
      out[i] = { note, velocity, length };
    }
  });
  return out;
}

function deriveHarmony(src: Steps, ctx: DeriveContext): (SequencerNote | null)[] {
  const fit = ctx.fit ?? ((m: number) => m);
  return src.map((s) => {
    if (!s) return null;
    const top = Math.max(...voices(s));
    // a third above that is in the scale: minor if it fits, else major
    const third = [top + 3, top + 4].find((m) => fit(m) === m) ?? fit(top + 4);
    const n: SequencerNote = { ...s, note: clampNote(third), velocity: Math.max(0.3, s.velocity * 0.85) };
    delete n.chordNotes;
    delete n.chordLengths;
    delete n.chordVelocities;
    return n;
  });
}

function deriveArp(src: Steps, ctx: DeriveContext): (SequencerNote | null)[] {
  const out: (SequencerNote | null)[] = src.map(() => null);
  const fit = ctx.fit ?? ((m: number) => m);
  src.forEach((s, i) => {
    if (!s) return;
    let tones = [...new Set(voices(s))].sort((a, b) => a - b);
    // a single note becomes root, fifth, octave
    if (tones.length === 1) tones = [...new Set([tones[0], clampNote(fit(tones[0] + 7)), clampNote(tones[0] + 12)])];
    const order = tones.map((_, k) => k).concat(tones.length > 2 ? tones.map((_, k) => k).slice(1, -1).reverse() : []);
    const span = Math.max(1, s.length || 1);
    for (let k = 0; k < span; k++) {
      const pos = i + k;
      if (pos >= src.length || (k > 0 && src[pos])) break; // the next hit takes over
      out[pos] = { note: tones[order[k % order.length]], velocity: Math.max(0.3, s.velocity * (k % 4 === 0 ? 1 : 0.8)), length: 1 };
    }
  });
  return out;
}

function deriveRhythm(src: Steps, ctx: DeriveContext): (SequencerNote | null)[] {
  const kit = ctx.toKit ?? null;
  if (!kit) {
    const fit = ctx.fit ?? ((m: number) => m);
    const note = clampNote(fit(48 + ((((ctx.root ?? 0) % 12) + 12) % 12)));
    return src.map((s) => (s ? { note, velocity: s.velocity, length: Math.max(1, Math.min(2, s.length || 1)) } : null));
  }
  const beat = ctx.stepsPerBeat && Number.isInteger(ctx.stepsPerBeat) ? ctx.stepsPerBeat : 4;
  const bar = ctx.stepsPerBar && Number.isInteger(ctx.stepsPerBar) ? ctx.stepsPerBar : beat * 4;
  const fromKit = ctx.fromKit ?? null;
  return src.map((s, i) => {
    const inBar = i % bar;
    const onBeat = inBar % beat === 0;
    const hit = !!s;
    const strong = hit && (fromKit ? voices(s!).includes(fromKit.kick) : onBeat || s!.velocity >= 0.95);
    const parts: number[] = [];
    if (strong) parts.push(kit.kick);
    if (inBar % (beat * 2) === beat) parts.push(kit.snare); // beats 2 and 4
    if (hit && !strong) parts.push(kit.hat);
    else if (!hit && beat % 2 === 0 && inBar % beat === beat / 2) parts.push(kit.hat); // the off-beat 8th keeps time
    const notes = [...new Set(parts)];
    if (!notes.length) return null;
    const n: SequencerNote = { note: notes[0], velocity: strong || notes[0] === kit.snare ? 1 : 0.75, length: 1 };
    if (notes.length > 1) n.chordNotes = notes.slice(1);
    return n;
  });
}

/** The steps of a new part made from `src` (same number of steps). */
export function deriveSteps(src: Steps, kind: DeriveKind, ctx: DeriveContext = {}): (SequencerNote | null)[] {
  if (kind === 'rhythm' || ctx.toKit) return deriveRhythm(src, ctx);
  if (kind === 'bass') return deriveBass(src, ctx);
  // pads carry no pitches to harmonise or break up: a kit gives its rhythm
  if (ctx.fromKit) return deriveRhythm(src, ctx);
  return kind === 'harmony' ? deriveHarmony(src, ctx) : deriveArp(src, ctx);
}
