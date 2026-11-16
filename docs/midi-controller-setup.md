# Hardware MIDI controller setup

Status: the app side is proven (see *Proof* at the end); a controller that Windows never enumerates
cannot be detected by any browser code. This is the checklist from "cable plugged in" to "notes in the
piano roll", plus the diagnostics that say which of the three layers is at fault.

## The three layers

Each layer fails in its own way, and they are independent: fixing one does not fix the next.

| Layer | What it must do | What failure looks like |
| --- | --- | --- |
| Windows | enumerate the controller as a MIDI **input** | `midiInGetNumDevs` returns 0; no device node; nothing changes in Device Manager when plugged |
| Chrome | allow Web MIDI for the app's **origin** | `requestMIDIAccess()` rejects with `NotAllowedError`; the app reports `MIDI blocked` |
| Unbox Studio | open every enumerated input and bind it | status `ready` but zero ports; Settings · MIDI lists nothing |

## Checklist

### 1. Use a USB port that works

USB-MIDI class devices enumerate the moment they get power and a data path, so **any** working port
produces a device in Device Manager. Two traps:

- A port on a failed USB controller delivers no event at all. Check the controller's root hub:
  `Get-PnpDevice -Class USB | Where-Object InstanceId -like 'USB\ROOT_HUB30*'` must say `OK`.
  A root hub with `Problem Code 43` (`CM_PROB_FAILED_POST_START`) cannot enumerate anything; its ports
  stay dead until the hub is reinstalled or the machine is cold booted (Shut down, not Restart).
- Front-panel headers that are not connected look exactly like a dead port. Use a rear port on a
  controller whose other devices already work, for example the cluster hosting a working USB keyboard.

### 2. Confirm Windows sees a MIDI input

The number that matters is the native MIDI input count, not the device list. In PowerShell:

```powershell
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WinMM {
  [DllImport("winmm.dll")] public static extern uint midiInGetNumDevs();
}
'@
[WinMM]::midiInGetNumDevs()
```

- `1` or more: Windows has a MIDI input. Continue to step 3.
- `0`: nothing above the driver can help. Open Device Manager and plug the controller in while watching
  *Sound, video and game controllers* and *Universal Serial Bus controllers*.

What Device Manager shows tells you what to do:

| Device Manager shows | Meaning | Action |
| --- | --- | --- |
| The controller by name (e.g. `Impulse`), and a MIDI port appears | enumerated correctly | go to step 3 |
| **Unknown USB Device (Device Descriptor Request Failed)**, or a device that never finishes installing | the cable, the port power, or the controller's USB board failed before any driver could bind | try the cable from a known-working device, then another port on a healthy controller |
| Nothing at all, while a known-working device in the same socket does appear | the controller or its cable is faulty as hardware | test it on another computer to confirm |

Devices that expose **vendor-specific** USB interfaces (compatibility ID `Class_ff&SubClass_ff&Prot_ff`)
cannot use the generic USB MIDI driver; their registry node keeps `ConfigFlags` `0x40`
(`CONFIGFLAG_FAILEDINSTALL`) and no service until the vendor driver is installed. Uninstall the failed
node (with "delete the driver software" where offered), install the vendor driver, then *Scan for
hardware changes*.

### 3. Allow MIDI for the app's origin in Chrome

Web MIDI is a per-origin permission, and a refusal is remembered:

1. Open `chrome://settings/content/midiDevices`.
2. Add the app's origin (`http://localhost:3123` for `npm run dev`, or the port you use) and set **Allow**,
   or use the padlock in the address bar → *Site settings* → *MIDI devices* → *Allow*.
3. Reload the app. `Ask again` in Settings · MIDI cannot override a cached denial; only the settings page can.

Notes:

- `http://localhost` and `http://127.0.0.1` count as secure contexts, so a plain dev server is fine.
- A permission granted through DevTools/automation (`Browser.grantPermissions`, CDP) is **not** enough on
  Chromium: `navigator.permissions.query({name:'midi'})` reports `granted` and `requestMIDIAccess()` still
  rejects. The site setting has to allow the origin; that is why the physical probe writes it into its
  profile instead of granting it (`scripts/browser-probe-runner.cjs`, `allowMidiForOrigin`).
- The Electron build (`npm run electron`) is not affected: `electron/main.cjs` allows `midi` and
  `midiSysex` in its permission handler, so no prompt exists there.

### 4. Connect in the app

Settings · MIDI → **Connect MIDI** (pressing Record with an armed instrument track also requests access).
Expected: status `ready`, one row per connected input, and an activity log that shows incoming messages
when you play. A port held by another program shows "in use"; a refused permission shows `MIDI blocked`
with the settings hint.

The app requests nothing at startup, opens every input, rebinds on hot-plug, and maps notes to the
selected part (the selected instrument, else the first instrument).

### 5. Verify with the repository probes

| Command | What it proves | Without hardware |
| --- | --- | --- |
| `npm run test:browser-midi` | app MIDI path end to end with a **simulated** port: real engine, recorder, save/reopen | passes |
| `npm run test:browser-midi-bootstrap` | access is requested only after an explicit action | passes |
| `npm run test:browser-midi-hardware` | a real controller delivers notes through real Web MIDI | reports `SKIP · physical MIDI acceptance not run — <reason>` |
| `npm run test:browser-midi-hardware-headed` | same, headed, for a visible first-time run | same |
| `... -RequirePhysicalMidi` | fails instead of skipping on a machine that should have the controller | fails with the skip reason |

The physical probe pre-allows the MIDI site setting for its own profile, so its skip reason names the
missing hardware rather than a browser refusal. A skip that says "Browser MIDI access was refused"
means the permission layer failed; a skip that says "No <controller> input found" means Windows
enumerated nothing.

## Proof that the app side is sound

Measured on a machine with no MIDI hardware attached, so the only variable is the layer above the app:

```
npm run test:browser-midi
PASS - simulated MIDI recorded notes with normal and bypassed audio; both survived IndexedDB save/reopen
```

Real Chromium Web MIDI, site setting allowed for the origin, app engine driven directly:

```
raw requestMIDIAccess  -> { inputs: [], outputs: [] }
engine.midi.enable()   -> true
engine.midi.status     -> "ready"
engine.midi.ports      -> []
```

`ready` with an empty port list is the correct behaviour with zero inputs: enumeration and permission
succeeded, there was simply nothing to open. Any controller that Windows enumerates is bound by the same
path on the next `Connect MIDI` or hot-plug event.

## Symptom summary

| Symptom in the app | First thing to check |
| --- | --- |
| `MIDI blocked` | the origin's MIDI site setting (step 3) |
| `ready`, no ports | `midiInGetNumDevs` (step 2) and whether the port is on a healthy controller |
| a port shows "in use" | another program holds it (browser tab, DAW); close it and press Rescan MIDI |
| notes arrive but the wrong part plays | the selected part in the Workstation, and Settings · MIDI's control map |
