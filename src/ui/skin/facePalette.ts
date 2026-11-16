/**
 * Curated dark hardware finishes for rack devices. Each palette is deliberately low-luminance
 * so the family tints read as finished metal, not coloured plastic, inside the graphite cabinet.
 */
export type FacePaletteId = 'forest' | 'blue' | 'oxblood' | 'cream' | 'olive' | 'silver';
export type FaceSignatureId = 'analog' | 'digital' | 'recorded' | 'rhythm' | 'acoustic' | 'signal' | 'system' | 'player';

export interface FacePalette {
  id: FacePaletteId;
  top: string;
  bottom: string;
  edge: string;
  /** RGBA wash for the lit area under the header. */
  glow: string;
}

export interface FaceSignature {
  id: FaceSignatureId;
  label: string;
  accent: string;
  palette: FacePalette;
}

export const FACE_PALETTES: Record<FacePaletteId, FacePalette> = {
  forest: {
    id: 'forest',
    top: '#303539',
    bottom: '#15181a',
    edge: '#535b60',
    glow: 'rgba(200, 202, 204, 0.07)',
  },
  blue: {
    id: 'blue',
    top: '#27343f',
    bottom: '#10151a',
    edge: '#53616d',
    glow: 'rgba(178, 199, 216, 0.09)',
  },
  oxblood: {
    id: 'oxblood',
    top: '#3b292b',
    bottom: '#171112',
    edge: '#6b5052',
    glow: 'rgba(211, 178, 170, 0.08)',
  },
  cream: {
    id: 'cream',
    top: '#39342b',
    bottom: '#191612',
    edge: '#6e6555',
    glow: 'rgba(224, 209, 180, 0.09)',
  },
  olive: {
    id: 'olive',
    top: '#35352b',
    bottom: '#16170f',
    edge: '#5b5d4b',
    glow: 'rgba(182, 160, 120, 0.09)',
  },
  silver: {
    id: 'silver',
    top: '#33373c',
    bottom: '#15181b',
    edge: '#606870',
    glow: 'rgba(208, 215, 220, 0.08)',
  },
};

const SIGNATURES: Record<FaceSignatureId, FaceSignature> = {
  analog: {
    id: 'analog',
    label: 'ANALOG',
    accent: '#c08a5c',
    palette: FACE_PALETTES.cream,
  },
  digital: {
    id: 'digital',
    label: 'DIGITAL',
    accent: '#7d9bb3',
    palette: FACE_PALETTES.blue,
  },
  recorded: {
    id: 'recorded',
    label: 'RECORDED',
    accent: '#a9a39a',
    palette: FACE_PALETTES.forest,
  },
  rhythm: {
    id: 'rhythm',
    label: 'RHYTHM',
    accent: '#b77f72',
    palette: FACE_PALETTES.oxblood,
  },
  acoustic: {
    id: 'acoustic',
    label: 'ACOUSTIC',
    accent: '#b6a078',
    palette: FACE_PALETTES.olive,
  },
  signal: {
    id: 'signal',
    label: 'SIGNAL',
    accent: '#b59a74',
    palette: FACE_PALETTES.silver,
  },
  system: {
    id: 'system',
    label: 'SYSTEM',
    accent: '#87939e',
    palette: FACE_PALETTES.silver,
  },
  player: {
    id: 'player',
    label: 'PLAYER',
    accent: '#a18da9',
    palette: FACE_PALETTES.blue,
  },
};

const TYPE_SIGNATURE: Record<string, FaceSignatureId> = {
  subtractor: 'analog',
  thor: 'analog',
  monotone: 'analog',
  three_osc: 'analog',
  matrix: 'analog',
  pulsar: 'analog',
  third_wave: 'digital',
  europa: 'digital',
  malstrom: 'digital',
  algoritm: 'digital',
  complex1: 'digital',
  parsec2: 'digital',
  sytrus: 'digital',
  flex: 'digital',
  redrum: 'rhythm',
  kong: 'rhythm',
  dr_octo_rex: 'rhythm',
  drm1: 'rhythm',
  tr08: 'rhythm',
  tr8s: 'rhythm',
  rytmik: 'rhythm',
  mimic: 'recorded',
  nnxt: 'recorded',
  nn19: 'recorded',
  grain: 'recorded',
  bansuri: 'acoustic',
  harmonium: 'acoustic',
  tabla: 'acoustic',
  tanpura: 'acoustic',
  dhol: 'acoustic',
  tumbi: 'acoustic',
  world_instrument: 'acoustic',
  percussion_electronic: 'acoustic',
  radical_piano: 'acoustic',
  friktion: 'acoustic',
  pangea: 'acoustic',
  humana: 'acoustic',
  scenic: 'acoustic',
  scream4: 'signal',
  rv7000: 'signal',
  echo: 'signal',
  mclass_master: 'signal',
  combinator: 'system',
  rpg8: 'system',
  midi_out: 'system',
  line_mixer: 'system',
  mix_bus: 'system',
  audio_track: 'system',
  vst_instrument: 'system',
  vst_effect: 'signal',
};

