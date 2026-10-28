import React, { memo, useLayoutEffect, useReducer, useRef } from 'react';
import { ChevronDown, ChevronRight, GripVertical, Power, X } from 'lucide-react';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import { VstPluginDevice } from '../vst/VstPluginDevice.ts';
import { DeviceFront } from './DeviceFront.tsx';
import type { CableController, Notify } from './PatchCableLayer.tsx';
import type { JackRegistry } from './jackRegistry.ts';
import { RearPanel } from './RearPanel.tsx';
import { faceplateClass, unitMinHeight } from './rackTheme.ts';

export type RackFace = 'front' | 'rear';

/** Stable callbacks shared by every unit (so a memoised unit doesn't re-render for new closures). */
export interface RackUnitActions {
  select: (id: string) => void;
  remove: (dev: BaseDevice) => void;
  /** Alt = the whole column. */
  toggleFold: (key: string, alt: boolean) => void;
  message: Notify;
}

/** Last measured front-panel height per device, so the rear keeps the same footprint. */
const frontHeights = new Map<string, number>();

/** Key of the unit being dragged to another rack slot (dragover can't read dataTransfer). */
export const rackDrag: { key: string | null } = { key: null };
export const RACK_DRAG_TYPE = 'application/x-unbox-rack-unit';

interface RackUnitFrameProps {
  device: BaseDevice;
  face: RackFace;
  selected: boolean;
  folded: boolean;
  /** Changes on structural engine events, so panels refresh then (knob moves re-render one unit). */
  rev: number;
  plugged: Map<string, string>;
  controller: CableController;
  registry: JackRegistry;
  actions: RackUnitActions;
  /** Set for units that can be moved on their own (not Combiner members). */
  dragKey?: string;
  /** Navigator colour class: instrument / effect / utility. */
  nav: 'instrument' | 'effect' | 'utility';
}

function Ear({ units, side }: { units: number; side: 'left' | 'right' }) {
  return (
    <div className={`rack-ear rack-ear--${side}`} aria-hidden="true">
      <div className="rack-screw" />
      <span className="text-[11px] font-mono font-bold text-neutral-500">{units}U</span>
      <div className="rack-screw" />
    </div>
  );
}

/** Drag handle: moves the unit (or Combiner) to another place or column. */
export function RackGrip({ dragKey, name }: { dragKey: string; name: string }) {
  return (
    <span
      draggable
      className="rack-grip"
      title={`Drag to move ${name} (also into another column)`}
      aria-hidden="true"
      onDragStart={(e) => {
        rackDrag.key = dragKey;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(RACK_DRAG_TYPE, dragKey);
        const unit = (e.currentTarget as HTMLElement).closest('[data-rack-item]');
        if (unit) e.dataTransfer.setDragImage(unit, 24, 16);
      }}
      onDragEnd={() => (rackDrag.key = null)}
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </span>
  );
}

