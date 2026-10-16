/**
 * 22 Shrutis Microtonal Tuning Matrix & Raga Scale Assistant
 */
export const SHRATIS_22_RATIOS = [
  1.0,      // Sa (1)
  256/243,  // Komal Re
  16/15,    // Shuddha Re
  10/9,     // Komal Ga
  9/8,      // Shuddha Ga
  32/27,    // Shuddha Ma
  45/32,    // Teevra Ma
  729/512,  // Pa
  128/81,   // Komal Dha
  8/5,      // Shuddha Dha
  5/3,      // Komal Ni
  16/9,     // Shuddha Ni
  15/8,     // Sa (higher octave proportional)
];

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

export class ShrutiMicrotonalEngine {
  public static midiToShrutiFrequency(midiNote: number, baseFrequency: number = 261.63, ragaScale: string = 'Bilawal (Major)', shrutiIndex: number = 0): number {
    const octave = Math.floor(midiNote / 12) - 4;
    const semitoneInOctave = midiNote % 12;
    const ratio = SHRATIS_22_RATIOS[semitoneInOctave % SHRATIS_22_RATIOS.length] || 1.0;
    return baseFrequency * ratio * Math.pow(2, octave);
  }
}
