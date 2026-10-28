/**
 * Shareable Windows build (`npm run dist:win:share`): the same app without what must not be handed
 * to other people. `vite build --mode share` leaves non-redistributable instrument packs out of the
 * app (shared/instruments/packs.ts), scripts/prune-share-build.ts deletes their files, the song
 * stems (public/stems) and the in-app library (built from your own D:\vsr, third-party previews)
 * from dist/, and this config keeps the library and the stems out once more as a safety net.
 */
const base = require('../package.json').build;

module.exports = {
  ...base,
  files: [...base.files, '!dist/library/**', '!dist/stems/**'],
  win: { ...base.win, artifactName: 'Unbox-Studio-Share.exe' },
};
