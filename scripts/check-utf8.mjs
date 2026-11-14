// Fails when a text file contains bytes that are not valid UTF-8, or a U+FFFD replacement
// character (what a CP1252 byte turns into when a tool re-encodes the file). Both have silently
// corrupted docs before (a 0xD7 multiplication sign in CLAUDE.md), so they are build errors.
//
//   node scripts/check-utf8.mjs            every tracked file in the working tree
//   node scripts/check-utf8.mjs --staged   only what is staged for commit, read from the index
//
// The staged mode is what .githooks/pre-commit runs: the index is what a commit will contain, and
// the working tree may already have been repaired after the bad bytes were staged.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|ico|webp|bmp|woff2?|ttf|otf|eot|ogg|wav|mp3|flac|m4a|aac|opus|mp4|webm|exe|dll|node|asar|zip|7z|gz|pdf|wasm)$/i;

const REPLACEMENT = [0xef, 0xbf, 0xbd];
const CP1252_NAMES = {
  0x80: 'euro sign',
  0x85: 'ellipsis',
  0x91: 'left single quote',
  0x92: 'right single quote',
  0x93: 'left double quote',
  0x94: 'right double quote',
  0x96: 'en dash',
  0x97: 'em dash',
  0xa0: 'no-break space',
  0xb0: 'degree sign',
  0xb7: 'middle dot',
  0xd7: 'multiplication sign',
  0xf7: 'division sign',
};

const stagedMode = process.argv.includes('--staged');

function git(args, options = {}) {
  return execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024, ...options });
}

/** Byte offsets that cannot start a valid UTF-8 sequence. */
function invalidOffsets(buf) {
  const offsets = [];
  let i = 0;
  while (i < buf.length) {
    const byte = buf[i];
    let continuations = 0;
    if (byte < 0x80) {
      i++;
      continue;
    }
    if (byte >= 0xc2 && byte <= 0xdf) continuations = 1;
    else if (byte >= 0xe0 && byte <= 0xef) continuations = 2;
    else if (byte >= 0xf0 && byte <= 0xf4) continuations = 3;
    else {
      offsets.push(i);
      i++;
      continue;
    }
    let complete = true;
    for (let k = 1; k <= continuations; k++) {
      const next = buf[i + k];
      if (next === undefined || next < 0x80 || next > 0xbf) {
        complete = false;
        break;
      }
    }
    if (!complete) {
      offsets.push(i);
      i++;
      continue;
    }
    i += continuations + 1;
  }
  return offsets;
}

function replacementOffsets(buf) {
  const offsets = [];
  for (let i = 0; i + 2 < buf.length; i++) {
    if (buf[i] === REPLACEMENT[0] && buf[i + 1] === REPLACEMENT[1] && buf[i + 2] === REPLACEMENT[2]) {
      offsets.push(i);
      i += 2;
    }
  }
  return offsets;
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

/** [{ file, buf }] for every tracked file, or only for the staged ones. */
function collect() {
  if (stagedMode) {
    const staged = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])
      .toString()
      .split('\0')
      .filter(Boolean);
    const sources = [];
    for (const file of staged) {
      if (BINARY_EXTENSIONS.test(file)) continue;
      try {
        sources.push({ file, buf: git(['cat-file', 'blob', ':' + file]) });
      } catch {
        // A path without an index entry (e.g. unmerged) is not this check's problem.
      }
    }
    return { sources, scope: 'staged' };
  }

  const files = git(['ls-files', '-z']).toString().split('\0').filter(Boolean);
  const sources = [];
  for (const file of files) {
    if (BINARY_EXTENSIONS.test(file)) continue;
    try {
      sources.push({ file, buf: readFileSync(file) });
    } catch {
      continue;
    }
  }
  return { sources, scope: 'tracked' };
}

const decoder = new TextDecoder('utf-8', { fatal: true });
const { sources, scope } = collect();
const problems = [];
let scanned = 0;
let skipped = 0;

for (const { file, buf } of sources) {
  if (isBinary(buf)) {
    skipped++;
    continue;
  }
  scanned++;

  const lineOf = (offset) => buf.subarray(0, offset).filter((byte) => byte === 0x0a).length + 1;
  const invalid = invalidOffsets(buf);
  const replacements = replacementOffsets(buf);

  if (invalid.length) {
    for (const offset of invalid.slice(0, 10)) {
      const byte = buf[offset];
      const name = CP1252_NAMES[byte] ? ' (CP1252 ' + CP1252_NAMES[byte] + ')' : '';
      problems.push(`${file}:${lineOf(offset)}: invalid UTF-8 byte 0x${byte.toString(16).toUpperCase().padStart(2, '0')}${name}`);
    }
    if (invalid.length > 10) problems.push(`${file}: … and ${invalid.length - 10} more invalid byte(s)`);
  } else {
    for (const offset of replacements.slice(0, 10)) {
      problems.push(`${file}:${lineOf(offset)}: U+FFFD replacement character`);
    }
    if (replacements.length > 10) problems.push(`${file}: … and ${replacements.length - 10} more replacement character(s)`);
  }

  // The byte walk above misses overlong forms and surrogate encodings; let the strict decoder
  // confirm the file as a whole.
  try {
    decoder.decode(buf);
  } catch {
    if (!invalid.length && !replacements.length) {
      problems.push(`${file}: not valid UTF-8 (invalid sequence the byte walk did not localise)`);
    }
  }
}

if (problems.length) {
  const where = scope === 'staged' ? 'staged for commit' : 'tracked';
  console.error(`check-utf8: ${problems.length} problem(s) in ${scanned} ${where} text file(s):`);
  for (const problem of problems) console.error('  ' + problem);
  console.error('Fix: save the file as UTF-8 (a CP1252 byte such as 0xD7 is not UTF-8), then stage it again.');
  process.exit(1);
}

console.log(`check-utf8: ${scanned} ${scope} text file(s) valid UTF-8, ${skipped} binary file(s) skipped`);
