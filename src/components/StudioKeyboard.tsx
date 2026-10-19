import React, { useState, useEffect } from 'react';
import { BaseDevice } from '../audio/BaseDevice.ts';
import { SequencerTrack } from '../audio/types.ts';
import { ChevronLeft, ChevronRight, Music } from 'lucide-react';

interface StudioKeyboardProps {
  devices: BaseDevice[];
  tracks?: SequencerTrack[];
  currentStep?: number;
  isPlaying?: boolean;
  activeDeviceId: string | null;
  onSelectDevice: (id: string) => void;
}

export const StudioKeyboard: React.FC<StudioKeyboardProps> = ({
  devices,
  tracks = [],
  currentStep = 0,
  isPlaying = false,
  activeDeviceId,
  onSelectDevice,
}) => {
  const [octave, setOctave] = useState(4); // C4 = 60
  const [sustain, setSustain] = useState(false);
  const [pitchBend, setPitchBend] = useState(0); // -1 to 1
  const [modWheel, setModWheel] = useState(0);   // 0 to 1
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  // Find currently targeted instrument (include all mounted instruments & devices except master)
  const playableInstruments = devices.filter(
    (d) => d.type !== 'master' && (typeof (d as any).noteOn === 'function' || d.type === 'redrum' || d.type === 'mimic')
  );

  const currentSynth =
    playableInstruments.find((d) => d.id === activeDeviceId) || playableInstruments[0] || null;

  // Ensure parent activeDeviceId stays initialized to a valid playable instrument
  useEffect(() => {
    if (!activeDeviceId && playableInstruments[0]) {
      onSelectDevice(playableInstruments[0].id);
    }
  }, [activeDeviceId, playableInstruments.length]);

  // Find sequencer note currently playing on the active track so the keyboard lights up in sync
  const activeTrack = currentSynth ? tracks.find((t) => t.deviceId === currentSynth.id) : null;
  const sequencerPlayingNote =
    isPlaying && activeTrack && activeTrack.steps[currentStep % (activeTrack.steps.length || 16)]
      ? activeTrack.steps[currentStep % (activeTrack.steps.length || 16)]!.note
      : null;

  const cycleInstrument = (dir: -1 | 1) => {
    if (playableInstruments.length === 0) return;
    const curIdx = playableInstruments.findIndex((d) => d.id === currentSynth?.id);
    const nextIdx = (curIdx + dir + playableInstruments.length) % playableInstruments.length;
    onSelectDevice(playableInstruments[nextIdx].id);
  };

  const playNote = (midi: number) => {
    if (!currentSynth) return;
    if (currentSynth.ctx && currentSynth.ctx.state === 'suspended') {
      currentSynth.ctx.resume();
    }
    if (typeof currentSynth.noteOn === 'function') {
      currentSynth.noteOn(midi, 0.88);
    } else if (typeof (currentSynth as any).triggerPad === 'function') {
      (currentSynth as any).triggerPad(((midi % 8) + 8) % 8, 0.9);
    }
    setActiveNotes((prev) => new Set(prev).add(midi));
  };

  const stopNote = (midi: number) => {
    if (!currentSynth) return;
    if (!sustain) {
      if (typeof currentSynth.noteOff === 'function') {
        currentSynth.noteOff(midi);
      }
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
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
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
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
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
    <div className="w-full bg-[#05080f] border-t border-cyan-500/30 shadow-[0_-10px_30px_rgba(0,0,0,0.85)] px-4 py-1.5 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
      {/* Wheels & Transpose Controls */}
      <div className="flex items-center space-x-4">
        {/* Pitch Bend & Mod Wheels */}
        <div className="flex space-x-2">
          {/* Pitch Bend Wheel */}
          <div className="flex flex-col items-center">
            <div
              className="w-4 h-16 bg-slate-950 border border-cyan-500/30 rounded-sm relative cursor-ns-resize shadow-inner overflow-hidden"
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
                className="absolute inset-x-0 h-3.5 bg-gradient-to-b from-cyan-300 to-cyan-600 rounded-sm shadow-md transition-all duration-75"
                style={{ top: `${(1 - pitchBend) * 32}%` }}
              />
            </div>
            <span className="text-[8px] font-mono font-bold text-slate-500 mt-0.5">PITCH</span>
          </div>

          {/* Modulation Wheel */}
          <div className="flex flex-col items-center">
            <div
              className="w-4 h-16 bg-slate-950 border border-cyan-500/30 rounded-sm relative cursor-ns-resize shadow-inner overflow-hidden"
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
                className="absolute inset-x-0 h-3.5 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-sm shadow-md transition-all duration-75"
                style={{ top: `${(1 - modWheel) * 64}%` }}
              />
            </div>
            <span className="text-[8px] font-mono font-bold text-slate-500 mt-0.5">MOD</span>
          </div>
        </div>

        {/* Target Instrument Selector (Synced with Piano Roll & Sequencer) */}
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-cyan-400 uppercase font-bold flex items-center space-x-1 mb-1">
            <Music className="w-3 h-3 text-cyan-400" />
            <span>LIVE SYNTH / INSTRUMENT ({playableInstruments.length}) [KEYS A–;]</span>
          </span>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => cycleInstrument(-1)}
              className="p-1 bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 rounded text-slate-300 hover:text-white"
              title="Previous Instrument"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <select
              value={currentSynth?.id || ''}
              onChange={(e) => onSelectDevice(e.target.value)}
              className="bg-slate-950 border border-cyan-500/50 text-xs text-cyan-200 font-bold px-2 py-1 rounded font-mono focus:outline-none focus:border-cyan-400 w-48 truncate cursor-pointer"
            >
              {playableInstruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => cycleInstrument(1)}
              className="p-1 bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 rounded text-slate-300 hover:text-white"
              title="Next Instrument"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center space-x-2 mt-1.5">
            <div className="flex items-center bg-slate-900 border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs font-mono">
              <button
                onClick={() => setOctave((o) => Math.max(1, o - 1))}
                className="p-0.5 hover:text-white text-slate-400"
                title="Octave Down [Shortcut: Z]"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-cyan-300 font-bold text-[10px]">OCT C{octave} [Z/X]</span>
              <button
                onClick={() => setOctave((o) => Math.min(7, o + 1))}
                className="p-0.5 hover:text-white text-slate-400"
                title="Octave Up [Shortcut: X]"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() => setSustain((s) => !s)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors ${
                sustain
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              HOLD {sustain ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* 2-Octave Physical Keyboard Layout */}
      <div className="relative w-full max-w-2xl h-24 flex bg-neutral-950 rounded border-2 border-neutral-800 shadow-2xl overflow-hidden">
        {/* White Keys */}
        {whiteKeys.map((k) => {
          const midi = rootNote + k.offset;
          const isPressed = activeNotes.has(midi) || sequencerPlayingNote === midi;

          return (
            <button
              key={midi}
              onMouseDown={() => playNote(midi)}
              onMouseUp={() => stopNote(midi)}
              onMouseLeave={() => stopNote(midi)}
              className={`flex-1 h-full rounded-b-sm border-r border-neutral-400/40 relative flex flex-col justify-end items-center pb-1 transition-all duration-75 ${
                isPressed
                  ? 'bg-emerald-300 shadow-[0_0_12px_#10b981] translate-y-0.5'
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
          const isPressed = activeNotes.has(midi) || sequencerPlayingNote === midi;

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
                  ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]'
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
