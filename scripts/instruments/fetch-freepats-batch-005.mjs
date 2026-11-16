#!/usr/bin/env node
/**
 * Download and verify the archived FreePats banks used by the fifth batch.
 *
 * The two banks are not mirrored as Git repositories, so the official release
 * archives are pinned by SHA-256. The extracted folders are the local SFZ
 * sources used by the build commands.
 *
 * Usage: node scripts/instruments/fetch-freepats-batch-005.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'data', 'instrument-cache');

const PACKS = [
  {
    id: 'freepats-jaw-harp',
    url: 'https://freepats.zenvoid.org/Ethnic/JawHarp/JawHarp-SFZ-20200606.tar.bz2',
    sha256: '8f635c9bf279774cd34dd5a336b63a6e652015f3514253f7be53467d67e5b90c',
    archive: 'JawHarp-SFZ-20200606.tar.bz2',
    folder: 'JawHarp-SFZ-20200606',
    flag: '-xjf',
  },
  {
    id: 'freepats-drawbar-organ',
    url: 'https://freepats.zenvoid.org/Organ/DrawbarOrganEmulation/DrawbarOrganEmulation-SFZ-20190712.tar.xz',
    sha256: 'e2da18b0a4d13be7020037e18e4a719387433357e7603d0773990e794dcf5d0f',
    archive: 'DrawbarOrganEmulation-SFZ-20190712.tar.xz',
    folder: 'DrawbarOrganEmulation-SFZ-20190712',
    flag: '-xJf',
  },
];

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

for (const pack of PACKS) {
  const cache = path.join(ROOT, pack.id);
  const archive = path.join(cache, pack.archive);
  const extracted = path.join(cache, pack.folder);
  if (fs.existsSync(extracted)) {
    console.log(`skip ${pack.id}/${pack.folder}`);
    continue;
  }

  fs.mkdirSync(cache, { recursive: true });
  const bytes = fs.existsSync(archive) ? fs.readFileSync(archive) : null;
  if (bytes && sha256(bytes) === pack.sha256) {
    console.log(`using cached ${pack.archive}`);
  } else {
    const response = await fetch(pack.url, { headers: { 'User-Agent': 'unbox-instrument-batch' } });
    if (!response.ok) throw new Error(`${pack.url}: HTTP ${response.status}`);
    const downloaded = Buffer.from(await response.arrayBuffer());
    const actual = sha256(downloaded);
    if (actual !== pack.sha256) throw new Error(`${pack.url}: SHA-256 ${actual} does not match ${pack.sha256}`);
    fs.writeFileSync(archive, downloaded);
    console.log(`${pack.archive} ${downloaded.length} bytes ${actual}`);
  }

  // Run tar from the cache folder: Windows tar treats an absolute `C:\…` path after -C as a remote host.
  const result = spawnSync('tar', [pack.flag, path.basename(archive)], { cwd: cache, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tar exited with ${result.status}`);
  if (!fs.existsSync(extracted)) throw new Error(`archive did not create ${pack.folder}`);
}

console.log(`FreePats batch 005 sources ready in ${ROOT}`);
