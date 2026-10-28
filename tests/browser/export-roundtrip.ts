import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { supportedBitrates } from '../../src/audio/export/compressed.ts';
import { DEFAULT_EXPORT, runExport, type ExportFormat } from '../../src/audio/export/exporter.ts';
import { readZip } from '../../src/project/zip.ts';
import type { SequencerTrack } from '../../src/audio/types.ts';

const resultNode = (() => {
  const element = document.querySelector<HTMLPreElement>('#result');
  if (!element) throw new Error('Missing result node');
  return element;
})();

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function inspectPcmWav(bytes: Uint8Array, bitDepth: 16 | 24 | 32 = 24): { frames: number; channels: number; sampleRate: number; dataBytes: number } {
  assert(bytes.byteLength >= 44, 'WAV is shorter than its PCM header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert(readFourCC(view, 0) === 'RIFF' && readFourCC(view, 8) === 'WAVE', 'Export is not a RIFF/WAVE file');
  assert(view.getUint32(4, true) === bytes.byteLength - 8, 'RIFF size does not match the file length');
  assert(readFourCC(view, 12) === 'fmt ' && view.getUint32(16, true) === 16, 'Unexpected WAV format chunk');
  assert(view.getUint16(20, true) === (bitDepth === 32 ? 3 : 1), 'WAV encoding does not match the selected bit depth');
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bytesPerSample = bitDepth / 8;
  assert(view.getUint32(28, true) === sampleRate * channels * bytesPerSample, 'WAV byte rate is incorrect');
  assert(view.getUint16(32, true) === channels * bytesPerSample, 'WAV block alignment is incorrect');
  assert(view.getUint16(34, true) === bitDepth, `WAV bit depth is not ${bitDepth}-bit`);
  assert(readFourCC(view, 36) === 'data', 'WAV data chunk is missing');
  const dataBytes = view.getUint32(40, true);
  assert(dataBytes > 0 && dataBytes % (channels * bytesPerSample) === 0, 'WAV data size is invalid');
  const infoOffset = 44 + dataBytes;
  assert(infoOffset + 12 <= bytes.byteLength, 'WAV metadata chunk is missing');
  assert(readFourCC(view, infoOffset) === 'LIST' && readFourCC(view, infoOffset + 8) === 'INFO', 'WAV INFO metadata is missing');
  const infoEnd = infoOffset + 8 + view.getUint32(infoOffset + 4, true);
  const tags = new Map<string, string>();
  const decoder = new TextDecoder();
  for (let offset = infoOffset + 12; offset + 8 <= infoEnd;) {
    const tag = readFourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    assert(offset + 8 + size <= infoEnd, `WAV INFO tag ${tag} exceeds its LIST chunk`);
    tags.set(tag, decoder.decode(bytes.subarray(offset + 8, offset + 8 + size)).replace(/\0+$/, ''));
    offset += 8 + size + (size % 2);
  }
  assert(tags.get('INAM') === 'Recorded organ mix' && tags.get('IART') === 'Unbox export check', 'WAV INFO title or artist metadata is incorrect');
  return { frames: dataBytes / (channels * bytesPerSample), channels, sampleRate, dataBytes };
}

function verifyContainer(format: ExportFormat, bytes: Uint8Array, bitDepth: 16 | 24 | 32): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === 'wav') {
    inspectPcmWav(bytes, bitDepth);
    return;
  }
  if (format === 'aiff') {
    assert(readFourCC(view, 0) === 'FORM' && readFourCC(view, 8) === 'AIFF', 'Export is not an AIFF file');
    assert(view.getUint32(4, false) === bytes.byteLength - 8, 'AIFF FORM size does not match the file length');
    assert(readFourCC(view, 12) === 'COMM' && view.getUint32(16, false) === 18, 'AIFF COMM chunk is malformed');
    assert(view.getUint16(20, false) === 2 && view.getUint16(26, false) === bitDepth, 'AIFF channel count or bit depth is incorrect');
    const frames = view.getUint32(22, false);
    const expectedSoundBytes = 8 + frames * 2 * (bitDepth / 8);
    assert(readFourCC(view, 38) === 'SSND' && view.getUint32(42, false) === expectedSoundBytes, 'AIFF sound-data chunk is malformed');
    return;
  }
  if (format === 'flac') assert(readFourCC(view, 0) === 'fLaC', 'Export is not a FLAC stream');
  else if (format === 'mp3') assert(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2)) === 'ID3', 'MP3 metadata header is missing');
  else if (format === 'ogg') assert(readFourCC(view, 0) === 'OggS', 'Export is not an Ogg stream');
  else assert(view.getUint8(0) === 0xff && (view.getUint8(1) & 0xf6) === 0xf0, 'Export is not an AAC ADTS stream');
}

