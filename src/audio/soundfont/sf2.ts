/** Minimal SF2 hydra reader for playable sample zones (preset/instrument maps and PCM). */
export interface Sf2Sample {
  name: string;
  start: number;
  end: number;
  loopStart: number;
  loopEnd: number;
  sampleRate: number;
  originalPitch: number;
  pitchCorrection: number;
  sampleLink: number;
  sampleType: number;
}

export interface Sf2Zone {
  sampleIndex: number;
  keyLow: number;
  keyHigh: number;
  velLow: number;
  velHigh: number;
  rootMidi: number;
  tuneCents: number;
  level: number;
  delay: number;
  attack: number;
  hold: number;
  decay: number;
  sustain: number;
  release: number;
  keyToHold: number;
  keyToDecay: number;
  /** SF2 cents per MIDI key; 100 is normal equal-tempered scaling. */
  scaleTuning?: number;
  /** SF2 initialFilterFc generator, in cents from 8.176 Hz. */
  filterCutoffCents?: number;
  /** Nonzero SF2 class terminates other sounding zones in the same preset class. */
  exclusiveClass?: number;
  loop: boolean;
  loopUntilRelease: boolean;
  start: number;
  end: number;
  loopStart: number;
  loopEnd: number;
}

export interface Sf2Preset {
  name: string;
  bank: number;
  program: number;
  zones: Sf2Zone[];
}

export interface ParsedSf2 {
  samples: Sf2Sample[];
  /** PCM is kept as a view over the uploaded file until the user selects a preset. */
  pcm: Int16Array;
  presets: Sf2Preset[];
}

interface Chunk { offset: number; size: number; }
interface Bag { gen: number; mod: number; }
interface Generator { op: number; raw: number; signed: number; low: number; high: number; }
interface Range { low: number; high: number; }

/** SF2's default negative-unipolar concave velocity modulator to 960 cB attenuation. */
export function sf2DefaultVelocityAmplitude(normalizedVelocity: number): number {
  const normalized = Number.isFinite(normalizedVelocity) ? normalizedVelocity : 0;
  const velocity = Math.max(1, Math.min(127, Math.round(normalized * 127)));
  return (velocity / 127) ** 2;
}

const RECORD_SIZES = {
  phdr: 38, pbag: 4, pmod: 10, pgen: 4,
  inst: 22, ibag: 4, imod: 10, igen: 4, shdr: 46,
} as const;

const intersect = (a: Range, b: Range): Range => ({ low: Math.max(a.low, b.low), high: Math.min(a.high, b.high) });
const FULL_RANGE: Range = { low: 0, high: 127 };
const timecentsSeconds = (value: number | undefined, fallback: number): number =>
  value === undefined ? fallback : Math.max(0.001, Math.min(10, 2 ** (Math.max(-12000, Math.min(8000, value)) / 1200)));

