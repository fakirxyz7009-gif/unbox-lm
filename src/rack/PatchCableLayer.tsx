/**
 * Rear-panel patch cables. Each cable is a verlet rope (cablePhysics.ts) drawn as SVG Bezier
 * segments. The simulation runs in requestAnimationFrame and writes SVG attributes directly —
 * React only renders the cable list — and the loop stops once every cable has settled.
 *
 * Patching (CableController):
 *   drag from a free jack ............ new cable
 *   drag from an occupied jack ....... move that plug (Shift: start an extra cable instead)
 *   drop on empty space .............. unplug
 *   click a jack ..................... pick the cable up; click a highlighted jack to place it
 *   Alt+click a jack ................. unplug every cable on it
 *   double-click a cable ............. unplug it
 *   Esc .............................. cancel (a moved cable goes back where it was)
 */
import React, { useEffect, useMemo, useRef } from 'react';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { AudioConnection, CVConnection } from '../audio/types.ts';
import { cableBias, createRope, endDirection, isSettled, refitRope, reverseRope, ropePath, stepRope, type Rope } from './cablePhysics.ts';
import type { JackRegistry, Point } from './jackRegistry.ts';
import {
  applyVerdict,
  cablesAt,
  canConnect,
  channelJack,
  displayTarget,
  jackKey,
  MASTER_ID,
  parseJackKey,
  resolveJack,
  restoreCable,
  unplug,
  type CableAtJack,
  type CableKind,
} from './patching.ts';

export type Notify = (message: string, type: 'success' | 'error' | 'info') => void;
/** show = all cables, focus = the selected unit's cables (others faded), hide = none. */
export type CableMode = 'show' | 'focus' | 'hide';

interface DragState {
  anchorKey: string;
  grabbedKey: string;
  pointer: Point;
  client: Point;
  start: Point;
  hoverKey: string | null;
  moved: boolean;
  clickMode: boolean;
  /** Cable picked up from an occupied jack; unplugged while it is carried. */
  carried: CableAtJack | null;
  unplugged: boolean;
  kind: CableKind;
  color: string;
}

const DRAG_THRESHOLD = 5;
const SNAP_RADIUS = 28;
const NEW_CABLE_COLORS: Record<CableKind, string[]> = {
  audio: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6'],
  cv: ['#eab308', '#06b6d4', '#a3e635', '#d946ef'],
};

export class CableController {
  drag: DragState | null = null;
  dragRope: Rope | null = null;
  /** Hands the dragged rope to the new connection so the cable doesn't jump when it lands. */
  dropped: { source: string; target: string; rope: Rope } | null = null;
  scrollEl: HTMLElement | null = null;
  autoScroll = 0;
  autoScrollX = 0;
  wake: () => void = () => {};
  private compatible = new Set<string>();
  private colorIndex = 0;

  constructor(private engine: AudioEngine, private registry: JackRegistry, private notify: Notify) {}

