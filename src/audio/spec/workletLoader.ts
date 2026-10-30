/**
 * Loads an AudioWorklet processor, written as a self-contained function, into one context, once.
 * The function is stringified into a Blob URL (the same way worklets.ts loads its processors).
 * Resolves false where AudioWorklet is unavailable, so an engine can fall back.
 */
const loaded = new WeakMap<BaseAudioContext, Map<() => void, Promise<boolean>>>();

export function loadWorklet(ctx: BaseAudioContext, source: () => void): Promise<boolean> {
  let perSource = loaded.get(ctx);
  if (!perSource) {
    perSource = new Map();
    loaded.set(ctx, perSource);
  }
  let p = perSource.get(source);
  if (!p) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !ctx.audioWorklet) {
      p = Promise.resolve(false);
    } else {
      const url = URL.createObjectURL(new Blob([`(${source.toString()})();`], { type: 'application/javascript' }));
      p = ctx.audioWorklet
        .addModule(url)
        .then(
          () => true,
          () => false,
        )
        .finally(() => URL.revokeObjectURL(url));
    }
    perSource.set(source, p);
  }
  return p;
}
