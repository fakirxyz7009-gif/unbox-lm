/**
 * Preset crafting for one rack device: the device's real parameters (keys, ranges, current
 * values) go to the model, and its answer is validated against them (unknown keys dropped,
 * values clamped). Without a model, keyword rules ("dark", "pluck", "pad" …) move matching
 * parameters. Pure: used by the server route and the browser fallback.
 */

export interface PresetParam {
  key: string;
  label?: string;
  min: number;
  max: number;
  value: number;
  /** Discrete choices (value = index). */
  options?: string[];
}

export interface CraftedPreset {
  presetName: string;
  description: string;
  /** Validated values by parameter key. */
  parameters: Record<string, number>;
  /** Keys the model sent that the device does not have (or with unusable values). */
  skipped: string[];
  source: 'gemini' | 'local' | 'local-offline';
  model?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Keeps known keys with usable values, clamped to the parameter range. */
export function validatePreset(raw: unknown, params: PresetParam[]): { parameters: Record<string, number>; skipped: string[] } {
  const byKey = new Map(params.map((p) => [p.key, p]));
  const parameters: Record<string, number> = {};
  const skipped: string[] = [];
  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.flatMap((e) => (e && typeof e === 'object' && typeof (e as { key?: unknown }).key === 'string' ? [[(e as { key: string }).key, (e as { value?: unknown }).value] as [string, unknown]] : []))
    : raw && typeof raw === 'object'
    ? Object.entries(raw as Record<string, unknown>)
    : [];
  for (const [key, v] of entries) {
    const p = byKey.get(key);
    let n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'boolean' ? Number(v) : NaN;
    if (p?.options && typeof v === 'string' && Number.isNaN(n)) n = p.options.findIndex((o) => o.toLowerCase() === v.toLowerCase());
    if (!p || !Number.isFinite(n) || n < -1e9) {
      skipped.push(key);
      continue;
    }
    parameters[key] = p.options ? clamp(Math.round(n), 0, p.options.length - 1) : clamp(n, p.min, p.max);
  }
  return { parameters, skipped };
}

/* ------------------------------------------------------------------ keyword rules */

type Role = 'bright' | 'reso' | 'attack' | 'decay' | 'sustain' | 'release' | 'drive' | 'width' | 'space' | 'mix' | 'glide' | 'rate' | 'depth' | 'feedback';

const ROLE_OF_KEY: [RegExp, Role][] = [
  [/lfo.*rate|rate|speed/i, 'rate'],
  [/depth|amount|lfo.*amt/i, 'depth'],
  [/cutoff|bright|tone|lpf|filter.?freq|^freq/i, 'bright'],
  [/reso|emphasis|^q$/i, 'reso'],
  [/attack|atk/i, 'attack'],
  [/decay/i, 'decay'],
  [/sustain/i, 'sustain'],
  [/release/i, 'release'],
  [/drive|dist|satur|overdrive|crunch/i, 'drive'],
  [/detune|spread|unison|width|stereo/i, 'width'],
  [/reverb|room|size|space|hall/i, 'space'],
  [/feedback|fb$/i, 'feedback'],
  [/glide|portamento/i, 'glide'],
  [/^mix$|wet|dry.?wet/i, 'mix'],
];

/** word → targets (0..1 of each role's range; times and frequencies map on a log scale, see denorm). */
const WORDS: [RegExp, Partial<Record<Role, number>>][] = [
  [/dark|muffled|dull|deep/, { bright: 0.4 }],
  [/bright|crisp|airy|shiny|sparkl/, { bright: 0.85 }],
  [/warm|vintage|analog/, { bright: 0.55, drive: 0.3 }],
  [/aggressive|distort|gritty|dirty|hard|nasty|angry/, { drive: 0.75, reso: 0.55, bright: 0.7 }],
  [/clean|soft|gentle|smooth|mellow/, { drive: 0.05, reso: 0.2 }],
  [/pad|ambient|ethereal|lush|evolving|dreamy|atmos/, { attack: 0.8, release: 0.85, sustain: 0.85, space: 0.7, mix: 0.45, width: 0.7 }],
  [/pluck|staccato|short|snappy|tight|punchy|percussive/, { attack: 0, decay: 0.5, sustain: 0.1, release: 0.4 }],
  [/bass|sub\b|808/, { bright: 0.45, width: 0.1, glide: 0.15 }],
  [/lead|solo/, { attack: 0.02, sustain: 0.8, glide: 0.15, bright: 0.65 }],
  [/acid|303|squelch/, { reso: 0.8, bright: 0.4, glide: 0.3, drive: 0.4 }],
  [/wide|stereo|huge|big|massive/, { width: 0.8, space: 0.6 }],
  [/long|slow|swell/, { attack: 0.75, release: 0.85, decay: 0.8, feedback: 0.6 }],
  [/wobble|movement|sweep|pulsing/, { rate: 0.3, depth: 0.6 }],
  [/resonan|whist|peaky/, { reso: 0.7 }],
  [/wet|washed|drenched/, { mix: 0.7, space: 0.75 }],
  [/dry|subtle|light/, { mix: 0.2 }],
];

const roleOf = (key: string): Role | null => ROLE_OF_KEY.find(([re]) => re.test(key))?.[1] ?? null;

/** 0..1 → value; wide positive ranges (frequencies, times) move on a log scale. */
function denorm(p: PresetParam, t: number): number {
  if (p.min > 0 && p.max / p.min > 50) return p.min * Math.pow(p.max / p.min, t);
  return p.min + t * (p.max - p.min);
}

export function localPreset(prompt: string, params: PresetParam[], source: 'local' | 'local-offline' = 'local'): CraftedPreset {
  const text = prompt.toLowerCase();
  const sums = new Map<Role, { total: number; n: number; words: string[] }>();
  for (const [re, targets] of WORDS) {
    const m = text.match(re);
    if (!m) continue;
    for (const [role, t] of Object.entries(targets) as [Role, number][]) {
      const cur = sums.get(role) ?? { total: 0, n: 0, words: [] };
      cur.total += t;
      cur.n += 1;
      cur.words.push(m[0]);
      sums.set(role, cur);
    }
  }
  const parameters: Record<string, number> = {};
  const why: string[] = [];
  for (const p of params) {
    if (p.options) continue;
    const role = roleOf(p.key);
    const s = role ? sums.get(role) : undefined;
    if (!role || !s) continue;
    const t = s.total / s.n;
    const v = denorm(p, t);
    parameters[p.key] = Math.round(v * 1000) / 1000;
    why.push(`${p.label ?? p.key} ${Math.round(t * 100)} % (${[...new Set(s.words)].join(', ')})`);
  }
  const name = prompt.trim().replace(/\s+/g, ' ').slice(0, 40) || 'Preset';
  return {
    presetName: name.charAt(0).toUpperCase() + name.slice(1),
    description: why.length
      ? `Keyword rules (no AI model): ${why.join(' · ')}.`
      : 'No known sound words in the prompt (try dark, bright, warm, pluck, pad, acid, wide, long…). Nothing was changed.',
    parameters,
    skipped: [],
    source,
  };
}
