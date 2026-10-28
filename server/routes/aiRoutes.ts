/**
 * Gemini-backed AI routes. Every route has a deterministic fallback so the app keeps working
 * without GEMINI_API_KEY. Model output is never trusted: rack plans go through validatePlan().
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { rankBuiltins, vstPortLayout } from '../../shared/rack/builtinCatalog.ts';
import { planLocally } from '../../shared/rack/localPlanner.ts';
import { localPreset, validatePreset, type CraftedPreset, type PresetParam } from '../../shared/rack/presetCraft.ts';
import { planContextFromManifest, validatePlan } from '../../shared/rack/patchPlan.ts';
import { CATEGORY_LABELS } from '../../shared/vst/categories.ts';
import { isMountable, type ManifestItem, type MountableItem, type VstManifest } from '../../shared/vst/manifestTypes.ts';
import { searchManifest } from '../../shared/vst/search.ts';
import type { ManifestStore } from '../vst/manifestStore.ts';

const AI_TIMEOUT_MS = 30_000;
const MAX_PROMPT = 2000;
const textModel = () => process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

// ---- Per-IP rate limit + prompt length cap (AI routes only) ----
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();
function aiGuard(req: Request, res: Response, next: NextFunction) {
  const max = Number(process.env.AI_RATE_LIMIT_PER_MIN || 20);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  else if (++entry.count > max) return res.status(429).json({ error: 'Too many AI requests. Please wait a minute.' });
  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  const p: unknown = req.body?.prompt;
  if (p !== undefined && (typeof p !== 'string' || p.length > MAX_PROMPT)) {
    return res.status(400).json({ error: `Prompt must be a string up to ${MAX_PROMPT} characters.` });
  }
  next();
}

// ---- Gemini client (created on first use so env files loaded later still apply) ----
let client: GoogleGenAI | null | undefined;
function gemini(): GoogleGenAI | null {
  if (client !== undefined) return client;
  const key = process.env.GEMINI_API_KEY;
  client = key && key !== 'MY_GEMINI_API_KEY' ? new GoogleGenAI({ apiKey: key, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } }) : null;
  return client;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('AI request timed out')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function generate(ai: GoogleGenAI, params: Parameters<GoogleGenAI['models']['generateContent']>[0]) {
  return withTimeout(ai.models.generateContent(params), AI_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------------------------
// AI Combinator: prompt → validated RackPatchPlan built from the D:\vsr manifest + built-ins
// ---------------------------------------------------------------------------------------------

const COMBINATOR_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    bpm: { type: Type.NUMBER },
    units: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING, enum: ['library', 'builtin'] },
          itemId: { type: Type.STRING },
          type: { type: Type.STRING },
          presetId: { type: Type.STRING },
          name: { type: Type.STRING },
          why: { type: Type.STRING },
          params: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { key: { type: Type.STRING }, number: { type: Type.NUMBER }, text: { type: Type.STRING } },
              required: ['key'],
            },
          },
        },
        required: ['source', 'name'],
      },
    },
    audio: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { from: { type: Type.INTEGER }, to: { type: Type.INTEGER } }, required: ['from', 'to'] },
    },
    cv: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          from: { type: Type.INTEGER },
          fromPort: { type: Type.STRING },
          to: { type: Type.INTEGER },
          toPort: { type: Type.STRING },
          amount: { type: Type.NUMBER },
        },
        required: ['from', 'fromPort', 'to', 'toPort'],
      },
    },
    macros: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.NUMBER },
          targets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { unit: { type: Type.INTEGER }, param: { type: Type.STRING }, min: { type: Type.NUMBER }, max: { type: Type.NUMBER } },
              required: ['unit', 'param', 'min', 'max'],
            },
          },
        },
        required: ['label', 'targets'],
      },
    },
  },
  required: ['name', 'units', 'audio'],
};

const COMBINATOR_INSTRUCTION = `You are the Combiner engineer of Unbox Studio, a modular rack DAW.
Build one rack patch for the user's request using ONLY the units provided in the JSON catalog.
Rules:
- Prefer LIBRARY units (the user's own plugins and sample libraries from D:\\vsr) whenever they fit. Use BUILT-IN devices to fill gaps (reverb, delay, distortion, LFOs, step sequencing, synths).
- Use one sound source (instrument) unless the user asks for more. If the user only wants processing (a vocal chain, a mastering chain, "make my X ..."), use NO instrument.
- Order effects like a studio chain: pitch, EQ, saturation, filter, modulation, delay, reverb, dynamics, limiter.
- "audio" edges connect stereo pairs. "from"/"to" are indices into "units"; to = -1 is the master bus. A unit input takes one cable.
- "cv" edges must use the exact port names listed for each unit.
- Library unit params are macro1..macro4, mix (0..1) and output (0..1.5). Their macro meanings are listed per unit.
- Built-in params must stay within the listed ranges; string params must use a listed option.
- "builtins" are listed with params; "moreBuiltins" are also available (type: name): use their type when they fit better (hardware emulations, classic rack devices). Players (role modulator, e.g. dual_arp, scales_chords) play the patch's instrument automatically.
- Pick a presetId only from that unit's presets.
- Add 1-4 Combiner macros (label + targets with min/max) for the most useful controls.
- At most 8 units. Explain each unit in one short "why".`;

function libraryCandidates(prompt: string, manifest: VstManifest | null): MountableItem[] {
  if (!manifest) return [];
  const mountables = manifest.items.filter(
    (i): i is MountableItem => isMountable(i) && !i.duplicateOf && (i.kind !== 'plugin' || i.primaryVariant)
  );
  const picked = new Map<string, MountableItem>();
  searchManifest(mountables, prompt, { limit: 20 }).forEach((h) => picked.set(h.item.id, h.item as MountableItem));
  // Effect plugins are few and often relevant to any patch; always offer them.
  mountables.filter((i) => i.kind === 'plugin' && i.role === 'effect').forEach((i) => picked.set(i.id, i));
  // One instrument per category so the model can still choose when the prompt shares no words.
  const seen = new Set<string>();
  mountables.forEach((i) => {
    const role = i.kind === 'plugin' ? i.role : 'instrument';
    if (role === 'instrument' && !seen.has(i.category) && picked.size < 40) {
      seen.add(i.category);
      picked.set(i.id, i);
    }
  });
  return Array.from(picked.values()).slice(0, 40);
}

function describeLibraryUnit(item: MountableItem, manifest: VstManifest) {
  const role = item.kind === 'plugin' ? item.role : 'instrument';
  const presets = manifest.items.filter((p): p is Extract<ManifestItem, { kind: 'preset' }> => p.kind === 'preset' && p.targetId === item.id);
  const ports = vstPortLayout(role);
  return {
    itemId: item.id,
    name: item.name,
    role,
    category: CATEGORY_LABELS[item.category],
    vendor: item.vendor,
    format: item.kind === 'plugin' ? `${item.format.toUpperCase()} ${item.arch}` : `${item.engine} library`,
    macros: item.macros.map((m, i) => `macro${i + 1}=${m.label}`),
    cvIn: ports.cvIn,
    cvOut: ports.cvOut,
    presets: presets.slice(0, 24).map((p) => ({ presetId: p.id, name: p.name, group: p.group })),
  };
}

function combinatorContents(prompt: string, manifest: VstManifest | null): string {
  const library = manifest ? libraryCandidates(prompt, manifest).map((i) => describeLibraryUnit(i, manifest)) : [];
  // Full details for the devices that match the request; the rest as one-liners (all usable).
  const ranked = rankBuiltins(prompt);
  const builtins = ranked.slice(0, 28).map((d) => ({
    type: d.type,
    name: d.name,
    role: d.role,
    description: d.description,
    params: Object.fromEntries(Object.entries(d.params).map(([k, r]) => [k, `${r.min}..${r.max}`])),
    options: d.options,
    booleans: d.booleans,
    cvIn: d.cvIn,
    cvOut: d.cvOut,
  }));
  const moreBuiltins = ranked.slice(28).map((d) => `${d.type}: ${d.name} (${d.role}, ${d.category})`);
  return JSON.stringify({ request: prompt, library, builtins, moreBuiltins });
}

// ---------------------------------------------------------------------------------------------

export function createAiRouter({ library }: { library: ManifestStore }): express.Router {
  const router = express.Router();

  router.post('/ai/combinator', aiGuard, async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) return res.status(400).json({ error: 'Describe the sound or effect chain you want.' });
    const manifest = await library.get();
    const ctx = planContextFromManifest(manifest);
    const warnings: string[] = [];
    if (!manifest) warnings.push('No library index yet — run a scan of D:\\vsr to use your plugins.');

    const ai = gemini();
    if (ai) {
      try {
        const response = await generate(ai, {
          model: textModel(),
          contents: combinatorContents(prompt, manifest),
          config: {
            systemInstruction: COMBINATOR_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: COMBINATOR_SCHEMA,
            temperature: 0.4,
          },
        });
        const { plan, warnings: planWarnings } = validatePlan(JSON.parse(response.text || '{}'), ctx);
        if (plan.units.length) return res.json({ plan, source: 'gemini', model: textModel(), warnings: [...warnings, ...planWarnings] });
        warnings.push('Gemini returned no usable units — used the local planner instead.');
      } catch (e) {
        warnings.push(`Gemini unavailable (${(e as Error).message}) — used the local planner.`);
      }
    } else {
      warnings.push('No GEMINI_API_KEY configured — used the local planner.');
    }
    const local = planLocally(prompt, manifest);
    return res.json({ plan: local.plan, source: 'local', warnings: [...warnings, ...local.warnings] });
  });

  router.post('/gemini/generate-preset', aiGuard, async (req, res) => {
    const deviceType = typeof req.body?.deviceType === 'string' ? req.body.deviceType.slice(0, 64) : '';
    const deviceName = typeof req.body?.deviceName === 'string' ? req.body.deviceName.slice(0, 80) : deviceType;
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const params = parsePresetParams(req.body?.params);
    if (!deviceType || !prompt) return res.status(400).json({ error: 'Device type and prompt are required.' });
    if (!params.length) return res.status(400).json({ error: 'This device has no adjustable parameters.' });
    const ai = gemini();
    if (!ai) return res.json(localPreset(prompt, params));
    try {
      const table = params
        .map((p) => `${p.key} (${p.label ?? p.key}): ${p.options ? `choice index 0..${p.options.length - 1} = ${p.options.join(' | ')}` : `${p.min} .. ${p.max}`}, now ${p.value}`)
        .join('\n');
      const response = await generate(ai, {
        model: textModel(),
        contents: `Rack device: ${deviceName} (${deviceType}).\nParameters (key (label): range, current value):\n${table}\n\nSound wanted: "${prompt}"\n\nChoose values ONLY for parameters listed above, inside their ranges, to get that sound. Leave parameters you would not change out.`,
        config: {
          systemInstruction: 'You are an expert sound designer programming a hardware synth / effect. Answer with JSON only.',
          responseMimeType: 'application/json',
          responseSchema: PRESET_SCHEMA,
        },
      });
      const raw = JSON.parse(response.text || '{}') as { presetName?: unknown; description?: unknown; parameters?: unknown };
      const { parameters, skipped } = validatePreset(raw.parameters, params);
      if (!Object.keys(parameters).length) return res.json({ ...localPreset(prompt, params), warning: 'The model returned no usable parameters — used keyword rules.' });
      const preset: CraftedPreset = {
        presetName: typeof raw.presetName === 'string' && raw.presetName.trim() ? raw.presetName.trim().slice(0, 60) : prompt.slice(0, 40),
        description: typeof raw.description === 'string' ? raw.description.slice(0, 400) : '',
        parameters,
        skipped,
        source: 'gemini',
        model: textModel(),
      };
      return res.json(preset);
    } catch (error) {
      console.error('Error generating preset:', error);
      return res.json({ ...localPreset(prompt, params), warning: 'AI request failed — used keyword rules.' });
    }
  });

  /** Plain-language notes on a MEASURED mix analysis (the numbers come from the app, not the model). */
  router.post('/gemini/mix-master-assistant', aiGuard, async (req, res) => {
    const goal = typeof req.body?.goal === 'string' ? req.body.goal.slice(0, 80) : 'Streaming';
    const m = req.body?.measurements;
    const notes: string[] = Array.isArray(req.body?.notes) ? req.body.notes.filter((n: unknown): n is string => typeof n === 'string').slice(0, 20).map((n: string) => n.slice(0, 200)) : [];
    if (!m || typeof m !== 'object') return res.status(400).json({ error: 'Measurements are required.' });
    const nums: Record<string, number> = {};
    for (const [k, v] of Object.entries(m as Record<string, unknown>).slice(0, 40)) if (typeof v === 'number' && Number.isFinite(v)) nums[k.slice(0, 40)] = Math.round(v * 100) / 100;
    const ai = gemini();
    if (!ai) return res.json({ summary: null, tips: [], source: 'none' });
    try {
      const response = await generate(ai, {
        model: textModel(),
        contents: `Measured mix (whole song): ${JSON.stringify(nums)}.\nLoudness goal: ${goal}.\nAutomatic mastering notes: ${notes.join(' ') || 'none'}.\nExplain what the measurements say about this mix in 2-3 sentences, then give up to 5 concrete MIXING tips (levels, EQ, panning, arrangement) that the mastering chain cannot fix. Do not invent measurements.`,
        config: {
          systemInstruction: 'You are an experienced mix engineer talking to a producer. Plain words, no hype. JSON only.',
          responseMimeType: 'application/json',
          responseSchema: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, tips: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['summary', 'tips'] },
        },
      });
      const raw = JSON.parse(response.text || '{}') as { summary?: unknown; tips?: unknown };
      return res.json({
        summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 800) : null,
        tips: Array.isArray(raw.tips) ? raw.tips.filter((t): t is string => typeof t === 'string').slice(0, 5).map((t) => t.slice(0, 300)) : [],
        source: 'gemini',
        model: textModel(),
      });
    } catch (error) {
      console.error('Error generating mix notes:', error);
      return res.json({ summary: null, tips: [], source: 'none', warning: 'AI request failed.' });
    }
  });

  return router;
}

const PRESET_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    presetName: { type: Type.STRING },
    description: { type: Type.STRING },
    parameters: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, value: { type: Type.NUMBER } }, required: ['key', 'value'] },
    },
  },
  required: ['presetName', 'parameters'],
};

/** Device parameter list from the request (bounded, numbers checked). */
function parsePresetParams(raw: unknown): PresetParam[] {
  if (!Array.isArray(raw)) return [];
  const out: PresetParam[] = [];
  for (const p of raw.slice(0, 200)) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    if (typeof o.key !== 'string' || !o.key || o.key.length > 64) continue;
    const min = Number(o.min);
    const max = Number(o.max);
    const value = Number(o.value);
    if (![min, max, value].every(Number.isFinite) || max < min) continue;
    const options = Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string').slice(0, 64).map((x) => x.slice(0, 40)) : undefined;
    out.push({ key: o.key, label: typeof o.label === 'string' ? o.label.slice(0, 60) : undefined, min, max, value, options: options?.length ? options : undefined });
  }
  return out;
}
