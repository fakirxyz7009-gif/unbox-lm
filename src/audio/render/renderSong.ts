/**
 * Offline render of the song (export, stems, freeze, bounce in place). Mirrors the live graph on
 * an OfflineAudioContext: every rack device (cloned with its settings / samples), every cable
 * (bypassed units passed through, powered-off units silent), mixer strips (EQ, dynamics) with
 * sends, buses and returns, automation (AudioParams sample-accurate, knobs and CV at 4 updates per 16th via
 * suspend), audio clips, player devices (arps / generators) and the master section.
 */
import type { AudioEngine, NoteRouting } from '../AudioEngine.ts';
import type { BaseDevice } from '../BaseDevice.ts';
import type { SequencerTrack } from '../types.ts';
import { SpecDevice, type SpecClock } from '../spec/SpecDevice.ts';
import type { PlayerContext } from '../spec/engines/players.ts';
import { MixBusDevice } from '../mixer/MixBusDevice.ts';
import { AudioTrackDevice } from '../clips/AudioTrackDevice.ts';
import { ClipVoices } from '../clips/clipVoices.ts';
import { anyDucking, applyDucks, isDrumBeat, type DuckHit } from '../mixer/duck.ts';
import { audioStore } from '../clips/audioStore.ts';
import { deviceSample, deviceSampleAudioIds, installSampleVoice } from '../deviceSamples.ts';
import { applyStrip, buildStrip, routeStrip, stripValues, syncSends, type StripNodes } from '../mixer/channelStrip.ts';
import { computeAudibility, type RouteNode } from '../mixer/routing.ts';
import { denorm } from '../automation/model.ts';
import { TICKS_PER_16TH, hitsInWindow } from '../sequencer/model.ts';

export interface RenderRequest {
  /** Song range in 16ths. */
  startPos: number;
  endPos: number;
  sampleRate: number;
  /** Extra seconds after the range for reverb / delay tails. */
  tailSec: number;
  /** Only these channels sound (stems); undefined = the full mix. */
  onlyChannels?: Set<string>;
  /** With onlyChannels: 'wet' keeps the buses / returns they feed, 'dry' mutes returns. */
  stemMode?: 'wet' | 'dry';
  /** Run the master section (width, outboard, EQ, limiter, clipper). Off = raw sum (stems). */
  masterProcessing: boolean;
  onProgress?: (fraction: number, label: string) => void;
}

const AUDIO_PAIRS: [string, string][] = [['in_l', 'out_l'], ['in_r', 'out_r']];

