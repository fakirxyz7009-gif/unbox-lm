/**
 * Deterministic prompt → RackPatchPlan planner. Runs when Gemini is unavailable (no key, error,
 * offline desktop build). Picks library items from the manifest first, built-ins second.
 */
import { BUILTIN_BY_TYPE } from './builtinCatalog.ts';
import { MASTER, planContextFromManifest, validatePlan, type ParamValue, type PlanAudioEdge, type PlanCvEdge, type RackPatchPlan } from './patchPlan.ts';
import { CATEGORY_KEYWORDS } from '../vst/categories.ts';
import { isMountable, type MountableItem, type PresetItem, type SoundCategory, type VstManifest } from '../vst/manifestTypes.ts';
import { categoriesInText, searchManifest, tokenize } from '../vst/search.ts';

interface DraftUnit {
  source: 'builtin' | 'library';
  type?: string;
  itemId?: string;
  presetId?: string;
  name?: string;
  params: Record<string, ParamValue>;
  pattern?: { notes: number[]; gates: boolean[]; curve: number[] };
  why: string;
  /** Category the unit was chosen for. */
  cat: SoundCategory | 'modulator';
}

const FAMILY_ORDER: SoundCategory[] = ['piano', 'strings', 'brass', 'winds', 'choir', 'drums', 'percussion', 'guitar', 'bass', 'keys', 'orchestral', 'synth'];
const EFFECT_ORDER: SoundCategory[] = ['pitch', 'eq', 'saturation', 'filter', 'modulation', 'delay', 'reverb', 'dynamics', 'limiter'];
/** Built-in stand-ins when the library has no instrument of a family. */
const BUILTIN_INSTRUMENT: Partial<Record<SoundCategory, string>> = {
  bass: 'moog_sub37', synth: 'prophet6', drums: 'tr8s', percussion: 'klang', keys: 'radical_piano', winds: 'bansuri',
  piano: 'radical_piano', strings: 'friktion', brass: 'nnxt', choir: 'humana', orchestral: 'friktion', guitar: 'nn19',
};
const BUILTIN_EFFECT: Partial<Record<SoundCategory, string>> = {
  saturation: 'scream4', reverb: 'rv7000', delay: 'echo', dynamics: 'ssl_gbus', limiter: 'mclass_maximizer',
  eq: 'channel_eq', modulation: 'quartet', filter: 'sweeper', pitch: 'neptune',
};

/** Drum machine by genre words. */
function drumMachineFor(has: (...ws: string[]) => boolean): { type: string; params: Record<string, ParamValue> } {
  if (has('trap', 'drill', '808', 'electro')) return { type: 'tr08', params: { p1Decay: has('long', 'boomy', 'drill') ? 0.85 : 0.6 } };
  if (has('hip hop', 'hiphop', 'boom bap', 'boombap', 'lofi', 'lo-fi', 'beat tape', 'mpc')) return { type: 'mpc_one', params: { kit: has('lofi', 'lo-fi') ? 'Lo-Fi' : 'Boom Bap', lofi: has('lofi', 'lo-fi', 'vintage', 'dusty') ? 0.5 : 0.15 } };
  if (has('industrial', 'distorted', 'brutal', 'hard techno')) return { type: 'perkons', params: { drive: 0.6 } };
  if (has('house', 'disco')) return { type: 'tr8s', params: { kit: '909 Kit' } };
  if (has('techno')) return { type: 'tr8s', params: { kit: '909 Kit', drive: 0.3 } };
  return { type: 'tr8s', params: {} };
}
const DEFAULT_POLISH: Partial<Record<SoundCategory, SoundCategory[]>> = {
  piano: ['reverb'], keys: ['reverb'], strings: ['reverb'], brass: ['reverb'], winds: ['reverb'], choir: ['reverb'],
  orchestral: ['reverb'], guitar: ['eq', 'reverb'], drums: ['eq', 'dynamics'], percussion: ['reverb'],
};
const GENRE_BPM: [RegExp, number][] = [
  [/drum ?(and|&|n) ?bass|\bdnb\b|jungle/, 174], [/dubstep|trap|\bdrill\b/, 140], [/trance/, 138], [/techno/, 130],
  [/house|disco/, 124], [/synthwave|retrowave|80s/, 100], [/hip ?hop|boom ?bap/, 90], [/lo-?fi|chill/, 80], [/ambient|cinematic|trailer/, 70],
];

