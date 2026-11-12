export interface SeedFunctionSummary {
  name: string;
  developer: string;
  func: string;
}

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function hasTokenSequence(text: readonly string[], phrase: readonly string[]): boolean {
  return text.some((_, start) => phrase.every((token, offset) => text[start + offset] === token));
}

function sameDeveloper(directoryDeveloper: string, seedDeveloper: string): boolean {
  const directory = tokens(directoryDeveloper).join(' ');
  const seed = tokens(seedDeveloper).join(' ');
  return directory === seed || directory.startsWith(`${seed} `) || seed.startsWith(`${directory} `);
}

export function matchSeedFunctionSummary(
  productName: string,
  developer: string,
  seeds: readonly SeedFunctionSummary[],
): string | undefined {
  const product = tokens(productName);
  return seeds.find(({ name, developer: seedDeveloper }) => {
    const seedName = tokens(name);
    return seedName.join('').length >= 4
      && sameDeveloper(developer, seedDeveloper)
      && (hasTokenSequence(product, seedName) || hasTokenSequence(seedName, product));
  })?.func;
}
