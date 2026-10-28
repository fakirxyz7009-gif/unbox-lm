/**
 * SoundFontEngine.ts
 * SoundFont (.SF2 RIFF sfbk) sample-header importer plus a small set of app-owned physical
 * models rendered into AudioBuffers. The built-in tabla, bansuri, sitar, guitar, piano, dhol,
 * and harmonium banks below are DSP models, not imported SoundFonts or recordings of musicians.
 * Recorded packs are cataloged separately in public/instruments/ with provenance/license data;
 * private Custom packs are not redistributable.
 */
import { parseSf2, sf2DefaultVelocityAmplitude } from './soundfont/sf2.ts';
import { SHARE_BUILD } from '../../shared/buildMode.ts';

export interface SoundFontSampleZone {
  id: string;
  name: string;
  keyLow: number;
  keyHigh: number;
  velLow: number; // 0..127
  velHigh: number; // 0..127
  rootMidi: number;
  fineTuneCents: number;
  sampleRate: number;
  loopStart?: number;
  loopEnd?: number;
  loopUntilRelease?: boolean;
  scaleTuning?: number;
  filterCutoffCents?: number;
  level?: number;
  sf2DefaultVelocityAttenuation?: boolean;
  exclusiveClass?: number;
  oneShot: boolean;
  buffer: AudioBuffer;
}

export interface SoundFontPresetBank {
  presetId: string;
  name: string;
  bank: number;
  program: number;
  category: 'indian_classical' | 'percussion' | 'piano_keys' | 'strings' | 'winds' | 'guitars' | 'bass' | 'vocals';
  zones: SoundFontSampleZone[];
}

export interface LoadedSf2Metadata {
  bankName: string;
  presetNames: string[];
  sampleNames: string[];
  sampleDataBytes: number;
}

/** Banks rendered in code (buildAcousticMultiSampleBanks), one at a time on first use. */
const BUILTIN_BANKS = ['tabla', 'bansuri', 'sitar', 'acoustic_guitar', 'acoustic_grand_piano', 'dhol', 'harmonium'] as const;
type BuiltinBankId = (typeof BUILTIN_BANKS)[number];
const isBuiltinBank = (id: string): id is BuiltinBankId => (BUILTIN_BANKS as readonly string[]).includes(id);

export class SoundFontEngine {
  private presets: Map<string, SoundFontPresetBank> = new Map();
  private stemsRequested = false;
  private warming = new Set<string>();
  /** Only user-imported SF2 banks appear here; built-in DSP models are not SF2 banks. */
  public loadedSf2Banks: LoadedSf2Metadata[] = [];

  /**
   * Reads a user-provided .SF2 preset/instrument zone map for import metadata. The LOAD browser
   * binds a chosen preset to project audio assets so saved projects and exports retain the sounds.
   */
  public async loadSf2File(file: File): Promise<LoadedSf2Metadata> {
    const buf = await file.arrayBuffer();
    const parsed = parseSf2(buf);
    if (!parsed) throw new Error('This file is not a supported SoundFont sample bank.');
    const sampleNames = [...new Set(parsed.presets.flatMap((preset) => preset.zones.map((zone) => parsed.samples[zone.sampleIndex]?.name).filter((name): name is string => !!name)))];
    const meta: LoadedSf2Metadata = {
      bankName: file.name,
      presetNames: parsed.presets.map((preset) => preset.name),
      sampleNames,
      sampleDataBytes: buf.byteLength,
    };
    this.loadedSf2Banks.push(meta);
    return meta;
  }

  /**
   * Renders the bank a preset needs (only that one: rendering all of them blocked the page for
   * over a second on the first note). AudioBuffers play in any context, so one render serves the
   * live context and offline exports alike.
   */
  public ensureInitialized(ctx: BaseAudioContext, presetId: string = 'acoustic_grand_piano'): void {
    if (!this.stemsRequested) {
      this.stemsRequested = true;
      if (!SHARE_BUILD) void import('./privateAcousticPresets.ts')
        .then(({ loadPrivateAcousticPresets }) => loadPrivateAcousticPresets(ctx, (preset) => this.presets.set(preset.presetId, preset)))
        .catch(() => undefined);
    }
    if (this.presets.has(presetId)) return;
    // unknown ids (real stems still loading) play the piano, as triggerSampleVoice falls back to it
    const id = isBuiltinBank(presetId) ? presetId : 'acoustic_grand_piano';
    if (!this.presets.has(id)) this.buildAcousticMultiSampleBanks(ctx, id);
  }

  /** Renders a preset's bank while the page is idle, so its first note plays without a stall. */
  public warmUp(ctx: BaseAudioContext, presetId: () => string): void {
    const key = presetId();
    if (this.presets.has(key) || this.warming.has(key)) return;
    this.warming.add(key);
    const run = () => {
      this.warming.delete(key);
      this.ensureInitialized(ctx, presetId());
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 1000);
  }