const ACID = [0, 0, 12, 0, 3, 0, 7, 10, 0, 12, 0, 15, 7, 0, 3, 2];
const MINOR_ARP = [0, 3, 7, 12, 7, 3, 0, 3, 7, 10, 15, 10, 7, 3, 7, 12];

export function planLocally(prompt: string, manifest: VstManifest | null): { plan: RackPatchPlan; warnings: string[] } {
  const text = prompt.toLowerCase();
  const words = new Set(tokenize(prompt));
  const has = (...ws: string[]) => ws.some((w) => (w.includes(' ') ? text.includes(w) : words.has(w)));
  const cats = new Set(categoriesInText(prompt));
  const notes: string[] = [];

  const items = manifest?.items ?? [];
  const mountables = items.filter(
    (i): i is MountableItem => isMountable(i) && !i.duplicateOf && (i.kind !== 'plugin' || i.primaryVariant)
  );
  const presets = items.filter((i): i is PresetItem => i.kind === 'preset' && !i.duplicateOf);

  // ---- What kind of patch is this? ----
  const dnb = /drum ?(and|&|n) ?bass|\bdnb\b/.test(text);
  const vocal = has('vocal', 'vocals', 'voice', 'singer', 'rap', 'rapper');
  const processing = /\b(my|chain|fx|effects?|mastering|processing|insert|master bus|mix bus)\b/.test(text);
  let family = dnb ? 'drums' : FAMILY_ORDER.find((f) => cats.has(f));
  if (family === 'bass' && /string bass|double bass|basses/.test(text)) family = 'strings';
  if (!family && has('pad', 'lead', 'arp', 'pluck', 'synth', 'acid', 'wobble', 'wobbly')) family = 'synth';
  const effectOnly = (processing || vocal) && !has('play', 'playing', 'instrument') && !(family && /\bwith (a|an|some)\b/.test(text));
  if (effectOnly) family = undefined;

  const units: DraftUnit[] = [];

  // ---- Instrument ----
  if (family) units.push(pickInstrument(family, prompt, text, has, mountables, presets, notes));
  else if (!effectOnly) units.push(builtinUnit('subtractor', 'synth', 'Default synth voice (no instrument named)'));

  // ---- Effects in studio order ----
  const fx = new Set(EFFECT_ORDER.filter((c) => cats.has(c)));
  if (vocal) ['pitch', 'eq', 'dynamics'].forEach((c) => fx.add(c as SoundCategory));
  if (has('dark', 'darker', 'moody', 'bright', 'brighter', 'airy', 'crisp', 'muddy', 'harsh')) fx.add('eq');
  if (has('punchy', 'punch', 'tight', 'glue')) fx.add('dynamics');
  if (has('loud', 'louder', 'radio', 'master', 'mastering', 'club')) fx.add('limiter');
  if (has('mastering', 'master bus', 'master')) fx.add('eq');
  if (has('lofi', 'lo-fi', 'vintage', 'tape')) fx.add('saturation');
  if (!fx.size && family) (DEFAULT_POLISH[family as SoundCategory] ?? []).forEach((c) => fx.add(c));
  if (!fx.size && effectOnly) fx.add('reverb');
  const heavy = has('distortion', 'distorted', 'heavy', 'aggressive', 'destroy', 'destroyed', 'industrial', 'scream', 'fuzz', 'metal', 'brutal');
  const usedTypes = new Set<string>();
  for (const cat of EFFECT_ORDER) {
    if (!fx.has(cat)) continue;
    const unit = pickEffect(cat, heavy, prompt, mountables, usedTypes);
    if (unit) {
      tuneEffect(unit, has, notes);
      units.push(unit);
    } else notes.push(`No ${cat} processor available — skipped`);
  }

  // ---- CV modulation ----
  const sourceIndex = units.findIndex((u) => u.cat !== 'modulator' && isInstrumentUnit(u, items));
  const cv: PlanCvEdge[] = [];
  const bpm = GENRE_BPM.find(([re]) => re.test(text))?.[1];
  const wantsLfo = has('wobble', 'wobbly', 'pulsing', 'pulse', 'movement', 'moving', 'evolving', 'breathing', 'sweeping', 'lfo', 'tremolo');
  const wantsSeq = has('sequence', 'sequenced', 'sequencer', 'arp', 'arpeggio', 'arpeggiated', 'arpeggiator', 'step', 'steps', 'acid', '303');
  if (wantsLfo) {
    const slow = has('evolving', 'breathing', 'slow', 'ambient', 'drifting');
    const lfo = builtinUnit('pulsar', 'modulator', 'LFO movement requested');
    lfo.params = { rate1: slow ? 0.15 : has('wobble', 'wobbly', 'dubstep') ? 3 : 1.5, depth1: slow ? 0.5 : 0.85, shape1: 'sine' };
    units.push(lfo);
    const target = lfoTarget(units, sourceIndex, items);
    if (target) cv.push({ from: units.length - 1, fromPort: 'lfo1_out', to: target.unit, toPort: target.port, amount: slow ? 0.45 : 0.8 });
    else notes.push('Nothing in the patch accepts LFO CV');
  }
  if (wantsSeq && sourceIndex >= 0) {
    const seq = builtinUnit('matrix', 'modulator', 'Step sequence requested');
    const steps = has('acid', '303') ? ACID : MINOR_ARP;
    seq.pattern = { notes: steps, gates: steps.map((_, i) => i % 4 !== 3), curve: steps.map((_, i) => (i % 2 ? 0.35 : 0.85)) };
    units.push(seq);
    const m = units.length - 1;
    cv.push({ from: m, fromPort: 'note_cv', to: sourceIndex, toPort: 'cv_pitch', amount: 1 });
    cv.push({ from: m, fromPort: 'gate_cv', to: sourceIndex, toPort: 'cv_gate', amount: 1 });
  }

  // ---- Audio chain: source → effects → master ----
  const audioIdx = units.map((u, i) => ({ u, i })).filter(({ u }) => u.cat !== 'modulator').map(({ i }) => i);
  const audio: PlanAudioEdge[] = [];
  for (let k = 0; k + 1 < audioIdx.length; k++) audio.push({ from: audioIdx[k], to: audioIdx[k + 1] });
  if (audioIdx.length) audio.push({ from: audioIdx[audioIdx.length - 1], to: MASTER });

  const name = titleFrom(prompt);
  const chain = audioIdx.map((i) => displayName(units[i], items)).join(' → ');
  const raw = {
    name,
    description: `${chain || 'Empty'} → master${cv.length ? ' · CV: ' + cv.map((c) => `${displayName(units[c.from], items)} → ${displayName(units[c.to], items)}`).join(', ') : ''}`,
    bpm,
    units: units.map(({ cat: _cat, ...u }) => u),
    audio,
    cv,
    macros: [],
  };
  const { plan, warnings } = validatePlan(raw, planContextFromManifest(manifest));
  if (effectOnly) notes.push('Effect chain: its input is fed from the selected rack unit');
  return { plan, warnings: [...notes, ...warnings] };
}

