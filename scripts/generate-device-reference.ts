import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BUILTIN_BY_TYPE } from '../shared/rack/builtinCatalog.ts';
import { DEVICE_SPECS, SPEC_BY_TYPE, specPorts } from '../shared/rack/devices/index.ts';
import { INSTRUMENT_CATEGORIES } from '../src/audio/instrumentCatalog.ts';
import { EFFECT_CATALOG } from '../src/audio/effectCatalog.ts';
import { packDeviceType } from '../shared/instruments/catalogTypes.ts';
import { INSTRUMENT_PACKS } from '../shared/instruments/catalog.ts';
import { matchSeedFunctionSummary, type SeedFunctionSummary } from './device-reference-matcher.ts';

const esc = (value: string): string => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
const rows: string[] = [];
const LEGACY_FACTORY_ROLES = new Map<string, string>([
  ['mimic', 'instrument'], ['spider_audio', 'utility'], ['spider_cv', 'utility'], ['sytrus', 'instrument'],
  ['flex', 'instrument'], ['tanpura', 'instrument'], ['subtractor', 'instrument'], ['thor', 'instrument'],
  ['third_wave', 'instrument'], ['europa', 'instrument'], ['monotone', 'instrument'], ['redrum', 'instrument'],
  ['matrix', 'utility'], ['pulsar', 'utility'], ['scream4', 'effect'], ['echo', 'effect'], ['rv7000', 'effect'],
  ['mclass_master', 'effect'], ['three_osc', 'instrument'], ['bansuri', 'instrument'], ['harmonium', 'instrument'],
  ['tabla', 'instrument'], ['dhol', 'instrument'], ['tumbi', 'instrument'], ['world_instrument', 'instrument'],
  ['percussion_electronic', 'instrument'], ['wyvern', 'instrument'], ['ember', 'instrument'], ['objekt', 'instrument'],
  ['reason_performance', 'instrument'], ['rv9', 'effect'], ['osmium', 'effect'], ['rotor', 'effect'],
  ['combinator', 'utility'], ['midi_out', 'utility'], ['mix_bus', 'utility'], ['audio_track', 'utility'],
]);
const audioEngineSource = await readFile(resolve(process.cwd(), 'src/audio/AudioEngine.ts'), 'utf8');
const sourceBlock = (startMarker: string, endMarker: string): string => {
  const start = audioEngineSource.indexOf(startMarker);
  const end = audioEngineSource.indexOf(endMarker, start);
  return start >= 0 && end > start ? audioEngineSource.slice(start, end) : '';
};
const switchTypes = (source: string): Set<string> => {
  const types = new Set<string>();
  for (const match of source.matchAll(/case\s+'([^']+)'/g)) if (match[1]) types.add(match[1]);
  return types;
};
const createFactoryTypes = switchTypes(sourceBlock('private createDeviceInner', '/** Mount a plugin-library plugin'));
const restoreFactoryTypes = switchTypes(sourceBlock('private instantiateDeviceOnContext', '// Native Uncompressed Audio Exporter'));
const hasLegacyImplementation = (type: string): boolean => createFactoryTypes.has(type) && restoreFactoryTypes.has(type);
type ReferenceRow = readonly [name: string, function: string];
type DirectoryCategory = 'Instruments' | 'Effects' | 'Utilities' | 'Players';
type ReportedDirectoryCategory = Exclude<DirectoryCategory, 'Players'>;
type DirectoryProduct = { name: string; developer: string; category: DirectoryCategory; version: string; released: string };
type DirectorySnapshot = {
  source: string;
  capturedOn: string;
  totalsLastCheckedOn: string;
  checkedReportedTotals: { rackExtensions: number; developers: number; categories: Record<ReportedDirectoryCategory, number> };
  reportedTotals: { rackExtensions: number; developers: number; categories: Record<ReportedDirectoryCategory, number> };
  extractedRows: number;
  products: DirectoryProduct[];
};
type ReasonStudiosCategory = 'Instruments' | 'Effects' | 'Player MIDI FX' | 'Utilities';
type ReasonStudiosDeviceSnapshot = {
  source: string;
  capturedOn: string;
  scopeNote: string;
  productCount: number;
  categoryCounts: Record<ReasonStudiosCategory, number>;
  products: { name: string; category: ReasonStudiosCategory; subtitle?: string }[];
};
const appendTable = (title: string, headers: readonly string[], data: readonly (readonly string[])[]): void => {
  rows.push('', `#### ${title}`, '', `| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of data) rows.push(`| ${row.map(esc).join(' | ')} |`);
};

const OFFICIAL_REFERENCES: Readonly<Record<string, readonly ReferenceRow[]>> = {
  Instruments: [
    ['Subtractor', 'Subtractive analog-style synthesis'], ['Thor', 'Modular-style synthesizer with multiple oscillator and filter types'],
    ['Europa', 'Wavetable synthesis and spectral shaping'], ['Malström', 'Graintable synthesis and evolving textures'],
    ['Polytone', 'Dual-layer analog-style polyphonic synthesis'], ['Algoritm', 'FM synthesis with flexible operator routing'],
    ['Complex-1', 'Modular synthesis with patchable audio and CV'], ['Parsec', 'Spectral and additive-style synthesis'],
    ['Parsec 2', 'Spectral and additive-style synthesis'],
    ['Objekt', 'Physical-modeling synthesis'], ['Friktion', 'Physical-modeling bowed-string instrument'],
    ['Grain', 'Granular sample manipulation'], ['Scenic', 'Hybrid sampled textures and soundscapes'],
    ['Mimic', 'Creative multi-mode sampler'], ['NN-XT', 'Advanced multisample instrument'], ['NN19', 'Basic sample playback and key mapping'],
    ['Dr. Octo Rex', 'Sliced-loop playback and manipulation'], ['Redrum', 'Step-based drum machine'],
    ['Kong', 'Drum designer with synthesis and sample engines'], ['Rytmik', 'Drum machine and rhythm programming'],
    ['Umpf Club Drums', 'Electronic club drum sounds'], ['Umpf Retro Beats', 'Vintage drum-machine sounds'],
    ['Reason Drum Kits', 'Acoustic drum-kit sampling'], ['Monotone', 'Monophonic bass synthesis'],
    ['Reason Electric Bass', 'Sampled electric bass instrument'], ['Radical Piano', 'Acoustic piano modeling and sampling'],
    ['Radical Keys', 'Electric keyboard instruments'], ['Processed Pianos', 'Processed and experimental piano textures'],
    ['Layers', 'Layered sampled keyboard and instrument sounds'], ['Layers Wave Edition', 'Wave-based layered instrument'],
    ['Humana', 'Sampled human vocal ensembles'], ['Klang', 'Tuned percussion'], ['Pangea', 'World instrument collection'],
    ['ID8', 'General-purpose songwriting instrument'], ['MIDI Out Device', 'Sends note and control data to external MIDI destinations'],
  ],
  Effects: [
    ['RV-7', 'Basic digital reverb'], ['RV-9', 'Modern multi-algorithm reverb'], ['RV7000 MkII', 'Advanced reverb and convolution processing'],
    ['The Echo', 'Stereo delay with filtering, feedback, and modulation'], ['Ripley', 'Creative space delay'], ['DDL-1', 'Basic digital delay'],
    ['Scream 4', 'Distortion, saturation, and sound destruction'], ['Pulveriser', 'Compression, distortion, filtering, and modulation'],
    ['Osmium', 'Multi-character distortion'], ['D-11', 'Foldback distortion'], ['Audiomatic', 'Retro sound coloration'],
    ['Softube Amp', 'Guitar amplifier and cabinet simulation'], ['Softube Bass Amp', 'Bass amplifier simulation'],
    ['MClass Compressor', 'Dynamics compression'], ['MClass Maximizer', 'Mastering loudness limiting'],
    ['MClass Equalizer', 'Four-band tonal equalization'], ['MClass Stereo Imager', 'Stereo-width processing'],
    ['COMP-01', 'Compressor and limiter'], ['Master Bus Compressor', 'Mix-bus dynamics'], ['Channel EQ', 'Mixer channel equalization'],
    ['Channel Dynamics', 'Mixer channel dynamics'], ['Sidechain Tool', 'Sidechain-based dynamic volume shaping'],
    ['Stereo Tool', 'Stereo manipulation'], ['PEQ-2', 'Two-band parametric equalizer'], ['ECF-42', 'Envelope-controlled filter'],
    ['Alligator', 'Rhythmic triple-filter gate'], ['CF-101', 'Chorus and flanging'], ['PH-90', 'Phaser'],
    ['Quartet', 'Multi-mode chorus ensemble'], ['Rotor', 'Rotary speaker simulation'], ['Sweeper', 'Filter and modulation effect'],
    ['Synchronous', 'Pattern-based modulation processor'], ['UN-16', 'Unison and stereo thickening'], ['BV512', 'Vocoder'],
    ['BV-X', 'Multimode vocoder'], ['Neptune', 'Vocal pitch correction and harmonization'], ['Polar', 'Dual pitch shifting'],
  ],
  'Players & utilities': [
    ['Scales & Chords', 'Constrains notes to scales and creates chords'], ['Chord Sequencer', 'Programs chord progressions'],
    ['Beat Map', 'Generates and transforms drum patterns'], ['Drum Sequencer', 'Step sequencing for drum instruments'],
    ['Arpeggio Lab', 'Advanced arpeggio generation'], ['Dual Arpeggio', 'Dual-layer arpeggiator'],
    ['Bassline Generator', 'Generates bass phrases'], ['Note Echo', 'Repeats MIDI notes rhythmically'],
    ['Note Tool', 'Note transformations'], ['Random Tool', 'Randomizes musical note parameters'],
    ['Pattern Mutator', 'Mutates patterns into variations'], ['PolyStep', 'Polyphonic step sequencing'],
    ['Quad Note Generator', 'Multi-lane note generation'], ['Combinator', 'Combines devices into a controllable rack'],
    ['Pulsar', 'Dual LFO and modulation'], ['Matrix', 'Pattern and CV sequencing'],
    ['RPG-8', 'Monophonic arpeggiator'], ['Spider Audio', 'Splits and merges audio signals'],
    ['Spider CV', 'Splits and merges control voltages'], ['Mixer 14:2', 'Fourteen-channel rack mixer'],
    ['Line Mixer 6:2', 'Compact six-channel rack mixer'], ['Gain Tool', 'Gain adjustment and signal-level control'],
  ],
};
const VERIFIED_FIRST_PARTY_SHOP_LISTINGS = new Map<string, string>([
  ['Complex-1', 'https://www.reasonstudios.com/shop/rack-extension/complex-1-modular-synthesizer/'],
  ['Parsec', 'https://www.reasonstudios.com/shop/rack-extension/parsec-spectral-synthesizer/'],
]);
const VERIFIED_FIRST_PARTY_DOCS = new Map<string, string>([
  ['Softube Amp', 'https://docs.reasonstudios.com/reason14/softube-amps'],
  ['Softube Bass Amp', 'https://docs.reasonstudios.com/reason14/softube-amps'],
  ['Scales & Chords', 'https://docs.reasonstudios.com/reason13/working-with-players'],
  ['Chord Sequencer', 'https://docs.reasonstudios.com/plusre/chord-sequencer-player'],
  ['Beat Map', 'https://docs.reasonstudios.com/reason13/working-with-players'],
  ['Drum Sequencer', 'https://docs.reasonstudios.com/plusre/drum-sequencer-player'],
  ['Arpeggio Lab', 'https://docs.reasonstudios.com/plusre/arpeggio-lab-player'],
  ['Dual Arpeggio', 'https://docs.reasonstudios.com/reason13/working-with-players'],
  ['Bassline Generator', 'https://docs.reasonstudios.com/plusre/bassline-generator-player'],
  ['Note Echo', 'https://docs.reasonstudios.com/reason13/working-with-players'],
  ['Note Tool', 'https://docs.reasonstudios.com/reason13/working-with-players'],
  ['Random Tool', 'https://docs.reasonstudios.com/reason13/working-with-players'],
  ['Pattern Mutator', 'https://docs.reasonstudios.com/plusre/pattern-mutator-player'],
  ['PolyStep', 'https://docs.reasonstudios.com/plusre/polystep-sequencer-player'],
  ['Quad Note Generator', 'https://docs.reasonstudios.com/plusre/quad-note-generator-player'],
]);
const THIRD_PARTY_REFERENCES: readonly (readonly [developer: string, product: string, function: string])[] = [
  ['AudioRealism', 'ABL3 Computer Bassline', 'Analog-style acid bass synthesizer'], ['AudioRealism', 'ReDominator', 'Vintage polyphonic synthesizer'],
  ['Blamsoft', 'Expanse Hyperwave', 'Hyperwave synthesis and sound design'], ['Blamsoft', 'VK-1 Viking', 'Analog-style subtractive synthesizer'],
  ['Blamsoft', 'VK-2 Viking', 'Expanded analog-style synthesis'], ['Blamsoft', 'Zero Hybrid', 'Hybrid synthesizer'],
  ['Blamsoft', 'VO-1 Viking Oscillator', 'Oscillator-based sound generation'], ['Blamsoft', 'Movement', 'Waveform generation'],
  ['DNA Labs', 'Aquios X4', 'Workstation-style ROM instrument'], ['DNA Labs', 'Glacius X', 'Hybrid wave synthesizer'],
  ['DNA Labs', 'Helium', 'Multi-sound instrument workstation'], ['DNA Labs', 'Hydronexius', 'Workstation ROM instrument'],
  ['DNA Labs', 'Morphine 8', 'Digital drum module'], ['Ekssperimental Sounds', 'AMALGAM', 'FM and subtractive synthesis'],
  ['Ekssperimental Sounds', 'ES-01 / ES10 / ES101', 'Analog-style synthesizers'], ['Ekssperimental Sounds', 'ES400', 'FM synthesis'],
  ['Ekssperimental Sounds', 'SineSynth', 'Sine-wave synthesis'], ['Ekssperimental Sounds', 'SquareSwarm', 'Square-wave-based synthesis'],
  ['Ekssperimental Sounds', 'VibeMaster', 'Lo-fi synthesis'], ['Ekssperimental Sounds', 'Wave Master', 'Wave-based synthesis'],
  ['Kilohearts', 'kHs ONE', 'Subtractive virtual-analog synthesis'], ['KORG', 'MonoPoly', 'Four-oscillator analog synthesizer'],
  ['KORG', 'Polysix', 'Vintage polyphonic synthesizer'], ['Inphonik', 'RYM2612', 'Retro FM synthesis'], ['Inphonik', 'RX1200', '12-bit sampler'],
  ['GForce Software', 'ChamberTron', 'Vintage tape-keyboard sounds'], ['GForce Software', 'Re-Tron', 'Tape-based keyboard instrument'],
  ['GForce Software', 'Re-Strings', 'Vintage string-machine sounds'], ['Rob Papen', 'SubBoomBassRE', 'Electronic bass synthesis'],
  ['Rob Papen', 'Vecto', 'Vector synthesis'], ['Rob Papen', 'Quad', 'Multi-engine synthesizer'],
  ['Rob Papen', 'PunchBDRE', 'Synthesized kick drum'], ['Rob Papen', 'RGRE', 'Rhythm-guitar generation'],
  ['Lectric Panda', 'Nostromo', 'Spectral synthesis'], ['Lectric Panda', 'Rostnomo', 'Randomized synthesis'],
  ['Lectric Panda', 'Torsion', 'Texture generation'], ['Jiggery-Pokery', 'Champagne SuperNova', 'Vintage-style synthesizer'],
  ['Jiggery-Pokery', 'Harpe Laser II', 'Synthesizer'], ['Jiggery-Pokery', 'JPS Harmonic', 'Harmonic synthesis'],
  ['Jiggery-Pokery', 'Transcendent 2000', 'Vintage analog-style synthesis'], ['SKP Sound Design', 'Aura-7', 'Cinematic atmospheres'],
  ['SKP Sound Design', 'Zoetrope', 'Organic synthesis'], ['Skrock Music', 'Argonaut / Aurora / Cobra', 'Synthesizer and hybrid-synthesis family'],
  ['Heavyocity', 'AEON Organic', 'Cinematic organic instruments'], ['Heavyocity', 'AEON Synth', 'Cinematic synthesized instruments'],
  ['Impact Soundworks', 'Super Audio Cart', 'Retro video-game instrument sounds'], ['e-instruments', 'StringWERK', 'Sampled string ensemble'],
  ['J Chris Griffin', 'S73 Electric Piano', 'Electric piano'], ['J Chris Griffin', 'Studio Piano', 'Acoustic piano'],
  ['J Chris Griffin', 'SAW-1', 'Sawtooth-wave synthesis'], ['J Chris Griffin', 'Keyboard Foundry', 'Keyboard instrument collection'],
  ['FXpansion', 'Tres', 'Monophonic synthesizer'], ['LoveOne', 'Vibro', 'Wavetable synthesis'], ['MagmaSonic', 'Soma', 'Synthesizer'],
  ['Ekssperimental Sounds', 'DM-999', 'Drum machine'], ['Ekssperimental Sounds', 'DRUMSYN', 'Drum synthesis'],
  ['Ekssperimental Sounds', 'SYNR', 'Drum synthesizer'], ['Ekssperimental Sounds', 'TRANSISTOR', 'Drum machine'],
  ['Haaswerk', 'Drumstix', 'Drum computer'], ['Haaswerk', 'PSYH Kick Bass Commander', 'Kick and bass generation'],
  ['Haaswerk', 'Psychedelic Haas Sample Slice Unit', 'Sample slicing'], ['Lectric Panda', 'Propulsion', 'Drum sequencing'],
  ['Jiggery-Pokery', 'Republik', 'Hand percussion'], ['Jiggery-Pokery', 'barCHIMES', 'Concert mark-tree percussion'],
  ['Jiggery-Pokery', 'Melodic Electric Glockenspiel', 'Tuned percussion'], ['Josh Levy', 'BOOM 808', '808-style percussion synthesis'],
  ['DOODOV DIGITAL DESIGN', 'Refrain', 'Live-looping sampler'],
  ['Kuassa', 'Amplifikation family', 'Guitar amplifier modeling'],
  ['Kuassa', 'Amplifikation Creme Guitar Amp', 'High-gain guitar amp and cabinet simulation'],
  ['Kuassa', 'Cerberus Bass Amp (Cerberus Bass Amplifikation)', 'Three-channel bass amp with cabinets and EQ'],
  ['Kuassa Efektor', 'OD3603 Overdrive', 'Overdrive'], ['Kuassa Efektor', 'DS3603 Distortion', 'Distortion'],
  ['Kuassa Efektor', 'FZ3603 Fuzz', 'Fuzz'], ['Kuassa Efektor', 'CH3604 Chorus', 'Chorus'],
  ['Kuassa Efektor', 'FL3606 Flanger', 'Flanger'], ['Kuassa Efektor', 'PH3605 Phaser', 'Phaser'],
  ['Kuassa Efektor', 'TR3604 Tremolo', 'Tremolo'], ['Kuassa Efektor', 'RV3604 Reverb', 'Reverb'],
  ['Kuassa Efektor', 'DL3606 Delay', 'Delay'], ['Kuassa Efektor', 'WF3607 Wah Filter', 'Wah and filter'],
  ['Kuassa Efektor', 'CP3603 Compressor', 'Compressor'], ['Kuassa Efektor', 'Efektor Silencer Noise Gate', 'Noise gate'],
  ['Kuassa Efektor', 'Gainia family', 'Guitar preamp and overdrive family'],
  ['Kuassa Efektor', 'Gainia TD Preamp', 'Tube-driven guitar preamp'],
  ['Kuassa', 'Pillar Power Amp', 'Free tube power amp and cabinet simulator'],
  ['Kuassa Efektor', 'Whammo Pitch Shifter', 'Pitch shifting and bending'],
  ['Kuassa Efektor', 'Grandmaster Distortion', 'Three-mode overdrive and distortion'],
  ['Kuassa', 'Amplifikation Matchlock Guitar Amp', 'American-style guitar amp simulation'],
  ['Softube', 'Saturation Knob', 'Harmonic saturation'],
  ['Robotic Bean', 'Resonans Physical Synthesizer', 'Physical modeling using modal resonator, inharmonic string, and FM engines'],
  ['Synapse Audio', 'Antidote', 'Virtual-analog synthesizer with oscillator stacks, modulation, and effects'],
];
const VERIFIED_REASON_SHOP_LISTINGS = new Map<string, string>([
  ['AudioRealism|ABL3 Computer Bassline', 'https://www.reasonstudios.com/shop/rack-extension/abl3-computer-bassline/'],
  ['AudioRealism|ReDominator', 'https://www.reasonstudios.com/shop/rack-extension/redominator-polyphonic-synthesizer/'],
  ['Blamsoft|Expanse Hyperwave', 'https://www.reasonstudios.com/shop/rack-extension/expanse-hyperwave-synthesizer/'],
  ['Blamsoft|VK-1 Viking', 'https://www.reasonstudios.com/shop/rack-extension/vk-1-viking-synthesizer/'],
  ['Blamsoft|VK-2 Viking', 'https://www.reasonstudios.com/shop/rack-extension/vk-2-viking-synthesizer/'],
  ['Blamsoft|Zero Hybrid', 'https://www.reasonstudios.com/shop/rack-extension/zero-hybrid-synthesizer/'],
  ['DNA Labs|Hydronexius', 'https://www.reasonstudios.com/shop/rack-extension/hydronexius-workstation-rom/'],
  ['DNA Labs|Glacius X', 'https://www.reasonstudios.com/shop/rack-extension/glacius-x-hybrid-wave-synthesizer/'],
  ['Lectric Panda|Nostromo', 'https://www.reasonstudios.com/shop/rack-extension/nostromo-spectral-synthesizer/'],
  ['Kilohearts|kHs ONE', 'https://www.reasonstudios.com/shop/rack-extension/kilohearts-khs-one/'],
  ['Robotic Bean|Resonans Physical Synthesizer', 'https://www.reasonstudios.com/shop/rack-extension/resonans-physical-synthesizer/'],
  ['Synapse Audio|Antidote', 'https://www.reasonstudios.com/shop/rack-extension/synapse-antidote/'],
  ['Kuassa|Amplifikation Creme Guitar Amp', 'https://www.reasonstudios.com/shop/rack-extension/amplifikation-creme-guitar-amp/'],
  ['Kuassa|Cerberus Bass Amp (Cerberus Bass Amplifikation)', 'https://www.reasonstudios.com/shop/rack-extension/cerberus-bass-amp/'],
  ['Kuassa Efektor|OD3603 Overdrive', 'https://www.reasonstudios.com/shop/rack-extension/efektor-od3603-overdrive/'],
  ['Kuassa Efektor|DS3603 Distortion', 'https://www.reasonstudios.com/shop/rack-extension/efektor-ds3603-distortion/'],
  ['Kuassa Efektor|FZ3603 Fuzz', 'https://www.reasonstudios.com/shop/rack-extension/efektor-fz3603-fuzz/'],
  ['Kuassa Efektor|CP3603 Compressor', 'https://www.reasonstudios.com/shop/rack-extension/efektor-cp3603-compressor/'],
  ['Kuassa Efektor|Efektor Silencer Noise Gate', 'https://www.reasonstudios.com/shop/rack-extension/efektor-silencer-noise-gate/'],
  ['Kuassa Efektor|Gainia TD Preamp', 'https://www.reasonstudios.com/shop/rack-extension/efektor-gainia-td-preamp/'],
  ['Kuassa|Pillar Power Amp', 'https://www.reasonstudios.com/shop/rack-extension/pillar-power-amp/'],
  ['Kuassa Efektor|Whammo Pitch Shifter', 'https://www.reasonstudios.com/shop/rack-extension/efektor-whammo-pitch-shifter/'],
  ['Kuassa Efektor|Grandmaster Distortion', 'https://www.reasonstudios.com/shop/rack-extension/efektor-grandmaster-distortion/'],
]);
const VERIFIED_REASON_SHOP_BUNDLES = new Map<string, string>([
  ['Kuassa Efektor|CH3604 Chorus', 'https://www.reasonstudios.com/shop/bundle/kuassa-efektor-bundle/'],
  ['Kuassa Efektor|FL3606 Flanger', 'https://www.reasonstudios.com/shop/bundle/kuassa-efektor-bundle/'],
  ['Kuassa Efektor|PH3605 Phaser', 'https://www.reasonstudios.com/shop/bundle/kuassa-efektor-bundle/'],
  ['Kuassa Efektor|TR3604 Tremolo', 'https://www.reasonstudios.com/shop/bundle/kuassa-efektor-bundle/'],
  ['Kuassa Efektor|RV3604 Reverb', 'https://www.reasonstudios.com/shop/bundle/kuassa-efektor-bundle/'],
  ['Kuassa Efektor|DL3606 Delay', 'https://www.reasonstudios.com/shop/bundle/kuassa-efektor-bundle/'],
  ['Kuassa Efektor|WF3607 Wah Filter', 'https://www.reasonstudios.com/shop/bundle/kuassa-efektor-bundle/'],
  ['Kuassa|Amplifikation Matchlock Guitar Amp', 'https://www.reasonstudios.com/shop/bundle/shoegaze-essentials-bundle/'],
]);
const officialNames = new Set(Object.values(OFFICIAL_REFERENCES).flatMap((products) => products.map(([name]) => name)));
const candidateKeys = new Set(THIRD_PARTY_REFERENCES.map(([developer, product]) => `${developer}|${product}`));
const unknownOfficialRefs = [...VERIFIED_FIRST_PARTY_SHOP_LISTINGS.keys(), ...VERIFIED_FIRST_PARTY_DOCS.keys()].filter((name) => !officialNames.has(name));
const unknownThirdPartyRefs = [...VERIFIED_REASON_SHOP_LISTINGS.keys(), ...VERIFIED_REASON_SHOP_BUNDLES.keys()].filter((key) => !candidateKeys.has(key));
const duplicatedThirdPartyRefs = [...VERIFIED_REASON_SHOP_LISTINGS.keys()].filter((key) => VERIFIED_REASON_SHOP_BUNDLES.has(key));
if (unknownOfficialRefs.length || unknownThirdPartyRefs.length || duplicatedThirdPartyRefs.length) {
  throw new Error(`Reference verification map mismatch: official=${unknownOfficialRefs.join(', ') || 'ok'}; third-party=${unknownThirdPartyRefs.join(', ') || 'ok'}; duplicated=${duplicatedThirdPartyRefs.join(', ') || 'ok'}`);
}
for (const url of [...VERIFIED_FIRST_PARTY_SHOP_LISTINGS.values(), ...VERIFIED_REASON_SHOP_LISTINGS.values()]) {
  if (!url.startsWith('https://www.reasonstudios.com/shop/rack-extension/')) throw new Error(`Expected official Reason Studios Rack Extension URL: ${url}`);
}
for (const url of VERIFIED_REASON_SHOP_BUNDLES.values()) {
  if (!url.startsWith('https://www.reasonstudios.com/shop/bundle/')) throw new Error(`Expected official Reason Studios bundle URL: ${url}`);
}
for (const url of VERIFIED_FIRST_PARTY_DOCS.values()) {
  if (!url.startsWith('https://docs.reasonstudios.com/')) throw new Error(`Expected official Reason Studios manual URL: ${url}`);
}
const directorySnapshot = JSON.parse(await readFile(resolve(process.cwd(), 'docs/reason-remoter-snapshot-2026-10-26.json'), 'utf8')) as DirectorySnapshot;
const reasonStudiosSnapshot = JSON.parse(await readFile(resolve(process.cwd(), 'docs/reason-studios-devices-snapshot-2026-10-27.json'), 'utf8')) as ReasonStudiosDeviceSnapshot;
const directoryCounts = new Map<DirectoryCategory, number>([['Instruments', 0], ['Effects', 0], ['Utilities', 0], ['Players', 0]]);
for (const product of directorySnapshot.products) {
  if (!directoryCounts.has(product.category) || !product.name || !product.developer || !product.version) {
    throw new Error(`Invalid Reason Remoter directory entry: ${JSON.stringify(product)}`);
  }
  directoryCounts.set(product.category, (directoryCounts.get(product.category) ?? 0) + 1);
}
const actualDirectoryCounts = Object.fromEntries(directoryCounts) as Record<DirectoryCategory, number>;
type PublisherCounts = { 'Reason Studios': number; 'Third-party': number };
const directoryPublisherCounts: PublisherCounts = { 'Reason Studios': 0, 'Third-party': 0 };
const directoryPublisherCategoryCounts: Record<DirectoryCategory, PublisherCounts> = {
  Instruments: { 'Reason Studios': 0, 'Third-party': 0 },
  Effects: { 'Reason Studios': 0, 'Third-party': 0 },
  Utilities: { 'Reason Studios': 0, 'Third-party': 0 },
  Players: { 'Reason Studios': 0, 'Third-party': 0 },
};
for (const product of directorySnapshot.products) {
  const publisher = product.developer === 'Reason Studios' ? 'Reason Studios' : 'Third-party';
  directoryPublisherCounts[publisher]++;
  directoryPublisherCategoryCounts[product.category][publisher]++;
}
if (directorySnapshot.products.length !== directorySnapshot.reportedTotals.rackExtensions
  || directorySnapshot.extractedRows !== directorySnapshot.products.length
  || Object.entries(directorySnapshot.reportedTotals.categories).some(([category, count]) => actualDirectoryCounts[category as DirectoryCategory] !== count)
  || new Set(directorySnapshot.products.map((product) => product.developer)).size !== directorySnapshot.reportedTotals.developers
  || directorySnapshot.checkedReportedTotals.rackExtensions !== directorySnapshot.reportedTotals.rackExtensions
  || directorySnapshot.checkedReportedTotals.developers !== directorySnapshot.reportedTotals.developers
  || Object.entries(directorySnapshot.reportedTotals.categories).some(([category, count]) => directorySnapshot.checkedReportedTotals.categories[category as ReportedDirectoryCategory] !== count)) {
  throw new Error('Reason Remoter snapshot rows do not reconcile with the reported directory totals.');
}
const reasonStudiosCategoryCounts: Record<ReasonStudiosCategory, number> = {
  Instruments: 0,
  Effects: 0,
  'Player MIDI FX': 0,
  Utilities: 0,
};
const reasonStudiosNames = new Set<string>();
for (const product of reasonStudiosSnapshot.products) {
  if (!product.name.trim() || !Object.hasOwn(reasonStudiosCategoryCounts, product.category)) {
    throw new Error(`Invalid Reason Studios catalog entry: ${JSON.stringify(product)}`);
  }
  if (reasonStudiosNames.has(product.name)) throw new Error(`Duplicate Reason Studios catalog entry: ${product.name}`);
  reasonStudiosNames.add(product.name);
  reasonStudiosCategoryCounts[product.category]++;
}
if (reasonStudiosSnapshot.products.length !== reasonStudiosSnapshot.productCount
  || Object.entries(reasonStudiosCategoryCounts).some(([category, count]) => reasonStudiosSnapshot.categoryCounts[category as ReasonStudiosCategory] !== count)) {
  throw new Error('Reason Studios snapshot rows do not reconcile with the captured product/category totals.');
}
const unique = new Map<string, { type: string; name: string; desc: string; group: string; badge: string }>();

for (const category of INSTRUMENT_CATEGORIES) {
  for (const item of category.items) {
    unique.set(`${category.label}\u0000${item.type}\u0000${item.name}`, {
      type: item.type,
      name: item.name,
      desc: item.desc,
      group: category.label,
      badge: category.badge,
    });
  }
}

rows.push('# Unbox Studio Device & Reason Rack Extension Reference');
rows.push('');
rows.push('This reference is generated from the device browser, the `DeviceSpec` registry, the legacy built-in registry, and the recorded-pack catalog. It describes what this checkout can instantiate; it is not a claim of Reason Rack Extension compatibility.');
rows.push('');
rows.push('## Compatibility and sound-source labels');
rows.push('');
rows.push('- **App-owned DSP model**: generated by Unbox Studio code using Web Audio; these are synthesized/modelled sounds, not recordings of a musician.');
rows.push('- **Recorded pack**: recorded audio played from bundled samples. Attribution can name a library creator, mapper, curator, or uploader; it is not a performer credit unless the source identifies that role. Check the pack license before redistribution.');
rows.push('- **Hardware-model DSP**: an original model of a hardware category; it does not load the hardware maker’s code or samples.');
rows.push('- **Legacy Web Audio device**: app-owned implementation registered in the legacy device factory.');
rows.push('- **Proxy DSP**: discovered VST library devices use placeholder/proxy processing and are not native VST/VST3 execution.');
rows.push('- **Legacy SoundFontEngine models**: built-in tabla, bansuri, sitar, guitar, piano, dhol, and harmonium buffers are generated by app-owned physical-model DSP; they are not imported SF2 banks or musician recordings. Private `Custom` stems can override some models in a personal build and are omitted from share builds. Workstation LOAD parses SF2 preset/instrument zone maps, key and velocity ranges, linked stereo sample pairs, root tuning, loops, selected envelope generators, scale tuning, initial filter cutoff, and the default velocity-to-cutoff and concave velocity-to-attenuation responses, plus exclusive classes. Custom SF2 modulators, full generator behavior and articulation fidelity remain incomplete; import does not verify sample provenance or license.');
rows.push('- None of these app-owned devices is an actual Reason Rack Extension. The Reason Rack Extension format has its own SDK and Reason host requirements.');
rows.push('- **Reason Rack plugin vs. Rack Extension:** Reason Free is a separate VST3/AU/AAX plugin that contains selected Reason Rack devices and opens access to Rack Extensions inside that rack. That does not make individual Rack Extensions generic VST3/AU plugins or establish Unbox compatibility; Unbox does not currently host Rack Extensions.');
rows.push('- **AI and sound**: the audio graph renders app DSP and recordings; Gemini features choose rack plans, device parameters, or mix notes, not audio waveforms. The unused `/api/generate-sound` endpoint was removed because it exposed hard-coded local song-derived patch files and had no client callsite. `Custom` recordings remain private to the local build and must not be shared without verified rights.');
rows.push('');
rows.push(`**Snapshot:** ${unique.size} named browser entries across ${INSTRUMENT_CATEGORIES.length} browser groups; ${DEVICE_SPECS.length} spec devices; ${EFFECT_CATALOG.length} insert-effect entries; ${INSTRUMENT_PACKS.length} recorded packs in this local build.`);
rows.push('');
rows.push('## App device catalog');
rows.push('');
rows.push('| Browser group | Kind | App device | Type ID | Implementation | Description |');
rows.push('| --- | --- | --- | --- | --- | --- |');

for (const item of unique.values()) {
  const spec = SPEC_BY_TYPE.get(item.type);
  const builtin = BUILTIN_BY_TYPE.get(item.type);
  const packId = spec?.family === 'studio' ? String(spec.engineConfig?.pack ?? '') : '';
  const pack = INSTRUMENT_PACKS.find((candidate) => candidate.id === packId);
  const kind = spec?.kind ?? builtin?.role ?? LEGACY_FACTORY_ROLES.get(item.type) ?? 'unmapped';
  const implementation = spec?.family === 'studio'
    ? `Recorded pack · ${pack?.spdx ?? 'LICENSE UNKNOWN'}`
    : spec?.family === 'hardware'
      ? `Hardware-model DSP · ${spec.engine}`
      : spec?.family === 'reason'
        ? `App-owned DSP · ${spec.engine}`
        : builtin || hasLegacyImplementation(item.type)
          ? 'Legacy Web Audio'
          : '**UNRESOLVED**';
  rows.push(`| ${esc(item.group)} | ${kind} | ${esc(item.name)} | \`${esc(item.type)}\` | ${implementation} | ${esc(item.desc.split('\n')[0])} |`);
}

