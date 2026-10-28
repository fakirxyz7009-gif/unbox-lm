import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Category = 'Instruments' | 'Effects' | 'Utilities' | 'Players';
interface Product {
  name: string;
  developer: string;
  category: Category;
  version: string;
  released: string;
}
interface Totals {
  rackExtensions: number;
  developers: number;
  categories: Record<Exclude<Category, 'Players'>, number>;
}
interface Snapshot {
  source: string;
  capturedOn: string;
  totalsLastCheckedOn: string;
  checkedReportedTotals: Totals;
  reportedTotals: Totals;
  extractedRows: number;
  products: Product[];
}

test('Reason Remoter reference snapshot reconciles with its captured and rechecked totals', async () => {
  const snapshotPath = resolve(process.cwd(), 'docs/reason-remoter-snapshot-2026-10-26.json');
  const markdownPath = resolve(process.cwd(), 'docs/REASON_REMOTER_FULL_LIST.md');
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as Snapshot;
  const markdown = await readFile(markdownPath, 'utf8');

  assert.equal(snapshot.source, 'https://www.reasonremoter.uk/rack-extension-list/');
  assert.match(snapshot.capturedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(snapshot.totalsLastCheckedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(snapshot.checkedReportedTotals, snapshot.reportedTotals);
  assert.equal(snapshot.products.length, snapshot.extractedRows);
  assert.equal(snapshot.products.length, snapshot.reportedTotals.rackExtensions);

  const counts: Record<Category, number> = { Instruments: 0, Effects: 0, Utilities: 0, Players: 0 };
  const developers = new Set<string>();
  const productKeys = new Set<string>();
  const publisherCounts = { 'Reason Studios': 0, 'Third-party': 0 };
  for (const product of snapshot.products) {
    assert.ok(product.name.trim(), 'product name is required');
    assert.ok(product.developer.trim(), `developer is required for ${product.name}`);
    assert.ok(product.version.trim(), `version is required for ${product.name}`);
    assert.ok(Object.hasOwn(counts, product.category), `unknown category for ${product.name}`);
    if (product.released) {
      assert.match(product.released, /^\d{4}-\d{2}-\d{2}$/, `invalid release date for ${product.name}`);
      const releaseDate = new Date(`${product.released}T00:00:00Z`);
      assert.ok(Number.isFinite(releaseDate.valueOf()), `unparseable release date for ${product.name}`);
      assert.equal(releaseDate.toISOString().slice(0, 10), product.released, `out-of-range release date for ${product.name}`);
    }

    counts[product.category]++;
    publisherCounts[product.developer === 'Reason Studios' ? 'Reason Studios' : 'Third-party']++;
    developers.add(product.developer);
    const key = `${product.developer}\u0000${product.name}`;
    assert.ok(!productKeys.has(key), `duplicate developer/product row: ${product.developer} / ${product.name}`);
    productKeys.add(key);
  }

  assert.deepEqual(counts, { Instruments: 253, Effects: 438, Utilities: 205, Players: 68 });
  assert.equal(developers.size, snapshot.reportedTotals.developers);
  assert.equal(counts.Instruments, snapshot.reportedTotals.categories.Instruments);
  assert.equal(counts.Effects, snapshot.reportedTotals.categories.Effects);
  assert.equal(counts.Utilities, snapshot.reportedTotals.categories.Utilities);
  assert.deepEqual(publisherCounts, { 'Reason Studios': 24, 'Third-party': 940 });

  const markdownRows = markdown.split(/\r?\n/).filter((line) => line.startsWith('| ')).slice(2);
  const markdownProducts = markdownRows.map((line) => line.slice(2, -2).split(' | ').slice(0, 6));
  const escapeCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
  const expectedMarkdownProducts = snapshot.products.map((product) => [
    product.category,
    product.name,
    product.developer,
    product.developer === 'Reason Studios' ? 'Reason Studios (first-party)' : 'Third-party',
    product.version,
    product.released || '—',
  ].map(escapeCell));
  assert.deepEqual(markdownProducts, expectedMarkdownProducts, 'Markdown product rows must match JSON names, categories, developers, versions and dates');
  assert.ok(markdown.includes(`totals were checked again on ${snapshot.totalsLastCheckedOn}`));
  assert.ok(markdown.includes('24 rows as developer “Reason Studios” and 940 as other developers'));
});