async function assertDecodable(blob: Blob, label: string, expectedDuration: number, tolerance: number): Promise<number> {
  let decoded: AudioBuffer;
  try {
    decoded = await audioEngine.ctx.decodeAudioData(toArrayBuffer(new Uint8Array(await blob.arrayBuffer())));
  } catch (error) {
    throw new Error(`${label} failed browser decoding: ${error instanceof Error ? error.message : String(error)}`);
  }
  let peak = 0;
  let squareSum = 0;
  let count = 0;
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    for (const sample of decoded.getChannelData(channel)) {
      peak = Math.max(peak, Math.abs(sample));
      squareSum += sample * sample;
      count++;
    }
  }
  const rms = Math.sqrt(squareSum / Math.max(1, count));
  assert(Math.abs(decoded.duration - expectedDuration) <= tolerance, `${label} decoded duration ${decoded.duration.toFixed(3)} s differs from ${expectedDuration.toFixed(3)} s`);
  assert(peak > 1e-4 && rms > 1e-5, `${label} decoded as silent (peak ${peak.toExponential(2)}, RMS ${rms.toExponential(2)})`);
  return peak;
}

async function submitForFfmpeg(name: string, blob: Blob): Promise<void> {
  const response = await fetch(`/__probe-artifacts/${name}`, { method: 'POST', body: blob });
  assert(response.ok, `Could not submit ${name} to the independent media validator (HTTP ${response.status})`);
}

