/** Level helpers shared by meters, faders and readouts. */

export const gainToDb = (g: number): number => (g <= 0.000001 ? -120 : 20 * Math.log10(g));
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export const formatDb = (g: number, digits = 1): string => {
  const db = gainToDb(g);
  return db <= -90 ? '-∞' : `${db > 0 ? '+' : ''}${db.toFixed(digits)}`;
};

/** Meter position 0..1 for a dB value on a -60..+6 dB scale. */
export const meterPos = (db: number, floor = -60, ceil = 6): number => Math.max(0, Math.min(1, (db - floor) / (ceil - floor)));