export async function renderSong(engine: AudioEngine, req: RenderRequest): Promise<AudioBuffer> {
  const spb = engine.stepsPerBar;
  const automationLanes = engine.automationLanesForSong();
  const tempoLane = automationLanes.find((l) => l.target.kind === 'tempo' && l.mode !== 'off' && l.points.length);
  const bpmAt = (pos: number) => {
    if (tempoLane) {
      const value = engine.automationValueAt(tempoLane.id, pos);
      if (value !== null) return denorm(engine.automation.range(tempoLane.target), value);
    }
    return engine.timeMap.tempoMap.getBpmAtTick(pos * TICKS_PER_16TH);
  };

  // timeline: audio time of every 16th in the range
  const n = Math.max(1, req.endPos - req.startPos);
  const times = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) times[i + 1] = times[i] + engine.stepDurationAt(req.startPos + i, bpmAt(req.startPos + i));
  const bodySec = times[n];
  const total = Math.min(60 * 240, bodySec + req.tailSec);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * req.sampleRate)), req.sampleRate);
  const timeOf = (pos: number) => {
    const i = pos - req.startPos;
    if (i <= 0) return 0;
    if (i >= n) return bodySec + (i - n) * (60 / bpmAt(req.endPos) / 4);
    const f = Math.floor(i);
    return times[f] + (i - f) * (times[f + 1] - times[f]);
  };
  const posOf = (t: number) => {
    if (t <= 0) return req.startPos;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid;
    }
    return req.startPos + lo + (t - times[lo]) / Math.max(1e-6, times[lo + 1] - times[lo]);
  };

  req.onProgress?.(0, 'Building the mix');
  // ---------------------------------------------------------------- devices
  const off = new Map<string, BaseDevice>();
  for (const live of engine.devices.values()) {
    try {
      off.set(live.id, engine.instantiateOffline(ctx, live));
    } catch (e) {
      console.warn(`Export: ${live.name} could not be rebuilt offline`, e);
    }
  }
  await Promise.all([...off.values()].map((d) => d.ready?.()));
  // instruments playing a loaded audio file ("Load audio") get the same sample voice offline
  await audioStore.ensure(deviceSampleAudioIds());
  off.forEach((d, id) => deviceSample(id) && installSampleVoice(d));
  const liveOf = (id: string) => engine.devices.get(id);
  const silent = (id: string) => liveOf(id)?.isPowered === false;
  const bypassed = (id: string) => !!liveOf(id)?.isBypassed && !(liveOf(id) instanceof MixBusDevice);

  /** Real sources feeding (deviceId, outPort), looking through bypassed units. */
  const sourcesOf = (deviceId: string, port: string, seen = new Set<string>()): { dev: string; port: string }[] => {
    if (silent(deviceId) || seen.has(deviceId)) return [];
    if (!bypassed(deviceId)) return [{ dev: deviceId, port }];
    seen.add(deviceId);
    const pair = AUDIO_PAIRS.find(([, o]) => o === port);
    if (!pair) return [];
    return engine.audioConnections.filter((c) => c.targetDeviceId === deviceId && c.targetPortId === pair[0]).flatMap((c) => sourcesOf(c.sourceDeviceId, c.sourcePortId, seen));
  };

  // ---------------------------------------------------------------- mixer strips
  const chans = engine.mixer.channels();
  const strips = new Map<string, StripNodes>();
  for (const c of chans) strips.set(c.id, buildStrip(ctx));
  const masterIn = ctx.createGain();
  masterIn.channelCount = 2;
  masterIn.channelCountMode = 'explicit';
  const masterNodes = req.masterProcessing ? await engine.buildMasterChainOn(ctx, masterIn) : null;
  (masterNodes ? masterNodes.output : masterIn).connect(ctx.destination);

  // cables
  for (const c of engine.audioConnections) {
    if (bypassed(c.targetDeviceId) && c.targetDeviceId !== 'master') continue; // resolved from the far side
    const dst =
      c.targetDeviceId === 'master'
        ? (() => {
            const s = strips.get(c.stripId ?? c.sourceDeviceId);
            return s ? (c.targetPortId === 'master_r' ? s.inR : s.inL) : null;
          })()
        : off.get(c.targetDeviceId)?.audioInputs.get(c.targetPortId) ?? null;
    if (!dst) continue;
    for (const s of sourcesOf(c.sourceDeviceId, c.sourcePortId)) off.get(s.dev)?.audioOutputs.get(s.port)?.connect(dst);
  }

  // audibility (mute / solo, stems)
  const busIds = new Set(chans.filter((c) => c.kind === 'bus' || c.kind === 'return').map((c) => c.id));
  const nodes: RouteNode[] = chans.map((c) => {
    const s = c.settings;
    const vca = s.vcaId ? engine.mixer.vcas.find((v) => v.id === s.vcaId) : undefined;
    const only = req.onlyChannels;
    return {
      id: c.id,
      mute: s.mute || !!vca?.mute || !!c.track?.disabled || (!!only && req.stemMode === 'dry' && c.kind === 'return' && !only.has(c.id)),
      solo: only ? only.has(c.id) : s.solo,
      soloSafe: only ? false : s.soloSafe,
      output: s.output && busIds.has(s.output) ? s.output : 'master',
      sends: (s.sends ?? []).filter((x) => !x.muted && x.level > 0 && busIds.has(x.busId)).map((x) => x.busId),
    };
  });
  const audible = computeAudibility(nodes);
  for (const c of chans) {
    const s = c.settings;
    const strip = strips.get(c.id)!;
    const vca = s.vcaId ? engine.mixer.vcas.find((v) => v.id === s.vcaId)?.level ?? 1 : 1;
    applyStrip(strip, stripValues(s, vca, audible.get(c.id) ?? true), ctx, false);
    const busIn = (id: string) => (off.get(id) instanceof MixBusDevice ? (off.get(id) as MixBusDevice).input : masterIn);
    routeStrip(strip, busIn(s.output && busIds.has(s.output) ? s.output : 'master'));
    syncSends(strip, ctx, (s.sends ?? []).filter((x) => busIds.has(x.busId)).map((x) => ({ busId: x.busId, level: x.muted ? 0 : x.level, pre: !!x.pre, dest: busIn(x.busId) })), false);
  }
  // channel dynamics run in a worklet that loads asynchronously
  await Promise.all([...strips.values()].map((s) => s.dyn.ready));

  // ---------------------------------------------------------------- automation (AudioParams)
  const ctl: { time: number; run: () => void }[] = [];
  const auto = engine.automation;
  for (const lane of automationLanes) {
    if (lane.mode === 'off' || !lane.points.length || lane.target.kind === 'tempo') continue;
    const t = lane.target;
    const r = auto.range(t);
    const at = (pos: number) => {
      const value = engine.automationValueAt(lane.id, pos);
      return value === null ? auto.current(t) : denorm(r, value);
    };
    const rampAll = (param: AudioParam, map: (v: number) => number) => {
      param.setValueAtTime(map(at(req.startPos)), 0);
      for (let p = req.startPos + 1; p <= req.endPos; p++) param.linearRampToValueAtTime(map(at(p)), timeOf(p));
    };
    if (t.kind === 'channel') {
      const strip = strips.get(t.channelId);
      const s = engine.mixer.settingsOf(t.channelId);
      if (!strip || !s) continue;
      const vca = s.vcaId ? engine.mixer.vcas.find((v) => v.id === s.vcaId)?.level ?? 1 : 1;
      if (t.param === 'volume') rampAll(strip.fader.gain, (v) => v * vca);
      else if (t.param === 'pan') rampAll(strip.pan.pan, (v) => v);
      else if (t.param === 'trim') rampAll(strip.trim.gain, (v) => Math.pow(10, v / 20));
      else if (t.param === 'width') {
        rampAll(strip.wLL.gain, (w) => (1 + w) / 2);
        rampAll(strip.wRR.gain, (w) => (1 + w) / 2);
        rampAll(strip.wRL.gain, (w) => (1 - w) / 2);
        rampAll(strip.wLR.gain, (w) => (1 - w) / 2);
      } else if (t.param === 'mute') {
        if (audible.get(t.channelId)) {
          strip.mute.gain.setValueAtTime(at(req.startPos) >= 0.5 ? 0 : 1, 0);
          for (let p = req.startPos + 1; p <= req.endPos; p++) strip.mute.gain.setValueAtTime(at(p) >= 0.5 ? 0 : 1, timeOf(p));
        }
      } else if (t.param.startsWith('send:')) {
        const send = strip.sends.get(t.param.slice(5));
        if (send) rampAll(send.gain.gain, (v) => v);
      }
    } else if (t.kind === 'device') {
      const dev = off.get(t.deviceId);
      if (!dev) continue;
      for (let p = req.startPos; p < req.endPos; p++) {
        for (let k = 0; k < 4; k++) {
          const v = at(p + k / 4);
          ctl.push({ time: timeOf(p + k / 4), run: () => dev.setParam(t.param, v) });
        }
      }
    }
    if (t.kind === 'master' && masterNodes) {
      if (t.param === 'volume') rampAll(masterNodes.masterGain.gain, (v) => v);
      else if (t.param === 'width') {
        const [ll, rr, rl, lr] = masterNodes.width;
        rampAll(ll.gain, (v) => (1 + v * 2) / 2);
        rampAll(rr.gain, (v) => (1 + v * 2) / 2);
        rampAll(rl.gain, (v) => (1 - v * 2) / 2);
        rampAll(lr.gain, (v) => (1 - v * 2) / 2);
      } else {
        const i = t.param === 'low' ? 0 : t.param === 'mid' ? 1 : 2;
        rampAll(masterNodes.eq[i].gain, (v) => (v - 0.5) * (i === 1 ? 16 : 18));
      }
    }
  }

  // CV cables: same matrix as the live CV engine, at control rate
  const cvEntries = engine.cvEngine.matrixEntries.filter((e) => off.has(e.sourceDeviceId) && off.has(e.targetDeviceId));
  if (cvEntries.length) {
    const smooth = new Map<string, number>();
    for (let p = req.startPos; p < req.endPos; p++) {
      for (let k = 0; k < 4; k++) {
        const controlTime = timeOf(p + k / 4);
        ctl.push({
          time: controlTime,
          run: () => {
            for (const e of cvEntries) {
              const src = off.get(e.sourceDeviceId)!;
              const dst = off.get(e.targetDeviceId)!;
              const get = src.cvOutputs.get(e.sourcePortId)?.getter;
              const cvIn = dst.cvInputs.get(e.targetParam);
              if (!get || !cvIn) continue;
              const raw = get(controlTime);
              const target = (e.inverted ? -raw : raw) * e.amount + e.offset;
              const v = (smooth.get(e.id) ?? target) + (target - (smooth.get(e.id) ?? target)) * 0.35;
              smooth.set(e.id, v);
              cvIn.param?.setTargetAtTime(v, ctx.currentTime, 0.01);
              cvIn.setter?.(v);
            }
          },
        });
      }
    }
  }

  // ---------------------------------------------------------------- notes, players, audio clips
  req.onProgress?.(0.1, 'Scheduling notes');
  const offPlayers = [...off.values()].filter((d): d is SpecDevice => d instanceof SpecDevice && !!d.engine.player);
  const routing: NoteRouting = {
    playersFor: (id) => offPlayers.filter((p) => p.target === id && liveOf(p.id)?.isPowered !== false && !liveOf(p.id)?.isBypassed),
    now: () => 0,
  };
  const pctxFor = (target: BaseDevice): PlayerContext => ({
    stepDur: () => 60 / engine.bpm / 4,
    gridTime: (pos) => timeOf(pos),
    gridPos: (t) => posOf(t),
    drumNote: (role) => engine.drumNoteFor(engine.devices.get(target.id) ?? target, role),
  });
  const savedClock = SpecDevice.clock;
  const offlineClock: SpecClock = { bpm: () => engine.bpm, isPlaying: () => true, timeOfPosition: (pos) => timeOf(pos) };
  SpecDevice.clock = offlineClock;
  const clips = new ClipVoices(ctx);
  const tracks: SequencerTrack[] = engine.tracks.filter((t) => !t.disabled);
  const generators = offPlayers.filter((p) => p.engine.player?.tick && p.target && off.has(p.target));
  await audioStore.ensure([
    ...tracks.flatMap((t) => (t.arrangementClips ?? []).flatMap((c) => (c.audioId ? [c.audioId] : []))),
    ...engine.songBlocks.flatMap((block) => Object.values(block.audioClipsByTrack ?? {}).flatMap((clips) => clips.flatMap((c) => (c.audioId ? [c.audioId] : [])))),
  ]);
  const ducking = anyDucking(tracks);
  try {
    for (let pos = req.startPos; pos < req.endPos; pos++) {
      const time = timeOf(pos);
      const duckHits: DuckHit[] | null = ducking ? [] : null;
      const dur = timeOf(pos + 1) - time;
      const tick = pos * TICKS_PER_16TH;
      const bar = Math.floor(pos / spb);
      const base16 = 60 / bpmAt(pos) / 4;
      off.forEach((d) => d.onStepTick?.(pos, time));
      for (const t of tracks) {
        const dev = off.get(t.deviceId);
        if (!dev || silent(t.deviceId)) continue;
        // delay-compensation slot: the same per-track offset as live playback
        const offsetSec = (t.offsetMs ?? 0) / 1000;
        if (t.kind === 'audio') {
          if (engine.playbackMode === 'song_arrangement' && dev instanceof AudioTrackDevice) clips.step(engine.audioClipsForTrack(t, tick), tick, Math.max(0, time + offsetSec), bpmAt(pos), spb, dev.clipInput, t.id, engine.timeMap);
          continue;
        }
        // every note lane of the track, as in live playback
        for (const src of engine.sourcesForTrack(t, tick))
        for (const hit of hitsInWindow(src, tick, TICKS_PER_16TH, spb)) {
          const at = Math.max(0, time + (hit.offsetTicks / TICKS_PER_16TH) * dur + offsetSec);
          // per-step filter lanes (Graph & CC), as in live playback
          const cut = t.graphData?.cutoff?.[hit.stepIdx] ?? undefined;
          const res = t.graphData?.resonance?.[hit.stepIdx] ?? undefined;
          if (cut !== undefined) ctl.push({ time: at, run: () => dev.setParam('cutoff', engine.normalizeCutoffToHz(Math.max(0.05, Math.min(1, cut)))) });
          if (res !== undefined) ctl.push({ time: at, run: () => dev.setParam('resonance', Math.max(0.05, Math.min(1, res))) });
          if (engine.renderHit(t, dev, src, hit, bar, at, base16, routing)) duckHits?.push({ deviceId: t.deviceId, time: at, drumBeat: isDrumBeat(t, hit.stepIdx, hit.note.note) });
        }
      }
      if (duckHits) applyDucks(tracks, duckHits, (id) => strips.get(id), time);
      for (const g of generators) {
        const target = off.get(g.target!)!;
        const chain = routing.playersFor(target.id);
        g.engine.player!.tick!(time, time + dur, engine.sinkFor(target, chain, chain.indexOf(g) + 1, routing), pctxFor(target));
      }
      if (pos % 64 === 0) req.onProgress?.(0.1 + 0.2 * ((pos - req.startPos) / n), 'Scheduling notes');
    }
  } finally {
    SpecDevice.clock = savedClock;
  }

  // ---------------------------------------------------------------- render
  if (ctl.length) {
    ctl.sort((a, b) => a.time - b.time);
    const quantum = 128 / req.sampleRate;
    const slots = new Map<number, (() => void)[]>();
    for (const e of ctl) {
      const q = Math.round(e.time / quantum) * quantum;
      if (q <= 0 || q >= total) {
        if (q <= 0) e.run();
        continue;
      }
      const list = slots.get(q);
      if (list) list.push(e.run);
      else slots.set(q, [e.run]);
    }
    for (const [time, runs] of slots) {
      void ctx.suspend(time).then(() => {
        SpecDevice.clock = offlineClock;
        try {
          runs.forEach((r) => r());
        } finally {
          SpecDevice.clock = savedClock;
          void ctx.resume();
        }
      });
    }
  }
  req.onProgress?.(0.35, 'Rendering');
  const result = await ctx.startRendering();
  off.forEach((d) => {
    try {
      d.dispose();
    } catch {
      // offline nodes
    }
  });
  req.onProgress?.(1, 'Done');
  return result;
}
