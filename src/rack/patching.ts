/**
 * Connection rules for rear-panel patching. The cable UI and the AI Combinator applier both use
 * canConnect(), so a cable the user can't draw is also a cable the AI can't create.
 */
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { AudioConnection, CVConnection, PortDefinition, PortType } from '../audio/types.ts';

export const MASTER_ID = 'master';
export const MASTER_PORTS: PortDefinition[] = [
  { id: 'master_l', name: 'Master In L', type: 'audio_in', channel: 'left' },
  { id: 'master_r', name: 'Master In R', type: 'audio_in', channel: 'right' },
];

export interface JackRef {
  deviceId: string;
  portId: string;
}

export interface JackInfo extends JackRef {
  port: PortDefinition;
  deviceName: string;
}

export type CableKind = 'audio' | 'cv';

export const jackKey = (j: JackRef): string => `${j.deviceId}:${j.portId}`;

/**
 * Channel-list jacks (rear of the rack's right column) stand for the master inputs of one mixer
 * channel: master cables are drawn into the row of the strip they feed, and a row only takes a
 * cable whose chain belongs to that channel.
 */
export const channelJackKey = (channelId: string, portId: string): string => `chan:${channelId}:${portId}`;

export function channelJack(key: string): { channelId: string; real: JackRef } | null {
  if (!key.startsWith('chan:')) return null;
  const i = key.lastIndexOf(':');
  return { channelId: key.slice(5, i), real: { deviceId: MASTER_ID, portId: key.slice(i + 1) } };
}

export function parseJackKey(key: string): JackRef {
  const chan = channelJack(key);
  if (chan) return chan.real;
  const i = key.indexOf(':');
  return { deviceId: key.slice(0, i), portId: key.slice(i + 1) };
}

/** Where a master cable is drawn: its channel row when one is on screen, else the master jack. */
export function displayTarget(conn: AudioConnection | CVConnection, has: (key: string) => boolean): string {
  const real = `${conn.targetDeviceId}:${conn.targetPortId}`;
  if (conn.targetDeviceId !== MASTER_ID || !('stripId' in conn) || !conn.stripId) return real;
  const chan = channelJackKey(conn.stripId, conn.targetPortId);
  return has(chan) ? chan : real;
}

const isOutput = (t: PortType) => t.endsWith('_out');
const isCv = (t: PortType) => t.startsWith('cv');

export function resolveJack(engine: AudioEngine, ref: JackRef): JackInfo | null {
  if (ref.deviceId === MASTER_ID) {
    const port = MASTER_PORTS.find((p) => p.id === ref.portId);
    return port ? { ...ref, port, deviceName: 'Master' } : null;
  }
  const dev = engine.devices.get(ref.deviceId);
  const port = dev?.ports.find((p) => p.id === ref.portId);
  return dev && port ? { ...ref, port, deviceName: dev.name } : null;
}

export type Verdict =
  | { ok: true; kind: CableKind; source: JackInfo; target: JackInfo; replaces: string[] }
  | { ok: false; reason: string };

/** True when audio from `from` can already reach `to` — adding to → from would close a loop. */
function reaches(conns: AudioConnection[], from: string, to: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop() as string;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    conns.forEach((c) => {
      if (c.sourceDeviceId === id && c.targetDeviceId !== MASTER_ID) stack.push(c.targetDeviceId);
    });
  }
  return false;
}

