import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import type { SequencerNote, SequencerTrack } from '../audio/types';
import { useFrame } from './useEngine';
import { PatternManager } from '../components/sequencer/PatternManager.tsx';
import { syncTrackPatterns } from '../audio/sequencer/model.ts';
import type { DrumLane } from '../audio/drumLanes.ts';

const PAGE = 64;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const notesOf = (s: SequencerNote | null | undefined): number[] =>
  s ? [s.note, ...(s.chordNotes || [])] : [];

/** Velocity of one note of a step (main note or chord / extra drum hit). */
const velOf = (s: SequencerNote | null | undefined, note: number): number => {
  if (!s) return 0.85;
  if (s.note === note) return s.velocity;
  const i = s.chordNotes?.indexOf(note) ?? -1;
  return i >= 0 ? s.chordVelocities?.[i] ?? s.velocity : s.velocity;
};

/** Step holding `notes`, each with its own velocity (drum hits can be accented separately). */
function withNotes(s: SequencerNote | null | undefined, notes: { note: number; vel: number }[]): SequencerNote | null {
  if (notes.length === 0) return null;
  const rest = notes.slice(1);
  return {
    ...(s || { length: 1 }),
    note: notes[0].note,
    velocity: notes[0].vel,
    chordNotes: rest.length ? rest.map((n) => n.note) : undefined,
    chordVelocities: rest.length ? rest.map((n) => n.vel) : undefined,
    chordLengths: undefined,
    length: s?.length || 1,
  } as SequencerNote;
}

interface Props {
  track: SequencerTrack | undefined;
  tracks: SequencerTrack[];
  /** Drum kit rows (see drumLanesFor); null = melodic rows. */
  lanes: DrumLane[] | null;
  onSelectTrack: (deviceId: string) => void;
  force: () => void;
  /** Row height in px (13 compact, larger in the Drum Editor). */
  rowHeight?: number;
}