export function parseSf2(arrayBuffer: ArrayBuffer): ParsedSf2 | null {
  try {
    const view = new DataView(arrayBuffer);
    if (arrayBuffer.byteLength < 12 || fourCC(view, 0) !== 'RIFF' || fourCC(view, 8) !== 'sfbk') return null;
    const riffEnd = view.getUint32(4, true) + 8;
    if (riffEnd < 12 || riffEnd > arrayBuffer.byteLength) return null;

    const chunks = new Map<string, Chunk>();
    let offset = 12;
    while (offset < riffEnd) {
      if (offset + 8 > riffEnd) return null;
      const id = fourCC(view, offset);
      const size = view.getUint32(offset + 4, true);
      const dataStart = offset + 8;
      const chunkEnd = dataStart + size;
      if (chunkEnd > riffEnd || chunkEnd < dataStart) return null;
      if (id === 'LIST') {
        if (size < 4) return null;
        const listType = fourCC(view, dataStart);
        let child = dataStart + 4;
        while (child < chunkEnd) {
          if (child + 8 > chunkEnd) return null;
          const childId = fourCC(view, child);
          const childSize = view.getUint32(child + 4, true);
          const childData = child + 8;
          const childEnd = childData + childSize;
          if (childEnd > chunkEnd || childEnd < childData) return null;
          if ((listType === 'pdta' || listType === 'sdta') && chunks.has(childId)) return null;
          if (listType === 'pdta' || listType === 'sdta') chunks.set(childId, { offset: childData, size: childSize });
          child = childEnd + (childSize & 1);
        }
        if (child !== chunkEnd) return null;
      }
      offset = chunkEnd + (size & 1);
    }
    if (offset !== riffEnd) return null;

    const chunk = (id: keyof typeof RECORD_SIZES): Chunk | null => chunks.get(id) ?? null;
    const records: Record<keyof typeof RECORD_SIZES, Chunk> = {} as Record<keyof typeof RECORD_SIZES, Chunk>;
    for (const [id, recordSize] of Object.entries(RECORD_SIZES) as [keyof typeof RECORD_SIZES, number][]) {
      const found = chunk(id);
      if (!found || found.size % recordSize !== 0) return null;
      records[id] = found;
    }
    const smpl = chunks.get('smpl');
    if (!smpl || (smpl.offset & 1) !== 0 || (smpl.size & 1) !== 0) return null;
    const pcm = new Int16Array(arrayBuffer, smpl.offset, smpl.size / 2);

    const phdrCount = records.phdr.size / 38;
    const instCount = records.inst.size / 22;
    const sampleCount = records.shdr.size / 46;
    if (phdrCount < 2 || instCount < 2 || sampleCount < 2) return null;
    if (records.pbag.size < 4 || records.ibag.size < 4 || records.pgen.size < 4 || records.igen.size < 4 || records.pmod.size < 10 || records.imod.size < 10) return null;

    const pBags = readBags(view, records.pbag, 4);
    const iBags = readBags(view, records.ibag, 4);
    const pGens = readGenerators(view, records.pgen);
    const iGens = readGenerators(view, records.igen);
    const samples = readSamples(view, records.shdr, sampleCount - 1, pcm.length);
    const instruments = readInstruments(view, records.inst, instCount - 1);
    const presets: Sf2Preset[] = [];

    for (let presetIndex = 0; presetIndex < phdrCount - 1; presetIndex++) {
      const header = records.phdr.offset + presetIndex * 38;
      const firstBag = view.getUint16(header + 24, true);
      const nextBag = view.getUint16(header + 38 + 24, true);
      if (firstBag >= nextBag || nextBag >= pBags.length) continue;
      const presetZones = zoneGenerators(pBags, pGens, firstBag, nextBag);
      let presetGlobal: Generator[] = [];
      const presetLocal: { instrument: number; gens: Generator[] }[] = [];
      for (let z = 0; z < presetZones.length; z++) {
        const gens = presetZones[z];
        const instrument = gens.find((g) => g.op === 41);
        if (!instrument && z === 0) presetGlobal = gens;
        else if (instrument && gens[gens.length - 1]?.op === 41) presetLocal.push({ instrument: instrument.raw, gens });
      }
      const zones: Sf2Zone[] = [];
      for (const pz of presetLocal) {
        if (pz.instrument >= instruments.length) continue;
        const pRange = intersect(generatorRange(presetGlobal, 43), generatorRange(pz.gens, 43));
        const pVel = intersect(generatorRange(presetGlobal, 44), generatorRange(pz.gens, 44));
        const instrument = instruments[pz.instrument];
        const instrumentZones = zoneGenerators(iBags, iGens, instrument.firstBag, instrument.nextBag);
        let instrumentGlobal: Generator[] = [];
        const instrumentLocal: Generator[][] = [];
        for (let z = 0; z < instrumentZones.length; z++) {
          const gens = instrumentZones[z];
          const sample = gens.find((g) => g.op === 53);
          if (!sample && z === 0) instrumentGlobal = gens;
          else if (sample && gens[gens.length - 1]?.op === 53) instrumentLocal.push(gens);
        }
        for (const iz of instrumentLocal) {
          const sampleGen = iz[iz.length - 1];
          const sample = samples[sampleGen.raw];
          if (!sample || (sample.sampleType & 0x8000) !== 0) continue;
          const keyRange = intersect(intersect(pRange, generatorRange(instrumentGlobal, 43)), generatorRange(iz, 43));
          const velRange = intersect(intersect(pVel, generatorRange(instrumentGlobal, 44)), generatorRange(iz, 44));
          if (keyRange.low > keyRange.high || velRange.low > velRange.high) continue;

          const pValues = combineGlobals(presetGlobal, pz.gens);
          const iValues = combineGlobals(instrumentGlobal, iz);
          const hasValue = (op: number): boolean => iValues.has(op) || pValues.has(op);
          const total = (op: number): number => (iValues.get(op) ?? 0) + (pValues.get(op) ?? 0);
          const startOffset = (iValues.get(0) ?? 0) + 32768 * (iValues.get(4) ?? 0);
          const endOffset = (iValues.get(1) ?? 0) + 32768 * (iValues.get(12) ?? 0);
          const loopStartOffset = (iValues.get(2) ?? 0) + 32768 * (iValues.get(45) ?? 0);
          const loopEndOffset = (iValues.get(3) ?? 0) + 32768 * (iValues.get(50) ?? 0);
          const start = Math.max(sample.start, sample.start + startOffset);
          const end = Math.min(sample.end, sample.end + endOffset);
          if (end - start < 64) continue;
          const loopStart = Math.max(start, sample.loopStart + loopStartOffset);
          const loopEnd = Math.min(end, sample.loopEnd + loopEndOffset);
          const sampleMode = iValues.get(54) ?? 0;
          const loopType = sampleMode & 3;
          const loop = (loopType === 1 || loopType === 3) && loopEnd - loopStart >= 32;
          const scaleTuning = Math.max(0, Math.min(1200, iValues.get(56) ?? 100));
          const filterCutoffCents = Math.max(1500, Math.min(13500, (iValues.get(8) ?? 13500) + (pValues.get(8) ?? 0)));
          const exclusiveClass = Math.max(0, Math.min(127, iValues.get(57) ?? 0));
          const overrideRoot = iValues.get(58);
          const rootMidi = overrideRoot !== undefined && overrideRoot >= 0 && overrideRoot <= 127
            ? overrideRoot
            : sample.originalPitch;
          const attenuation = total(48);
          zones.push({
            sampleIndex: sampleGen.raw,
            keyLow: keyRange.low, keyHigh: keyRange.high,
            velLow: velRange.low, velHigh: velRange.high,
            rootMidi,
            tuneCents: sample.pitchCorrection + total(51) * 100 + total(52),
            level: Math.max(0, Math.min(4, 10 ** (-attenuation / 200))),
            delay: timecentsSeconds(hasValue(33) ? total(33) : -12000, 0.001),
            attack: timecentsSeconds(hasValue(34) ? total(34) : undefined, 0.001),
            hold: timecentsSeconds(hasValue(35) ? total(35) : -12000, 0.001),
            decay: timecentsSeconds(hasValue(36) ? total(36) : -12000, 0.001),
            sustain: 10 ** (-Math.max(0, Math.min(1440, total(37))) / 200),
            release: timecentsSeconds(hasValue(38) ? total(38) : undefined, 0.001),
            keyToHold: Math.max(-1200, Math.min(1200, total(39))),
            keyToDecay: Math.max(-1200, Math.min(1200, total(40))),
            ...(scaleTuning !== 100 ? { scaleTuning } : {}),
            filterCutoffCents,
            ...(exclusiveClass > 0 ? { exclusiveClass } : {}),
            loop,
            loopUntilRelease: loop && loopType === 3,
            start, end,
            loopStart, loopEnd,
          });
        }
      }
      if (zones.length === 0) continue;
      presets.push({
        name: readName(view, header, 20) || `Preset ${presetIndex + 1}`,
        program: view.getUint16(header + 20, true),
        bank: view.getUint16(header + 22, true),
        zones,
      });
    }
    if (!presets.length) return null;
    return { samples, pcm, presets };
  } catch {
    return null;
  }
}

