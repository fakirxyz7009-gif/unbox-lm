# Unbox Studio — Windows

## Get the .exe
1. Install Node.js LTS from https://nodejs.org (one time).
2. Double-click **build-exe.bat**. It installs everything and builds `release\Unbox-Studio-Setup-1.0.0.exe`. Run that installer once; the installed app then starts immediately instead of unpacking itself on every launch.
3. Launch **Unbox Studio** from the Start menu or the desktop shortcut (both created by the installer).

## Run without building an exe
Double-click **run-app.bat** (opens the app in a desktop window).

## Release checklist

1. Build the full installer with `npm run dist:win`.
2. Smoke-test the installed full build:

   ```bat
   npm run test:full-installed -- release\Unbox-Studio-Setup-1.0.0.exe
   ```

   This installs into a temporary per-user folder, launches with a disposable
   profile, verifies the full catalog plus local library and stems, checks the
   API and renderer, then uninstalls and removes the test files. It does not
   replace a manual installer-UI or audio-output check.
3. For a share release, build and test that artifact separately:

   ```bat
   npm run dist:win:share
   npm run test:share-installed -- release\Unbox-Studio-Share-Setup-1.0.0.exe
   ```

   The share build already runs its browser runtime gate before packaging; the
   installed check adds archive and share-content verification. Rebuild the full
   local build with `npm run dist:win` afterward if needed.

## Plugin library (D:\vsr)
- Index the library once: `npm run scan:vsr` (or **Rack → Library → Scan now / Rescan**).
  The scan only reads file headers and sizes. It never runs plugins or installers and never extracts archives.
- Another folder: set `VST_LIBRARY_ROOTS=E:\plugins;D:\vsr` in `.env`, or `npm run scan:vsr -- --root "E:\plugins"`.
- Mounted plugins and Kontakt instruments play a Web Audio stand-in sound (labelled **PROXY DSP**): a browser
  engine can't load native VST/VST3 binaries. Cables, CV, macros and the AI all work with them.

## AI control tools
- The desktop build includes the AI Co-Pilot and AI Combinator (rack toolbar). They can suggest MIDI, device settings, automation, rack plans and mix notes.
- They never create, render or replace audio. Sound always comes from the local Web Audio engine and recorded packs/imported files.
- Put `GEMINI_API_KEY=...` in a `.env` file in the project folder. Without a key, the AI Combinator uses its built-in local planner.

## Notes
- **Tab** flips the rack between front panels and the rear patch bay; drag cables between jacks on the rear.
- Use **Connect MIDI** or **Settings → MIDI** to grant MIDI permission. If no input appears after permission is allowed, reconnect with a direct USB data cable, confirm it in Windows MIDI/USB devices, then choose **Rescan MIDI**.
- Saving: **File → Save project (.json)** and **File → Open project…** (includes library units, CV cables and Combinators).