const ENGINE_SIGNATURE: Record<string, FaceSignatureId> = {
  poly: 'analog',
  westcoast: 'analog',
  modal: 'analog',
  karplus: 'analog',
  bowed: 'analog',
  wavetable: 'digital',
  fm: 'digital',
  formant: 'digital',
  sampler: 'recorded',
  multisample: 'recorded',
  granular: 'recorded',
  loops: 'recorded',
  drums: 'rhythm',
  groove: 'rhythm',
  dynamics: 'signal',
  eq: 'signal',
  distortion: 'signal',
  modulation: 'signal',
  delay: 'signal',
  reverb: 'signal',
  filter: 'signal',
  vocoder: 'signal',
  pitch: 'signal',
  pitchCorrect: 'signal',
  timed: 'signal',
  stereo: 'signal',
  mixer: 'system',
  di: 'system',
  patchbay: 'system',
  player: 'player',
};

/** Stable visual family for a device: what it is, not which model finish it happens to use. */
export function faceSignatureForSpec(engine?: string, kind?: string, type?: string): FaceSignature {
  if (engine && ENGINE_SIGNATURE[engine]) return SIGNATURES[ENGINE_SIGNATURE[engine]];
  if (type && TYPE_SIGNATURE[type]) return SIGNATURES[TYPE_SIGNATURE[type]];
  if (kind === 'player') return SIGNATURES.player;
  if (kind === 'effect') return SIGNATURES.signal;
  if (kind === 'utility') return SIGNATURES.system;
  return SIGNATURES.analog;
}

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const rgb = (hex: string): [number, number, number] | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Hue in degrees, saturation and lightness in 0..1. */
const hsb = (hex: string): { hue: number; sat: number; light: number } | null => {
  const c = rgb(hex);
  if (!c) return null;
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (max !== min) {
    if (max === r) hue = ((g - b) / (max - min)) % 6;
    else if (max === g) hue = (b - r) / (max - min) + 2;
    else hue = (r - g) / (max - min) + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { hue, sat, light };
};

/**
 * Pick a finish from the engine family, then fall back to the model's own panel material for
 * devices without an engine: blue panels become navy, red/warm panels oxblood, warm low-saturation
 * panels cream, and grey/black panels gunmetal.
 */
export function facePaletteForSpec(source: {
  type: string;
  finish: string;
  color: string;
  accent: string;
  engine?: string;
  kind?: string;
}): FacePalette {
  // The engine family is the primary identity: an analog poly and a digital wavetable synth
  // should not share a finish just because both happen to be black. The model finish remains
  // the fallback for devices without an engine.
  if (source.engine || TYPE_SIGNATURE[source.type]) return faceSignatureForSpec(source.engine, source.kind, source.type).palette;
  switch (source.finish) {
    case 'blue':
      return FACE_PALETTES.blue;
    case 'wood':
    case 'retro':
      return FACE_PALETTES.oxblood;
    case 'cream':
    case 'white': {
      // A dark cream-finish model reads as a warm oxblood/finished-metal panel, not a bright
      // cream face; only genuinely pale panels get the cream palette.
      const cream = hsb(source.color);
      if (!cream || cream.light >= 0.6) return FACE_PALETTES.cream;
      break;
    }
    case 'gold':
      return FACE_PALETTES.cream;
    case 'brushed':
    case 'grey':
    case 'black':
      return FACE_PALETTES.silver;
    default:
      break;
  }

  const color = hsb(source.color);
  if (!color) return facePaletteForHash(source.type);
  if (color.sat < 0.12) return color.light > 0.48 ? FACE_PALETTES.cream : FACE_PALETTES.silver;
  if (color.hue >= 195 && color.hue < 270) return FACE_PALETTES.blue;
  if (color.hue >= 330 || color.hue < 45) return FACE_PALETTES.oxblood;
  if (color.hue >= 45 && color.hue < 75) return FACE_PALETTES.cream;
  if (color.hue >= 75 && color.hue < 180) return FACE_PALETTES.forest;
  return facePaletteForHash(source.type);
}

/** Deterministic fallback for unusual panel colours. */
function facePaletteForHash(type: string): FacePalette {
  const ids: FacePaletteId[] = ['forest', 'blue', 'oxblood', 'cream', 'silver'];
  return FACE_PALETTES[ids[hashString(type) % ids.length]];
}