  /** Compatibility API for callers that need the first SF2 preset as an in-memory bank. */
  public parseSF2Binary(ctx: BaseAudioContext, arrayBuffer: ArrayBuffer, customPresetId: string = 'custom_sf2'): SoundFontPresetBank | null {
    try {
      const parsed = parseSf2(arrayBuffer);
      const preset = parsed?.presets[0];
      if (!parsed || !preset) return null;
      const zones: SoundFontSampleZone[] = [];
      for (const [index, zone] of preset.zones.entries()) {
        const sample = parsed.samples[zone.sampleIndex];
        if (!sample) continue;
        const frameCount = zone.end - zone.start;
        if (frameCount < 64) continue;
        const buffer = ctx.createBuffer(1, frameCount, sample.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let frame = 0; frame < frameCount; frame++) channel[frame] = parsed.pcm[zone.start + frame] / 32768;
        zones.push({
          id: `sf2_zone_${index}`,
          name: sample.name,
          keyLow: zone.keyLow,
          keyHigh: zone.keyHigh,
          velLow: zone.velLow,
          velHigh: zone.velHigh,
          rootMidi: zone.rootMidi,
          fineTuneCents: zone.tuneCents,
          sampleRate: sample.sampleRate,
          loopStart: zone.loop ? (zone.loopStart - zone.start) / sample.sampleRate : undefined,
          loopEnd: zone.loop ? (zone.loopEnd - zone.start) / sample.sampleRate : undefined,
          loopUntilRelease: zone.loopUntilRelease,
          ...(zone.scaleTuning !== undefined ? { scaleTuning: zone.scaleTuning } : {}),
          filterCutoffCents: zone.filterCutoffCents ?? 13500,
          level: zone.level,
          sf2DefaultVelocityAttenuation: true,
          ...(zone.exclusiveClass !== undefined ? { exclusiveClass: zone.exclusiveClass } : {}),
          oneShot: !zone.loop,
          buffer,
        });
      }

      if (zones.length === 0) return null;

      const bank: SoundFontPresetBank = {
        presetId: customPresetId,
        name: preset.name,
        bank: preset.bank,
        program: preset.program,
        category: 'piano_keys',
        zones,
      };
      this.presets.set(customPresetId, bank);
      return bank;
    } catch {
      return null;
    }
  }

