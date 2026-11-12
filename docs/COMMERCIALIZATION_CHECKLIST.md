# Unbox Studio Commercialization Checklist

**Created:** 2026-11-12  
**Scope:** local Unbox Studio application and its Windows desktop release.  
**Purpose:** decide when the product can be given away, sold as a beta, and sold as a 1.0 without damaging trust.

This is a release gate, not a feature wishlist. A gate passes only when every mandatory item has a reproducible artifact or recorded test result. Code presence alone is not evidence. No gate may be marked passed with an unchecked mandatory item.

## Gate rules

1. One owner signs each gate with a date and evidence links.
2. A failed or blocked gate cannot be waived informally. A waiver must be written, time-limited, and tied to a customer-visible limitation.
3. Re-run the affected gate after the release candidate changes.
4. Any open severity-1 defect, data-loss report, or security issue blocks paid release.
5. Test on a clean Windows machine, not only the development machine.
6. Keep product claims aligned with the feature truth table. Proxy DSP is not native VST3 hosting.

## Current baseline

These are observations from the repository on 2026-11-12. They are not gate approvals.

| Area | Current state | Consequence |
| --- | --- | --- |
| Source of truth | Local Unbox Studio and the remote `main` are different app generations. The recent modal accessibility/test work went to the older remote app. The local worktree has uncommitted work and `main` has no upstream tracking. | **G0 cannot pass.** A release built from the wrong tree would ship the wrong app. |
| Phase 0 acceptance | The project's own `docs/PHASE_0_AUDIT.md` says **not complete**. Physical audio/MIDI acceptance, measured performance, portable crash recovery, signing, and release-candidate acceptance remain open. | **G4 cannot pass.** |
| Distribution | Current Windows target is a portable executable; no signing, updater, or crash-reporting configuration was found. | **G3 cannot pass.** |
| Commercial layer | No checkout, license activation, trial, entitlement, EULA, privacy policy, or refund flow was found. | **G2 cannot pass.** |
| AI | The documented setup uses `GEMINI_API_KEY` in `.env`; local fallback exists. No customer-facing BYOK screen or metered hosted proxy was found. | **G5 is partial.** |
| Native plugin hosting | Native VST3 hosting is not implemented; library units use labeled proxy DSP. | Fine for a self-contained DAW; a blocker to marketing it as a VST host. |
| Content rights | The audit reports 45 recorded packs: 38 CC0, 3 CC-BY-3.0, and 4 private `Custom`. Share builds are intended to exclude private packs and local content. | **G1 is partial until the sellable artifact is audited.** |
| Onboarding | First-run welcome, project templates, and a user manual exist. | Useful foundation; support and license recovery are still unproven. |
| Market proof | No beta cohort, pricing test, or willingness-to-pay evidence was found. | **G7 is not started.** |

## Release ladder

| Stage | What it means | Minimum gates |
| --- | --- | --- |
| Free beta | Real users can try it with clear limitations and a feedback channel; no money changes hands. | G0 + a documented legal/privacy notice + G4 smoke checks + support channel |
| Paid beta | Customers pay for a time-limited or explicitly unfinished build with a refund path. | G0 through G5, including signing and license fulfillment |
| 1.0 | General commercial release. | All gates, including G6 and G7 |

Do not use "1.0" in the product or store listing until the 1.0 gate passes. The package version alone is not a release decision.

---

## G0 — Canonical source and reproducible release (P0)

**Current status:** BLOCKED

**Why:** You cannot support, update, or sell two different app generations at once.

- [ ] Choose one canonical product tree (recommended: local Unbox Studio, which contains the full application).
- [ ] Archive or clearly label the older remote app generation; do not present both as the same product.
- [ ] Commit or deliberately discard unrelated worktree changes.
- [ ] Create a protected release branch and an annotated release tag.
- [ ] Confirm a clean checkout builds without relying on machine-specific files under `D:\vsr`, local stems, or untracked assets.
- [ ] Record the exact build command, dependency lockfile, Node/Electron versions, and SHA-256 of the artifact.
- [ ] Freeze a release-candidate commit; all subsequent fixes go through the same branch.

**Pass:** A clean checkout of the tagged commit produces the same functional artifact, and no release artifact depends on an untracked local file.

**Fail if:** the build differs by machine, the release branch is ambiguous, or the app is assembled from a dirty worktree.

---

## G1 — Legal, privacy, and content rights (P0)

**Current status:** PARTIAL

**Why:** A paid app needs clear terms and a content inventory, especially with bundled recordings and AI prompts.

