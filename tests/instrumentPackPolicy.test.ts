import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INSTRUMENT_PACKS } from '../shared/instruments/catalog.ts';
import { isRedistributable, redistributablePacks } from '../shared/instruments/catalogTypes.ts';
import { parsePack } from '../shared/instruments/types.ts';
import { matchingPackZones, velocityFadeGain } from '../shared/instruments/zones.ts';
import { DEVICE_SPECS } from '../shared/rack/devices/index.ts';
import { ALL_PLAYABLE_INSTRUMENTS } from '../src/audio/instrumentCatalog.ts';

test('share license gate accepts exact CC0 and CC-BY grants and rejects restricted variants', () => {
  for (const license of ['CC0-1.0', 'CC-BY-1.0', 'CC-BY-2.0', 'CC-BY-2.5', 'CC-BY-3.0', 'CC-BY-4.0']) {
    assert.equal(isRedistributable(license), true, license);
  }
  for (const license of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-SA-4.0', 'CC-BY', 'CC0', 'Custom']) {
    assert.equal(isRedistributable(license), false, license);
  }
});

test('share builds keep redistributable recordings and exclude custom-license packs', () => {
  const sharePacks = redistributablePacks(INSTRUMENT_PACKS);
  const privatePacks = INSTRUMENT_PACKS.filter((pack) => !isRedistributable(pack.spdx)).map((pack) => pack.id).sort();

  assert.equal(sharePacks.length, 42);
  assert.ok(sharePacks.every((pack) => isRedistributable(pack.spdx)));
  assert.deepEqual(privatePacks, ['chamkila-harmonium', 'chamkila-vocal', 'dholak-folk', 'tumbi-folk']);
});

test('every recorded instrument pack keeps contributor, source, and license metadata', () => {
  assert.equal(INSTRUMENT_PACKS.length, 46);
  assert.ok(INSTRUMENT_PACKS.every((pack) => pack.author.trim() && pack.source.trim() && pack.spdx.trim()));
  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  const credits = readFileSync(creditsPath, 'utf8');
  assert.equal((credits.match(/^- Attribution:/gm) ?? []).length, INSTRUMENT_PACKS.length);
  assert.doesNotMatch(credits, /^- Recordings:/m);
  assert.match(credits, /Attribution names can identify a library creator, mapper, curator, or uploader/);

  const performerClaims = INSTRUMENT_PACKS.filter((pack) => /recorded by (?:Karoryfer Samples|Versilian Studios)/i.test(pack.description));
  assert.deepEqual(performerClaims.map((pack) => pack.id), []);
  assert.match(INSTRUMENT_PACKS.find((pack) => pack.id === 'osiris-piano')?.description ?? '', /sample pack/i);
  assert.match(INSTRUMENT_PACKS.find((pack) => pack.id === 'growlybass')?.description ?? '', /direct-sample pack/i);
  const osirisDevice = ALL_PLAYABLE_INSTRUMENTS.find((device) => device.type === 'rec_osiris_piano');
  assert.match(osirisDevice?.desc ?? '', /sample pack/i);
  assert.doesNotMatch(osirisDevice?.desc ?? '', /recordings by/i);

  const devicesPagePath = fileURLToPath(new URL('../src/studio/pages/DevicesPage.tsx', import.meta.url));
  const devicesPage = readFileSync(devicesPagePath, 'utf8');
  assert.match(devicesPage, /SHIPPED_PACKS/);
  assert.doesNotMatch(devicesPage, /from ['"]\.\.\/\.\.\/\.\.\/shared\/instruments\/catalog\.ts['"]/);
  assert.match(devicesPage, /Attribution: \$\{pack\.author\}/);
  assert.doesNotMatch(devicesPage, /Recorded by \$\{pack\.author\}/);

  const patchBrowserPath = fileURLToPath(new URL('../src/workstation/PatchBrowser.tsx', import.meta.url));
  const patchBrowser = readFileSync(patchBrowserPath, 'utf8');
  assert.match(patchBrowser, /SHIPPED_PACKS/);
  assert.match(patchBrowser, /Attribution: \$\{pack\.author\}/);
  assert.match(patchBrowser, /Source: \$\{pack\.source\}/);

  const rackLibraryPath = fileURLToPath(new URL('../src/rack/LibraryBrowser.tsx', import.meta.url));
  const rackLibrary = readFileSync(rackLibraryPath, 'utf8');
  assert.doesNotMatch(rackLibrary, /getSubVoicesForDevice/);
  assert.doesNotMatch(rackLibrary, /Real Recorded Audio/);
});

test('Ganjo ships pinned CC0 guitar-banjo recordings with complete key and round-robin maps', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'ganjo');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'guitar');
  assert.match(entry.author, /itsclipping \(recorded, edited and mapped\)/);
  assert.equal(entry.source, 'https://github.com/sfzinstruments/ganjo/tree/ccff5cd5cd3b513873a48994c07724d9d3c39e1c');

  const manifestPath = fileURLToPath(new URL('../public/instruments/ganjo/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/ganjo/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.zones.length, 38);
  for (let note = 38; note <= 72; note++) {
    assert.ok(pack.zones.some((zone) => zone.lokey <= note && zone.hikey >= note), `MIDI ${note} has no recorded sample`);
  }
  const roundRobins = pack.zones.filter((zone) => zone.lokey <= 58 && zone.hikey >= 58);
  assert.deepEqual(roundRobins.map((zone) => zone.seq).sort(), [1, 2]);
  assert.ok(roundRobins.every((zone) => zone.seqLength === 2));
  const samples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg'));
  assert.equal(samples.length, 38);
  assert.equal(samples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/ganjo/samples/${file}`, import.meta.url))).size, 0), entry.bytes);
  const credits = readFileSync(fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url)), 'utf8');
  assert.match(credits, /## Ganjo Six-String Banjo\n\n- Attribution: itsclipping \(recorded, edited and mapped\)\n- License: CC0-1\.0/);
});

test('VCSL Marimba ships pinned CC0 strikes with corrected roots and three complete velocity layers', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'vcsl-marimba');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.oneShot, true);
  assert.match(entry.author, /Versilian Studios LLC/);
  assert.match(entry.author, /individual performer not identified/);
  assert.equal(entry.source, 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Marimba');
  const manifestPath = fileURLToPath(new URL('../public/instruments/vcsl-marimba/instrument.json', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.oneShot, true);
  assert.equal(pack.notePolyphony, 4);
  assert.equal(pack.zones.length, 30);
  assert.ok(pack.zones.every((zone) => !zone.loop));
  assert.deepEqual([...new Set(pack.zones.map((zone) => zone.root))].sort((a, b) => (a ?? 0) - (b ?? 0)), [41, 48, 55, 59, 65, 72, 79, 83, 89, 96]);
  for (let note = 41; note <= 96; note++) {
    for (const velocity of [1, 42, 43, 84, 85, 127]) {
      assert.equal(matchingPackZones(pack, note, velocity, null, 'attack', 0, 0).length, 1, `MIDI ${note}, velocity ${velocity} must select one recorded layer`);
    }
  }
  const samples = readdirSync(fileURLToPath(new URL('../public/instruments/vcsl-marimba/samples/', import.meta.url))).filter((file) => file.endsWith('.ogg'));
  assert.equal(samples.length, 30);
  assert.equal(samples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/vcsl-marimba/samples/${file}`, import.meta.url))).size, 0), entry.bytes);
  const spec = DEVICE_SPECS.find((device) => device.type === 'rec_vcsl_marimba');
  assert.ok(spec?.params.some((param) => param.key === 'decay' && param.label === 'Length'));
  assert.equal(spec?.params.some((param) => param.key === 'release'), false);
  assert.equal(ALL_PLAYABLE_INSTRUMENTS.find((device) => device.name === 'Marimba')?.type, 'rec_vcsl_marimba');
});

