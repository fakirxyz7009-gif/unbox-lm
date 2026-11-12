import { build, type BuildOptions } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shareInstrumentCatalog } from './shareInstrumentCatalog.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let share = false;
let output = 'electron/api-server.cjs';
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--share') share = true;
  else if (arg === '--out' && process.argv[i + 1]) output = process.argv[++i];
  else throw new Error(`Unknown API build argument: ${arg}`);
}
const catalogPath = path.resolve(root, 'shared/instruments/catalog.ts');
const options: BuildOptions = {
  entryPoints: [path.join(root, 'server/electronEntry.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  logLevel: 'warning',
  outfile: path.resolve(root, output),
  define: { __UNBOX_SHARE__: share ? 'true' : 'false' },
  plugins: share ? [{
    name: 'unbox-share-instrument-catalog',
    setup(builder) {
      builder.onLoad({ filter: /[\\/]server[\\/]routes[\\/]stemsRoutes\.ts$/ }, () => ({
        contents: 'export function createStemsRouter() { throw new Error("Private stems are unavailable in share builds."); }',
        loader: 'ts',
      }));
      builder.onLoad({ filter: /[\\/]shared[\\/]instruments[\\/]catalog\.ts$/ }, (args) => {
        if (path.resolve(args.path) !== catalogPath) return undefined;
        return { contents: shareInstrumentCatalog(root), loader: 'ts', resolveDir: path.dirname(args.path) };
      });
    },
  }] : [],
};

await build(options);