function builtinUnit(type: string, cat: DraftUnit['cat'], why: string): DraftUnit {
  return { source: 'builtin', type, name: BUILTIN_BY_TYPE.get(type)?.name, params: {}, why, cat };
}

function libraryUnit(item: MountableItem, cat: SoundCategory, why: string): DraftUnit {
  return { source: 'library', itemId: item.id, name: item.name, params: {}, why, cat };
}

function isInstrumentUnit(u: DraftUnit, items: { id: string; kind: string; role?: string }[]): boolean {
  if (u.source === 'builtin') return BUILTIN_BY_TYPE.get(u.type ?? '')?.role === 'instrument';
  const item = items.find((i) => i.id === u.itemId);
  return item?.kind === 'instrument' || item?.role === 'instrument';
}

function displayName(u: DraftUnit, items: { id: string; name: string }[]): string {
  return u.source === 'library' ? items.find((i) => i.id === u.itemId)?.name ?? 'Library unit' : u.name ?? u.type ?? 'Device';
}

/** Prefer the articulation the prompt asks for; keep FX/special patches out unless requested. */
function articulationBonus(name: string, text: string): number {
  const n = name.toLowerCase();
  let bonus = 0;
  if (/pizz/.test(text)) bonus += /pizzicato/.test(n) ? 3 : 0;
  else if (/spiccato/.test(text)) bonus += /spiccato/.test(n) ? 3 : 0;
  else if (/short|staccato|stacc|plucky|rhythmic|ostinato|percussive|marcato/.test(text)) bonus += /spiccato|shorts|marcato|staccato/.test(n) ? 2 : 0;
  else if (/legato|sustain|long|pad|slow|swell/.test(text) || !/trill|tremolo|whisper|sordino/.test(text)) {
    bonus += /legato|sustains|longs/.test(n) ? 1.5 : 0;
  }
  if (/\b(full|ensemble)\b|full str/.test(n)) bonus += 0.5;
  if (/\bfx\b|cluster|risers|noise/.test(n) && !/\bfx\b|riser|cluster|effect/.test(text)) bonus -= 2;
  return bonus;
}

