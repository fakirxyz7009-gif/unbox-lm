/**
 * RackPatchPlan: what the AI Combinator (Gemini or the local planner) proposes, and validatePlan(),
 * which turns untrusted model output into a plan that only references real library items, real
 * built-in devices, real ports and an acyclic audio graph.
 */
import { BUILTIN_BY_TYPE, VST_PARAM_RANGES, vstPortLayout, type BuiltinDeviceSpec, type ParamRange, type RackRole, type UnitPortLayout } from './builtinCatalog.ts';
import { isMountable, type ManifestItem, type MountableItem, type VstManifest } from '../vst/manifestTypes.ts';

export const MAX_PLAN_UNITS = 10;
export const MAX_PLAN_MACROS = 4;
export const MASTER = 'master' as const;

export type ParamValue = number | string | boolean;

export interface PlanUnit {
  source: 'builtin' | 'library';
  /** Built-in DeviceType (source = builtin). */
  type?: string;
  /** Manifest item id (source = library). */
  itemId?: string;
  presetId?: string;
  name: string;
  role: RackRole;
  params: Record<string, ParamValue>;
  /** Matrix sequencer pattern (built-in matrix only): semitones, gates, curve 0..1. */
  pattern?: { notes: number[]; gates: boolean[]; curve: number[] };
  why?: string;
}

export interface PlanAudioEdge {
  from: number;
  to: number | typeof MASTER;
}

export interface PlanCvEdge {
  from: number;
  fromPort: string;
  to: number;
  toPort: string;
  amount: number;
}

export interface PlanMacroTarget {
  unit: number;
  param: string;
  min: number;
  max: number;
}

export interface PlanMacro {
  label: string;
  value: number;
  targets: PlanMacroTarget[];
}

export interface RackPatchPlan {
  name: string;
  description: string;
  bpm?: number;
  units: PlanUnit[];
  audio: PlanAudioEdge[];
  cv: PlanCvEdge[];
  macros: PlanMacro[];
  /** Effect-only chain: its first input should be fed from an existing rack unit. */
  needsInput: boolean;
}

export interface PlanContext {
  items: Map<string, ManifestItem>;
  builtins: Map<string, BuiltinDeviceSpec>;
}

export function planContextFromManifest(manifest: VstManifest | null): PlanContext {
  return { items: new Map((manifest?.items ?? []).map((i) => [i.id, i])), builtins: BUILTIN_BY_TYPE };
}

export interface UnitShape extends UnitPortLayout {
  params: Record<string, ParamRange>;
  options: Record<string, string[]>;
  booleans: string[];
}

/** Ports and params a plan unit will have once mounted. */
export function unitShape(unit: PlanUnit, ctx: PlanContext): UnitShape | null {
  if (unit.source === 'builtin') {
    const spec = unit.type ? ctx.builtins.get(unit.type) : undefined;
    if (!spec) return null;
    return { ...spec, options: spec.options ?? {}, booleans: spec.booleans ?? [] };
  }
  const item = unit.itemId ? ctx.items.get(unit.itemId) : undefined;
  if (!item || !isMountable(item)) return null;
  return { ...vstPortLayout(roleOfItem(item)), params: VST_PARAM_RANGES, options: {}, booleans: [] };
}

export function roleOfItem(item: MountableItem): 'effect' | 'instrument' {
  return item.kind === 'plugin' ? item.role : 'instrument';
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const clamp = (v: number, r: ParamRange) => Math.min(Math.max(r.min, r.max), Math.max(Math.min(r.min, r.max), v));
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Params may arrive as an object or as [{ key, value | number | text }] (Gemini schema form). */
function rawParams(v: unknown): [string, unknown][] {
  if (isObj(v)) return Object.entries(v);
  return asArray(v)
    .filter(isObj)
    .map((p) => [str(p.key, 40), p.value ?? p.number ?? p.text] as [string, unknown])
    .filter(([k]) => !!k);
}

function cleanParams(raw: unknown, shape: UnitShape, unitName: string, warnings: string[]): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  const dropped: string[] = [];
  for (const [key, value] of rawParams(raw)) {
    const range = shape.params[key];
    const n = num(value);
    if (range && n !== undefined) out[key] = clamp(n, range);
    else if (shape.options[key] && typeof value === 'string') {
      const match = shape.options[key].find((o) => o.toLowerCase() === value.toLowerCase());
      if (match) out[key] = match;
      else dropped.push(key);
    } else if (shape.booleans.includes(key) && (typeof value === 'boolean' || value === 'true' || value === 'false')) {
      out[key] = value === true || value === 'true';
    } else dropped.push(key);
  }
  if (dropped.length) warnings.push(`${unitName}: ignored unknown or invalid params ${dropped.join(', ')}`);
  return out;
}

