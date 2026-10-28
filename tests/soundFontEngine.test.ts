import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundFontEngine } from '../src/audio/SoundFontEngine.ts';
import { parseSf2, sf2DefaultVelocityAmplitude } from '../src/audio/soundfont/sf2.ts';
import { deviceSample, deviceSampleAudioIds, deviceSamplesSection, setMultiSample } from '../src/audio/deviceSamples.ts';
import { projectAudioIds } from '../shared/project/audioAssets.ts';

test('built-in physical models are not reported as loaded SoundFont banks', () => {
  const engine = new SoundFontEngine();

  assert.deepEqual(engine.loadedSf2Banks, []);
});

test('SF2 default velocity attenuation follows its concave 960 centibel response', () => {
  assert.equal(sf2DefaultVelocityAmplitude(1 / 127), (1 / 127) ** 2);
  assert.equal(sf2DefaultVelocityAmplitude(64 / 127), (64 / 127) ** 2);
  assert.equal(sf2DefaultVelocityAmplitude(1), 1);
  assert.equal(sf2DefaultVelocityAmplitude(0), (1 / 127) ** 2);
  assert.equal(sf2DefaultVelocityAmplitude(Number.NaN), (1 / 127) ** 2);
});

test('SoundFont importer rejects data without an SF2 RIFF header', () => {
  const engine = new SoundFontEngine();

  assert.equal(engine.parseSF2Binary({} as BaseAudioContext, new ArrayBuffer(12)), null);
});

test('SF2 hydra import keeps preset identity and resolves instrument key/velocity zones', () => {
  const parsed = parseSf2(makeSf2Fixture());

  assert.ok(parsed);
  assert.equal(parsed.presets.length, 1);
  assert.equal(parsed.presets[0].name, 'Test Piano');
  assert.equal(parsed.presets[0].bank, 2);
  assert.equal(parsed.presets[0].program, 7);
  assert.equal(parsed.presets[0].zones.length, 1);
  assert.deepEqual(parsed.presets[0].zones[0], {
    sampleIndex: 0,
    keyLow: 48,
    keyHigh: 72,
    velLow: 10,
    velHigh: 100,
    rootMidi: 62,
    tuneCents: 101,
    level: 10 ** (-60 / 200),
    delay: 0.001,
    attack: 0.001,
    hold: 0.001,
    decay: 1,
    sustain: 0.1,
    release: 0.25,
    keyToHold: 100,
    keyToDecay: -50,
    filterCutoffCents: 12000,
    loop: true,
    loopUntilRelease: false,
    start: 0,
    end: 128,
    loopStart: 16,
    loopEnd: 112,
  });
  assert.equal(parsed.samples[0].name, 'Piano C4 L');
  assert.equal(parsed.samples[0].sampleLink, 1);
  assert.equal(parsed.samples[0].sampleType, 4);
  assert.equal(parsed.samples[1].name, 'Piano C4 R');
  assert.equal(parsed.samples[1].sampleType, 2);
  assert.equal(parsed.pcm.length, 256);
});

test('SF2 sampleModes distinguishes continuous and loop-until-release zones', () => {
  for (const [sampleMode, loop, loopUntilRelease] of [
    [0, false, false],
    [1, true, false],
    [2, false, false],
    [3, true, true],
  ] as const) {
    const parsed = parseSf2(makeSf2Fixture({ sampleMode }));
    assert.ok(parsed);
    assert.equal(parsed.presets[0].zones[0].loop, loop, `sampleModes ${sampleMode} loop flag`);
    assert.equal(parsed.presets[0].zones[0].loopUntilRelease, loopUntilRelease, `sampleModes ${sampleMode} release behavior`);
  }
});

test('SF2 exclusiveClass zero is ignored and nonzero classes are preserved', () => {
  for (const [exclusiveClass, expected] of [[0, undefined], [1, 1], [127, 127]] as const) {
    const parsed = parseSf2(makeSf2Fixture({ exclusiveClass }));
    assert.ok(parsed);
    assert.equal(parsed.presets[0].zones[0].exclusiveClass, expected);
  }
});

test('SF2 scaleTuning defaults to equal temperament and clamps supported generator values', () => {
  for (const [scaleTuning, expected] of [[0, 0], [50, 50], [100, undefined], [200, 200], [1200, 1200], [1400, 1200]] as const) {
    const parsed = parseSf2(makeSf2Fixture({ scaleTuning }));
    assert.ok(parsed);
    assert.equal(parsed.presets[0].zones[0].scaleTuning, expected);
  }
});

test('SF2 initialFilterFc defaults to 13500 cents and clamps to its valid range', () => {
  for (const [filterCutoffCents, expected] of [[1500, 1500], [12000, 12000], [14000, 13500], [-10, 1500]] as const) {
    const parsed = parseSf2(makeSf2Fixture({ filterCutoffCents }));
    assert.ok(parsed);
    assert.equal(parsed.presets[0].zones[0].filterCutoffCents, expected);
  }
  const parsedDefault = parseSf2(makeSf2Fixture({ omitFilterCutoff: true }));
  assert.equal(parsedDefault?.presets[0].zones[0].filterCutoffCents, 13500);
});

