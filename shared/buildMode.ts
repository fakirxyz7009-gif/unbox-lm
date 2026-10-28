declare const __UNBOX_SHARE__: boolean | undefined;

/** Replaced at build time so private-content imports can be removed from share bundles. */
export const SHARE_BUILD = typeof __UNBOX_SHARE__ !== 'undefined' && __UNBOX_SHARE__ === true;
