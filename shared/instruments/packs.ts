/**
 * The instrument packs this build offers. The shareable build (`npm run dist:win:share`, built with
 * the `__UNBOX_SHARE__` flag) keeps only redistributable packs (CC0 / CC-BY): packs made from
 * recordings you may not pass on (license "Custom") stay in your own build and the dev server.
 */
import { INSTRUMENT_PACKS } from './catalog.ts';
import { redistributablePacks, type PackEntry } from './catalogTypes.ts';
import { SHARE_BUILD } from '../buildMode.ts';

export const SHIPPED_PACKS: readonly PackEntry[] = SHARE_BUILD ? redistributablePacks(INSTRUMENT_PACKS) : INSTRUMENT_PACKS;
