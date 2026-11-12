/**
 * One rack column: an optional fixed block on top (hardware interface / channel list), the units,
 * a drop line while a unit is dragged over it, the "+ Add device" slot and empty rack space.
 */
import React, { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { RackCol } from './rackLayout.ts';
import { RACK_DRAG_TYPE, rackDrag, type RackFace } from './RackUnitFrame.tsx';

interface Props {
  col: RackCol;
  face: RackFace;
  top?: React.ReactNode;
  children: React.ReactNode;
  /** `index` counts the column's units without the one being moved. */
  onDropUnit: (key: string, col: RackCol, index: number) => void;
  onAdd: (col: RackCol) => void;
  /** The next mounted unit lands in this column. */
  addArmed: boolean;
  label: string;
}

export const RackColumnView: React.FC<Props> = ({ col, face, top, children, onDropUnit, onAdd, addArmed, label }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<number | null>(null);

  /** Insert index and the drop line's y (relative to the list) for a pointer height. */
  const slot = (clientY: number): { index: number; y: number } => {
    const list = listRef.current;
    if (!list) return { index: 0, y: 0 };
    const box = list.getBoundingClientRect();
    const els = Array.from(list.children).filter((el) => el.hasAttribute('data-rack-item') && el.getAttribute('data-rack-item') !== rackDrag.key);
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return { index: i, y: r.top - box.top - 4 };
    }
    const last = els[els.length - 1]?.getBoundingClientRect();
    return { index: els.length, y: last ? last.bottom - box.top + 1 : 0 };
  };

  const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(RACK_DRAG_TYPE);

  return (
    <div
      className="rack-col"
      data-rack-col={col}
      aria-label={label}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const { y } = slot(e.clientY);
        if (y !== line) setLine(y);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLine(null);
      }}
      onDrop={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setLine(null);
        const key = e.dataTransfer.getData(RACK_DRAG_TYPE) || rackDrag.key;
        const { index } = slot(e.clientY); // before clearing the key: slot() skips the moving unit
        rackDrag.key = null;
        if (key) onDropUnit(key, col, index);
      }}
    >
      {top}
      <div ref={listRef} className="rack-col-list">
        {children}
        {line !== null && <div className="rack-drop-line" style={{ top: line }} aria-hidden="true" />}
      </div>
      {face === 'front' && (
        <button
          type="button"
          className={`rack-add ${addArmed ? 'rack-add--armed' : ''}`}
          onClick={() => onAdd(col)}
          aria-pressed={addArmed}
          title={addArmed ? 'The next unit you mount from the library lands here (click to cancel)' : `Add a device to the ${label}`}
        >
          <Plus className="w-3.5 h-3.5" /> {addArmed ? 'Pick a unit in the library…' : 'Add device'}
        </button>
      )}
      <div className="rack-col-fill" aria-hidden="true" />
    </div>
  );
};
