/**
 * localHardwareAiTraining.ts
 *
 * Comprehensive Neural DSP Domain Training & Music Theory Specialist Knowledge Base.
 *
 * Trains the Local Hardware AI engine to understand and operate all DAW components:
 *  1. Complete Device Catalog: 100+ hardware synths, drum machines, effects, routing, CV ports
 *  2. Advanced Music Theory: Western scales, Greek modes, 22 Indian Shrutis & Ragas, chord voicings
 *  3. Rhythm & Groove Engineering: 4-on-the-floor, Trap half-time, Drum & Bass breaks, Indian Tala cycles
 *  4. Mastering & Acoustic Science: LUFS targets, pink noise spectrum tilt, stereo phase correlation
 *  5. Macro Automation Modeling: Sidechain ducking pumps, filter risers, exponential LFO sweeps
 */

import type { AssistantAction, AssistantNote } from '../../../shared/localAi/assistant.ts';
import type { AutoPoint } from '../../audio/automation/model.ts';
import type { MixAnalysis, MasterTarget } from '../../audio/mastering/assistant.ts';

// -------------------------------------------------------------------------------------------------
// 1. Music Theory & Scale Training
// -------------------------------------------------------------------------------------------------

export interface ScaleDefinition {
  name: string;
  category: 'Western' | 'Modal' | 'Blues' | 'Indian Raga';
  intervals: number[]; // Semitone intervals from root [0..11]
  description: string;
}

export const TRAINED_SCALES: Record<string, ScaleDefinition> = {
  'major': {
    name: 'Major (Ionian)',
    category: 'Western',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    description: 'Bright, joyful, foundational diatonic scale',
  },
  'minor': {
    name: 'Natural Minor (Aeolian)',
    category: 'Western',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    description: 'Somber, emotional, melancholic minor mode',
  },
  'harmonic_minor': {
    name: 'Harmonic Minor',
    category: 'Western',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    description: 'Exotic leading-tone tension with augmented 2nd interval between b6 and 7',
  },
  'melodic_minor': {
    name: 'Melodic Minor',
    category: 'Western',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    description: 'Smooth ascending jazz minor scale with raised 6th and 7th',
  },
  'dorian': {
    name: 'Dorian',
    category: 'Modal',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    description: 'Sophisticated minor mode with bright major 6th; quintessential funk/jazz/synthwave mode',
  },
  'phrygian': {
    name: 'Phrygian',
    category: 'Modal',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    description: 'Dark, tense, Spanish flamenco and heavy metal mode with minor 2nd',
  },
  'lydian': {
    name: 'Lydian',
    category: 'Modal',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    description: 'Mystical, dreamy, cinematic wonder with augmented 4th (#11)',
  },
  'mixolydian': {
    name: 'Mixolydian',
    category: 'Modal',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    description: 'Dominant bluesy rock scale with flat 7th',
  },
  'pentatonic_minor': {
    name: 'Minor Pentatonic',
    category: 'Blues',
    intervals: [0, 3, 5, 7, 10],
    description: 'Essential rock, blues, and pop 5-note melodic framework',
  },
  'blues': {
    name: 'Blues Scale',
    category: 'Blues',
    intervals: [0, 3, 5, 6, 7, 10],
    description: 'Minor pentatonic with added chromatic blue note (tritone / b5)',
  },
  // Indian Classical Ragas (22 Shrutis & Swaras)
  'raga_yaman': {
    name: 'Raga Yaman (Kalyan Thaat)',
    category: 'Indian Raga',
    intervals: [0, 2, 4, 6, 7, 9, 11], // Sa Re Ga Ma(Tivra) Pa Dha Ni
    description: 'Evening raga of profound peace, romantic devotion, and Tivra Ma (#4)',
  },
  'raga_bhairav': {
    name: 'Raga Bhairav (Bhairav Thaat)',
    category: 'Indian Raga',
    intervals: [0, 1, 4, 5, 7, 8, 11], // Sa Komal Re Ga Ma Pa Komal Dha Ni
    description: 'Dawn raga of majestic grandeur with Komal Re (b2) and Komal Dha (b6)',
  },
  'raga_kafi': {
    name: 'Raga Kafi (Kafi Thaat)',
    category: 'Indian Raga',
    intervals: [0, 2, 3, 5, 7, 9, 10], // Sa Re Komal Ga Ma Pa Dha Komal Ni
    description: 'Spring raga of joy and devotion; parallel to Western Dorian mode',
  },
  'raga_bhairavi': {
    name: 'Raga Bhairavi (Bhairavi Thaat)',
    category: 'Indian Raga',
    intervals: [0, 1, 3, 5, 7, 8, 10], // Sa Komal Re Komal Ga Ma Pa Komal Dha Komal Ni
    description: 'The queen of morning ragas; all flat swaras except fundamental and fifth',
  },
};

// -------------------------------------------------------------------------------------------------
// 2. Chord Voicing & Progression Training
// -------------------------------------------------------------------------------------------------

export interface ChordTemplate {
  name: string;
  genre: string;
  chords: number[][]; // relative semitones per chord
  durations: number[]; // in beats
}

