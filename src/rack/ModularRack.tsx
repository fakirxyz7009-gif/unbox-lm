/**
 * 3-column modular rack. Left: send returns with their effects, free effects, modulators,
 * utilities and effect Combiners. Middle: the Hardware Interface (master bus) and every
 * instrument with its players and inserts. Right: the mixer channel list, then group buses
 * (defaults in rackColumns.ts). Units can be dragged between columns and folded; the
 * layout is saved with the project (rackLayout.ts). Tab flips the whole rack to the rear patch
 * bay, where every cable is a real connection in the audio graph. All columns share one scroll
 * container, so cables are measured and drawn in one coordinate space.
 */
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Cable, Eye, EyeOff, FlipHorizontal2, FoldVertical, LayoutGrid, Library, Loader2, Palette, Plug, Sparkles, UnfoldVertical, Wand2, X } from 'lucide-react';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import type { AudioConnection, CVConnection, DeviceType, RackGroup } from '../audio/types.ts';
import { Knob } from '../components/Knob.tsx';
import { useEngineVersion, useFrame } from '../nexa/useEngine.ts';
import { applyRackPlan, requestRackPlan } from '../ai/rackCombinator.ts';
import { vstLibrary } from '../vst/libraryClient.ts';
import { snapshotFromItem } from '../vst/VstPluginDevice.ts';
import type { MountableItem } from '../../shared/vst/manifestTypes.ts';
import { getUi, setUi, useUi } from '../shell/uiStore.ts';
import { CombinatorFrame } from './CombinatorFrame.tsx';
import { JackRegistry } from './jackRegistry.ts';
import { LibraryBrowser } from './LibraryBrowser.tsx';
import { CableController, PatchCableLayer, type CableMode, type Notify } from './PatchCableLayer.tsx';
import { channelJackKey, MASTER_ID, MASTER_PORTS, unplug, type CableKind } from './patching.ts';
import { RackUnitFrame, type RackFace, type RackUnitActions } from './RackUnitFrame.tsx';
import { RearPanel } from './RearPanel.tsx';
import { RackChannelList } from './RackChannelList.tsx';
import { RackColumnView } from './RackColumnView.tsx';
import { RackNavigator } from './RackNavigator.tsx';
import { COLUMN_LABELS, orderAt, rackColumns, type RackItem } from './rackColumns.ts';
import { isFolded, moveUnit, resetLayout, setFolded, useRackLayoutVersion, type RackCol } from './rackLayout.ts';
import { SpecDevice } from '../audio/spec/SpecDevice.ts';
import { setWidth } from '../ui/skin/dom.ts';

interface ModularRackProps {
  engine: AudioEngine;
  devices: BaseDevice[];
  audioConnections: AudioConnection[];
  cvConnections: CVConnection[];
  rackGroups: RackGroup[];
  face: RackFace;
  onSetFace: (face: RackFace) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMessage: Notify;
}

const EXAMPLES = [
  'Dark cinematic strings with lush reverb',
  'Moody felt piano with slow evolving movement',
  'Vocal chain: autotune, EQ, compression and loudness',
  'Aggressive acid bass with distortion and delay',
  'Mastering chain for a loud club track',
  'Acoustic folk guitar, warm and intimate',
];

/** Cable colours by meaning (the "by type" colour mode). */
const TYPE_COLORS = { master: '#e5484d', chain: '#22c55e', sidechain: '#f59e0b', cv: '#eab308', group: '#3b82f6' } as const;
const CABLE_MODES: CableMode[] = ['show', 'focus', 'hide'];
const CABLE_MODE_LABEL: Record<CableMode, string> = { show: 'all', focus: 'selected', hide: 'hidden' };

function MasterMeter({ engine }: { engine: AudioEngine }) {
  const l = useRef<HTMLDivElement>(null);
  const r = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const t = engine.telemetry;
    setWidth(l.current, t.peakL * 100);
    setWidth(r.current, t.peakR * 100);
  });
  return (
    <div className="flex flex-col gap-1 w-36" aria-hidden="true">
      {[l, r].map((ref, i) => (
        <div key={i} className="h-1.5 rounded-full bg-black/70 overflow-hidden">
          <div ref={ref} className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500" style={{ width: '0%' }} />
        </div>
      ))}
    </div>
  );
}