function fourCC(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function readName(view: DataView, offset: number, length: number): string {
  let value = '';
  for (let i = 0; i < length; i++) {
    const byte = view.getUint8(offset + i);
    if (byte === 0) break;
    value += String.fromCharCode(byte);
  }
  return value.trim();
}

function readBags(view: DataView, chunk: Chunk, size: number): Bag[] {
  const out: Bag[] = [];
  for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += size) {
    out.push({ gen: view.getUint16(offset, true), mod: view.getUint16(offset + 2, true) });
  }
  return out;
}

function readGenerators(view: DataView, chunk: Chunk): Generator[] {
  const out: Generator[] = [];
  for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += 4) {
    const raw = view.getUint16(offset + 2, true);
    out.push({ op: view.getUint16(offset, true), raw, signed: view.getInt16(offset + 2, true), low: raw & 0xff, high: raw >>> 8 });
  }
  return out;
}

function readSamples(view: DataView, chunk: Chunk, count: number, pcmLength: number): Sf2Sample[] {
  const samples: Sf2Sample[] = [];
  for (let i = 0; i < count; i++) {
    const offset = chunk.offset + i * 46;
    const start = view.getUint32(offset + 20, true);
    const end = view.getUint32(offset + 24, true);
    const loopStart = view.getUint32(offset + 28, true);
    const loopEnd = view.getUint32(offset + 32, true);
    const sampleRate = view.getUint32(offset + 36, true);
    const original = view.getUint8(offset + 40);
    const sampleType = view.getUint16(offset + 44, true);
    const supportedType = [1, 2, 4, 8, 0x8001, 0x8002, 0x8004, 0x8008].includes(sampleType);
    if (start >= end || end > pcmLength || sampleRate < 3000 || sampleRate > 192000 || !supportedType) {
      samples.push({ name: readName(view, offset, 20), start: 0, end: 0, loopStart: 0, loopEnd: 0, sampleRate: 44100, originalPitch: 60, pitchCorrection: 0, sampleLink: 0, sampleType: 0x8000 });
      continue;
    }
    samples.push({
      name: readName(view, offset, 20), start, end, loopStart, loopEnd, sampleRate,
      originalPitch: original <= 127 ? original : 60,
      pitchCorrection: view.getInt8(offset + 41),
      sampleLink: view.getUint16(offset + 42, true),
      sampleType,
    });
  }
  return samples;
}

