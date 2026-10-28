/**
 * Standard MIDI Files: export the song (type 1, 480 PPQ: tempo map, time signature, markers,
 * one track per instrument with its notes) and import .mid files as note clips.
 */
import type { AudioEngine } from '../AudioEngine.ts';
import type { ClipNote, DeviceType } from '../types.ts';
import { TICKS_PER_16TH, hitsInWindow, newSeqId } from '../sequencer/model.ts';
import { denorm, valueAt } from '../automation/model.ts';

const PPQ = 480;
const PER16 = PPQ / 4;
const SCALE = PER16 / TICKS_PER_16TH;

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  n = Math.floor(n / 128);
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  return out;
}

interface Ev {
  tick: number;
  data: number[];
  order: number;
}

function trackChunk(events: Ev[]): Uint8Array {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(Math.max(0, e.tick - last)), ...e.data);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  const out = new Uint8Array(8 + body.length);
  out.set([0x4d, 0x54, 0x72, 0x6b]);
  new DataView(out.buffer).setUint32(4, body.length);
  out.set(body, 8);
  return out;
}

const text = (type: number, s: string) => {
  const b = [...new TextEncoder().encode(s)];
  return [0xff, type, ...vlq(b.length), ...b];
};

/**
 * The song as a type-1 MIDI file. `range` in 16ths (default: whole song / pattern pass).
 * `onlyTracks` (sequencer track ids) writes just those instruments: one stem's notes and drums.
 */
export function exportMidi(engine: AudioEngine, range?: { start: number; end: number }, onlyTracks?: ReadonlySet<string>): Blob {
  const spb = engine.stepsPerBar;
  const start = range?.start ?? 0;
  const end = range?.end ?? engine.renderLength16ths();
  const [num, den] = engine.timeSignature.split('/').map(Number);
  const meta: Ev[] = [
    { tick: 0, order: 0, data: text(0x03, 'Unbox Studio') },
    { tick: 0, order: 1, data: [0xff, 0x58, 4, num, Math.round(Math.log2(den)), 24, 8] },
  ];
  const tempoLane = engine.automation.lanes.find((l) => l.target.kind === 'tempo' && l.points.length);
  const tempoAt = (pos: number) => (tempoLane ? denorm(engine.automation.range(tempoLane.target), valueAt(tempoLane.points, pos)!) : engine.bpm);
  let lastBpm = -1;
  for (let pos = start; pos < end; pos++) {
    const bpm = tempoAt(pos);
    if (Math.abs(bpm - lastBpm) < 0.05 && pos > start) continue;
    lastBpm = bpm;
    const us = Math.round(60000000 / bpm);
    meta.push({ tick: (pos - start) * PER16, order: 2, data: [0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff] });
    if (!tempoLane) break;
  }
  engine.arrangementMarkers.forEach((m) => m.bar * spb >= start && meta.push({ tick: (m.bar * spb - start) * PER16, order: 3, data: text(0x06, m.name) }));
  const chunks = [trackChunk(meta)];
  let channel = 0;
  for (const t of engine.tracks) {
    if (t.kind === 'audio') continue;
    if (onlyTracks && !onlyTracks.has(t.id)) continue;
    const drum = t.group === 'Drums';
    const ch = drum ? 9 : channel;
    if (!drum) channel = channel === 8 ? 10 : (channel + 1) % 16;
    const evs: Ev[] = [{ tick: 0, order: 0, data: text(0x03, t.name) }];
    for (let pos = start; pos < end; pos++) {
      const tick = pos * TICKS_PER_16TH;
      const src = engine.sourceForTrack(t, tick);
      if (!src) continue;
      for (const hit of hitsInWindow(src, tick, TICKS_PER_16TH, spb)) {
        if (hit.note.muted) continue;
        const on = Math.round((pos - start) * PER16 + hit.offsetTicks * SCALE + (hit.note.microOffset ?? 0) * hit.stepTicks * SCALE);
        const len = Math.max(1, Math.round(hit.lengthTicks * SCALE * 0.95));
        const notes = [hit.note.note, ...(hit.note.chordNotes ?? [])].map((n) => Math.max(0, Math.min(127, n + (t.pitchOffset ?? 0))));
        const vel = Math.max(1, Math.min(127, Math.round(hit.note.velocity * 127)));
        for (const n of notes) {
          evs.push({ tick: Math.max(0, on), order: 2, data: [0x90 | ch, n, vel] });
          evs.push({ tick: Math.max(0, on) + len, order: 1, data: [0x80 | ch, n, 0] });
        }
      }
    }
    chunks.push(trackChunk(evs));
  }
  const head = new Uint8Array(14);
  const dv = new DataView(head.buffer);
  head.set([0x4d, 0x54, 0x68, 0x64]);
  dv.setUint32(4, 6);
  dv.setUint16(8, 1);
  dv.setUint16(10, chunks.length);
  dv.setUint16(12, PPQ);
  return new Blob([head, ...chunks] as Uint8Array<ArrayBuffer>[], { type: 'audio/midi' });
}

