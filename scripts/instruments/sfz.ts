/**
 * SFZ reader for the instrument converter: expands #include / #define, applies the header
 * hierarchy (<control> <global> <master> <group> <region>), reads <curve>s, then evaluates
 * every region with the instrument's default controller state (set_ccN / set_hdccN) into flat
 * regions. By default only the default sticky keyswitch articulation is kept; all-articulations
 * mode preserves sw_last variants. CC-gated layers use their default mix; CC1 crossfades may stay
 * live when requested. Release triggers, sticky articulations and momentary sw_down / sw_up
 * selectors are supported. First/legato and sw_previous note-on selectors are preserved.
 * First/legato triggers are dropped.
 */
import path from 'node:path';
import type { PackModWheelFade } from '../../shared/instruments/types.ts';

export interface SfzEq {
  freq: number;
  bw: number;
  gain: number;
}

export interface SfzFilter {
  type: string;
  cutoff: number;
  resonance: number;
}

export interface FlatRegion {
  /** Sample path relative to the .sfz file's folder, '' for *silence. */
  sample: string;
  lokey: number;
  hikey: number;
  keycenter: number;
  /** Cents per key (100 = normal pitch tracking, 0 = fixed pitch). */
  keytrack: number;
  lovel: number;
  hivel: number;
  seqLength: number;
  seqPosition: number;
  lorand: number;
  hirand: number;
  /** transpose + tune + controller tune, cents. */
  tune: number;
  /** Linear gain (volume dB, amplitude %, controller faders). */
  gain: number;
  /** -100..100 */
  pan: number;
  /** Frames at the sample's own rate. */
  offset: number;
  end: number | null;
  loopMode: 'no_loop' | 'one_shot' | 'loop_continuous' | 'loop_sustain' | null;
  loopStart: number | null;
  loopEnd: number | null;
  reverse: boolean;
  group: number | null;
  offBy: number | null;
  notePolyphony: number | null;
  ampeg: { attack: number; hold: number; decay: number; sustain: number; release: number };
  velCurve: [number, number][] | null;
  /** 0..1 */
  ampVeltrack: number;
  velocityFadeIn: [number, number] | null;
  velocityFadeOut: [number, number] | null;
  velocityFadeCurve: 'gain' | 'power';
  modWheelFade: PackModWheelFade | null;
  filters: SfzFilter[];
  eqs: SfzEq[];
  /** Sticky SFZ keyswitch articulation, when all-articulations import is enabled. */
  articulationId?: string;
  /** Momentary SFZ keyswitch selector, active while this note is depressed. */
  swDown?: number;
  /** SFZ selector active while this keyswitch is not depressed. */
  swUp?: number;
  /** SFZ selector: previous note-on must have this MIDI note. */
  swPrevious?: number;
  trigger: 'attack' | 'release';
}

export interface SfzArticulation {
  id: string;
  label: string;
  keyswitch: number | null;
  default: boolean;
}

export interface SfzProgram {
  regions: FlatRegion[];
  articulations: SfzArticulation[];
  /** Regions dropped and why (report). */
  dropped: Record<string, number>;
  /** Every sample path a sounding region uses. */
  samples: string[];
}

type Ops = Record<string, string>;

/** Note name (c4 = 60, c#4, db4) or number → MIDI note. */
export function parseKey(v: string | undefined): number | null {
  if (v === undefined) return null;
  const t = v.trim().toLowerCase();
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  const m = /^([a-g])([#b♯♭]?)(-?\d+)$/.exec(t);
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1] as 'c'];
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return (parseInt(m[3], 10) + 1) * 12 + base + acc;
}

// ---------------------------------------------------------------- text → statements

type Statement = { header: string } | { key: string; value: string };

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
}