function pickInstrument(
  family: SoundCategory,
  prompt: string,
  text: string,
  has: (...ws: string[]) => boolean,
  mountables: MountableItem[],
  presets: PresetItem[],
  notes: string[]
): DraftUnit {
  const matches = (i: MountableItem) =>
    (i.kind === 'instrument' || i.role === 'instrument') &&
    (i.category === family || (family === 'orchestral' && ['strings', 'brass', 'winds', 'orchestral'].includes(i.category)));
  const pool = mountables.filter(matches);
  if (pool.length) {
    const scores = new Map(searchManifest(pool, prompt, { includeDuplicates: true }).map((h) => [h.item.id, h.score]));
    const best = [...pool].sort(
      (a, b) =>
        (scores.get(b.id) ?? 0) + articulationBonus(b.name, text) - ((scores.get(a.id) ?? 0) + articulationBonus(a.name, text)) ||
        a.name.localeCompare(b.name)
    )[0];
    const unit = libraryUnit(best, family, `Best ${family} match in D:\\vsr`);
    const own = presets.filter((p) => p.targetId === best.id);
    // Match presets on mood words only: the instrument's own name/family would match every preset.
    const skip = new Set([...tokenize(best.name), ...CATEGORY_KEYWORDS[family].flatMap((k) => tokenize(k))]);
    const presetQuery = tokenize(prompt).filter((w) => !skip.has(w) && !skip.has(w.replace(/s$/, ''))).join(' ');
    if (own.length && presetQuery) {
      const hit = searchManifest(own, presetQuery, { includeDuplicates: true }).find((h) => h.score > 1);
      if (hit) unit.presetId = hit.item.id;
    }
    voiceInstrument(unit, family, has);
    return unit;
  }
  const drum = family === 'drums' ? drumMachineFor(has) : null;
  let type = drum?.type ?? BUILTIN_INSTRUMENT[family] ?? 'prophet6';
  if (has('3rd wave', 'third wave', 'ppg', 'wave surfer', 'groove synthesis') || (family === 'synth' && has('wavetable', 'vintage'))) type = 'third_wave';
  else if (type === 'prophet6' && has('pad', 'ambient', 'evolving', 'atmosphere', 'wavetable')) type = 'waldorf_iridium';
  else if (type === 'prophet6' && has('juno', '80s', 'synthwave', 'retrowave')) type = 'juno_x';
  else if (type === 'prophet6' && has('fm', 'bell', 'bells', 'dx7', 'glassy')) type = 'algoritm';
  else if (type === 'moog_sub37' && has('acid', '303')) type = 'monotone';
  notes.push(`No ${family} instrument in the library — using the built-in ${BUILTIN_BY_TYPE.get(type)?.name ?? type} instead`);
  const unit = builtinUnit(type, family, `Built-in stand-in for ${family}`);
  if (drum) unit.params = drum.params;
  if (type === 'third_wave') unit.params = { waveSurfer: has('bright') ? 14 : has('dark') ? -10 : 0, f1_cutoff: has('dark') ? 1400 : has('bright') ? 6800 : 4200, panSpread: 75 };
  if (type === 'monotone') unit.params = { subLevel: has('sub', '808') ? 0.8 : 0.5, cutoff: has('dark') ? 300 : 700, resonance: has('acid') ? 14 : 6 };
  if (type === 'moog_sub37') unit.params = { cutoff: has('dark') ? 380 : has('bright') ? 2400 : 900, resonance: has('acid', 'squelch') ? 0.7 : 0.3, subLevel: has('sub', '808', 'deep') ? 0.7 : 0.3 };
  if (type === 'prophet6' || type === 'juno_x') unit.params = { cutoff: has('dark') ? 1100 : has('bright') ? 6000 : 2600, attack: has('pad', 'swell') ? 0.6 : 0.005, release: has('pad') ? 1.6 : 0.35 };
  if (type === 'waldorf_iridium') unit.params = { attack: 0.6, release: 2.2, posA: 0.6, cutoff: has('dark') ? 1400 : 4200 };
  if (type === 'radical_piano') unit.params = { model: family === 'keys' || has('rhodes', 'electric', 'ep') ? 'Electric' : has('upright') ? 'Upright' : has('felt', 'soft', 'intimate') ? 'Felt' : 'Grand', hardness: has('bright', 'hard') ? 0.75 : has('soft', 'dark', 'felt') ? 0.25 : 0.5 };
  if (type === 'friktion') unit.params = { body: has('cello', 'low', 'deep') ? 'Cello' : has('bass') ? 'Double Bass' : 'Violin', ensemble: has('section', 'ensemble', 'orchestra', 'orchestral') ? 0.7 : 0.25 };
  if (type === 'nnxt') unit.params = { sample: family === 'brass' ? 'Brass' : 'Strings' };
  if (type === 'nn19') unit.params = { sample: family === 'guitar' ? 'Nylon Guitar' : 'Electric Piano' };
  if (type === 'humana') unit.params = { voiceType: has('male', 'deep', 'monk') ? 'Bass' : has('female', 'angel', 'angelic') ? 'Soprano' : 'Mixed Choir', vowel: has('ooh') ? 4 : 0 };
  if (type === 'klang') unit.params = { model: has('vibes', 'vibraphone') ? 'Vibraphone' : has('bell', 'bells') ? 'Tubular Bells' : has('kalimba') ? 'Kalimba' : 'Marimba' };
  return unit;
}

