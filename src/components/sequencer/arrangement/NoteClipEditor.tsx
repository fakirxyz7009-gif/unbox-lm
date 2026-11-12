/**
 * Piano roll for one note clip (16th grid). Edits the clip's visible window — or its loop when
 * the clip loops — and keeps notes outside that window untouched.
 */
import React, { useCallback, useState } from 'react';
import { SNAP_AUTO } from '../adaptiveGrid.ts';
import { Repeat, X, Layers } from 'lucide-react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import type { ArrangementClip, SequencerTrack } from '../../../audio/types.ts';
import { beatSteps } from '../../../audio/sequencer/model.ts';
import { PianoRoll, type RollTool } from '../pianoRoll/PianoRoll.tsx';
import { clipNotesToRoll, rollToClipNotes, type RollNote } from '../pianoRoll/rollAdapters.ts';

interface Props {
  audioEngine: AudioEngine;
  track: SequencerTrack;
  clip: ArrangementClip;
  onClose: () => void;
  onAudition: (note: number, velocity: number) => void;
  /** Fill the parent's height (the Clip Editor) instead of the 300 px inline panel. */
  fill?: boolean;
}

const SNAPS: { label: string; v: number }[] = [
  { label: 'Auto', v: SNAP_AUTO },
  { label: '1/16', v: 1 },
  { label: '1/32', v: 0.5 },
  { label: '1/16 T', v: 2 / 3 },
  { label: '1/8', v: 2 },
  { label: '1/4', v: 4 },
  { label: 'Off', v: 0 },
];

