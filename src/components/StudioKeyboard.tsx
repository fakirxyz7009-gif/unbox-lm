import React, { useState, useEffect, useRef } from 'react';
import { BaseDevice } from '../audio/BaseDevice.ts';
import { ChevronLeft, ChevronRight, Music } from 'lucide-react';

interface StudioKeyboardProps {
  devices: BaseDevice[];
  activeDeviceId: string | null;
  onSelectDevice: (id: string) => void;
}

export const StudioKeyboard: React.FC<StudioKeyboardProps> = ({
  devices,
  activeDeviceId,
  onSelectDevice,
}) => {
  useEffect(() => {
    console.log('StudioKeyboard: Active device changed to', activeDeviceId);
  }, [activeDeviceId]);
  const [octave, setOctave] = useState(4); // C4 = 60
  const [sustain, setSustain] = useState(false);
  const [pitchBend, setPitchBend] = useState(0); // -1 to 1
  const [modWheel, setModWheel] = useState(0);   // 0 to 1
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  // Find currently targeted instrument
  const playableInstruments = devices.filter(
    (d) => typeof (d as any).noteOn === 'function'
  );

  const currentSynth =
    devices.find((d) => d.id === activeDeviceId) || playableInstruments[0] || null;

  const playNote = (midi: number) => {
    if (!currentSynth || !currentSynth.noteOn) return;
    if (currentSynth.ctx && currentSynth.ctx.state === 'suspended') {
      currentSynth.ctx.resume();
    }
    currentSynth.noteOn(midi, 0.88);
    setActiveNotes((prev) => new Set(prev).add(midi));
  };

  const stopNote = (midi: number) => {
    if (!currentSynth || !currentSynth.noteOff) return;
    if (!sustain) {
      currentSynth.noteOff(midi);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(midi);
        return next;
      });
    }
  };

  // Keyboard mapping
  const KEY_MAP: Record<string, number> = {
    KeyA: 0,  // C
    KeyW: 1,  // C#
    KeyS: 2,  // D
    KeyE: 3,  // D#
    KeyD: 4,  // E
    KeyF: 5,  // F
    KeyT: 6,  // F#
    KeyG: 7,  // G
    KeyY: 8,  // G#
    KeyH: 9,  // A
    KeyU: 10, // A#
    KeyJ: 11, // B
    KeyK: 12, // C+1
    KeyO: 13, // C#+1
    KeyL: 14, // D+1
    KeyP: 15, // D#+1
    Semicolon: 16, // E+1
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return;

      if (e.code === 'KeyZ') {
        setOctave((o) => Math.max(1, o - 1));
        return;
      }
      if (e.code === 'KeyX') {
        setOctave((o) => Math.min(7, o + 1));
        return;
      }

      const offset = KEY_MAP[e.code];
      if (offset !== undefined) {
        const root = (octave + 1) * 12;
        playNote(root + offset);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const offset = KEY_MAP[e.code];
      if (offset !== undefined) {
        const root = (octave + 1) * 12;
        stopNote(root + offset);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [octave, currentSynth, sustain]);

  // Render 2 full octaves (25 keys: C to C)
  const rootNote = (octave + 1) * 12;
  const whiteKeys = [
    { offset: 0, label: 'C', keyHint: 'A' },
    { offset: 2, label: 'D', keyHint: 'S' },
    { offset: 4, label: 'E', keyHint: 'D' },
    { offset: 5, label: 'F', keyHint: 'F' },
    { offset: 7, label: 'G', keyHint: 'G' },
    { offset: 9, label: 'A', keyHint: 'H' },
    { offset: 11, label: 'B', keyHint: 'J' },
    { offset: 12, label: 'C', keyHint: 'K' },
    { offset: 14, label: 'D', keyHint: 'L' },
    { offset: 16, label: 'E', keyHint: ';' },
    { offset: 17, label: 'F', keyHint: '' },
    { offset: 19, label: 'G', keyHint: '' },
    { offset: 21, label: 'A', keyHint: '' },
    { offset: 23, label: 'B', keyHint: '' },
    { offset: 24, label: 'C', keyHint: '' },
  ];

  const blackKeys = [
    { offset: 1, pos: 'left-[4.8%]', keyHint: 'W' },
    { offset: 3, pos: 'left-[11.4%]', keyHint: 'E' },
    { offset: 6, pos: 'left-[24.8%]', keyHint: 'T' },
    { offset: 8, pos: 'left-[31.4%]', keyHint: 'Y' },
    { offset: 10, pos: 'left-[38.2%]', keyHint: 'U' },
    { offset: 13, pos: 'left-[51.5%]', keyHint: 'O' },
    { offset: 15, pos: 'left-[58.2%]', keyHint: 'P' },
    { offset: 18, pos: 'left-[71.6%]', keyHint: '' },
    { offset: 20, pos: 'left-[78.3%]', keyHint: '' },
    { offset: 22, pos: 'left-[85%]', keyHint: '' },
  ];

  return (
    <div className="w-full bg-neutral-950 border-t border-neutral-800 shadow-2xl px-4 py-2 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
      {/* Wheels & Transpose Controls */}
      <div className="flex items-center space-x-4">
        {/* Pitch Bend & Mod Wheels */}
        <div className="flex space-x-2">
          {/* Pitch Bend Wheel */}
          <div className="flex flex-col items-center">
            <div
              className="w-5 h-20 bg-neutral-900 border border-neutral-700 rounded-sm relative cursor-ns-resize shadow-inner overflow-hidden"
              onMouseDown={(e) => {
                const startY = e.clientY;
                const onMove = (ev: MouseEvent) => {
                  const delta = (startY - ev.clientY) / 40;
                  setPitchBend(Math.max(-1, Math.min(1, delta)));
                };
                const onUp = () => {
                  setPitchBend(0); // spring back
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
              title="Pitch Bend Wheel (Spring-loaded)"
            >
              <div
                className="absolute inset-x-0 h-4 bg-gradient-to-b from-neutral-300 to-neutral-600 rounded-sm shadow-md transition-all duration-75"
                style={{ top: `${(1 - pitchBend) * 32}%` }}
              />
            </div>
            <span className="text-[8px] font-mono font-bold text-neutral-500 mt-1">PITCH</span>
          </div>

          {/* Modulation Wheel */}
          <div className="flex flex-col items-center">
            <div
              className="w-5 h-20 bg-neutral-900 border border-neutral-700 rounded-sm relative cursor-ns-resize shadow-inner overflow-hidden"
              onMouseDown={(e) => {
                const startY = e.clientY;
                const startVal = modWheel;
                const onMove = (ev: MouseEvent) => {
                  const delta = (startY - ev.clientY) / 60;
                  setModWheel(Math.max(0, Math.min(1, startVal + delta)));
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
              title="Modulation Wheel"
            >
              <div
                className="absolute inset-x-0 h-4 bg-gradient-to-b from-amber-400 to-amber-600 rounded-sm shadow-md transition-all duration-75"
                style={{ top: `${(1 - modWheel) * 64}%` }}
              />
            </div>
            <span className="text-[8px] font-mono font-bold text-neutral-500 mt-1">MOD</span>
          </div>
        </div>

        {/* Target Instrument Selector */}
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-neutral-400 uppercase font-bold flex items-center space-x-1 mb-1">
            <Music className="w-3 h-3 text-amber-400" />
            <span>PLAYABLE INSTRUMENT</span>
          </span>
          <select
            value={currentSynth?.id || ''}
            onChange={(e) => onSelectDevice(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 text-xs text-neutral-200 px-2 py-1 rounded font-mono focus:outline-none focus:border-amber-500 w-44 truncate"
          >
            {playableInstruments.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>

          <div className="flex items-center space-x-2 mt-2">
            <div className="flex items-center bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-xs font-mono">
              <button
                onClick={() => setOctave((o) => Math.max(1, o - 1))}
                className="p-1 hover:text-white text-neutral-400"
                title="Octave Down (Z)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-amber-400 font-bold">OCT C{octave}</span>
              <button
                onClick={() => setOctave((o) => Math.min(7, o + 1))}
                className="p-1 hover:text-white text-neutral-400"
                title="Octave Up (X)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() => setSustain((s) => !s)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
                sustain
                  ? 'bg-amber-950 border-amber-600 text-amber-300'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              SUSTAIN {sustain ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* 2-Octave Physical Keyboard Layout */}
      <div className="relative w-full max-w-2xl h-24 flex bg-neutral-950 rounded border-2 border-neutral-800 shadow-2xl overflow-hidden">
        {/* White Keys */}
        {whiteKeys.map((k) => {
          const midi = rootNote + k.offset;
          const isPressed = activeNotes.has(midi);

          return (
            <button
              key={midi}
              onMouseDown={() => playNote(midi)}
              onMouseUp={() => stopNote(midi)}
              onMouseLeave={() => stopNote(midi)}
              className={`flex-1 h-full rounded-b-sm border-r border-neutral-400/40 relative flex flex-col justify-end items-center pb-1 transition-all duration-75 ${
                isPressed
                  ? 'bg-amber-100 shadow-inner translate-y-0.5'
                  : 'bg-gradient-to-b from-neutral-200 to-white hover:bg-neutral-100 shadow'
              }`}
            >
              <span className="text-[9px] font-bold font-mono text-neutral-800">{k.label}</span>
              {k.keyHint && (
                <span className="text-[7px] font-mono text-neutral-400 font-bold">[{k.keyHint}]</span>
              )}
            </button>
          );
        })}

        {/* Black Keys */}
        {blackKeys.map((bk) => {
          const midi = rootNote + bk.offset;
          const isPressed = activeNotes.has(midi);

          return (
            <button
              key={midi}
              onMouseDown={(e) => {
                e.stopPropagation();
                playNote(midi);
              }}
              onMouseUp={(e) => {
                e.stopPropagation();
                stopNote(midi);
              }}
              onMouseLeave={() => stopNote(midi)}
              className={`absolute top-0 w-[4.6%] h-[60%] rounded-b-sm z-10 flex flex-col justify-end items-center pb-1 transition-all duration-75 ${bk.pos} ${
                isPressed
                  ? 'bg-amber-600 shadow-inner'
                  : 'bg-gradient-to-b from-neutral-800 via-neutral-900 to-black hover:bg-neutral-800 shadow-lg border-x border-b border-black'
              }`}
            >
              {bk.keyHint && (
                <span className="text-[7px] font-mono text-neutral-400 font-bold">[{bk.keyHint}]</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