/** Macro voicing of library instruments from mood words (macro meaning: shared/vst/categories.ts). */
function voiceInstrument(unit: DraftUnit, family: SoundCategory, has: (...ws: string[]) => boolean): void {
  const dark = has('dark', 'darker', 'moody', 'soft', 'felt', 'warm', 'mellow', 'intimate');
  const bright = has('bright', 'brighter', 'airy', 'crisp', 'sparkly');
  if (family === 'piano' || family === 'keys') {
    if (dark) unit.params.macro1 = 0.25;
    if (bright) unit.params.macro1 = 0.8;
    if (has('hall', 'room', 'space', 'cinematic', 'ambient')) unit.params.macro4 = 0.5;
  } else if (['strings', 'brass', 'winds', 'choir', 'orchestral'].includes(family)) {
    if (has('slow', 'swell', 'pad', 'legato', 'ambient', 'evolving')) unit.params.macro1 = 0.6;
    if (has('short', 'staccato', 'pizzicato', 'spiccato', 'rhythmic', 'ostinato')) unit.params.macro1 = 0.03;
    if (dark) unit.params.macro2 = 0.3;
    if (bright) unit.params.macro2 = 0.75;
  } else if (family === 'drums' || family === 'percussion') {
    if (has('tight', 'dry')) unit.params.macro4 = 0.05;
    if (has('big', 'room', 'live', 'huge', 'arena')) unit.params.macro4 = 0.6;
  } else if (family === 'guitar') {
    if (dark) unit.params.macro1 = 0.35;
    if (bright) unit.params.macro1 = 0.75;
  }
}

