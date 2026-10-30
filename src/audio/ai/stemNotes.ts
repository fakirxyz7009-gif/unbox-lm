/**
 * Notes from a separated stem, added to the song as a new track. Drums become a kit track (kick, snare,
 * closed hat). A bass or vocal line uses the line analysis, and any other stem (keys, guitar, the "other"
 * stem) the polyphonic one, so notes that sound together come out as chords. The analysis runs in a worker
 * (transcribeInBackground.ts). The notes keep the timing of the audio, so they are placed by seconds, not
 * snapped to a tempo.
 */
import type { AudioEngine } from '../AudioEngine.ts';
import type { BaseDevice } from '../BaseDevice.ts';
import type { ClipNote, DeviceType } from '../types.ts';
import { newSeqId } from '../sequencer/model.ts';
import { secondsToSteps, type TimedNote } from '../../../shared/transcription/transcribe.ts';
import { recordedStemTarget, type RecordedStemTarget } from '../../../shared/transcription/stemTargets.ts';
import { selectPart } from '../../shell/selectPart.ts';
import { transcribeInBackground } from './transcribeInBackground.ts';

/** The analysis a stem gets. */
type StemAnalysis = 'drums' | 'line' | 'chords';

function analysisFor(stem: string): StemAnalysis {
  if (stem === 'drums' || stem === 'kick' || stem === 'snare' || stem === 'hat') return 'drums';
  if (stem === 'bass' || stem === 'vocals') return 'line';
  return 'chords';
}

/** The buffer's channels averaged to one, the form the analysis reads. */
export function monoSamples(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}

export interface StemNotesResult {
  trackName: string;
  /** Explicitly names the recorded instrument used to audition the estimated notes. */
  instrumentName: string;
  noteCount: number;
  /** Estimated tempo of the drums (null for a melodic stem or when no onset was found). */
  tempo: number | null;
}

/** The name, or the name with " (2)", " (3)"… when the song already has a track of that name. */
export function uniqueTrackName(engine: AudioEngine, name: string): string {
  const used = new Set(engine.tracks.map((t) => t.name));
  if (!used.has(name)) return name;
  const base = name.slice(0, 34);
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Seconds of a transcribed note as a piano-roll note at the song's tempo. */
export function toClipNote(bpm: number, n: TimedNote): ClipNote {
  return {
    step: secondsToSteps(n.start, bpm),
    note: n.note,
    velocity: n.velocity,
    length: Math.max(0.25, secondsToSteps(n.end - n.start, bpm)),
  };
}

/**
 * Adds a track with an instrument and one note clip at the start of the song, and selects the new part so
 * the piano roll and the keyboards follow it. `prepare` configures the new device before the clip is placed.
 * Returns the instrument's device id.
 */
export function addNotesTrack(
  engine: AudioEngine,
  deviceType: DeviceType,
  trackName: string,
  notes: ClipNote[],
  prepare?: (device: BaseDevice) => void,
): string {
  const dev = engine.createDevice(deviceType, trackName);
  prepare?.(dev);
  const track = engine.tracks.find((t) => t.deviceId === dev.id);
  if (track) {
    const last = Math.max(...notes.map((n) => n.step + n.length));
    track.arrangementClips = [
      {
        id: newSeqId('clip'),
        kind: 'notes',
        startBar: 0,
        lengthBars: Math.max(1, Math.ceil(last / engine.stepsPerBar)),
        notes,
        name: trackName,
        color: track.color,
      },
    ];
    // The new part becomes the selected one, so the piano roll and keyboards follow it.
    selectPart(dev.id);
  }
  engine.setPlaybackMode('song_arrangement');
  engine.commitEdit();
  return dev.id;
}

/** The recorded instrument for a stem without a fixed one: the guitar for a guitar stem, the piano otherwise. */
function defaultTarget(stem: string): RecordedStemTarget {
  if (stem === 'guitars' || stem === 'guitar') return { deviceType: 'rec_shinyguitar', instrumentName: 'Shinyguitar (recorded guitar)' };
  return { deviceType: 'rec_meta_piano', instrumentName: 'Meta Piano (transcribed notes)' };
}

/** Transcribes one stem and adds the notes as a new instrument track with a note clip. */
export async function addStemNotes(engine: AudioEngine, stem: string, buffer: AudioBuffer, name: string): Promise<StemNotesResult> {
  const analysis = analysisFor(stem);
  const target = recordedStemTarget(analysis === 'drums' ? 'drums' : stem) ?? defaultTarget(stem);
  const samples = monoSamples(buffer);
  const bpm = engine.bpm;
  let notes: ClipNote[];
  let tempo: number | null = null;
  if (analysis === 'drums') {
    const drums = await transcribeInBackground('drums', samples, buffer.sampleRate);
    tempo = drums.tempo;
    notes = drums.hits.map((h) => ({
      step: secondsToSteps(h.time, bpm),
      note: target.drumNotes?.[h.cls] ?? 36,
      velocity: h.velocity,
      length: 1,
    }));
  } else {
    const timed = await transcribeInBackground(analysis, samples, buffer.sampleRate);
    notes = timed.map((n) => toClipNote(bpm, n));
  }
  const trackName = uniqueTrackName(engine, name.slice(0, 40));
  if (notes.length === 0) return { trackName, instrumentName: target.instrumentName, noteCount: 0, tempo };
  addNotesTrack(engine, target.deviceType, trackName, notes);
  return { trackName, instrumentName: target.instrumentName, noteCount: notes.length, tempo };
}