export const NoteClipEditor: React.FC<Props> = ({ audioEngine, track, clip, onClose, onAudition, fill }) => {
  const [tool, setTool] = useState<RollTool>('draw');
  const [snap, setSnap] = useState(SNAP_AUTO);
  const [len, setLen] = useState(2);
  const [zx, setZx] = useState(18);
  const [zy, setZy] = useState(12);
  const spb = audioEngine.stepsPerBar;
  const loop16 = clip.loopBars && clip.loopBars > 0 ? clip.loopBars * spb : 0;
  const offset = loop16 ? 0 : clip.offsetSteps || 0;
  const window16 = loop16 || clip.lengthBars * spb;
  const all = clip.notes || [];
  const inWindow = (s: number) => s >= offset && s < offset + window16;
  const notes = clipNotesToRoll(all.filter((n) => inWindow(n.step)).map((n) => ({ ...n, step: n.step - offset })));

  const onChange = (next: RollNote[]) => {
    const outside = all.filter((n) => !inWindow(n.step));
    const edited = rollToClipNotes(next).map((n) => ({ ...n, step: n.step + offset }));
    const maxEnd16 = edited.reduce((m, n) => Math.max(m, n.step - offset + 1), 0);
    audioEngine.sequencer.setClipNotes(track.id, clip.id, [...outside, ...edited], false);
    // Drawing past the end grows the clip (or its loop) to whole bars.
    if (maxEnd16 > window16) {
      const bars = Math.ceil(maxEnd16 / spb);
      if (loop16) audioEngine.sequencer.setClipLoop(track.id, clip.id, bars, false);
      if (!loop16 || bars > clip.lengthBars) audioEngine.sequencer.resizeClip(track.id, clip.id, 'end', clip.startBar + Math.max(bars, clip.lengthBars), false);
    }
    audioEngine.commitEdit();
  };

  const getPlayhead = useCallback(() => {
    if (!audioEngine.isPlaying) return null;
    const pos = audioEngine.getPlayheadPosition();
    const start16 = clip.startBar * spb;
    const end16 = (clip.startBar + clip.lengthBars) * spb;
    if (pos < start16 || pos >= end16) return null;
    const local = pos - start16 + (clip.offsetSteps || 0);
    return loop16 ? local % loop16 : local - offset;
  }, [audioEngine, clip, spb, loop16, offset]);

  return (
    <div className={`flex flex-col border-t-2 border-[#796d5b] bg-[#100d0a] ${fill ? 'flex-1 min-h-0' : ''}`} style={fill ? undefined : { height: 320 }} data-testid="note-clip-editor">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 us-metal border-b border-[#796d5b] text-[11px] font-mono text-ink select-none shadow-sm">
        <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: clip.color || track.color }} />
        <strong className="text-ink font-bold tracking-wide">{clip.name || 'Note clip'}</strong>
        <span className="text-ink/75">
          {track.name} · bar {Math.floor(clip.startBar) + 1} · {+clip.lengthBars.toFixed(3)} bars · {all.length} notes
        </span>
        <label className="flex items-center gap-1 text-ink/80 font-label font-bold">
          SNAP
          <select value={snap} onChange={(e) => setSnap(Number(e.target.value))} className="bg-[#282016] text-[#ffc87a] rounded px-1.5 py-0.5 border border-[#d69b50]/60 outline-none">
            {SNAPS.map((s) => (
              <option key={s.label} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-ink/80 font-label font-bold">
          NOTE
          <select value={len} onChange={(e) => setLen(Number(e.target.value))} className="bg-[#282016] text-[#ffc87a] rounded px-1.5 py-0.5 border border-[#d69b50]/60 outline-none">
            {[0.5, 1, 2, 3, 4, 6, 8, 12, 16, 32].map((v) => (
              <option key={v} value={v}>
                {v} /16
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => audioEngine.sequencer.setClipLoop(track.id, clip.id, loop16 ? null : clip.lengthBars)}
          className={`px-2 py-0.5 rounded-[4px] font-label font-bold flex items-center gap-1 border transition-all ${
            loop16 ? 'bg-[#2a4531] text-[#b6f0c4] border-[#3e6848]' : 'us-btn-light text-[#302519] border-[#8a7b68]/40 hover:bg-[#eee8dc]'
          }`}
          title="Loop: the notes repeat every loop length across the whole clip"
        >
          <Repeat className="w-3 h-3" />
          {loop16 ? `LOOP ${+(clip.loopBars || 0).toFixed(3)} BAR` : 'LOOP OFF'}
        </button>
        <button
          onClick={() => {
            const p = audioEngine.sequencer.clipToPattern(track.id, clip.id);
            if (p) audioEngine.sequencer.selectPattern(track.id, p.id);
          }}
          className="px-2 py-0.5 rounded-[4px] font-label font-bold flex items-center gap-1 border us-btn-light text-[#302519] border-[#8a7b68]/40 hover:bg-[#ffc87a] hover:text-black"
          title="Copy these notes into a new pattern of the track"
        >
          <Layers className="w-3 h-3 text-[#d69b50]" /> TO PATTERN
        </button>
        <span className="text-ink/60 text-[11px]">Ctrl+wheel zoom · Alt+wheel rows</span>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-black/10 text-ink" aria-label="Close note clip editor">
          <X className="w-4 h-4" />
        </button>
      </div>
      <PianoRoll
        notes={notes}
        length={window16}
        unitsPerBar={spb}
        unitsPerBeat={beatSteps(audioEngine.timeSignature)}
        snap={snap}
        tool={tool}
        onToolChange={setTool}
        defaultLength={len}
        color={clip.color || track.color}
        zoomX={zx}
        zoomY={zy}
        onZoomChange={(x, y) => {
          setZx(x);
          setZy(y);
        }}
        onChange={onChange}
        onLengthChange={(u) => {
          const bars = Math.max(1 / spb, u / spb);
          if (loop16) audioEngine.sequencer.setClipLoop(track.id, clip.id, bars);
          else audioEngine.sequencer.resizeClip(track.id, clip.id, 'end', clip.startBar + bars);
        }}
        onAudition={onAudition}
        onSeek={(u) => audioEngine.seekToSongPosition(Math.round(clip.startBar * spb + u - (clip.offsetSteps || 0) + offset))}
        getPlayhead={getPlayhead}
        growable
        className="flex-1"
      />
    </div>
  );
};
