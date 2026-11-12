/**
 * Piano roll + sounds. Drop an audio file (from the desktop) or a browser row (stem, sample, project
 * audio, instrument) on the roll: audio becomes the edited part's sound on all 128 keys, pitched from
 * its root note, an instrument becomes the part's instrument (its notes stay) — or either becomes a
 * new part (drum kits, or "New part"). The part's sample bar (root, tune, ADSR, loop points, gate /
 * one-shot / loop) sits above the roll; the browser beside it lists the sounds.
 */
import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { audioEngine } from '../../../audio/AudioEngine.ts';
import type { BaseDevice } from '../../../audio/BaseDevice.ts';
import type { SequencerTrack } from '../../../audio/types.ts';
import { drumLanesFor } from '../../../audio/drumLanes.ts';
import { loadKeySampleFile } from '../../../audio/deviceSamples.ts';
import { createSamplerPart, noteName } from '../../../audio/stemLibraryClient.ts';
import { DeviceSampleBar, isAudioFile } from '../../../rack/DeviceSampleBar.tsx';
import { Browser, type BrowserAction } from '../../../browser/Browser.tsx';
import { BROWSER_DRAG_TYPE, entryForKey, isAudioEntry, type BrowserEntry, type BrowserSection } from '../../../browser/entries.ts';
import { loadAsSound } from '../../../browser/entryActions.ts';
import { swapPartInstrument } from '../../../workstation/swapPatch.ts';
import { toast } from '../../../shell/toast.ts';

const PREF = 'unbox.soundsDock';
const DOCK_SECTIONS: BrowserSection[] = ['stems', 'samples', 'project', 'instruments'];
const readOpen = () => {
  try {
    return window.localStorage.getItem(PREF) !== 'closed';
  } catch {
    return true;
  }
};

interface Props {
  track: SequencerTrack;
  device: BaseDevice | null | undefined;
  /** Select a part (by its device) in the piano roll, after a new part was made. */
  onSelectPart: (deviceId: string) => void;
  children: React.ReactNode;
}

const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes(BROWSER_DRAG_TYPE);

