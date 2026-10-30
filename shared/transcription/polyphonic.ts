/**
 * Several notes at once from a pitched source (keys, guitar, a mix without drums). No trained model.
 * In each frame every candidate pitch is scored by its harmonic salience: the peaks at its partials,
 * weighted by partial number, scaled down when its own fundamental is weaker than the partials above
 * it (a sub-octave impostor fails that test). The best pitch is taken and its partials are removed
 * from the spectrum, then the search repeats for the next voice, so a neighbour that shares those
 * partials cannot take the same energy twice. The voices of consecutive frames are joined into notes, and a
 * held note is split again at a broadband attack where its own level rises, so a repeated key is several notes.
 * Pure math; no DOM or Node APIs, so it runs in the browser and in tests.
 */
import { fft } from './fft.ts';
import type { TimedNote } from './transcribe.ts';

export interface PolyphonicOptions {
  /** Lowest and highest MIDI pitch the search considers. */
  minMidi?: number;
  maxMidi?: number;
  /** Most notes read per frame. One turns the search into a monophonic tracker. */
  maxVoices?: number;
}

/** A pitch found in one frame. Strength is its salience: 1 is a full-scale sine. */
interface PolyVoice {
  note: number;
  strength: number;
}

interface PolyFrame {
  /** Seconds from the start of the input, at the frame's centre. */
  time: number;
  voices: PolyVoice[];
}

/** 93 ms at 44.1 kHz. A longer window resolves the bass better but smears onsets across notes (measured). */
const WINDOW = 4096;
/** 11.6 ms at 44.1 kHz. */
const HOP = 512;
const MAX_PARTIAL_HZ = 5000;
const PARTIAL_DECAY = 0.85;
/** Expected level of each partial relative to the one below it, removed when a note is taken. */
const PARTIAL_LEVEL = 0.6;
/** Lowest salience that counts as a sounding note. */
const VOICE_MIN = 0.02;
/** A later voice in a frame must reach this share of the frame's first voice. */
const VOICE_RELATIVE = 0.2;
/** Notes shorter than ten frames (about 116 ms) are dropped; gaps of up to two frames are bridged. */
const MIN_NOTE_FRAMES = 10;
const MAX_GAP_FRAMES = 2;
/** A strike is a level at least 3.5 dB above the highest level of the four frames before it. */
const RISE = 1.5;
const RISE_LOOKBACK = 4;
/** A note ends when its level falls to half its peak (6 dB down). */
const RELEASE = 0.5;
/** A pitch that sounded within 0.3 s can only start again with a strike, not with a tail. */
const RESTART_FRAMES = 25;
/**
 * An attack is a frame whose broadband rise (flux of the log spectrum) is at least ATTACK_SHARE of the
 * clip's 90th-percentile flux and ATTACK_RATIO times the median of its neighbours. A pitch whose level rises
 * ATTACK_RISE within ATTACK_AHEAD frames of an attack is struck again; a chord partner starting beside it does
 * not raise this pitch, so it does not split the note.
 */
const ATTACK_SHARE = 0.2;
const ATTACK_RATIO = 3;
const ATTACK_SPAN = 10;
const ATTACK_RISE = 1.1;
const ATTACK_AHEAD = 6;
/** Magnitudes are compressed as log(1 + COMPRESS × magnitude) before the flux is summed. */
const COMPRESS = 100;
const MIN_MIDI = 36;
const MAX_MIDI = 96;
const MAX_VOICES = 8;