- [ ] EULA or commercial license terms are written and reachable before purchase.
- [ ] Privacy policy covers project data, diagnostics, AI prompts, and any hosted service.
- [ ] Refund, chargeback, and support policy are published.
- [ ] Third-party notices include every dependency and every bundled sample pack.
- [ ] All CC-BY packs carry the required attribution in the app and in `CREDITS.md`.
- [ ] The sellable build excludes private `Custom` packs, local `D:\vsr` library data, personal stems, and other non-redistributable content.
- [ ] `npm run audit:share-package` passes on the exact artifact being sold.
- [ ] "Unbox Studio" and visible product/device names receive a trademark/brand conflict check.
- [ ] The app does not claim Reason compatibility, native VST3 hosting, or AI-generated audio.
- [ ] AI provider terms and data-retention behavior are disclosed.
- [ ] Export-control and age-related obligations are reviewed for the intended markets.

**Pass:** Legal review signs the exact build, and the content audit accounts for every redistributable asset in it.

**Fail if:** any sold artifact contains unlicensed samples, local library previews, private stems, or an unexplained third-party asset.

---

## G2 — Checkout, licensing, and customer lifecycle (P0 for paid release)

**Current status:** NOT STARTED

**Why:** Taking money requires more than a payment link: the customer must receive, activate, recover, and eventually refund a license.

- [ ] Choose a merchant of record or payment provider that handles sales tax/VAT for the target markets.
- [ ] Define the license: one-time or subscription, number of devices, update window, and commercial-use terms.
- [ ] Implement testable license issuance and activation.
- [ ] Support offline activation with a documented grace period.
- [ ] Support deactivation and machine transfer.
- [ ] Provide a trial or demo path that does not require a paid key.
- [ ] Implement license recovery for lost email or replaced hardware.
- [ ] Test purchase → receipt → activation → restart → offline use → deactivate.
- [ ] Test refund → license revocation and a clear customer message.
- [ ] Publish support response expectations and a working support address.
- [ ] Confirm the app works when the license server is unreachable, within the grace period.

**Pass:** A test customer can buy, activate on two machines, work offline for the grace period, recover access, request a refund, and receive a correct outcome.

**Fail if:** activation requires a server connection every launch, a refund cannot revoke access, or support has no recovery path.

---

## G3 — Trustworthy Windows distribution (P0 for paid release)

**Current status:** NOT STARTED

**Why:** An unsigned portable Electron executable is a conversion and trust problem, not just a packaging preference.

- [ ] Produce a signed installer in addition to, or instead of, the portable build.
- [ ] Sign the executable and installer with a trusted certificate and timestamp.
- [ ] Verify signatures with `Get-AuthenticodeSignature` on a clean machine.
- [ ] Test SmartScreen and at least one current antivirus scan on a fresh download.
- [ ] Publish SHA-256 checksums next to the download.
- [ ] Publish versioned release notes and a known-issues list.
- [ ] Implement or explicitly defer automatic updates with a documented manual update path.
- [ ] If updates are implemented: test update, failed update rollback, and downgrade refusal.
- [ ] Add opt-in crash reporting or a one-click diagnostic log export.
- [ ] Confirm uninstall behavior preserves user projects unless the user explicitly deletes them.
- [ ] Record download size and first-launch time on a typical connection and machine.

**Pass:** A new customer can download, verify, install, launch, update or manually upgrade, and uninstall without unexplained warnings or data loss.

**Fail if:** the installer is unsigned, SmartScreen blocks it without guidance, or an update can destroy projects.

---

## G4 — Release acceptance and recovery (P0)

**Current status:** IN PROGRESS / BLOCKED by the open Phase 0 items

**Why:** The development machine is not the customer's machine.

### Clean-machine matrix

- [ ] Windows 11 clean VM or physical machine; include Windows 10 only if it remains an explicitly supported target.
- [ ] Built-in audio output and at least one class-compliant USB audio interface.
- [ ] 44.1 kHz and 48 kHz, with 128 and 256 sample buffers where supported.
- [ ] At least one physical MIDI controller: note on/off, velocity, sustain, pitch bend, reconnect during a session.
- [ ] Standard and high-DPI display scaling.
- [ ] No Node.js, development tools, or prior app data installed.

### Project and audio acceptance

- [ ] Create, save, close, relaunch, and reopen a project containing MIDI, audio, mixer state, automation, rack layout, and a recorded instrument.
- [ ] Export WAV, FLAC, and one compressed format; verify the files open and have expected duration/levels.
- [ ] Run a 10-minute loaded session without an unrecovered crash or audible dropout; record the project size and device/voice count.
- [ ] Measure CPU, memory, output latency, and UI responsiveness on the reference machine; thresholds must be frozen before the test.
- [ ] Confirm no unbounded memory growth during the soak.
- [ ] Force-stop during a recording and confirm recovery does not silently overwrite the previous project.
- [ ] Test a failed save and a disk-full/permission-denied path.
- [ ] Test install, upgrade from the previous version, and uninstall.
- [ ] Verify project migration from the previous public build.

**Pass:** Every mandatory test has a date, machine/audio-device details, measured result, and an artifact or screenshot where relevant.

