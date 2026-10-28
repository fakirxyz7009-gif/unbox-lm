import fs from 'node:fs';
import path from 'node:path';
import { isRedistributable, type PackEntry } from '../shared/instruments/catalogTypes.ts';

/** Build-time replacement keeps private names, sources and type IDs out of shipped JavaScript. */
export function shareInstrumentCatalog(root: string): string {
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(root, 'public/instruments/index.json'), 'utf8'));
  if (!raw || typeof raw !== 'object' || !('packs' in raw) || !Array.isArray(raw.packs)) throw new Error('Instrument index has no packs array');
  const entries = raw.packs.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid instrument index entry');
    const item = entry as Record<string, unknown>;
    for (const key of ['id', 'name', 'kind', 'category', 'description', 'spdx', 'author', 'source']) {
      if (typeof item[key] !== 'string') throw new Error(`Instrument index entry is missing ${key}`);
    }
    if (typeof item.bytes !== 'number' || !Number.isFinite(item.bytes) || item.bytes < 0) throw new Error('Instrument index entry has invalid sample bytes');
    return item as unknown as PackEntry;
  });
  return `// Share-build catalog: only cleared recordings.\nexport const INSTRUMENT_PACKS = ${JSON.stringify(entries.filter((entry) => isRedistributable(entry.spdx)))};\n`;
}
