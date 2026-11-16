import fs from 'node:fs';
import path from 'node:path';
import { isRedistributable, packDeviceType, type PackEntry } from '../shared/instruments/catalogTypes.ts';

function instrumentEntries(root: string): PackEntry[] {
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(root, 'public/instruments/index.json'), 'utf8'));
  if (!raw || typeof raw !== 'object' || !('packs' in raw) || !Array.isArray(raw.packs)) throw new Error('Instrument index has no packs array');
  return raw.packs.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid instrument index entry');
    const item = entry as Record<string, unknown>;
    for (const key of ['id', 'name', 'kind', 'category', 'description', 'spdx', 'author', 'source']) {
      if (typeof item[key] !== 'string') throw new Error(`Instrument index entry is missing ${key}`);
    }
    if (typeof item.bytes !== 'number' || !Number.isFinite(item.bytes) || item.bytes < 0) throw new Error('Instrument index entry has invalid sample bytes');
    return item as unknown as PackEntry;
  });
}

/** Build-time replacement keeps private names, sources and type IDs out of shipped JavaScript. */
export function shareInstrumentCatalog(root: string): string {
  return `// Share-build catalog: only cleared recordings.\nexport const INSTRUMENT_PACKS = ${JSON.stringify(instrumentEntries(root).filter((entry) => isRedistributable(entry.spdx)))};\n`;
}

/**
 * The full calibration table includes every recorded device the local build knows about, including
 * private packs. A share build must not name those device types, so emit the same measured values
 * with only cleared pack types. The family fallback in levelCalibration.ts still applies to any
 * cleared pack added after this table was generated.
 */
export function shareLevelCalibrationTable(root: string): string {
  const privateTypes = new Set<string>(instrumentEntries(root)
    .filter((entry) => !isRedistributable(entry.spdx))
    .map((entry) => packDeviceType(entry.id)));
  const source = fs.readFileSync(path.join(root, 'src/audio/levelCalibrationTable.ts'), 'utf8');
  const rows = [...source.matchAll(/^ {2}([a-z0-9_]+): ([0-9.]+),$/gm)];
  if (rows.length === 0) throw new Error('Calibration table has no measurements');
  const body = rows
    .filter(([, type]) => !privateTypes.has(type))
    .map(([line]) => line)
    .join('\n');
  return `// Share-build calibration: private recorded device types are omitted.\nexport const MEASURED_TYPE_TRIM: Readonly<Record<string, number>> = {\n${body}\n};\n`;
}
