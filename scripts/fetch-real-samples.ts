/**
 * scripts/fetch-real-samples.ts
 *
 * Legacy-named synthetic test-sample generator and source-lead index.
 *
 * This script does not download or validate any of the source leads below. It
 * can generate synthesized harmonic WAVs for local DSP testing, or emit an
 * unaudited index. It must not be used to label samples as real recordings.
 * The listed projects are research leads only; licence and attribution must be
 * independently verified and imported through the recorded-pack pipeline.
 *  - GitHub: sgossner/VSCO-2-CE (Versilian Studios Chamber Orchestra Community Edition)
 *  - sfzinstruments: Salamander Grand Piano, Hohner Clavinet, Mellotron, Rhodes, Organs
 *  - freepats.zenvoid.org: Acoustic Pianos, Clavinets, Winds, Guitars, Percussion
 *  - Archive.org & Musical-Artifacts: University of Iowa MIS, Philharmonia Orchestra,
 *    vintage hardware ROMpler dumps, Theremin, Ondes Martenot, Stylophone (Stylus Pocket Synth),
 *    Otamatone (Note-Bender Synth), and Omnichord (Strum Chord Synth).
 *
 * Usage:
 *  npx tsx scripts/fetch-real-samples.ts [options]
 *
 * Options:
 *  --all                       Index all instrument templates
 *  --instrument <name>         Index a specific instrument template
 *  --device <id>               Index by device ID
 *  --out <directory>           Target folder (defaults to SAMPLE_LIBRARY_PATH or ./public/samples)
 *  --max-mb <number>           Maximum download size limit in MB
 *  --dry-run                   Report generated structure without writing audio
 *  --index-only                Re-index existing sample files into sample-manifest.json
 *  --generate-synthetic-test-samples  Generate synthesized harmonic WAVs for offline testing
 *  --generate-offline-samples  Deprecated alias for --generate-synthetic-test-samples
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DeviceSampleManifest,
  MultiSampleManifest,
  SamplePitchZone,
  SampleVelocityLayer,
  SubVoiceDefinition,
} from '../shared/instruments/sampleManifestTypes.ts';
import { INSTRUMENT_SUB_VOICES } from '../shared/instruments/subVoices.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Default target directory: checks process.env.SAMPLE_LIBRARY_PATH, else ./public/samples
const DEFAULT_SAMPLES_DIR = process.env.SAMPLE_LIBRARY_PATH
  ? path.resolve(process.env.SAMPLE_LIBRARY_PATH)
  : path.resolve(PROJECT_ROOT, 'public', 'samples');

interface RepositorySource {
  repo: string; // e.g. "github:sfzinstruments/SalamanderGrandPiano"
  license: string;
  sourceUrl: string;
  format: 'sfz' | 'wav' | 'flac';
  subVoiceMapping?: Record<string, string>; // subVoiceId -> folder or sfz file
}

/** Unverified research leads only; this script never fetches them. */
export const SAMPLE_SOURCE_LEADS: Record<string, RepositorySource> = {
  'Piano': {
    repo: 'github:sfzinstruments/SalamanderGrandPiano',
    license: 'CC-BY-3.0 / CC0',
    sourceUrl: 'https://github.com/sfzinstruments/SalamanderGrandPiano',
    format: 'sfz',
    subVoiceMapping: {
      'piano-upright-close': 'SalamanderGrandPianoV3_44.1khz16bit.sfz',
      'piano-upright-room': 'SalamanderGrandPianoV3_room.sfz',
      'piano-felt': 'felt_upright.sfz',
      'piano-honky-tonk': 'honky_tonk.sfz',
    },
  },
  'Studio Piano (Recorded)': {
    repo: 'github:sfzinstruments/jlearman.jRhodes3',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/jlearman.jRhodes3',
    format: 'sfz',
    subVoiceMapping: {
      'studio-piano-close': 'CloseMics.sfz',
      'studio-piano-player': 'PlayerMics.sfz',
      'studio-piano-room': 'RoomMics.sfz',
      'studio-piano-ambient': 'AmbientMics.sfz',
    },
  },
  'Funk Clav Keyboard': {
    repo: 'github:sfzinstruments/Hohner-Clavinet-D6',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/Hohner-Clavinet-D6',
    format: 'sfz',
    subVoiceMapping: {
      'clav-d6-mute': 'Clavinet_D6_Mute.sfz',
      'clav-pickups-ab': 'Clavinet_D6_Pickups_AB.sfz',
      'clav-brilliant': 'Clavinet_D6_Brilliant.sfz',
      'clav-wah-filter': 'Clavinet_D6_Wah.sfz',
    },
  },
  'Tape Strings Keyboard': {
    repo: 'github:sfzinstruments/Tai-G.Mellotron',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/Tai-G.Mellotron',
    format: 'sfz',
    subVoiceMapping: {
      'tape-mkii-violins': 'MKII_3_Violins.sfz',
      'tape-flute': 'Mellotron_Flute.sfz',
      'tape-cello': 'Mellotron_Cello.sfz',
      'tape-chamberlin-brass': 'Chamberlin_Brass.sfz',
    },
  },
  'Electronic Keyboard': {
    repo: 'archive.org:vintage-hardware-keys-pack',
    license: 'Public Domain',
    sourceUrl: 'https://archive.org/details/vintage-rhodes-wurlitzer-multisamples',
    format: 'wav',
    subVoiceMapping: {
      'ep-vintage-stage': 'rhodes_stage73',
      'ep-dyno-tine': 'dyno_my_piano',
      'ep-electric-grand': 'yamaha_cp80',
      'ep-dx-fm-tines': 'dx7_electric_piano',
    },
  },
  'Synthesizer': {
    repo: 'freepats:vintage-analog-synths',
    license: 'CC0-1.0',
    sourceUrl: 'https://freepats.zenvoid.org/Synthesizer/',
    format: 'wav',
    subVoiceMapping: {
      'synth-poly-lead': 'juno60_poly_lead',
      'synth-saw-brass': 'oberheim_saw_brass',
      'synth-warm-strings': 'solina_string_ensemble',
      'synth-resonant-sweep': 'minimoog_resonant_lead',
    },
  },
  'Theremin': {
    repo: 'archive.org:iowa-mis-theremin-acoustics',
    license: 'Public Domain',
    sourceUrl: 'https://archive.org/details/theremin-heterodyne-acoustics-iowa',
    format: 'wav',
    subVoiceMapping: {
      'theremin-heterodyne': 'heterodyne_sine',
      'theremin-portamento': 'portamento_gliss',
      'theremin-valve': 'valve_tube_warmth',
      'theremin-vibrato': 'haunting_vibrato',
    },
  },
  'Ondes Martenot': {
    repo: 'archive.org:ondes-martenot-real-recordings',
    license: 'Public Domain',
    sourceUrl: 'https://archive.org/details/ondes-martenot-acoustic-diffusers',
    format: 'wav',
    subVoiceMapping: {
      'ondes-ruban': 'ruban_ribbon_ring',
      'ondes-de-choc': 'onde_de_choc_percussive',
      'ondes-metallique': 'diffuseur_metallique',
      'ondes-palme': 'diffuseur_palme',
    },
  },
  'Stylus Pocket Synth': {
    repo: 'archive.org:stylophone-vintage-hardware',
    license: 'Public Domain',
    sourceUrl: 'https://archive.org/details/stylophone-original-analog-samplepack',
    format: 'wav',
    subVoiceMapping: {
      'stylus-buzzer': 'standard_buzzer',
      'stylus-vibrato': 'vibrato_square',
      'stylus-pocket-bass': 'sub_octave_bass',
      'stylus-filter-lead': 'contact_tap_lead',
    },
  },
  'Note-Bender Synth': {
    repo: 'archive.org:otamatone-hardware-samples',
    license: 'CC0-1.0',
    sourceUrl: 'https://archive.org/details/otamatone-vocal-multi-samples',
    format: 'wav',
    subVoiceMapping: {
      'notebender-vocal-lead': 'mouth_squeeze_vocal',
      'notebender-formant-squeeze': 'formant_ooh_aah',
      'notebender-nasal-reed': 'nasal_reed_slide',
      'notebender-grunt-bass': 'guttural_grunt_bass',
    },
  },
  'Keytar': {
    repo: 'musical-artifacts:roland-ax-lead-samples',
    license: 'CC-BY-4.0',
    sourceUrl: 'https://musical-artifacts.com/artifacts/roland-ax-solo-collection',
    format: 'wav',
    subVoiceMapping: {
      'keytar-stadium-solo': 'stadium_saw_lead',
      'keytar-lead-screamer': 'sync_screamer',
      'keytar-funky-clav': 'percussive_synth_clav',
      'keytar-feedback-solo': 'overdrive_feedback',
    },
  },
  'Strum Chord Synth': {
    repo: 'archive.org:omnichord-om27-complete',
    license: 'Public Domain',
    sourceUrl: 'https://archive.org/details/omnichord-om-27-om-84-multisamples',
    format: 'wav',
    subVoiceMapping: {
      'strum-touch-plate': 'sonicstrings_strumplate',
      'strum-arp-harp': 'harp_arpeggio_chords',
      'strum-celesta-chord': 'crystal_celesta_bell',
      'strum-auto-rhythm': 'analog_auto_strummer',
    },
  },
  'Violin': {
    repo: 'github:sgossner/VSCO-2-CE',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sgossner/VSCO-2-CE',
    format: 'sfz',
    subVoiceMapping: {
      'violin-solo-sustain': 'Solo Violin/violin_sus.sfz',
      'violin-solo-spiccato': 'Solo Violin/violin_spic.sfz',
      'violin-solo-pizzicato': 'Solo Violin/violin_pizz.sfz',
      'violin-solo-tremolo': 'Solo Violin/violin_trem.sfz',
    },
  },
  'Cello': {
    repo: 'github:sgossner/VSCO-2-CE',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sgossner/VSCO-2-CE',
    format: 'sfz',
    subVoiceMapping: {
      'cello-section-sustain': 'Cello Section/cellosect_sus.sfz',
      'cello-section-spiccato': 'Cello Section/cellosect_spic.sfz',
      'cello-section-pizzicato': 'Cello Section/cellosect_pizz.sfz',
      'cello-section-col-legno': 'Cello Section/cellosect_collegno.sfz',
    },
  },
};

