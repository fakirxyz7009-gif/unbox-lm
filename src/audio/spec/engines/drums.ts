/**
 * Drum machine engine ('drums'): every pad is a synthesized voice (drumVoices.ts) with its own
 * Tune / Decay / Tone / Level; Accent (hard hits), Drive, Tone tilt and Compress on the bus;
 * kit switching (TR-8S / Rytmik), choke groups (open / closed hat) and per-voice drive (Perkons).
 * Notes: each pad answers its own note; other notes map onto the pads in order.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { clamp, satCurve, setSmooth } from '../dsp.ts';
import { kitVoice, playDrum, type DrumHit } from './drumVoices.ts';

export function padIndexForNote(pads: readonly { note: number }[], note: number): number {
  const i = pads.findIndex((p) => p.note === note);
  if (i >= 0) return i;
  return ((((note - 36) % pads.length) + pads.length) % pads.length);
}

/** Bus processing shared by the drum engines: drive → tilt EQ → compressor. */
export function drumBus(host: SpecHost) {
  const ctx = host.ctx;
  const input = ctx.createGain();
  input.gain.value = 0.8;
  const drive = ctx.createWaveShaper();
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 180;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 4500;
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 6;
  comp.attack.value = 0.005;
  comp.release.value = 0.12;
  const makeup = ctx.createGain();
  input.connect(drive).connect(low).connect(high).connect(comp).connect(makeup).connect(host.outs[0]);
  const sync = () => {
    const d = clamp(host.p('drive', 0), 0, 1);
    drive.curve = d > 0.02 ? satCurve(d * 0.8) : null;
    const tilt = clamp(host.p('tone', 0), -1, 1);
    setSmooth(low.gain, -tilt * 6, ctx, 0.03);
    setSmooth(high.gain, tilt * 6, ctx, 0.03);
    const c = clamp(host.p('compress', 0.2), 0, 1);
    setSmooth(comp.threshold, -c * 30, ctx, 0.03);
    setSmooth(comp.ratio, 1 + c * 7, ctx, 0.03);
    setSmooth(makeup.gain, 1 + c * 0.9, ctx, 0.03);
  };
  sync();
  return { input, sync, comp };
}

export function drumsEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const pads = host.spec.pads ?? [];
  const bus = drumBus(host);
  const choke = new Map<number, DrumHit[]>();
  let lastPad = -1;
  let lastAt = 0;

  const voiceOf = (i: number) => {
    const v = pads[i].voice;
    const kit = host.opt('kit') || String(host.cfg.character ?? '');
    return host.cfg.kitVoices || ['kick', 'snare', 'hatC', 'hatO'].includes(v) ? kitVoice(v, kit) : v;
  };

  return {
    noteOn(note, vel, t) {
      if (!pads.length) return;
      const i = padIndexForNote(pads, note);
      const n = i + 1;
      const accent = vel > 0.92 ? 1 + host.p('accent', 0.5) * 0.4 : 1;
      const p = {
        tune: host.p(`p${n}Tune`, 0),
        decay: host.p(`p${n}Decay`, 0.5),
        tone: host.p(`p${n}Tone`, 0.5),
        level: host.p(`p${n}Level`, 0.8),
        drive: host.cfg.perVoiceDrive ? host.p('drive', 0) : 0,
      };
      const group = pads[i].choke;
      if (group !== undefined) {
        (choke.get(group) ?? []).forEach((h) => h.end > t && h.choke(t));
        choke.set(group, []);
      }
      const hit = playDrum(ctx, voiceOf(i), bus.input, t, vel * accent, p);
      if (group !== undefined) choke.get(group)!.push(hit);
      lastPad = i;
      lastAt = t;
    },
    noteOff() {
      // one-shots
    },
    allNotesOff(t) {
      choke.forEach((hits) => hits.forEach((h) => h.choke(t)));
      choke.clear();
    },
    onParam(key) {
      if (key === 'drive' || key === 'tone' || key === 'compress') bus.sync();
    },
    meter() {
      return { lastPad, lastAt, gr: bus.comp.reduction };
    },
  };
}