  readonly onJackPointerDown = (e: React.PointerEvent, key: string): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.drag?.clickMode) return this.finish(key);
    if (this.drag) return;
    if (e.altKey) return this.unplugAll(key);
    this.start(key, e.shiftKey, { x: e.clientX, y: e.clientY }, false);
  };

  readonly onJackKeyDown = (e: React.KeyboardEvent, key: string): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    if (this.drag?.clickMode) return this.finish(key);
    if (this.drag) return;
    const el = this.registry.element(key)?.getBoundingClientRect();
    this.start(key, e.shiftKey, el ? { x: el.left + el.width / 2, y: el.top + el.height / 2 } : { x: 0, y: 0 }, true);
  };

  /** Cables a press on `key` refers to (a channel row holds only the cables of its own strip). */
  private cablesFor(key: string): CableAtJack[] {
    const chan = channelJack(key);
    const all = cablesAt(this.engine, parseJackKey(key));
    return chan ? all.filter((c) => (c.conn as AudioConnection).stripId === chan.channelId) : all;
  }

  /** Where the far end of a cable is drawn (master cables end in their channel row). */
  private shownKey(c: CableAtJack): string {
    return c.other.deviceId === MASTER_ID ? displayTarget(c.conn, (k) => !!this.registry.get(k)) : jackKey(c.other);
  }

  /** A channel row only takes a cable from its own chain. */
  private channelVeto(a: string, b: string): string | null {
    for (const [row, other] of [
      [a, b],
      [b, a],
    ]) {
      const chan = channelJack(row);
      if (!chan) continue;
      if (this.engine.mixer.ownerOf(parseJackKey(other).deviceId) === chan.channelId) return null;
      const name = this.engine.mixer.settingsOf(chan.channelId)?.name ?? this.engine.devices.get(chan.channelId)?.name ?? 'This channel';
      return `${name} only takes cables from its own chain — plug into the Hardware Interface instead`;
    }
    return null;
  }

  /** Alt+click: pull every cable out of a jack. */
  unplugAll(key: string): void {
    const cables = this.cablesFor(key);
    cables.forEach((c) => unplug(this.engine, c.kind, c.id));
    if (cables.length) this.notify(`Unplugged ${cables.length} cable${cables.length > 1 ? 's' : ''}`, 'info');
  }

  cancel(): void {
    const d = this.drag;
    if (!d) return;
    if (d.carried && d.unplugged) restoreCable(this.engine, d.carried.kind, d.carried.conn);
    this.end();
    this.notify('Patch cancelled', 'info');
  }

  /** Re-derive the pointer in rack coordinates after the rack scrolled under it. */
  refreshPointer(): void {
    const d = this.drag;
    if (!d) return;
    d.pointer = this.registry.toLocal(d.client.x, d.client.y);
    this.updateHover();
  }

  dispose(): void {
    if (this.drag) this.end();
  }

  /** React re-rendered jacks (a carried cable was unplugged): their classes were reset, so mark them again. */
  refreshHighlight(): void {
    const d = this.drag;
    if (!d || !this.dragRope) return;
    this.highlight(true);
    if (d.hoverKey) this.registry.element(d.hoverKey)?.classList.add('rack-jack--hover');
  }

  private start(key: string, extraCable: boolean, client: Point, keyboard: boolean): void {
    const ref = parseJackKey(key);
    const jack = resolveJack(this.engine, ref);
    if (!jack) return;
    const cables = this.cablesFor(key);
    const carried = cables.length && !extraCable ? cables[cables.length - 1] : null;
    const kind: CableKind = jack.port.type.startsWith('cv') ? 'cv' : 'audio';
    const palette = NEW_CABLE_COLORS[kind];
    this.drag = {
      anchorKey: carried ? this.shownKey(carried) : key,
      grabbedKey: key,
      pointer: this.registry.toLocal(client.x, client.y),
      client,
      start: client,
      hoverKey: null,
      moved: keyboard,
      clickMode: keyboard,
      carried,
      unplugged: false,
      kind,
      color: carried?.color ?? palette[this.colorIndex++ % palette.length],
    };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKey, true);
    if (keyboard) this.pickUp();
  }

  /** The cable is now in hand: unplug a carried cable and highlight where it can go. */
  private pickUp(): void {
    const d = this.drag;
    if (!d) return;
    if (d.carried && !d.unplugged) {
      unplug(this.engine, d.carried.kind, d.carried.id);
      d.unplugged = true;
    }
    const a = this.registry.get(d.anchorKey) ?? d.pointer;
    this.dragRope = createRope(a.x, a.y, d.pointer.x, d.pointer.y);
    this.highlight(true);
    this.updateHover();
    if (d.clickMode) {
      window.addEventListener('pointerdown', this.onWindowDown);
      this.notify('Cable in hand — click a green jack to plug it in (Esc cancels)', 'info');
    }
    this.wake();
  }

  private readonly onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    d.client = { x: e.clientX, y: e.clientY };
    d.pointer = this.registry.toLocal(e.clientX, e.clientY);
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < DRAG_THRESHOLD) return;
      d.moved = true;
      this.pickUp();
    }
    this.updateHover();
    this.updateAutoScroll();
    this.wake();
  };

  private readonly onUp = (): void => {
    const d = this.drag;
    if (!d || d.clickMode) return;
    if (!d.moved) {
      d.moved = true;
      d.clickMode = true;
      this.pickUp();
      return;
    }
    this.finish(d.hoverKey);
  };

  private readonly onPointerCancel = (): void => this.cancel();

  private readonly onWindowDown = (): void => {
    if (this.drag?.clickMode) this.finish(null);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.drag) {
      e.preventDefault();
      e.stopPropagation();
      this.cancel();
    }
  };

  private finish(targetKey: string | null): void {
    const d = this.drag;
    if (!d) return;
    let message: [string, 'success' | 'error' | 'info'] | null = null;
    if (targetKey && targetKey !== d.anchorKey) {
      const veto = this.channelVeto(d.anchorKey, targetKey);
      const v = veto ? ({ ok: false, reason: veto } as const) : canConnect(this.engine, parseJackKey(d.anchorKey), parseJackKey(targetKey));
      if (v.ok) {
        if (this.dragRope) {
          const forward = jackKey(v.source) === d.anchorKey;
          this.dropped = { source: jackKey(v.source), target: jackKey(v.target), rope: forward ? this.dragRope : reverseRope(this.dragRope) };
        }
        const amount = d.carried?.kind === 'cv' ? (d.carried.conn as CVConnection).amount : 1;
        const id = applyVerdict(this.engine, v, d.color, amount);
        message = id
          ? [`${v.source.deviceName} · ${v.source.port.name} → ${v.target.deviceName} · ${v.target.port.name}${v.replaces.length ? ' (replaced a cable)' : ''}`, 'success']
          : ['That connection failed', 'error'];
      } else {
        message = [d.carried && d.unplugged ? `${v.reason} — cable unplugged` : v.reason, 'error'];
      }
    } else if (d.carried && d.unplugged) {
      message = ['Cable unplugged', 'info'];
    }
    this.end();
    if (message) this.notify(...message);
  }

  private end(): void {
    this.highlight(false);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('pointerdown', this.onWindowDown);
    window.removeEventListener('keydown', this.onKey, true);
    this.drag = null;
    this.dragRope = null;
    this.autoScroll = 0;
    this.autoScrollX = 0;
    this.wake();
  }

  private highlight(on: boolean): void {
    const d = this.drag;
    this.compatible.clear();
    for (const key of this.registry.keys()) {
      const el = this.registry.element(key);
      if (!el) continue;
      el.classList.remove('rack-jack--ok', 'rack-jack--no', 'rack-jack--anchor', 'rack-jack--hover');
      if (el.dataset.title !== undefined) {
        el.title = el.dataset.title;
        delete el.dataset.title;
      }
      if (!on || !d) continue;
      if (key === d.anchorKey) {
        el.classList.add('rack-jack--anchor');
        continue;
      }
      const veto = this.channelVeto(d.anchorKey, key);
      const v = veto ? ({ ok: false, reason: veto } as const) : canConnect(this.engine, parseJackKey(d.anchorKey), parseJackKey(key));
      el.dataset.title = el.title;
      if (v.ok) {
        this.compatible.add(key);
        el.classList.add('rack-jack--ok');
        el.title = v.replaces.length ? 'Plug in here (replaces the cable in this jack)' : 'Plug in here';
      } else {
        el.classList.add('rack-jack--no');
        el.title = v.reason;
      }
    }
  }

  private updateHover(): void {
    const d = this.drag;
    if (!d) return;
    const prev = d.hoverKey;
    d.hoverKey = this.registry.nearest(d.pointer, SNAP_RADIUS, (k) => this.compatible.has(k));
    if (prev !== d.hoverKey) {
      if (prev) this.registry.element(prev)?.classList.remove('rack-jack--hover');
      if (d.hoverKey) this.registry.element(d.hoverKey)?.classList.add('rack-jack--hover');
    }
  }

  private updateAutoScroll(): void {
    const d = this.drag;
    const box = this.scrollEl?.getBoundingClientRect();
    if (!d || !box) return;
    // Never scroll a jack out from under the pointer while the plug is snapped to it.
    if (d.hoverKey) {
      this.autoScroll = 0;
      this.autoScrollX = 0;
      return;
    }
    const edge = 44;
    const speed = (overshoot: number) => Math.min(40, Math.ceil(overshoot / 4)); // px per frame
    const along = (p: number, lo: number, hi: number) => (p < lo + edge ? -speed(lo + edge - p) : p > hi - edge ? speed(p - (hi - edge)) : 0);
    this.autoScroll = along(d.client.y, box.top, box.bottom);
    this.autoScrollX = along(d.client.x, box.left, box.right);
  }
}

