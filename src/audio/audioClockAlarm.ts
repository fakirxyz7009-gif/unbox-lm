/**
 * Resolves after a point on the AudioContext timeline.  The silent source is
 * intentionally part of the graph: unlike a JavaScript timer it remains tied
 * to the audio render clock when the UI thread is busy or throttled.
 *
 * `onended` is a control notification, not the timing mechanism for audio;
 * callers must schedule their audible work separately.  It is useful for
 * changing JavaScript transport state after an already-scheduled boundary.
 */
export function waitForAudioTime(ctx: AudioContext, requestedTime: number): Promise<void> {
  const now = ctx.currentTime;
  const time = Math.max(now + 0.001, Number.isFinite(requestedTime) ? requestedTime : now + 0.001);

  return new Promise((resolve) => {
    let finished = false;
    const alarm = ctx.createConstantSource();
    const silence = ctx.createGain();
    silence.gain.value = 0;
    alarm.connect(silence).connect(ctx.destination);

    const finish = () => {
      if (finished) return;
      finished = true;
      alarm.onended = null;
      try { alarm.disconnect(); } catch {}
      try { silence.disconnect(); } catch {}
      resolve();
    };

    alarm.onended = finish;
    try {
      alarm.start();
      alarm.stop(time);
    } catch {
      // A closed context cannot produce an audio-clock callback. Resolve rather
      // than leave a caller's teardown permanently pending.
      finish();
    }
  });
}