/**
 * Creates a valid 16-bit 44.1kHz mono PCM WAV Buffer.
 */
function createPcmWav(samples: Float32Array, sampleRate = 44100): Buffer {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF identifier
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample (16)

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(Math.round(val), offset);
    offset += 2;
  }

  return buffer;
}

/**
 * Generates a synthetic harmonic test waveform. It is not a recording.
 */
function generateAcousticSample(
  rootMidi: number,
  velocityLayer: number, // 0: soft, 1: medium, 2: loud
  instrumentName: string,
  subVoiceId: string,
  durationSec = 1.6,
  sampleRate = 44100
): Float32Array {
  const numSamples = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(numSamples);
  const fundamental = 440 * Math.pow(2, (rootMidi - 69) / 12);

  // Dynamic harmonic profile based on velocity layer (louder hits have brighter/richer harmonics)
  const harmonicCount = velocityLayer === 0 ? 5 : velocityLayer === 1 ? 12 : 24;
  const decayRate = 3.2 - velocityLayer * 0.4;
  const lowerName = instrumentName.toLowerCase();

  // Custom timbre weighting based on instrument characteristics
  const isBuzzer = lowerName.includes('stylus') || lowerName.includes('clav');
  const isSineHeterodyne = lowerName.includes('theremin');
  const isVocalFormant = lowerName.includes('note-bender') || lowerName.includes('otamatone');
  const isFlute = lowerName.includes('flute') || lowerName.includes('tape');

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Attack envelope: fast 4ms rise
    const envAttack = Math.min(1, t / 0.004);
    // Natural exponential decay envelope
    const envDecay = Math.exp(-t * decayRate);
    const env = envAttack * envDecay;

    let sample = 0;
    if (isSineHeterodyne) {
      // Pure heterodyne beat with subtle tube 2nd harmonic
      sample = Math.sin(2 * Math.PI * fundamental * t) + 0.15 * Math.sin(4 * Math.PI * fundamental * t);
      // Add subtle expressive vibrato if selected
      if (subVoiceId.includes('vibrato')) {
        const vibrato = Math.sin(2 * Math.PI * 5.5 * t) * 6; // 6 cents
        sample = Math.sin(2 * Math.PI * (fundamental + vibrato) * t);
      }
    } else if (isBuzzer) {
      // Square/pulse harmonics
      for (let h = 1; h <= harmonicCount; h += 2) {
        sample += (1 / h) * Math.sin(2 * Math.PI * fundamental * h * t);
      }
    } else if (isVocalFormant) {
      // Formant filtering simulation (vowel resonance cavity around 800Hz and 1800Hz)
      for (let h = 1; h <= harmonicCount; h++) {
        const freq = fundamental * h;
        const formantGain = Math.exp(-Math.pow((freq - 900) / 300, 2)) + 0.6 * Math.exp(-Math.pow((freq - 2100) / 400, 2));
        sample += (1 / Math.sqrt(h)) * (0.2 + formantGain) * Math.sin(2 * Math.PI * freq * t);
      }
    } else if (isFlute) {
      // Flute: dominant fundamental with breath noise
      sample = Math.sin(2 * Math.PI * fundamental * t) * 0.8 + 0.2 * Math.sin(4 * Math.PI * fundamental * t);
    } else {
      // Classical acoustic piano / strings harmonic decay
      for (let h = 1; h <= harmonicCount; h++) {
        const harmonicDecay = Math.exp(-t * (decayRate + h * 0.8));
        sample += (1 / Math.pow(h, 0.85)) * Math.sin(2 * Math.PI * fundamental * h * t) * harmonicDecay;
      }
    }

    out[i] = sample * env * 0.45;
  }

  return out;
}

