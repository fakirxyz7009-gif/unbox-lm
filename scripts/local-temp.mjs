#!/usr/bin/env node
/**
 * Windows build workaround: esbuild writes large transform inputs into os.tmpdir() and then fails
 * to delete them ("remove …: Access is denied") when a scanner or another process still holds a
 * handle. Pointing TEMP/TMP at the project's `.tmp/` folder for the child tool avoids that path.
 *
 * Usage from package.json: `node scripts/local-temp.mjs vite build`.
 */
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const dir = join(process.cwd(), '.tmp');
mkdirSync(dir, { recursive: true });
const env = { ...process.env, TEMP: dir, TMP: dir, TMPDIR: dir };
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('local-temp: no command given');
  process.exit(2);
}
const quote = (value) => (/\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);
const line = [command, ...args].map(quote).join(' ');
const child = spawn(line, { shell: true, stdio: 'inherit', env });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