export const ModularRack: React.FC<ModularRackProps> = ({
  engine,
  devices,
  audioConnections,
  cvConnections,
  rackGroups,
  face,
  onSetFace,
  selectedId,
  onSelect,
  onMessage,
}) => {
  const engineVersion = useEngineVersion();
  const layoutVersion = useRackLayoutVersion();
  const [localTick, force] = useReducer((n: number) => n + 1, 0);
  const rev = engineVersion + localTick;
  const ui = useUi();

  const notifyRef = useRef(onMessage);
  notifyRef.current = onMessage;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const registry = useMemo(() => new JackRegistry(), []);
  const controller = useMemo(() => new CableController(engine, registry, (m, t) => notifyRef.current(m, t)), [engine, registry]);
  useEffect(
    () => () => {
      controller.dispose();
      registry.dispose();
    },
    [controller, registry]
  );

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const setContent = useCallback(
    (el: HTMLDivElement | null) => {
      registry.setContainer(el);
      setContentEl(el);
    },
    [registry]
  );
  const setScroller = useCallback(
    (el: HTMLDivElement | null) => {
      controller.scrollEl = el;
      setScrollEl(el);
    },
    [controller]
  );

  // ---- Flip animation: swap faces at the midpoint ----
  const [shownFace, setShownFace] = useState<RackFace>(face);
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');
  useEffect(() => {
    if (face === shownFace) {
      setPhase('idle');
      return;
    }
    controller.cancel();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShownFace(face);
      return;
    }
    setPhase('out');
    const swap = window.setTimeout(() => {
      setShownFace(face);
      setPhase('in');
    }, 160);
    const done = window.setTimeout(() => setPhase('idle'), 330);
    return () => {
      window.clearTimeout(swap);
      window.clearTimeout(done);
    };
  }, [face]);

  // ---- Cable display: K cycles all / selected unit / hidden (when letter keys are commands) ----
  const [cableMode, setCableMode] = useState<CableMode>('show');
  const cycleCables = () => setCableMode((m) => CABLE_MODES[(CABLE_MODES.indexOf(m) + 1) % CABLE_MODES.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || getUi().qwertyPiano) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      e.preventDefault();
      cycleCables();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Columns ----
  const columns = useMemo(() => rackColumns(engine, devices, rackGroups), [engine, devices, rackGroups, audioConnections, engineVersion, layoutVersion]);
  const colsRef = useRef<RackItem[][]>(columns);
  colsRef.current = columns;
  const unitCount = columns.reduce((n, c) => n + c.reduce((m, it) => m + (it.kind === 'group' ? it.members.length : 1), 0), 0);

  /** "+ Add device": the next unit mounted from the library goes into this column. */
  const [addTarget, setAddTarget] = useState<RackCol | null>(null);
  const placeNew = (id: string) => {
    if (addTarget === null) return;
    const column = colsRef.current[addTarget];
    const last = column[column.length - 1]?.order;
    moveUnit(id, addTarget, last === undefined ? 0 : last + 1);
    setAddTarget(null);
  };

  const scrollToUnit = (id: string) =>
    requestAnimationFrame(() => document.querySelector(`[data-unit-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }));

  // ---- AI Combiner ----
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; warnings: string[] } | null>(null);

  const buildFromPrompt = async (text = prompt) => {
    const request = text.trim();
    if (!request || busy) return;
    setBusy(true);
    setResult(null);
    try {
      if (!vstLibrary.manifest) await vstLibrary.load();
      const res = await requestRackPlan(request);
      if (!res.plan.units.length) {
        setResult({ ok: false, text: 'Nothing in the library or the built-in devices matched that request.', warnings: res.warnings });
        return;
      }
      const applied = applyRackPlan(engine, res.plan, { prompt: request, source: res.source, feedFrom: selectedId });
      if (applied.instrumentId) onSelect(applied.instrumentId);
      const by = res.source === 'gemini' ? `Gemini${res.model ? ` (${res.model})` : ''}` : res.source === 'local' ? 'the local planner' : 'the in-app planner (offline)';
      const fed = applied.fedFrom ? ` Fed from ${engine.devices.get(applied.fedFrom)?.name ?? 'the selected unit'}.` : '';
      const tempo = applied.bpmSet ? ` Tempo set to ${applied.bpmSet} BPM.` : '';
      setResult({
        ok: true,
        text: `Built “${res.plan.name}” with ${by}: ${applied.deviceIds.length} units, ${applied.audioCables} audio + ${applied.cvCables} CV cables.${fed}${tempo}`,
        warnings: [...res.warnings, ...applied.warnings],
      });
      onMessage(`Combiner “${res.plan.name}” mounted and patched — showing the rear panel`, 'success');
      onSetFace('rear');
      if (applied.deviceIds[0]) scrollToUnit(applied.deviceIds[0]);
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message, warnings: [] });
    } finally {
      setBusy(false);
    }
  };

  // ---- Mounting ----
  const mountItem = (item: MountableItem, presetId?: string) => {
    const target = selectedId && engine.devices.has(selectedId) ? selectedId : null;
    let inserted = false;
    const dev = engine.runStructuralEdit('Add device', () => {
      const mounted = engine.createVstDevice(snapshotFromItem(item, vstLibrary.manifest), { presetId });
      if (mounted.role === 'effect' && target) inserted = engine.insertEffectOnTrack(mounted.id, target);
      return mounted;
    });
    if (dev.role === 'effect') {
      onMessage(
        inserted ? `Inserted ${dev.name} after ${engine.devices.get(target as string)?.name}` : `Mounted ${dev.name} — patch its inputs on the rear panel (Tab)`,
        'success'
      );
    } else {
      onSelect(dev.id);
      onMessage(`Mounted ${dev.name}${presetId ? ` (${dev.currentPreset?.name})` : ''} — routed to the master bus`, 'success');
    }
    placeNew(dev.id);
    scrollToUnit(dev.id);
  };

  const mountBuiltin = (type: DeviceType, name: string) => {
    const selected = selectedId ? engine.devices.get(selectedId) : undefined;
    let inserted = false;
    const dev = engine.runStructuralEdit('Add device', () => {
      const mounted = engine.createDevice(type, name);
      if (mounted instanceof SpecDevice && mounted.spec.kind === 'player') {
        if (selected && engine.isPlayableInstrument(selected.type)) engine.setPlayerTarget(mounted.id, selected.id);
      } else if (!engine.isPlayableInstrument(type) && selected) {
        inserted = engine.insertEffectOnTrack(mounted.id, selected.id);
      }
      return mounted;
    });
    placeNew(dev.id);
    if (dev instanceof SpecDevice && dev.spec.kind === 'player') {
      // players sit on an instrument: the selected one, else the newest (set on creation)
      const target = dev.target ? engine.devices.get(dev.target) : undefined;
      onMessage(target ? `Added ${dev.name} — plays ${target.name}` : `Added ${dev.name} — choose the instrument it plays on its panel`, 'success');
      scrollToUnit(dev.id);
      return;
    }
    if (engine.isPlayableInstrument(type)) onSelect(dev.id);
    onMessage(
      !engine.isPlayableInstrument(type) && selected && !inserted
        ? `Added ${dev.name} — patch its inputs on the rear panel (Tab)`
        : `Added ${dev.name}`,
      'success'
    );
    scrollToUnit(dev.id);
  };

  // ---- Stable unit callbacks (units are memoised) ----
  const actions = useMemo<RackUnitActions>(
    () => ({
      select: (id) => selectRef.current(id),
      remove: (dev) => {
        engine.removeDevice(dev.id);
        if (selectedRef.current === dev.id) selectRef.current(null);
        notifyRef.current(`Removed ${dev.name}`, 'info');
      },
      toggleFold: (key, alt) => {
        const fold = !isFolded(key);
        const keysOf = (it: RackItem) => (it.kind === 'group' ? it.members.map((m) => m.id) : [it.key]);
        const column = alt ? colsRef.current.find((c) => c.some((it) => keysOf(it).includes(key))) : undefined;
        setFolded(column ? column.flatMap(keysOf) : [key], fold);
      },
      message: (m, t) => notifyRef.current(m, t),
    }),
    [engine]
  );

  // ---- Cables ----
  const groupOf = useMemo(() => {
    const map = new Map<string, string>();
    rackGroups.forEach((g) => g.deviceIds.forEach((id) => map.set(id, g.id)));
    return map;
  }, [rackGroups]);
  const colorOf = useCallback(
    (c: AudioConnection | CVConnection, kind: CableKind): string => {
      if (ui.cableColors === 'cable') return c.color;
      if (kind === 'cv') return TYPE_COLORS.cv;
      if (c.targetDeviceId === MASTER_ID) return TYPE_COLORS.master;
      if (c.targetPortId.startsWith('sc_')) return TYPE_COLORS.sidechain;
      const g = groupOf.get(c.sourceDeviceId);
      return g && g === groupOf.get(c.targetDeviceId) ? TYPE_COLORS.group : TYPE_COLORS.chain;
    },
    [ui.cableColors, groupOf]
  );

  /** jack key → plug colour. Master cables plug into their channel row (not the master jacks). */
  const plugged = useMemo(() => {
    const map = new Map<string, string>();
    audioConnections.forEach((c) => {
      const color = colorOf(c, 'audio');
      map.set(`${c.sourceDeviceId}:${c.sourcePortId}`, color);
      if (c.targetDeviceId !== MASTER_ID) map.set(`${c.targetDeviceId}:${c.targetPortId}`, color);
      else if (c.stripId) map.set(channelJackKey(c.stripId, c.targetPortId), color);
    });
    cvConnections.forEach((c) => {
      const color = colorOf(c, 'cv');
      map.set(`${c.sourceDeviceId}:${c.sourcePortId}`, color);
      map.set(`${c.targetDeviceId}:${c.targetPortId}`, color);
    });
    return map;
  }, [audioConnections, cvConnections, colorOf]);

  const describe = (c: AudioConnection | CVConnection) => {
    const name = (id: string) => (id === MASTER_ID ? 'Master' : engine.devices.get(id)?.name ?? id);
    return `${name(c.sourceDeviceId)} ${c.sourcePortId} → ${name(c.targetDeviceId)} ${c.targetPortId}`;
  };
  const onUnplug = (kind: CableKind, id: string) => {
    unplug(engine, kind, id);
    onMessage('Cable unplugged', 'info');
  };

  // ---- Rendering ----
  const navOf = (d: BaseDevice): 'instrument' | 'effect' | 'utility' =>
    engine.isPlayableInstrument(d.type) || engine.mixer.isOwner(d.id) ? 'instrument' : d.ports.some((p) => p.type === 'audio_in') ? 'effect' : 'utility';

  const unit = (dev: BaseDevice, dragKey?: string) => (
    <RackUnitFrame
      key={dev.id}
      device={dev}
      face={shownFace}
      selected={dev.id === selectedId}
      folded={isFolded(dev.id)}
      rev={rev}
      plugged={plugged}
      controller={controller}
      registry={registry}
      actions={actions}
      dragKey={dragKey}
      nav={navOf(dev)}
    />
  );

  const renderItem = (it: RackItem) =>
    it.kind === 'device' ? (
      unit(it.device, it.key)
    ) : (
      <CombinatorFrame
        key={it.key}
        engine={engine}
        group={it.group}
        face={shownFace}
        onUpdate={force}
        dragKey={it.key}
        folded={it.members.length > 0 && it.members.every((m) => isFolded(m.id))}
        onFold={(f) => setFolded(it.members.map((m) => m.id), f)}
      >
        {it.members.map((m) => unit(m))}
      </CombinatorFrame>
    );

  const dropUnit = (key: string, col: RackCol, index: number) => {
    moveUnit(key, col, orderAt(colsRef.current[col], index, key));
    const it = colsRef.current.flat().find((x) => x.key === key);
    const name = it ? (it.kind === 'group' ? it.group.name : it.device.name) : 'Unit';
    onMessage(`Moved ${name} to the ${COLUMN_LABELS[col]}`, 'info');
  };

  const allKeys = columns.flat().flatMap((it) => (it.kind === 'group' ? it.members.map((m) => m.id) : [it.key]));
  const allFolded = allKeys.length > 0 && allKeys.every(isFolded);
  const rearActive = shownFace === 'rear' && phase === 'idle';

  const hardwareInterface = (
    <section className="rack-unit rack-unit--hw" data-unit-id={MASTER_ID} data-nav="hw" aria-label="Hardware interface (master bus)">
      <div className="rack-ear rack-ear--left" aria-hidden="true">
        <div className="rack-screw" />
        <div className="rack-screw" />
      </div>
      {shownFace === 'front' ? (
        <div className="rack-face flex-1 min-w-0 flex items-center gap-3 px-3 py-2 hw-face">
          <div className="min-w-0">
            <div className="text-[11px] font-black tracking-[0.2em] uppercase">Hardware Interface</div>
            <div className="text-[11px] text-slate-400 truncate">Master bus → speakers · each chain plays through its own channel</div>
          </div>
          <MasterMeter engine={engine} />
          <Knob
            label="Master"
            value={engine.masterSpectrumState.mix}
            min={0}
            max={1}
            step={0.005}
            size="xs"
            variant="dark"
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => {
              engine.setMasterSpectrumParam('mix', v);
              force();
            }}
          />
          <span className="ml-auto text-[11px] font-mono text-slate-400 whitespace-nowrap">
            {unitCount} units · {audioConnections.length} audio · {cvConnections.length} CV
          </span>
        </div>
      ) : (
        <div className="rack-back flex-1 min-w-0">
          <RearPanel deviceId={MASTER_ID} deviceName="Hardware Interface" ports={MASTER_PORTS} controller={controller} registry={registry} plugged={plugged} serial="MASTER BUS" />
        </div>
      )}
      <div className="rack-ear rack-ear--right" aria-hidden="true">
        <div className="rack-screw" />
        <div className="rack-screw" />
      </div>
    </section>
  );

  const column = (col: RackCol, top?: React.ReactNode, empty?: React.ReactNode) => (
    <RackColumnView
      col={col}
      face={shownFace}
      top={top}
      onDropUnit={dropUnit}
      onAdd={(c) => {
        setAddTarget((cur) => (cur === c ? null : c));
        if (!ui.rackLibrary) setUi({ rackLibrary: true });
      }}
      addArmed={addTarget === col}
      label={COLUMN_LABELS[col]}
    >
      {columns[col].map(renderItem)}
      {columns[col].length === 0 && empty}
    </RackColumnView>
  );

  return (
    <div className="modular-rack h-full flex min-h-0">
      {ui.rackLibrary && <LibraryBrowser onMountItem={mountItem} onMountBuiltin={mountBuiltin} onMessage={onMessage} />}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="rack-toolbar">
          <button type="button" className="rack-tool" onClick={() => setUi({ rackLibrary: !ui.rackLibrary })} aria-pressed={ui.rackLibrary} title="Show / hide the library">
            <Library className="w-3.5 h-3.5" /> Library
          </button>
          <div className="rack-seg" role="group" aria-label="Rack side">
            {(['front', 'rear'] as RackFace[]).map((f) => (
              <button key={f} type="button" onClick={() => onSetFace(f)} aria-pressed={face === f}>
                {f === 'front' ? 'Front' : 'Rear'}
              </button>
            ))}
          </div>
          <span className="rack-hint">
            <FlipHorizontal2 className="w-3 h-3" /> Tab
          </span>
          <button
            type="button"
            className="rack-tool"
            onClick={cycleCables}
            title="Cables: all / only the selected unit's / hidden (K when the KEYS piano is off)"
          >
            {cableMode === 'hide' ? <EyeOff className="w-3.5 h-3.5" /> : cableMode === 'focus' ? <Cable className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            Cables: {CABLE_MODE_LABEL[cableMode]}
          </button>
          <button
            type="button"
            className="rack-tool"
            onClick={() => setUi({ cableColors: ui.cableColors === 'type' ? 'cable' : 'type' })}
            title={
              ui.cableColors === 'type'
                ? 'Colours by type: red = into a mixer channel, green = between units, orange = sidechain, yellow = CV, blue = inside a Combiner. Click for each cable’s own colour.'
                : 'Each cable keeps its own colour. Click to colour by type.'
            }
          >
            <Palette className="w-3.5 h-3.5" /> {ui.cableColors === 'type' ? 'By type' : 'Per cable'}
          </button>
          <button type="button" className="rack-tool" onClick={() => setFolded(allKeys, !allFolded)} title={allFolded ? 'Unfold every unit' : 'Fold every unit to a strip'} disabled={!allKeys.length}>
            {allFolded ? <UnfoldVertical className="w-3.5 h-3.5" /> : <FoldVertical className="w-3.5 h-3.5" />}
            {allFolded ? 'Unfold all' : 'Fold all'}
          </button>
          <button
            type="button"
            className="rack-tool"
            onClick={() => {
              resetLayout();
              onMessage('Every unit is back in its default column', 'info');
            }}
            title="Put every unit back in its default column and order (folds are kept)"
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Auto layout
          </button>
          <button
            type="button"
            className="rack-tool"
            onClick={() => {
              engine.autoPatchAllToMaster();
              onMessage('Patched every free output to the master bus', 'success');
            }}
            title="Connect every unpatched output to the master bus"
          >
            <Plug className="w-3.5 h-3.5" /> Auto-patch
          </button>
          {addTarget !== null && (
            <span className="rack-chip" role="status">
              Next unit → {COLUMN_LABELS[addTarget]}
              <button type="button" onClick={() => setAddTarget(null)} aria-label="Cancel adding to a column">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <form
            className="combinator-prompt"
            onSubmit={(e) => {
              e.preventDefault();
              void buildFromPrompt();
            }}
          >
            <Sparkles className="w-3.5 h-3.5 text-rose-300 shrink-0" />
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
              placeholder="AI Combiner — describe an instrument or effect setup…"
              aria-label="Describe an instrument or effect setup for the AI Combiner"
              list="combinator-examples"
              className="flex-1 min-w-0 bg-transparent outline-none text-[11px]"
            />
            <datalist id="combinator-examples">
              {EXAMPLES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            <button type="submit" disabled={busy || !prompt.trim()} className="combinator-go">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {busy ? 'Building…' : 'Build'}
            </button>
          </form>
        </div>

        {result && (
          <div className={`rack-result ${result.ok ? 'rack-result--ok' : 'rack-result--err'}`} role="status">
            <div className="flex items-start gap-2">
              <span className="flex-1">{result.text}</span>
              <button type="button" className="opacity-60 hover:opacity-100" onClick={() => setResult(null)} aria-label="Dismiss">
                ✕
              </button>
            </div>
            {result.warnings.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer opacity-80">{result.warnings.length} note{result.warnings.length > 1 ? 's' : ''}</summary>
                <ul className="list-disc ml-4 mt-0.5 space-y-0.5 opacity-90">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 flex">
          <div ref={setScroller} className="flex-1 min-w-0 overflow-auto rack-scroller" data-testid="rack-scroller">
            <div ref={setContent} className="rack-content">
              <div className={`rack-flip rack-flip--${phase} rack-grid`}>
                <div className="rack-rail us-wood" aria-hidden="true" />
                {column(0)}
                <div className="rack-rail us-wood" aria-hidden="true" />
                {column(
                  1,
                  hardwareInterface,
                  unitCount === 0 && (
                    <div className="rack-empty">The rack is empty. Click “Add device”, open the library, or describe an instrument or effect setup in the AI Combiner box above.</div>
                  )
                )}
                <div className="rack-rail us-wood" aria-hidden="true" />
                {column(
                  2,
                  <RackChannelList
                    engine={engine}
                    face={shownFace}
                    selectedId={selectedId}
                    onSelect={(id) => onSelect(id)}
                    onChanged={force}
                    controller={controller}
                    registry={registry}
                    plugged={plugged}
                  />
                )}
                <div className="rack-rail us-wood" aria-hidden="true" />
              </div>
              <PatchCableLayer
                controller={controller}
                registry={registry}
                audioConnections={audioConnections}
                cvConnections={cvConnections}
                active={rearActive}
                mode={cableMode}
                focusId={cableMode === 'focus' ? selectedId : null}
                colorOf={colorOf}
                describe={describe}
                onUnplug={onUnplug}
              />
            </div>
          </div>
          <RackNavigator scroller={scrollEl} content={contentEl} registry={registry} layoutKey={`${shownFace}:${layoutVersion}:${engineVersion}`} />
        </div>
      </div>
    </div>
  );
};