  /**
   * Triggers a multi-sampled acoustic note with velocity layering, key-zone lookup,
   * and continuous microtonal pitch bending (Meend / Glide).
   */
  public triggerSampleVoice(
    ctx: BaseAudioContext,
    presetId: string,
    midiNote: number,
    velocityNormalized: number,
    destination: AudioNode,
    time: number,
    options?: {
      glideFromMidi?: number;
      glideDurationSec?: number;
      finePitchCents?: number;
      tensionMultiplier?: number;
      sustainSec?: number;
    }
  ): { stop: (releaseTime?: number) => void; source: AudioBufferSourceNode; gainNode: GainNode } | null {
    this.ensureInitialized(ctx, presetId);
    const preset = this.presets.get(presetId) || this.presets.get('acoustic_grand_piano');
    if (!preset || preset.zones.length === 0) return null;

    const vel127 = Math.max(1, Math.min(127, Math.round(velocityNormalized * 127)));
    const clampedNote = Math.max(12, Math.min(108, Math.round(midiNote)));

    // Find best matching key-range and velocity-range zone
    let zone = preset.zones.find(
      (z) => clampedNote >= z.keyLow && clampedNote <= z.keyHigh && vel127 >= z.velLow && vel127 <= z.velHigh
    );
    if (!zone) {
      // Closest rootMidi fallback
      zone = preset.zones.reduce((best, cur) =>
        Math.abs(cur.rootMidi - clampedNote) < Math.abs(best.rootMidi - clampedNote) ? cur : best
      );
    }

    const startTime = Math.max(ctx.currentTime, time);
    const source = ctx.createBufferSource();
    source.buffer = zone.buffer;

    // Calculate pitch ratio from zone's rootMidi + microtonal Shruti/Meend cents + skin tension
    const centsOffset = (options?.finePitchCents || 0) + zone.fineTuneCents;
    const scale = (zone.scaleTuning ?? 100) / 100;
    const semitoneDiff = (clampedNote - zone.rootMidi) * scale + centsOffset / 100.0;
    const tensionMult = options?.tensionMultiplier || 1.0;
    const targetRate = Math.max(0.25, Math.min(4.0, Math.pow(2.0, semitoneDiff / 12.0) * tensionMult));

    // Apply microtonal Meend (glide) if glideFromMidi is provided
    if (options?.glideFromMidi && options.glideFromMidi !== clampedNote && (options.glideDurationSec || 0) > 0.01) {
      const startSemitoneDiff = (options.glideFromMidi - zone.rootMidi) * scale + centsOffset / 100.0;
      const startRate = Math.max(0.25, Math.min(4.0, Math.pow(2.0, startSemitoneDiff / 12.0) * tensionMult));
      source.playbackRate.setValueAtTime(startRate, startTime);
      source.playbackRate.exponentialRampToValueAtTime(targetRate, startTime + (options.glideDurationSec || 0.08));
    } else {
      source.playbackRate.setValueAtTime(targetRate, startTime);
    }

    if (!zone.oneShot && zone.loopStart !== undefined && zone.loopEnd !== undefined && zone.loopEnd > zone.loopStart) {
      source.loop = true;
      source.loopStart = zone.loopStart;
      source.loopEnd = zone.loopEnd;
    }

    // Velocity-sensitive dynamic lowpass filter (soft hits = warmer, hard hits = brighter acoustic harmonics)
    const velFilter = ctx.createBiquadFilter();
    velFilter.type = 'lowpass';
    const velocity127 = Math.max(1, Math.min(127, Math.round(velocityNormalized * 127)));
    const baseCut = zone.filterCutoffCents === undefined
      ? 1800 + Math.pow(Math.max(0.1, velocityNormalized), 1.3) * 14500
      : 8.176 * 2 **(((zone.filterCutoffCents - 2400 * (1 - velocity127 / 128))) / 1200);
    velFilter.frequency.setValueAtTime(Math.min(18500, baseCut), startTime);
    velFilter.Q.setValueAtTime(0.85, startTime);

    const envGain = ctx.createGain();
    const peakGain = zone.sf2DefaultVelocityAttenuation
      ? (zone.level ?? 1) * sf2DefaultVelocityAmplitude(velocityNormalized)
      : Math.max(0.08, Math.min(1.25, Math.pow(velocityNormalized, 0.85)));
    envGain.gain.setValueAtTime(0.0001, startTime);
    envGain.gain.linearRampToValueAtTime(peakGain, startTime + 0.004);

    const maxDuration = options?.sustainSec || (zone.oneShot ? zone.buffer.duration / targetRate + 0.05 : 3.2);
    if (!zone.loopUntilRelease) envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + maxDuration);

    source.connect(velFilter);
    velFilter.connect(envGain);
    envGain.connect(destination);

    let tailActive = false;
    let graphCleaned = false;
    const cleanupGraph = () => {
      if (graphCleaned || tailActive) return;
      graphCleaned = true;
      try {
        velFilter.disconnect();
        envGain.disconnect();
      } catch (e) {}
    };

    source.onended = () => {
      source.disconnect();
      cleanupGraph();
    };

    source.start(startTime);
    if (!zone.loopUntilRelease) source.stop(startTime + maxDuration + 0.04);