test('Meta Piano ships CC0 recordings with full-range velocity layers and equal-power fades', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'meta-piano');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'piano');
  assert.match(entry.author, /Meta Creative Audio team/);
  assert.match(entry.author, /individual performer not identified/);
  assert.match(entry.source, /facebookincubator\/Meta-open-sound\/tree\/main\/systems\/instruments\/meta-piano/);
  assert.ok(entry.bytes > 0);

  const manifestPath = fileURLToPath(new URL('../public/instruments/meta-piano/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/meta-piano/samples/', import.meta.url));
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  const pack = parsePack(raw);
  assert.ok(pack);
  assert.equal(pack.notePolyphony, 1);
  assert.equal(pack.release, 0.035);
  assert.equal(pack.zones.length, 352);
  assert.deepEqual([...new Set(pack.zones.map((zone) => `${zone.lovel}-${zone.hivel}`))], ['1-39', '24-71', '56-103', '88-127']);
  for (let note = 21; note <= 108; note++) {
    assert.equal(pack.zones.filter((zone) => zone.root === note).length, 4, `MIDI ${note} must have four velocity samples`);
  }
  const samples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg'));
  assert.equal(samples.length, 352);
  assert.equal(samples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/meta-piano/samples/${file}`, import.meta.url))).size, 0), entry.bytes);

  const overlap = matchingPackZones(pack, 60, 31, null, 'attack', 0, 0);
  assert.equal(overlap.length, 2);
  const gains = overlap.map((zone) => velocityFadeGain(zone, 31));
  assert.ok(Math.abs(gains[0] ** 2 + gains[1] ** 2 - 1) < 1e-12);

  const instrument = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_meta_piano');
  // The workstation uses a concise patch name; the rack catalog keeps the pack's full name.
  assert.equal(instrument?.name, 'Piano');
  const rackInstrument = DEVICE_SPECS.find((item) => item.type === 'rec_meta_piano');
  assert.equal(rackInstrument?.name, 'Meta Piano');
  const credits = readFileSync(fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url)), 'utf8');
  assert.match(credits, /## Meta Piano\n\n- Attribution: Meta Creative Audio team/);
  assert.match(credits, /## Meta Piano[\s\S]+- License: CC0-1\.0/);
});

test('CP80 electric piano is redistributable and credits the instrument creator and SFZ mapper', () => {
  const pack = INSTRUMENT_PACKS.find((entry) => entry.id === 'cp80-electric-grand');
  assert.ok(pack);
  assert.equal(pack.spdx, 'CC-BY-3.0');
  assert.equal(isRedistributable(pack.spdx), true);
  assert.match(pack.author, /Greg Sullivan/);
  assert.match(pack.author, /kinwie/);
  assert.match(pack.source, /GregSullivan\.E-Pianos/);
  assert.ok(pack.bytes > 0);
  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  const credits = readFileSync(creditsPath, 'utf8');
  assert.match(credits, /## CP80 Electric Grand\n\n- Attribution: Greg Sullivan; kinwie/);
});

test('CP80 sample pack covers MIDI 21–108 in all four velocity layers', () => {
  const manifestPath = fileURLToPath(new URL('../public/instruments/cp80-electric-grand/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/cp80-electric-grand/samples/', import.meta.url));
  const pack = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    release: number;
    zones: { file: string; lokey: number; hikey: number; lovel: number; hivel: number; release: number }[];
  };
  const layers = [...new Set(pack.zones.map((zone) => `${zone.lovel}-${zone.hivel}`))]
    .sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]));

  assert.deepEqual(layers, ['1-49', '50-81', '82-103', '104-127']);
  for (const layer of layers) {
    const layerZones = pack.zones.filter((zone) => `${zone.lovel}-${zone.hivel}` === layer);
    for (let note = 21; note <= 108; note++) {
      assert.ok(layerZones.some((zone) => note >= zone.lokey && note <= zone.hikey), `${layer} is missing MIDI note ${note}`);
    }
  }

  const zoneSamples = [...new Set(pack.zones.map((zone) => zone.file))].sort();
  const encodedSamples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  assert.equal(pack.zones.length, 81);
  assert.ok(Math.abs(pack.release - 0.101) < 1e-9);
  assert.deepEqual([...new Set(pack.zones.map((zone) => zone.release))], [0.101]);
  assert.deepEqual(zoneSamples, encodedSamples);
});

test('FreePats Clarinet ships CC0 recordings with performer credit, loops, and full key coverage', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'freepats-clarinet');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.match(entry.author, /Kaili Dence \(performer\)/);
  assert.match(entry.author, /Tyler Dence \(recording engineer\)/);
  assert.match(entry.author, /Roberto \(looping and sound-bank modifications\)/);
  assert.equal(entry.source, 'https://freepats.zenvoid.org/Reed/clarinet.html');

  const manifestPath = fileURLToPath(new URL('../public/instruments/freepats-clarinet/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/freepats-clarinet/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.zones.length, 9);
  assert.ok(pack.zones.every((zone) => zone.loop));
  for (let note = 45; note <= 91; note++) {
    assert.ok(pack.zones.some((zone) => zone.trigger !== 'release' && zone.lokey <= note && zone.hikey >= note), `MIDI ${note} is missing`);
  }
  const samples = [...new Set(pack.zones.map((zone) => zone.file))].sort();
  const encodedSamples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  assert.equal(encodedSamples.length, 9);
  assert.deepEqual(samples, encodedSamples);

  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  const credits = readFileSync(creditsPath, 'utf8');
  assert.match(credits, /## FreePats Clarinet\n\n- Attribution: Kaili Dence \(performer\); Tyler Dence \(recording engineer\)/);
  const fetchScriptPath = fileURLToPath(new URL('../scripts/instruments/fetch-freepats-clarinet.mjs', import.meta.url));
  const fetchScript = readFileSync(fetchScriptPath, 'utf8');
  assert.match(fetchScript, /481FD688F003FC4930E49123199FD88E7430376CB80F3ECFA685D7F610D20A98/);
});

test('FreePats Wooden Recorder ships performer-credited CC0 recordings and looped MIDI 57-88 coverage', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'freepats-recorder');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.match(entry.author, /Eugene Vlaskin \(performer and recording\)/);
  assert.match(entry.author, /Roberto \(sample processing and sound bank\)/);
  assert.equal(entry.source, 'https://freepats.zenvoid.org/Wind/recorder.html');

  const manifestPath = fileURLToPath(new URL('../public/instruments/freepats-recorder/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/freepats-recorder/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.zones.length, 34);
  assert.ok(pack.zones.every((zone) => zone.loop));
  // Each root is the pitch its sample was recorded at (the source's C5-A6). The key map moves the keys down an
  // octave, not the roots, so every key sounds at its own pitch.
  const recordedRoots = [...new Set(pack.zones.map((zone) => zone.root))].sort((a, b) => (a ?? 0) - (b ?? 0));
  assert.deepEqual(recordedRoots, [72, 74, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 88, 89, 91, 93]);
  for (let note = 57; note <= 88; note++) {
    assert.ok(pack.zones.some((zone) => zone.trigger !== 'release' && zone.lokey <= note && zone.hikey >= note), `MIDI ${note} is missing`);
  }

  const zoneSamples = [...new Set(pack.zones.map((zone) => zone.file))].sort();
  const encodedSamples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  assert.equal(encodedSamples.length, 34);
  assert.deepEqual(zoneSamples, encodedSamples);
  assert.equal(encodedSamples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/freepats-recorder/${file}`, import.meta.url))).size, 0), entry.bytes);

  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  const credits = readFileSync(creditsPath, 'utf8');
  assert.match(credits, /## FreePats Wooden Recorder\n\n- Attribution: Eugene Vlaskin \(performer and recording\)/);
  const fetchScriptPath = fileURLToPath(new URL('../scripts/instruments/fetch-freepats-recorder.mjs', import.meta.url));
  const fetchScript = readFileSync(fetchScriptPath, 'utf8');
  assert.match(fetchScript, /24975F5F168F4D98B9E2EF0ED77C32A800A1DA3203EC9AE26614F35F670DF693/);
  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_freepats_recorder');
  const spec = DEVICE_SPECS.find((item) => item.type === 'rec_freepats_recorder');
  assert.equal(device?.name, 'FreePats Wooden Recorder');
  assert.equal(spec?.engineConfig?.pack, 'freepats-recorder');
});