export default function StepEditor({ track, tracks, lanes: drumLanes, onSelectTrack, force, rowHeight = 13 }: Props) {
  const isDrum = !!drumLanes;
  const [oct, setOct] = useState(3);
  const [page, setPage] = useState(0);
  const painting = useRef<null | 'draw' | 'erase'>(null);
  const headRef = useRef<HTMLDivElement>(null);
  // Edits the track's active pattern (any length; long patterns are shown 64 steps per page).
  const pattern = track ? syncTrackPatterns(track, audioEngine.activePatternIndex) : null;
  const len = pattern?.length ?? 16;
  const pages = Math.max(1, Math.ceil(len / PAGE));
  const curPage = Math.min(page, pages - 1);
  const first = curPage * PAGE;
  const shownLen = Math.min(PAGE, len - first);

  useEffect(() => {
    const up = () => (painting.current = null);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  useFrame(() => {
    if (!headRef.current) return;
    const ph = track ? audioEngine.playheadFor(track) : null;
    const cur = ph && ph.patternId === track?.activePatternId ? ph.step - first : -1;
    headRef.current.style.left = `${(cur / shownLen) * 100}%`;
    headRef.current.style.width = `${100 / shownLen}%`;
    headRef.current.style.display = cur >= 0 && cur < shownLen ? 'block' : 'none';
  });

  const base = 12 * (oct + 1);
  const lanes = drumLanes ?? Array.from({ length: 12 }, (_, i) => ({ name: NOTE_NAMES[11 - i] + (11 - i === 0 ? oct : ''), note: base + 11 - i }));

  const isOn = (step: number, note: number) => notesOf(track?.steps[step]).includes(note);

  const apply = (step: number, note: number, mode: 'draw' | 'erase', mod: { shift: boolean; alt: boolean }) => {
    if (!track || step >= len) return;
    const cur = track.steps[step];
    const vel = mod.shift ? 1.0 : mod.alt ? 0.5 : 0.85;
    let notes = notesOf(cur).map((n) => ({ note: n, vel: velOf(cur, n) }));
    if (mode === 'erase') {
      notes = notes.filter((n) => n.note !== note);
    } else if (isDrum) {
      notes = [...notes.filter((n) => n.note !== note), { note, vel }];
    } else {
      notes = [{ note, vel }]; // melodic rows: one note per step (replace)
    }
    if (mode === 'draw') {
      // hear what you place
      const dev = audioEngine.devices.get(track.deviceId);
      if (dev) {
        audioEngine.liveNoteOn(dev, note, vel);
        setTimeout(() => audioEngine.liveNoteOff(dev, note), 180);
      }
    }
    track.steps[step] = withNotes(cur, notes);
    audioEngine.commitEdit();
    force();
  };

  const down = (e: React.PointerEvent, step: number, note: number) => {
    const mode = isOn(step, note) && !e.shiftKey && !e.altKey ? 'erase' : 'draw';
    painting.current = mode;
    apply(step, note, mode, { shift: e.shiftKey, alt: e.altKey });
  };
  const enter = (step: number, note: number) => {
    if (painting.current) apply(step, note, painting.current, { shift: false, alt: false });
  };

  const clearTrack = () => {
    if (!track) return;
    track.steps.fill(null);
    audioEngine.commitEdit();
    force();
  };

  const setLength = (n: number) => {
    if (track && pattern) audioEngine.sequencer.setPatternLength(track.id, pattern.id, n);
    force();
  };

  const color = track?.color || '#fb923c';
  const btn = 'px-1.5 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700';

  return (
    <div className="flex flex-col h-full min-h-0 gap-1">
      <div className="flex items-center gap-1 overflow-x-auto shrink-0">
        {tracks.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectTrack(t.deviceId)}
            className={`px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap ${t.id === track?.id ? 'text-black font-bold' : 'bg-slate-800 text-slate-300'}`}
            style={t.id === track?.id ? { background: t.color } : undefined}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0 flex-wrap">
        <PatternManager audioEngine={audioEngine} track={track} compact />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0 flex-wrap">
        <span>Steps</span>
        {[16, 32, 64, 128].map((n) => (
          <button key={n} className={`${btn} ${len === n ? '!bg-orange-500 text-black' : ''}`} onClick={() => setLength(n)}>{n}</button>
        ))}
        <span className="ml-1">Swing</span>
        <input
          type="range" min={0} max={1} step={0.01} value={audioEngine.globalSwing}
          aria-label="Swing"
          onChange={(e) => { audioEngine.setGlobalSwing(Number(e.target.value)); force(); }}
          className="w-16 accent-orange-500"
        />
        <span>{Math.round(50 + audioEngine.globalSwing * 25)}%</span>
        {!isDrum && (
          <>
            <button className={btn} onClick={() => setOct((o) => Math.max(0, o - 1))} aria-label="Octave down">Oct −</button>
            <span>C{oct}</span>
            <button className={btn} onClick={() => setOct((o) => Math.min(7, o + 1))} aria-label="Octave up">Oct +</button>
          </>
        )}
        {pages > 1 && (
          <span className="flex items-center gap-0.5">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                className={`${btn} ${i === curPage ? '!bg-orange-500 text-black' : ''}`}
                onClick={() => setPage(i)}
                aria-label={`Steps ${i * PAGE + 1} to ${Math.min(len, (i + 1) * PAGE)}`}
              >
                {i * PAGE + 1}–{Math.min(len, (i + 1) * PAGE)}
              </button>
            ))}
          </span>
        )}
        <button className={`${btn} ml-auto`} onClick={clearTrack}>Clear</button>
      </div>

      {!track ? (
        <div className="text-slate-500 text-[11px] p-2">Add an instrument to start sequencing.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto select-none" onPointerLeave={() => undefined}>
          <div className="relative">
            {lanes.map((lane) => (
              <div key={lane.note} className="flex items-center gap-1 mb-[2px]" style={{ height: rowHeight }}>
                <span className={`${rowHeight > 16 ? 'w-28 text-[11px]' : 'w-16 text-[11px]'} shrink-0 truncate text-slate-400`} title={isDrum ? 'Shift-click = accent, Alt-click = soft' : undefined}>
                  {lane.name}
                </span>
                <div className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${shownLen}, 1fr)` }}>
                  {Array.from({ length: shownLen }, (_, k) => {
                    const i = first + k;
                    const on = isOn(i, lane.note);
                    const vel = velOf(track.steps[i], lane.note);
                    return (
                      <div
                        key={i}
                        onPointerDown={(e) => down(e, i, lane.note)}
                        onPointerEnter={() => enter(i, lane.note)}
                        className={`rounded-sm cursor-pointer ${i % 4 === 0 && !on ? 'ring-1 ring-white/10' : ''}`}
                        style={{ height: rowHeight, background: on ? color : '#1a2130', opacity: on ? 0.55 + 0.45 * vel : 1 }}
                        title={on ? `${lane.name} · step ${i + 1} · velocity ${Math.round(vel * 127)}` : `${lane.name} · step ${i + 1}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            <div className={`absolute top-0 bottom-0 ${rowHeight > 16 ? 'left-[116px]' : 'left-[68px]'} right-0 pointer-events-none`}>
              <div ref={headRef} className="absolute top-0 bottom-0 bg-white/20" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
