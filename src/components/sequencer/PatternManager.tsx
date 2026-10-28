/**
 * Pattern bar for one track: unlimited patterns as scrollable pills (click = edit,
 * double-click = rename) plus New / Duplicate / Rename / Colour / Delete, per-pattern length
 * and step division, and "→ Song" to place the pattern in the arrangement.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Copy, Pencil, Plus, Trash2, ArrowRightToLine } from 'lucide-react';
import type { AudioEngine } from '../../audio/AudioEngine.ts';
import type { SequencerTrack, StepDivision } from '../../audio/types.ts';
import { DIVISIONS, PATTERN_LENGTH_PRESETS, songEndBar, syncTrackPatterns } from '../../audio/sequencer/model.ts';

interface Props {
  audioEngine: AudioEngine;
  track: SequencerTrack | undefined;
  /** Smaller variant for the Studio view's step editor. */
  compact?: boolean;
}

export const PatternManager: React.FC<Props> = ({ audioEngine, track, compact = false }) => {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [customLen, setCustomLen] = useState('');
  const pillsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirmDelete) return;
    const id = window.setTimeout(() => setConfirmDelete(null), 2500);
    return () => clearTimeout(id);
  }, [confirmDelete]);

  // Keep the active pill visible
  const activeId = track?.activePatternId;
  useEffect(() => {
    const el = pillsRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  if (!track) {
    return <div className="text-[11px] font-mono text-slate-500 px-2">No instrument selected</div>;
  }
  const seq = audioEngine.sequencer;
  const active = syncTrackPatterns(track, audioEngine.activePatternIndex);
  const patterns = track.patternList || [];
  const usedInSong = (track.arrangementClips || []).some((c) => c.kind !== 'notes' && c.patternId === active.id);
  const songMode = audioEngine.playbackMode === 'song_arrangement';
  const hasClips = (track.arrangementClips || []).length > 0;

  const startRename = (id: string, name: string) => {
    setRenaming(id);
    setDraftName(name);
  };
  const finishRename = () => {
    if (renaming && draftName.trim()) seq.renamePattern(track.id, renaming, draftName);
    setRenaming(null);
  };
  const addToSong = () => {
    const end = Math.ceil(Math.max(songEndBar([track]), 0));
    seq.addPatternClip(track.id, end, { patternId: active.id });
  };
  const applyCustomLen = () => {
    const n = Math.round(Number(customLen));
    if (n >= 1) seq.setPatternLength(track.id, active.id, n);
    setCustomLen('');
  };

  const btn = `rounded font-bold flex items-center gap-1 border transition-colors ${compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[11px]'}`;
  const clipsUsing = confirmDelete ? seq.clipsUsingPattern(track.id, confirmDelete) : 0;

  return (
    <div className={`flex items-center gap-1.5 font-mono min-w-0 ${compact ? 'text-[11px]' : 'text-[11px]'}`} data-testid="pattern-manager">
      <span className="text-neutral-400 font-bold flex-shrink-0">PATTERNS</span>
      <div
        ref={pillsRef}
        className="flex items-center gap-1 overflow-x-auto max-w-[46vw] py-0.5 scrollbar-thin"
        role="tablist"
        aria-label={`Patterns of ${track.name}`}
      >
        {patterns.map((p, i) => {
          const isActive = p.id === active.id;
          if (renaming === p.id) {
            return (
              <input
                key={p.id}
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={finishRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') finishRename();
                  if (e.key === 'Escape') setRenaming(null);
                }}
                className="w-28 px-1.5 py-0.5 rounded bg-slate-900 border border-amber-400 text-white outline-none"
                aria-label="Pattern name"
              />
            );
          }
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={isActive}
              data-active={isActive}
              data-testid="pattern-pill"
              onClick={() => seq.selectPattern(track.id, p.id)}
              onDoubleClick={() => startRename(p.id, p.name)}
              className={`flex-shrink-0 px-2 py-0.5 rounded border font-bold flex items-center gap-1 transition-all ${
                isActive ? 'bg-amber-500 text-black border-amber-300 shadow-[0_0_6px_#f59e0b]' : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:text-white'
              }`}
              title={`${p.name} · ${p.length} steps · ${p.division} — click to edit, double-click to rename`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="max-w-[9rem] truncate">{p.name || `Pattern ${i + 1}`}</span>
            </button>
          );
        })}
      </div>

      <button
        className={`${btn} bg-emerald-800/80 hover:bg-emerald-600 text-white border-emerald-500/50`}
        onClick={() => seq.createPattern(track.id)}
        title="New empty pattern (same length and division)"
        data-testid="pattern-new"
      >
        <Plus className="w-3 h-3" />
        {!compact && 'NEW'}
      </button>
      <button
        className={`${btn} bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border-neutral-700`}
        onClick={() => seq.duplicatePattern(track.id, active.id)}
        title="Duplicate this pattern"
        data-testid="pattern-duplicate"
      >
        <Copy className="w-3 h-3" />
        {!compact && 'DUP'}
      </button>
      <button
        className={`${btn} bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700`}
        onClick={() => startRename(active.id, active.name)}
        title="Rename this pattern"
      >
        <Pencil className="w-3 h-3" />
        {!compact && 'RENAME'}
      </button>
      <label className="flex items-center cursor-pointer" title="Pattern colour">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(active.color) ? active.color : '#f59e0b'}
          onChange={(e) => seq.setPatternColor(track.id, active.id, e.target.value)}
          className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"
          aria-label="Pattern colour"
        />
      </label>
      <button
        className={`${btn} ${confirmDelete === active.id ? 'bg-red-600 text-white border-red-400' : 'bg-neutral-800 hover:bg-red-900 text-red-300 border-neutral-700'}`}
        onClick={() => {
          if (confirmDelete === active.id) {
            seq.deletePattern(track.id, active.id);
            setConfirmDelete(null);
          } else setConfirmDelete(active.id);
        }}
        title={patterns.length === 1 ? 'Clear the only pattern' : 'Delete this pattern (and the clips that play it)'}
        data-testid="pattern-delete"
      >
        <Trash2 className="w-3 h-3" />
        {confirmDelete === active.id ? (clipsUsing ? `DELETE + ${clipsUsing} CLIP${clipsUsing > 1 ? 'S' : ''}?` : 'SURE?') : !compact && 'DEL'}
      </button>

      <div className="w-px h-4 bg-neutral-700 flex-shrink-0" />
      <span className="text-neutral-400 font-bold flex-shrink-0">LEN</span>
      <select
        value={PATTERN_LENGTH_PRESETS.includes(active.length as (typeof PATTERN_LENGTH_PRESETS)[number]) ? active.length : 'custom'}
        onChange={(e) => {
          if (e.target.value !== 'custom') seq.setPatternLength(track.id, active.id, Number(e.target.value));
        }}
        className="bg-[#18202c] text-emerald-300 font-bold px-1 py-0.5 rounded border border-neutral-700"
        aria-label="Pattern length in steps"
        data-testid="pattern-length"
      >
        {PATTERN_LENGTH_PRESETS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        {!PATTERN_LENGTH_PRESETS.includes(active.length as (typeof PATTERN_LENGTH_PRESETS)[number]) && (
          <option value="custom">{active.length}</option>
        )}
      </select>
      <input
        value={customLen}
        onChange={(e) => setCustomLen(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') applyCustomLen();
        }}
        onBlur={() => customLen && applyCustomLen()}
        placeholder="any"
        className="w-10 bg-[#18202c] text-white px-1 py-0.5 rounded border border-neutral-700 outline-none"
        aria-label="Custom pattern length (1-1024 steps)"
        title="Type any length 1–1024 steps, Enter to apply"
      />
      <select
        value={active.division}
        onChange={(e) => seq.setPatternDivision(track.id, active.id, e.target.value as StepDivision)}
        className="bg-[#18202c] text-cyan-300 font-bold px-1 py-0.5 rounded border border-neutral-700"
        aria-label="Step division"
        title="Length of one step"
        data-testid="pattern-division"
      >
        {DIVISIONS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>

      {songMode && hasClips && !usedInSong && (
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-600/50 flex-shrink-0" title="Song mode plays clips: this pattern has none">
          not in song
        </span>
      )}
      <button
        className={`${btn} bg-cyan-900/70 hover:bg-cyan-700 text-cyan-100 border-cyan-600/50`}
        onClick={addToSong}
        title={`Place this pattern in the arrangement after the last clip of ${track.name}`}
        data-testid="pattern-to-song"
      >
        <ArrowRightToLine className="w-3 h-3" />
        {!compact && 'SONG'}
      </button>
    </div>
  );
};

