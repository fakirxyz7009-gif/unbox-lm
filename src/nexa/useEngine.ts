import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { audioEngine } from '../audio/AudioEngine';

let version = 0;
let wired = false;
const subs = new Set<() => void>();

function wire() {
  if (wired) return;
  wired = true;
  audioEngine.subscribe(() => {
    version++;
    subs.forEach((s) => s());
  });
}

/** Re-renders only when the engine emits a structural event (not per frame). */
export function useEngineVersion(): number {
  wire();
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => version,
    () => version
  );
}

// ---- transport ticks: only components that show the playing step / bar subscribe ----
interface Tick {
  count: number;
  subs: Set<() => void>;
  wire: () => void;
}
function tick(register: (cb: () => void) => void): Tick {
  let wired = false;
  const t: Tick = {
    count: 0,
    subs: new Set(),
    wire: () => {
      if (wired) return;
      wired = true;
      register(() => {
        t.count++;
        t.subs.forEach((s) => s());
      });
    },
  };
  return t;
}
const steps = tick((cb) => audioEngine.onStep(cb));
const bars = tick((cb) => audioEngine.onBar(cb));

function useTick(t: Tick, enabled: boolean): number {
  t.wire();
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!enabled) return () => {};
      t.subs.add(cb);
      return () => {
        t.subs.delete(cb);
      };
    },
    [t, enabled]
  );
  return useSyncExternalStore(subscribe, () => (enabled ? t.count : 0), () => 0);
}

/**
 * Re-renders on every 16th while the transport plays (step lights, step readouts, automated
 * faders). `enabled = false` subscribes to nothing, so the hook can be called unconditionally.
 */
export function useStepTick(enabled = true): number {
  return useTick(steps, enabled);
}

/** Re-renders when the playing bar changes (readouts that change at most once per bar). */
export function useBarTick(enabled = true): number {
  return useTick(bars, enabled);
}

/** Knobs of this device follow its automation lanes while playing (re-render per 16th then). */
export function useDeviceAutomation(deviceId: string | undefined): void {
  const automated =
    !!deviceId &&
    audioEngine.isPlaying &&
    audioEngine.automation.lanes.some((l) => l.mode !== 'off' && l.points.length > 0 && l.target.kind === 'device' && l.target.deviceId === deviceId);
  useStepTick(automated);
}

/** Faders / pans of these channels follow their automation lanes while playing (re-render per 16th then). */
export function useChannelAutomation(channelIds: string | string[]): void {
  const ids = typeof channelIds === 'string' ? [channelIds] : channelIds;
  const automated =
    audioEngine.isPlaying &&
    audioEngine.automation.lanes.some((l) => l.mode !== 'off' && l.points.length > 0 && l.target.kind === 'channel' && ids.includes(l.target.channelId) && (l.target.param === 'volume' || l.target.param === 'pan'));
  useStepTick(automated);
}

// ---- one requestAnimationFrame loop for every meter, scope and readout ----
const frameSubs = new Set<{ current: (t: number) => void }>();
let frameId = 0;

function frame(t: number) {
  frameSubs.forEach((cb) => {
    try {
      cb.current(t);
    } catch (e) {
      console.error(e); // one broken meter must not stop the others
    }
  });
  frameId = frameSubs.size ? requestAnimationFrame(frame) : 0;
}

/** Runs a callback every animation frame without touching React state (one shared loop). */
export function useFrame(cb: (t: number) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    frameSubs.add(ref);
    if (!frameId) frameId = requestAnimationFrame(frame);
    return () => {
      frameSubs.delete(ref);
    };
  }, []);
}

// ---- shared ~30 Hz "meter frames" ----
let meterAt = -Infinity;
let decidedFor = -1;
let meterNow = false;

/**
 * True on the shared meter frames (~30 a second). Meters, scopes and readouts redraw only then:
 * it reads the same as 60, and because they all draw on the SAME frames, the frames in between
 * paint nothing at all, so Chrome skips paint, layerization and GPU work for them. Pass the frame
 * timestamp from requestAnimationFrame (identical for every callback of one frame).
 */
export function meterDue(t: number): boolean {
  if (t !== decidedFor) {
    decidedFor = t;
    meterNow = t - meterAt >= 30;
    if (meterNow) meterAt = t;
  }
  return meterNow;
}

/** `useFrame` on the shared meter frames (see `meterDue`). */
export function useMeterFrame(cb: (t: number) => void) {
  useFrame((t) => {
    if (meterDue(t)) cb(t);
  });
}
