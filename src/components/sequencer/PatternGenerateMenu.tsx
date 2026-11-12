/**
 * GENERATE menu of the pattern bar: a new take of a style (replacing the edited pattern or as a new
 * one, so the old one is kept) and "from another part": a bass line, harmony, arpeggio or groove
 * written from what another instrument plays. Everything here is rule-based (no AI).
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Wand2 } from 'lucide-react';
import type { AudioEngine } from '../../audio/AudioEngine.ts';
import type { SequencerTrack } from '../../audio/types.ts';
import { DERIVE_KINDS, type DeriveKind } from '../../audio/sequencer/patternDerive.ts';
import { useEscapeKey } from '../../shell/useEscapeKey.ts';
import { toast } from '../../shell/toast.ts';

export type GenStyle = 'industrial' | 'acid' | 'bass' | 'chords' | 'melody' | 'arp' | 'drums' | 'euclidean';

export const GEN_STYLES: readonly { id: GenStyle; label: string }[] = [
  { id: 'industrial', label: 'Driving riff' },
  { id: 'acid', label: 'Acid line' },
  { id: 'bass', label: 'Rolling bass' },
  { id: 'chords', label: 'Sustained chords' },
  { id: 'melody', label: 'Lead phrase' },
  { id: 'arp', label: '16th arpeggio' },
  { id: 'drums', label: 'Drum groove' },
  { id: 'euclidean', label: 'Euclidean 3 / 8' },
];

// One style for every generator control (pattern bar menu, instrument row, the shortcuts).
let style: GenStyle = 'industrial';
const subs = new Set<() => void>();
export function setGenStyle(next: GenStyle): void {
  style = next;
  subs.forEach((s) => s());
}
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};

export function useGenStyle(): GenStyle {
  return useSyncExternalStore(subscribe, () => style, () => style);
}

/** Generates for a part and says what happened. */
export function generateFor(audioEngine: AudioEngine, track: SequencerTrack, genStyle: GenStyle, asNew: boolean): void {
  const label = GEN_STYLES.find((s) => s.id === genStyle)?.label ?? genStyle;
  audioEngine.generateInstrumentPattern(track.id, genStyle, { asNew, label });
  const active = track.patternList?.find((p) => p.id === track.activePatternId);
  toast(asNew ? `${label}: new pattern "${active?.name ?? ''}" on ${track.name}` : `${label}: new take on ${track.name} (Ctrl+Z brings the old one back)`, 'success');
}

interface Props {
  audioEngine: AudioEngine;
  track: SequencerTrack;
  compact?: boolean;
}