rows.push('');
rows.push('## Recorded packs in the current local build');
rows.push('');
rows.push('These devices play recorded audio files. The synthesizer, modeled instrument, and drum-machine entries above are produced by DSP and are not recordings. A `Custom` pack is private to this local build and is not marked redistributable.');
rows.push('');
rows.push('| Pack | Type ID | Class | Attribution (not necessarily performer) | License | Notes |');
rows.push('| --- | --- | --- | --- | --- | --- |');
for (const pack of INSTRUMENT_PACKS) {
  const switches = pack.switches?.length
    ? ` Momentary SFZ keyswitches: ${pack.switches.map((sw) => `MIDI ${sw.note} (${sw.mode === 'down' ? 'held' : 'released'})`).join(', ')}.`
    : '';
  rows.push(`| ${esc(pack.name)} | \`${esc(packDeviceType(pack.id))}\` | ${pack.kind} · ${pack.category} | ${esc(pack.author)} | ${esc(pack.spdx)} | ${esc(pack.description + switches)} |`);
}

rows.push('');
rows.push('## Device implementation registry');
rows.push('');
rows.push('These rows include spec devices that are implemented but are not presented as named entries in the primary device browser. They are listed by their actual app type, engine, and parameter count.');
rows.push('');
rows.push('| Kind | Device | Type ID | Family | Engine | Parameters | Audio/CV ports |');
rows.push('| --- | --- | --- | --- | --- | ---: | --- |');
for (const spec of DEVICE_SPECS) {
  const ports = specPorts(spec).map((port) => `${port.id} (${port.type})`).join(', ') || 'none declared';
  rows.push(`| ${spec.kind} | ${esc(spec.name)} | \`${esc(spec.type)}\` | ${spec.family} | ${spec.engine} | ${spec.params.length} | ${esc(ports)} |`);
}