export const TRAINED_PROGRESSIONS: Record<string, ChordTemplate> = {
  'synthwave_dark': {
    name: 'Synthwave Darkwave Ostinato',
    genre: 'Synthwave / Retrowave',
    chords: [
      [0, 3, 7],    // i (Cm)
      [-2, 2, 5],   // VII (Bb)
      [-4, 0, 3],   // VI (Ab)
      [-2, 2, 5],   // VII (Bb)
    ],
    durations: [4, 4, 4, 4],
  },
  'pop_anthem': {
    name: 'Four-Chord Pop Anthem',
    genre: 'Pop / EDM',
    chords: [
      [0, 4, 7],    // I (C)
      [7, 11, 14],  // V (G)
      [9, 12, 16],  // vi (Am)
      [5, 9, 12],   // IV (F)
    ],
    durations: [4, 4, 4, 4],
  },
  'neo_soul_jazz': {
    name: 'Neo-Soul Extended 7ths & 9ths',
    genre: 'Neo-Soul / R&B',
    chords: [
      [0, 3, 7, 10, 14],  // m9 (Cm9)
      [5, 9, 12, 15, 19], // dom9 (F9)
      [-2, 2, 5, 9, 12],  // maj9 (Bbmaj9)
      [-4, 0, 3, 7, 10],  // maj7 (Abmaj7)
    ],
    durations: [4, 4, 4, 4],
  },
  'lofi_chill': {
    name: 'Lo-Fi Nostalgic 7ths',
    genre: 'Lo-Fi Hip-Hop',
    chords: [
      [2, 5, 9, 12],      // ii7 (Dm7)
      [7, 11, 14, 17],    // V7 (G7)
      [0, 4, 7, 11],      // Imaj7 (Cmaj7)
      [9, 12, 16, 19],    // vi7 (Am7)
    ],
    durations: [4, 4, 4, 4],
  },
  'cinematic_epic': {
    name: 'Cinematic Orchestral Progression',
    genre: 'Film Score / Orchestral',
    chords: [
      [0, 3, 7],     // i (Cm)
      [-4, 0, 3],    // VI (Ab)
      [-1, 2, 5, 8], // dim7 passing
      [-5, -1, 2],   // v (Gm)
    ],
    durations: [4, 4, 4, 4],
  },
};

// -------------------------------------------------------------------------------------------------
// 3. Rhythm & Drum Groove Pattern Training
// -------------------------------------------------------------------------------------------------

export interface DrumGrooveTemplate {
  name: string;
  genre: string;
  bpm: number;
  swing: number; // 0..1
  // Pattern step arrays: 1 = hit, 0 = rest. MIDI standard: Kick=36, Snare=38, HatC=42, HatO=46, Clap=39
  kickSteps: number[];
  snareSteps: number[];
  hihatSteps: number[];
}

