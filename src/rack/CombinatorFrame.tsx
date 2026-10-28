import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Sparkles, Trash2, Ungroup } from 'lucide-react';
import { Knob } from '../components/Knob.tsx';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { RackGroup } from '../audio/types.ts';
import { RackGrip, type RackFace } from './RackUnitFrame.tsx';

interface CombinatorFrameProps {
  engine: AudioEngine;
  group: RackGroup;
  face: RackFace;
  onUpdate: () => void;
  /** Layout key (`group:<id>`) for dragging the whole Combiner. */
  dragKey: string;
  /** All members folded? The header button folds / unfolds them together. */
  folded: boolean;
  onFold: (folded: boolean) => void;
  children: React.ReactNode;
}

export const CombinatorFrame: React.FC<CombinatorFrameProps> = ({ engine, group, face, onUpdate, dragKey, folded, onFold, children }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deviceName = (id: string) => engine.devices.get(id)?.name ?? 'removed unit';

  return (
    <section className={`combinator ${face === 'rear' ? 'combinator--rear' : ''}`} aria-label={`Combiner ${group.name}`} data-rack-item={dragKey} data-nav="group">
      <header className="combinator-head">
        <div className="flex items-center gap-2 min-w-0">
          <RackGrip dragKey={dragKey} name={group.name} />
          {face === 'front' && (
            <button
              type="button"
              className="rack-fold"
              onClick={(e) => {
                e.stopPropagation();
                onFold(!folded);
              }}
              title={folded ? 'Unfold every unit in this Combiner' : 'Fold every unit in this Combiner'}
              aria-expanded={!folded}
            >
              {folded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <Layers className="w-4 h-4 shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-black tracking-widest uppercase truncate">{group.name}</div>
            <div className="text-[11px] opacity-80 truncate max-w-[420px]" title={group.description || group.prompt}>
              {group.description || group.prompt || `${group.deviceIds.length} units`}
            </div>
          </div>
          {group.source !== 'user' && (
            <span className="combinator-source" title={group.prompt ? `Prompt: ${group.prompt}` : undefined}>
              <Sparkles className="w-3 h-3" /> {group.source === 'gemini' ? 'Gemini' : 'Local planner'}
            </span>
          )}
        </div>

        {face === 'front' && group.macros.length > 0 && (
          <div className="flex items-center gap-3 ml-auto" onClick={(e) => e.stopPropagation()}>
            {group.macros.map((m) => (
              <div key={m.id} title={`Drives: ${m.targets.map((t) => `${deviceName(t.deviceId)} ${t.param}`).join(', ')}`}>
                <Knob
                  label={m.label}
                  value={m.value}
                  min={0}
                  max={1}
                  step={0.005}
                  size="sm"
                  variant="white"
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => {
                    engine.setRackMacro(group.id, m.id, v);
                    onUpdate();
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1 ${face === 'rear' || group.macros.length === 0 ? 'ml-auto' : ''}`}>
          <button
            type="button"
            className="combinator-btn"
            onClick={(e) => {
              e.stopPropagation();
              engine.removeRackGroup(group.id, false);
            }}
            title="Ungroup — keep the units and cables, remove the Combiner frame"
          >
            <Ungroup className="w-3.5 h-3.5" /> Ungroup
          </button>
          <button
            type="button"
            className={`combinator-btn ${confirmDelete ? 'combinator-btn--danger' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!confirmDelete) {
                setConfirmDelete(true);
                window.setTimeout(() => setConfirmDelete(false), 2500);
                return;
              }
              engine.removeRackGroup(group.id, true);
            }}
            title="Remove the Combiner and every unit inside it"
          >
            <Trash2 className="w-3.5 h-3.5" /> {confirmDelete ? 'Click again to delete' : 'Delete'}
          </button>
        </div>
      </header>
      <div className="combinator-body">{children}</div>
    </section>
  );
};