rows.push('');
rows.push('### Deprecated compatibility type');
rows.push('');
rows.push('`automation_clip` is no longer offered in the device catalog. Automation is edited and played through the sequencer automation lanes. The legacy device factory still maps this old saved type to a Subtractor for compatibility; it is not an automation device and should not be created in new projects.');

rows.push('');
rows.push('## Insert effects');
rows.push('');
rows.push('| Group | Effect | Type ID | Description |');
rows.push('| --- | --- | --- | --- |');
for (const effect of EFFECT_CATALOG) rows.push(`| ${esc(effect.group)} | ${esc(effect.name)} | \`${esc(effect.type)}\` | ${esc(effect.desc)} |`);

rows.push('');
rows.push('## Third-party and Reason product reference');
rows.push('');
rows.push('The user-provided product list is a discovery seed, not a verified inventory. Shop or official manual links appear only for rows checked against a Reason Studios source on 2026-10-26; all other rows remain unverified candidates. A company selling a VST3/AU product does not establish that the same product is a Rack Extension. No external product listed in this section is installed or hosted by this app.');
rows.push('');
rows.push('Reason Remoter is a third-party index that links product names to Reason Studios shop pages and reports directory counts. Its catalog is dynamic, and its totals are not a compatibility certification. See the source links below.');
rows.push(`The ${directorySnapshot.capturedOn} directory snapshot contains ${directorySnapshot.products.length} rows from ${directorySnapshot.reportedTotals.developers} developers. Reason Remoter's reported totals were rechecked on ${directorySnapshot.totalsLastCheckedOn} and remain ${directorySnapshot.checkedReportedTotals.rackExtensions} products, ${directorySnapshot.checkedReportedTotals.developers} developers, and ${Object.entries(directorySnapshot.checkedReportedTotals.categories).map(([category, count]) => `${count} ${category}`).join(', ')}; the captured rows contain ${actualDirectoryCounts.Players} Players. These are third-party directory counts, not an audited inventory of currently purchasable or Reason-version-compatible devices.`);
rows.push('');
rows.push('### Current Reason Studios device catalog snapshot');
rows.push('');
rows.push(`Captured ${reasonStudiosSnapshot.capturedOn} from the [official Reason Studios device catalog](${reasonStudiosSnapshot.source}); the snapshot contains ${reasonStudiosSnapshot.productCount} listed products: ${Object.entries(reasonStudiosSnapshot.categoryCounts).map(([category, count]) => `${count} ${category}`).join(', ')}.`);
rows.push('');
rows.push(reasonStudiosSnapshot.scopeNote);
rows.push('');
appendTable('Products listed by Reason Studios', ['Palette category', 'Device name as listed', 'Catalog descriptor'], reasonStudiosSnapshot.products.map((product) => [product.category, product.name, product.subtitle ?? '—']));
rows.push('');
rows.push('### Reason Free included Rack devices (announced 2026-08-27)');
rows.push('');
rows.push('Reason Studios describes Reason Free as a VST3/AU/AAX Rack plugin and lists these 15 included devices. The list identifies the Reason Free bundle contents; it is separate from the proprietary Rack Extension format and is not a list of devices that Unbox can load.');
rows.push('');
appendTable('Reason Free included devices', ['Reason Studios category', 'Device'], [
  ['Instruments', 'Europa'], ['Instruments', 'Kong'], ['Instruments', 'ID8'], ['Instruments', 'Monotone'],
  ['Effects', 'Scream 4'], ['Effects', 'The Echo'], ['Effects', 'Audiomatic'], ['Effects', 'RV7000 MkII'], ['Effects', 'MClass Maximizer'],
  ['Players and utilities', 'Scales & Chords'], ['Players and utilities', 'Combinator'], ['Players and utilities', 'Pulsar'],
  ['Players and utilities', 'Spider Audio Merger & Splitter'], ['Players and utilities', 'Spider CV Merger & Splitter'], ['Players and utilities', 'MIDI Out Device'],
]);
rows.push('');
rows.push('### Reason Studios vs third-party Rack Extensions in the directory');
rows.push('');
rows.push(`The directory labels ${directoryPublisherCounts['Reason Studios']} entries as published by Reason Studios and ${directoryPublisherCounts['Third-party']} under other developer names. This publisher split comes from the dated directory snapshot; it does not certify present Shop availability or compatibility. Reason Studios documents Rack Extensions as a rack-device format developed by Reason Studios and third parties, distinct from its internal Reason devices.`);
rows.push('');
appendTable('Directory rows by category and publisher label', ['Directory category', 'Reason Studios', 'Third-party', 'Total'],
  Object.entries(directoryPublisherCategoryCounts).map(([category, counts]) => [
    category, String(counts['Reason Studios']), String(counts['Third-party']), String(counts['Reason Studios'] + counts['Third-party']),
  ]));
