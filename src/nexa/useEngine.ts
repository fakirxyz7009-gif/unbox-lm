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

// ---- transport steps: only components that show the playing step subscribe ----
let step = 0;
let stepWired = false;
const stepSubs = new Set<() => void>();

function wireStep() {
  if (stepWired) return;
  stepWired = true;
  audioEngine.onStep(() => {
    step++;
    stepSubs.forEach((s) => s());
  });
}

/**
 * Re-renders on every 16th while the transport plays (step lights, step readouts, automated
 * faders). `enabled = false` subscribes to nothing, so the hook can be called unconditionally.
 */
export function useStepTick(enabled = true): number {
  wireStep();
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!enabled) return () => {};
      stepSubs.add(cb);
      return () => {
        stepSubs.delete(cb);
      };
    },
    [enabled]
  );
  return useSyncExternalStore(subscribe, () => (enabled ? step : 0), () => 0);
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