function readInstruments(view: DataView, chunk: Chunk, count: number): { name: string; firstBag: number; nextBag: number }[] {
  const result = [];
  for (let i = 0; i < count; i++) {
    const offset = chunk.offset + i * 22;
    const firstBag = view.getUint16(offset + 20, true);
    const nextBag = view.getUint16(offset + 22 + 20, true);
    result.push({ name: readName(view, offset, 20), firstBag, nextBag });
  }
  return result;
}

function zoneGenerators(bags: Bag[], generators: Generator[], firstBag: number, nextBag: number): Generator[][] {
  if (firstBag < 0 || nextBag <= firstBag || nextBag >= bags.length) return [];
  const zones: Generator[][] = [];
  for (let i = firstBag; i < nextBag; i++) {
    const start = bags[i].gen;
    const end = bags[i + 1].gen;
    if (start > end || end >= generators.length) return [];
    zones.push(generators.slice(start, end));
  }
  return zones;
}

function generatorRange(generators: Generator[], op: number): Range {
  const generator = generators.find((g) => g.op === op);
  return generator ? { low: generator.low, high: generator.high } : FULL_RANGE;
}

function combineGlobals(global: Generator[], local: Generator[]): Map<number, number> {
  const result = new Map<number, number>();
  for (const generator of global) {
    if (generator.op !== 43 && generator.op !== 44 && generator.op !== 41 && generator.op !== 53) result.set(generator.op, generator.signed);
  }
  for (const generator of local) {
    if (generator.op !== 43 && generator.op !== 44 && generator.op !== 41 && generator.op !== 53) result.set(generator.op, generator.signed);
  }
  return result;
}
