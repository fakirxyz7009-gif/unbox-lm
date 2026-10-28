/**
 * Index the plugin / content library into data/vsr-manifest.json.
 *   npm run scan:vsr
 *   npm run scan:vsr -- --root "D:\vsr" --root "E:\more" --out data/vsr-manifest.json
 * Read-only: never executes plugins or installers and never extracts archives.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ManifestStore, libraryConfigFromEnv } from '../server/vst/manifestStore.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

const args = process.argv.slice(2);
const roots: string[] = [];
let out: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) roots.push(args[++i]);
  else if (args[i] === '--out' && args[i + 1]) out = args[++i];
}

const config = libraryConfigFromEnv(projectRoot);
if (roots.length) config.roots = roots;
if (out) config.manifestPath = path.resolve(projectRoot, out);

const gb = (n: number) => `${(n / 1024 ** 3).toFixed(2)} GB`;

console.log(`Scanning ${config.roots.join(', ')} (read-only)…`);
const manifest = await new ManifestStore(config).rescan((p) => {
  process.stdout.write(`\r  ${p.phase.padEnd(8)} ${p.files} files, ${p.dirs} folders   `);
});
process.stdout.write('\n');

const { scan, stats } = manifest;
console.log(`Done in ${(scan.durationMs / 1000).toFixed(1)} s — ${scan.filesSeen} files, ${gb(scan.bytesSeen)}, ${scan.duplicates} duplicates, ${scan.otherFiles} non-library files`);
console.log('Items:', Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('\nPlugins:');
for (const item of manifest.items) {
  if (item.kind !== 'plugin' || item.duplicateOf) continue;
  const flag = item.hostable ? 'hostable' : `not hostable: ${item.hostIssue}`;
  console.log(`  ${item.primaryVariant ? '*' : ' '} ${item.name} — ${item.format.toUpperCase()} ${item.arch} · ${item.category} · ${item.vendor ?? '?'} ${item.version ?? ''} (${flag})`);
}
console.log('\nProducts:');
for (const p of manifest.products) {
  console.log(`  ${p.duplicateOf ? '(copy) ' : ''}${p.name}${p.vendor ? ` — ${p.vendor}` : ''}${p.version ? ` v${p.version}` : ''} · ${p.kinds.join(', ')} · ${gb(p.sizeBytes)}`);
}
if (scan.issues.length) {
  console.log(`\n${scan.issues.length} issue(s):`);
  scan.issues.slice(0, 20).forEach((i) => console.log(`  ${i.path}: ${i.message}`));
}
console.log(`\nManifest written to ${config.manifestPath}`);
