import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Category = 'Instruments' | 'Effects' | 'Player MIDI FX' | 'Utilities';
interface Product {
  name: string;
  category: Category;
  subtitle?: string;
}
interface Snapshot {
  source: string;
  capturedOn: string;
  scopeNote: string;
  productCount: number;
  categoryCounts: Record<Category, number>;
  products: Product[];
}

test('Reason Studios device snapshot is complete, scoped, and matches the generated reference', async () => {
  const snapshotPath = resolve(process.cwd(), 'docs/reason-studios-devices-snapshot-2026-10-27.json');
  const markdownPath = resolve(process.cwd(), 'docs/UNBOX_STUDIO_DEVICE_REFERENCE.md');
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as Snapshot;
  const markdown = await readFile(markdownPath, 'utf8');

  assert.equal(snapshot.source, 'https://www.reasonstudios.com/devices');
  assert.equal(snapshot.capturedOn, '2026-10-27');
  assert.equal(snapshot.products.length, snapshot.productCount);
  assert.equal(snapshot.productCount, 93);
  assert.match(snapshot.scopeNote, /does not establish Rack Extension format/i);

  const counts: Record<Category, number> = {
    Instruments: 0,
    Effects: 0,
    'Player MIDI FX': 0,
    Utilities: 0,
  };
  const names = new Set<string>();
  for (const product of snapshot.products) {
    assert.ok(product.name.trim(), 'product name is required');
    assert.ok(Object.hasOwn(counts, product.category), `unknown category for ${product.name}`);
    assert.ok(!names.has(product.name), `duplicate product name: ${product.name}`);
    names.add(product.name);
    counts[product.category]++;
  }
  assert.deepEqual(counts, { Instruments: 34, Effects: 37, 'Player MIDI FX': 13, Utilities: 9 });
  assert.deepEqual(counts, snapshot.categoryCounts);

  const start = markdown.indexOf('### Current Reason Studios device catalog snapshot');
  const end = markdown.indexOf('### Reason Free included Rack devices', start);
  assert.ok(start >= 0 && end > start, 'official catalog section and following section are required');
  const section = markdown.slice(start, end);
  assert.match(section, /does not establish Rack Extension format/i);
  const rows = section.split(/\r?\n/).filter((line) => line.startsWith('| ')).slice(2);
  const markdownProducts = rows.map((line) => line.slice(2, -2).split(' | '));
  const expectedProducts = snapshot.products.map((product) => [
    product.category,
    product.name,
    product.subtitle ?? '—',
  ]);
  assert.deepEqual(markdownProducts, expectedProducts, 'generated official catalog rows must match the dated JSON snapshot');
});

test('Reason Free bundle list is distinct from the Rack Extension format', async () => {
  const markdownPath = resolve(process.cwd(), 'docs/UNBOX_STUDIO_DEVICE_REFERENCE.md');
  const markdown = await readFile(markdownPath, 'utf8');
  const start = markdown.indexOf('### Reason Free included Rack devices');
  const end = markdown.indexOf('### Reason Studios vs third-party Rack Extensions in the directory', start);
  assert.ok(start >= 0 && end > start, 'Reason Free list must appear separately from the official catalog snapshot');

  const section = markdown.slice(start, end);
  const rows = section.split(/\r?\n/).filter((line) => line.startsWith('| ')).slice(2);
  const includedDevices = rows.map((line) => line.slice(2, -2).split(' | '));
  assert.deepEqual(includedDevices, [
    ['Instruments', 'Europa'], ['Instruments', 'Kong'], ['Instruments', 'ID8'], ['Instruments', 'Monotone'],
    ['Effects', 'Scream 4'], ['Effects', 'The Echo'], ['Effects', 'Audiomatic'], ['Effects', 'RV7000 MkII'], ['Effects', 'MClass Maximizer'],
    ['Players and utilities', 'Scales & Chords'], ['Players and utilities', 'Combinator'], ['Players and utilities', 'Pulsar'],
    ['Players and utilities', 'Spider Audio Merger & Splitter'], ['Players and utilities', 'Spider CV Merger & Splitter'], ['Players and utilities', 'MIDI Out Device'],
  ]);
  assert.match(section, /Reason Free as a VST3\/AU\/AAX Rack plugin/i);
  assert.match(section, /separate from the proprietary Rack Extension format/i);
  assert.match(markdown, /reasonstudios\.com\/press\/reason-studios-announces-reason-free/);
  assert.match(markdown, /does not make individual Rack Extensions generic VST3\/AU plugins/i);
});