test('FreePats Bagpipe ships performer-credited CC0 recordings, two drones, and looped MIDI zones', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'freepats-bagpipe');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.match(entry.author, /Gilles Sadowski \(performer and recording\)/);
  assert.match(entry.author, /Rémy Dubois \(instrument designer\)/);
  assert.match(entry.author, /Olle Geris \(instrument builder\)/);
  assert.equal(entry.source, 'https://github.com/freepats/bagpipe/tree/496f2f6e82f226d650e270c0f0ad5febbebec249');
  assert.ok(entry.bytes > 0);

  const manifestPath = fileURLToPath(new URL('../public/instruments/freepats-bagpipe/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/freepats-bagpipe/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.zones.length, 14);
  assert.ok(pack.zones.every((zone) => zone.loop));
  for (const [min, max] of [[36, 59], [64, 81]]) {
    for (let note = min; note <= max; note++) {
      assert.ok(pack.zones.some((zone) => zone.trigger !== 'release' && zone.lokey <= note && zone.hikey >= note), `MIDI ${note} is missing`);
    }
  }
  assert.equal(pack.zones.some((zone) => zone.lokey <= 60 && zone.hikey >= 60), false, 'Preserve the unmapped source gap below the melodic range.');
  const droneNotes = [43, 55];
  assert.ok(droneNotes.every((note) => pack.zones.some((zone) => zone.root === note && zone.loop)), 'The low and high G drones must remain mapped and looped.');

  const zoneSamples = [...new Set(pack.zones.map((zone) => zone.file))].sort();
  const encodedSamples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  assert.equal(encodedSamples.length, 14);
  assert.deepEqual(zoneSamples, encodedSamples);
  assert.equal(encodedSamples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/freepats-bagpipe/${file}`, import.meta.url))).size, 0), entry.bytes);

  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  const credits = readFileSync(creditsPath, 'utf8');
  assert.match(credits, /## FreePats Bagpipe in G\n\n- Attribution: Gilles Sadowski \(performer and recording\)/);
  const fetchScriptPath = fileURLToPath(new URL('../scripts/instruments/fetch-freepats-bagpipe.mjs', import.meta.url));
  const fetchScript = readFileSync(fetchScriptPath, 'utf8');
  assert.match(fetchScript, /260B9D95BB73DA7502FAD8603CB7409C249046D1EAFB9BF7FDF3D3FC56102633/);
  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_freepats_bagpipe');
  const spec = DEVICE_SPECS.find((item) => item.type === 'rec_freepats_bagpipe');
  assert.equal(device?.name, 'FreePats Bagpipe in G');
  assert.equal(spec?.engineConfig?.pack, 'freepats-bagpipe');
});

test('FreePats Concert Harp ships K. Smith performer credits, CC0 recordings, velocity layers, and MIDI 28-102 coverage', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'freepats-concert-harp');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.match(entry.author, /K\. Smith \(performer\)/);
  assert.match(entry.author, /Roberto \(sound-bank assembly\)/);
  assert.match(entry.author, /Versilian Studios LLC \(sample source\)/);
  assert.equal(entry.source, 'https://freepats.zenvoid.org/OrchestralStrings/harp.html');

  const manifestPath = fileURLToPath(new URL('../public/instruments/freepats-concert-harp/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/freepats-concert-harp/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.zones.length, 36);
  assert.equal(pack.zones.filter((zone) => zone.hivel === 90).length, 14);
  assert.equal(pack.zones.filter((zone) => zone.lovel === 91).length, 14);
  assert.ok(pack.zones.every((zone) => !zone.loop && zone.trigger !== 'release'));
  for (let note = 28; note <= 102; note++) {
    assert.ok(pack.zones.some((zone) => zone.lokey <= note && zone.hikey >= note), `MIDI ${note} is missing`);
  }
  const lowVelocity = matchingPackZones(pack, 60, 40, null, 'attack', 0, 0);
  const highVelocity = matchingPackZones(pack, 60, 110, null, 'attack', 0, 0);
  assert.equal(lowVelocity.length, 1);
  assert.equal(highVelocity.length, 1);
  assert.notEqual(lowVelocity[0]?.file, highVelocity[0]?.file);

  const samples = [...new Set(pack.zones.map((zone) => zone.file))].sort();
  const encodedSamples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  assert.equal(encodedSamples.length, 36);
  assert.deepEqual(samples, encodedSamples);
  assert.equal(encodedSamples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/freepats-concert-harp/${file}`, import.meta.url))).size, 0), entry.bytes);

  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  const credits = readFileSync(creditsPath, 'utf8');
  assert.match(credits, /## FreePats Concert Harp\n\n- Attribution: K\. Smith \(performer\)/);
  const fetchScriptPath = fileURLToPath(new URL('../scripts/instruments/fetch-freepats-harp.mjs', import.meta.url));
  const fetchScript = readFileSync(fetchScriptPath, 'utf8');
  assert.match(fetchScript, /7D3A77E4E9501D733A032CB7D93BC7567F47E4078325328EFE7B45FB03AC48AD/);
  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_freepats_concert_harp');
  const spec = DEVICE_SPECS.find((item) => item.type === 'rec_freepats_concert_harp');
  assert.equal(device?.name, 'FreePats Concert Harp');
  assert.equal(spec?.engineConfig?.pack, 'freepats-concert-harp');
});