export function SamplerDock({ track, device, onSelectPart, children }: Props) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpenState] = useState(readOpen);
  const [newPart, setNewPart] = useState(false);
  const kit = !!drumLanesFor(device ?? undefined);
  const toNewPart = newPart || kit || !device;

  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      window.localStorage.setItem(PREF, v ? 'open' : 'closed');
    } catch {
      // private window: this session only
    }
  };

  /** The device that gets a sound: this part, or a new sampler part (selected in the roll). */
  const destination = (name: string): { id: string; part: string } => {
    if (!toNewPart && device) return { id: device.id, part: track.name };
    const id = createSamplerPart(name);
    onSelectPart(id);
    return { id, part: audioEngine.tracks.find((x) => x.deviceId === id)?.name ?? name };
  };

  const actionsFor = (e: BrowserEntry): BrowserAction[] => {
    if (isAudioEntry(e)) {
      return [
        {
          label: toNewPart ? '+ Part' : 'Load',
          title: toNewPart ? 'A new sampler part that plays this sound across the keys' : `${track.name} plays this sound across the keys (its notes stay)`,
          run: async () => {
            const dest = destination(e.name);
            return `${await loadAsSound(e, dest.id)} — playing on ${dest.part}`;
          },
        },
      ];
    }
    const r = e.ref;
    if (r.kind === 'builtin' && r.role === 'instrument') {
      return [
        {
          label: toNewPart ? '+ Part' : 'Use',
          title: toNewPart ? 'Add a new part with this instrument' : `${track.name} plays this instrument (its notes stay)`,
          run: () => {
            if (!toNewPart) {
              const dev = swapPartInstrument(track, r.type, r.name);
              if (!dev) throw new Error(`Could not swap ${track.name}'s instrument`);
              onSelectPart(dev.id);
              return `${track.name} now plays ${r.name}`;
            }
            const dev = audioEngine.runStructuralEdit('Add part', () => audioEngine.createDevice(r.type, r.name));
            onSelectPart(dev.id);
            return `Added ${dev.name}`;
          },
        },
      ];
    }
    return [];
  };

  const run = async (action: BrowserAction) => {
    setBusy(true);
    try {
      const msg = await action.run();
      if (typeof msg === 'string' && msg) toast(msg, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadFile = (file: File) =>
    run({
      label: 'Load',
      run: async () => {
        if (!isAudioFile(file)) throw new Error(`${file.name} is not an audio file`);
        const dest = destination(file.name.replace(/\.[^.]+$/, ''));
        const s = await loadKeySampleFile(dest.id, file).catch(() => {
          throw new Error(`${file.name} could not be decoded (WAV, MP3, OGG, Opus, FLAC and M4A/AAC work)`);
        });
        audioEngine.changed();
        return `${file.name}: root ${noteName(s.root)}, ${s.loop ? 'loop' : s.mode === 'oneShot' ? 'one-shot' : 'gate'} — playing on ${dest.part}`;
      },
    });

  const dropEntry = (key: string) => {
    const entry = entryForKey(key);
    const action = entry ? actionsFor(entry)[0] : undefined;
    if (action && !entry?.blocked) void run(action);
    else toast(entry ? (entry.blocked ?? `${entry.name} cannot be played on the piano roll`) : 'That item is no longer in the browser', 'error');
  };

  return (
    <div className="flex-1 min-h-[320px] flex" data-testid="sampler-dock">
      <div className="flex-1 min-w-0 flex flex-col">
        {device && (
          <div className="px-2 pt-1 bg-[#100d0a]">
            <DeviceSampleBar device={device} />
          </div>
        )}
        <div
          className="relative flex-1 min-h-0 flex flex-col"
          onDragOver={(e) => {
            if (!accepts(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (!over) setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={(e) => {
            if (!accepts(e)) return;
            e.preventDefault();
            setOver(false);
            const key = e.dataTransfer.getData(BROWSER_DRAG_TYPE);
            if (key) dropEntry(key);
            else {
              const f = e.dataTransfer.files[0];
              if (f) void loadFile(f);
            }
          }}
          data-testid="piano-roll-drop"
        >
          {children}
          {(over || busy) && (
            <div className="absolute inset-0 z-20 pointer-events-none grid place-items-center bg-black/55 ring-2 ring-inset ring-[#e1bc7e]">
              <div className="rounded-[6px] bg-[#17120e] border border-black px-4 py-3 text-center">
                <div className="font-label font-bold text-[18px] text-[#e1bc7e]">{busy ? 'Loading…' : 'Drop to play it on the piano roll'}</div>
                <div className="font-label text-[13px] text-[#c9ced4]">
                  {toNewPart ? 'It becomes a new part' : `It becomes the sound of ${track.name}`}; audio plays across all 128 keys from its root note.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {open ? (
        <aside className="w-[320px] shrink-0 flex flex-col min-h-0 border-l border-black bg-gradient-to-b from-[#1a140e] to-[#0d0a07]" aria-label="Sounds" data-testid="sounds-dock">
          <div className="flex items-center gap-2 px-2 pt-2">
            <span className="font-label font-bold text-[13px] tracking-wider text-[#e1bc7e] flex-1">SOUNDS</span>
            <div className="load-seg" role="group" aria-label="Load into">
              <button type="button" aria-pressed={!toNewPart} disabled={kit || !device} onClick={() => setNewPart(false)} title={kit ? 'A drum kit keeps its pads: sounds go to a new part' : `Load into ${track.name} (its notes stay)`}>
                This part
              </button>
              <button type="button" aria-pressed={toNewPart} onClick={() => setNewPart(true)} title="Each sound becomes a new part">
                New part
              </button>
            </div>
            <button type="button" className="bw-icon-btn" aria-label="Hide the sounds" title="Hide the sounds" onClick={() => setOpen(false)}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <Browser host="dock" layout="panel" sections={DOCK_SECTIONS} actionsFor={actionsFor} className="flex-1" />
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-[24px] shrink-0 bg-gradient-to-b from-[#261d14] to-[#17120e] border-l border-black text-[#e1bc7e] font-label font-bold text-[11px] tracking-widest [writing-mode:vertical-rl]"
          aria-label="Show the sounds"
          title="Sounds: drag them onto the piano roll"
        >
          SOUNDS
        </button>
      )}
    </div>
  );
}