async function run(): Promise<void> {
  const engine = audioEngine;
  engine.stopTransport();
  engine.newProject(true);
  const organ = engine.createDevice('rec_vcsl_pipe_organ', 'Export Test Organ');
  const cleanupDeviceIds = [organ.id];
  try {
    await organ.ready?.();
    organ.setParam('vary', 0);
    organ.setParam('punch', 0);
    organ.setParam('drive', 0);
    organ.setParam('tone', 20_000);
    const track = engine.tracks.find((candidate) => candidate.deviceId === organ.id) as SequencerTrack | undefined;
    assert(!!track, 'Recorded organ did not create an instrument track');
    track.arrangementClips = [{
      id: 'export_roundtrip_note',
      kind: 'notes',
      startBar: 0,
      lengthBars: 1,
      name: 'Recorded organ export check',
      notes: [{ step: 0, note: 60, velocity: 0.82, length: 8 }],
    }];
    engine.setBpm(120);
    engine.setPlaybackMode('song_arrangement');

    const settings = {
      ...DEFAULT_EXPORT,
      format: 'wav' as const,
      what: 'mix' as const,
      sampleRate: 44_100,
      bitDepth: 24 as const,
      dither: false,
      normalize: 'off' as const,
      range: 'custom' as const,
      startBar: 1,
      endBar: 2,
      tailSec: 0.25,
      masterProcessing: false,
      fileName: 'Phase 0 recorded organ mix',
      meta: { title: 'Recorded organ mix', artist: 'Unbox export check' },
    };
    const mix = await runExport(engine, settings, () => undefined);
    assert(mix.files.length === 1 && mix.files[0]?.name === 'Phase 0 recorded organ mix.wav', 'Mix export returned the wrong file');
    const wavBlob = mix.files[0]!.blob;
    const wavBytes = new Uint8Array(await wavBlob.arrayBuffer());
    await submitForFfmpeg('mix-wav-24-44100', wavBlob);
    const wav = inspectPcmWav(wavBytes);
    assert(wav.channels === 2 && wav.sampleRate === 44_100, `WAV format is ${wav.channels}ch at ${wav.sampleRate} Hz`);
    assert(Math.abs(wav.frames - 99_225) <= 1, `WAV duration is ${wav.frames} frames; expected one bar plus 250 ms tail`);
    const decoded = await engine.ctx.decodeAudioData(toArrayBuffer(wavBytes));
    let peak = 0;
    let squareSum = 0;
    let sampleCount = 0;
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      for (const sample of decoded.getChannelData(channel)) {
        peak = Math.max(peak, Math.abs(sample));
        squareSum += sample * sample;
        sampleCount++;
      }
    }
    const rms = Math.sqrt(squareSum / Math.max(1, sampleCount));
    assert(Math.abs(decoded.duration - wav.frames / wav.sampleRate) < 1 / wav.sampleRate, 'Browser decode changed the WAV duration');
    assert(peak > 1e-4 && rms > 1e-5, `Decoded WAV is silent (peak ${peak.toExponential(2)}, RMS ${rms.toExponential(2)})`);

    const peakNormalized = await runExport(engine, {
      ...settings,
      normalize: 'peak',
      peakDb: -6,
      ceilingDb: -1,
      fileName: 'Peak normalized recorded organ',
    }, () => undefined);
    const peakLoudness = peakNormalized.loudness;
    assert(!!peakLoudness && Math.abs(peakLoudness.truePeakDb + 6) <= 0.15, `Peak normalization landed at ${peakLoudness?.truePeakDb.toFixed(2) ?? 'no measurement'} dBTP instead of -6 dBTP`);
    const peakWav = peakNormalized.files[0]?.blob;
    assert(!!peakWav, 'Peak-normalized mix export returned no WAV');
    const peakWavBytes = new Uint8Array(await peakWav.arrayBuffer());
    const peakWavInfo = inspectPcmWav(peakWavBytes);
    assert(peakWavInfo.frames === wav.frames && peakWavInfo.sampleRate === wav.sampleRate, 'Peak-normalized WAV changed its duration or sample rate');
    await submitForFfmpeg('peak-wav-24-44100', peakWav);
    await assertDecodable(peakWav, 'Peak-normalized WAV', 2.25, 1 / 44_100);

    const lufsNormalized = await runExport(engine, {
      ...settings,
      normalize: 'lufs',
      lufs: -14,
      ceilingDb: -1,
      fileName: 'LUFS normalized recorded organ',
    }, () => undefined);
    const lufs = lufsNormalized.loudness;
    assert(!!lufs && Number.isFinite(lufs.integrated) && lufs.truePeakDb <= -0.95, `LUFS normalization exceeded its -1 dBTP ceiling (${lufs?.truePeakDb.toFixed(2) ?? 'no measurement'} dBTP)`);
    const lufsWav = lufsNormalized.files[0]?.blob;
    assert(!!lufsWav, 'LUFS-normalized mix export returned no WAV');
    await submitForFfmpeg('lufs-wav-24-44100', lufsWav);
    await assertDecodable(lufsWav, 'LUFS-normalized WAV', 2.25, 1 / 44_100);

    const formatCases: { format: ExportFormat; bitDepth: 16 | 24 | 32; sampleRate: number; kbps: number }[] = [
      { format: 'wav', bitDepth: 16, sampleRate: 44_100, kbps: 320 },
      { format: 'wav', bitDepth: 32, sampleRate: 44_100, kbps: 320 },
      { format: 'aiff', bitDepth: 16, sampleRate: 44_100, kbps: 320 },
      { format: 'aiff', bitDepth: 24, sampleRate: 44_100, kbps: 320 },
      { format: 'flac', bitDepth: 16, sampleRate: 44_100, kbps: 320 },
      { format: 'flac', bitDepth: 24, sampleRate: 44_100, kbps: 320 },
      { format: 'mp3', bitDepth: 24, sampleRate: 44_100, kbps: 320 },
    ];
    const codecSkips: string[] = [];
    const opusBitrates = await supportedBitrates('opus');
    if (opusBitrates.length) formatCases.push({ format: 'ogg', bitDepth: 24, sampleRate: 48_000, kbps: opusBitrates[opusBitrates.length - 1]! });
    else codecSkips.push('Ogg Opus (WebCodecs encoder unsupported)');
    let hasAacEncoder = false;
    for (const sampleRate of [44_100, 48_000]) {
      const aacBitrates = await supportedBitrates('aac', sampleRate);
      if (aacBitrates.length) {
        formatCases.push({ format: 'aac', bitDepth: 24, sampleRate, kbps: aacBitrates[aacBitrates.length - 1]! });
        hasAacEncoder = true;
      }
    }
    if (!hasAacEncoder) codecSkips.push('AAC (WebCodecs encoder unsupported at 44.1 or 48 kHz)');

    const formatResults: string[] = [];
    const browserDecodeSkips: string[] = [];
    for (const formatCase of formatCases) {
      const encoded = await runExport(engine, {
        ...settings,
        format: formatCase.format,
        bitDepth: formatCase.bitDepth,
        sampleRate: formatCase.sampleRate,
        kbps: formatCase.kbps,
        fileName: `Format check ${formatCase.format} ${formatCase.bitDepth}`,
      }, () => undefined);
      const file = encoded.files[0];
      assert(!!file, `${formatCase.format} export returned no file`);
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      verifyContainer(formatCase.format, bytes, formatCase.bitDepth);
      await submitForFfmpeg(`${formatCase.format}-${formatCase.bitDepth}-${formatCase.sampleRate}`, file.blob);
      const isLossy = formatCase.format === 'mp3' || formatCase.format === 'ogg' || formatCase.format === 'aac';
      try {
        await assertDecodable(file.blob, file.name, 2.25, isLossy ? 0.15 : 1 / formatCase.sampleRate);
      } catch (error) {
        if (formatCase.format !== 'aiff' || !(error instanceof Error) || !error.message.includes('failed browser decoding')) throw error;
        if (!browserDecodeSkips.includes(formatCase.format)) browserDecodeSkips.push(formatCase.format);
      }
      if (formatCase.format === 'wav') {
        const header = inspectPcmWav(bytes, formatCase.bitDepth);
        assert(header.sampleRate === formatCase.sampleRate && header.frames === 99_225, `WAV ${formatCase.bitDepth}-bit rate or duration is incorrect`);
      }
      if (formatCase.format === 'aiff') {
        const frames = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(22, false);
        assert(frames === 99_225, `AIFF ${formatCase.bitDepth}-bit render has ${frames} frames`);
      }
      formatResults.push(`${formatCase.format}/${formatCase.bitDepth}-bit${isLossy ? `@${formatCase.kbps}kbps` : ''}`);
    }

    const stems = await runExport(engine, {
      ...settings,
      what: 'stems',
      stems: [organ.id],
      stemMode: 'dry',
      stemMaster: false,
      fileName: 'Phase 0 recorded organ stems',
    }, () => undefined);
    assert(stems.files.length === 1 && stems.files[0]?.name === 'Phase 0 recorded organ stems - stems.zip', 'Stem export returned the wrong archive');
    const entries = await readZip(stems.files[0]!.blob);
    assert(entries.size === 1, `Stem archive contains ${entries.size} entries; expected one channel`);
    const [stemName, stemBytes] = [...entries.entries()][0]!;
    assert(stemName === 'Phase 0 recorded organ stems - 01 Export Test Organ.wav', `Unexpected stem name: ${stemName}`);
    await submitForFfmpeg('stem-wav-24-44100', new Blob([toArrayBuffer(stemBytes)], { type: 'audio/wav' }));
    const stem = inspectPcmWav(stemBytes);
    assert(stem.channels === 2 && stem.sampleRate === 44_100 && stem.frames === wav.frames, 'Stem WAV format or duration differs from the mix export');
    const stemAudio = await engine.ctx.decodeAudioData(toArrayBuffer(stemBytes));
    let stemPeak = 0;
    let deltaEnergy = 0;
    let mixEnergy = 0;
    for (let channel = 0; channel < stemAudio.numberOfChannels; channel++) {
      const mixSamples = decoded.getChannelData(channel);
      const stemSamples = stemAudio.getChannelData(channel);
      assert(mixSamples.length === stemSamples.length, 'Mix and stem decode to different durations');
      for (let frame = 0; frame < stemSamples.length; frame++) {
        const sample = stemSamples[frame]!;
        stemPeak = Math.max(stemPeak, Math.abs(sample));
        deltaEnergy += (mixSamples[frame]! - sample) ** 2;
        mixEnergy += mixSamples[frame]! ** 2;
      }
    }
    assert(stemPeak > 1e-4, `Decoded stem is silent (peak ${stemPeak.toExponential(2)})`);
    const stemDelta = Math.sqrt(deltaEnergy / Math.max(mixEnergy, 1e-20));
    assert(stemDelta < 0.01, `Single-channel dry stem differs from the solo mix by ${(stemDelta * 100).toFixed(2)}% RMS`);

    const cp80 = engine.createDevice('rec_cp80_electric_grand', 'Export Test CP80');
    cleanupDeviceIds.push(cp80.id);
    await cp80.ready?.();
    cp80.setParam('vary', 0);
    cp80.setParam('punch', 0);
    cp80.setParam('drive', 0);
    cp80.setParam('tone', 20_000);
    cp80.setParam('vary', 0.65);
    organ.setParam('vary', 0.7);
    const pianoTrack = engine.tracks.find((candidate) => candidate.deviceId === cp80.id) as SequencerTrack | undefined;
    assert(!!pianoTrack, 'Recorded CP80 did not create an instrument track');
    pianoTrack.arrangementClips = [{
      id: 'export_roundtrip_piano_note',
      kind: 'notes',
      startBar: 0,
      lengthBars: 1,
      name: 'Recorded CP80 export check',
      notes: [{ step: 8, note: 64, velocity: 0.78, length: 8 }],
    }];

    const reverb = engine.createDevice('rv7000', 'Export Test Reverb');
    cleanupDeviceIds.push(reverb.id);
    reverb.setParam('decay', 1.5);
    const returnBus = engine.mixer.createReturn('Export Test Return', reverb);
    cleanupDeviceIds.push(returnBus.id);
    assert(engine.mixer.setSend(organ.id, returnBus.id, 0.55), 'Could not route organ send to the test return');
    assert(engine.mixer.setSend(cp80.id, returnBus.id, 0.4), 'Could not route CP80 send to the test return');

    const multiSettings = { ...settings, tailSec: 2, masterProcessing: false, fileName: 'Phase 0 multi-track export' };
    const multiMix = await runExport(engine, multiSettings, () => undefined);
    const multiMixFile = multiMix.files[0];
    assert(!!multiMixFile, 'Multi-track mix export returned no file');
    const multiMixAudio = await engine.ctx.decodeAudioData(toArrayBuffer(new Uint8Array(await multiMixFile.blob.arrayBuffer())));
    const repeatedMix = await runExport(engine, multiSettings, () => undefined);
    const repeatedAudio = await engine.ctx.decodeAudioData(toArrayBuffer(new Uint8Array(await repeatedMix.files[0]!.blob.arrayBuffer())));
    let repeatedDeltaEnergy = 0;
    let repeatedReferenceEnergy = 0;
    for (let channel = 0; channel < multiMixAudio.numberOfChannels; channel++) {
      const original = multiMixAudio.getChannelData(channel);
      const repeated = repeatedAudio.getChannelData(channel);
      for (let frame = 0; frame < original.length; frame++) {
        repeatedDeltaEnergy += (original[frame]! - repeated[frame]!) ** 2;
        repeatedReferenceEnergy += original[frame]! ** 2;
      }
    }
    const repeatedMixDelta = Math.sqrt(repeatedDeltaEnergy / Math.max(repeatedReferenceEnergy, 1e-20));
    assert(repeatedMixDelta < 0.01, `Repeated mix export changed with recorded-instrument variation enabled by ${(repeatedMixDelta * 100).toFixed(2)}% RMS`);
    const wetStems = await runExport(engine, {
      ...multiSettings,
      what: 'stems',
      stems: [organ.id, cp80.id],
      stemMode: 'wet',
      stemMaster: false,
    }, () => undefined);
    const wetEntries = await readZip(wetStems.files[0]!.blob);
    assert(wetEntries.size === 2, `Wet stem archive contains ${wetEntries.size} entries; expected two instrument stems`);
    const wetBuffers: AudioBuffer[] = [];
    for (const [name, bytes] of wetEntries) {
      assert(name.endsWith('.wav'), `Wet stem is not a WAV: ${name}`);
      wetBuffers.push(await engine.ctx.decodeAudioData(toArrayBuffer(bytes)));
    }
    assert(wetBuffers.every((buffer) => buffer.length === multiMixAudio.length), 'Wet stems and mix have different durations');
    let wetDeltaEnergy = 0;
    let wetMixEnergy = 0;
    let wetStemEnergy = 0;
    for (let channel = 0; channel < multiMixAudio.numberOfChannels; channel++) {
      const mixSamples = multiMixAudio.getChannelData(channel);
      for (let frame = 0; frame < multiMixAudio.length; frame++) {
        const stemSum = wetBuffers.reduce((sum, buffer) => sum + buffer.getChannelData(channel)[frame]!, 0);
        wetDeltaEnergy += (mixSamples[frame]! - stemSum) ** 2;
        wetMixEnergy += mixSamples[frame]! ** 2;
        wetStemEnergy += stemSum ** 2;
      }
    }
    const wetStemDelta = Math.sqrt(wetDeltaEnergy / Math.max(wetMixEnergy, 1e-20));
    const wetMixRms = Math.sqrt(wetMixEnergy / (multiMixAudio.length * multiMixAudio.numberOfChannels));
    const wetStemRms = Math.sqrt(wetStemEnergy / (multiMixAudio.length * multiMixAudio.numberOfChannels));
    assert(wetStemDelta < 0.01, `Wet stems with recorded-instrument variation differ from their unmastered mix by ${(wetStemDelta * 100).toFixed(2)}% RMS (repeat mix ${(repeatedMixDelta * 100).toFixed(2)}%, mix RMS ${wetMixRms.toFixed(5)}, summed stem RMS ${wetStemRms.toFixed(5)})`);

    engine.setMasterSpectrumParam('low', 1);
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    const masteredMix = await runExport(engine, { ...multiSettings, masterProcessing: true }, () => undefined);
    const masteredAudio = await engine.ctx.decodeAudioData(toArrayBuffer(new Uint8Array(await masteredMix.files[0]!.blob.arrayBuffer())));
    let masterDeltaEnergy = 0;
    let masterReferenceEnergy = 0;
    for (let channel = 0; channel < multiMixAudio.numberOfChannels; channel++) {
      const raw = multiMixAudio.getChannelData(channel);
      const processed = masteredAudio.getChannelData(channel);
      assert(raw.length === processed.length, 'Master processing changed the export duration');
      for (let frame = 0; frame < raw.length; frame++) {
        masterDeltaEnergy += (raw[frame]! - processed[frame]!) ** 2;
        masterReferenceEnergy += raw[frame]! ** 2;
      }
    }
    const masterDelta = Math.sqrt(masterDeltaEnergy / Math.max(masterReferenceEnergy, 1e-20));
    assert(masterDelta > 0.01, `Master processing did not change the mix enough to verify (relative RMS ${(masterDelta * 100).toFixed(2)}%)`);
    const masteredStems = await runExport(engine, {
      ...multiSettings,
      what: 'stems',
      stems: [organ.id, cp80.id],
      stemMode: 'wet',
      stemMaster: true,
    }, () => undefined);
    assert((await readZip(masteredStems.files[0]!.blob)).size === 2, 'Master-processed stem export did not render both instruments');
    engine.setMasterSpectrumParam('low', 0.5);

    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · recorded organ mix and dry stem matched at ${(stemDelta * 100).toFixed(3)}% RMS; repeated varied-instrument mix renders matched at ${(repeatedMixDelta * 100).toFixed(3)}% RMS; two recorded instruments with a shared reverb return produced wet stems within ${(wetStemDelta * 100).toFixed(3)}% RMS of their unmastered mix; master EQ export changed relative RMS by ${(masterDelta * 100).toFixed(2)}%; peak normalization ${peakLoudness.truePeakDb.toFixed(2)} dBTP, LUFS ceiling ${lufs.truePeakDb.toFixed(2)} dBTP; encoded ${formatResults.join(', ')}${browserDecodeSkips.length ? ` (browser decode unavailable for ${browserDecodeSkips.join(', ')})` : ''}${codecSkips.length ? `; skipped ${codecSkips.join(', ')}` : ''}.`;
  } finally {
    engine.stopTransport();
    engine.setMasterSpectrumParam('low', 0.5);
    for (const id of cleanupDeviceIds.reverse()) engine.removeDevice(id, true);
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