test('FreePats Fingerstyle Electric Bass ships CC0 recordings and maps MIDI 26-45', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'freepats-fingerstyle-bass');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.match(entry.author, /Andrea Biasior \(recordings\)/);
  assert.match(entry.author, /Roberto \(sound-bank processing\)/);
  assert.equal(entry.source, 'https://freepats.zenvoid.org/ElectricGuitar/clean-electric-bass.html');

  const manifestPath = fileURLToPath(new URL('../public/instruments/freepats-fingerstyle-bass/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/freepats-fingerstyle-bass/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.zones.length, 12);
  assert.ok(pack.zones.every((zone) => !zone.loop && zone.trigger !== 'release'));
  for (let note = 26; note <= 45; note++) {
    assert.ok(pack.zones.some((zone) => zone.lokey <= note && zone.hikey >= note), `MIDI ${note} is missing`);
  }

  const samples = [...new Set(pack.zones.map((zone) => zone.file))].sort();
  const encodedSamples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  assert.equal(encodedSamples.length, 12);
  assert.deepEqual(samples, encodedSamples);
  assert.equal(encodedSamples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/freepats-fingerstyle-bass/${file}`, import.meta.url))).size, 0), entry.bytes);

  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  const credits = readFileSync(creditsPath, 'utf8');
  assert.match(credits, /## FreePats Fingerstyle Electric Bass\n\n- Attribution: Andrea Biasior \(recordings\)/);
  const fetchScriptPath = fileURLToPath(new URL('../scripts/instruments/fetch-freepats-bass.mjs', import.meta.url));
  const fetchScript = readFileSync(fetchScriptPath, 'utf8');
  assert.match(fetchScript, /36F87EC9EB086EF25050312522AACF71213C582F46989E0C5A12681304596587/);
  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_freepats_fingerstyle_bass');
  const spec = DEVICE_SPECS.find((item) => item.type === 'rec_freepats_fingerstyle_bass');
  assert.equal(device?.name, 'FreePats Fingerstyle Electric Bass');
  assert.equal(spec?.engineConfig?.pack, 'freepats-fingerstyle-bass');
});

test('Pianet T and Wurlitzer packs preserve CC BY credits and sampled key coverage', () => {
  const packs = [
    { id: 'pianet-t', name: 'Hohner Pianet T', min: 29, max: 88, zones: 49, samples: 49 },
    { id: 'wurlitzer-ep200', name: 'Wurlitzer EP200', min: 33, max: 96, zones: 48, samples: 45 },
  ];
  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  const credits = readFileSync(creditsPath, 'utf8');

  for (const expected of packs) {
    const entry = INSTRUMENT_PACKS.find((pack) => pack.id === expected.id);
    assert.ok(entry, `${expected.name} is missing from the instrument catalog`);
    assert.equal(entry.spdx, 'CC-BY-3.0');
    assert.match(entry.author, /Greg Sullivan \(instrument\)/);
    assert.match(entry.author, /kinwie \(SFZ mapping\)/);
    assert.match(entry.source, /GregSullivan\.E-Pianos\/tree\/master/);
    const packPath = fileURLToPath(new URL(`../public/instruments/${expected.id}/instrument.json`, import.meta.url));
    const sampleDirectory = fileURLToPath(new URL(`../public/instruments/${expected.id}/samples/`, import.meta.url));
    const pack = JSON.parse(readFileSync(packPath, 'utf8')) as {
      bytes: number;
      license: { notes?: string };
      zones: { file: string; lokey: number; hikey: number }[];
    };
    assert.ok(pack.bytes > 0);
    assert.match(pack.license.notes ?? '', /does not separately identify the sample performer/);
    assert.equal(pack.zones.length, expected.zones);
    const sampleFiles = [...new Set(pack.zones.map((zone) => zone.file))].sort();
    const encodedSamples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
    assert.equal(encodedSamples.length, expected.samples);
    assert.deepEqual(sampleFiles, encodedSamples);
    assert.deepEqual(
      [Math.min(...pack.zones.map((zone) => zone.lokey)), Math.max(...pack.zones.map((zone) => zone.hikey))],
      [expected.min, expected.max],
    );
    for (let note = expected.min; note <= expected.max; note++) {
      assert.ok(pack.zones.some((zone) => note >= zone.lokey && note <= zone.hikey), `${expected.name} is missing MIDI note ${note}`);
    }
    assert.match(credits, new RegExp(`## ${expected.name}[\\s\\S]+- License: CC-BY-3\\.0`));
  }
});

