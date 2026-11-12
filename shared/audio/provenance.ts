/**
 * Serializable provenance attached to project audio. It records a user's declaration; it is not
 * a license verifier and must never be presented as independent proof that an external recording
 * is reusable or redistributable.
 */
export const AUDIO_PROVENANCE_ORIGINS = ['user-recording', 'user-file', 'link-import', 'stem-library', 'app-render', 'derived', 'unknown'] as const;
export type AudioProvenanceOrigin = (typeof AUDIO_PROVENANCE_ORIGINS)[number];

export const AUDIO_RIGHTS = ['owned', 'cc0', 'cc-by', 'private', 'unknown'] as const;
export type AudioRights = (typeof AUDIO_RIGHTS)[number];

export interface AudioProvenance {
  origin: AudioProvenanceOrigin;
  rights: AudioRights;
  /** Original page/file record, when the user can provide one. */
  source?: string;
  /** Performer, rightsholder, or the user-provided CC-BY credit. */
  attribution?: string;
  /** SPDX identifier or a short declared license label. */
  license?: string;
  /** ISO timestamp of the declaration/import. */
  declaredAt?: string;
}

/**
 * The project never treats an absent declaration as permission.  These helpers make the origin
 * visible even for older workflows which cannot reasonably stop to ask the user for a licence
 * statement (for example, a captured take finishing on the audio thread).
 */
export interface AudioProvenanceOptions {
  /** A user-visible source label; do not put an absolute local path here. */
  source?: string;
  attribution?: string;
  license?: string;
  /** Injectable for deterministic tests and archive migrations. */
  declaredAt?: string;
}

const has = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

const text = (value: unknown, limit: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : undefined;
};

/** Drops malformed/oversized fields read from IndexedDB or an archive. */
export function parseAudioProvenance(value: unknown): AudioProvenance | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Partial<AudioProvenance>;
  if (!has(AUDIO_PROVENANCE_ORIGINS, input.origin) || !has(AUDIO_RIGHTS, input.rights)) return undefined;
  const source = text(input.source, 2_048);
  const attribution = text(input.attribution, 512);
  const license = text(input.license, 128);
  const declaredAt = text(input.declaredAt, 64);
  return {
    origin: input.origin,
    rights: input.rights,
    ...(source ? { source } : {}),
    ...(attribution ? { attribution } : {}),
    ...(license ? { license } : {}),
    ...(declaredAt ? { declaredAt } : {}),
  };
}

const now = (declaredAt?: string) => declaredAt ?? new Date().toISOString();

/** Honest fallback for legacy project data and callers which have no source information. */
export function unknownAudioProvenance(options: AudioProvenanceOptions = {}): AudioProvenance {
  return {
    origin: 'unknown',
    rights: 'unknown',
    ...(options.source ? { source: options.source } : {}),
    ...(options.declaredAt ? { declaredAt: options.declaredAt } : { declaredAt: now() }),
  };
}

/** A local file selected by the user. Its filename is a record, not evidence of a licence. */
export function userFileProvenance(fileName?: string, options: AudioProvenanceOptions = {}): AudioProvenance {
  const source = options.source ?? fileName;
  return {
    origin: 'user-file',
    rights: 'unknown',
    ...(source ? { source } : {}),
    ...(options.attribution ? { attribution: options.attribution } : {}),
    ...(options.license ? { license: options.license } : {}),
    declaredAt: now(options.declaredAt),
  };
}

/** Audio captured from an input or the master is local/private until the user states otherwise. */
export function userRecordingProvenance(source = 'Recorded in Unbox Studio', options: AudioProvenanceOptions = {}): AudioProvenance {
  return {
    origin: 'user-recording',
    rights: 'private',
    source: options.source ?? source,
    ...(options.attribution ? { attribution: options.attribution } : {}),
    ...(options.license ? { license: options.license } : { license: 'Private recording' }),
    declaredAt: now(options.declaredAt),
  };
}

/**
 * A non-destructive app render, edit or source-separation output.  A derivative inherits only
 * the source declaration it was given; it never upgrades unknown rights into a licence.
 */
export function derivedAudioProvenance(
  source: AudioProvenance | undefined,
  operation: string,
  origin: Extract<AudioProvenanceOrigin, 'derived' | 'app-render'> = 'derived',
  options: AudioProvenanceOptions = {},
): AudioProvenance {
  const parent = parseAudioProvenance(source);
  const parentSource = parent?.source;
  const label = [operation.trim(), parentSource ? `from ${parentSource}` : 'from an unverified project source']
    .filter(Boolean)
    .join(' ');
  return {
    origin,
    rights: parent?.rights ?? 'unknown',
    source: options.source ?? label,
    ...(parent?.attribution ? { attribution: parent.attribution } : options.attribution ? { attribution: options.attribution } : {}),
    ...(parent?.license ? { license: parent.license } : options.license ? { license: options.license } : {}),
    declaredAt: now(options.declaredAt),
  };
}

/** Link-import entries must be explicit enough to remain auditable after a project is shared. */
export function linkImportProvenance(value: unknown): AudioProvenance | undefined {
  const provenance = parseAudioProvenance(value);
  if (!provenance || provenance.origin !== 'link-import' || !provenance.source) return undefined;
  if (provenance.rights === 'cc-by' && !provenance.attribution) return undefined;
  if (provenance.rights !== 'owned' && provenance.rights !== 'cc0' && provenance.rights !== 'cc-by') return undefined;
  return provenance;
}