**Fail if:** any test is only “it seemed to work,” has no target-machine evidence, or leaves project data at risk.

---

## G5 — AI economics, privacy, and failure handling (P0 for paid release)

**Current status:** PARTIAL

**Why:** A distributed app cannot depend on the owner's API key or an environment file that ordinary customers will not edit.

- [ ] Choose BYOK in Settings or a hosted proxy with per-user quotas; do not ship the owner's key.
- [ ] If hosted: define cost per request, hard caps, abuse controls, and billing responsibility.
- [ ] If BYOK: provide an in-app key entry, validation, removal, and clear "AI disabled" fallback.
- [ ] Disclose what is sent to the AI provider and whether it is retained.
- [ ] Verify all AI features degrade to the local planner/rules when no key or no network exists.
- [ ] Test rate-limit and provider-error messages; never leave a spinner or silent failure.
- [ ] Confirm no AI route creates or replaces audio contrary to the feature truth table.
- [ ] Add a privacy-safe diagnostic that does not log keys or full user prompts.

**Pass:** A customer without a key can use the app's local features, and a customer with a key cannot cause unbounded owner cost or expose credentials.

---

## G6 — Onboarding, documentation, and support (P1, required for 1.0)

**Current status:** PARTIAL (welcome flow, templates, and manual exist)

- [ ] A first-run path that gets a new user to audible playback in under five minutes.
- [ ] A demo project that demonstrates recording, rack patching, mixing, and export without requiring external samples.
- [ ] A short guided tour or contextual tips that can be dismissed permanently.
- [ ] A known-issues page with workarounds.
- [ ] A support intake channel and a stated response target.
- [ ] License recovery instructions outside the app.
- [ ] A backup/export explanation so users know where projects live.
- [ ] Documentation links from the relevant screens, not only a PDF.

**Pass:** Three people unfamiliar with the app complete the first-run path and one export without live help.

---

## G7 — Market validation and launch readiness (P1, required for 1.0)

**Current status:** NOT STARTED

**Why:** Technical readiness does not prove willingness to pay.

- [ ] Recruit 20–50 beta users from the target audience (Reason-style modular workflow, hobbyist/project studios).
- [ ] Publish a landing page with real audio/video demonstrations, requirements, limitations, and pricing.
- [ ] Run a pricing/willingness-to-pay test before building more devices.
- [ ] Measure activation: download → first sound → first saved project → first export.
- [ ] Measure refund requests, support contacts per 100 users, and crash/blocker rate.
- [ ] Collect at least five specific testimonials or case studies.
- [ ] Decide the target segment explicitly; do not market as a pro VST host without native hosting.
- [ ] Hold a go/no-go review with the evidence, not a feature count.

**Pass:** There is evidence of repeat use and willingness to pay in a defined segment, and support load is sustainable.

**Fail if:** the only evidence is downloads, compliments, or feature comparisons.

---

## Paid-release minimum

Do not accept money until all of the following are true:

1. G0 is signed and the exact artifact is reproducible.
2. G1 legal/content review is signed.
3. G2 purchase, activation, offline grace, recovery, and refund paths pass.
4. G3 signing, installer, checksums, and update/manual-update path pass.
5. G4 clean-machine hardware, performance, save/reopen, and recovery checks pass.
6. G5 AI key handling and cost controls pass.

G6 and G7 are required before calling it 1.0, but they do not replace the release gates above.

## Commercial model to validate

- **Free beta:** build trust and collect real workflow evidence; no payment.
- **Paid founding license:** one-time license with a defined update window; two-machine activation; offline grace; clear refund policy.
- **Paid upgrades:** major versions, not forced subscriptions.
- **Expansion packs:** only rights-cleared instruments/content with attribution.
- **Subscription:** only if you host AI, cloud sync, or other recurring-cost services. Do not add it just because other DAWs do.

## Evidence log

Record each gate result here or link to a separate artifact. Do not replace dates and measurements with a status word.

| Gate | Artifact / test | Machine or environment | Date | Result |
| --- | --- | --- | --- | --- |
| G0 |  |  |  |  |
| G1 |  |  |  |  |
| G2 |  |  |  |  |
| G3 |  |  |  |  |
| G4 |  |  |  |  |
| G5 |  |  |  |  |
| G6 |  |  |  |  |
| G7 |  |  |  |  |

## Stop conditions

Stop the launch and fix the cause if any of these occur:

- A reproducible project-loss or project-corruption bug.
- A signed build is not reproducible from the release tag.
- A sold artifact contains unlicensed content or private local data.
- License activation leaves a paying customer unable to open the app offline.
- An update can remove or overwrite projects without explicit consent.
- A release claim cannot be demonstrated in the shipped build.

This checklist is product and operations guidance, not legal advice. Have qualified counsel review the EULA, privacy policy, refund terms, and content licenses before accepting payment.