test('VSCO solo violin articulation pack ships CC0 recordings and keyswitch metadata', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'vsco-solo-violin-articulations');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.match(entry.source, /VSCO-2-CE\/tree\/SFZ/);
  assert.deepEqual(entry.articulations?.map((articulation) => [articulation.label, articulation.keyswitch, articulation.default]), [
    ['C2 Sustain Vibrato', 36, true],
    ['C#2 Tremolo', 37, false],
    ['D2 Spiccato', 38, false],
    ['D#2 Pizzicato', 39, false],
  ]);

  const manifestPath = fileURLToPath(new URL('../public/instruments/vsco-solo-violin-articulations/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/vsco-solo-violin-articulations/samples/', import.meta.url));
  const pack = JSON.parse(readFileSync(manifestPath, 'utf8')) as { zones: { file: string }[]; articulations: { label: string }[]; bytes: number };
  const samples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg'));
  assert.equal(pack.zones.length, 127);
  assert.equal(samples.length, 127);
  assert.ok(pack.bytes > 0);
  assert.deepEqual(pack.articulations.map((articulation) => articulation.label), entry.articulations?.map((articulation) => articulation.label));
  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  assert.match(readFileSync(creditsPath, 'utf8'), /## VSCO Solo Violin Articulations\n\n- Attribution: Sam Gossner, Simon Dalzell, Elan Hickler \/ Versilian Studios\n- License: CC0-1\.0/);
});