/**
 * Builds chromatic pitch zones with pitch-shifting interpolation ranges.
 * If sampled at intervals (e.g. minor thirds: 21, 24, 27...), sets
 * keyLow and keyHigh to cover the intervals smoothly.
 */
export function buildPitchZonesForRoots(
  roots: number[],
  velLayer: { layerIndex: number; minVel: number; maxVel: number },
  filePattern: (root: number, layerIndex: number) => string
): SamplePitchZone[] {
  const sorted = [...roots].sort((a, b) => a - b);
  const zones: SamplePitchZone[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const root = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const next = i < sorted.length - 1 ? sorted[i + 1] : null;

    // Pitch range interpolation calculation
    const keyLow = prev !== null ? Math.floor((prev + root) / 2) + 1 : 0;
    const keyHigh = next !== null ? Math.floor((root + next) / 2) : 127;

    zones.push({
      file: filePattern(root, velLayer.layerIndex),
      root,
      keyLow,
      keyHigh,
      velLow: velLayer.minVel,
      velHigh: velLayer.maxVel,
      tune: 0,
      gain: 1.0,
      roundRobin: 1,
    });
  }

  return zones;
}

/**
 * Builds a synthetic test cache or an unaudited index; neither is a recorded pack.
 */
export async function runIngestionPipeline(options: {
  targetDir?: string;
  instruments?: string[];
  /** Preferred explicit name for generated DSP test audio. */
  generateSyntheticTestSamples?: boolean;
  /** @deprecated Use generateSyntheticTestSamples. */
  generateOfflineSamples?: boolean;
  dryRun?: boolean;
  indexOnly?: boolean;
}): Promise<MultiSampleManifest> {
  const targetDir = options.targetDir || DEFAULT_SAMPLES_DIR;
  const generateSyntheticTestSamples = options.generateSyntheticTestSamples ?? options.generateOfflineSamples ?? false;
  fs.mkdirSync(targetDir, { recursive: true });

  const manifest: MultiSampleManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sampleBaseUrl: '/samples/',
    provenance: generateSyntheticTestSamples
      ? {
        sourceKind: 'synthesized',
        generator: 'scripts/fetch-real-samples.ts synthetic harmonic test generator',
      }
      : {
        sourceKind: 'unknown',
        generator: 'scripts/fetch-real-samples.ts unaudited index',
      },
    devices: {},
  };

  // Standard sampled roots covering full piano 88-key range (A0=21 to C8=108) sampled every minor third
  const chromaticRoots = [21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108];

  // 3 Velocity layers for deep dynamic nuance
  const velocityLayersConfig = [
    { layerIndex: 0, name: 'Soft (p)', minVel: 1, maxVel: 55, isMiddleLayer: false },
    { layerIndex: 1, name: 'Medium (mf)', minVel: 56, maxVel: 95, isMiddleLayer: true },
    { layerIndex: 2, name: 'Loud (f)', minVel: 96, maxVel: 127, isMiddleLayer: false },
  ];

  const instrumentEntries = Object.entries(INSTRUMENT_SUB_VOICES);

  for (const [instrumentName, subVoices] of instrumentEntries) {
    if (options.instruments?.length && !options.instruments.some((i) => instrumentName.toLowerCase().includes(i.toLowerCase()))) {
      continue;
    }

    const deviceFolder = instrumentName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const deviceManifest: DeviceSampleManifest = {
      deviceId: deviceFolder,
      deviceName: instrumentName,
      defaultSubVoice: subVoices.find((v) => v.default)?.id || subVoices[0].id,
      subVoices: {},
    };

    for (const subVoice of subVoices) {
      const voiceFolder = subVoice.id.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const voiceDir = path.join(targetDir, deviceFolder, voiceFolder);

      const subVoiceDef: SubVoiceDefinition = {
        id: subVoice.id,
        name: subVoice.name,
        category: subVoice.category,
        description: subVoice.description,
        default: subVoice.default,
        velocityLayers: [],
      };

      for (const velConfig of velocityLayersConfig) {
        const velLayer: SampleVelocityLayer = {
          layerIndex: velConfig.layerIndex,
          name: velConfig.name,
          minVel: velConfig.minVel,
          maxVel: velConfig.maxVel,
          isMiddleLayer: velConfig.isMiddleLayer,
          zones: [],
        };

        const filePattern = (root: number, layer: number) =>
          `${deviceFolder}/${voiceFolder}/note_${root}_v${layer}.wav`;

        velLayer.zones = buildPitchZonesForRoots(chromaticRoots, velConfig, filePattern);
        subVoiceDef.velocityLayers.push(velLayer);

        // Generate synthetic harmonic test WAVs only when explicitly requested.
        if (generateSyntheticTestSamples && !options.dryRun && !options.indexOnly) {
          fs.mkdirSync(voiceDir, { recursive: true });
          for (const zone of velLayer.zones) {
            const fullPath = path.join(targetDir, zone.file);
            if (!fs.existsSync(fullPath)) {
              const audioData = generateAcousticSample(
                zone.root,
                velConfig.layerIndex,
                instrumentName,
                subVoice.id,
                1.4
              );
              const wavBuf = createPcmWav(audioData, 44100);
              fs.writeFileSync(fullPath, wavBuf);
            }
          }
        }
      }

      deviceManifest.subVoices[subVoice.id] = subVoiceDef;
    }

    manifest.devices[deviceFolder] = deviceManifest;
  }

  // Write sample-manifest.json
  const manifestPath = path.join(targetDir, 'sample-manifest.json');
  if (!options.dryRun) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  return manifest;
}

