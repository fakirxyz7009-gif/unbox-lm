import type { DeviceParam } from '../audio/deviceParams.ts';

/** A parameter value as the LCD shows it (Hz → k, seconds → ms, % …). */
export const formatParam = (p: Pick<DeviceParam, 'unit' | 'options' | 'max' | 'min'>, v: number): string => {
  if (p.options) return p.options[Math.round(v)] ?? String(v);
  const u = p.unit ?? '';
  if (u === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k` : `${Math.round(v)}`;
  if (u === 's') return v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`;
  if (u === '%') return `${Math.round(v * 100)}%`;
  if (u === 'dB') return `${v.toFixed(1)}dB`;
  if (u === 'st' || u === 'ct') return `${v > 0 ? '+' : ''}${Math.round(v)}${u}`;
  return Math.abs(p.max - p.min) <= 2 ? v.toFixed(2) : Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1);
};
