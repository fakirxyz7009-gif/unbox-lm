# Local recorded-audio library

The **Stem library** is deliberately an allow-list. It is for actual recordings with rights
information, not a way to collect arbitrary downloads, commercial-song separations, or
AI-generated audio. It never uploads a folder and a share build omits the entire local library.

A folder's files load once they are declared. There are two ways:

- **In the app** (the usual way): Browser → Stems → folder button → **Declare N files…** on the
  folder. Choose the rights (private, CC0 or CC BY with its credit), say who performs and where the
  recordings come from, and confirm that the files are recordings of real performances (or stems
  separated from them), not AI-generated audio. The declaration covers every file of the folder. It is
  kept in the app's data folder (`data/stem-declarations.json`), never written into the audio folder,
  and **Withdraw** removes it. It is the user's statement: the app records it and cannot verify it.
- **File by file**: put an `unbox-stem-library.json` file at the top of the folder. A per-file entry
  wins over the folder declaration, and a file this file refuses (for example `"sourceKind":
  "generated"`) stays out even when the folder is declared. Each audio or SFZ file needs an exact
  relative-path entry:

```json
{
  "files": {
    "piano/C4.wav": {
      "sourceKind": "recorded",
      "rights": "redistributable",
      "license": "CC0-1.0",
      "performer": "A. Musician (piano performance and recording)",
      "source": "https://example.org/cleared-piano"
    },
    "my-band/drums.wav": {
      "sourceKind": "recorded",
      "rights": "private",
      "license": "Custom",
      "performer": "My band",
      "source": "Original multitrack session, owned by the project"
    }
  }
}
```

`sourceKind` must be `recorded`. The scanner refuses `generated`, `unknown`, missing, or malformed
declarations. `rights` is either:

- `redistributable` — only `CC0-1.0` or a `CC-BY-*` SPDX license is accepted. CC-BY requires an
  `attribution` field.
- `private` — for recordings you own or have permission to use locally. They remain local and
  must not be put in a share build.

The manifest path must be relative to its folder and cannot escape it. SFZ programs and all of
their referenced samples need their own entries. The server streams only opaque IDs from this
verified index; it never mounts the source directory as a public static path.

Use the normal **Audio file** workflow for a one-off personal import. It does not make a licensing
claim or turn the file into a distributable sound pack; confirm you have the necessary rights
before sharing a project that contains it.
