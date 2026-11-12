import { CATEGORY_KEYWORDS, CATEGORY_LABELS } from './categories.ts';
import type { ItemKind, ManifestItem, SoundCategory } from './manifestTypes.ts';

export interface SearchOptions {
  kinds?: ItemKind[];
  categories?: SoundCategory[];
  includeDuplicates?: boolean;
  limit?: number;
}

export interface SearchHit {
  item: ManifestItem;
  score: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'with', 'for', 'of', 'to', 'in', 'on', 'into', 'my', 'me', 'i', 'some', 'that', 'this',
  'want', 'need', 'make', 'build', 'create', 'give', 'please', 'like', 'sound', 'sounds', 'sounding', 'chain', 'rack',
  'patch', 'setup', 'set', 'up', 'using', 'use', 'plus', 'then', 'very', 'really', 'bit', 'little', 'kind', 'style',
]);

const KIND_ORDER: Record<ItemKind, number> = {
  plugin: 0,
  instrument: 1,
  preset: 2,
  sample: 3,
  'sample-pack': 4,
  installer: 5,
  archive: 6,
  document: 7,
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9#+]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

const INFLECTIONS = ['s', 'es', 'y', 'r', 'er', 'est', 'd', 'ed', 'ing', 'ly'];

/** "spacey" → space, "wider" → wide, "warmer" → warm (but not "organic" → organ). */
function inflectionOf(word: string, keyword: string): boolean {
  return word.startsWith(keyword) && keyword.length >= 4 && INFLECTIONS.includes(word.slice(keyword.length));
}

/** Categories implied by free text (single words, simple inflections and multi-word phrases). */
export function categoriesInText(text: string): SoundCategory[] {
  const lower = ` ${text.toLowerCase()} `;
  const words = tokenize(text);
  const wordSet = new Set(words);
  const found: SoundCategory[] = [];
  (Object.keys(CATEGORY_KEYWORDS) as SoundCategory[]).forEach((cat) => {
    const hit = CATEGORY_KEYWORDS[cat].some((kw) =>
      kw.includes(' ') || kw.includes('-')
        ? lower.includes(kw)
        : wordSet.has(kw) || words.some((w) => inflectionOf(w, kw))
    );
    if (hit) found.push(cat);
  });
  return found;
}

const indexCache = new WeakMap<ManifestItem, Map<string, number>>();

function itemIndex(item: ManifestItem): Map<string, number> {
  const cached = indexCache.get(item);
  if (cached) return cached;
  const index = new Map<string, number>();
  const add = (text: string | undefined, weight: number) => {
    if (!text) return;
    tokenize(text).forEach((t) => index.set(t, Math.max(index.get(t) ?? 0, weight)));
  };
  add(item.name, 4);
  if ('category' in item) {
    add(item.category, 3);
    add(CATEGORY_LABELS[item.category], 3);
  }
  if ('vendor' in item) add(item.vendor, 2);
  if ('engine' in item) add(item.engine, 1.5);
  item.tags.forEach((t) => add(t, 2));
  if ('format' in item) add(item.format, 1);
  add(item.kind, 1);
  indexCache.set(item, index);
  return index;
}

function tokenScore(query: string, index: Map<string, number>): number {
  let best = 0;
  index.forEach((weight, token) => {
    let s = 0;
    if (token === query) s = weight;
    else if (query.length >= 2 && token.startsWith(query)) s = weight * 0.7;
    else if (token.length >= 3 && query.startsWith(token)) s = weight * 0.5;
    else if (query.length >= 3 && token.includes(query)) s = weight * 0.4;
    if (s > best) best = s;
  });
  return best;
}

function baseBoost(item: ManifestItem): number {
  if (item.kind === 'plugin') return item.hostable ? 0.6 : 0.2;
  if (item.kind === 'instrument') return 0.4;
  if (item.kind === 'preset') return 0.2;
  if (item.kind === 'installer' || item.kind === 'archive' || item.kind === 'document') return -0.3;
  return 0;
}

/** Ranked search over manifest items. An empty query lists everything that passes the filters. */
export function searchManifest(items: ManifestItem[], query: string, opts: SearchOptions = {}): SearchHit[] {
  const kinds = opts.kinds && opts.kinds.length ? new Set(opts.kinds) : null;
  const cats = opts.categories && opts.categories.length ? new Set(opts.categories) : null;
  const pool = items.filter(
    (item) =>
      (opts.includeDuplicates || !item.duplicateOf) &&
      (!kinds || kinds.has(item.kind)) &&
      (!cats || ('category' in item && cats.has(item.category)))
  );

  const terms = tokenize(query);
  const impliedCats = new Set(categoriesInText(query));
  let hits: SearchHit[];

  if (terms.length === 0) {
    hits = pool
      .map((item) => ({ item, score: 0 }))
      .sort((a, b) => KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || a.item.name.localeCompare(b.item.name));
  } else {
    hits = [];
    for (const item of pool) {
      const index = itemIndex(item);
      let score = 0;
      let matched = 0;
      for (const term of terms) {
        const s = tokenScore(term, index);
        if (s > 0) matched++;
        score += s;
      }
      if ('category' in item && impliedCats.has(item.category)) {
        score += 3;
        matched++;
      }
      if (matched === 0) continue;
      // Prefer items that match more of the query, then the generic quality boost.
      score = score * (0.5 + matched / (terms.length + (impliedCats.size ? 1 : 0))) + baseBoost(item);
      hits.push({ item, score });
    }
    hits.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  }
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}
