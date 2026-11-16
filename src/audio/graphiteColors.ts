/**
 * Legacy projects stored the bright green track and cable defaults directly in their
 * JSON. Map only those known defaults so deliberately chosen custom colours survive.
 */
const LEGACY_GREEN_ACCENTS: Record<string, string> = {
  '#10b981': '#7f9a8e',
  '#059669': '#6d8b7f',
  '#34d399': '#8ea99e',
  '#22c55e': '#7f9a8e',
  '#16a34a': '#6d8b7f',
  '#4ade80': '#8ea99e',
  '#84cc16': '#9a9a72',
  '#a3e635': '#a6a46a',
  '#65a30d': '#8a8c66',
  '#86efac': '#a3b3ab',
  '#6ee7b7': '#8ea99e',
};

/** The sage track/cable accent used for former green defaults. */
export const GRAPHITE_GREEN = '#7f9a8e';
export const GRAPHITE_OLIVE = '#9a9a72';
export const GRAPHITE_STEEL = '#6f92a3';

/** Keep non-green colours untouched; normalise the old bright-green defaults. */
export function graphiteAccent(color: string | null | undefined): string | undefined {
  if (!color) return color ?? undefined;
  return LEGACY_GREEN_ACCENTS[color.toLowerCase()] ?? color;
}
