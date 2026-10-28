/**
 * Full-width workstation keyboard: pitch and mod wheels, 49–88 keys depending on the space,
 * velocity from where you click (lower on the key = harder), octave for the computer keys
 * (Z / X), HOLD. Plays the selected part and every linked part; lights the keys the sequencer
 * is playing on the selected part and the keys held on a MIDI keyboard, whose wheels move the
 * on-screen wheels.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import type { SequencerTrack } from '../audio/types.ts';
import { setModWheel, setPitchBend } from '../audio/expression.ts';
import { useFrame } from '../nexa/useEngine.ts';
import { useUi } from '../shell/uiStore.ts';
import { capturePointer } from '../ui/skin/pointer.ts';

const KEY_MAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};
const BLACK = new Set([1, 3, 6, 8, 10]);
/** Key ranges by width: [first MIDI note, last MIDI note]. */
const RANGES: [number, number, number][] = [
  [1180, 21, 108],
  [1000, 28, 103],
  [800, 36, 96],
  [0, 48, 96],
];

interface Props {
  dev: BaseDevice | null;
  track: SequencerTrack | null;
}

/** Puts a wheel's thumb at `v` (pitch −1..1, mod 0..1); writes only on change. */
function showWheel(el: HTMLDivElement | null, v: number, bipolar: boolean): void {
  if (!el) return;
  const top = `calc(${((bipolar ? (1 - v) / 2 : 1 - v) * 100).toFixed(1)}% - 5px)`;
  if (el.style.top !== top) el.style.top = top;
  el.parentElement?.setAttribute('aria-valuenow', v.toFixed(2));
}

