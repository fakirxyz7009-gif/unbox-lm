// Fails when a tracked text file contains bytes that are not valid UTF-8, or a U+FFFD
// replacement character (what a CP1252 byte turns into when a tool re-encodes the file).
// Both have silently corrupted docs before (a 0xD7 multiplication sign in CLAUDE.md), so they
// are treated as build errors. Binaries are skipped by extension and by a NUL-byte sniff.
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

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { maxBuffer: 64 * 1024 * 1024 })
      .toString()
      .split('\0')
      .filter(Boolean);
  } catch {
    console.error('check-utf8: not a git checkout, nothing to check');
    return [];
  }
}

const decoder = new TextDecoder('utf-8', { fatal: true });
const problems = [];
let scanned = 0;
let skipped = 0;

for (const file of trackedFiles()) {
  if (BINARY_EXTENSIONS.test(file)) {
    skipped++;
    continue;
  }
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    continue;
  }
  if (buf.subarray(0, 8000).includes(0)) {
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
  } else if (replacements.length) {
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
  console.error(`check-utf8: ${problems.length} problem(s) in ${scanned} text file(s):`);
  for (const problem of problems) console.error('  ' + problem);
  console.error('Fix: save the file as UTF-8 (a CP1252 byte such as 0xD7 is not UTF-8).');
  process.exit(1);
}

console.log(`check-utf8: ${scanned} text file(s) valid UTF-8, ${skipped} binary file(s) skipped`);