test('SF2 hydra import rejects truncated and structurally incomplete banks', () => {
  const valid = makeSf2Fixture();
  assert.equal(parseSf2(valid.slice(0, valid.byteLength - 1)), null);
  assert.equal(parseSf2(makeSf2Fixture({ omitImod: true })), null);
});

test('legacy SF2 engine API now uses the preset key and velocity map', () => {
  const engine = new SoundFontEngine();
  const ctx = {
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { duration: length / sampleRate, getChannelData: (channel: number) => data[channel] } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;
  const bank = engine.parseSF2Binary(ctx, makeSf2Fixture());

  assert.ok(bank);
  assert.equal(bank.name, 'Test Piano');
  assert.equal(bank.zones.length, 1);
  assert.equal(bank.zones[0].keyLow, 48);
  assert.equal(bank.zones[0].keyHigh, 72);
  assert.equal(bank.zones[0].velLow, 10);
  assert.equal(bank.zones[0].velHigh, 100);
});

test('legacy SF2 zone metadata retains the instrument exclusive class', () => {
  const engine = new SoundFontEngine();
  const ctx = {
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { duration: length / sampleRate, getChannelData: (channel: number) => data[channel] } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;
  const bank = engine.parseSF2Binary(ctx, makeSf2Fixture({ exclusiveClass: 9, scaleTuning: 50 }));

  assert.equal(bank?.zones[0].exclusiveClass, 9);
  assert.equal(bank?.zones[0].scaleTuning, 50);
  assert.equal(bank?.zones[0].filterCutoffCents, 12000);
  assert.equal(bank?.zones[0].level, 10 ** (-60 / 200));
  assert.equal(bank?.zones[0].sf2DefaultVelocityAttenuation, true);
});

test('SF2 volume envelope generator defaults and centibel sustain are preserved', () => {
  const parsed = parseSf2(makeSf2Fixture());
  assert.ok(parsed);
  const zone = parsed.presets[0].zones[0];
  assert.equal(zone.delay, 0.001);
  assert.equal(zone.hold, 0.001);
  assert.equal(zone.decay, 1);
  assert.equal(zone.sustain, 0.1);
  assert.equal(zone.keyToHold, 100);
  assert.equal(zone.keyToDecay, -50);
});

test('imported multisample assignments expose all source assets to project persistence and export', () => {
  const deviceId = `sf2-test-${Date.now()}`;
  const zone = {
    audioId: 'sf2-test-audio', keyLow: 40, keyHigh: 80, velLow: 1, velHigh: 127,
    root: 60, tune: -3, level: 0.8, attack: 0.01, release: 0.2, loop: true,
    loopUntilRelease: true, exclusiveClass: 4, scaleTuning: 50, filterCutoffCents: 12000,
    sf2DefaultVelocityAttenuation: true, loopStart: 0.1, loopEnd: 0.8,
  };
  setMultiSample(deviceId, [zone]);

  assert.deepEqual(deviceSample(deviceId)?.multiSample, [zone]);
  assert.ok(deviceSampleAudioIds().includes(zone.audioId));
  const saved = deviceSamplesSection((id) => id === deviceId).save() as Record<string, { multiSample?: unknown[] }>;
  assert.deepEqual(saved[deviceId]?.multiSample, [zone]);
  const project = JSON.stringify({ sections: { deviceSamples: saved } });
  assert.deepEqual(projectAudioIds(project), [zone.audioId]);

  setMultiSample(deviceId, null);
});

test('project audio manifest includes every multisample zone and deduplicates repeated assets', () => {
  const ids = projectAudioIds(JSON.stringify({
    tracks: [{ arrangementClips: [{ audioId: 'clip-audio', takes: [{ audioId: 'take-audio' }] }] }],
    songBlocks: [{ audioClipsByTrack: { track: [{ audioId: 'clip-audio' }] } }],
    sections: { deviceSamples: {
      keys: { keys: { audioId: 'key-audio' } },
      kit: { pads: { '36': { audioId: 'pad-audio' } } },
      soundfont: { multiSample: [{ audioId: 'sf2-left' }, { audioId: 'sf2-right' }, { ignored: true }] },
    } },
  }));
  assert.deepEqual(ids, ['clip-audio', 'take-audio', 'key-audio', 'pad-audio', 'sf2-left', 'sf2-right']);
});

function makeSf2Fixture(options: { omitImod?: boolean; omitFilterCutoff?: boolean; sampleMode?: number; exclusiveClass?: number; scaleTuning?: number; filterCutoffCents?: number } = {}): ArrayBuffer {
  const sampleData = new Uint8Array(256 * 2);
  const sampleView = new DataView(sampleData.buffer);
  for (let i = 0; i < 128; i++) {
    sampleView.setInt16(i * 2, i * 120, true);
    sampleView.setInt16((i + 128) * 2, -i * 100, true);
  }

  const phdr = concat(
    presetHeader('Test Piano', 7, 2, 0),
    presetHeader('EOP', 0, 0, 1),
  );
  const pbag = concat(bag(0), bag(1));
  const pgen = concat(generator(41, 0), generator(60, 0));
  const pmod = new Uint8Array(10);
  const inst = concat(instrumentHeader('Piano Instrument', 0), instrumentHeader('EOI', 1));
  const ibag = concat(bag(0), bag(options.omitFilterCutoff ? 18 : 19));
  const igen = concat(
    rangeGenerator(43, 48, 72),
    rangeGenerator(44, 10, 100),
    ...(options.omitFilterCutoff ? [] : [generator(8, options.filterCutoffCents ?? 12000)]),
    generator(54, options.sampleMode ?? 1),
    generator(58, 62),
    generator(51, 1),
    generator(52, 5),
    generator(33, -12000),
    generator(34, -12000),
    generator(35, -12000),
    generator(36, 0),
    generator(37, 200),
    generator(38, -2400),
    generator(39, 100),
    generator(40, -50),
    generator(48, 60),
    generator(56, options.scaleTuning ?? 100),
    generator(57, options.exclusiveClass ?? 0),
    generator(53, 0),
    generator(60, 0),
  );
  const imod = new Uint8Array(10);
  const shdr = concat(
    sampleHeader('Piano C4 L', 0, 128, 16, 112, 44100, 60, -4, 1, 4),
    sampleHeader('Piano C4 R', 128, 256, 144, 240, 44100, 60, -4, 0, 2),
    sampleHeader('EOS', 256, 256, 256, 256, 0, 0, 0, 0, 0),
  );
  const pdtaChunks = [
    chunk('phdr', phdr), chunk('pbag', pbag), chunk('pmod', pmod), chunk('pgen', pgen),
    chunk('inst', inst), chunk('ibag', ibag), ...(options.omitImod ? [] : [chunk('imod', imod)]),
    chunk('igen', igen), chunk('shdr', shdr),
  ];
  const sdta = chunk('LIST', concat(ascii('sdta'), chunk('smpl', sampleData)));
  const pdta = chunk('LIST', concat(ascii('pdta'), ...pdtaChunks));
  const body = concat(ascii('sfbk'), sdta, pdta);
  const riff = chunk('RIFF', body);
  const output = new ArrayBuffer(riff.byteLength);
  new Uint8Array(output).set(riff);
  return output;
}

function presetHeader(name: string, program: number, bank: number, bagIndex: number): Uint8Array {
  const data = new Uint8Array(38);
  const view = new DataView(data.buffer);
  writeName(data, name, 20);
  view.setUint16(20, program, true);
  view.setUint16(22, bank, true);
  view.setUint16(24, bagIndex, true);
  return data;
}

function instrumentHeader(name: string, bagIndex: number): Uint8Array {
  const data = new Uint8Array(22);
  writeName(data, name, 20);
  new DataView(data.buffer).setUint16(20, bagIndex, true);
  return data;
}

function sampleHeader(name: string, start: number, end: number, loopStart: number, loopEnd: number, rate: number, root: number, correction: number, link: number, type: number): Uint8Array {
  const data = new Uint8Array(46);
  const view = new DataView(data.buffer);
  writeName(data, name, 20);
  [start, end, loopStart, loopEnd, rate].forEach((value, i) => view.setUint32(20 + i * 4, value, true));
  view.setUint8(40, root);
  view.setInt8(41, correction);
  view.setUint16(42, link, true);
  view.setUint16(44, type, true);
  return data;
}

function bag(genIndex: number): Uint8Array {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setUint16(0, genIndex, true);
  return data;
}

function generator(op: number, amount: number): Uint8Array {
  const data = new Uint8Array(4);
  const view = new DataView(data.buffer);
  view.setUint16(0, op, true);
  view.setInt16(2, amount, true);
  return data;
}

function rangeGenerator(op: number, low: number, high: number): Uint8Array {
  const data = new Uint8Array(4);
  const view = new DataView(data.buffer);
  view.setUint16(0, op, true);
  view.setUint16(2, low | (high << 8), true);
  return data;
}

function chunk(id: string, payload: Uint8Array): Uint8Array {
  const paddedLength = payload.length + (payload.length & 1);
  const data = new Uint8Array(8 + paddedLength);
  const view = new DataView(data.buffer);
  data.set(ascii(id), 0);
  view.setUint32(4, payload.length, true);
  data.set(payload, 8);
  return data;
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function writeName(out: Uint8Array, value: string, length: number): void {
  out.set(ascii(value.slice(0, length)), 0);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
