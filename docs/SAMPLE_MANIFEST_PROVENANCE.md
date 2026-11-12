# Multi-sample cache provenance

`/samples/sample-manifest.json` is an optional development cache, not proof that
the WAV files are performances by real musicians. The application only admits a
cache to `RealMultiSampler` when its manifest declares all of the following:

- `provenance.sourceKind: "recorded"`;
- a non-empty original `source`;
- a non-empty `license`; and
- a non-empty `performer` or rights-holder field (plus `attribution` for CC-BY).

Missing provenance is `unknown`. `unknown` and `synthesized` manifests are not
loaded through the recorded-instrument path. The Electron/API server also does
not mount an unadmitted cache at `/samples`.

The recorded packs under `public/instruments/` have their own per-pack metadata,
licensing policy, credits, and share-build filtering. They are the supported
route for real-musician sample content. The existing large cache generator
(`scripts/generate-30gb-library.ts`) and the legacy-named
`scripts/fetch-real-samples.ts` generate synthetic DSP test audio; neither
downloads, verifies, or credits a recording source.

To add a genuine recording cache, keep auditable source/rights evidence with the
project and write a manifest like:

```json
{
  "version": 1,
  "generatedAt": "2026-11-10T00:00:00.000Z",
  "sampleBaseUrl": "/samples/",
  "provenance": {
    "sourceKind": "recorded",
    "source": "Recording-session or licensed-library identifier",
    "license": "CC-BY-4.0",
    "performer": "Named performer or rights holder",
    "attribution": "Required credit text"
  },
  "devices": {}
}
```

For redistributable content, use the existing recorded-pack pipeline and accept
only the licenses it permits. Never use commercial songs, separated song stems,
or a filename as a substitute for provenance.