function statements(file: string, read: (rel: string) => string | null, defines: Map<string, string>, out: Statement[], depth = 0): void {
  if (depth > 32) throw new Error(`#include nesting too deep at ${file}`);
  const text = read(file);
  if (text === null) throw new Error(`SFZ file not found: ${file}`);
  for (const rawLine of stripComments(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const def = /^#define\s+(\$[A-Za-z0-9_]+)\s+(.*)$/.exec(line);
    if (def) {
      defines.set(def[1], def[2].trim());
      continue;
    }
    const inc = /^#include\s+"([^"]+)"/.exec(line);
    if (inc) {
      statements(inc[1].replace(/\\/g, '/'), read, defines, out, depth + 1);
      continue;
    }
    const sub = line.replace(/\$[A-Za-z0-9_]+/g, (name) => defines.get(name) ?? name);
    const re = /<(\w+)>|([A-Za-z0-9_]+)=/g;
    const marks: { at: number; end: number; header?: string; key?: string }[] = [];
    for (let m = re.exec(sub); m; m = re.exec(sub)) marks.push({ at: m.index, end: re.lastIndex, header: m[1], key: m[2] });
    marks.forEach((mk, i) => {
      if (mk.header) out.push({ header: mk.header.toLowerCase() });
      else if (mk.key) out.push({ key: mk.key.toLowerCase(), value: sub.slice(mk.end, i + 1 < marks.length ? marks[i + 1].at : undefined).trim() });
    });
  }
}

// ---------------------------------------------------------------- curves

/** SFZ v2 default curves 0..6, overridable by <curve> blocks. */
function builtinCurve(index: number): Float64Array | null {
  const c = new Float64Array(128);
  for (let i = 0; i < 128; i++) {
    const x = i / 127;
    const v = [x, x * 2 - 1, 1 - x, 1 - x * 2, x * x, Math.sqrt(x), 1 - Math.sqrt(x)][index];
    if (v === undefined) return null;
    c[i] = v;
  }
  return c;
}

function buildCurve(ops: Ops): [number, Float64Array] | null {
  const idx = parseInt(ops.curve_index ?? '', 10);
  if (!Number.isFinite(idx)) return null;
  const pts: [number, number][] = [];
  for (const [k, v] of Object.entries(ops)) {
    const m = /^v(\d{1,3})$/.exec(k);
    if (m) pts.push([parseInt(m[1], 10), parseFloat(v)]);
  }
  if (!pts.some((p) => p[0] === 0)) pts.push([0, 0]);
  if (!pts.some((p) => p[0] === 127)) pts.push([127, 1]);
  pts.sort((a, b) => a[0] - b[0]);
  const c = new Float64Array(128);
  for (let i = 0; i < 128; i++) {
    let j = 1;
    while (j < pts.length - 1 && pts[j][0] < i) j++;
    const [x0, y0] = pts[j - 1];
    const [x1, y1] = pts[j];
    c[i] = x1 === x0 ? y1 : y0 + ((y1 - y0) * (i - x0)) / (x1 - x0);
  }
  return [idx, c];
}

// ---------------------------------------------------------------- parse + evaluate

export interface SfzOptions {
  /** 7-bit MIDI controller values (0..127) overriding the file defaults. */
  cc?: Record<number, number>;
  /** MIDI channel used when an SFZ maps different instruments to different channels. */
  channel?: number;
  /** Preserve sticky sw_last variants as playable keyswitch articulations. */
  allArticulations?: boolean;
  /** Keep CC1 xfin/xfout as a live mod-wheel layer crossfade instead of baking the default. */
  liveModWheel?: boolean;
  /** Semitones added to every key range and key center. For a source that names its samples at another octave. */
  keyShift?: number;
}

/**
 * `read(rel)` returns the text of a file given relative to the root .sfz's folder (or null).
 * Sample paths in the result are relative to that folder too.
 */
export function readSfz(rootFile: string, read: (rel: string) => string | null, opts: SfzOptions = {}): SfzProgram {
  const stmts: Statement[] = [];
  statements(path.posix.basename(rootFile), (rel) => read(path.posix.join(path.posix.dirname(rootFile), rel)), new Map(), stmts);

  const cc = new Map<number, number>([
    [7, 100],
    [10, 64],
    [11, 127],
  ]);
  const curves = new Map<number, Float64Array>();
  for (let i = 0; i <= 6; i++) curves.set(i, builtinCurve(i)!);
  let control: Ops = {};
  let global: Ops = {};
  let master: Ops = {};
  let group: Ops = {};
  let current: Ops | null = null;
  let section = '';
  let region: { ops: Ops; defaultPath: string; keyOffset: number } | null = null;
  const merged: { ops: Ops; defaultPath: string; keyOffset: number }[] = [];
  const keyOffset = () =>
    (parseInt(control.note_offset ?? '0', 10) || 0) + 12 * (parseInt(control.octave_offset ?? '0', 10) || 0) + (opts.keyShift ?? 0);
  // Any header ends the open region / curve, so parent levels can't change while it is open.
  const close = () => {
    if (region) merged.push({ ...region, ops: { ...global, ...master, ...group, ...region.ops } });
    region = null;
    if (section === 'curve' && current) {
      const c = buildCurve(current);
      if (c) curves.set(c[0], c[1]);
    }
  };

  for (const st of stmts) {
    if ('header' in st) {
      close();
      section = st.header;
      if (section === 'control') current = control;
      else if (section === 'global') {
        global = {};
        master = {};
        group = {};
        current = global;
      } else if (section === 'master') {
        master = {};
        group = {};
        current = master;
      } else if (section === 'group') {
        group = {};
        current = group;
      }
      else if (section === 'region') {
        region = { ops: {}, defaultPath: control.default_path ?? '', keyOffset: keyOffset() };
        current = region.ops;
      } else if (section === 'curve') current = {};
      else current = null; // <effect>, <midi>, <sample> …
      continue;
    }
    if (section === 'control') {
      const m = /^set_cc(\d+)$/.exec(st.key);
      if (m) cc.set(parseInt(m[1], 10), Math.max(0, Math.min(127, parseFloat(st.value) || 0)));
      const hd = /^set_(?:hdcc|realcc)(\d+)$/.exec(st.key);
      if (hd) {
        const value = Number(st.value);
        if (Number.isFinite(value)) cc.set(parseInt(hd[1], 10), Math.max(0, Math.min(1, value)) * 127);
      }
    }
    if (current) current[st.key] = st.value;
  }
  close();

  const ccOver = opts.cc ?? {};
  for (const [k, v] of Object.entries(ccOver)) cc.set(Number(k), v);
  const ccv = (n: number) => cc.get(n) ?? 0;

  const dropped: Record<string, number> = {};
  const drop = (why: string) => (dropped[why] = (dropped[why] ?? 0) + 1);
  const regions: FlatRegion[] = [];

  // default keyswitch: sw_default, else the lowest sw_last in the program
  let swDefault: number | null = null;
  for (const r of merged) {
    const d = parseKey(r.ops.sw_default);
    if (d !== null) swDefault = d;
  }
  if (swDefault === null)
    for (const r of merged) {
      const k = parseKey(r.ops.sw_last);
      if (k !== null && (swDefault === null || k < swDefault)) swDefault = k;
    }

  const articulationId = (note: number) => `ks-${note}`;
  const articulationMap = new Map<number, SfzArticulation>();
  if (opts.allArticulations && swDefault !== null) {
    const notes = new Set<number>([swDefault]);
    for (const r of merged) {
      const sw = parseKey(r.ops.sw_last);
      if (sw !== null) notes.add(sw);
    }
    for (const note of notes) {
      // Prefer an explicit articulation label over the inherited program default. Every region
      // inherits sw_default, so checking that first can hide the label on the matching sw_last.
      const label = merged.find((r) => parseKey(r.ops.sw_last) === note)?.ops.sw_label ??
        (note === swDefault ? merged.find((r) => parseKey(r.ops.sw_default) === note)?.ops.sw_label : undefined);
      articulationMap.set(note, {
        id: articulationId(note),
        label: label?.trim() || `Keyswitch ${note}`,
        keyswitch: note,
        default: note === swDefault,
      });
    }
  }

  for (const { ops, defaultPath, keyOffset: ko } of merged) {
    const f = (k: string, d: number) => {
      const v = parseFloat(ops[k] ?? '');
      return Number.isFinite(v) ? v : d;
    };
    const channel = opts.channel ?? 1;
    if (channel < f('lochan', 1) || channel > f('hichan', 16)) {
      drop('MIDI channel');
      continue;
    }
    /** A modifier over its CCs (value × curve(cc)): summed (dB, cents …) and as a product of percentages. */
    const ccMod = (base: string): { sum: number; prod: number } => {
      let sum = 0;
      let prod = 1;
      const re = new RegExp(`^${base}_(?:on)?cc(\\d+)$`);
      for (const [k, v] of Object.entries(ops)) {
        const m = re.exec(k);
        if (!m) continue;
        const n = parseInt(m[1], 10);
        const curveIdx = parseInt(ops[`${base}_curvecc${n}`] ?? '0', 10);
        const curve = curves.get(curveIdx) ?? curves.get(0)!;
        const ccValue = Math.max(0, Math.min(127, ccv(n)));
        const lower = Math.floor(ccValue);
        const upper = Math.min(127, lower + 1);
        const amount = ccValue - lower;
        const curveValue = curve[lower] + (curve[upper] - curve[lower]) * amount;
        const val = parseFloat(v) * curveValue;
        sum += val;
        prod *= val / 100;
      }
      return { sum, prod };
    };

    const triggerValue = (ops.trigger ?? 'attack').toLowerCase();
    if (triggerValue !== 'attack' && triggerValue !== 'release') {
      drop(`trigger=${triggerValue}`);
      continue;
    }
    const trigger: FlatRegion['trigger'] = triggerValue === 'release' ? 'release' : 'attack';
    if (Object.keys(ops).some((k) => /^on_(lo|hi)cc\d+$/.test(k) || k === 'start_locc' || k === 'start_hicc')) {
      drop('cc-triggered');
      continue;
    }
    const parsedPreviousNote = ops.sw_previous === undefined ? null : parseKey(ops.sw_previous);
    // Match the -1 unset convention used by the momentary switch opcodes.
    const swPrevious = parsedPreviousNote === -1 ? null : parsedPreviousNote;
    if (ops.sw_previous !== undefined && parsedPreviousNote !== -1 &&
      (parsedPreviousNote === null || parsedPreviousNote < 0 || parsedPreviousNote > 127)) {
      drop('invalid sw_previous');
      continue;
    }
    const readMomentarySwitch = (key: 'sw_down' | 'sw_up'): number | null | undefined => {
      if (ops[key] === undefined) return null;
      const note = parseKey(ops[key]);
      if (note === -1) return null;
      return note !== null && note >= 0 && note <= 127 ? note : undefined;
    };
    const swDown = readMomentarySwitch('sw_down');
    const swUp = readMomentarySwitch('sw_up');
    if (swDown === undefined || swUp === undefined) {
      drop('invalid held keyswitch');
      continue;
    }
    const parsedSwitchLo = parseKey(ops.sw_lokey);
    const parsedSwitchHi = parseKey(ops.sw_hikey);
    const switchLo = parsedSwitchLo === null || parsedSwitchLo < 0 ? 0 : parsedSwitchLo;
    const switchHi = parsedSwitchHi === null || parsedSwitchHi < 0 ? 127 : parsedSwitchHi;
    if ((swDown !== null && (swDown < switchLo || swDown > switchHi)) || (swUp !== null && (swUp < switchLo || swUp > switchHi))) {
      drop('held keyswitch outside range');
      continue;
    }
    const swLast = parseKey(ops.sw_last);
    const swLo = parseKey(ops.sw_lokey);
    if (!opts.allArticulations && swLast !== null && swLast !== swDefault) {
      drop('other keyswitch');
      continue;
    }
    if (swLast === null && swLo !== null && swDefault !== null) {
      const swHi = parseKey(ops.sw_hikey) ?? 127;
      if (swDefault < swLo || swDefault > swHi) {
        drop('other keyswitch');
        continue;
      }
    }
    const regionArticulation = opts.allArticulations && articulationMap.size
      ? articulationId(swLast ?? swDefault!)
      : undefined;
    let ccOk = true;
    for (const k of Object.keys(ops)) {
      const m = /^locc(\d+)$/.exec(k) ?? /^hicc(\d+)$/.exec(k);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      const lo = f(`locc${n}`, 0);
      const hi = f(`hicc${n}`, 127);
      if (ccv(n) < lo || ccv(n) > hi) ccOk = false;
    }
    if (!ccOk) {
      drop('controller off');
      continue;
    }
    const sampleRaw = (ops.sample ?? '').replace(/\\/g, '/');
    if (!sampleRaw) {
      drop('no sample');
      continue;
    }
    let sample = '';
    if (sampleRaw.startsWith('*')) {
      if (sampleRaw !== '*silence') {
        drop(`generator ${sampleRaw}`);
        continue;
      }
    } else {
      sample = path.posix.normalize(path.posix.join(defaultPath.replace(/\\/g, '/'), sampleRaw));
      // A sample outside the program's folder would read a file the pack does not own.
      if (path.posix.isAbsolute(sample) || /^[a-zA-Z]:/.test(sample) || sample === '..' || sample.startsWith('../')) {
        drop('sample outside its folder');
        continue;
      }
    }

    const key = parseKey(ops.key);
    let lokey = parseKey(ops.lokey) ?? key ?? 0;
    let hikey = parseKey(ops.hikey) ?? key ?? 127;
    let keycenter = parseKey(ops.pitch_keycenter) ?? key ?? 60;
    lokey += ko;
    hikey += ko;
    keycenter += ko;
    if (hikey < 0 || lokey > 127) {
      drop('outside key range');
      continue;
    }

    const amplitude = f('amplitude', 100) / 100;
    const ampCc = ccMod('amplitude').prod;
    const volume = f('volume', 0) + ccMod('volume').sum + ccMod('gain').sum;
    const cc1Fade = (): PackModWheelFade | null => {
      if (!opts.liveModWheel) return null;
      const inLo = ops.xfin_locc1;
      const inHi = ops.xfin_hicc1;
      const outLo = ops.xfout_locc1;
      const outHi = ops.xfout_hicc1;
      if (inLo === undefined && inHi === undefined && outLo === undefined && outHi === undefined) return null;
      const fade: PackModWheelFade = { curve: (ops.xf_cccurve ?? 'power').toLowerCase() === 'gain' ? 'gain' : 'power', default: ccv(1) };
      if (inLo !== undefined || inHi !== undefined) fade.in = [
        Math.max(0, Math.min(127, Math.round(f('xfin_locc1', 0)))),
        Math.max(0, Math.min(127, Math.round(f('xfin_hicc1', 127)))),
      ];
      if (outLo !== undefined || outHi !== undefined) fade.out = [
        Math.max(0, Math.min(127, Math.round(f('xfout_locc1', 0)))),
        Math.max(0, Math.min(127, Math.round(f('xfout_hicc1', 127)))),
      ];
      return fade;
    };
    const modWheelFade = cc1Fade();
    // CC1 stays live for expressive layers; other controller crossfades are baked at defaults.
    const ccCrossfade = () => {
      let result = 1;
      const curve = (ops.xf_cccurve ?? 'power').toLowerCase();
      for (let n = 0; n <= 127; n++) {
        if (n === 1 && modWheelFade) continue;
        const xfinLoKey = `xfin_locc${n}`;
        const xfinHiKey = `xfin_hicc${n}`;
        const xfoutLoKey = `xfout_locc${n}`;
        const xfoutHiKey = `xfout_hicc${n}`;
        const hasIn = ops[xfinLoKey] !== undefined || ops[xfinHiKey] !== undefined;
        const hasOut = ops[xfoutLoKey] !== undefined || ops[xfoutHiKey] !== undefined;
        const value = ccv(n);
        const fade = (lo: number, hi: number, fadeIn: boolean): number => {
          if (hi <= lo) return fadeIn ? (value >= hi ? 1 : 0) : (value <= lo ? 1 : 0);
          const x = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
          if (curve === 'gain') return fadeIn ? x : 1 - x;
          return fadeIn ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
        };
        if (hasIn) result *= fade(f(xfinLoKey, 0), f(xfinHiKey, 127), true);
        if (hasOut) result *= fade(f(xfoutLoKey, 0), f(xfoutHiKey, 127), false);
      }
      return result;
    };
    const gain = amplitude * ampCc * ccCrossfade() * Math.pow(10, volume / 20);
    if (gain <= 1e-5 && !modWheelFade) {
      drop('silent at default mix');
      continue;
    }

    const velPts: [number, number][] = [];
    for (const [k, v] of Object.entries(ops)) {
      const m = /^amp_velcurve_(\d+)$/.exec(k);
      if (m) velPts.push([parseInt(m[1], 10), parseFloat(v)]);
    }
    velPts.sort((a, b) => a[0] - b[0]);
    // unspecified ends default to (0, 0) and (127, 1)
    if (velPts.length && !velPts.some((p) => p[0] === 0)) velPts.unshift([0, 0]);
    if (velPts.length && !velPts.some((p) => p[0] === 127)) velPts.push([127, 1]);

    const filters: SfzFilter[] = [];
    for (const [suffix, typeKey] of [
      ['', 'fil_type'],
      ['2', 'fil2_type'],
    ] as const) {
      const cutoff = ops[`cutoff${suffix}`];
      if (cutoff === undefined) continue;
      const cents = ccMod(`cutoff${suffix}`).sum;
      filters.push({
        type: (ops[typeKey] ?? 'lpf_2p').toLowerCase(),
        cutoff: parseFloat(cutoff) * Math.pow(2, cents / 1200),
        resonance: f(`resonance${suffix}`, 0),
      });
    }
    const eqs: SfzEq[] = [];
    for (let i = 1; i <= 3; i++) {
      const g = f(`eq${i}_gain`, 0) + ccMod(`eq${i}_gain`).sum;
      if (Math.abs(g) < 0.05) continue;
      eqs.push({ freq: f(`eq${i}_freq`, [50, 500, 5000][i - 1]), bw: f(`eq${i}_bw`, 1), gain: g });
    }

    const loopMode = (ops.loop_mode ?? ops.loopmode ?? '').toLowerCase();
    const velocityFade = (prefix: 'xfin' | 'xfout'): [number, number] | null => {
      const loKey = `${prefix}_lovel`;
      const hiKey = `${prefix}_hivel`;
      if (ops[loKey] === undefined && ops[hiKey] === undefined) return null;
      return [
        Math.max(0, Math.min(127, Math.round(f(loKey, 0)))),
        Math.max(0, Math.min(127, Math.round(f(hiKey, 127)))),
      ];
    };
    const velocityFadeCurve = (ops.xf_velcurve ?? 'power').toLowerCase();
    regions.push({
      sample,
      lokey: Math.max(0, lokey),
      hikey: Math.min(127, hikey),
      keycenter,
      keytrack: f('pitch_keytrack', 100),
      lovel: f('lovel', 1),
      hivel: f('hivel', 127),
      seqLength: Math.max(1, Math.round(f('seq_length', 1))),
      seqPosition: Math.max(1, Math.round(f('seq_position', 1))),
      lorand: f('lorand', 0),
      hirand: f('hirand', 1),
      tune: f('transpose', 0) * 100 + f('tune', f('pitch', 0)) + ccMod('tune').sum + ccMod('pitch').sum,
      gain,
      pan: Math.max(-100, Math.min(100, f('pan', 0) + ccMod('pan').sum)),
      offset: Math.max(0, f('offset', 0) + ccMod('offset').sum),
      end: ops.end !== undefined ? f('end', 0) : null,
      loopMode: ['no_loop', 'one_shot', 'loop_continuous', 'loop_sustain'].includes(loopMode) ? (loopMode as FlatRegion['loopMode']) : null,
      loopStart: ops.loop_start !== undefined || ops.loopstart !== undefined ? f('loop_start', f('loopstart', 0)) : null,
      loopEnd: ops.loop_end !== undefined || ops.loopend !== undefined ? f('loop_end', f('loopend', 0)) : null,
      reverse: (ops.direction ?? '').toLowerCase() === 'reverse',
      group: ops.group !== undefined ? Math.round(f('group', 0)) : null,
      offBy: ops.off_by !== undefined ? Math.round(f('off_by', 0)) : null,
      notePolyphony: ops.note_polyphony !== undefined ? Math.round(f('note_polyphony', 0)) : null,
      ampeg: {
        attack: Math.max(0, f('ampeg_attack', 0) + ccMod('ampeg_attack').sum),
        hold: Math.max(0, f('ampeg_hold', 0) + ccMod('ampeg_hold').sum),
        decay: Math.max(0, f('ampeg_decay', 0) + ccMod('ampeg_decay').sum),
        sustain: Math.max(0, Math.min(100, f('ampeg_sustain', 100) + ccMod('ampeg_sustain').sum)) / 100,
        release: Math.max(0, f('ampeg_release', 0.001) + ccMod('ampeg_release').sum),
      },
      velCurve: velPts.length ? velPts : null,
      ampVeltrack: f('amp_veltrack', 100) / 100,
      velocityFadeIn: velocityFade('xfin'),
      velocityFadeOut: velocityFade('xfout'),
      velocityFadeCurve: velocityFadeCurve === 'gain' ? 'gain' : 'power',
      modWheelFade,
      filters,
      eqs,
      trigger,
      ...(regionArticulation ? { articulationId: regionArticulation } : {}),
      ...(swDown !== null ? { swDown } : {}),
      ...(swUp !== null ? { swUp } : {}),
      ...(swPrevious !== null ? { swPrevious } : {}),
    });
  }
  return {
    regions,
    articulations: [...articulationMap.values()],
    dropped,
    samples: [...new Set(regions.map((r) => r.sample).filter(Boolean))],
  };
}