interface Candidate {
  midi: number;
  /** FFT bin of each partial, fundamental first, up to MAX_PARTIAL_HZ. */
  bins: number[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function partialBins(midi: number, binHz: number, maxBin: number): number[] {
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const bins: number[] = [];
  for (let h = 1; h * f0 <= MAX_PARTIAL_HZ; h++) {
    const bin = Math.round((h * f0) / binHz);
    if (bin > maxBin) break;
    bins.push(bin);
  }
  return bins;
}

/** The largest peak within a bin of a partial: the window's main lobe spans about three bins. */
function peakNear(peaks: Float32Array, bin: number, maxBin: number): number {
  let best = 0;
  for (let k = Math.max(0, bin - 1); k <= Math.min(maxBin, bin + 1); k++) if (peaks[k] > best) best = peaks[k];
  return best;
}

function salience(bins: number[], peaks: Float32Array, maxBin: number): number {
  let total = 0;
  let weight = 1;
  let fundamental = 0;
  let above = 0;
  for (let h = 0; h < bins.length; h++) {
    const a = peakNear(peaks, bins[h], maxBin);
    if (h === 0) fundamental = a;
    else if (a > above) above = a;
    total += weight * a;
    weight *= PARTIAL_DECAY;
  }
  // The fundamental must carry about half the energy of the strongest partial above it, or the
  // candidate is the sub-octave of a note whose partials it borrows.
  return total * Math.min(1, fundamental / (0.5 * above || 1e-9));
}

/** Greedy harmonic subtraction: take the strongest pitch, remove its partials, repeat. */
function pickVoices(peaks: Float32Array, work: Float32Array, candidates: Candidate[], maxBin: number, maxVoices: number): PolyVoice[] {
  work.set(peaks);
  const voices: PolyVoice[] = [];
  let first = 0;
  for (let v = 0; v < maxVoices; v++) {
    let best: Candidate | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const s = salience(c.bins, work, maxBin);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (!best) break;
    if (v === 0) first = bestScore;
    if (bestScore < VOICE_MIN || bestScore < VOICE_RELATIVE * first) break;
    voices.push({ note: best.midi, strength: bestScore });
    // Remove what the note explains: each partial loses its expected level, not the whole peak, so a partial
    // shared with a note still to come (a fifth shares the octave's partials) keeps the energy of that note.
    let level = peakNear(work, best.bins[0], maxBin);
    for (const bin of best.bins) {
      let at = Math.max(0, bin - 1);
      for (let k = at + 1; k <= Math.min(maxBin, bin + 1); k++) if (work[k] > work[at]) at = k;
      work[at] = Math.max(0, work[at] - level);
      level *= PARTIAL_LEVEL;
    }
  }
  return voices;
}

/** Voices of every frame. The input is scaled so its loudest sample is full scale. */
function analysePolyphonic(
  samples: Float32Array,
  sampleRate: number,
  options: PolyphonicOptions = {},
): { frames: PolyFrame[]; attacks: Uint8Array } {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (!(peak > 0)) return { frames: [], attacks: new Uint8Array(0) };
  const minMidi = options.minMidi ?? MIN_MIDI;
  const maxMidi = options.maxMidi ?? MAX_MIDI;
  const maxVoices = options.maxVoices ?? MAX_VOICES;
  const binHz = sampleRate / WINDOW;
  const maxBin = Math.floor(MAX_PARTIAL_HZ / binHz) + 1;
  const candidates: Candidate[] = [];
  for (let midi = minMidi; midi <= maxMidi; midi++) candidates.push({ midi, bins: partialBins(midi, binHz, maxBin) });
  const hann = new Float64Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1));
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  const amp = new Float64Array(maxBin + 2);
  const peaks = new Float32Array(maxBin + 1);
  const work = new Float32Array(maxBin + 1);
  const frameCount = Math.ceil(samples.length / HOP) + 1;
  const frames: PolyFrame[] = [];
  const flux = new Float32Array(frameCount);
  const logPrev = new Float64Array(maxBin + 1);
  for (let f = 0; f < frameCount; f++) {
    // Centred frames: frame f is centred on sample f * HOP.
    const start = f * HOP - WINDOW / 2;
    for (let i = 0; i < WINDOW; i++) {
      const j = start + i;
      re[i] = j >= 0 && j < samples.length ? (samples[j] / peak) * hann[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    // Hann window: a full-scale sine reads 1 at its peak bin.
    for (let k = 0; k < amp.length; k++) amp[k] = (4 * Math.hypot(re[k], im[k])) / WINDOW;
    // Broadband rise of the log spectrum since the last frame: large at an attack, small in a held sound.
    let rise = 0;
    for (let k = 1; k <= maxBin; k++) {
      const logAmp = Math.log1p(COMPRESS * amp[k]);
      if (f > 0 && logAmp > logPrev[k]) rise += logAmp - logPrev[k];
      logPrev[k] = logAmp;
    }
    flux[f] = rise;
    peaks[0] = 0;
    for (let k = 1; k <= maxBin; k++) peaks[k] = amp[k] > amp[k - 1] && amp[k] >= amp[k + 1] ? amp[k] : 0;
    frames.push({ time: (f * HOP) / sampleRate, voices: pickVoices(peaks, work, candidates, maxBin, maxVoices) });
  }
  return { frames, attacks: attackFrames(flux) };
}

/** Frames that are attacks: a flux peak that is loud for the clip and well above its neighbours. */
function attackFrames(flux: Float32Array): Uint8Array {
  const flags = new Uint8Array(flux.length);
  const sorted = Float32Array.from(flux).sort();
  const loud = sorted[Math.floor(0.9 * (sorted.length - 1))] ?? 0;
  for (let f = 1; f < flux.length - 1; f++) {
    const v = flux[f];
    if (!(v > 0) || v < ATTACK_SHARE * loud || v < flux[f - 1] || v <= flux[f + 1]) continue;
    const around = flux.slice(Math.max(0, f - ATTACK_SPAN), Math.min(flux.length, f + ATTACK_SPAN + 1)).sort();
    if (v >= ATTACK_RATIO * (around[around.length >> 1] ?? 0)) flags[f] = 1;
  }
  return flags;
}

/** Fills gaps of up to MAX_GAP_FRAMES silent frames between two sounding frames of one pitch. */
function bridgeGaps(track: Float32Array): void {
  let last = -1;
  for (let f = 0; f < track.length; f++) {
    if (!(track[f] > 0)) continue;
    const gap = f - last - 1;
    if (last >= 0 && gap > 0 && gap <= MAX_GAP_FRAMES) {
      const level = Math.min(track[last], track[f]);
      for (let g = last + 1; g < f; g++) track[g] = level;
    }
    last = f;
  }
}

/**
 * Splits one run of sounding frames (one pitch) into notes. A note starts at a strike: the first frame of
 * the run when the pitch was silent for a while, a jump in level inside the run, or an attack after which the
 * level rises ATTACK_RISE (a key struck again while it still rings). It ends when the level has fallen to
 * RELEASE of its peak. A slow decay starts nothing, so a ringing tail is not read as a note.
 */
function segmentRun(
  s: Float32Array,
  from: number,
  to: number,
  fresh: boolean,
  attacks: Uint8Array,
): { first: number; last: number; peak: number }[] {
  const segments: { first: number; last: number; peak: number }[] = [];
  let open = -1;
  let peak = 0;
  for (let g = from; g <= to; g++) {
    const v = s[g];
    let strike = fresh;
    if (g > from) {
      let before = 0;
      let low = Infinity;
      for (let k = Math.max(from, g - RISE_LOOKBACK); k < g; k++) {
        before = Math.max(before, s[k]);
        low = Math.min(low, s[k]);
      }
      // The level follows a strike a few frames late (the strike's partials are still building), so the rise is looked for ahead.
      let ahead = v;
      for (let k = g + 1; k <= Math.min(to, g + ATTACK_AHEAD); k++) ahead = Math.max(ahead, s[k]);
      strike = v >= RISE * before || (attacks[g] === 1 && ahead >= ATTACK_RISE * low);
    }
    if (open >= 0 && (strike || v < RELEASE * peak)) {
      segments.push({ first: open, last: g - 1, peak });
      open = -1;
    }
    if (open < 0 && strike) {
      open = g;
      peak = v;
    } else if (open >= 0) {
      peak = Math.max(peak, v);
    }
  }
  if (open >= 0) segments.push({ first: open, last: to, peak });
  return segments;
}

/** Joins the voices of consecutive frames into notes, one pitch at a time. */
function notesFromFrames(frames: PolyFrame[], sampleRate: number, attacks: Uint8Array): TimedNote[] {
  const hopSeconds = HOP / sampleRate;
  // The window spans a quarter of its length before the frame centre where a sound's energy starts to
  // register, so a note is placed that much earlier than its first sounding frame.
  const lead = WINDOW / (4 * sampleRate);
  const tracks = new Map<number, Float32Array>();
  let reference = 0;
  frames.forEach((frame, f) => {
    for (const v of frame.voices) {
      let track = tracks.get(v.note);
      if (!track) {
        track = new Float32Array(frames.length);
        tracks.set(v.note, track);
      }
      track[f] = v.strength;
      if (v.strength > reference) reference = v.strength;
    }
  });
  const notes: TimedNote[] = [];
  for (const [note, track] of tracks) {
    bridgeGaps(track);
    let last = -Infinity;
    let f = 0;
    while (f < track.length) {
      if (!(track[f] > 0)) {
        f++;
        continue;
      }
      const from = f;
      while (f < track.length && track[f] > 0) f++;
      for (const seg of segmentRun(track, from, f - 1, from - last > RESTART_FRAMES, attacks)) {
        if (seg.last - seg.first + 1 < MIN_NOTE_FRAMES) continue;
        notes.push({
          note,
          start: Math.max(0, frames[seg.first].time - lead),
          end: frames[seg.last].time + hopSeconds,
          velocity: clamp(0.35 + (0.65 * seg.peak) / (reference || 1), 0.3, 1),
        });
      }
      last = f - 1;
    }
  }
  return notes.sort((a, b) => a.start - b.start || a.note - b.note);
}

/** Notes of a pitched source where several notes can sound at once. */
export function transcribePolyphonic(samples: Float32Array, sampleRate: number, options?: PolyphonicOptions): TimedNote[] {
  const { frames, attacks } = analysePolyphonic(samples, sampleRate, options);
  return notesFromFrames(frames, sampleRate, attacks);
}
