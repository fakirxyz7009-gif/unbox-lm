# G0 Release Baseline

**Status:** In progress — this is not a G0 pass.  
**Date:** 2026-11-12  
**Canonical product tree:** local Unbox Studio (the full application).  
**Release branch:** `release/1.0`  
**Release candidate tag:** `v1.0.0-rc.2`  
**Work snapshot:** `wip/pre-g0-snapshot`

## What is canonical

`release/1.0` is the only tree that may produce a customer build. The older `origin/main` generation is legacy and must not be sold or presented as the same product. Remote consolidation is still pending; it requires an authorized push because it replaces unrelated history.

## Baseline contents

The release commit is a parentless source snapshot. It intentionally has no parent from the local development history, which contains generated desktop bundles and multi-gigabyte song assets. The complete working history remains on `wip/pre-g0-snapshot` and the original local `main`.

Excluded from the release tree, while preserved locally:

- `release-build-v5/win-unpacked/resources/app.asar` — a 1.13 GB generated desktop bundle, not source.
- `public/songs/off_topic/` and `public/songs/love_ya/` — unreferenced demo masters and stems (about 841 MB), with no release-rights determination.
- `shots/review-instruments-1600.png` — a local review screenshot.
- `public/stems/` and the four `Custom` packs (`chamkila-harmonium`, `chamkila-vocal`, `dholak-folk`, `tumbi-folk`) — private local audio, excluded from the public release and ignored in the release tree.
- Generated `dist/`, `release*/`, `node_modules/`, and machine-specific content already covered by `.gitignore`.

The release tree keeps the application source, tests, build configuration, 48 redistributable instrument packs, documentation, and the user manual. The four `Custom` packs and `public/stems` were removed, and the index, catalog, credits, and pack-policy tests were regenerated for the public tree. The instrument-credit tests normalize CRLF, so a Windows checkout does not change the result.

## Current snapshot verification

Run in the working tree before creating the release commit:

| Check | Command | Result |
| --- | --- | --- |
| Type/lint | `npm run lint` | Pass |
| Unit/integration tests | `npm test` | 377 passed, 2 skipped, 0 failed |
| Production build | `npm run build` | Pass |

Environment: Node `v24.21.0`, npm `12.2.0`, Electron `45.0.0`, electron-builder `^26.18.1`.

`package-lock.json` SHA-256: `9abd63a1a6c544cfe3b88907feb9de4e491b08a4c89a6a9fc2a913310c299001`.

## Clean-checkout verification

A detached worktree was created from the release tag, installed with `npm ci`, and checked independently of the working copy. `npm run lint`, `npm test`, and `npm run build` all passed: 377 passed, 2 skipped, 0 failed. The resulting `dist/index.html` SHA-256 was `f6eab9a4c9b09e819adbf864e887dc337b5fb1a7649571a4499c7d1d79211afd`.

The Windows packaged executable itself remains open.

## Remaining G0 work

1. Push `release/1.0` and `v1.0.0-rc.2` after explicit authorization; the older `v1.0.0-rc.1` remains local and must not be published.
2. Replace the unrelated remote `main` generation with the published release tree; the old generation is preserved on `archive/main-legacy` and `legacy-main-2026-11-12`.
3. Build the Windows artifact from a clean checkout of the tagged commit.
4. Record the exact artifact path, size, SHA-256, installer/portable type, and the machine used.
5. Complete the clean-machine launch, project save/reopen, and recovery checks required by G4.

G0 passes only after the remote tree, clean rebuild, artifact hash, and accepted release candidate are recorded. G1–G7 remain open.
