/**
 * Hip-Hop kits probe: every generated bank must have its 125 pads and render audio, and the page's
 * WALK must keep time. Step spacing is measured from the AudioContext times the page schedules, so a
 * busy or hidden page cannot fake it the way a wall-clock measurement would.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { hiphopAudition } from '../../src/audio/hiphopAudition.ts';
import { KitAudition } from '../../src/audio/kitAudition.ts';
import { HipHopPage } from '../../src/studio/pages/HipHopPage.tsx';
import type { DeviceType } from '../../src/audio/types.ts';
import { DEVICE_SPECS, SPEC_BY_TYPE } from '../../shared/rack/devices/index.ts';

const resultNode = document.querySelector<HTMLPreElement>('#result');
if (!resultNode) throw new Error('Missing #result');
const result: HTMLPreElement = resultNode;

const report = (status: 'passed' | 'failed', text: string): void => {
  result.dataset.status = status;
  result.textContent = text;
};

const KITS = DEVICE_SPECS.filter((spec) => spec.type.startsWith('rec_hiphop')).map((spec) => spec.type);
const PADS_PER_KIT = 125;

/** Peak of a rendered three-pad chord through the real multisample engine. */
async function kitPeak(type: string): Promise<number> {
  const ctx = new OfflineAudioContext(2, 48000 * 1.5, 48000);
  const device = audioEngine.createDeviceOnContext(ctx, type as DeviceType, `probe_${type}`, 'Hip-Hop probe');
  device.isPowered = true;
  const left = device.audioOutputs.get('out_l');
  const right = device.audioOutputs.get('out_r');
  if (!left || !right) throw new Error(`${type} has no stereo output`);
  left.connect(ctx.destination);
  right.connect(ctx.destination);
  await device.ready?.();
  const lanes = SPEC_BY_TYPE.get(type)?.pads ?? [];
  const notes = [lanes[0]?.note ?? 0, lanes[Math.floor(lanes.length / 2)]?.note ?? 62, lanes[lanes.length - 1]?.note ?? 124];
  for (const note of notes) device.noteOn(note, 0.9, 0);
  const buffer = await ctx.startRendering();
  let peak = 0;
  for (const channel of [buffer.getChannelData(0), buffer.getChannelData(1)]) {
    for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i]));
  }
  device.dispose();
  return peak;
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function run(): Promise<void> {
  await audioEngine.resumeContext();
  if (KITS.length !== 8) throw new Error(`expected 8 hip-hop banks, found ${KITS.length}`);
  for (const type of KITS) {
    const lanes = SPEC_BY_TYPE.get(type)?.pads ?? [];
    if (lanes.length !== PADS_PER_KIT) throw new Error(`${type} has ${lanes.length} pads, expected ${PADS_PER_KIT}`);
  }

  const peaks: { type: string; peak: number }[] = [];
  for (const type of KITS) peaks.push({ type, peak: await kitPeak(type) });
  const silent = peaks.filter((entry) => entry.peak < 0.01);
  if (silent.length) throw new Error(`silent hip-hop banks: ${silent.map((entry) => `${entry.type}=${entry.peak.toFixed(4)}`).join(', ')}`);

  // Walk timing: mount the page, record the times it schedules, and compare them with the tempo.
  hiphopAudition.update({ kit: 'rec_hiphop_kicks', pace: '1/8', pad: 0 });
  const taps: { note: number; time: number | undefined }[] = [];
  const originalTap = KitAudition.prototype.tap;
  KitAudition.prototype.tap = function patchedTap(note, velocity, time) {
    taps.push({ note, time });
    return originalTap.call(this, note, velocity, time);
  };

  const host = document.querySelector<HTMLDivElement>('#page');
  if (!host) throw new Error('Missing #page host');
  const root = createRoot(host);
  try {
    root.render(React.createElement(HipHopPage));
    await waitFor(() => /Kit ready/.test(host.textContent ?? ''), 60_000, 'the first kit to load');

    const walk = [...host.querySelectorAll('button')].find((button) => /WALK KIT/.test(button.textContent ?? ''));
    if (!walk) throw new Error('the page has no WALK button');
    taps.length = 0;
    walk.click();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const stop = [...host.querySelectorAll('button')].find((button) => /STOP WALK/.test(button.textContent ?? ''));
    if (!stop) throw new Error('the walk did not switch to STOP WALK');
    stop.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
  } finally {
    root.unmount();
    KitAudition.prototype.tap = originalTap;
  }

  const walked = taps.filter((entry) => entry.time !== undefined);
  const timeline = walked.map((entry) => entry.time as number);
  if (timeline.length < 5) throw new Error(`the walk scheduled ${timeline.length} steps in ~1.8 s`);
  const step = (60 / audioEngine.bpm) * 0.5;
  const gaps = timeline.slice(1).map((time, index) => time - timeline[index]);
  const worst = gaps.reduce((max, gap) => Math.max(max, Math.abs(gap - step)), 0);
  if (worst > 0.01) throw new Error(`walk steps are not ${step.toFixed(4)} s apart (worst error ${worst.toFixed(4)} s)`);
  for (let index = 1; index < walked.length; index++) {
    const previous = walked[index - 1].note;
    const expected = (previous + 1) % PADS_PER_KIT;
    if (walked[index].note !== expected) throw new Error(`walk skipped a pad at step ${index}: ${previous} → ${walked[index].note} (expected ${expected})`);
  }
  if (audioEngine.isPlaying) throw new Error('the walk started the transport');

  const peakText = peaks.map((entry) => `${entry.type.replace('rec_hiphop_', '')} ${entry.peak.toFixed(3)}`).join(', ');
  report(
    'passed',
    `PASS · 8 banks × ${PADS_PER_KIT} pads; rendered peaks ${peakText}; walk scheduled ${gaps.length + 1} pads ${step.toFixed(4)} s apart ` +
      `(worst error ${(worst * 1000).toFixed(1)} ms), pads in order, transport untouched.`,
  );
}

void run().catch((error: unknown) => {
  report('failed', `FAIL · ${error instanceof Error ? error.message : String(error)}`);
});
