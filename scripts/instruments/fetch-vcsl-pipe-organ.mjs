import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, 'data', 'instrument-cache', 'vcsl-pipe-organ');
const loud = path.join(cache, 'Loud');
const baseUrl = 'https://raw.githubusercontent.com/sgossner/VCSL/master/Aerophones/Edge-blown%20Aerophones/Pipe%20Organ';
const refresh = process.argv.includes('--refresh');
const infoHash = '068A68B925CEEA3834E674AC0179538CB6A0D63AD3A36655B3A2E1AC6C4EF754';

const sampleHashes = {
  'Rode_Man3Open_A1.wav': 'D0C1AF924435E9B9C31801888E3F3F62B14F05C0D29DC2B5C69B1D700105FAD3',
  'Rode_Man3Open_A2.wav': '4B58D8B01067B740B6170E6A3900BD27ADB7CF2ACE7D48033759826A6E4B2316',
  'Rode_Man3Open_A3.wav': 'DC5AD93F22D343EA345D3964E7C7CF1D62A3229F8A2660C12A035473743470B2',
  'Rode_Man3Open_A4.wav': '5AC10B40FB5CB026E3E487E05E24A1B0AEDA35FA8DF956D48F8C9D9FD18BFF38',
  'Rode_Man3Open_A5.wav': '6377903CE83E54CD8032308BC8FC1A3D7351AF807B720B0C74FA97076B2EEB91',
  'Rode_Man3Open_C1.wav': '655578EF565EB845785935BACA41600CA620F19DAE8BA0C102EF53D4128FEBD4',
  'Rode_Man3Open_C2.wav': '6A45EA670FD525C8D9C6E26C2D0C0CF5248972B3AA9CC98521B826208ABA03C7',
  'Rode_Man3Open_C3.wav': '1524A5631561E898617154A2F1B6BDC6FBDACB383549255D78D14EB53B588F8B',
  'Rode_Man3Open_C4.wav': '9F3B80EF47D908B8ACAE4D6E7898A28E8179C3E090D6EE1FF4C326D35EA1D945',
  'Rode_Man3Open_C5.wav': 'ABCFA8821CD0FF1279F427B71CFAD6467D39B0A56481FDA4F164880DF8F6DDCC',
  'Rode_Man3Open_C6.wav': 'FCB7ED9E78012EAB036F89DFD9529852BA11193AFA2F224FD4536FE427F8292B',
  'Rode_Man3Open_D#1.wav': '7CE6AC35C8F951D36A1EBE66043F5A3E1AE3CA6BB3C45C1E74D1A3F64834FA5C',
  'Rode_Man3Open_D#2.wav': 'AEB0FB90C0B8F8C34BB71C998B63EF485E43522071AA39085045B7F50179BB33',
  'Rode_Man3Open_D#3.wav': 'C8EB1BFF00E0261BB403D6A245F54087808C3CB77C03914E97D0F606205895C7',
  'Rode_Man3Open_D#4.wav': 'CD5305AD957832C8F87D3676BA3FE47751DE3817A793D676362438509A415268',
  'Rode_Man3Open_D#5.wav': '92185A77CD3F976715BC0DCD88719B7369235D2BAB082441AD3D66176A0BA01D',
  'Rode_Man3Open_F#1.wav': '03E8A7F44599F0DF9975566FFF56ECE53990D61851F9051F264FA6506F1E075E',
  'Rode_Man3Open_F#2.wav': '0FCCF2E5AD86E2EF4EA2475A69FDB4D6C2687E69F83A15D06CBAE03E34AC5EEE',
  'Rode_Man3Open_F#3.wav': '5B0043D88777245103C73F04A5569B9E4E2CD143E21EEEBDFFD8B3684EEC9DF6',
  'Rode_Man3Open_F#4.wav': 'BC9F4E8F0F20484A7B8EB1E35C2800C3658B59A1D8D28A8FC2F88B0AB788E28D',
  'Rode_Man3Open_F#5.wav': '02AD4CF4038E4934A6DE35CE9E9A6928BB2191E2E23A7CEDDCE0A2E0F83BE532',
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

async function getFile(rel, destination, expectedHash) {
  if (!refresh && fs.existsSync(destination)) {
    const cached = fs.readFileSync(destination);
    if (sha256(cached) === expectedHash) return;
  }

  const response = await fetch(`${baseUrl}/${rel.split('/').map(encodeURIComponent).join('/')}`);
  if (!response.ok) throw new Error(`Download ${rel} failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== expectedHash) throw new Error(`SHA-256 mismatch for ${rel}; source revision changed or content is invalid`);
  if (rel.endsWith('.wav') && (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')) {
    throw new Error(`Invalid WAV header in ${rel}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
}

async function main() {
  for (const [name, hash] of Object.entries(sampleHashes)) {
    await getFile(`Loud/${name}`, path.join(loud, name), hash);
  }

  const infoPath = path.join(cache, 'Info.txt');
  await getFile('Info.txt', infoPath, infoHash);
  const info = fs.readFileSync(infoPath, 'utf8');
  if (!/Organ sampled by Simon Dalzell of Ivy Audio, Winter 2015-16\./i.test(info)
    || !/right to redistribute this sample set by Versilian Studios LLC\./i.test(info)) {
    throw new Error('VCSL Info.txt no longer confirms the recorded source and redistribution permission');
  }
  fs.mkdirSync(cache, { recursive: true });
  console.log(`Verified ${Object.keys(sampleHashes).length} CC0 WAV samples and VCSL attribution metadata in ${path.relative(root, cache)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