export const PatternGenerateMenu: React.FC<Props> = ({ audioEngine, track, compact = false }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [fromId, setFromId] = useState('');
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const genStyle = useGenStyle();
  const close = useCallback(() => setOpen(false), []);
  useEscapeKey(close, open);

  // The pattern bar scrolls sideways (it would clip a dropdown), so the menu is fixed to the window.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const w = 320;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: Math.min(r.bottom + 4, window.innerHeight - 300) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const sources = audioEngine.tracks.filter((t) => t.kind !== 'audio');
  const hasNotes = (t: SequencerTrack) => (t.patternList?.find((p) => p.id === t.activePatternId)?.steps ?? t.steps).some(Boolean);
  // until one is picked: another pitched part that plays something (it has the notes to write from)
  const from =
    sources.find((t) => t.id === fromId) ??
    sources.find((t) => t.id !== track.id && !audioEngine.padNotesOf(t) && hasNotes(t)) ??
    sources.find((t) => t.id !== track.id) ??
    track;
  const toKit = !!audioEngine.padNotesOf(track);
  const fromKit = !!audioEngine.padNotesOf(from);
  const fromEmpty = !hasNotes(from);

  const derive = (kind: DeriveKind) => {
    const p = audioEngine.sequencer.derivePattern(track.id, from.id, kind);
    if (p) toast(`"${p.name}": new pattern on ${track.name}`, 'success');
    setOpen(false);
  };
  // what each button does on this pair of instruments (a kit has no pitches to harmonise)
  const usable = (kind: DeriveKind) => kind === 'rhythm' || (!toKit && (kind === 'bass' || !fromKit));

  const item = 'px-2 py-1 rounded border font-bold text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`rounded font-bold flex items-center gap-1 border transition-colors flex-shrink-0 ${compact ? 'px-1.5' : 'px-2'} py-0.5 text-[11px] ${
          open ? 'bg-amber-400 text-black border-amber-200' : 'bg-amber-900/60 hover:bg-amber-600 text-amber-100 border-amber-500/50'
        }`}
        title="Generate a pattern for this part: a new take of a style, or a part written from another instrument"
        data-testid="pattern-generate"
      >
        <Wand2 className="w-3 h-3" />
        {!compact && 'GENERATE'}
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          role="dialog"
          aria-label={`Generate a pattern for ${track.name}`}
          data-testid="pattern-generate-menu"
          className="fixed z-50 w-[320px] rounded border border-amber-500/60 bg-[#141820] p-2.5 font-mono text-[11px] text-neutral-200 flex flex-col gap-2"
          style={{ left: pos.left, top: pos.top }}
        >
          <div className="font-bold text-amber-300 truncate">GENERATE FOR {track.name.toUpperCase()}</div>
          <label className="flex items-center gap-2">
            <span className="text-neutral-400 font-bold w-10">STYLE</span>
            <select
              value={genStyle}
              onChange={(e) => setGenStyle(e.target.value as GenStyle)}
              className="flex-1 bg-[#18202c] text-amber-200 font-bold px-1.5 py-1 rounded border border-amber-600/50"
              aria-label="Pattern style"
              data-testid="generate-style"
            >
              {GEN_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={`${item} bg-amber-500 hover:bg-amber-400 text-black border-amber-300`}
              onClick={() => generateFor(audioEngine, track, genStyle, false)}
              title="Writes a different take into the pattern you are editing, every time you press it (Ctrl+Shift+D)"
              data-testid="generate-take"
            >
              NEW TAKE
            </button>
            <button
              type="button"
              className={`${item} bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-400/60`}
              onClick={() => generateFor(audioEngine, track, genStyle, true)}
              title="Writes the take into a new pattern and keeps the one you are editing (Ctrl+D)"
              data-testid="generate-new"
            >
              + AS NEW PATTERN
            </button>
          </div>
          <div className="text-neutral-400">New take replaces this pattern. As new pattern keeps it.</div>

          <div className="border-t border-neutral-700 pt-2 font-bold text-cyan-300">FROM ANOTHER PART</div>
          <label className="flex items-center gap-2">
            <span className="text-neutral-400 font-bold w-10">PART</span>
            <select
              value={from.id}
              onChange={(e) => setFromId(e.target.value)}
              className="flex-1 bg-[#18202c] text-cyan-200 font-bold px-1.5 py-1 rounded border border-cyan-700/60"
              aria-label="Part to write from"
              data-testid="generate-from"
            >
              {sources.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.id === track.id ? ' (this part)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {DERIVE_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                disabled={fromEmpty || !usable(k.id)}
                className={`${item} bg-cyan-900/70 hover:bg-cyan-700 text-cyan-100 border-cyan-600/50`}
                onClick={() => derive(k.id)}
                title={
                  fromEmpty
                    ? `${from.name} has no notes in its pattern yet`
                    : usable(k.id)
                      ? `${k.help} (${from.name}): a new pattern on ${track.name}`
                      : toKit
                        ? 'A drum kit plays a groove: use Rhythm'
                        : 'A drum kit has no pitches for this: use Bass line or Rhythm'
                }
                data-testid={`generate-from-${k.id}`}
              >
                {k.label.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="text-neutral-400">
            {fromEmpty ? `${from.name} has no notes in its pattern yet.` : `Written from the pattern ${from.name} is on, as a new pattern here. Rules, not AI.`}
          </div>
        </div>
      )}
    </>
  );
};
