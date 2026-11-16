/**
 * One place that knows which environment-gated checks can run on this machine. `tests/coverage.test.ts`
 * reports the missing ones together; with UNBOX_REQUIRE_FULL_COVERAGE set it fails once with that whole
 * list, instead of one failure per affected test.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toolStatus } from '../../server/routes/importRoutes.ts';
import { demucsAvailable } from '../../server/routes/separationRoutes.ts';
import type { MissingCoverage } from './coverageGate.ts';

export type { MissingCoverage };

async function ollamaRunning(): Promise<boolean> {
  return fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) })
    .then((response) => response.ok)
    .catch(() => false);
}

/** The junction scenario needs this process token to create a directory link in the temp folder. */
async function canLinkDirectories(): Promise<boolean> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-link-check-'));
  fs.mkdirSync(path.join(temp, 'target'));
  try {
    fs.symlinkSync(path.join(temp, 'target'), path.join(temp, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

/** Every environment-gated check that cannot run right now, with the reason the tests say. */
export async function missingCoverage(): Promise<MissingCoverage[]> {
  // The hip-hop kit browser probe is not here: it runs as its own command and CI job, never inside
  // `npm test`, so it is not a skip this run has to account for.
  const missing: MissingCoverage[] = [];
  const tools = await toolStatus().catch(() => ({ ytDlp: false, ffmpeg: false }));
  if (!tools.ytDlp || !tools.ffmpeg) {
    missing.push({ subject: 'link import through yt-dlp and ffmpeg', reason: 'yt-dlp and ffmpeg are needed for this check' });
  }

  if (!(await ollamaRunning())) {
    missing.push({ subject: 'the Ollama status route and a live Ollama action request', reason: 'Ollama is not running on this computer' });
  }

  if (!(await demucsAvailable().catch(() => false))) {
    missing.push({ subject: 'the demucs stem split', reason: 'demucs is not installed on this computer' });
  }

  if (!(await canLinkDirectories())) {
    missing.push({
      subject: 'the junction-based share pruning guard',
      reason: 'This process token cannot create the directory link needed by the junction scenario',
    });
  }

  return missing;
}