function cleanPattern(raw: unknown): PlanUnit['pattern'] {
  if (!isObj(raw)) return undefined;
  const notes = asArray(raw.notes).slice(0, 32).map((n) => Math.round(Math.max(-24, Math.min(24, num(n) ?? 0))));
  if (!notes.length) return undefined;
  const gates = notes.map((_, i) => asArray(raw.gates)[i] !== false && asArray(raw.gates)[i] !== 'false');
  const curve = notes.map((_, i) => Math.max(0, Math.min(1, num(asArray(raw.curve ?? raw.curveCV)[i]) ?? 0.5)));
  return { notes, gates, curve };
}

/** True when adding from → to would close a loop in the audio graph. */
function createsCycle(edges: PlanAudioEdge[], from: number, to: number): boolean {
  const stack = [to];
  const seen = new Set<number>();
  while (stack.length) {
    const n = stack.pop() as number;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    edges.forEach((e) => {
      if (e.from === n && e.to !== MASTER) stack.push(e.to);
    });
  }
  return false;
}

export function validatePlan(raw: unknown, ctx: PlanContext): { plan: RackPatchPlan; warnings: string[] } {
  const warnings: string[] = [];
  const src = isObj(raw) ? raw : {};
  const units: PlanUnit[] = [];
  const shapes: UnitShape[] = [];
  const indexMap = new Map<number, number>();

  asArray(src.units).forEach((u, rawIndex) => {
    if (!isObj(u)) return;
    if (units.length >= MAX_PLAN_UNITS) {
      warnings.push(`Plan trimmed to ${MAX_PLAN_UNITS} units`);
      return;
    }
    const itemId = str(u.itemId ?? u.manifestId, 64);
    const type = str(u.type, 40);
    const source = u.source === 'library' || (!type && itemId) ? 'library' : 'builtin';
    let unit: PlanUnit;
    if (source === 'library') {
      const item = ctx.items.get(itemId);
      if (!item || !isMountable(item)) {
        warnings.push(`Dropped unknown library item "${itemId || str(u.name, 60)}"`);
        return;
      }
      let presetId: string | undefined = str(u.presetId, 64) || undefined;
      const preset = presetId ? ctx.items.get(presetId) : undefined;
      if (presetId && !(preset?.kind === 'preset' && preset.targetId === item.id)) {
        warnings.push(`${item.name}: ignored preset that does not belong to it`);
        presetId = undefined;
      }
      unit = { source, itemId: item.id, presetId, name: item.name, role: roleOfItem(item), params: {}, why: str(u.why, 200) || undefined };
    } else {
      const spec = ctx.builtins.get(type);
      if (!spec) {
        warnings.push(`Dropped unknown built-in device "${type || str(u.name, 60)}"`);
        return;
      }
      unit = { source, type: spec.type, name: str(u.name, 60) || spec.name, role: spec.role, params: {}, why: str(u.why, 200) || undefined };
      if (spec.type === 'matrix') unit.pattern = cleanPattern(u.pattern ?? u.matrixPattern);
    }
    const shape = unitShape(unit, ctx) as UnitShape;
    unit.params = cleanParams(u.params, shape, unit.name, warnings);
    indexMap.set(rawIndex, units.length);
    units.push(unit);
    shapes.push(shape);
  });

  const mapIndex = (v: unknown): number | undefined => {
    const n = num(v);
    return n === undefined ? undefined : indexMap.get(Math.round(n));
  };

  // Audio: stereo-pair edges (out_l/out_r → in_l/in_r). One cable per input; master takes many.
  const audio: PlanAudioEdge[] = [];
  const fedInputs = new Set<number>();
  for (const e of asArray(src.audio ?? src.audioConnections)) {
    if (!isObj(e)) continue;
    const from = mapIndex(e.from ?? e.sourceDeviceIndex);
    const rawTo = e.to ?? e.targetDeviceIndex;
    const toMaster = rawTo === MASTER || num(rawTo) === -1;
    const to = toMaster ? MASTER : mapIndex(rawTo);
    if (from === undefined || to === undefined) continue;
    if (!shapes[from].audioOut) {
      warnings.push(`${units[from].name} has no audio output`);
      continue;
    }
    if (to !== MASTER) {
      if (to === from || !shapes[to].audioIn) continue;
      if (fedInputs.has(to)) {
        warnings.push(`${units[to].name} already has an input cable — skipped a second one`);
        continue;
      }
      if (createsCycle(audio, from, to)) {
        warnings.push(`Skipped ${units[from].name} → ${units[to].name}: it would create a feedback loop`);
        continue;
      }
      fedInputs.add(to);
    }
    if (!audio.some((a) => a.from === from && a.to === to)) audio.push({ from, to });
  }
  // No unit→unit cables at all: chain the audio units in listed order (source → effects).
  if (!audio.some((a) => a.to !== MASTER)) {
    const audioUnits = units.map((_, i) => i).filter((i) => shapes[i].audioOut || shapes[i].audioIn);
    for (let k = 0; k + 1 < audioUnits.length; k++) {
      const [a, b] = [audioUnits[k], audioUnits[k + 1]];
      if (shapes[a].audioOut && shapes[b].audioIn && !fedInputs.has(b)) {
        audio.push({ from: a, to: b });
        fedInputs.add(b);
      }
    }
    for (let i = audio.length - 1; i >= 0; i--) {
      const e = audio[i];
      if (e.to === MASTER && audio.some((x) => x.from === e.from && x.to !== MASTER)) audio.splice(i, 1);
    }
  }
  // Anything that makes sound but goes nowhere is routed to the master.
  units.forEach((_, i) => {
    if (shapes[i].audioOut && !audio.some((a) => a.from === i)) audio.push({ from: i, to: MASTER });
  });

  // CV: real port names only, one cable per CV input.
  const cv: PlanCvEdge[] = [];
  for (const e of asArray(src.cv ?? src.cvConnections)) {
    if (!isObj(e)) continue;
    const from = mapIndex(e.from ?? e.sourceDeviceIndex);
    const to = mapIndex(e.to ?? e.targetDeviceIndex);
    const fromPort = str(e.fromPort ?? e.sourceJack, 40);
    const toPort = str(e.toPort ?? e.targetJack, 40);
    if (from === undefined || to === undefined || from === to) continue;
    if (!shapes[from].cvOut.includes(fromPort) || !shapes[to].cvIn.includes(toPort)) {
      warnings.push(`Skipped CV ${units[from].name}:${fromPort} → ${units[to].name}:${toPort} (no such jack)`);
      continue;
    }
    if (cv.some((c) => c.to === to && c.toPort === toPort)) continue;
    cv.push({ from, fromPort, to, toPort, amount: Math.max(-1, Math.min(1, num(e.amount) ?? 0.6)) });
  }

  // Macros: Combinator knobs mapped onto real numeric params.
  const macros: PlanMacro[] = [];
  for (const m of asArray(src.macros)) {
    if (!isObj(m) || macros.length >= MAX_PLAN_MACROS) continue;
    const targets: PlanMacroTarget[] = [];
    for (const t of asArray(m.targets)) {
      if (!isObj(t)) continue;
      const unit = mapIndex(t.unit);
      const param = str(t.param, 40);
      if (unit === undefined) continue;
      const range = shapes[unit].params[param];
      if (!range || targets.some((x) => x.unit === unit && x.param === param)) continue;
      targets.push({ unit, param, min: clamp(num(t.min) ?? range.min, range), max: clamp(num(t.max) ?? range.max, range) });
    }
    if (targets.length) macros.push({ label: str(m.label, 24) || `Macro ${macros.length + 1}`, value: Math.max(0, Math.min(1, num(m.value) ?? 0.5)), targets });
  }

  const plan: RackPatchPlan = {
    name: str(src.name ?? src.rackName, 60) || 'AI Combi',
    description: str(src.description, 300),
    bpm: num(src.bpm) !== undefined ? Math.round(Math.max(40, Math.min(240, num(src.bpm) as number))) : undefined,
    units,
    audio,
    cv,
    macros,
    needsInput: false,
  };
  plan.needsInput = units.length > 0 && !units.some((u) => u.role === 'instrument') && units.some((_, i) => shapes[i].audioIn);
  if (!plan.macros.length) plan.macros = suggestMacros(plan, ctx);
  if (!units.length) warnings.push('The plan contained no usable units');
  return { plan, warnings };
}