test('Chemnitzer Concertina ships CC0 attack layers and release-trigger samples', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'tomiak-chemnitzer-chemnitzer');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'keys');
  assert.equal(entry.author, 'Josh Tomiak');
  assert.equal(entry.source, 'https://tomiakchemnitzer.com/digital-instrument/');
  assert.match(entry.description, /three attack velocity layers and release samples/i);
  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_tomiak_chemnitzer_chemnitzer');
  assert.equal(device?.name, 'Chemnitzer Concertina');
  assert.match(device?.desc ?? '', /Recorded Chemnitzer concertina/i);

  const manifestPath = fileURLToPath(new URL('../public/instruments/tomiak-chemnitzer-chemnitzer/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/tomiak-chemnitzer-chemnitzer/samples/', import.meta.url));
  const pack = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    zones: { file: string; lokey: number; hikey: number; lovel: number; hivel: number; trigger?: string }[];
    bytes: number;
  };
  const attackZones = pack.zones.filter((zone) => zone.trigger !== 'release');
  const releaseZones = pack.zones.filter((zone) => zone.trigger === 'release');
  const velocityLayers = [...new Set(attackZones.map((zone) => `${zone.lovel}-${zone.hivel}`))];

  assert.equal(attackZones.length, 75);
  assert.equal(releaseZones.length, 25);
  assert.deepEqual(velocityLayers, ['1-20', '21-45', '46-127']);
  for (const note of Array.from({ length: 51 }, (_, index) => index + 40)) {
    assert.ok(attackZones.some((zone) => note >= zone.lokey && note <= zone.hikey), `attack is missing MIDI note ${note}`);
    assert.ok(releaseZones.some((zone) => note >= zone.lokey && note <= zone.hikey), `release is missing MIDI note ${note}`);
  }

  const zoneSamples = [...new Set(pack.zones.map((zone) => zone.file))].sort();
  const encodedSamples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  assert.equal(pack.zones.length, 100);
  assert.ok(pack.bytes > 0);
  assert.deepEqual(zoneSamples, encodedSamples);
});

test('Button Accordion HN ships pinned CC0 musician recordings with tuned sustain and release zones', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'button-accordion-hn');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'keys');
  assert.match(entry.author, /Jeff Stauffer \(recordings\)/);
  assert.match(entry.author, /michael02022 \(SFZ processing and sound bank\)/);
  assert.equal(entry.source, 'https://github.com/freepats/button-accordion-HN/tree/d70d16456fd99305d1c24c612b205ab38846eb0f');
  assert.match(entry.description, /Hohner button accordion by Jeff Stauffer/i);

  const manifestPath = fileURLToPath(new URL('../public/instruments/button-accordion-hn/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/button-accordion-hn/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  const attackZones = pack.zones.filter((zone) => zone.trigger !== 'release');
  const releaseZones = pack.zones.filter((zone) => zone.trigger === 'release');
  assert.equal(attackZones.length, 17);
  assert.equal(releaseZones.length, 17);
  assert.ok(attackZones.every((zone) => zone.loop));
  assert.equal(attackZones[0]?.lokey, 47);
  assert.equal(attackZones[0]?.root, 47, 'clipping the first SFZ region must preserve its B3 sample root');

  for (const note of Array.from({ length: 45 }, (_, index) => index + 47)) {
    assert.ok(attackZones.some((zone) => note >= zone.lokey && note <= zone.hikey), `attack is missing MIDI note ${note}`);
    assert.ok(releaseZones.some((zone) => note >= zone.lokey && note <= zone.hikey), `release is missing MIDI note ${note}`);
  }

  const samples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  const zoneSamples = [...new Set(pack.zones.map((zone) => zone.file))].sort();
  assert.equal(pack.zones.length, 34);
  assert.equal(samples.length, 34);
  assert.deepEqual(zoneSamples, samples);
  assert.equal(pack.bytes, entry.bytes);

  const credits = readFileSync(fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url)), 'utf8');
  assert.match(credits, /## Button Accordion HN\n\n- Attribution: Jeff Stauffer \(recordings\); Piotr Barz \(contributor\); michael02022 \(SFZ processing and sound bank\)\n- License: CC0-1\.0/);
});

