# G0 Windows Portable Artifact Evidence

Recorded: 2026-11-12 (local)

## Source

- Tag: `v1.0.0-rc.2`
- Commit: `deb04d7d36ad08e7876d1b6053771e6414db4cec`
- Tree: `3e77413deb9f188b5f64d263b06231037529e009`
- Source worktree: clean detached worktree at `.tmp/g0-exe`
- Build host: `DESKTOP-HGNV3S6`, Windows `10.0.26200`, AMD Ryzen 5 2600X (6C/12T), 24 GiB RAM
- Node: `v24.21.0`; npm: `12.2.0`
- Electron: `45.0.0`
- electron-builder: `26.18.1`
- `package-lock.json` SHA-256: `9c3006c8a6443b69c480866e3cf9177fc155ec005b682205b57ee6700066ec18`

## Artifact

- Build output: `.tmp/g0-exe/release/Unbox-Studio.exe`
- Archived copy: `release/g0/Unbox-Studio-1.0.0-rc.2.exe` (the `release/` directory is Git-ignored)
- Format: portable NSIS self-extracting executable (`PE32` GUI wrapper, Windows x64 app payload)
- Product name: `Unbox Studio`
- File description: `Unbox Studio - browser and desktop music workstation`
- File version: `1.0.0`
- Product version: `1.0.0`
- Authenticode: `NotSigned`
- Size: `263,100,935` bytes (250.9 MiB)
- SHA-256:

  `50258e5de1e90b7d3bb2a0d22053cb0f5425a94805d47f2e1df31804478c1627`

The hash was computed independently with `sha256sum` and PowerShell
`Get-FileHash -Algorithm SHA256`; both matched.

## Build provenance

The clean worktree was created from the tag and dependencies were installed with:

```bash
git worktree add --detach .tmp/g0-exe v1.0.0-rc.2
cd .tmp/g0-exe
npm ci --prefer-offline --no-audit --no-fund
npm run dist:win
```

`npm run dist:win` built the web bundle and API server and packaged
`release/win-unpacked`. It then failed during electron-builder's portable
compression when a 7-Zip child process returned `3221225794`
(`0xC0000142`) while appending the staged `resources/elevate.exe`. The failure
was transient: the cached 7-Zip binary started correctly, and manually
appending the same `elevate.exe` to a copy of the generated archive completed
successfully.

The already-built unpacked application was then repackaged with the standard
portable configuration:

```bash
npx electron-builder --win portable --prepackaged release/win-unpacked
```

That command exited `0` and produced the artifact recorded above. The packaged
web entry point, `dist/index.html`, has SHA-256:

`f6eab9a4c9b09e819adbf864e887dc337b5fb1a7649571a4499c7d1d79211afd`

which matches the redacted release baseline.

## Evidence files

- `release/g0/SHA256SUMS.txt`
- `release/g0/logs/01-npm-dist-win.log`
- `release/g0/logs/02-portable-repack.log`
- `release/g0/logs/03-current-host-portable-smoke.log`
- `release/g0/logs/04-artifact-extract.log` — exact artifact extraction (75 files)
- `release/g0/logs/05-artifact-renderer-smoke.log` through `07-indexeddb-read.log` — packaged renderer and persistence
- `release/g0/logs/12-artifact-project-export.log` — starter project save/reload and WAV/FLAC/MP3 downloads
- `release/g0/logs/13-recovery-seed.log` through `16-project-recovery-verify.log` — seeded graceful project-recovery pass
- `release/g0/logs/17-project-crash-write.log` through `19-project-crash-verify.log` — abrupt-recovery setup failure
- `release/g0/logs/20-soak-extract.log` and `20-soak-inner-extract.log` — exact-artifact extraction for the soak
- `release/g0/logs/21-soak-dryrun.log` — 30-second harness validation
- `release/g0/logs/22-soak-10min.log` — first 10-minute loaded-session soak (qualified)
- `release/g0/soak/soak.json`, `soak-dryrun-30s.json`, `app-output.log`, `chrome-output.log` — first soak's raw samples, summary, and process output
- `release/g0/logs/23-soak2-extract.log`, `23-soak2-inner-extract.log`, `23-soak2-dryrun.log` — separated-collector soak extraction and harness validation
- `release/g0/logs/24-soak2-10min.log` — 600-second separated-collector soak, strict `stable=true`
- `release/g0/soak2/soak2.json`, `collector.jsonl`, `soak2-dryrun-30s.json`, `collector-dryrun-30s.jsonl`, `app-output.log`, `chrome-output.log`, `collector-output.log` — rerun raw samples, independent collector, and process output
- `release/g0/software/` — exported audio, SHA-256 sums, `ffprobe`/`volumedetect` output
- [G0/G4 acceptance run](G0_G4_ACCEPTANCE.md) — clean-machine G4 is blocked on this host

## Limitation

The executable is unsigned. It has not been launched on a clean Windows machine,
so G0 clean-machine acceptance remains open. The recorded artifact did pass the
current-host software-only subset in [G0_G4_ACCEPTANCE.md](G0_G4_ACCEPTANCE.md),
including renderer startup, IndexedDB persistence, starter-project save/reload,
WAV/FLAC/MP3 export, graceful project recovery, and a 600-second
separated-collector soak. The first soak was qualified: playback and loop
remained active, but its strict harness reported a Chrome-internal aborted
request and two app-health probe timeouts. The rerun used app-only health probes
and a separate process-tree collector; it completed 41/41 samples with zero
health failures and strict `stable=true`, and the two timeouts did not
reproduce. That is consistent with harness contention, not proof of cause.
These checks do not substitute for clean-machine or physical-hardware
acceptance. This evidence records a successful portable artifact build, its
exact identity, and that software-only subset, not a completed G0/G4 acceptance
test.