export const WorkstationKeyboard: React.FC<Props> = ({ dev, track }) => {
  const ui = useUi();
  const boxRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<[number, number]>([36, 96]);
  const [octave, setOctave] = useState(4);
  const [hold, setHold] = useState(false);
  // wheel positions live in the DOM (the hardware wheels move them up to 60× a second)
  const pitchThumb = useRef<HTMLDivElement>(null);
  const modThumb = useRef<HTMLDivElement>(null);
  const held = useRef(new Map<number, BaseDevice[]>());
  const keyNotes = useRef(new Map<string, number>());
  const holdRef = useRef(hold);
  holdRef.current = hold;

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // width from the observer (after layout, before paint) instead of a forced clientWidth read
    const ro = new ResizeObserver(([entry]) => {
      const w = entry ? entry.contentRect.width : el.clientWidth;
      const r = RANGES.find(([min]) => w >= min) ?? RANGES[RANGES.length - 1];
      setRange((cur) => (cur[0] === r[1] && cur[1] === r[2] ? cur : [r[1], r[2]]));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const light = (note: number, on: boolean) => {
    const el = keysRef.current?.querySelector<HTMLElement>(`[data-note="${note}"]`);
    if (el) el.dataset.on = String(on);
  };
  const noteOn = (note: number, vel: number) => {
    if (!dev || held.current.has(note)) return;
    const targets = audioEngine.liveFanout(dev);
    targets.forEach((d) => audioEngine.liveNoteOn(d, note, vel));
    audioEngine.recordNoteToTrack(dev.id, note, vel);
    held.current.set(note, targets);
    light(note, true);
  };
  const noteOff = (note: number, force = false) => {
    if (holdRef.current && !force) return;
    const targets = held.current.get(note);
    if (!targets) return;
    targets.forEach((d) => audioEngine.liveNoteOff(d, note));
    held.current.delete(note);
    if (!audioEngine.midi.held.has(note)) light(note, false);
  };
  const releaseAll = () => [...held.current.keys()].forEach((n) => noteOff(n, true));

  // switching parts lets go of everything the previous part was holding
  useEffect(() => releaseAll, [dev?.id]);

  // computer-keyboard piano (only while "KEYS" is on)
  useEffect(() => {
    if (!ui.qwertyPiano) return;
    const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || typing(e.target)) return;
      if (e.code === 'KeyZ') {
        releaseAll();
        return setOctave((o) => Math.max(1, o - 1));
      }
      if (e.code === 'KeyX') {
        releaseAll();
        return setOctave((o) => Math.min(7, o + 1));
      }
      const off = KEY_MAP[e.code];
      if (off === undefined) return;
      const n = (octave + 1) * 12 + off;
      keyNotes.current.set(e.code, n);
      noteOn(n, 0.8);
    };
    const up = (e: KeyboardEvent) => {
      const n = keyNotes.current.get(e.code);
      if (n === undefined) return;
      keyNotes.current.delete(e.code);
      noteOff(n);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', releaseAll);
    };
  }, [ui.qwertyPiano, octave, dev]);

  // keys the sequencer is playing on this part (pattern steps) and keys held on a MIDI keyboard
  const lastSeq = useRef<number | null>(null);
  const midiLit = useRef(new Set<number>());
  const midiSeen = useRef(-1);
  const shown = (n: number) => held.current.has(n) || midiLit.current.has(n);
  useFrame(() => {
    const midi = audioEngine.midi;
    if (midi.version !== midiSeen.current) {
      midiSeen.current = midi.version;
      for (const n of midiLit.current) if (!midi.held.has(n)) {
        midiLit.current.delete(n);
        if (!shown(n) && n !== lastSeq.current) light(n, false);
      }
      for (const n of midi.held) if (!midiLit.current.has(n)) {
        midiLit.current.add(n);
        light(n, true);
      }
      showWheel(pitchThumb.current, midi.pitch, true);
      showWheel(modThumb.current, midi.mod, false);
    }
    let n: number | null = null;
    if (audioEngine.isPlaying && track) {
      const len = track.steps.length || 16;
      n = track.steps[audioEngine.currentStep % len]?.note ?? null;
    }
    if (n === lastSeq.current) return;
    if (lastSeq.current !== null && !shown(lastSeq.current)) light(lastSeq.current, false);
    if (n !== null) light(n, true);
    lastSeq.current = n;
  });

  const wheel = (label: string, ref: React.RefObject<HTMLDivElement | null>, bipolar: boolean, set: (v: number) => void, springBack: boolean) => {
    const apply = (v: number) => {
      showWheel(ref.current, v, bipolar);
      set(v);
    };
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="font-label font-bold text-[13px] text-ink">{label}</span>
        <div
          className="us-wheel relative w-[26px] flex-1 min-h-[70px] cursor-ns-resize"
          role="slider"
          aria-label={label === 'PITCH' ? 'Pitch bend' : 'Mod wheel'}
          aria-valuemin={bipolar ? -1 : 0}
          aria-valuemax={1}
          onPointerDown={(e) => {
            const el = e.currentTarget;
            capturePointer(el, e.pointerId);
            const r = el.getBoundingClientRect();
            const move = (y: number) => {
              const f = 1 - Math.max(0, Math.min(1, (y - r.top) / r.height));
              apply(bipolar ? f * 2 - 1 : f);
            };
            move(e.clientY);
            el.onpointermove = (ev) => move(ev.clientY);
            el.onpointerup = () => {
              el.onpointermove = null;
              if (springBack) apply(0);
            };
          }}
        >
          <div
            ref={ref}
            className="absolute left-[3px] right-[3px] h-[10px] rounded-[3px] bg-gradient-to-b from-[#d9dde2] to-[#6f757d] shadow"
            style={{ top: `calc(${bipolar ? 50 : 100}% - 5px)` }}
          />
        </div>
      </div>
    );
  };

  const [lo, hi] = range;
  const whites: number[] = [];
  for (let n = lo; n <= hi; n++) if (!BLACK.has(n % 12)) whites.push(n);
  const wPct = 100 / whites.length;
  const vel = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0.3, Math.min(1, 0.3 + 0.75 * ((e.clientY - r.top) / Math.max(1, r.height))));
  };
  const keyProps = (n: number) => ({
    'data-note': n,
    onPointerDown: (e: React.PointerEvent) => {
      capturePointer(e.currentTarget, e.pointerId);
      noteOn(n, vel(e));
    },
    onPointerUp: () => noteOff(n),
    onPointerCancel: () => noteOff(n),
  });

  return (
    <div className="flex gap-3 items-stretch h-full min-h-0" data-testid="workstation-keyboard">
      <div className="flex gap-2 items-stretch pl-1 pb-1">
        {wheel('PITCH', pitchThumb, true, (v) => {
          if (dev) audioEngine.liveFanout(dev).forEach((d) => setPitchBend(d, v));
        }, true)}
        {wheel('MOD', modThumb, false, (v) => {
          if (dev) audioEngine.liveFanout(dev).forEach((d) => setModWheel(d, v));
        }, false)}
        <div className="flex flex-col justify-end gap-1 pb-0.5">
          <button type="button" className="us-btn rounded px-1.5 h-[20px] font-label font-bold text-[11px]" onClick={() => { releaseAll(); setOctave((o) => Math.min(7, o + 1)); }} title="Computer keys: octave up (X)">
            OCT +
          </button>
          <span className="text-center font-label font-bold text-[13px] text-ink">C{octave}</span>
          <button type="button" className="us-btn rounded px-1.5 h-[20px] font-label font-bold text-[11px]" onClick={() => { releaseAll(); setOctave((o) => Math.max(1, o - 1)); }} title="Computer keys: octave down (Z)">
            OCT −
          </button>
          <button
            type="button"
            className="us-btn rounded px-1.5 h-[20px] font-label font-bold text-[11px]"
            style={hold ? { background: 'linear-gradient(180deg,#7ff0ff,#18b8d6)', color: '#05222a' } : undefined}
            aria-pressed={hold}
            onClick={() => {
              if (hold) {
                holdRef.current = false;
                releaseAll();
              }
              setHold((h) => !h);
            }}
            title="Hold notes (sustain)"
          >
            HOLD
          </button>
        </div>
      </div>
      <div ref={boxRef} className="relative flex-1 min-w-0 rounded-b-[6px] overflow-hidden select-none" style={{ boxShadow: 'inset 0 6px 8px -4px rgba(0,0,0,0.7)', background: '#0d0e10' }}>
        <div ref={keysRef} className="absolute inset-0 pt-[3px]">
          {whites.map((n, i) => (
            <div key={n} {...keyProps(n)} className="us-key-white absolute top-[3px] bottom-0 rounded-b-[4px] cursor-pointer" style={{ left: `${i * wPct}%`, width: `calc(${wPct}% - 1px)` }}>
              {n % 12 === 0 && <span className="absolute bottom-1 left-0 right-0 text-center text-[11px] font-label font-bold text-[#8a8f96]">C{Math.floor(n / 12) - 1}</span>}
            </div>
          ))}
          {Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
            .filter((n) => BLACK.has(n % 12))
            .map((n) => {
              const wi = whites.findIndex((w) => w > n);
              return (
                <div
                  key={n}
                  {...keyProps(n)}
                  className="us-key-black absolute top-[3px] h-[60%] rounded-b-[3px] z-10 cursor-pointer"
                  style={{ left: `calc(${wi * wPct}% - ${wPct * 0.3}%)`, width: `${wPct * 0.6}%` }}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
};
