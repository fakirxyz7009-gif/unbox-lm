/**
 * AI Combinator, browser side: get a RackPatchPlan (server: Gemini → local planner; offline: local
 * planner in the app), then mount the units, patch audio + CV through the same canConnect() rules
 * the cable UI uses, and wrap everything in a Combinator group with macro knobs.
 */
import type { AudioEngine } from '../audio/AudioEngine.ts';
import { SpecDevice } from '../audio/spec/SpecDevice.ts';
import type { MatrixDevice } from '../audio/devices/MatrixDevice.ts';
import type { DeviceType, RackMacro } from '../audio/types.ts';
import { applyVerdict, canConnect, MASTER_ID } from '../rack/patching.ts';
import { vstLibrary } from '../vst/libraryClient.ts';
import { snapshotFromItem } from '../vst/VstPluginDevice.ts';
import { planLocally } from '../../shared/rack/localPlanner.ts';
import { MASTER, type PlanUnit, type RackPatchPlan } from '../../shared/rack/patchPlan.ts';
import { isMountable } from '../../shared/vst/manifestTypes.ts';

export type PlanSource = 'gemini' | 'local' | 'local-offline';

export interface PlanResponse {
  plan: RackPatchPlan;
  source: PlanSource;
  warnings: string[];
  model?: string;
}

