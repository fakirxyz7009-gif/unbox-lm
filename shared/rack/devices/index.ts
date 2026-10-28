/**
 * All spec-driven devices + helpers (ports, lookup, catalog groups). Pure data.
 */
import { HARDWARE_SPECS } from './hardware.ts';
import { REASON_SPECS } from './reason.ts';
import { RECORDED_INSTRUMENTS, RECORDED_KITS, SAMPLED_SPECS } from './sampled.ts';
import type { DeviceSpec, ParamDef } from './types.ts';

export type { DeviceSpec, ParamDef, PadDef, SpecKind, EngineId, PanelDef, KnobStyle } from './types.ts';

export const DEVICE_SPECS: readonly DeviceSpec[] = [...SAMPLED_SPECS, ...REASON_SPECS, ...HARDWARE_SPECS];

export const SPEC_BY_TYPE: ReadonlyMap<string, DeviceSpec> = new Map(DEVICE_SPECS.map((s) => [s.type, s]));

export function isSpecType(type: string): boolean {
  return SPEC_BY_TYPE.has(type);
}

export function paramDef(spec: DeviceSpec, key: string): ParamDef | undefined {
  return spec.params.find((p) => p.key === key);
}

export interface SpecPort {
  id: string;
  name: string;
  type: 'audio_in' | 'audio_out' | 'cv_in' | 'cv_out';
  channel?: 'left' | 'right' | 'mono';
}

const pairId = (base: 'in' | 'out', i: number, side: 'l' | 'r') => (i === 1 ? `${base}_${side}` : `${base}${i}_${side}`);

/** Stereo pair ids for input/output pair i (1-based): in_l/in_r, in2_l/in2_r … */
export function audioPair(base: 'in' | 'out', i: number): [string, string] {
  return [pairId(base, i, 'l'), pairId(base, i, 'r')];
}

export function audioInCount(spec: DeviceSpec): number {
  if (spec.ports?.audioIns !== undefined) return spec.ports.audioIns;
  return spec.kind === 'effect' ? 1 : 0;
}

export function audioOutCount(spec: DeviceSpec): number {
  if (spec.ports?.audioOuts !== undefined) return spec.ports.audioOuts;
  return spec.kind === 'player' ? 0 : 1;
}

export function hasAux(spec: DeviceSpec): boolean {
  return spec.engine === 'mixer' && spec.engineConfig?.aux === true;
}

/** Rear-panel ports of a spec device (ids are what cables and the AI use). */
export function specPorts(spec: DeviceSpec): SpecPort[] {
  const ports: SpecPort[] = [];
  const ins = audioInCount(spec);
  const outs = audioOutCount(spec);
  for (let i = 1; i <= ins; i++) {
    const label = spec.ports?.inLabels?.[i - 1] ?? (ins > 1 ? `In ${i}` : 'Audio In');
    const [l, r] = audioPair('in', i);
    ports.push({ id: l, name: `${label} L`, type: 'audio_in', channel: 'left' }, { id: r, name: `${label} R`, type: 'audio_in', channel: 'right' });
  }
  if (spec.ports?.sidechain) {
    const label = spec.engine === 'vocoder' ? 'Modulator' : 'Sidechain';
    ports.push({ id: 'sc_l', name: `${label} L`, type: 'audio_in', channel: 'left' }, { id: 'sc_r', name: `${label} R`, type: 'audio_in', channel: 'right' });
  }
  if (hasAux(spec)) ports.push({ id: 'ret_l', name: 'Aux Return L', type: 'audio_in', channel: 'left' }, { id: 'ret_r', name: 'Aux Return R', type: 'audio_in', channel: 'right' });
  for (let i = 1; i <= outs; i++) {
    const label = spec.ports?.outLabels?.[i - 1] ?? (outs > 1 ? `Out ${i}` : 'Audio Out');
    const [l, r] = audioPair('out', i);
    ports.push({ id: l, name: `${label} L`, type: 'audio_out', channel: 'left' }, { id: r, name: `${label} R`, type: 'audio_out', channel: 'right' });
  }
  if (hasAux(spec)) ports.push({ id: 'aux_l', name: 'Aux Send L', type: 'audio_out', channel: 'left' }, { id: 'aux_r', name: 'Aux Send R', type: 'audio_out', channel: 'right' });
  for (const id of specCvInputs(spec)) ports.push({ id, name: cvName(spec, id), type: 'cv_in', channel: 'mono' });
  for (const id of specCvOutputs(spec)) ports.push({ id, name: cvName(spec, id), type: 'cv_out', channel: 'mono' });
  return ports;
}