    let released = false;
    let releaseTail: AudioBufferSourceNode | null = null;
    return {
      source,
      gainNode: envGain,
      stop: (releaseTime: number = ctx.currentTime) => {
        if (released) return;
        released = true;
        const rel = Math.max(ctx.currentTime, releaseTime);
        try {
          if (zone.loopUntilRelease && zone.loopStart !== undefined && zone.loopEnd !== undefined) {
            envGain.gain.cancelScheduledValues(rel);
            const level = Math.max(1e-8, envGain.gain.value || peakGain);
            envGain.gain.setValueAtTime(level, rel);
            envGain.gain.exponentialRampToValueAtTime(0.0001, rel + 0.16);
            source.stop(rel);
            if (rel >= startTime) {
              const loopLength = zone.loopEnd - zone.loopStart;
              const position = Math.max(0, rel - startTime) * targetRate;
              const tailOffset = position < zone.loopEnd
                ? position
                : zone.loopStart + ((position - zone.loopStart) % loopLength);
              if (tailOffset < zone.buffer.duration) {
                const tail = ctx.createBufferSource();
                releaseTail = tail;
                tail.buffer = zone.buffer;
                tail.playbackRate.setValueAtTime(targetRate, rel);
                tail.connect(velFilter);
                tailActive = true;
                tail.addEventListener('ended', () => {
                  tail.disconnect();
                  tailActive = false;
                  cleanupGraph();
                }, { once: true });
                tail.start(rel, tailOffset);
              }
            }
            return;
          }
          if (rel <= ctx.currentTime + 0.006) {
            envGain.gain.cancelScheduledValues(rel);
            envGain.gain.setValueAtTime(Math.max(0.001, envGain.gain.value || peakGain * 0.5), rel);
          }
          envGain.gain.exponentialRampToValueAtTime(0.0001, rel + 0.16);
          source.stop(rel + 0.18);
        } catch (e) {
          releaseTail?.disconnect();
          tailActive = false;
          cleanupGraph();
        }
      },
    };
  }

  /**
   * Builds multi-velocity, multi-zone acoustic sample banks using physical waveguide
   * & modal impulse synthesis (Karplus-Strong plucked strings, Bessel membrane modes,
   * coupled reed cavity waveguides, and piano hammer-soundboard convolution).
   */
  private buildAcousticMultiSampleBanks(ctx: BaseAudioContext, only: BuiltinBankId): void {
    const sr = ctx.sampleRate || 48000;

    // 1. TABLA (Dayan & Bayan Multi-Bol Velocity Sample Bank: Na, Tin, Tun, Ge, Dha, Dhin)
    if (only === 'tabla') {
      const tablaZones: SoundFontSampleZone[] = [
        // Bayan Bass (Ge / Ghe / Ka) - Low MIDI range (24..57) with authentic wrist pitch-scoop
        {
          id: 'tabla_bayan_soft',
          name: 'Bayan_Ge_pp.wav',
          keyLow: 12,
          keyHigh: 57,
          velLow: 0,
          velHigh: 85,
          rootMidi: 48,
          fineTuneCents: 0,
          sampleRate: sr,
          oneShot: true,
          buffer: this.renderBayanMembraneSample(ctx, 130.81, 0.65, false),
        },
        {
          id: 'tabla_bayan_hard',
          name: 'Bayan_Ghe_Meend_ff.wav',
          keyLow: 12,
          keyHigh: 57,
          velLow: 86,
          velHigh: 127,
          rootMidi: 48,
          fineTuneCents: 0,
          sampleRate: sr,
          oneShot: true,
          buffer: this.renderBayanMembraneSample(ctx, 130.81, 0.98, true),
        },
        // Dayan Tun / Tin (Singing Syahi Bell Harmonic Mode) - Mid MIDI range (58..66)
        {
          id: 'tabla_dayan_tin_mf',
          name: 'Dayan_Tin_Syahi_mf.wav',
          keyLow: 58,
          keyHigh: 66,
          velLow: 0,
          velHigh: 90,
          rootMidi: 60,
          fineTuneCents: 0,
          sampleRate: sr,
          oneShot: true,
          buffer: this.renderDayanSyahiSample(ctx, 261.63, 'tin', 0.78),
        },
        {
          id: 'tabla_dayan_dha_ff',
          name: 'Tabla_Dha_Combined_ff.wav',
          keyLow: 58,
          keyHigh: 66,
          velLow: 91,
          velHigh: 127,
          rootMidi: 60,
          fineTuneCents: 0,
          sampleRate: sr,
          oneShot: true,
          buffer: this.renderDayanSyahiSample(ctx, 261.63, 'dha', 1.0),
        },
        // Dayan Na / Ta (Crisp Rim Chanti Strike) - High MIDI range (67..108)
        {
          id: 'tabla_dayan_na_ff',
          name: 'Dayan_Na_Rim_ff.wav',
          keyLow: 67,
          keyHigh: 127,
          velLow: 0,
          velHigh: 127,
          rootMidi: 72,
          fineTuneCents: 0,
          sampleRate: sr,
          oneShot: true,
          buffer: this.renderDayanSyahiSample(ctx, 523.25, 'na', 0.95),
        },
      ];
      this.presets.set('tabla', {
        presetId: 'tabla',
        name: 'Benares Tabla (Physical Model)',
        bank: 0,
        program: 116,
        category: 'indian_classical',
        zones: tablaZones,
      });
    }

    // 2. BANSURI BAMBOO FLUTE (Breath-Excited Cylindrical Bore Waveguide with Overblown Harmonics)
    if (only === 'bansuri') {
      const bansuriRoots = [48, 60, 72, 84];
      const bansuriZones: SoundFontSampleZone[] = [];
      bansuriRoots.forEach((root, idx) => {
        const freq = 440 * Math.pow(2, (root - 69) / 12);
        const keyLow = idx === 0 ? 12 : root - 6;
        const keyHigh = idx === bansuriRoots.length - 1 ? 120 : root + 5;
        bansuriZones.push({
          id: `bansuri_${root}_pp`,
          name: `Bansuri_${root}_SoftBreath.wav`,
          keyLow,
          keyHigh,
          velLow: 0,
          velHigh: 85,
          rootMidi: root,
          fineTuneCents: 0,
          sampleRate: sr,
          loopStart: 0.35,
          loopEnd: 1.65,
          oneShot: false,
          buffer: this.renderBansuriWaveguideSample(ctx, freq, 0.65),
        });
        bansuriZones.push({
          id: `bansuri_${root}_ff`,
          name: `Bansuri_${root}_OverblownChiff.wav`,
          keyLow,
          keyHigh,
          velLow: 86,
          velHigh: 127,
          rootMidi: root,
          fineTuneCents: 0,
          sampleRate: sr,
          loopStart: 0.35,
          loopEnd: 1.65,
          oneShot: false,
          buffer: this.renderBansuriWaveguideSample(ctx, freq, 0.98),
        });
      });
      this.presets.set('bansuri', {
        presetId: 'bansuri',
        name: 'Bamboo Bansuri (Waveguide Model)',
        bank: 0,
        program: 73,
        category: 'indian_classical',
        zones: bansuriZones,
      });
    }

    // 3. ROYAL SITAR & PLUCKED WORLD STRINGS (Karplus-Strong Waveguide + Curved Jivari Bridge + Taraf Sympathetic Strings)
    if (only === 'sitar') {
      const sitarRoots = [48, 60, 72, 84];
      const sitarZones: SoundFontSampleZone[] = sitarRoots.map((root, idx) => {
        const freq = 440 * Math.pow(2, (root - 69) / 12);
        return {
          id: `sitar_zone_${root}`,
          name: `Royal_Sitar_Mizrab_${root}.wav`,
          keyLow: idx === 0 ? 12 : root - 6,
          keyHigh: idx === sitarRoots.length - 1 ? 120 : root + 5,
          velLow: 0,
          velHigh: 127,
          rootMidi: root,
          fineTuneCents: 0,
          sampleRate: sr,
          oneShot: true,
          buffer: this.renderKarplusJivariStringSample(ctx, freq, 2.2, 0.72, true),
        };
      });
      this.presets.set('sitar', {
        presetId: 'sitar',
        name: 'Miraj Sitar (Jivari String Model)',
        bank: 0,
        program: 104,
        category: 'indian_classical',
        zones: sitarZones,
      });
    }

    // 4. ACOUSTIC GUITAR & PLUCKED CHORDOPHONES (Clean Karplus-Strong Steel/Nylon Body)
    if (only === 'acoustic_guitar') {
      const guitarRoots = [48, 60, 72, 84];
      const guitarZones: SoundFontSampleZone[] = guitarRoots.map((root, idx) => {
        const freq = 440 * Math.pow(2, (root - 69) / 12);
        return {
          id: `guitar_zone_${root}`,
          name: `Acoustic_Steel_Guitar_${root}.wav`,
          keyLow: idx === 0 ? 12 : root - 6,
          keyHigh: idx === guitarRoots.length - 1 ? 120 : root + 5,
          velLow: 0,
          velHigh: 127,
          rootMidi: root,
          fineTuneCents: 0,
          sampleRate: sr,
          oneShot: true,
          buffer: this.renderKarplusJivariStringSample(ctx, freq, 1.9, 0.12, false),
        };
      });
      this.presets.set('acoustic_guitar', {
        presetId: 'acoustic_guitar',
        name: 'Concert Steel Guitar (Plucked-String Model)',
        bank: 0,
        program: 25,
        category: 'guitars',
        zones: guitarZones,
      });
    }

    // 5. CONCERT GRAND PIANO (app-owned hammer/string/soundboard model)
    if (only === 'acoustic_grand_piano') {
      const pianoRoots = [36, 48, 60, 72, 84];
      const pianoZones: SoundFontSampleZone[] = [];
      pianoRoots.forEach((root, idx) => {
        const freq = 440 * Math.pow(2, (root - 69) / 12);
        const keyLow = idx === 0 ? 12 : root - 6;
        const keyHigh = idx === pianoRoots.length - 1 ? 120 : root + 5;
        pianoZones.push({
          id: `piano_${root}_mf`,
          name: `Steinway_Grand_${root}_mf.wav`,
          keyLow,
          keyHigh,
          velLow: 0,
          velHigh: 90,
          rootMidi: root,
          fineTuneCents: 0,
          sampleRate: sr,
          oneShot: true,
          buffer: this.renderGrandPianoSample(ctx, freq, 0.72),
        });
        pianoZones.push({
          id: `piano_${root}_ff`,
          name: `Steinway_Grand_${root}_ff.wav`,
          keyLow,
          keyHigh,
          velLow: 91,
          velHigh: 127,
          rootMidi: root,
          fineTuneCents: 0,
          sampleRate: sr,
          oneShot: true,
          buffer: this.renderGrandPianoSample(ctx, freq, 1.0),
        });
      });
      this.presets.set('acoustic_grand_piano', {
        presetId: 'acoustic_grand_piano',
        name: 'Concert Grand Piano (Soundboard Model)',
        bank: 0,
        program: 0,
        category: 'piano_keys',
        zones: pianoZones,
      });
    }

    // 6. PUNJABI DHOL (Dual-Headed Goat/Buffalo Skin Barrel Drum Sample Bank)
    if (only === 'dhol') {
      this.presets.set('dhol', {
        presetId: 'dhol',
        name: 'Punjabi Bhangra Dhol (Dual-Membrane Model)',
        bank: 0,
        program: 117,
        category: 'indian_classical',
        zones: [
          {
            id: 'dhol_dugga_bass',
            name: 'Dhol_Dugga_Bass.wav',
            keyLow: 12,
            keyHigh: 59,
            velLow: 0,
            velHigh: 127,
            rootMidi: 48,
            fineTuneCents: 0,
            sampleRate: sr,
            oneShot: true,
            buffer: this.renderDholBarrelSample(ctx, 88.0, true),
          },
          {
            id: 'dhol_tilli_stick',
            name: 'Dhol_Tilli_HighStick.wav',
            keyLow: 60,
            keyHigh: 127,
            velLow: 0,
            velHigh: 127,
            rootMidi: 60,
            fineTuneCents: 0,
            sampleRate: sr,
            oneShot: true,
            buffer: this.renderDholBarrelSample(ctx, 293.66, false),
          },
        ],
      });
    }

    // 7. VEDIC HARMONIUM (Triple-Reed Brass Bellows Acoustic Bank)
    if (only === 'harmonium') {
      this.presets.set('harmonium', {
        presetId: 'harmonium',
        name: 'Calcutta Scale-Changer Harmonium (Reed Model)',
        bank: 0,
        program: 20,
        category: 'indian_classical',
        zones: [48, 60, 72].map((root, idx) => ({
          id: `harmonium_${root}`,
          name: `Harmonium_TripleReed_${root}.wav`,
          keyLow: idx === 0 ? 12 : root - 6,
          keyHigh: idx === 2 ? 120 : root + 5,
          velLow: 0,
          velHigh: 127,
          rootMidi: root,
          fineTuneCents: 0,
          sampleRate: sr,
          loopStart: 0.25,
          loopEnd: 1.45,
          oneShot: false,
          buffer: this.renderHarmoniumReedSample(ctx, 440 * Math.pow(2, (root - 69) / 12)),
        })),
      });
    }
  }

  private renderBayanMembraneSample(ctx: BaseAudioContext, baseFreq: number, intensity: number, withMeendScoop: boolean): AudioBuffer {
    const sr = ctx.sampleRate || 48000;
    const duration = 0.72;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    let phase1 = 0;
    let phase2 = 0;
    let phase3 = 0;

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // Authentic Bayan wrist pressure pitch trajectory
      const pitchEnv = withMeendScoop
        ? t < 0.05
          ? 1.38 - (t / 0.05) * 0.46
          : t < 0.22
          ? 0.92 + ((t - 0.05) / 0.17) * 0.24
          : 1.16 * Math.exp(-(t - 0.22) * 0.45)
        : 0.95 + 0.35 * Math.exp(-t * 28);

      const f1 = baseFreq * pitchEnv;
      const f2 = f1 * 1.593; // Circular membrane Bessel mode (1,1)
      const f3 = f1 * 2.135; // Circular membrane Bessel mode (2,1)

      phase1 += (2 * Math.PI * f1) / sr;
      phase2 += (2 * Math.PI * f2) / sr;
      phase3 += (2 * Math.PI * f3) / sr;

      const body =
        Math.sin(phase1) * Math.exp(-t * 5.2) * 0.78 +
        Math.sin(phase2) * Math.exp(-t * 11.5) * 0.28 +
        Math.sin(phase3) * Math.exp(-t * 18.0) * 0.14;

      // Palm skin thump transient
      const skinSlap = (Math.random() * 2 - 1) * Math.exp(-t * 95) * 0.38 * intensity;
      const sample = Math.tanh((body + skinSlap) * (1.2 + intensity * 0.5)) * 0.88;
      L[i] = sample;
      R[i] = sample * 0.94;
    }
    return buf;
  }

  private renderDayanSyahiSample(
    ctx: BaseAudioContext,
    baseFreq: number,
    bol: 'tin' | 'na' | 'dha',
    intensity: number
  ): AudioBuffer {
    const sr = ctx.sampleRate || 48000;
    const duration = bol === 'na' ? 0.42 : 0.68;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    // Weighted Syahi black-paste harmonic ratios (1 : 2.00 : 3.01 : 4.03)
    const ratios = bol === 'na' ? [1.0, 2.02, 3.01, 4.04, 5.12] : [1.0, 2.0, 3.0, 4.01];
    const amps = bol === 'na' ? [0.32, 0.58, 0.45, 0.25, 0.14] : [0.68, 0.52, 0.3, 0.15];
    const decays = bol === 'na' ? [14, 9.5, 11, 16, 22] : [6.5, 7.2, 10.5, 15.0];
    const phases = new Float64Array(ratios.length);
    let bayanPhase = 0;

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const transientPitch = 1 + 0.18 * Math.exp(-t * 120);
      let sum = 0;
      for (let m = 0; m < ratios.length; m++) {
        phases[m] += (2 * Math.PI * baseFreq * ratios[m] * transientPitch) / sr;
        sum += Math.sin(phases[m]) * amps[m] * Math.exp(-t * decays[m]);
      }

      // If 'dha', layer the low Bayan bass resonance underneath the Dayan strike
      let bayanLayer = 0;
      if (bol === 'dha') {
        const bf = baseFreq * 0.5 * (0.95 + 0.25 * Math.exp(-t * 18));
        bayanPhase += (2 * Math.PI * bf) / sr;
        bayanLayer = Math.sin(bayanPhase) * Math.exp(-t * 5.8) * 0.55;
      }

      // Crisp finger-edge chanti woody transient
      const chanti = (Math.random() * 2 - 1) * Math.exp(-t * 140) * 0.42 * intensity;
      const out = Math.tanh((sum + bayanLayer + chanti) * 1.25) * 0.88;
      L[i] = out;
      R[i] = out * 0.96;
    }
    return buf;
  }

  private renderBansuriWaveguideSample(ctx: BaseAudioContext, freq: number, breathIntensity: number): AudioBuffer {
    const sr = ctx.sampleRate || 48000;
    const duration = 2.0;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    let noiseLp = 0;

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const attackEnv = 1 - Math.exp(-t * 24);
      // Natural 5.5Hz human diaphragm vibrato that blooms after 0.25s
      const vibDepth = Math.min(1, Math.max(0, (t - 0.2) * 2.5)) * 0.008;
      const instFreq = freq * (1 + Math.sin(2 * Math.PI * 5.5 * t) * vibDepth);

      p1 += (2 * Math.PI * instFreq) / sr;
      p2 += (2 * Math.PI * instFreq * 2.0) / sr;
      p3 += (2 * Math.PI * instFreq * 3.0) / sr;

      // Embouchure edge-tone turbulence (bamboo air chiff)
      const white = Math.random() * 2 - 1;
      noiseLp = noiseLp * 0.88 + white * 0.12;
      const chiff = noiseLp * (0.14 * Math.exp(-t * 18) + 0.045 * breathIntensity);

      const harmonic1 = Math.sin(p1) * 0.72;
      const harmonic2 = Math.sin(p2 + 0.4) * (0.24 * breathIntensity);
      const harmonic3 = Math.sin(p3 + 1.1) * (0.09 * breathIntensity * breathIntensity);

      const sample = (harmonic1 + harmonic2 + harmonic3 + chiff) * attackEnv * 0.82;
      L[i] = sample;
      R[i] = sample * 0.97 + chiff * 0.15;
    }
    return buf;
  }

  private renderKarplusJivariStringSample(
    ctx: BaseAudioContext,
    freq: number,
    duration: number,
    jivariBuzz: number,
    withTarafSympathetic: boolean
  ): AudioBuffer {
    const sr = ctx.sampleRate || 48000;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    const delayLen = Math.max(8, Math.round(sr / freq));
    const delayLine = new Float32Array(delayLen);
    // Pluck excitation (mizrab wire plectrum burst + body impulse)
    for (let i = 0; i < delayLen; i++) {
      const x = i / delayLen;
      delayLine[i] = (Math.random() * 2 - 1) * 0.65 + Math.sin(2 * Math.PI * x) * 0.35;
    }

    let ptr = 0;
    let prev = 0;
    let sympPhase1 = 0;
    let sympPhase2 = 0;

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const curr = delayLine[ptr];
      // Lowpass loop filter + curved parabolic Jivari bridge grazing nonlinearity
      let avg = 0.5 * (curr + prev) * 0.994;
      if (jivariBuzz > 0.05) {
        const bridgeClip = Math.tanh(avg * (1.4 + jivariBuzz * 2.2));
        avg = avg * (1 - jivariBuzz * 0.35) + bridgeClip * (jivariBuzz * 0.35);
      }
      prev = curr;
      delayLine[ptr] = avg;
      ptr = (ptr + 1) % delayLen;

      // Sympathetic Taraf strings shimmering in 5th and Octave
      let taraf = 0;
      if (withTarafSympathetic) {
        sympPhase1 += (2 * Math.PI * freq * 1.498) / sr;
        sympPhase2 += (2 * Math.PI * freq * 2.0) / sr;
        const sympEnv = Math.sin(Math.min(Math.PI, t * 1.8)) * Math.exp(-t * 1.4);
        taraf = (Math.sin(sympPhase1) * 0.12 + Math.sin(sympPhase2) * 0.09) * sympEnv * jivariBuzz;
      }

      const out = Math.tanh((curr + taraf) * 1.3) * 0.85;
      L[i] = out;
      R[i] = out * 0.92 + taraf * 0.3;
    }
    return buf;
  }

  private renderGrandPianoSample(ctx: BaseAudioContext, freq: number, velocity: number): AudioBuffer {
    const sr = ctx.sampleRate || 48000;
    const duration = 2.1;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    // Stiff piano wire inharmonicity coefficient B
    const B = 0.00018;
    // Each partial is a sine recurrence (s[n+1] = 2cos(w)·s[n] − s[n−1]) with a multiplicative
    // decay: the same waveform as Math.sin / Math.exp per sample, about ten times faster.
    const coef = new Float64Array(8);
    const prev = new Float64Array(8);
    const cur = new Float64Array(8);
    const env = new Float64Array(8);
    const decay = new Float64Array(8);
    let count = 0;
    for (let k = 0; k < 8; k++) {
      const n = k + 1;
      const inharmonicFreq = freq * n * Math.sqrt(1 + B * n * n);
      if (inharmonicFreq > sr * 0.45) continue;
      const w = (2 * Math.PI * inharmonicFreq) / sr;
      coef[count] = 2 * Math.cos(w);
      cur[count] = Math.sin(w);
      env[count] = Math.pow(0.68, k) * (k > 2 ? velocity : 1.0);
      decay[count] = Math.exp(-(1.6 + k * 1.45) / sr);
      count++;
    }
    const hammerDecay = Math.exp(-160 / sr);
    let hammerEnv = 0.22 * velocity;

    for (let i = 0; i < len; i++) {
      let sum = 0;
      for (let k = 0; k < count; k++) {
        sum += cur[k] * env[k];
        const next = coef[k] * cur[k] - prev[k];
        prev[k] = cur[k];
        cur[k] = next;
        env[k] *= decay[k];
      }
      // Felt hammer strike thump
      const hammer = (Math.random() * 2 - 1) * hammerEnv;
      hammerEnv *= hammerDecay;
      const val = Math.tanh((sum + hammer) * 0.75) * 0.88;
      L[i] = val;
      R[i] = val * 0.96;
    }
    return buf;
  }

  private renderDholBarrelSample(ctx: BaseAudioContext, freq: number, isDuggaBass: boolean): AudioBuffer {
    const sr = ctx.sampleRate || 48000;
    const duration = isDuggaBass ? 0.58 : 0.36;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    let p1 = 0;
    let p2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = freq * (1 + (isDuggaBass ? 0.55 : 0.28) * Math.exp(-t * 42));
      p1 += (2 * Math.PI * f) / sr;
      p2 += (2 * Math.PI * f * 1.78) / sr;
      const body =
        Math.sin(p1) * Math.exp(-t * (isDuggaBass ? 6.5 : 14.0)) * 0.85 +
        Math.sin(p2) * Math.exp(-t * 18.0) * 0.35;
      const stickSnap = (Math.random() * 2 - 1) * Math.exp(-t * (isDuggaBass ? 85 : 165)) * 0.48;
      const out = Math.tanh((body + stickSnap) * 1.35) * 0.9;
      L[i] = out;
      R[i] = out;
    }
    return buf;
  }

  private renderHarmoniumReedSample(ctx: BaseAudioContext, freq: number): AudioBuffer {
    const sr = ctx.sampleRate || 48000;
    const duration = 1.8;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    let pSub = 0;
    let pMainL = 0;
    let pMainR = 0;

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const bellowsEnv = 1 - Math.exp(-t * 28);
      pSub += (2 * Math.PI * freq * 0.5) / sr;
      pMainL += (2 * Math.PI * freq) / sr;
      pMainR += (2 * Math.PI * (freq * 1.0025)) / sr; // Natural brass reed celeste detune

      // Free-reed asymmetric harmonic series (rich in odd & even harmonics)
      const reedL =
        Math.sin(pMainL) * 0.55 +
        Math.sin(pMainL * 2) * 0.28 +
        Math.sin(pMainL * 3) * 0.18 +
        Math.sin(pSub) * 0.22;
      const reedR =
        Math.sin(pMainR) * 0.55 +
        Math.sin(pMainR * 2) * 0.28 +
        Math.sin(pMainR * 3) * 0.18 +
        Math.sin(pSub) * 0.22;

      L[i] = Math.tanh(reedL * 1.1) * bellowsEnv * 0.78;
      R[i] = Math.tanh(reedR * 1.1) * bellowsEnv * 0.78;
    }
    return buf;
  }

  public getPresetList(): SoundFontPresetBank[] {
    return Array.from(this.presets.values());
  }
}

export const soundFontEngine = new SoundFontEngine();
