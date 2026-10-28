/**
 * Piano roll bound to the ACTIVE pattern of a track. Drawing past the end grows the pattern
 * (whole bars); the orange end marker sets the length directly.
 */
import React, { useCallback, useMemo } from 'react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import type { SequencerNote, SequencerTrack } from '../../../audio/types.ts';
import { TICKS_PER_16TH, beatSteps, divisionTicks, syncTrackPatterns } from '../../../audio/sequencer/model.ts';
import { PianoRoll, midiName, type GhostNote, type RollTool } from './PianoRoll.tsx';
import { patternToRoll, rollToPattern, type RollNote } from './rollAdapters.ts';

const DRUM_LANES = ['Kick', 'Snare', 'Cl Hat', 'Op Hat', 'Clap', 'Lo Tom', 'Hi Tom', 'Crash'];

interface Props {
  audioEngine: AudioEngine;
  track: SequencerTrack;
  tracks: SequencerTrack[];
  tool: RollTool;
  onToolChange?: (tool: RollTool) => void;
  /** Snap in pattern steps (0 = free). */
  snap: number;
  defaultLength: number;
  chordOffsets: number[];
  showScale: boolean;
  showGhosts: boolean;
  zoomX: number;
  zoomY: number;
  onZoomChange: (x: number, y: number) => void;
  onAudition: (note: number, velocity: number) => void;
  isDrumKit: boolean;
  /** Pad names by note (drum machines / grooveboxes). */
  padNames?: Map<number, string>;
  /** Step settings for new notes (ratchet, chance …). */
  newNoteMeta?: Partial<SequencerNote>;
}

export const PatternPianoRoll: React.FC<Props> = ({
  audioEngine,
  track,
  tracks,
  tool,
  onToolChange,
  snap,
  defaultLength,
  chordOffsets,
  showScale,
  showGhosts,
  zoomX,
  zoomY,
  onZoomChange,
  onAudition,
  isDrumKit,
  newNoteMeta,
  padNames,
}) => {
  const pattern = syncTrackPatterns(track, audioEngine.activePatternIndex);
  const T = divisionTicks(pattern.division);
  const spb = audioEngine.stepsPerBar;
  const unitsPerBar = Math.max(1, Math.round((spb * TICKS_PER_16TH) / T));
  const unitsPerBeat = Math.max(1, Math.round((beatSteps(audioEngine.timeSignature) * TICKS_PER_16TH) / T));
  const notes = patternToRoll(track.steps);

  const ghosts = useMemo<GhostNote[] | undefined>(() => {
    if (!showGhosts) return undefined;
    const out: GhostNote[] = [];
    for (const t of tracks) {
      if (t.id === track.id) continue;
      const p = syncTrackPatterns(t, audioEngine.activePatternIndex);
      const f = divisionTicks(p.division) / T;
      for (const n of patternToRoll(p.steps)) {
        out.push({ step: n.step * f, note: n.note, length: n.length * f, color: t.color || '#94a3b8' });
        if (out.length > 4000) return out;
      }
    }
    return out;
    // tracks mutate in place; the parent re-renders on every engine notify
  }, [showGhosts, tracks, track.id, T, audioEngine]);

  const scalePcs = useMemo(() => {
    if (!showScale || audioEngine.scaleType === 'chromatic') return null;
    return audioEngine.getScaleIntervals().map((i) => (i + audioEngine.rootKey) % 12);
  }, [showScale, audioEngine.scaleType, audioEngine.rootKey, audioEngine]);

  const onChange = (next: RollNote[]) => {
    const p = syncTrackPatterns(track, audioEngine.activePatternIndex);
    const maxStart = next.reduce((m, n) => Math.max(m, n.step), -1);
    if (maxStart >= p.length) {
      const grown = Math.ceil((maxStart + 1) / unitsPerBar) * unitsPerBar;
      audioEngine.sequencer.setPatternLength(track.id, p.id, grown, false);
    }
    const steps = rollToPattern(next, p.length);
    for (let i = 0; i < p.length; i++) track.steps[i] = steps[i];
    audioEngine.commitEdit();
  };

  const getPlayhead = useCallback(() => {
    if (!audioEngine.isPlaying) return null;
    const ph = audioEngine.playheadFor(track);
    if (!ph || ph.patternId !== track.activePatternId) return null;
    // fractional position inside the step for a smooth line
    const pos = audioEngine.getPlayheadPosition();
    const frac = (pos * TICKS_PER_16TH) / T;
    return ph.step + (frac - Math.floor(frac));
  }, [audioEngine, track, T]);

  return (
    <PianoRoll
      notes={notes}
      length={pattern.length}
      unitsPerBar={unitsPerBar}
      unitsPerBeat={unitsPerBeat}
      snap={snap}
      tool={tool}
      onToolChange={onToolChange}
      defaultLength={defaultLength}
      chordOffsets={chordOffsets}
      newNoteMeta={newNoteMeta}
      scalePcs={scalePcs}
      rootPc={audioEngine.rootKey}
      ghostNotes={ghosts}
      color={pattern.color || track.color}
      zoomX={zoomX}
      zoomY={zoomY}
      onZoomChange={onZoomChange}
      onChange={onChange}
      onLengthChange={(len) => audioEngine.sequencer.setPatternLength(track.id, pattern.id, len)}
      onAudition={onAudition}
      onSeek={(u) => {
        // place the song position on this step inside the current bar range of the pattern
        const step16 = (u * T) / TICKS_PER_16TH;
        const passLen16 = (pattern.length * T) / TICKS_PER_16TH;
        const pos = audioEngine.songPosition;
        const passStart = Math.floor(pos / passLen16) * passLen16;
        audioEngine.seekToSongPosition(Math.round(passStart + step16));
      }}
      getPlayhead={getPlayhead}
      growable
      muteWholeStep
      noteLabel={
        padNames?.size
          ? (m) => padNames.get(m) ?? (m % 12 === 0 ? midiName(m) : null)
          : isDrumKit
            ? (m) => (m >= 60 && m < 68 ? DRUM_LANES[m - 60] : m % 12 === 0 ? midiName(m) : null)
            : undefined
      }
      centerNote={padNames?.size ? Math.round([...padNames.keys()].reduce((a, b) => a + b, 0) / padNames.size) : isDrumKit ? 64 : 60}
      className="flex-1"
    />
  );
};