const RackUnitFrameImpl: React.FC<RackUnitFrameProps> = ({ device, face, selected, folded, plugged, controller, registry, actions, dragKey, nav }) => {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const frontRef = useRef<HTMLDivElement>(null);
  const showFolded = folded && face === 'front';

  useLayoutEffect(() => {
    const el = frontRef.current;
    if (face !== 'front' || folded || !el) return;
    // the observer reports sizes after the browser's own layout; reading offsetHeight here forced
    // a full rack layout per mount (most of a tab switch)
    const ro = new ResizeObserver(([entry]) => {
      const box = entry?.borderBoxSize?.[0];
      frontHeights.set(device.id, box ? box.blockSize : el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [face, folded, device.id]);

  const minHeight = Math.max(unitMinHeight(device.heightUnits), face === 'rear' ? frontHeights.get(device.id) ?? 0 : 0);

  const togglePower = (e: React.MouseEvent) => {
    e.stopPropagation();
    device.isPowered = !device.isPowered;
    tick();
  };
  const toggleBypass = (e: React.MouseEvent) => {
    e.stopPropagation();
    device.isBypassed = !device.isBypassed;
    tick();
  };
  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    actions.remove(device);
  };
  const foldKey = dragKey ?? device.id;
  const foldButton = (
    <button
      type="button"
      className="rack-fold"
      onClick={(e) => {
        e.stopPropagation();
        actions.toggleFold(foldKey, e.altKey);
      }}
      title={folded ? `Unfold ${device.name} (Alt: whole column)` : `Fold ${device.name} to a strip (Alt: whole column)`}
      aria-label={folded ? `Unfold ${device.name}` : `Fold ${device.name}`}
      aria-expanded={!folded}
    >
      {folded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
    </button>
  );
  const badge = device instanceof VstPluginDevice ? <span className="proxy-chip" title="Library unit running Web Audio proxy DSP">VST · PROXY</span> : null;

  return (
    <section
      data-unit-id={device.id}
      data-rack-item={dragKey}
      data-nav={nav}
      className={`rack-unit ${selected ? 'rack-unit--selected' : ''} ${device.isPowered ? '' : 'rack-unit--off'} ${showFolded ? 'rack-unit--folded' : ''}`}
      style={face === 'rear' ? { minHeight } : undefined}
      onClick={() => actions.select(device.id)}
      aria-label={`${device.name} rack unit, ${face} panel${showFolded ? ', folded' : ''}`}
    >
      <Ear units={device.heightUnits} side="left" />
      {showFolded ? (
        <div className={`rack-face rack-strip flex-1 min-w-0 ${faceplateClass(device.type)}`}>
          {dragKey && <RackGrip dragKey={dragKey} name={device.name} />}
          {foldButton}
          <button type="button" onClick={togglePower} className="rack-strip-power" title={device.isPowered ? 'Power off' : 'Power on'} aria-pressed={device.isPowered}>
            <span className={`led-indicator ${device.isPowered ? 'active-blue' : ''}`} />
          </button>
          <span className="rack-strip-name truncate">{device.name}</span>
          {badge}
          <span className="flex-1" />
          {device.isBypassed && <span className="text-[11px] font-mono font-bold text-amber-300">BYPASSED</span>}
          <button type="button" onClick={remove} className="rack-x" title="Remove from rack" aria-label={`Remove ${device.name} from the rack`}>
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : face === 'front' ? (
        <div ref={frontRef} className={`rack-face flex-1 min-w-0 flex flex-col ${faceplateClass(device.type)}`} style={{ minHeight: unitMinHeight(device.heightUnits) }}>
          <header className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 border-b border-black/25">
            {dragKey && <RackGrip dragKey={dragKey} name={device.name} />}
            {foldButton}
            <button
              type="button"
              onClick={togglePower}
              className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-black/20"
              title={device.isPowered ? 'Power off' : 'Power on'}
              aria-label={device.isPowered ? `Power off ${device.name}` : `Power on ${device.name}`}
              aria-pressed={device.isPowered}
            >
              <Power className="w-3.5 h-3.5" />
              <span className={`led-indicator ${device.isPowered ? 'active-blue' : ''}`} />
            </button>
            <span className="text-xs font-bold font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-black/35 border border-white/10 truncate min-w-0 max-w-[260px]">
              {device.name}
            </span>
            {badge}
            <span className="flex-1" />
            <button
              type="button"
              onClick={toggleBypass}
              aria-pressed={device.isBypassed}
              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                device.isBypassed ? 'bg-amber-950/80 border-amber-600/80 text-amber-300' : 'bg-black/30 border-black/40 hover:bg-black/50'
              }`}
              title="Bypass"
            >
              {device.isBypassed ? 'BYPASSED' : 'BYPASS'}
            </button>
            <button type="button" onClick={remove} className="rack-x" title="Remove from rack" aria-label={`Remove ${device.name} from the rack`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </header>
          <div className="rack-face-body flex-1 flex flex-col justify-center px-3 py-2">
            <DeviceFront device={device} onUpdate={tick} onMessage={actions.message} />
          </div>
        </div>
      ) : (
        <div className="rack-back flex-1 min-w-0 relative">
          <RearPanel deviceId={device.id} deviceName={device.name} ports={device.ports} controller={controller} registry={registry} plugged={plugged} />
          <button type="button" onClick={remove} className="absolute top-1 right-1 rack-x text-neutral-400" title="Remove from rack" aria-label={`Remove ${device.name} from the rack`}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <Ear units={device.heightUnits} side="right" />
    </section>
  );
};

export const RackUnitFrame = memo(RackUnitFrameImpl);
