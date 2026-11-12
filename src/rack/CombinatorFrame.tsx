import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Plus, SlidersHorizontal, Sparkles, Trash2, Ungroup, X } from 'lucide-react';
import { Knob } from '../components/Knob.tsx';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import { deviceParams, isMacroMappableDeviceParam, type DeviceParam } from '../audio/deviceParams.ts';
import type { RackGroup, RackMacro, RackMacroTarget } from '../audio/types.ts';
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
  const [macroEditorOpen, setMacroEditorOpen] = useState(false);
  const [newMacroLabel, setNewMacroLabel] = useState('');
  const [newMacroTarget, setNewMacroTarget] = useState<{ deviceId: string; param: string }>({ deviceId: '', param: '' });
  const deviceName = (id: string) => engine.devices.get(id)?.name ?? 'removed unit';
  const members = useMemo(
    () => group.deviceIds.flatMap((id) => {
      const device = engine.devices.get(id);
      return device ? [device] : [];
    }),
    [engine, group.deviceIds]
  );
  /** A macro is continuously interpolated, so exclude selectors and on/off switches. */
  const macroParamsFor = (deviceId: string): DeviceParam[] => {
    const device = engine.devices.get(deviceId);
    if (!device) return [];
    return deviceParams(device).filter((param) =>
      Number.isFinite(param.min) && Number.isFinite(param.max) && param.min !== param.max && isMacroMappableDeviceParam(param)
    );
  };
  const firstMapping = useMemo(() => {
    for (const device of members) {
      const param = macroParamsFor(device.id)[0];
      if (param) return { deviceId: device.id, param: param.key };
    }
    return null;
  }, [members]);
  const selectedNewDeviceId = members.some((device) => device.id === newMacroTarget.deviceId && macroParamsFor(device.id).length)
    ? newMacroTarget.deviceId
    : firstMapping?.deviceId ?? '';
  const selectedNewParams = macroParamsFor(selectedNewDeviceId);
  const selectedNewParam = selectedNewParams.some((param) => param.key === newMacroTarget.param)
    ? newMacroTarget.param
    : firstMapping?.deviceId === selectedNewDeviceId
      ? firstMapping.param
      : selectedNewParams[0]?.key ?? '';
  const selectedNewParamDef = selectedNewParams.find((param) => param.key === selectedNewParam);

  const updateMacro = (macro: RackMacro, patch: { label?: string; targets?: RackMacroTarget[] }) => {
    if (engine.updateRackMacro(group.id, macro.id, patch)) onUpdate();
  };
  const replaceTarget = (macro: RackMacro, index: number, target: RackMacroTarget) =>
    updateMacro(macro, { targets: macro.targets.map((entry, targetIndex) => targetIndex === index ? target : entry) });
  const addTarget = (macro: RackMacro) => {
    if (!firstMapping) return;
    const param = macroParamsFor(firstMapping.deviceId).find((entry) => entry.key === firstMapping.param);
    if (!param) return;
    updateMacro(macro, { targets: [...macro.targets, { deviceId: firstMapping.deviceId, param: param.key, min: param.min, max: param.max }] });
  };
  const changeTargetDevice = (macro: RackMacro, index: number, deviceId: string) => {
    const param = macroParamsFor(deviceId)[0];
    if (!param) return;
    replaceTarget(macro, index, { deviceId, param: param.key, min: param.min, max: param.max });
  };
  const changeTargetParam = (macro: RackMacro, index: number, paramKey: string) => {
    const previous = macro.targets[index];
    const param = macroParamsFor(previous.deviceId).find((entry) => entry.key === paramKey);
    if (!param) return;
    replaceTarget(macro, index, { ...previous, param: param.key, min: param.min, max: param.max });
  };
  const changeTargetRange = (macro: RackMacro, index: number, key: 'min' | 'max', raw: string) => {
    const previous = macro.targets[index];
    const param = macroParamsFor(previous.deviceId).find((entry) => entry.key === previous.param);
    const value = Number(raw);
    if (!param || !Number.isFinite(value)) return;
    replaceTarget(macro, index, { ...previous, [key]: Math.max(param.min, Math.min(param.max, value)) });
  };
  const addMacro = () => {
    if (!selectedNewParamDef || !selectedNewDeviceId) return;
    const macro = engine.addRackMacro(group.id, {
      label: newMacroLabel || `Macro ${group.macros.length + 1}`,
      targets: [{ deviceId: selectedNewDeviceId, param: selectedNewParamDef.key, min: selectedNewParamDef.min, max: selectedNewParamDef.max }],
    });
    if (!macro) return;
    setNewMacroLabel('');
    setNewMacroTarget({ deviceId: selectedNewDeviceId, param: selectedNewParamDef.key });
    onUpdate();
  };

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
          {face === 'front' && (
            <button
              type="button"
              className={`combinator-btn ${macroEditorOpen ? 'combinator-btn--active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setMacroEditorOpen((open) => !open);
              }}
              aria-expanded={macroEditorOpen}
              aria-controls={`combiner-macros-${group.id}`}
              aria-label={`Edit macros for ${group.name}`}
              title="Create, map and rename the front-panel macro knobs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Macros
            </button>
          )}
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
      {face === 'front' && macroEditorOpen && (
        <section
          id={`combiner-macros-${group.id}`}
          className="mx-2 mb-2 rounded border border-amber-400/35 bg-black/35 p-2 text-[11px]"
          role="region"
          aria-label={`Macro mappings for ${group.name}`}
          data-testid="combiner-macro-editor"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-100">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Macro mappings
            <span className="ml-auto normal-case font-normal text-neutral-300">Knobs interpolate numeric device controls.</span>
          </div>
          {group.macros.map((macro) => (
            <div key={macro.id} className="mb-2 rounded border border-white/10 bg-black/25 p-1.5">
              <div className="mb-1 flex items-center gap-1.5">
                <label className="flex min-w-0 flex-1 items-center gap-1">
                  <span className="shrink-0 text-neutral-300">Name</span>
                  <input
                    key={`${macro.id}:${macro.label}`}
                    defaultValue={macro.label}
                    maxLength={48}
                    aria-label={`${macro.label} macro name`}
                    className="min-w-0 flex-1 rounded border border-white/20 bg-black/45 px-1 py-0.5 text-[11px] text-white"
                    onBlur={(event) => updateMacro(macro, { label: event.currentTarget.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="rounded border border-red-400/40 px-1 py-0.5 text-red-200 hover:bg-red-950/60"
                  onClick={() => {
                    if (engine.removeRackMacro(group.id, macro.id)) onUpdate();
                  }}
                  aria-label={`Delete ${macro.label} macro`}
                  title="Delete macro"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {macro.targets.map((target, index) => {
                const params = macroParamsFor(target.deviceId);
                const targetParam = params.find((param) => param.key === target.param);
                return (
                  <div key={`${target.deviceId}:${target.param}:${index}`} className="mb-1 grid grid-cols-[minmax(96px,1fr)_minmax(96px,1fr)_58px_58px_20px] items-center gap-1">
                    <select
                      value={target.deviceId}
                      aria-label={`${macro.label} target ${index + 1} device`}
                      className="rounded border border-white/20 bg-black/45 px-1 py-0.5 text-[11px] text-white"
                      onChange={(event) => changeTargetDevice(macro, index, event.target.value)}
                    >
                      {members.filter((device) => macroParamsFor(device.id).length).map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                    </select>
                    <select
                      value={target.param}
                      aria-label={`${macro.label} target ${index + 1} parameter`}
                      className="rounded border border-white/20 bg-black/45 px-1 py-0.5 text-[11px] text-white"
                      onChange={(event) => changeTargetParam(macro, index, event.target.value)}
                    >
                      {params.map((param) => <option key={param.key} value={param.key}>{param.label}</option>)}
                    </select>
                    <input
                      key={`${macro.id}:${index}:${target.deviceId}:${target.param}:min`}
                      type="number"
                      defaultValue={target.min}
                      min={targetParam?.min}
                      max={targetParam?.max}
                      step={targetParam?.step ?? 'any'}
                      aria-label={`${macro.label} target ${index + 1} minimum`}
                      title="Macro value at 0% (use a larger minimum than maximum to invert)"
                      className="rounded border border-white/20 bg-black/45 px-1 py-0.5 text-[11px] text-white"
                      onBlur={(event) => changeTargetRange(macro, index, 'min', event.currentTarget.value)}
                    />
                    <input
                      key={`${macro.id}:${index}:${target.deviceId}:${target.param}:max`}
                      type="number"
                      defaultValue={target.max}
                      min={targetParam?.min}
                      max={targetParam?.max}
                      step={targetParam?.step ?? 'any'}
                      aria-label={`${macro.label} target ${index + 1} maximum`}
                      title="Macro value at 100% (use a smaller maximum than minimum to invert)"
                      className="rounded border border-white/20 bg-black/45 px-1 py-0.5 text-[11px] text-white"
                      onBlur={(event) => changeTargetRange(macro, index, 'max', event.currentTarget.value)}
                    />
                    <button
                      type="button"
                      className="rounded border border-white/20 p-0.5 text-neutral-300 hover:bg-white/10"
                      aria-label={`Remove ${macro.label} target ${index + 1}`}
                      title="Remove target"
                      onClick={() => updateMacro(macro, { targets: macro.targets.filter((_, targetIndex) => targetIndex !== index) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="rounded border border-white/20 px-1 py-0.5 text-[11px] text-neutral-100 hover:bg-white/10 disabled:opacity-40"
                onClick={() => addTarget(macro)}
                disabled={!firstMapping}
              >
                <Plus className="mr-0.5 inline h-3 w-3" /> Add target
              </button>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(80px,1fr)_minmax(96px,1fr)_minmax(96px,1fr)_auto] items-center gap-1 border-t border-white/10 pt-1.5">
            <input
              data-testid="combiner-new-macro-label"
              value={newMacroLabel}
              maxLength={48}
              placeholder={`Macro ${group.macros.length + 1}`}
              aria-label="New macro name"
              className="min-w-0 rounded border border-white/20 bg-black/45 px-1 py-0.5 text-[11px] text-white placeholder:text-neutral-500"
              onChange={(event) => setNewMacroLabel(event.target.value)}
            />
            <select
              data-testid="combiner-new-macro-device"
              value={selectedNewDeviceId}
              aria-label="New macro target device"
              className="rounded border border-white/20 bg-black/45 px-1 py-0.5 text-[11px] text-white"
              onChange={(event) => setNewMacroTarget({ deviceId: event.target.value, param: '' })}
              disabled={!firstMapping}
            >
              {members.filter((device) => macroParamsFor(device.id).length).map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
            </select>
            <select
              data-testid="combiner-new-macro-param"
              value={selectedNewParam}
              aria-label="New macro target parameter"
              className="rounded border border-white/20 bg-black/45 px-1 py-0.5 text-[11px] text-white"
              onChange={(event) => setNewMacroTarget({ deviceId: selectedNewDeviceId, param: event.target.value })}
              disabled={!selectedNewParams.length}
            >
              {selectedNewParams.map((param) => <option key={param.key} value={param.key}>{param.label}</option>)}
            </select>
            <button
              type="button"
              data-testid="combiner-add-macro"
              className="rounded border border-emerald-400/50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-100 hover:bg-emerald-950/60 disabled:opacity-40"
              onClick={addMacro}
              disabled={!selectedNewParamDef || group.macros.length >= 8}
              title={group.macros.length >= 8 ? 'A Combiner has up to eight front-panel macros' : 'Add macro'}
            >
              <Plus className="mr-0.5 inline h-3 w-3" /> Add
            </button>
          </div>
        </section>
      )}
      <div className="combinator-body">{children}</div>
    </section>
  );
};