// ---------------------------------------------------------------------------------------------
// Default Combinator macros
// ---------------------------------------------------------------------------------------------

/** Brightness-like macro index per instrument category (0-based macro slot). */
const TONE_SLOT: Partial<Record<string, number>> = {
  piano: 0, keys: 0, guitar: 0, strings: 1, brass: 1, winds: 1, orchestral: 1, choir: 1, synth: 0, sampler: 0, bass: 0, unknown: 0,
};

/** Up to four musically useful knobs: Tone, Drive, Space, Movement/Loudness. */
export function suggestMacros(plan: RackPatchPlan, ctx: PlanContext): PlanMacro[] {
  const macros: PlanMacro[] = [];
  const add = (label: string, targets: PlanMacroTarget[], value = 0.5) => {
    if (targets.length && macros.length < MAX_PLAN_MACROS && !macros.some((m) => m.label === label)) macros.push({ label, value, targets });
  };
  const categoryOf = (u: PlanUnit) => {
    const item = u.itemId ? ctx.items.get(u.itemId) : undefined;
    return item && 'category' in item ? item.category : ctx.builtins.get(u.type ?? '')?.category;
  };

  const tone: PlanMacroTarget[] = [];
  plan.units.forEach((u, i) => {
    const cat = categoryOf(u);
    if (u.source === 'library' && cat === 'eq') {
      tone.push({ unit: i, param: 'macro1', min: 0.62, max: 0.4 }, { unit: i, param: 'macro4', min: 0.38, max: 0.68 });
    } else if (u.source === 'library' && u.role === 'instrument' && cat && cat !== 'drums' && cat !== 'percussion') {
      tone.push({ unit: i, param: `macro${(TONE_SLOT[cat] ?? 0) + 1}`, min: 0.15, max: 0.9 });
    } else if (u.source === 'builtin' && u.role === 'instrument') {
      const m = ctx.builtins.get(u.type ?? '')?.macro;
      if (m) tone.push({ unit: i, param: m.param, min: m.min, max: m.max });
    }
  });
  add('Tone', tone);

  const byCategory = (cats: string[], param: (u: PlanUnit) => PlanMacroTarget | null) =>
    plan.units.flatMap((u, i) => (cats.includes(String(categoryOf(u))) && u.role === 'effect' ? [param(u)].filter((t): t is PlanMacroTarget => !!t).map((t) => ({ ...t, unit: i })) : []));
  const builtinMacro = (u: PlanUnit): PlanMacroTarget | null => {
    const m = ctx.builtins.get(u.type ?? '')?.macro;
    return m ? { unit: 0, param: m.param, min: m.min, max: m.max } : null;
  };
  const vst = (param: string, min: number, max: number) => (u: PlanUnit): PlanMacroTarget | null =>
    u.source === 'library' ? { unit: 0, param, min, max } : builtinMacro(u);

  add('Drive', byCategory(['saturation'], vst('macro1', 0.05, 0.85)), 0.35);
  add('Space', [...byCategory(['reverb'], vst('mix', 0, 0.7)), ...byCategory(['delay'], vst('mix', 0, 0.5))], 0.4);
  add('Pitch', byCategory(['pitch'], vst('macro1', 0.25, 0.75)), 0.5);
  add('Loudness', byCategory(['limiter'], vst('macro1', 0.1, 0.8)), 0.35);
  add('Glue', byCategory(['dynamics'], builtinMacro), 0.3);
  const lfo = plan.units.findIndex((u) => u.type === 'pulsar');
  if (lfo >= 0) add('Movement', [{ unit: lfo, param: 'depth1', min: 0, max: 1 }], 0.6);
  return macros;
}