function pickEffect(cat: SoundCategory, heavy: boolean, prompt: string, mountables: MountableItem[], usedTypes: Set<string>): DraftUnit | null {
  const plugins = mountables.filter((i) => i.kind === 'plugin' && i.role === 'effect' && i.category === cat);
  const preferBuiltin = cat === 'saturation' && heavy;
  if (plugins.length && !preferBuiltin) {
    const scores = new Map(searchManifest(plugins, prompt, { includeDuplicates: true }).map((h) => [h.item.id, h.score]));
    const best = [...plugins].sort((a, b) => Number(b.kind === 'plugin' && b.hostable) - Number(a.kind === 'plugin' && a.hostable) || (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))[0];
    return libraryUnit(best, cat, `${cat} plugin from D:\\vsr`);
  }
  const words = new Set(tokenize(prompt));
  const t = prompt.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => (w.includes(' ') ? t.includes(w) : words.has(w)));
  let type = BUILTIN_EFFECT[cat];
  // character picks from the hardware / Reason lineup
  if (cat === 'saturation' && has('lofi', 'lo-fi', 'tape', 'vinyl', 'vhs', 'cassette', 'dusty', 'retro')) type = 'audiomatic';
  else if (cat === 'saturation' && has('amp', 'guitar', 'crunch')) type = 'softube_amp';
  else if (cat === 'dynamics' && has('warm', 'smooth', 'vocal', 'vocals', 'opto', 'tube')) type = 'la2a';
  else if (cat === 'dynamics' && has('punch', 'punchy', 'drums', 'aggressive', 'snappy')) type = 'ua1176';
  else if (cat === 'filter' && has('gate', 'gated', 'trance gate', 'chop', 'chopped', 'stutter')) type = 'alligator';
  else if (cat === 'modulation' && has('vocoder', 'robot', 'robotic')) type = 'bvx_vocoder';
  else if (cat === 'delay' && has('space', 'spacey', 'spacious', 'ambient', 'shimmer', 'washy')) type = 'ripley';
  else if (cat === 'eq' && has('vintage', 'pultec', 'warm', 'analog', 'analogue')) type = 'pultec_eqp1a';
  if (!type || usedTypes.has(type)) return null;
  usedTypes.add(type);
  return builtinUnit(type, cat, `Built-in ${cat}`);
}