test('Virtuosity Drums ships CC0 recordings performed by Austin McMahon with the source MIDI map', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'virtuosity-drums');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.match(entry.author, /Austin McMahon \(drummer\)/);
  assert.match(entry.author, /Versilian Studios & Karoryfer Samples/);
  assert.equal(entry.source, 'https://github.com/sfzinstruments/virtuosity_drums/tree/9f04cf9a734527edfbb0a4eee1f674e45bbf71bc');
  assert.deepEqual(entry.lanes?.map(({ name, note }) => [name, note]), [
    ['Kick', 36],
    ['Snare', 38],
    ['Side Stick', 37],
    ['Open Hat', 42],
    ['Pedal Hat', 44],
    ['Low Tom', 41],
    ['High Tom', 48],
    ['Crash', 49],
    ['Ride', 51],
    ['Ride Bell', 53],
    ['Snare Roll', 96],
  ]);

  const manifestPath = fileURLToPath(new URL('../public/instruments/virtuosity-drums/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/virtuosity-drums/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  const samples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  const zoneSamples = [...new Set(pack.zones.map((zone) => zone.file).filter(Boolean))].sort();

  assert.equal(pack.zones.length, 92);
  assert.equal(samples.length, 91);
  assert.equal(pack.bytes, entry.bytes);
  assert.ok(pack.bytes > 0);
  assert.deepEqual(zoneSamples, samples);
  const rollLayers = pack.zones.filter((zone) => zone.lokey === 96 && zone.hikey === 96 && zone.modWheelFade);
  assert.equal(rollLayers.length, 15);
  assert.ok(rollLayers.every((zone) => zone.loop && zone.modWheelFade?.default === 31));
  for (const lane of entry.lanes ?? []) {
    assert.ok(pack.zones.some((zone) => lane.note >= zone.lokey && lane.note <= zone.hikey), `missing MIDI pad ${lane.note}`);
  }

  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  assert.match(readFileSync(creditsPath, 'utf8'), /## Virtuosity Drums\n\n- Attribution: Austin McMahon \(drummer\); Versilian Studios & Karoryfer Samples \(library\)\n- License: CC0-1\.0/);
});

test('Fashionbass ships D. Smolken performance recordings with velocity and round-robin coverage', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'fashionbass');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'bass');
  assert.match(entry.author, /D\. Smolken \(performer and mapper\)/);
  assert.equal(entry.source, 'https://github.com/sfzinstruments/karoryfer.fashionbass');
  assert.match(entry.description, /three velocity layers and two round robins/i);

  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_fashionbass');
  assert.equal(device?.name, 'Fashionbass');

  const manifestPath = fileURLToPath(new URL('../public/instruments/fashionbass/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/fashionbass/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  const samples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  const zoneSamples = [...new Set(pack.zones.map((zone) => zone.file).filter(Boolean))].sort();

  assert.equal(pack.zones.length, 90);
  assert.equal(samples.length, 90);
  assert.equal(pack.bytes, entry.bytes);
  assert.deepEqual(zoneSamples, samples);
  assert.equal(Math.min(...pack.zones.map((zone) => zone.lokey)), 28);
  assert.equal(Math.max(...pack.zones.map((zone) => zone.hikey)), 72);
  for (let note = 28; note <= 72; note++) {
    assert.ok(pack.zones.some((zone) => note >= zone.lokey && note <= zone.hikey), `missing playable MIDI note ${note}`);
  }
  assert.deepEqual([...new Set(pack.zones.map((zone) => `${zone.lovel}-${zone.hivel}`))].sort(), ['1-65', '66-85', '86-127']);
  assert.deepEqual([...new Set(pack.zones.map((zone) => `${zone.lorand}-${zone.hirand}`))].sort(), ['0-0.5', '0.5-1']);

  const creditsPath = fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url));
  assert.match(readFileSync(creditsPath, 'utf8'), /## Fashionbass\n\n- Attribution: D\. Smolken \(performer and mapper\); Karoryfer Samples\n- License: CC0-1\.0/);
});

test('Shinyguitar Archtop ships CC0 recordings performed and mapped by D. Smolken', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'shinyguitar-acoustic');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'guitar');
  assert.match(entry.author, /D\. Smolken \(performer and mapper\)/);
  assert.match(entry.author, /Karoryfer Samples/);
  assert.match(entry.source, /sfzinstruments\/karoryfer\.shinyguitar/);
  assert.match(entry.description, /recorded archtop guitar/i);

  const manifestPath = fileURLToPath(new URL('../public/instruments/shinyguitar-acoustic/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/shinyguitar-acoustic/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.zones.length, 64);
  assert.equal(pack.license.spdx, 'CC0-1.0');
  assert.match(pack.license.notes ?? '', /CC 100.*100\/127/i);
  for (let note = 40; note <= 84; note++) {
    assert.ok(pack.zones.some((zone) => zone.lokey <= note && zone.hikey >= note), `MIDI ${note} has no sample zone`);
  }
  const sampleFiles = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).sort();
  const zoneFiles = [...new Set(pack.zones.map((zone) => zone.file))].map((file) => file.split('/').at(-1) ?? '').sort();
  assert.equal(sampleFiles.length, 64);
  assert.deepEqual(zoneFiles, sampleFiles);
  assert.equal(sampleFiles.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/shinyguitar-acoustic/samples/${file}`, import.meta.url))).size, 0), entry.bytes);

  const rackDevice = DEVICE_SPECS.find((device) => device.type === 'rec_shinyguitar_acoustic');
  assert.equal(rackDevice?.engine, 'multisample');
  assert.equal(rackDevice?.engineConfig?.pack, 'shinyguitar-acoustic');
  const credits = readFileSync(fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url)), 'utf8');
  assert.match(credits, /## Shinyguitar Archtop\n\n- Attribution: D\. Smolken \(performer and mapper\); Karoryfer Samples/);
});

test('Bear Sax ships the CC0 baritone sax recording with labeled keyswitch articulations', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'bear-sax');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'saxophone');
  assert.match(entry.author, /Karoryfer Lecolds/);
  assert.match(entry.source, /karoryfer\.bear-sax/);
  assert.match(entry.description, /1926 Conn baritone saxophone/i);
  assert.ok(entry.bytes > 0);

  const manifestPath = fileURLToPath(new URL('../public/instruments/bear-sax/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/bear-sax/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.deepEqual(pack.articulations?.map((articulation) => articulation.label), ['sustain', 'staccato', 'growl', 'sub', 'marcato']);
  assert.ok(pack.zones.every((zone) => zone.lokey >= 40 && zone.hikey <= 68));
  const samples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg'));
  assert.equal(samples.length, 141);
  assert.equal(samples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/bear-sax/samples/${file}`, import.meta.url))).size, 0), entry.bytes);
});