export async function requestRackPlan(prompt: string, preferCloud = false): Promise<PlanResponse> {
  if (!preferCloud) {
    try {
      const { localHardwareAi } = await import('./hardware/localHardwareAiEngine.ts');
      const hw = await localHardwareAi.planRackOnHardware(prompt);
      return {
        plan: hw.plan,
        source: 'local-offline',
        warnings: hw.warnings,
      };
    } catch {
      // Continue to cloud/local fallback
    }
  }
  let res: Response | null = null;
  try {
    res = await fetch('/api/ai/combinator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    res = null;
  }
  if (res) {
    const data = (await res.json().catch(() => null)) as (Partial<PlanResponse> & { error?: string }) | null;
    if (res.ok && data?.plan) return data as PlanResponse;
    // Bad prompt / rate limit are answers for the user, not reasons to plan offline.
    if (res.status === 400 || res.status === 429) throw new Error(data?.error ?? `Request rejected (HTTP ${res.status})`);
  }
  const manifest = vstLibrary.manifest ?? (await vstLibrary.load());
  const local = planLocally(prompt, manifest);
  return {
    plan: local.plan,
    source: 'local-offline',
    warnings: ['AI server unreachable — planned inside the app with the local planner.', ...local.warnings],
  };
}

export interface ApplyResult {
  groupId: string | null;
  deviceIds: string[];
  /** First instrument created (for keyboard / sequencer focus). */
  instrumentId: string | null;
  audioCables: number;
  cvCables: number;
  bpmSet?: number;
  fedFrom?: string;
  warnings: string[];
}

function applyMatrixPattern(dev: MatrixDevice, pattern: NonNullable<PlanUnit['pattern']>): void {
  const target = dev.patterns[0];
  pattern.notes.slice(0, 32).forEach((n, i) => {
    target.notes[i] = n;
    target.gates[i] = pattern.gates[i] ?? true;
    target.curveCV[i] = pattern.curve[i] ?? 0.5;
  });
  dev.setParam('activePattern', 0);
  dev.setParam('numSteps', Math.min(32, pattern.notes.length));
}

/** Follow a device's audio chain to the unit that feeds the master bus. */
function chainTail(engine: AudioEngine, deviceId: string): string {
  let tail = deviceId;
  for (let hop = 0; hop < 16; hop++) {
    if (engine.audioConnections.some((c) => c.sourceDeviceId === tail && c.targetDeviceId === MASTER_ID)) return tail;
    const next = engine.audioConnections.find((c) => c.sourceDeviceId === tail && c.sourcePortId === 'out_l');
    if (!next) return tail;
    tail = next.targetDeviceId;
  }
  return tail;
}

function patchStereo(engine: AudioEngine, from: string, to: string, warnings: string[]): number {
  const pairs: [string, string][] = to === MASTER_ID ? [['out_l', 'master_l'], ['out_r', 'master_r']] : [['out_l', 'in_l'], ['out_r', 'in_r']];
  let made = 0;
  for (const [out, inp] of pairs) {
    const v = canConnect(engine, { deviceId: from, portId: out }, { deviceId: to, portId: inp });
    if (v.ok && applyVerdict(engine, v)) made++;
    else if (!v.ok) warnings.push(`${engine.devices.get(from)?.name ?? from} → ${to === MASTER_ID ? 'Master' : engine.devices.get(to)?.name ?? to}: ${v.reason}`);
  }
  return made;
}

/** Applies an AI rack plan as one undo step: undo takes the whole build back. */
export function applyRackPlan(
  engine: AudioEngine,
  plan: RackPatchPlan,
  opts: { prompt: string; source: PlanSource; feedFrom?: string | null }
): ApplyResult {
  return engine.runStructuralEdit('Build rack plan', () => buildRackPlan(engine, plan, opts));
}

function buildRackPlan(
  engine: AudioEngine,
  plan: RackPatchPlan,
  opts: { prompt: string; source: PlanSource; feedFrom?: string | null }
): ApplyResult {
  const warnings: string[] = [];
  const before = new Set(engine.devices.keys());
  const ids: (string | null)[] = [];

  // 1. Mount units in plan order (they stack in the rack in this order).
  for (const unit of plan.units) {
    try {
      if (unit.source === 'library') {
        const item = vstLibrary.item(unit.itemId);
        if (!item || !isMountable(item)) {
          warnings.push(`${unit.name}: not in the loaded library — skipped`);
          ids.push(null);
          continue;
        }
        ids.push(engine.createVstDevice(snapshotFromItem(item, vstLibrary.manifest), { presetId: unit.presetId, params: unit.params }).id);
      } else {
        const dev = engine.createDevice(unit.type as DeviceType, unit.name);
        Object.entries(unit.params).forEach(([k, v]) => dev.setParam(k, v));
        if (unit.type === 'matrix' && unit.pattern) applyMatrixPattern(dev as MatrixDevice, unit.pattern);
        ids.push(dev.id);
      }
    } catch (e) {
      warnings.push(`${unit.name}: ${(e as Error).message}`);
      ids.push(null);
    }
  }
  const created = ids.filter((id): id is string => !!id);

  // 2. New instruments arrive auto-patched to the master; the plan decides their routing instead.
  created.forEach((id) =>
    engine.audioConnections
      .filter((c) => c.sourceDeviceId === id)
      .map((c) => c.id)
      .forEach((cid) => engine.disconnectAudio(cid))
  );

  // 3. Audio: stereo pairs, master last.
  let audioCables = 0;
  for (const e of plan.audio) {
    const from = ids[e.from];
    const to = e.to === MASTER ? MASTER_ID : ids[e.to];
    if (from && to) audioCables += patchStereo(engine, from, to, warnings);
  }

  // 4. Effect-only chains are inserted after the selected (or most recent) source.
  let fedFrom: string | undefined;
  if (plan.needsInput) {
    const headIndex = plan.units.findIndex(
      (_, i) => !!ids[i] && engine.devices.get(ids[i] as string)?.ports.some((p) => p.type === 'audio_in') && !plan.audio.some((a) => a.to === i)
    );
    const head = headIndex >= 0 ? ids[headIndex] : null;
    const candidates = [opts.feedFrom, ...Array.from(engine.devices.keys()).reverse()].filter(
      (id): id is string => !!id && before.has(id) && !!engine.devices.get(id)?.ports.some((p) => p.id === 'out_l')
    );
    const feedSource = candidates[0];
    if (head && feedSource) {
      const tail = chainTail(engine, feedSource);
      engine.audioConnections
        .filter((c) => c.sourceDeviceId === tail && c.targetDeviceId === MASTER_ID)
        .map((c) => c.id)
        .forEach((cid) => engine.disconnectAudio(cid));
      audioCables += patchStereo(engine, tail, head, warnings);
      fedFrom = tail;
    } else if (head) {
      warnings.push('Nothing in the rack can feed this effect chain yet — patch a source into its input on the rear panel.');
    }
  }

  // 5. CV.
  let cvCables = 0;
  for (const c of plan.cv) {
    const from = ids[c.from];
    const to = ids[c.to];
    if (!from || !to) continue;
    const v = canConnect(engine, { deviceId: from, portId: c.fromPort }, { deviceId: to, portId: c.toPort });
    if (v.ok && v.kind === 'cv') {
      if (applyVerdict(engine, v, undefined, c.amount)) cvCables++;
    } else warnings.push(`CV ${c.fromPort} → ${c.toPort}: ${v.ok ? 'not a CV jack' : v.reason}`);
  }

  // 6. Combinator group. Each macro starts where its first target already is, so plan params survive.
  const macros: RackMacro[] = plan.macros
    .map((m, i) => ({
      id: `macro_${i + 1}`,
      label: m.label,
      value: m.value,
      targets: m.targets.flatMap((t) => {
        const deviceId = ids[t.unit];
        return deviceId ? [{ deviceId, param: t.param, min: t.min, max: t.max }] : [];
      }),
    }))
    .filter((m) => m.targets.length > 0)
    .map((m) => {
      const t = m.targets[0];
      const current = Number(engine.devices.get(t.deviceId)?.params[t.param]);
      const span = t.max - t.min;
      return Number.isFinite(current) && span !== 0 ? { ...m, value: Math.max(0, Math.min(1, (current - t.min) / span)) } : m;
    });
  const group = created.length
    ? engine.addRackGroup({
        name: plan.name,
        deviceIds: created,
        macros,
        source: opts.source === 'gemini' ? 'gemini' : 'local',
        prompt: opts.prompt,
        description: plan.description,
      })
    : null;

  // 7. Tempo only for an empty session — never re-time someone's existing song.
  let bpmSet: number | undefined;
  const hasNotes = engine.tracks.some(
    (t) => t.steps.some(Boolean) || (t.patternList ?? []).some((p) => p.steps.some(Boolean)) || (t.arrangementClips ?? []).some((c) => (c.notes ?? []).length > 0)
  );
  if (plan.bpm && !hasNotes) {
    engine.setBpm(plan.bpm);
    bpmSet = plan.bpm;
  }

  const instrumentId = created.find((id) => engine.isPlayableInstrument(engine.devices.get(id)?.type ?? 'vst_effect')) ?? null;
  // Players (arps, chords, Beat Map …) play this patch's instrument
  if (instrumentId) {
    created.forEach((id) => {
      const d = engine.devices.get(id);
      if (d instanceof SpecDevice && d.spec.kind === 'player') engine.setPlayerTarget(id, instrumentId);
    });
  }
  return { groupId: group?.id ?? null, deviceIds: created, instrumentId, audioCables, cvCables, bpmSet, fedFrom, warnings };
}
