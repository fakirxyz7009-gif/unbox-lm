/**
 * Plucked string ('karplus'): one Karplus-Strong loop per note, run in an AudioWorklet (see
 * src/audio/spec/stringWorklet.ts). Decay sets how long a note rings, Bright the loop's averaging
 * (how much the top is damped), Pick the burst level that excites the string, Damp how fast a
 * released note stops, Tune detunes in cents.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { clamp, midiHz, seededRandom } from '../dsp.ts';
import { ensureStringWorklet } from '../stringWorklet.ts';
import { VoicePool, type VoiceBase } from './voices.ts';

const MAX_VOICES = 8;
const FADE_SECONDS = 0.005;

/** Loop gain for Decay 0..1: each pass keeps 98.5 % (short ring) to 99.95 % (long ring) of the wave. */
export function loopGainFor(decay: number): number {
  return 0.985 + 0.0145 * clamp(decay, 0, 1);
}

/** Seconds for a loop with per-pass gain `g` to fall 60 dB, capped at 20 s (a lossless loop hits the cap). */
export function ringSeconds(hz: number, g: number): number {
  const gain = Math.min(Math.max(g, 1e-6), 1 - 1e-9);
  return Math.min(20, -6.9 / (hz * Math.log(gain)));
}

interface StringVoice extends VoiceBase {
  node: AudioWorkletNode;
  dispose(): void;
}

export function karplusEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const out = host.outs[0];
  const pool = new VoicePool<StringVoice>(MAX_VOICES);
  const fading: StringVoice[] = [];
  // Each pluck takes the next seed from this device's sequence: repeated notes differ, and an export repeats.
  const rnd = seededRandom(host.id);
  let ready = false;
  const loading = ensureStringWorklet(ctx).then((ok) => {
    ready = ok;
  });

  /** Frees the nodes of voices that have finished ringing. */
  const sweep = (now: number) => {
    pool.list = pool.list.filter((v) => {
      if (v.endTime > now) return true;
      v.dispose();
      return false;
    });
    for (let i = fading.length - 1; i >= 0; i--) {
      if (fading[i].endTime > now) continue;
      fading[i].dispose();
      fading.splice(i, 1);
    }
  };

  return {
    ready: () => loading,
    noteOn(note, vel, time) {
      if (!ready) return;
      // Free voices by the audio clock, not by this note's time: a note can be scheduled ahead of the audio,
      // and disconnecting a voice that is still sounding would cut its tail.
      sweep(ctx.currentTime);
      // Steal the oldest released voice first (fast fade), then the oldest held one.
      while (pool.list.length >= MAX_VOICES) {
        const idx = Math.max(0, pool.list.findIndex((v) => v.releaseTime !== null));
        const [victim] = pool.list.splice(idx, 1);
        victim.kill(time);
        fading.push(victim);
      }
      const hz = midiHz(note) * Math.pow(2, host.p('tune', 0) / 1200);
      const gain = loopGainFor(host.p('decay', 0.6));
      const seed = 1 + Math.floor(rnd() * 0xfffffffe);
      const node = new AudioWorkletNode(ctx, 'unbox-string', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { seed },
      });
      const set = (name: string, value: number) => node.parameters.get(name)?.setValueAtTime(value, time);
      set('frequency', hz);
      set('loop', gain);
      set('average', 0.5 + 0.5 * clamp(host.p('bright', 0.6), 0, 1));
      set('level', 0.3 + 0.7 * clamp(host.p('pick', 0.5), 0, 1));
      set('velocity', clamp(vel, 0, 1));
      set('gate', 1);
      node.connect(out);

      const voice: StringVoice = {
        note,
        node,
        startTime: time,
        releaseTime: null,
        endTime: time + ringSeconds(hz, gain) + 0.1,
        release(t) {
          // Damp pulls the loop gain toward 0.5, so a released string dies in a few passes.
          const damp = clamp(host.p('damp', 0.3), 0, 1);
          const target = gain * (1 - damp) + 0.5 * damp;
          node.parameters.get('gate')?.setValueAtTime(0, t);
          node.parameters.get('loop')?.setTargetAtTime(target, t, 0.02);
          voice.releaseTime = t;
          voice.endTime = Math.min(voice.endTime, t + ringSeconds(hz, target) + 0.1);
        },
        kill(t) {
          node.parameters.get('velocity')?.setTargetAtTime(0, t, FADE_SECONDS);
          voice.endTime = Math.min(voice.endTime, t + 0.05);
        },
        dispose() {
          node.disconnect();
        },
      };
      pool.add(voice);
    },
    noteOff(note, time) {
      pool.releaseNote(note, time);
    },
    allNotesOff(time) {
      pool.releaseAll(time);
    },
    dispose() {
      for (const v of [...pool.list, ...fading]) v.dispose();
      pool.list = [];
      fading.length = 0;
    },
  };
}