rows.push('');
rows.push('### Reason product names from the supplied seed list');
rows.push('');
rows.push('The following names are preserved as research references. The app’s corresponding same-purpose devices, if any, are original app implementations as shown above.');
rows.push('');
rows.push('The seed mixes internal Reason devices and first-party Rack Extensions without identifying the format for every name. The current official device catalog snapshot above is the source for listed names and palette categories; this separate seed table keeps the supplied function summaries and shows where Shop/manual format evidence was checked. An unlinked row remains a seed-list claim.');
for (const [area, products] of Object.entries(OFFICIAL_REFERENCES)) {
  appendTable(area, ['Seed-list product', 'Function from supplied reference', 'Status'], products.map(([name, func]) => {
    const listing = VERIFIED_FIRST_PARTY_SHOP_LISTINGS.get(name);
    const manual = VERIFIED_FIRST_PARTY_DOCS.get(name);
    return [name, func, listing
      ? `[Reason Studios Shop RE listing checked 2026-10-26](${listing})`
      : manual
        ? `[Reason Studios operation manual identifies this as a Rack Extension](${manual})`
        : 'Reference claim; verify current edition / license status.'];
  }));
}
rows.push('');
rows.push('### Third-party RE candidates from the supplied seed list');
rows.push('');
rows.push('These are names from the supplied reference plus product-level additions from Kuassa research. Each row identifies whether an individual Shop Rack Extension listing or an official bundle listing naming that product was checked; rows without a Shop link remain unverified candidates. A checked listing confirms a Reason product-format listing at the audit date, not Unbox support or a hardware/host compatibility test. Grouping by developer or product family does not imply that every named item is sold as a Reason Rack Extension.');
rows.push('');
rows.push(`As of 2026-10-26, ${VERIFIED_REASON_SHOP_LISTINGS.size} third-party product rows link to individual Reason Studios Shop pages and ${VERIFIED_REASON_SHOP_BUNDLES.size} link to official Shop bundle pages; ${VERIFIED_FIRST_PARTY_SHOP_LISTINGS.size + VERIFIED_FIRST_PARTY_DOCS.size} first-party device rows link to the Shop or Reason operation manual. These checked rows are a verified subset, not a complete inventory of the reported ecosystem.`);
rows.push('');
rows.push(`The separate [full Reason Remoter directory snapshot](REASON_REMOTER_FULL_LIST.md) contains all ${directorySnapshot.products.length} rows and row-counted categories from a 2026-10-26 capture. The directory supplies names, developers, product categories, versions, and release dates, but not functional descriptions for every product. Its inventory is a third-party discovery index; current Shop availability and format compatibility still need product-level checking.`);
rows.push('');
appendTable('Named candidates and stated functions', ['Developer / family', 'Seed-list product', 'Function from supplied reference', 'Verification'], THIRD_PARTY_REFERENCES.map(([developer, product, func]) => {
  const key = `${developer}|${product}`;
  const listing = VERIFIED_REASON_SHOP_LISTINGS.get(key);
  const bundle = VERIFIED_REASON_SHOP_BUNDLES.get(key);
  return [developer, product, func, listing
    ? `[Reason Studios Shop Rack Extension listing checked 2026-10-26](${listing})`
    : bundle
      ? `[Named in an official Reason Studios Rack Extension bundle listing checked 2026-10-26](${bundle})`
      : 'Unverified candidate; check the individual current listing and product format.'];
}));
appendTable('Additional developers named in the seed list', ['Developer', 'Specialization from supplied reference', 'Verification'], [
  ['Selig Audio', 'Dynamics, mixing, and mastering'], ['Synapse Audio', 'Synthesizers and effects'], ['Robotic Bean', 'Creative MIDI, audio, and sequencing tools'],
  ['Pongasoft', 'Rack utilities, MIDI, and modulation'], ['Zvork', 'CV, modulation, and rack utilities'], ['Quadelectra Audioworx', 'Sequencing and sound design'],
  ['Red Rock Sound', 'Mixing and channel processing'], ['Turn2on', 'Instruments and audio effects'], ['Sonicbits', 'Synthesizers and sound-design tools'],
  ['Static Cling', 'Creative audio and MIDI utilities'], ['Retouch Control', 'MIDI and rack workflow utilities'], ['Tonicmint', 'Rack audio utilities'],
  ['Omino', 'Creative signal processing'], ['ProjectSAM', 'Orchestral instruments'], ['ujam', 'Performance-based virtual instruments'],
  ['Reveal Sound', 'Synthesizers'], ['Expert Sleepers', 'Modular and CV integration'], ['DLD Technology', 'Synthesizers and instruments'],
  ['ScuzzyEye', 'Experimental sound generation'],
].map(([developer, specialization]) => [developer, specialization, 'Developer lead only; no individual product title verified.']));
appendTable('Physical-modeling technology families', ['Technology category', 'Function', 'Product status'], [
  ['Resonator bank', 'Creates pitched resonances from incoming audio', 'Technology category; not an asserted product name.'],
  ['Modal synthesizer', 'Models resonant vibration modes', 'Technology category; not an asserted product name.'],
  ['Waveguide synthesizer', 'Simulates propagation through strings, tubes, or resonators', 'Technology category; not an asserted product name.'],
  ['Karplus–Strong synthesizer', 'Plucked-string synthesis', 'Technology category; not an asserted product name.'],
  ['Comb resonator', 'Pitch and timbre generation using short feedback delays', 'Technology category; not an asserted product name.'],
  ['Physical drum model', 'Simulates membranes, shells, and impact excitation', 'Technology category; not an asserted product name.'],
  ['Exciter generator', 'Creates striking, bowing, blowing, or plucking signals', 'Technology category; not an asserted product name.'],
  ['Acoustic body resonator', 'Simulates instrument-body resonance', 'Technology category; not an asserted product name.'],
  ['String damping processor', 'Controls decay and muting behavior', 'Technology category; not an asserted product name.'],
  ['Sympathetic resonance processor', 'Simulates resonances between vibrating components', 'Technology category; not an asserted product name.'],
]);
rows.push('');
rows.push('## Sources and update rules');
rows.push('');
rows.push('- [Reason Studios Rack Extension guide](https://docs.reasonstudios.com/reason14/working-with-rack-extensions): REs are devices used in the Reason rack and can be developed by Reason Studios or third parties. [Working with the Rack](https://docs.reasonstudios.com/reason14/working-with-the-rack) documents the Instruments, Effects, Utilities, and Players device palettes.');
rows.push(`- [Reason Studios device catalog](${reasonStudiosSnapshot.source}) and [machine-readable captured rows](reason-studios-devices-snapshot-2026-10-27.json): ${reasonStudiosSnapshot.productCount} products and palette categories captured ${reasonStudiosSnapshot.capturedOn}. The live catalog does not identify the file format of every product; use individual Shop/manual sources before calling an item a Rack Extension.`);
rows.push('- Reason’s [Rack device palette documentation](https://docs.reasonstudios.com/reason14/working-with-the-rack) separates internal Reason Devices from Rack Extension / VST manufacturer groups.');
rows.push('- [Reason Free press release](https://www.reasonstudios.com/press/reason-studios-announces-reason-free): dated 2026-08-27; identifies Reason Free as a VST3/AU/AAX Rack plugin, lists its 15 bundled devices, and says it opens access to the Rack Extension marketplace.');
rows.push('- [Reason Studios Rack Extension Shop](https://www.reasonstudios.com/shop/rack-extension/): individual linked product pages were checked on 2026-10-26 for the rows marked as listed. A Shop page is not proof of Unbox compatibility.');
rows.push('- [Kuassa Efektor 11-device bundle](https://www.reasonstudios.com/shop/bundle/kuassa-efektor-bundle/) and [Shoegaze Essentials bundle](https://www.reasonstudios.com/shop/bundle/shoegaze-essentials-bundle/): official bundle pages used for product-name checks where a separate individual page was not linked from the search result.');
rows.push('- [Reason Studios Softube Amps manual](https://docs.reasonstudios.com/reason14/softube-amps): identifies Softube Amp and Softube Bass Amp as Rack Extension devices in the Effects palette.');
rows.push('- [Reason Studios Rack Plugin introduction](https://docs.reasonstudios.com/rackplugin14/introduction): describes Rack Extensions as installed devices available in Reason and Reason Rack Plugin.');
rows.push('- [Reason Studios SDK downloads](https://developer.reasonstudios.com/downloads): SDK 5.0.0 is dated June 30, 2026, and the page says new extensions made with it require Reason 14 or later; recheck before any compatibility claim.');
rows.push('- [Reason Remoter Rack Extension directory](https://www.reasonremoter.uk/rack-extension-list/): third-party directory linked to Reason Studios shop pages; useful for discovery, not authoritative proof of current compatibility.');
rows.push('- [SFZ `sw_down` / `sw_up` reference](https://sfzformat.com/opcodes/sw_down/): momentary selectors apply while a switch key is depressed or when that key is not depressed; imported pack metadata identifies these notes separately from sticky articulations.');
rows.push('- [Full Reason Remoter directory snapshot](REASON_REMOTER_FULL_LIST.md) and [machine-readable captured rows](reason-remoter-snapshot-2026-10-26.json): all 964 directory entries, with the page-reported category totals and row-derived Players count, captured 2026-10-26.');
rows.push('');
rows.push('**Update rule:** regenerate the app catalog with `npm run reference:devices` after changing the device browser, `DeviceSpec`, legacy registry, effect catalog, or recorded packs. Update the ecosystem candidate section only after checking the individual product’s current Reason Studios Shop listing.');

