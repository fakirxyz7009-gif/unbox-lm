/**
 * LOAD: replaces a part's instrument and keeps the part — its track (patterns, clips, mixer
 * settings), its output cables (insert effects / bus), arpeggiators playing it and its LINK.
 */
import { audioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import type { DeviceType, SequencerTrack } from '../audio/types.ts';
import { SpecDevice } from '../audio/spec/SpecDevice.ts';
import { relink } from '../audio/liveLink.ts';
import { forgetPart } from './partState.ts';

export function swapPartInstrument(track: SequencerTrack, type: DeviceType, name?: string): BaseDevice | null {
  const old = audioEngine.devices.get(track.deviceId);
  if (!old) return null;
  const outs = audioEngine.audioConnections
    .filter((c) => c.sourceDeviceId === old.id)
    .map((c) => ({ sp: c.sourcePortId, t: c.targetDeviceId, tp: c.targetPortId, color: c.color }));
  const players = [...audioEngine.devices.values()].filter((d): d is SpecDevice => d instanceof SpecDevice && !!d.engine.player && d.target === old.id);

  const dev = audioEngine.createDevice(type, name);
  // the new instrument got its own track and master cables: the part keeps its own instead
  const auto = audioEngine.tracks.findIndex((t) => t.deviceId === dev.id);
  if (auto >= 0) audioEngine.tracks.splice(auto, 1);
  audioEngine.audioConnections.filter((c) => c.sourceDeviceId === dev.id).forEach((c) => audioEngine.disconnectAudio(c.id));

  const keepName = track.name === old.name;
  track.deviceId = dev.id;
  if (keepName) track.name = dev.name;
  // Automation the part had follows the new instrument, so removing the old unit does not delete it.
  audioEngine.automation.retargetDevice(old.id, dev.id, (param) => param in dev.params);
  audioEngine.removeDevice(old.id, true);
  outs.forEach((o) => audioEngine.connectAudio(dev.id, o.sp, o.t, o.tp, o.color));
  players.forEach((p) => audioEngine.setPlayerTarget(p.id, dev.id));
  relink(old.id, dev.id);
  forgetPart(old.id);
  audioEngine.updateTrackChannelStrip(track.id);
  audioEngine.changed();
  return dev;
}