// ---------------------------------------------------------------------------------------------

interface CableEls {
  g: SVGGElement;
  paths: SVGPathElement[];
  sleeves: SVGPathElement[];
  plugs: SVGCircleElement[];
}

function collect(g: SVGGElement): CableEls {
  return {
    g,
    paths: Array.from(g.querySelectorAll<SVGPathElement>('.cable-hit, .cable-shadow, .cable-body, .cable-shine')),
    sleeves: Array.from(g.querySelectorAll<SVGPathElement>('.cable-sleeve')),
    plugs: Array.from(g.querySelectorAll<SVGCircleElement>('.cable-plug')),
  };
}

function draw(el: CableEls, rope: Rope): void {
  const d = ropePath(rope);
  el.paths.forEach((p) => p.setAttribute('d', d));
  ([0, 1] as const).forEach((end) => {
    const i = end === 0 ? 0 : rope.n - 1;
    const x = rope.x[i];
    const y = rope.y[i];
    const { ux, uy } = endDirection(rope, end);
    el.plugs[end]?.setAttribute('cx', x.toFixed(1));
    el.plugs[end]?.setAttribute('cy', y.toFixed(1));
    el.sleeves[end]?.setAttribute('d', `M${x.toFixed(1)} ${y.toFixed(1)}L${(x + ux * 14).toFixed(1)} ${(y + uy * 14).toFixed(1)}`);
  });
}

