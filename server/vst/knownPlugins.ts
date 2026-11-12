/**
 * Curated metadata for products known to be in the library. A plugin's category / role can't be
 * read from its binary without running it, so these profiles supply what the headers can't.
 * Profiles are matched against "<product folder> <file name>".
 */
import type { SoundCategory, UnitRole } from '../../shared/vst/manifestTypes.ts';

export interface KnownProfile {
  match: RegExp;
  name: string;
  vendor: string;
  /** `plugin` = binary plugin, `library` = sample library played by `engine`, `vendor` = naming only. */
  kind: 'plugin' | 'library' | 'vendor';
  role?: UnitRole;
  category?: SoundCategory;
  engine?: string;
  description?: string;
  tags?: string[];
  macroLabels?: string[];
}

export const KNOWN_PROFILES: KnownProfile[] = [
  {
    match: /\btdr\s*nova\b/i,
    name: 'TDR Nova',
    vendor: 'Tokyo Dawn Labs',
    kind: 'plugin',
    role: 'effect',
    category: 'eq',
    description: 'Parallel dynamic equalizer',
    tags: ['dynamic eq', 'parallel eq', 'mixing', 'mastering', 'de-esser', 'surgical', 'transparent', 'clean'],
    macroLabels: ['Band 1', 'Band 2', 'Band 3', 'Band 4'],
  },
  {
    match: /\bloudmax\b/i,
    name: 'LoudMax',
    vendor: 'Thomas Mundt',
    kind: 'plugin',
    role: 'effect',
    category: 'limiter',
    description: 'Look-ahead brickwall loudness maximizer',
    tags: ['loudness maximizer', 'brickwall', 'mastering', 'loud', 'limiter', 'master bus'],
  },
  {
    match: /\bivgi\s*2?\b/i,
    name: 'IVGI2',
    vendor: 'Klanghelm',
    kind: 'plugin',
    role: 'effect',
    category: 'saturation',
    description: 'Saturation and distortion with an analog-style response',
    tags: ['saturation', 'distortion', 'analog', 'warm', 'console', 'tape', 'harmonics', 'grit', 'drive'],
    macroLabels: ['Drive', 'Asymmetry', 'Response', 'Trim'],
  },
  {
    match: /\bgraillon\b/i,
    name: 'Graillon 3',
    vendor: 'Auburn Sounds',
    kind: 'plugin',
    role: 'effect',
    category: 'pitch',
    description: 'Live voice changer: pitch shifting, pitch correction and bitcrusher',
    tags: ['vocal', 'voice', 'pitch correction', 'pitch shift', 'autotune', 'formant', 'robot', 'bitcrusher'],
  },
  {
    match: /\bsuperior\s*drummer\b/i,
    name: 'Superior Drummer 3',
    vendor: 'Toontrack',
    kind: 'plugin',
    role: 'instrument',
    category: 'drums',
    description: 'Acoustic drum sampler',
    tags: ['acoustic drums', 'drum kit', 'rock', 'pop', 'live drums', 'groove', 'kick', 'snare'],
  },
  {
    match: /\bample\s*guitar\b/i,
    name: 'Ample Guitar SC',
    vendor: 'Ample Sound',
    kind: 'library',
    role: 'instrument',
    category: 'guitar',
    engine: 'Ample Guitar SC',
    description: 'Sampled steel-string acoustic guitar',
    tags: ['acoustic guitar', 'steel string', 'strumming', 'fingerpicking', 'folk', 'songwriter'],
  },
  {
    match: /\bspotlight\s*piano\b/i,
    name: 'Spotlight Piano',
    vendor: 'Fracture Sounds',
    kind: 'library',
    role: 'instrument',
    category: 'piano',
    engine: 'Kontakt',
    description: 'Intimate cinematic piano with textured snapshots',
    tags: ['felt piano', 'intimate', 'cinematic', 'soft', 'textures', 'ambient piano'],
  },
  {
    match: /\bcinematic\s*studio\b.*\bsolo\s*strings\b|\bcsss\b/i,
    name: 'Cinematic Studio Solo Strings',
    vendor: 'Cinematic Samples',
    kind: 'library',
    role: 'instrument',
    category: 'strings',
    engine: 'Kontakt',
    description: 'Solo string quartet: violin, viola, cello with true legato',
    tags: ['solo strings', 'violin', 'viola', 'cello', 'legato', 'cinematic', 'expressive'],
  },
  {
    match: /\bpacific\b.*\bstrings\b/i,
    name: 'Pacific Ensemble Strings',
    vendor: 'Performance Samples',
    kind: 'library',
    role: 'instrument',
    category: 'strings',
    engine: 'Kontakt',
    description: 'Ensemble string sections with many articulations',
    tags: ['ensemble strings', 'string section', 'violins', 'violas', 'cellos', 'basses', 'legato', 'pizzicato', 'tremolo'],
  },
  {
    match: /\bmajestica\b/i,
    name: '8Dio Majestica',
    vendor: '8Dio',
    kind: 'library',
    role: 'instrument',
    category: 'orchestral',
    engine: 'Kontakt',
    description: 'Huge full-orchestra library: strings, brass, winds and percussion',
    tags: ['orchestra', 'epic', 'cinematic', 'trailer', 'huge', 'symphonic'],
  },
  { match: /\bwaves\b/i, name: 'Waves', vendor: 'Waves Audio', kind: 'vendor' },
  { match: /\bhypersonic/i, name: 'HyperSonic 2', vendor: 'Steinberg', kind: 'vendor' },
  { match: /\bmonstrous\b|\bsupersynths\b/i, name: 'Monstrous', vendor: 'Supersynths', kind: 'vendor' },
  { match: /\btoontrack\b/i, name: 'Toontrack', vendor: 'Toontrack', kind: 'vendor' },
];

export function findProfile(text: string, kinds?: KnownProfile['kind'][]): KnownProfile | undefined {
  return KNOWN_PROFILES.find((p) => (!kinds || kinds.includes(p.kind)) && p.match.test(text));
}
