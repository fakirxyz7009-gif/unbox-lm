/** Build-time flags shared by the server routes. Undefined in development and local builds. */
declare const __UNBOX_SHARE__: boolean | undefined;

export const SHARE_BUILD = typeof __UNBOX_SHARE__ !== 'undefined' && __UNBOX_SHARE__ === true;
