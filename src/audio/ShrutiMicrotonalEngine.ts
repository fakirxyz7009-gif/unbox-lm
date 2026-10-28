/**
 * 22 Shrutis Microtonal Tuning Matrix & Raga Scale Assistant
 *
 * Implements the canonical 22 Shruti ratios from classical Indian musicology
 * (Bharata Muni's Natya Shastra and Sarangadeva's Sangita Ratnakara),
 * microtonal pitch detuning calculations relative to 12-TET,
 * and Tala rhythmic cycle structures for Indian percussion and transport.
 */

export interface ShrutiDefinition {
  index: number;
  name: string;
  svara: string;
  ratio: number;
  ratioFraction: string;
  cents: number;
}

export const SHRUTIS_22_LIST: ShrutiDefinition[] = [
  { index: 1, name: 'Kshobhini', svara: 'Sa', ratio: 1.0, ratioFraction: '1/1', cents: 0 },
  { index: 2, name: 'Teevra', svara: 'Ati-Komal Re', ratio: 256 / 243, ratioFraction: '256/243', cents: 90.22 },
  { index: 3, name: 'Kumudvati', svara: 'Komal Re', ratio: 16 / 15, ratioFraction: '16/15', cents: 111.73 },
  { index: 4, name: 'Manda', svara: 'Trishruti Re', ratio: 10 / 9, ratioFraction: '10/9', cents: 182.40 },
  { index: 5, name: 'Chandovati', svara: 'Chatushruti Re', ratio: 9 / 8, ratioFraction: '9/8', cents: 203.91 },
  { index: 6, name: 'Dayavati', svara: 'Ati-Komal Ga', ratio: 32 / 27, ratioFraction: '32/27', cents: 294.13 },
  { index: 7, name: 'Ranjani', svara: 'Sadharana Ga', ratio: 6 / 5, ratioFraction: '6/5', cents: 315.64 },
  { index: 8, name: 'Raktika', svara: 'Antara Ga (1)', ratio: 5 / 4, ratioFraction: '5/4', cents: 386.31 },
  { index: 9, name: 'Raudri', svara: 'Antara Ga (2)', ratio: 81 / 64, ratioFraction: '81/64', cents: 407.82 },
  { index: 10, name: 'Krodha', svara: 'Shuddha Ma (1)', ratio: 4 / 3, ratioFraction: '4/3', cents: 498.04 },
  { index: 11, name: 'Vajrika', svara: 'Shuddha Ma (2)', ratio: 27 / 20, ratioFraction: '27/20', cents: 519.55 },
  { index: 12, name: 'Prasarini', svara: 'Prati/Teevra Ma (1)', ratio: 45 / 32, ratioFraction: '45/32', cents: 590.22 },
  { index: 13, name: 'Priti', svara: 'Prati/Teevra Ma (2)', ratio: 729 / 512, ratioFraction: '729/512', cents: 611.73 },
  { index: 14, name: 'Marjani', svara: 'Pa', ratio: 3 / 2, ratioFraction: '3/2', cents: 701.96 },
  { index: 15, name: 'Kshiti', svara: 'Ati-Komal Dha', ratio: 128 / 81, ratioFraction: '128/81', cents: 792.18 },
  { index: 16, name: 'Rakta', svara: 'Komal Dha', ratio: 8 / 5, ratioFraction: '8/5', cents: 813.69 },
  { index: 17, name: 'Sandipani', svara: 'Trishruti Dha', ratio: 5 / 3, ratioFraction: '5/3', cents: 884.36 },
  { index: 18, name: 'Alapini', svara: 'Chatushruti Dha', ratio: 27 / 16, ratioFraction: '27/16', cents: 905.87 },
  { index: 19, name: 'Madanti', svara: 'Ati-Komal Ni', ratio: 16 / 9, ratioFraction: '16/9', cents: 996.09 },
  { index: 20, name: 'Rohini', svara: 'Kaishiki Ni', ratio: 9 / 5, ratioFraction: '9/5', cents: 1017.60 },
  { index: 21, name: 'Ramya', svara: 'Kakali Ni (1)', ratio: 15 / 8, ratioFraction: '15/8', cents: 1088.27 },
  { index: 22, name: 'Ugra', svara: 'Kakali Ni (2)', ratio: 243 / 128, ratioFraction: '243/128', cents: 1109.78 },
];

export const SHRATIS_22_RATIOS: number[] = SHRUTIS_22_LIST.map((s) => s.ratio);

/**
 * Maps 12-TET chromatic semitone steps (0 = Sa, 1 = Re komal, 2 = Re shuddha, etc.)
 * to the ideal Shruti index (0-indexed into SHRUTIS_22_LIST) for different Raga families.
 */
export const RAGA_SEMITONE_TO_SHRUTI_MAP: Record<string, number[]> = {
  'Bilawal (Major)': [0, 2, 4, 6, 7, 9, 11, 13, 15, 17, 19, 20],
  'Yaman (Lydian)': [0, 2, 4, 6, 7, 9, 12, 13, 15, 17, 19, 20],
  'Bhairav (Double Harmonic)': [0, 1, 4, 6, 7, 9, 11, 13, 14, 17, 19, 20],
  'Bhairavi (Double Phrygian)': [0, 2, 3, 5, 7, 9, 11, 13, 15, 16, 18, 19],
  'Kafi (Dorian)': [0, 2, 4, 6, 7, 9, 11, 13, 15, 17, 19, 20],
  'Todi (Chromatic Classical)': [0, 1, 4, 5, 7, 9, 12, 13, 14, 17, 19, 20],
  'Carnatic Shankarabharanam': [0, 2, 4, 6, 7, 9, 11, 13, 15, 17, 19, 20],
  'Carnatic Kalyani': [0, 2, 4, 6, 7, 9, 12, 13, 15, 17, 19, 20],
  'Pentatonic Bhupali': [0, 2, 4, 6, 7, 9, 11, 13, 15, 17, 19, 20],
};

