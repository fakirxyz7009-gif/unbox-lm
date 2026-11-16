/**
 * Compact strip above the arrangement: the loop region as a readout plus one-click section
 * actions (duplicate, delete, ripple delete, ripple insert). The ruler menu and the Shift keys do
 * the same work — this is the version you can see without knowing either.
 */
import React, { useState } from 'react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import { useEngineVersion } from '../../../nexa/useEngine.ts';
import { toast } from '../../../shell/toast.ts';
import { capturePointer } from '../../../ui/skin/pointer.ts';
import { showConfirm } from '../../../shell/dialogService.ts';

export const SectionStrip: React.FC<{ audioEngine: AudioEngine; light: boolean }> = ({ audioEngine, light }) => {
  useEngineVersion();
  const a = audioEngine.loopStartBar;
  const b = audioEngine.loopEndBar;
  const len = +(b - a).toFixed(3);
  const active = len > 0;
  const [draft, setDraft] = useState<{ a: string; b: string } | null>(null);
  const [gapDraft, setGapDraft] = useState<string | null>(null);
  const [grab, setGrab] = useState<{ x: number; a0: number; b0: number } | null>(null);
  const spb = Math.max(1, audioEngine.stepsPerBar);
  const step = 1 / spb;
  const draftNow = draft ?? { a: String(+(a + 1).toFixed(3)), b: String(+(b + 1).toFixed(3)) };
  /** A typed bar number becomes the new loop edge (1-based in the field, 0-based in the engine). */
  const commitEdge = (which: 'a' | 'b') => {
    const typed = Number(which === 'a' ? draftNow.a : draftNow.b);
    setDraft(null);
    if (!Number.isFinite(typed)) return;
    const bar = Math.max(0, typed - 1);
    if (which === 'a') audioEngine.setLoopLocators(bar, Math.max(bar + step, b));
    else audioEngine.setLoopLocators(a, Math.max(a + step, bar));
  };
  /** Dragging the grip shifts the whole range, keeping its length. */
  const grabMove = (e: React.PointerEvent) => {
    if (!grab) return;
    const delta = Math.round((e.clientX - grab.x) / 8) * step;
    const start = Math.max(0, grab.a0 + delta);
    if (Math.abs(start - a) > 1e-9) audioEngine.setLoopLocators(start, start + (grab.b0 - grab.a0));
  };
  const frame = light ? 'bg-[#20242a] border-[#3a4047] text-[#e8e5df]' : 'bg-[#0f1520] border-neutral-800 text-slate-300';
  const off = light
    ? 'bg-[#2c3137] hover:bg-[#3a4047] border-[#4a5057] text-[#e8e5df]'
    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200';
  const btn = (extra: string) =>
    `px-1.5 py-0.5 rounded font-bold border disabled:opacity-35 disabled:cursor-default ${off} ${extra}`;

  const contents = audioEngine.sectionContents(a, b);
  const total = contents.clips + contents.points + contents.markers + contents.blocks + contents.folders;
  const describe = () =>
    [
      contents.clips && `${contents.clips} clip${contents.clips === 1 ? '' : 's'}`,
      contents.points && `${contents.points} automation point${contents.points === 1 ? '' : 's'}`,
      contents.markers && `${contents.markers} marker${contents.markers === 1 ? '' : 's'}`,
      contents.blocks && `${contents.blocks} block${contents.blocks === 1 ? '' : 's'}`,
      contents.folders && `${contents.folders} group${contents.folders === 1 ? '' : 's'}`,
    ]
      .filter(Boolean)
      .join(', ');

  const copy = () => {
    if (!total) {
      toast('That section is empty — nothing to copy', 'info');
      return;
    }
    const made = audioEngine.duplicateSection(a, b);
    toast(
      made ? `Copied section — ${made} clip${made === 1 ? '' : 's'} to bar ${+(b + 1).toFixed(2)}` : 'That section has no clips to copy',
      made ? 'success' : 'info'
    );
  };
  const del = async () => {
    if (!total) {
      toast('That section is empty — nothing to delete', 'info');
      return;
    }
    const ok = await showConfirm({
      title: `Delete bars ${+(a + 1).toFixed(2)}–${+(b + 1).toFixed(2)}?`,
      message: `This removes ${describe()}. One undo step restores it.`,
      confirmLabel: 'Delete section',
    });
    if (!ok) return;
    const r = audioEngine.deleteSection(a, b);
    const n = r.clips + r.lanes + r.markers + r.blocks + r.folders;
    toast(
      n
        ? `Deleted section — ${r.clips} clip${r.clips === 1 ? '' : 's'}, ${r.lanes} automation, ${r.markers} marker${r.markers === 1 ? '' : 's'}, ${r.blocks} block${r.blocks === 1 ? '' : 's'}, ${r.folders} group${r.folders === 1 ? '' : 's'} (Ctrl+Z restores it)`
        : 'That section had nothing to delete',
      n ? 'success' : 'info'
    );
  };
  const rippleDel = async () => {
    if (!total) {
      toast('That section is empty — nothing to ripple', 'info');
      return;
    }
    const ok = await showConfirm({
      title: `Ripple delete bars ${+(a + 1).toFixed(2)}–${+(b + 1).toFixed(2)}?`,
      message: `This removes ${describe()} and pulls everything after the section ${len} bar${len === 1 ? '' : 's'} left. One undo step restores it.`,
      confirmLabel: 'Ripple delete',
    });
    if (!ok) return;
    const r = audioEngine.rippleDeleteSection(a, b);
    const changed = r.clips + r.shifted + r.lanes + r.markers + r.blocks + r.folders;
    toast(
      changed
        ? `Ripple deleted section — ${r.clips} clip${r.clips === 1 ? '' : 's'} removed, ${r.shifted} later clip${r.shifted === 1 ? '' : 's'} pulled left (Ctrl+Z restores it)`
        : 'Nothing after this section to ripple',
      changed ? 'success' : 'info'
    );
  };
  /** Gap the RIPPLE INSERT button opens: typed in the strip, defaulting to the section length. */
  const gap = (() => {
    const typed = Number(gapDraft);
    return Number.isFinite(typed) && typed > 0 ? typed : len;
  })();
  const rippleIns = () => {
    const r = audioEngine.rippleInsertSection(a, gap);
    const changed = r.clips + r.lanes + r.markers + r.blocks + r.folders + (r.loop ? 1 : 0);
    toast(
      changed
        ? `Opened a ${gap} bar gap at bar ${+(a + 1).toFixed(2)} — ${r.clips} clip${r.clips === 1 ? '' : 's'} pushed right (Ctrl+Z restores it)`
        : 'Nothing at or after this point to push right',
      changed ? 'success' : 'info'
    );
  };

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 border-b text-[11px] flex-shrink-0 font-mono ${frame}`}
      data-testid="section-strip"
    >
      <span className="font-black text-amber-300">SECTION</span>
      <span className="flex items-center gap-1 tabular-nums">
        <span className="opacity-70">bars</span>
        <input
          value={draftNow.a}
          onChange={(e) => setDraft({ ...draftNow, a: e.target.value })}
          onBlur={() => commitEdge('a')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdge('a');
            else if (e.key === 'Escape') setDraft(null);
            e.stopPropagation();
          }}
          type="number"
          step={step}
          min={1}
          className={`w-12 px-1 py-0 rounded text-right tabular-nums border ${light ? 'bg-[#181c20] border-[#3a4047] text-[#e8e5df]' : 'bg-slate-900 border-slate-700 text-white'}`}
          title="First bar of the section (type a number, or drag the ⇔ grip to move the whole range)"
          aria-label="Section start bar"
          data-testid="section-strip-start"
        />
        <span
          className="px-0.5 cursor-ew-resize select-none text-amber-300"
          title="Drag left / right to move the whole section range"
          onPointerDown={(e) => {
            e.preventDefault();
            capturePointer(e.currentTarget, e.pointerId);
            setGrab({ x: e.clientX, a0: a, b0: b });
          }}
          onPointerMove={grabMove}
          onPointerUp={() => setGrab(null)}
          onPointerCancel={() => setGrab(null)}
          data-testid="section-strip-grip"
        >
          ⇔
        </span>
        <input
          value={draftNow.b}
          onChange={(e) => setDraft({ ...draftNow, b: e.target.value })}
          onBlur={() => commitEdge('b')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdge('b');
            else if (e.key === 'Escape') setDraft(null);
            e.stopPropagation();
          }}
          type="number"
          step={step}
          min={1}
          className={`w-12 px-1 py-0 rounded text-right tabular-nums border ${light ? 'bg-[#181c20] border-[#3a4047] text-[#e8e5df]' : 'bg-slate-900 border-slate-700 text-white'}`}
          title="Last bar of the section"
          aria-label="Section end bar"
          data-testid="section-strip-end"
        />
        <span className="opacity-70">
          {active ? `· ${len} bar${len === 1 ? '' : 's'}` : '· set a range'}
        </span>
        <span
          className={`px-1 rounded ${total ? (light ? 'bg-[#2c3137] text-[#c3c9d0]' : 'bg-slate-800 text-slate-300') : 'text-red-300'}`}
          title={total ? `In this section: ${describe()}` : 'Nothing starts inside this range'}
          data-testid="section-strip-contents"
        >
          {total ? `${contents.clips} clip${contents.clips === 1 ? '' : 's'}${contents.points + contents.markers + contents.blocks + contents.folders ? ' +' : ''}` : 'empty'}
        </span>
      </span>
      <span className={`w-px h-4 ${light ? 'bg-[#4a5057]' : 'bg-slate-700'}`} />
      <button className={btn('')} disabled={!active} onClick={copy} title="Duplicate this section after itself (Shift+D)" data-testid="section-strip-copy">
        DUPLICATE
      </button>
      <button className={btn('text-red-300')} disabled={!active} onClick={() => void del()} title="Delete the clips, automation, markers, blocks and groups in this section (Shift+Backspace)" data-testid="section-strip-delete">
        DELETE
      </button>
      <button className={btn('text-amber-300')} disabled={!active} onClick={() => void rippleDel()} title="Delete the section and pull everything after it left (Shift+X)" data-testid="section-strip-ripple-delete">
        RIPPLE DELETE
      </button>
      <button
        className={btn('text-emerald-300')}
        disabled={!active}
        onClick={rippleIns}
        title={`Open a ${gap} bar gap at the section start and push everything after it right (Shift+I uses the section length)`}
        data-testid="section-strip-ripple-insert"
      >
        RIPPLE INSERT
      </button>
      <label className="flex items-center gap-1 opacity-90" title="Length of the gap RIPPLE INSERT opens (defaults to the section length)">
        <span className="opacity-70">gap</span>
        <input
          value={gapDraft ?? String(len)}
          onChange={(e) => setGapDraft(e.target.value)}
          onBlur={() => {
            const typed = Number(gapDraft);
            if (!Number.isFinite(typed) || typed <= 0) setGapDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setGapDraft(null);
            e.stopPropagation();
          }}
          type="number"
          step={step}
          min={step}
          className={`w-12 px-1 py-0 rounded text-right tabular-nums border ${light ? 'bg-[#181c20] border-[#3a4047] text-[#e8e5df]' : 'bg-slate-900 border-slate-700 text-white'}`}
          aria-label="Ripple insert gap length in bars"
          data-testid="section-strip-gap"
        />
        <span className="opacity-70">bars</span>
      </label>
      <span className="ml-auto opacity-50 hidden lg:inline">Shift+D · Shift+Backspace · Shift+X · Shift+I</span>
    </div>
  );
};