function tuneEffect(unit: DraftUnit, has: (...ws: string[]) => boolean, notes: string[]): void {
  const p = unit.params;
  if (unit.source === 'builtin') {
    if (unit.type === 'rv7000') {
      if (has('huge', 'epic', 'cathedral', 'space', 'spacious', 'ambient', 'dreamy', 'shimmer', 'lush')) Object.assign(p, { preset: 'Hall', decay: 6, size: 0.95, mix: 0.45 });
      else if (has('small', 'room', 'tight', 'dry', 'intimate')) Object.assign(p, { preset: 'Room', decay: 1.2, size: 0.4, mix: 0.22 });
      else if (has('plate', 'vocal', 'vocals')) Object.assign(p, { preset: 'Plate', decay: 2.2, mix: 0.3 });
      else Object.assign(p, { preset: 'Hall', decay: 3.2, mix: 0.32 });
    } else if (unit.type === 'echo') {
      if (has('dub', 'dubby')) Object.assign(p, { time: 0.375, feedback: 0.65, mix: 0.35 });
      else if (has('slapback', 'slap')) Object.assign(p, { time: 0.11, feedback: 0.1, mix: 0.25 });
      else Object.assign(p, { time: 0.33, feedback: 0.4, mix: 0.28 });
      if (has('ping', 'ping-pong', 'pingpong', 'wide', 'stereo')) p.pingPong = true;
    } else if (unit.type === 'scream4') {
      Object.assign(p, has('aggressive', 'heavy', 'brutal', 'destroy', 'destroyed', 'industrial') ? { drive: 12, mix: 0.85 } : { drive: 6, mix: 0.6 });
    } else if (unit.type === 'mclass_master') {
      Object.assign(p, has('loud', 'radio', 'club') ? { compThreshold: -20, compRatio: 4, limiterCeiling: -0.3 } : { compThreshold: -16, compRatio: 2.5 });
    } else if (unit.type === 'audiomatic') {
      Object.assign(p, { preset: has('vinyl', 'dusty') ? 'Vinyl' : has('vhs') ? 'VHS' : has('cassette') ? 'Cassette' : has('lofi', 'lo-fi') ? 'Lo-Fi' : 'Tape', transform: 0.6 });
    } else if (unit.type === 'mclass_maximizer') {
      Object.assign(p, { input: has('loud', 'louder', 'radio', 'club', 'edm') ? 6 : 3, ceiling: -0.3 });
    } else if (unit.type === 'ssl_gbus') {
      Object.assign(p, { threshold: has('heavy', 'squash', 'pump', 'pumping') ? -10 : -4, ratio: '4:1', attack: '10 ms', release: 'Auto' });
    } else if (unit.type === 'la2a') {
      Object.assign(p, { peakReduction: has('heavy', 'squash') ? 70 : 45 });
    } else if (unit.type === 'ua1176') {
      Object.assign(p, { input: has('heavy', 'smash', 'aggressive') ? 38 : 28, ratio: has('smash', 'all buttons', 'aggressive') ? 'All' : '4' });
    } else if (unit.type === 'channel_eq') {
      if (has('dark', 'darker', 'moody', 'warm')) p.hfGain = -4;
      if (has('bright', 'brighter', 'airy', 'crisp')) p.hfGain = 4;
      if (has('muddy', 'mud', 'boomy')) Object.assign(p, { lmfGain: -4, lmfFreq: 300 });
      if (has('harsh')) Object.assign(p, { hmfGain: -4, hmfFreq: 3500 });
      p.hpf = 30;
    } else if (unit.type === 'quartet') {
      Object.assign(p, { mode: has('wide', 'stereo') ? 'Dimension' : has('shimmer', 'granular') ? 'Granular' : 'Ensemble', mix: 0.45 });
    } else if (unit.type === 'alligator') {
      Object.assign(p, { pattern: '1', rate: '1/16', mix: 0.9 });
    } else if (unit.type === 'ripley') {
      Object.assign(p, { space: 0.6, feedback: 0.5, mix: 0.4 });
    }
    return;
  }
  switch (unit.cat) {
    case 'saturation':
      p.macro1 = has('lofi', 'lo-fi', 'grit', 'gritty', 'dirty', 'crunch') ? 0.6 : 0.3;
      break;
    case 'eq':
      if (has('dark', 'darker', 'moody', 'warm')) p.macro4 = 0.32;
      if (has('bright', 'brighter', 'airy', 'crisp')) p.macro4 = 0.7;
      if (has('muddy', 'mud', 'boomy')) p.macro2 = 0.38;
      if (has('harsh', 'sibilance', 'de-ess')) p.macro3 = 0.38;
      break;
    case 'limiter':
      p.macro1 = has('loud', 'louder', 'radio', 'club', 'edm') ? 0.55 : 0.35;
      break;
    case 'pitch':
      if (has('robot', 'robotic', 'bitcrush', 'bitcrushed')) p.macro2 = 0.45;
      if (has('chipmunk', 'higher', 'octave up')) p.macro1 = 1;
      if (has('deep', 'monster', 'demon', 'lower', 'octave down')) p.macro1 = 0;
      if (has('autotune', 'auto-tune', 'tune', 'correction')) notes.push('Pitch correction is not emulated by the proxy DSP; the unit applies pitch shift / bitcrush only');
      break;
    default:
      break;
  }
}

/** Where an LFO should go: instrument filter/morph first, then the first effect macro. */
function lfoTarget(units: DraftUnit[], sourceIndex: number, items: { id: string; kind: string; category?: string }[]): { unit: number; port: string } | null {
  if (sourceIndex >= 0) {
    const src = units[sourceIndex];
    if (src.source === 'builtin') {
      const spec = BUILTIN_BY_TYPE.get(src.type ?? '');
      const port = spec?.cvIn.find((p) => p === 'cv_morph') ?? spec?.cvIn.find((p) => p === 'cv_cutoff');
      if (port) return { unit: sourceIndex, port };
    } else {
      const item = items.find((i) => i.id === src.itemId);
      const brightSlot = item && ['strings', 'brass', 'winds', 'orchestral', 'choir'].includes(item.category ?? '') ? 'cv_m2' : 'cv_m1';
      return { unit: sourceIndex, port: brightSlot };
    }
  }
  const fx = units.findIndex((u) => u.cat !== 'modulator' && u.source === 'library');
  if (fx >= 0) return { unit: fx, port: 'cv_m1' };
  const rv = units.findIndex((u) => u.type === 'rv7000');
  return rv >= 0 ? { unit: rv, port: 'cv_mix' } : null;
}

function titleFrom(prompt: string): string {
  const words = tokenize(prompt).filter((w) => w.length > 2).slice(0, 4);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : 'AI Combi';
}