export const RAGA_SCALES: Record<string, number[]> = {
  'Bilawal (Major)': [0, 2, 4, 5, 7, 9, 11],
  'Yaman (Lydian)': [0, 2, 4, 6, 7, 9, 11],
  'Bhairav (Double Harmonic)': [0, 1, 4, 5, 7, 8, 11],
  'Bhairavi (Double Phrygian)': [0, 1, 3, 5, 7, 8, 10],
  'Kafi (Dorian)': [0, 2, 3, 5, 7, 9, 10],
  'Todi (Chromatic Classical)': [0, 1, 3, 6, 7, 8, 11],
  'Carnatic Shankarabharanam': [0, 2, 4, 5, 7, 9, 11],
  'Carnatic Kalyani': [0, 2, 4, 6, 7, 9, 11],
  'Pentatonic Bhupali': [0, 2, 4, 7, 9],
};

export interface TalaDefinition {
  id: string;
  name: string;
  totalBeats: number;
  vibhags: number[];
  accents: ('sam' | 'taali' | 'khali')[];
  bols: string[];
}

export const TALA_PRESETS: Record<string, TalaDefinition> = {
  teentaal: {
    id: 'teentaal',
    name: 'Teentaal (16 Beats)',
    totalBeats: 16,
    vibhags: [4, 4, 4, 4],
    accents: ['sam', 'taali', 'khali', 'taali'],
    bols: ['Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Tin', 'Tin', 'Ta', 'Ta', 'Dhin', 'Dhin', 'Dha'],
  },
  keharwa: {
    id: 'keharwa',
    name: 'Keharwa (8 Beats)',
    totalBeats: 8,
    vibhags: [4, 4],
    accents: ['sam', 'khali'],
    bols: ['Dha', 'Ge', 'Na', 'Ti', 'Na', 'Ka', 'Dhi', 'Na'],
  },
  dadra: {
    id: 'dadra',
    name: 'Dadra (6 Beats)',
    totalBeats: 6,
    vibhags: [3, 3],
    accents: ['sam', 'khali'],
    bols: ['Dha', 'Dhi', 'Na', 'Dha', 'Tu', 'Na'],
  },
  rupak: {
    id: 'rupak',
    name: 'Rupak (7 Beats)',
    totalBeats: 7,
    vibhags: [3, 2, 2],
    accents: ['khali', 'taali', 'taali'],
    bols: ['Tin', 'Tin', 'Na', 'Dhin', 'Na', 'Dhin', 'Na'],
  },
  jhaptal: {
    id: 'jhaptal',
    name: 'Jhaptal (10 Beats)',
    totalBeats: 10,
    vibhags: [2, 3, 2, 3],
    accents: ['sam', 'taali', 'khali', 'taali'],
    bols: ['Dhi', 'Na', 'Dhi', 'Dhi', 'Na', 'Ti', 'Na', 'Dhi', 'Dhi', 'Na'],
  },
  ektaal: {
    id: 'ektaal',
    name: 'Ektaal (12 Beats)',
    totalBeats: 12,
    vibhags: [2, 2, 2, 2, 2, 2],
    accents: ['sam', 'khali', 'taali', 'khali', 'taali', 'taali'],
    bols: ['Dhin', 'Dhin', 'DhaGe', 'Tirakita', 'Tu', 'Na', 'Kat', 'Ta', 'DhaGe', 'Tirakita', 'Dhi', 'Na'],
  },
};

export class ShrutiMicrotonalEngine {
  /**
   * Computes the exact microtonal frequency for a given MIDI note based on 22 Shrutis.
   */
  public static midiToShrutiFrequency(
    midiNote: number,
    baseFrequency: number = 261.63,
    ragaScale: string = 'Bilawal (Major)',
    baseMidi: number = 60
  ): number {
    const octave = Math.floor((midiNote - baseMidi) / 12);
    const semitone = (((midiNote - baseMidi) % 12) + 12) % 12;

    const map = RAGA_SEMITONE_TO_SHRUTI_MAP[ragaScale] ?? RAGA_SEMITONE_TO_SHRUTI_MAP['Bilawal (Major)'];
    const shrutiIdx = map[semitone] ?? 0;
    const ratio = SHRATIS_22_RATIOS[shrutiIdx] ?? 1.0;

    return baseFrequency * ratio * Math.pow(2, octave);
  }

  /**
   * Calculates the exact microtonal fine-tuning offset in cents relative to 12-TET.
   */
  public static centsDeviationFrom12TET(
    midiNote: number,
    ragaScale: string = 'Bilawal (Major)',
    baseMidi: number = 60
  ): number {
    const baseFreq = 440 * Math.pow(2, (baseMidi - 69) / 12);
    const shrutiFreq = this.midiToShrutiFrequency(midiNote, baseFreq, ragaScale, baseMidi);
    const standard12TetFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
    return 1200 * Math.log2(Math.max(10, shrutiFreq) / Math.max(10, standard12TetFreq));
  }
}
