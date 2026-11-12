# Unbox Studio — Windows

## Get the .exe
1. Install Node.js LTS from https://nodejs.org (one time).
2. Double-click **build-exe.bat**. It installs everything and builds `release\Unbox-Studio.exe` (portable, no installer).
3. Double-click `Unbox-Studio.exe` to run.

## Run without building an exe
Double-click **run-app.bat** (opens the app in a desktop window).

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
