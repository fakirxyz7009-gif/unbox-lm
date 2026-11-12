/** Opens the Samples & Stems window (stem separation, link import) from anywhere; App listens. */
export const OPEN_STEM_TOOLS_EVENT = 'unbox:open-stem-tools';

export function openStemTools(): void {
  window.dispatchEvent(new Event(OPEN_STEM_TOOLS_EVENT));
}