interface Sim {
  rope: Rope;
  a: Point;
  b: Point;
}

interface PatchCableLayerProps {
  controller: CableController;
  registry: JackRegistry;
  audioConnections: AudioConnection[];
  cvConnections: CVConnection[];
  /** Rear panel visible and not mid-flip. */
  active: boolean;
  mode: CableMode;
  /** The unit whose cables stay bright in focus mode. */
  focusId: string | null;
  colorOf: (conn: AudioConnection | CVConnection, kind: CableKind) => string;
  describe: (conn: AudioConnection | CVConnection) => string;
  onUnplug: (kind: CableKind, id: string) => void;
}

function CableShape({ kind }: { kind: CableKind | 'drag' }) {
  const r = kind === 'cv' ? 5.5 : 7;
  return (
    <>
      <path className="cable-hit" />
      <path className="cable-shadow" />
      <path className="cable-body" />
      <path className="cable-shine" />
      <path className="cable-sleeve" />
      <path className="cable-sleeve" />
      <circle className="cable-plug" r={r} />
      <circle className="cable-plug" r={r} />
    </>
  );
}

export const PatchCableLayer: React.FC<PatchCableLayerProps> = ({
  controller,
  registry,
  audioConnections,
  cvConnections,
  active,
  mode,
  focusId,
  colorOf,
  describe,
  onUnplug,
}) => {
  const cables = useMemo(
    () => [
      ...audioConnections.map((c) => ({ c, kind: 'audio' as const })),
      ...cvConnections.map((c) => ({ c, kind: 'cv' as const })),
    ],
    [audioConnections, cvConnections]
  );
  const cablesRef = useRef(cables);
  cablesRef.current = cables;
  const els = useRef(new Map<string, CableEls>());
  const refCallbacks = useRef(new Map<string, (g: SVGGElement | null) => void>());
  const sims = useRef(new Map<string, Sim>());
  const dragEls = useRef<CableEls | null>(null);

  const refFor = (id: string) => {
    let cb = refCallbacks.current.get(id);
    if (!cb) {
      cb = (g) => {
        if (g) els.current.set(id, collect(g));
        else {
          els.current.delete(id);
          refCallbacks.current.delete(id);
        }
      };
      refCallbacks.current.set(id, cb);
    }
    return cb;
  };

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let running = false;
    let last = 0;

    const frame = (now: number) => {
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000 || 1 / 60));
      last = now;
      let busy = false;

      if (controller.drag && (controller.autoScroll || controller.autoScrollX) && controller.scrollEl) {
        controller.scrollEl.scrollTop += controller.autoScroll;
        controller.scrollEl.scrollLeft += controller.autoScrollX;
        controller.refreshPointer();
        busy = true;
      }

      const live = new Set<string>();
      for (const { c } of cablesRef.current) {
        live.add(c.id);
        const el = els.current.get(c.id);
        const srcKey = `${c.sourceDeviceId}:${c.sourcePortId}`;
        const tgtKey = `${c.targetDeviceId}:${c.targetPortId}`;
        const a = registry.get(srcKey);
        const b = registry.get(displayTarget(c, (k) => !!registry.get(k)));
        if (!el) continue;
        if (!a || !b) {
          el.g.style.display = 'none';
          continue;
        }
        el.g.style.display = '';
        let sim = sims.current.get(c.id);
        if (!sim) {
          const handoff = controller.dropped;
          const rope = handoff && handoff.source === srcKey && handoff.target === tgtKey ? handoff.rope : createRope(a.x, a.y, b.x, b.y);
          if (handoff?.rope === rope) controller.dropped = null;
          rope.bias = cableBias(c.id);
          refitRope(rope, a.x, a.y, b.x, b.y);
          sim = { rope, a: { ...a }, b: { ...b } };
          sims.current.set(c.id, sim);
        } else if (Math.abs(sim.a.x - a.x) + Math.abs(sim.a.y - a.y) + Math.abs(sim.b.x - b.x) + Math.abs(sim.b.y - b.y) > 0.5) {
          refitRope(sim.rope, a.x, a.y, b.x, b.y);
          sim.a = { ...a };
          sim.b = { ...b };
        }
        if (!isSettled(sim.rope)) {
          stepRope(sim.rope, a.x, a.y, b.x, b.y, dt);
          draw(el, sim.rope);
          busy = true;
        }
      }
      sims.current.forEach((_, id) => {
        if (!live.has(id)) sims.current.delete(id);
      });

      const d = controller.drag;
      const dragEl = dragEls.current;
      if (dragEl) {
        if (d && controller.dragRope) {
          const a = registry.get(d.anchorKey) ?? d.pointer;
          const end = (d.hoverKey && registry.get(d.hoverKey)) || d.pointer;
          refitRope(controller.dragRope, a.x, a.y, end.x, end.y);
          stepRope(controller.dragRope, a.x, a.y, end.x, end.y, dt);
          dragEl.g.style.display = '';
          dragEl.g.style.setProperty('--cable', d.color);
          dragEl.g.classList.toggle('cable--cv', d.kind === 'cv');
          draw(dragEl, controller.dragRope);
          busy = true;
        } else dragEl.g.style.display = 'none';
      }

      if (busy) raf = requestAnimationFrame(frame);
      else running = false;
    };

    const wake = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    controller.wake = wake;
    // Layout changed (flip, resize, units added): cables re-fit and fall again.
    const off = registry.onChange(() => {
      sims.current.forEach((s) => (s.rope.calm = 0));
      wake();
    });
    registry.invalidate();
    wake();
    return () => {
      cancelAnimationFrame(raf);
      running = false;
      off();
      controller.wake = () => {};
    };
  }, [active, controller, registry]);

  useEffect(() => {
    controller.refreshHighlight();
    controller.wake();
  }, [cables, controller]);

  if (!active) return null;

  const onCablePointerDown = (e: React.PointerEvent) => {
    // Plugs sit on top of their jacks: a press near a jack grabs the plug, not the cable.
    const p = registry.toLocal(e.clientX, e.clientY);
    const jack = registry.nearest(p, 16, () => true);
    if (jack) controller.onJackPointerDown(e, jack);
  };

  return (
    <svg className={`patch-cables patch-cables--${mode}`} role="presentation">
      {cables.map(({ c, kind }) => (
        <g
          key={c.id}
          ref={refFor(c.id)}
          className={`cable cable--${kind} ${focusId && c.sourceDeviceId !== focusId && c.targetDeviceId !== focusId ? 'cable--faded' : ''}`}
          style={{ ['--cable' as string]: colorOf(c, kind) } as React.CSSProperties}
          onPointerDown={onCablePointerDown}
          onDoubleClick={() => onUnplug(kind, c.id)}
        >
          <title>{`${describe(c)} — double-click to unplug`}</title>
          <CableShape kind={kind} />
        </g>
      ))}
      <g
        ref={(g) => {
          dragEls.current = g ? collect(g) : null;
        }}
        className="cable cable--drag"
        style={{ display: 'none' }}
      >
        <CableShape kind="drag" />
      </g>
    </svg>
  );
};