const unresolved = [...unique.values()].filter((item) => !SPEC_BY_TYPE.has(item.type) && !hasLegacyImplementation(item.type));
if (unresolved.length) {
  console.error(`Unresolved device browser entries (${unresolved.length}):`);
  for (const item of unresolved) console.error(`- ${item.group}: ${item.name} (${item.type})`);
}

const seedFunctionSummaries: SeedFunctionSummary[] = [
  ...Object.values(OFFICIAL_REFERENCES).flatMap((products) => products.map(([name, func]) => ({ name, developer: 'Reason Studios', func }))),
  ...THIRD_PARTY_REFERENCES.flatMap(([developer, product, func]) => /family$/i.test(product)
    ? []
    : product.split('/').map((name) => ({ name: name.replace(/\s*\([^)]*\)/g, '').trim(), developer, func }))),
].sort((a, b) => b.name.length - a.name.length);
const directoryDoc = [
  '# Full Reason Remoter Rack Extension Directory Snapshot',
  '',
  `Captured ${directorySnapshot.capturedOn} from [Reason Remoter’s Rack Extension directory](${directorySnapshot.source}); its totals were checked again on ${directorySnapshot.totalsLastCheckedOn} and were unchanged. The page reported ${directorySnapshot.reportedTotals.rackExtensions} entries from ${directorySnapshot.reportedTotals.developers} developers: ${Object.entries(directorySnapshot.reportedTotals.categories).map(([category, count]) => `${count} ${category}`).join(', ')}. Counting the captured rows gives ${actualDirectoryCounts.Players} Players, which the page does not include in its top-line category tally; all captured rows reconcile to ${directorySnapshot.reportedTotals.rackExtensions} entries. [Reason Studios documents Rack Extensions as its rack-device format](https://docs.reasonstudios.com/reason14/working-with-rack-extensions), and its device palette distinguishes Instruments, Effects, Utilities, and Players (see [Working with the Rack](https://docs.reasonstudios.com/reason14/working-with-the-rack)).`,
  '',
  `This is a dated third-party discovery snapshot. Reason Remoter says each product title links to the Reason Studios Shop; the entries below are not individually confirmed as currently purchasable or compatible with a particular Reason version. The directory labels ${directoryPublisherCounts['Reason Studios']} rows as developer “Reason Studios” and ${directoryPublisherCounts['Third-party']} as other developers. This catalog is about Reason-format products and does not mean Unbox Studio can host or load them.`,
  '',
  'The directory does not provide functional descriptions. The final column only repeats matching function summaries from the user-supplied seed list; a dash means the seed did not describe that entry. Product version and release date are copied from the directory snapshot.',
  '',
  '| Category | Product | Developer | Publisher class in directory | Directory version | Release date | Seed function summary (unverified) |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...directorySnapshot.products.map((product) => {
    const summary = matchSeedFunctionSummary(product.name, product.developer, seedFunctionSummaries) ?? '—';
    const publisherClass = product.developer === 'Reason Studios' ? 'Reason Studios (first-party)' : 'Third-party';
    return `| ${esc(product.category)} | ${esc(product.name)} | ${esc(product.developer)} | ${publisherClass} | ${esc(product.version)} | ${esc(product.released || '—')} | ${esc(summary)} |`;
  }),
  '',
  `Source snapshot: [Reason Remoter Rack Extension directory](${directorySnapshot.source}). Page-reported totals: ${directorySnapshot.reportedTotals.rackExtensions} products, ${directorySnapshot.reportedTotals.developers} developers, ${Object.entries(directorySnapshot.reportedTotals.categories).map(([category, count]) => `${count} ${category}`).join(', ')}. Captured-row category counts: ${Object.entries(actualDirectoryCounts).map(([category, count]) => `${count} ${category}`).join(', ')}.`,
  '',
].join('\n');

const target = resolve(process.cwd(), 'docs/UNBOX_STUDIO_DEVICE_REFERENCE.md');
await writeFile(target, `${rows.join('\n')}\n`, 'utf8');
const directoryTarget = resolve(process.cwd(), 'docs/REASON_REMOTER_FULL_LIST.md');
await writeFile(directoryTarget, directoryDoc, 'utf8');
console.log(`Wrote ${target} and ${directoryTarget}; ${directorySnapshot.products.length} directory rows, ${unique.size} app entries, ${DEVICE_SPECS.length} specs, ${EFFECT_CATALOG.length} effects.`);
if (unresolved.length) process.exitCode = 1;