test('FreePats Ocarina ships pinned CC0 performances with looping coverage for MIDI 60–92', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'freepats-ocarina');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'winds');
  assert.match(entry.author, /Xavimart \(Javier\), Gonzalo, and Roberto/);
  assert.match(entry.author, /performance and recording/);
  assert.equal(entry.source, 'https://github.com/freepats/ocarina1/tree/241bdfde388624d9ea598ac183c3e50071c89924');
  assert.match(entry.description, /real ocarina recordings/i);
  assert.ok(isRedistributable(entry.spdx));

  const manifestPath = fileURLToPath(new URL('../public/instruments/freepats-ocarina/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/freepats-ocarina/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.zones.length, 12);
  assert.ok(pack.zones.every((zone) => zone.loop && zone.release === 0.4));
  for (let note = 60; note <= 92; note++) {
    assert.ok(pack.zones.some((zone) => zone.lokey <= note && zone.hikey >= note), `MIDI ${note} has no ocarina zone`);
  }

  const zoneSamples = [...new Set(pack.zones.map((zone) => zone.file))].sort();
  const encodedSamples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg')).map((file) => `samples/${file}`).sort();
  assert.equal(encodedSamples.length, 12);
  assert.deepEqual(zoneSamples, encodedSamples);
  assert.equal(encodedSamples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/freepats-ocarina/${file}`, import.meta.url))).size, 0), entry.bytes);

  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_freepats_ocarina');
  assert.equal(device?.name, 'FreePats Ocarina');
  const spec = DEVICE_SPECS.find((item) => item.type === 'rec_freepats_ocarina');
  assert.equal(spec?.engine, 'multisample');
  assert.equal(spec?.engineConfig?.pack, 'freepats-ocarina');
  const credits = readFileSync(fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url)), 'utf8');
  assert.match(credits, /## FreePats Ocarina\n\n- Attribution: Xavimart \(Javier\), Gonzalo, and Roberto \(performance and recording\); FreePats\n- License: CC0-1\.0/);
  assert.match(credits, /Source revision 241bdfde388624d9ea598ac183c3e50071c89924/);
});

test('VCSL Pipe Organ ships Simon Dalzell real-organ recordings within the sampled range', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'vcsl-pipe-organ');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'organ');
  assert.match(entry.author, /Simon Dalzell \(recordist\)/);
  assert.match(entry.source, /sgossner\/VCSL/);

  const manifestPath = fileURLToPath(new URL('../public/instruments/vcsl-pipe-organ/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/vcsl-pipe-organ/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.equal(pack.zones.length, 21);
  assert.ok(pack.zones.every((zone) => zone.lokey >= 24 && zone.hikey <= 84 && zone.loop));
  for (let note = 24; note <= 84; note++) {
    assert.ok(pack.zones.some((zone) => zone.lokey <= note && zone.hikey >= note), `MIDI ${note} has no recorded zone`);
  }
  const samples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg'));
  assert.equal(samples.length, 21);
  assert.equal(samples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/vcsl-pipe-organ/samples/${file}`, import.meta.url))).size, 0), entry.bytes);

  const rackDevice = DEVICE_SPECS.find((device) => device.type === 'rec_vcsl_pipe_organ');
  assert.equal(rackDevice?.engine, 'multisample');
  assert.equal(rackDevice?.engineConfig?.pack, 'vcsl-pipe-organ');
  const credits = readFileSync(fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url)), 'utf8');
  assert.match(credits, /## VCSL Pipe Organ\n\n- Attribution: Simon Dalzell \(recordist\); Versilian Studios LLC \(VCSL\)/);
});

test('VSCO cello ensemble pack ships four CC0 articulations with keyswitch and sample coverage', () => {
  const entry = INSTRUMENT_PACKS.find((pack) => pack.id === 'vsco-cello-ensemble-articulations');
  assert.ok(entry);
  assert.equal(entry.spdx, 'CC0-1.0');
  assert.equal(entry.category, 'strings');
  assert.match(entry.source, /VSCO-2-CE\/tree\/6dd651d55dde97fd4028699be9d4481f26917891/);
  assert.equal(entry.bytes, 7_064_293);

  const manifestPath = fileURLToPath(new URL('../public/instruments/vsco-cello-ensemble-articulations/instrument.json', import.meta.url));
  const sampleDirectory = fileURLToPath(new URL('../public/instruments/vsco-cello-ensemble-articulations/samples/', import.meta.url));
  const pack = parsePack(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  assert.ok(pack);
  assert.deepEqual(pack.articulations?.map((articulation) => [articulation.label, articulation.keyswitch, articulation.default]), [
    ['C6 Sustain Vibrato', 84, true],
    ['C#6 Tremolo', 85, false],
    ['D6 Spiccato', 86, false],
    ['D#6 Pizzicato', 87, false],
  ]);
  assert.deepEqual([...new Set(pack.zones.map((zone) => zone.articulation))], ['ks-84', 'ks-85', 'ks-86', 'ks-87']);
  assert.ok(pack.zones.every((zone) => zone.lokey >= 36 && zone.hikey <= 76));
  for (const articulation of pack.articulations ?? []) {
    for (let note = 36; note <= 76; note++) {
      assert.ok(pack.zones.some((zone) => zone.articulation === articulation.id && zone.lokey <= note && zone.hikey >= note), `${articulation.label} has no zone for MIDI ${note}`);
    }
  }

  const samples = readdirSync(sampleDirectory).filter((file) => file.endsWith('.ogg'));
  assert.equal(pack.zones.length, 155);
  assert.equal(samples.length, 155);
  assert.equal(samples.reduce((bytes, file) => bytes + statSync(fileURLToPath(new URL(`../public/instruments/vsco-cello-ensemble-articulations/samples/${file}`, import.meta.url))).size, 0), entry.bytes);
  const credits = readFileSync(fileURLToPath(new URL('../public/instruments/CREDITS.md', import.meta.url)), 'utf8');
  assert.match(credits, /## VSCO Cello Ensemble Articulations\n\n- Attribution: Sam Gossner and Simon Dalzell; Elan Hickler \/ Soundemote\n- License: CC0-1\.0/);
});