/** Can jacks `a` and `b` be joined by a cable (in either drag direction)? */
export function canConnect(engine: AudioEngine, a: JackRef, b: JackRef): Verdict {
  const ja = resolveJack(engine, a);
  const jb = resolveJack(engine, b);
  if (!ja || !jb) return { ok: false, reason: 'Jack not found' };
  if (ja.deviceId === jb.deviceId && ja.portId === jb.portId) return { ok: false, reason: 'Same jack' };
  if (isCv(ja.port.type) !== isCv(jb.port.type)) {
    return { ok: false, reason: isCv(ja.port.type) ? 'CV cables only fit CV jacks' : 'Audio cables only fit audio jacks' };
  }
  if (isOutput(ja.port.type) === isOutput(jb.port.type)) {
    return { ok: false, reason: isOutput(ja.port.type) ? 'Both are outputs — patch an output into an input' : 'Both are inputs — patch an output into an input' };
  }
  const [source, target] = isOutput(ja.port.type) ? [ja, jb] : [jb, ja];
  const kind: CableKind = isCv(source.port.type) ? 'cv' : 'audio';
  if (source.deviceId === target.deviceId) {
    return { ok: false, reason: kind === 'audio' ? "A device can't feed its own input" : "A device can't modulate itself" };
  }
  const list: (AudioConnection | CVConnection)[] = kind === 'audio' ? engine.audioConnections : engine.cvConnections;
  const same = (c: AudioConnection | CVConnection) =>
    c.sourceDeviceId === source.deviceId && c.sourcePortId === source.portId && c.targetDeviceId === target.deviceId && c.targetPortId === target.portId;
  if (list.some(same)) return { ok: false, reason: 'Already connected' };
  if (kind === 'audio' && target.deviceId !== MASTER_ID && reaches(engine.audioConnections, target.deviceId, source.deviceId)) {
    return { ok: false, reason: 'That would create a feedback loop' };
  }
  // One cable per input jack (the master bus accepts many).
  const replaces =
    target.deviceId === MASTER_ID ? [] : list.filter((c) => c.targetDeviceId === target.deviceId && c.targetPortId === target.portId).map((c) => c.id);
  return { ok: true, kind, source, target, replaces };
}

/** Apply a successful verdict: unplug what it replaces, then plug the new cable. */
export function applyVerdict(engine: AudioEngine, v: Extract<Verdict, { ok: true }>, color?: string, amount = 1): string | null {
  v.replaces.forEach((id) => (v.kind === 'audio' ? engine.disconnectAudio(id) : engine.disconnectCV(id)));
  return v.kind === 'audio'
    ? engine.connectAudio(v.source.deviceId, v.source.portId, v.target.deviceId, v.target.portId, color)
    : engine.connectCV(v.source.deviceId, v.source.portId, v.target.deviceId, v.target.portId, amount, color);
}

export interface CableAtJack {
  id: string;
  kind: CableKind;
  color: string;
  other: JackRef;
  conn: AudioConnection | CVConnection;
}

/** Cables plugged into a jack, oldest first. */
export function cablesAt(engine: AudioEngine, ref: JackRef): CableAtJack[] {
  const out: CableAtJack[] = [];
  const scan = (list: (AudioConnection | CVConnection)[], kind: CableKind) =>
    list.forEach((c) => {
      if (c.sourceDeviceId === ref.deviceId && c.sourcePortId === ref.portId) {
        out.push({ id: c.id, kind, color: c.color, other: { deviceId: c.targetDeviceId, portId: c.targetPortId }, conn: c });
      } else if (c.targetDeviceId === ref.deviceId && c.targetPortId === ref.portId) {
        out.push({ id: c.id, kind, color: c.color, other: { deviceId: c.sourceDeviceId, portId: c.sourcePortId }, conn: c });
      }
    });
  scan(engine.audioConnections, 'audio');
  scan(engine.cvConnections, 'cv');
  return out;
}

export function unplug(engine: AudioEngine, kind: CableKind, id: string): void {
  if (kind === 'audio') engine.disconnectAudio(id);
  else engine.disconnectCV(id);
}

/** Re-create a cable exactly as it was (used when a drag is cancelled). */
export function restoreCable(engine: AudioEngine, kind: CableKind, conn: AudioConnection | CVConnection): void {
  if (kind === 'audio') engine.connectAudio(conn.sourceDeviceId, conn.sourcePortId, conn.targetDeviceId, conn.targetPortId, conn.color);
  else engine.connectCV(conn.sourceDeviceId, conn.sourcePortId, conn.targetDeviceId, conn.targetPortId, (conn as CVConnection).amount, conn.color);
}
