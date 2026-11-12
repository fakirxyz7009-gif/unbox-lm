/**
 * 'multisample' engine: recorded instrument packs (public/instruments/<id>/, built by
 * scripts/instruments). Picks zones by key and velocity layer, cycles sequential round robins
 * per key, rolls random round robins, chokes by group (open / closed hats), loops sustained
 * samples, and gives kits per-pad level / tune / length. After the voices: Drive (soft
 * saturation) and Tone (low-pass). Punch is a per-voice transient boost: the engine knows each
 * hit's start, so it lifts exactly the first few milliseconds instead of guessing them. Variation
 * keeps keys without round robins (one recording) from repeating identically (see variation()).
 *
 * Units and offline-export clones share one decoded pack while they are alive. The final engine
 * releases the cache entry on disposal so sequentially auditioned packs can be reclaimed.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { adsrRelease, clamp, dbToGain, disconnectAll, setSmooth, stopAll, tubeCurve } from '../dsp.ts';
import { parsePack, type InstrumentPack, type PackModWheelFade, type PackZone } from '../../../../shared/instruments/types.ts';
import { articulationSwitch, defaultArticulation, pressMomentarySwitch, releaseMomentarySwitch } from '../../../../shared/instruments/articulation.ts';
import { matchingPackZones, modWheelFadeGain, velocityFadeGain, type PackTrigger } from '../../../../shared/instruments/zones.ts';
import { VoicePool, type VoiceBase } from './voices.ts';

interface LoadedPack {
  pack: InstrumentPack;
  buffers: Map<string, AudioBuffer>;
}

export interface PackStatus {
  progress: number;
  error: string | null;
  samples: number;
}

interface PackLoad extends PackStatus {
  promise: Promise<void>;
  result: LoadedPack | null;
  refs: number;
}

const loads = new Map<string, PackLoad>();
const BASE = `${import.meta.env?.BASE_URL ?? '/'}instruments/`;
const PARALLEL = 6;

function loadPack(id: string, ctx: BaseAudioContext): PackLoad {
  const cached = loads.get(id);
  if (cached) {
    cached.refs++;
    return cached;
  }
  const state: PackLoad = { progress: 0, error: null, samples: 0, result: null, refs: 1, promise: Promise.resolve() };
  state.promise = (async () => {
    const res = await fetch(`${BASE}${id}/instrument.json`);
    if (!res.ok) throw new Error(`instrument.json: HTTP ${res.status}`);
    const pack = parsePack(await res.json());
    if (!pack) throw new Error('instrument.json is not a valid pack');
    const files = [...new Set(pack.zones.map((z) => z.file).filter(Boolean))];
    const buffers = new Map<string, AudioBuffer>();
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const f = files[next++];
        const r = await fetch(`${BASE}${id}/${f.split('/').map(encodeURIComponent).join('/')}`);
        if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
        buffers.set(f, await ctx.decodeAudioData(await r.arrayBuffer()));
        state.progress = buffers.size / files.length;
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, files.length) }, worker));
    state.samples = buffers.size;
    state.progress = 1;
    state.result = { pack, buffers };
  })();
  state.promise.catch((e: unknown) => {
    state.error = e instanceof Error ? e.message : String(e);
  });
  loads.set(id, state);
  return state;
}

function releasePack(id: string, state: PackLoad): void {
  state.refs = Math.max(0, state.refs - 1);
  if (state.refs > 0) return;

  const evict = () => {
    if (state.refs > 0 || loads.get(id) !== state) return;
    loads.delete(id);
    state.result?.buffers.clear();
    state.result = null;
  };
  if (state.result) evict();
  else void state.promise.then(evict, evict);
}

/** Load state of a pack (faceplate status line). */
export function packStatus(id: string): PackStatus | null {
  return loads.get(id) ?? null;
}