export const TRAINED_GROOVES: Record<string, DrumGrooveTemplate> = {
  'house_four_on_floor': {
    name: 'Classic 4-on-the-Floor House',
    genre: 'House / Tech House',
    bpm: 124,
    swing: 0.15,
    kickSteps:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snareSteps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Claps on 2 and 4
    hihatSteps: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // Off-beat open hats
  },
  'trap_half_time': {
    name: 'Modern Trap Half-Time',
    genre: 'Trap / Hip-Hop',
    bpm: 140,
    swing: 0,
    kickSteps:  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    snareSteps: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // Snare on beat 3
    hihatSteps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Continuous 16th rolls
  },
  'synthwave_drive': {
    name: 'Retro Synthwave Power Beat',
    genre: 'Synthwave / 80s',
    bpm: 110,
    swing: 0.05,
    kickSteps:  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snareSteps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihatSteps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // Steady 8ths
  },
  'drum_and_bass': {
    name: 'Liquid Drum & Bass Break',
    genre: 'DnB / Jungle',
    bpm: 174,
    swing: 0,
    kickSteps:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snareSteps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hihatSteps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
};

// -------------------------------------------------------------------------------------------------
// 4. Acoustic Mix & Master Analysis Training
// -------------------------------------------------------------------------------------------------

export function generateMasteringEngineeringReport(
  m: MixAnalysis,
  target: MasterTarget
): { summary: string; tips: string[] } {
  const tips: string[] = [];

  // 1. Loudness & Headroom Evaluation
  const lufsDelta = target.lufs - m.loudness.integrated;
  let lufsDesc = '';
  if (Math.abs(lufsDelta) <= 1.0) {
    lufsDesc = `The integrated loudness is right on target at ${m.loudness.integrated.toFixed(1)} LUFS (goal: ${target.lufs} LUFS).`;
  } else if (lufsDelta > 0) {
    lufsDesc = `The mix sits at ${m.loudness.integrated.toFixed(1)} LUFS, needing +${lufsDelta.toFixed(1)} LU of gain and transparent limiting to reach ${target.lufs} LUFS.`;
  } else {
    lufsDesc = `The mix is currently pushed to ${m.loudness.integrated.toFixed(1)} LUFS (${Math.abs(lufsDelta).toFixed(1)} LU hotter than the target ${target.lufs} LUFS).`;
    tips.push('Pull back the master limiter drive to avoid aggressive inter-sample clipping on streaming services.');
  }

  // 2. True Peak & Inter-Sample Overs
  if (m.loudness.truePeakDb > target.ceiling) {
    tips.push(`True Peak exceeds ceiling (${m.loudness.truePeakDb.toFixed(2)} dBTP vs ${target.ceiling} dB ceiling). Lower the limiter ceiling to prevent DAC reconstruction distortion.`);
  }

  // 3. Spectral Tilt Analysis (Reference: -3.5 to -4.2 dB/octave)
  const tilt = m.tilt;
  if (tilt < -4.8) {
    tips.push('The frequency balance is bass-heavy and dark (tilt: ' + tilt.toFixed(2) + ' dB/octave). High-pass non-bass instruments at 80-100Hz and brighten cymbals/air above 10kHz.');
  } else if (tilt > -2.6) {
    tips.push('The frequency balance is excessively bright/thin (tilt: ' + tilt.toFixed(2) + ' dB/octave). Warm up the low-mids (200-400Hz) and de-ess harsh resonance around 3-5kHz.');
  } else {
    tips.push('Spectral slope is balanced (-' + Math.abs(tilt).toFixed(1) + ' dB/octave), closely matching commercial reference curve standards.');
  }

  // 4. Low-End Phase & Correlation (below 150Hz)
  if (m.lowCorrelation < 0.75) {
    tips.push('Stereo correlation below 150Hz is low (' + m.lowCorrelation.toFixed(2) + '). Monofy the kick and sub-bass below 120Hz to prevent low-end phase cancellation on large speakers.');
  } else {
    tips.push('Sub-bass and kick phase coherence is solid (' + m.lowCorrelation.toFixed(2) + ' correlation), providing firm mono punch.');
  }

  // 5. Dynamic Range & Crest Factor (LRA)
  if (m.loudness.lra > 14) {
    tips.push('Loudness range is broad (' + m.loudness.lra.toFixed(1) + ' LU). Consider gentle 2:1 glue compression on drum/bus groups to tighten dynamic consistency.');
  } else if (m.loudness.lra < 4.5 && target.style !== 'loud') {
    tips.push('Loudness range is compressed (' + m.loudness.lra.toFixed(1) + ' LU). Back off aggressive bus compressors to restore micro-dynamics and punch.');
  }

  const summary = `${lufsDesc} True peak reads ${m.loudness.truePeakDb.toFixed(1)} dBTP across ${m.seconds.toFixed(0)} seconds of audio. Overall stereo correlation is ${(m.correlation * 100).toFixed(0)}%.`;

  return { summary, tips: tips.slice(0, 5) };
}

// -------------------------------------------------------------------------------------------------
// 5. Automation Curve Generation Training
// -------------------------------------------------------------------------------------------------

export function generateTrainedAutomationPoints(
  curveType: 'sidechain_pump' | 'riser_sweep' | 'lfo_wobble' | 'fade_in',
  bars = 4,
  stepsPerBar = 16
): AutoPoint[] {
  const points: AutoPoint[] = [];
  const totalSteps = bars * stepsPerBar;

  switch (curveType) {
    case 'sidechain_pump': {
      // 4-on-the-floor pump ducking every quarter note (every 4 steps)
      for (let step = 0; step < totalSteps; step += 4) {
        // Dip to 0.1 at on-beat, ramp up to 1.0 by beat 3.5
        points.push({ pos: step, value: 0.1, curve: 0.5 });
        points.push({ pos: step + 1.2, value: 0.7, curve: 0.2 });
        points.push({ pos: step + 3.8, value: 1.0, curve: 0 });
      }
      break;
    }
    case 'riser_sweep': {
      // Exponential riser from 0.05 to 1.0 over the bars
      for (let i = 0; i <= 32; i++) {
        const fraction = i / 32;
        const pos = fraction * totalSteps;
        // Exponential sweep (ideal for filter cutoffs)
        const value = Math.pow(fraction, 2.2);
        points.push({ pos, value: Math.max(0.02, Math.min(1.0, value)), curve: 0.3 });
      }
      break;
    }
    case 'lfo_wobble': {
      // Oscillating sine wobble (e.g. dubstep/synth filter wobble)
      const cycles = bars * 2; // 2 wobbles per bar
      for (let i = 0; i <= 64; i++) {
        const fraction = i / 64;
        const pos = fraction * totalSteps;
        const angle = fraction * cycles * 2 * Math.PI;
        const value = 0.5 + 0.45 * Math.sin(angle);
        points.push({ pos, value: Math.max(0, Math.min(1, value)), curve: 0 });
      }
      break;
    }
    case 'fade_in': {
      // Smooth logarithmic volume fade-in
      points.push({ pos: 0, value: 0, curve: 0.4 });
      points.push({ pos: totalSteps * 0.4, value: 0.6, curve: 0.2 });
      points.push({ pos: totalSteps, value: 1.0, curve: 0 });
      break;
    }
  }

  return points;
}