export function specCvInputs(spec: DeviceSpec): string[] {
  const ids: string[] = [];
  if (spec.kind === 'instrument') ids.push('cv_gate', 'cv_pitch', 'cv_mod');
  for (const id of spec.ports?.cvIn ?? []) if (!ids.includes(id)) ids.push(id);
  for (const p of spec.params) if (p.cv && !ids.includes(`cv_${p.key}`)) ids.push(`cv_${p.key}`);
  return ids;
}

export function specCvOutputs(spec: DeviceSpec): string[] {
  const ids: string[] = [];
  if (spec.kind === 'instrument') ids.push('env_out');
  for (const id of spec.ports?.cvOut ?? []) if (!ids.includes(id)) ids.push(id);
  return ids;
}

const CV_NAMES: Record<string, string> = {
  cv_gate: 'Gate CV',
  cv_pitch: 'Note CV',
  cv_mod: 'Mod Wheel CV',
  env_out: 'Envelope Out',
  gr_out: 'Gain Reduction',
  note_cv: 'Note CV Out',
  gate_cv: 'Gate CV Out',
  lfo1_out: 'Mod 1 Out',
  lfo2_out: 'Mod 2 Out',
};

function cvName(spec: DeviceSpec, id: string): string {
  if (CV_NAMES[id]) return CV_NAMES[id];
  const key = id.startsWith('cv_') ? id.slice(3) : id;
  const p = paramDef(spec, key);
  return p ? `${p.label} CV` : id;
}

/** Default value of every param. */
export function specDefaults(spec: DeviceSpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of spec.params) out[p.key] = p.default;
  return out;
}

/** Browser groups in display order. */
export const SPEC_GROUPS: readonly { label: string; badge: string; color: string; playable: boolean }[] = [
  { label: RECORDED_KITS, badge: 'RECORDED KITS', color: 'border-amber-400/50 text-amber-200', playable: true },
  { label: RECORDED_INSTRUMENTS, badge: 'RECORDED', color: 'border-lime-400/50 text-lime-200', playable: true },
  { label: 'Classic Synths & Samplers', badge: 'CLASSIC SYNTHS', color: 'border-sky-500/40 text-sky-300', playable: true },
  { label: 'Classic Drums & Loops', badge: 'CLASSIC DRUMS', color: 'border-orange-500/40 text-orange-300', playable: true },
  { label: 'Classic Effects', badge: 'CLASSIC FX', color: 'border-teal-500/40 text-teal-300', playable: false },
  { label: 'Half-Rack Effects', badge: 'HALF-RACK FX', color: 'border-slate-400/40 text-slate-300', playable: false },
  { label: 'Mastering & Channel', badge: 'MASTERING', color: 'border-amber-500/40 text-amber-300', playable: false },
  { label: 'Players', badge: 'PLAYERS', color: 'border-emerald-500/40 text-emerald-300', playable: false },
  { label: 'Utilities & Mixers', badge: 'UTILITIES', color: 'border-zinc-400/40 text-zinc-300', playable: false },
  { label: 'Hardware Synths', badge: 'HW SYNTHS', color: 'border-rose-500/40 text-rose-300', playable: true },
  { label: 'Grooveboxes & Production Centers', badge: 'GROOVEBOXES', color: 'border-red-500/40 text-red-300', playable: true },
  { label: 'Drum Machines', badge: 'DRUM MACHINES', color: 'border-orange-400/40 text-orange-200', playable: true },
  { label: 'Outboard Compressors & EQ', badge: 'OUTBOARD', color: 'border-yellow-500/40 text-yellow-300', playable: false },
  { label: 'Summing Mixers', badge: 'SUMMING', color: 'border-indigo-400/40 text-indigo-300', playable: false },
  { label: 'DI Boxes & Patchbays', badge: 'DI & PATCH', color: 'border-cyan-400/40 text-cyan-300', playable: false },
];