export interface MidiFileTrack {
  name: string;
  channel: number;
  notes: { tick: number; note: number; velocity: number; length: number }[];
}

/** Parses a .mid file (format 0 / 1): first tempo, PPQ and the notes of each track / channel. */
export function parseMidi(buf: ArrayBuffer): { ppq: number; bpm: number; tracks: MidiFileTrack[] } {
  const d = new DataView(buf);
  const u8 = new Uint8Array(buf);
  if (d.getUint32(0) !== 0x4d546864) throw new Error('Not a MIDI file');
  const ppq = d.getUint16(12) & 0x7fff || 480;
  let p = 8 + d.getUint32(4);
  let bpm = 120;
  const out: MidiFileTrack[] = [];
  while (p + 8 <= u8.length) {
    const id = d.getUint32(p);
    const len = d.getUint32(p + 4);
    const end = p + 8 + len;
    if (id !== 0x4d54726b) {
      p = end;
      continue;
    }
    let q = p + 8;
    let tick = 0;
    let status = 0;
    let name = '';
    const open = new Map<string, { tick: number; vel: number }>();
    const byCh = new Map<number, MidiFileTrack>();
    const readVlq = () => {
      let v = 0;
      for (let k = 0; k < 4; k++) {
        const b = u8[q++];
        v = v * 128 + (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      return v;
    };
    while (q < end) {
      tick += readVlq();
      let b = u8[q];
      if (b & 0x80) {
        status = b;
        q++;
      } else b = status;
      const type = status & 0xf0;
      const ch = status & 0x0f;
      if (status === 0xff) {
        const mt = u8[q++];
        const ml = readVlq();
        if (mt === 0x51 && ml === 3 && bpm === 120) bpm = Math.round((60000000 / ((u8[q] << 16) | (u8[q + 1] << 8) | u8[q + 2])) * 100) / 100;
        if (mt === 0x03) name = new TextDecoder().decode(u8.subarray(q, q + ml));
        q += ml;
      } else if (status === 0xf0 || status === 0xf7) {
        q += readVlq();
      } else if (type === 0x90 || type === 0x80) {
        const note = u8[q++];
        const vel = u8[q++];
        const key = `${ch}:${note}`;
        if (type === 0x90 && vel > 0) open.set(key, { tick, vel });
        else {
          const o = open.get(key);
          if (o) {
            open.delete(key);
            let t = byCh.get(ch);
            if (!t) byCh.set(ch, (t = { name: '', channel: ch, notes: [] }));
            t.notes.push({ tick: o.tick, note, velocity: o.vel / 127, length: Math.max(1, tick - o.tick) });
          }
        }
      } else if (type === 0xc0 || type === 0xd0) q += 1;
      else q += 2;
    }
    for (const t of byCh.values()) out.push({ ...t, name: name || `Channel ${t.channel + 1}` });
    p = end;
  }
  return { ppq, bpm, tracks: out.filter((t) => t.notes.length) };
}

/** Imports a .mid file: one new instrument track (with a note clip) per MIDI track / channel. */
export function importMidi(engine: AudioEngine, buf: ArrayBuffer, opts: { setTempo: boolean; atBar: number }): number {
  const midi = parseMidi(buf);
  if (opts.setTempo) engine.setBpm(midi.bpm);
  const spb = engine.stepsPerBar;
  for (const mt of midi.tracks) {
    const type: DeviceType = mt.channel === 9 ? 'tr8s' : 'polytone';
    const dev = engine.createDevice(type, mt.name.slice(0, 40));
    const track = engine.tracks.find((t) => t.deviceId === dev.id);
    if (!track) continue;
    const notes: ClipNote[] = mt.notes.map((n) => ({ step: n.tick / (midi.ppq / 4), note: n.note, velocity: n.velocity, length: Math.max(0.25, n.length / (midi.ppq / 4)) }));
    const last = Math.max(...notes.map((n) => n.step + n.length));
    track.arrangementClips = [
      { id: newSeqId('clip'), kind: 'notes', startBar: opts.atBar, lengthBars: Math.max(1, Math.ceil(last / spb)), notes, name: mt.name, color: track.color },
    ];
  }
  engine.setPlaybackMode('song_arrangement');
  engine.commitEdit();
  return midi.tracks.length;
}
