#!/usr/bin/env node
/**
 * scripts/fetch-real-samples.js
 *
 * Node.js CLI runner for the Real Multi-Sample Audio Harvester & Manifest Generator.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tsScript = path.resolve(__dirname, 'fetch-real-samples.ts');

const tsx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(tsx, ['tsx', tsScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