/** Velocity (1..127) → gain for a zone: the library's own curve, else a gentle in-layer slope. */
function velGain(z: PackZone, v: number, sens: number): number {
  let g: number;
  if (z.velCurve?.length) {
    const pts = z.velCurve;
    g = pts[pts.length - 1][1];
    if (v <= pts[0][0]) g = pts[0][1];
    else
      for (let i = 1; i < pts.length; i++) {
        if (v > pts[i][0]) continue;
        const [v0, g0] = pts[i - 1];
        const [v1, g1] = pts[i];
        g = g0 + ((g1 - g0) * (v - v0)) / Math.max(1, v1 - v0);
        break;
      }
  } else if (z.lovel <= 1 && z.hivel >= 127) g = (v / 127) ** 2;
  else g = v / Math.max(1, z.hivel); // the layer's recording already carries the dynamics
  return Math.pow(clamp(g, 0, 16), sens) * velocityFadeGain(z, v);
}

/** Event-keyed randomness keeps one note identical in mix, stem, and offline re-renders. */
function eventRandom(deviceId: string, packId: string, note: number, hit: number): () => number {
  let state = 0x811c9dc5;
  const key = `${deviceId}|${packId}|${note}|${hit}`;
  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

class PackVoice implements VoiceBase {
  releaseTime: number | null = null;
  constructor(
    public note: number,
    public startTime: number,
    public endTime: number,
    private src: AudioBufferSourceNode,
    private amp: GainNode,
    extra: (AudioNode | null)[],
    public offBy: readonly number[] | undefined,
    private releaseSec: () => number,
    public velocity: number,
    public hit: number,
    public roll: number,
    public articulation: string | null,
    public heldSwitches: ReadonlySet<number>,
    public trigger: PackTrigger,
    public previousNote: number | null,
    public releaseOnNoteOff: boolean,
    private controllerGain: GainNode | null,
    private modWheelFade: PackModWheelFade | undefined,
    private ctx: BaseAudioContext
  ) {
    if (trigger === 'release') this.releaseTime = startTime;
    src.onended = () => disconnectAll(src, ...extra, amp);
  }

  private fade(t: number, r: number): void {
    adsrRelease(this.amp.gain, t, 0, r);
    this.endTime = Math.min(this.endTime, t + r * 1.6 + 0.05);
    stopAll(this.endTime, this.src);
  }

  release(t: number): void {
    if (this.releaseTime !== null) return;
    this.releaseTime = t;
    this.fade(t, this.releaseSec());
  }

  /** Choke (hat closing, piano re-strike): fast but click-free. */
  choke(t: number): void {
    this.releaseTime = this.releaseTime ?? t;
    this.fade(t, 0.03);
  }

  kill(t: number): void {
    this.releaseTime = this.releaseTime ?? t;
    this.fade(t, 0.012);
  }

  setModWheel(value: number): void {
    if (!this.controllerGain || !this.modWheelFade) return;
    setSmooth(this.controllerGain.gain, modWheelFadeGain(this.modWheelFade, value), this.ctx, 0.012);
  }
}

export function multisampleEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const id = String(host.cfg.pack ?? '');
  const pads = host.spec.pads ?? [];
  const kit = pads.length > 0;
  const laneOf = new Map(pads.map((p, i) => [p.note, i]));

  // voices → bus → dry + drive → tone → out
  const bus = ctx.createGain();
  const dry = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '2x';
  const wet = ctx.createGain();
  wet.gain.value = 0;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.5;
  bus.connect(dry).connect(tone);
  bus.connect(shaper).connect(wet).connect(tone);
  tone.connect(host.outs[0]);

  const pool = new VoicePool<PackVoice>(kit ? 64 : 48);
  const hits = new Map<string, number>();
  let activeArticulationId: string | null = null;
  const heldSwitchNotes = new Set<number>();
  const heldSwitches = new Set<number>();
  let lastNoteOn: number | null = null;
  let lastPad = -1;
  let lastAt = 0;
  const load = loadPack(id, ctx);
  let packLeaseReleased = false;
  load.promise.then(
    () => {
      if (packLeaseReleased) return;
      const pack = load.result?.pack;
      if (!pack) return;
      pack.zones.forEach((zone) => {
        if (zone.swDown !== undefined) heldSwitchNotes.add(zone.swDown);
        if (zone.swUp !== undefined) heldSwitchNotes.add(zone.swUp);
      });
      host.changed();
    },
    () => {
      if (!packLeaseReleased) host.changed();
    }
  );

  let shapedAt = -1;
  const syncTone = () => {
    const d = clamp(host.p('drive', 0), 0, 1);
    if (Math.abs(d - shapedAt) > 0.005) {
      shaper.curve = tubeCurve(0.15 + d * 0.85);
      shapedAt = d;
    }
    setSmooth(dry.gain, 1 - d, ctx, 0.02);
    setSmooth(wet.gain, d * (1 + d * 0.6), ctx, 0.02);
    setSmooth(tone.frequency, clamp(host.p('tone', 20000), 200, 20000), ctx, 0.02);
  };
  syncTone();

  const release = (zone: PackZone, packRelease: number | undefined) => {
    const control = clamp(host.p('release', packRelease ?? 0.4), 0.01, 8);
    const defaultRelease = clamp(packRelease ?? zone.release ?? 0.4, 0.01, 8);
    const zoneRelease = clamp(zone.release ?? defaultRelease, 0.01, 8);
    // Keep SFZ's per-zone release differences while letting the rack knob scale the whole pack.
    return clamp(control * (zoneRelease / defaultRelease), 0.01, 8);
  };

  /**
   * Variation for keys without round robins (one recording per hit): each hit gets an alternating
   * up / down-stroke tuning offset (±8 cents) plus a few random cents, ±1.5 dB, a 0–4 ms later start into the
   * transient, and — when the zone has a single velocity layer — a low-pass that darkens soft hits
   * the way soft strokes sound duller. All scaled by `vary` (0..1).
   */
  function variation(z: PackZone, v127: number, hit: number, vary: number, random: () => number) {
    const rnd = (amt: number) => (random() * 2 - 1) * amt;
    const single = z.lovel <= 1 && z.hivel >= 127;
    if (vary <= 0) return { cents: 0, db: 0, offset: 0, cutoff: 0 };
    const dark = single ? vary * (1 - v127 / 127) : 0;
    return {
      // no detune on velocity-layered sustained instruments (a piano isn't retuned per strike)
      cents: kit || single ? ((hit % 2 ? 8 : -8) + rnd(4)) * vary : 0,
      db: rnd(1.5 * vary),
      offset: random() * 0.004 * vary,
      cutoff: single ? 20000 * Math.pow(0.08, dark) * (1 + rnd(0.08 * vary)) : 0,
    };
  }

  function play(
    z: PackZone,
    buf: AudioBuffer,
    note: number,
    v127: number,
    t: number,
    lane: number,
    oneShot: boolean,
    vary: number,
    hit: number,
    roll: number,
    articulation: string | null,
    switches: ReadonlySet<number>,
    trigger: PackTrigger = 'attack',
    previousNote: number | null = null,
    random: () => number = () => 0.5
  ): void {
    const laneKey = (k: string, fallback: number) => (lane >= 0 ? host.p(`p${lane + 1}${k}`, fallback) : fallback);
    const vr = variation(z, v127, hit, vary, random);
    const g = velGain(z, v127, clamp(host.p('velSens', 1), 0, 1.5)) * (z.gain ?? 1) * dbToGain(laneKey('Level', 0) + vr.db);
    const semis = (z.root === null ? 0 : note - z.root) + host.p('tune', 0) + laneKey('Tune', 0) + (host.p('fine', 0) + (z.tune ?? 0) + vr.cents) / 100;
    const rate = Math.pow(2, semis / 12);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    // A loop marker is a zone-level promise to sustain. Drum kits remain one-shots by default,
    // while explicit loop zones (such as the recorded snare roll) follow key-up.
    const loops = !!z.loop;
    if (loops && z.loop) {
      src.loop = true;
      src.loopStart = z.loop[0];
      src.loopEnd = z.loop[1];
    }
    const amp = ctx.createGain();
    amp.gain.value = 0;
    let node: AudioNode = src;
    let pan: StereoPannerNode | null = null;
    let lp: BiquadFilterNode | null = null;
    if (vr.cutoff > 0 && vr.cutoff < 17000) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.5;
      lp.frequency.value = vr.cutoff;
      node = node.connect(lp);
    }
    if (z.pan) {
      pan = ctx.createStereoPanner();
      pan.pan.value = z.pan;
      node = node.connect(pan);
    }
    node.connect(amp);
    let controllerGain: GainNode | null = null;
    if (z.modWheelFade) {
      controllerGain = ctx.createGain();
      const initialValue = host.modWheelTouched() ? host.modWheel() * 127 : z.modWheelFade.default;
      controllerGain.gain.value = modWheelFadeGain(z.modWheelFade, initialValue);
      amp.connect(controllerGain).connect(bus);
    } else amp.connect(bus);

    const attack = kit ? z.attack ?? 0 : Math.max(host.p('attack', 0.001), z.attack ?? 0);
    const punch = clamp(host.p('punch', 0), 0, 1);
    if (attack > 0.004) {
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(g, t + attack);
    } else {
      // up to +9 dB on the first ~10 ms, settling back to the played level
      amp.gain.setValueAtTime(g * (1 + punch * 1.8), t);
      if (punch > 0) amp.gain.setTargetAtTime(g, t + 0.004, 0.012);
    }

    const offset = Math.min(vr.offset, buf.duration * 0.1);
    const natural = loops ? Infinity : t + (buf.duration - offset) / rate;
    let end = natural;
    const length = (kit || oneShot) ? clamp(host.p('decay', 1), 0.02, 1) * clamp(laneKey('Decay', 1), 0.02, 1) : 1;
    if (length < 0.999) {
      const dur = (buf.duration / rate) * length;
      amp.gain.setTargetAtTime(0, t + Math.max(0.01, dur * 0.45), Math.max(0.005, dur * 0.12));
      end = t + dur + 0.02;
    }
    src.start(t, offset);
    if (Number.isFinite(end)) src.stop(end);

    pool.makeRoom(t, ctx.currentTime);
    const packRelease = load.result?.pack.release;
    pool.add(
      new PackVoice(
        note,
        t,
        Number.isFinite(end) ? end : Infinity,
        src,
        amp,
        [lp, pan, controllerGain],
        z.offBy,
        () => release(z, packRelease),
        v127,
        hit,
        roll,
        articulation,
        new Set(switches),
        trigger,
        previousNote,
        !oneShot || loops,
        controllerGain,
        z.modWheelFade,
        ctx
      )
    );
  }

  return {
    noteOn(note, vel, t) {
      const previousNote = lastNoteOn;
      lastNoteOn = note;
      const L = load.result;
      if (!L) return;
      const { pack, buffers } = L;
      const defaultArt = defaultArticulation(pack);
      if (activeArticulationId === null) activeArticulationId = defaultArt?.id ?? null;
      const switchArt = articulationSwitch(pack, note);
      if (pressMomentarySwitch(heldSwitches, heldSwitchNotes, note)) {
        if (switchArt) activeArticulationId = switchArt.id;
        return;
      }
      if (switchArt) {
        activeArticulationId = switchArt.id;
        return;
      }
      const v127 = clamp(Math.round(vel * 127), 1, 127);
      const hitKey = `${activeArticulationId ?? ''}|${note}`;
      const n = hits.get(hitKey) ?? 0;
      hits.set(hitKey, n + 1);
      const random = eventRandom(host.id, id, note, n);
      const roll = random();
      const zones = matchingPackZones(pack, note, v127, activeArticulationId, 'attack', n, roll, heldSwitches, previousNote);
      if (!zones.length) return;

      const groups = new Set(zones.flatMap((z) => z.groups ?? []));
      if (groups.size) for (const v of pool.list) if (v.offBy?.some((g) => groups.has(g))) v.choke(t);
      if (pack.notePolyphony) {
        const same = pool.list.filter((v) => v.note === note && v.endTime > t);
        same.slice(0, Math.max(0, same.length - pack.notePolyphony + 1)).forEach((v) => v.choke(t));
      }

      const lane = laneOf.get(note) ?? -1;
      if (lane >= 0) {
        lastPad = lane;
        lastAt = t;
      }
      // keys with recorded round robins already vary from hit to hit
      const hasRR = zones.some((z) => (z.seqLength ?? 0) > 1 || z.lorand !== undefined);
      const vary = hasRR ? 0 : clamp(host.p('vary', 0), 0, 1);
      for (const z of zones) {
        const buf = z.file ? buffers.get(z.file) : undefined;
        if (buf) play(z, buf, note, v127, t, lane, !!pack.oneShot, vary, n, roll, activeArticulationId, heldSwitches, 'attack', previousNote, random);
      }
    },
    keyRelease(note) {
      releaseMomentarySwitch(heldSwitches, heldSwitchNotes, note);
    },
    noteOff(note, t) {
      const loaded = load.result;
      if (!loaded) return;
      if (heldSwitchNotes.has(note)) {
        heldSwitches.delete(note);
        return;
      }
      if (articulationSwitch(loaded.pack, note)) return;
      const active = pool.list.filter((v) => v.note === note && v.trigger === 'attack' && v.releaseTime === null && v.startTime <= t + 1e-6);
      active.forEach((voice) => {
        if (!loaded.pack.oneShot || voice.releaseOnNoteOff) voice.release(t);
      });

      const events = new Map<string, PackVoice>();
      for (const voice of active) {
        const switches = [...voice.heldSwitches].sort((a, b) => a - b).join(',');
        events.set(`${voice.velocity}|${voice.hit}|${voice.roll}|${voice.articulation ?? ''}|${voice.previousNote ?? ''}|${switches}`, voice);
      }
      for (const voice of events.values()) {
        const zones = matchingPackZones(loaded.pack, note, voice.velocity, voice.articulation, 'release', voice.hit, voice.roll, voice.heldSwitches, voice.previousNote);
        for (const zone of zones) {
          const buffer = zone.file ? loaded.buffers.get(zone.file) : undefined;
          if (buffer) play(zone, buffer, note, voice.velocity, t, laneOf.get(note) ?? -1, true, 0, voice.hit, voice.roll, voice.articulation, voice.heldSwitches, 'release', voice.previousNote);
        }
      }
    },
    allNotesOff(t) {
      pool.killAll(t);
      activeArticulationId = null;
      heldSwitches.clear();
      lastNoteOn = null;
    },
    onParam(key) {
      if (key === 'drive' || key === 'tone') syncTone();
      if (key === '__mod') {
        const value = host.modWheel() * 127;
        pool.list.forEach((voice) => voice.setModWheel(value));
      }
    },
    ready: () => load.promise.then(
      () => undefined,
      () => undefined
    ),
    meter() {
      pool.gc(ctx.currentTime);
      return { voices: pool.list.length, loaded: load.progress, failed: load.error ? 1 : 0, lastPad, lastAt };
    },
    dispose() {
      pool.killAll(ctx.currentTime);
      disconnectAll(bus, dry, shaper, wet, tone);
      if (!packLeaseReleased) {
        packLeaseReleased = true;
        releasePack(id, load);
      }
    },
  };
}