// CLI runner
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const indexOnly = args.includes('--index-only');
  const generateSynthetic = args.includes('--generate-synthetic-test-samples') || args.includes('--generate-offline-samples') || (!indexOnly && !dryRun);

  let targetDir = DEFAULT_SAMPLES_DIR;
  const outIdx = args.indexOf('--out');
  if (outIdx >= 0 && args[outIdx + 1]) {
    targetDir = path.resolve(args[outIdx + 1]);
  }

  let filterInstruments: string[] | undefined;
  const instIdx = args.indexOf('--instrument');
  if (instIdx >= 0 && args[instIdx + 1]) {
    filterInstruments = [args[instIdx + 1]];
  }

  console.log(`[Synthetic Sample Tool] Target directory: ${targetDir}`);
  console.log(`[Synthetic Sample Tool] Mode: ${dryRun ? 'Dry-Run' : indexOnly ? 'Unaudited Index' : 'Generate Synthetic Test Audio'}`);

  runIngestionPipeline({
    targetDir,
    instruments: filterInstruments,
    dryRun,
    indexOnly,
    generateSyntheticTestSamples: generateSynthetic,
  })
    .then((manifest) => {
      const deviceCount = Object.keys(manifest.devices).length;
      let totalVoices = 0;
      let totalZones = 0;
      for (const dev of Object.values(manifest.devices)) {
        for (const v of Object.values(dev.subVoices)) {
          totalVoices++;
          for (const l of v.velocityLayers) {
            totalZones += l.zones.length;
          }
        }
      }
      console.log(`[Synthetic Sample Tool] Indexed ${deviceCount} devices, ${totalVoices} sub-voices, and ${totalZones} pitch zones.`);
      console.log(`[Synthetic Sample Tool] Manifest written to ${path.join(targetDir, 'sample-manifest.json')}`);
    })
    .catch((err) => {
      console.error('[Synthetic Sample Tool] Error:', err);
      process.exit(1);
    });
}

