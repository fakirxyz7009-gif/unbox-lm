/** F8 MIDI tools: quantize, humanize, velocity, strum, legato, transpose and scale snap on a pattern. */
import React, { useState } from 'react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { humanize, legato, quantize, snapPitches, STRUM_MAX_MS, strum, transpose, velocity, type VelocityMode } from '../../audio/sequencer/midiTools.ts';
import { syncTrackPatterns } from '../../audio/sequencer/model.ts';
import type { SequencerNote } from '../../audio/types.ts';
import { useEngineVersion } from '../../nexa/useEngine.ts';
import { useEscapeKey } from '../../shell/useEscapeKey.ts';

function F8Body({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  useEngineVersion();
  const tracks = audioEngine.tracks.filter((t) => t.kind !== 'audio');
  const preferred = tracks.find((t) => t.deviceId === audioEngine.midiTargetDeviceId) ?? tracks[0];
  const [trackId, setTrackId] = useState(preferred?.id ?? '');
  const [grid, setGrid] = useState(1);
  const [strength, setStrength] = useState(100);
  const [humT, setHumT] = useState(20);
  const [humV, setHumV] = useState(20);
  const [velMode, setVelMode] = useState<VelocityMode>('scale');
  const [velVal, setVelVal] = useState(90);
  const [semis, setSemis] = useState(12);
  const [strumMs, setStrumMs] = useState(20);
  const [done, setDone] = useState('');
  const track = tracks.find((t) => t.id === trackId) ?? preferred;
  const pattern = track ? syncTrackPatterns(track, audioEngine.activePatternIndex) : null;
  const count = track?.steps.filter(Boolean).length ?? 0;

  const apply = (label: string, fn: (s: (SequencerNote | null)[]) => (SequencerNote | null)[]) => {
    if (!track) return;
    const next = fn(track.steps);
    next.forEach((s, i) => (track.steps[i] = s));
    audioEngine.commitEdit();
    setDone(`${label} → ${track.name} · ${pattern?.name ?? ''}`);
  };
  const row = 'flex items-center justify-between gap-2 text-[11px] text-cyan-300';
  const btn = 'px-2 py-0.5 rounded bg-cyan-500 text-slate-950 font-black hover:bg-cyan-400 text-[11px]';

  return (
    <div className="absolute top-16 right-4 z-50 w-80 bg-[#101b33]/95 backdrop-blur-md border-2 border-cyan-500 rounded-xl shadow-2xl p-3 text-cyan-100 font-mono select-none" role="dialog" aria-label="MIDI tools">
      <div className="flex items-center justify-between pb-2 border-b border-cyan-800 mb-2">
        <span className="text-xs font-black tracking-widest text-cyan-300 uppercase">F8 · MIDI tools</span>
        <button onClick={onClose} className="text-xs text-cyan-400 hover:text-white font-bold px-1.5 py-0.5 bg-cyan-900/60 rounded border border-cyan-600" aria-label="Close">✕</button>
      </div>
      {!track ? (
        <div className="text-[11px] text-slate-400">Add an instrument first.</div>
      ) : (
        <div className="space-y-2.5 text-xs">
          <label className={row}>
            Track / pattern
            <select value={track.id} onChange={(e) => setTrackId(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded text-cyan-200 max-w-40">
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="text-[11px] text-slate-400">{pattern?.name} · {count} note{count === 1 ? '' : 's'} · tools change the pattern you are editing (Ctrl+Z undoes)</div>

          <div className="bg-neutral-900/80 p-2 rounded border border-cyan-800/60 space-y-1.5">
            <div className={row}>
              <span className="font-bold text-cyan-200">QUANTIZE</span>
              <select value={grid} onChange={(e) => setGrid(Number(e.target.value))} className="bg-neutral-800 border border-neutral-700 rounded text-cyan-300">
                <option value={4}>1/4</option>
                <option value={2}>1/8</option>
                <option value={1}>1 step</option>
              </select>
            </div>
            <label className={row}>Strength {strength}%<input type="range" min={0} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-32 accent-cyan-400" /></label>
            <button className={btn} onClick={() => apply(`Quantized ${strength}%`, (s) => quantize(s, grid, strength / 100))}>Apply quantize</button>
          </div>

          <div className="bg-neutral-900/80 p-2 rounded border border-cyan-800/60 space-y-1.5">
            <span className="font-bold text-cyan-200 text-[11px]">HUMANIZE</span>
            <label className={row}>Timing {humT}%<input type="range" min={0} max={100} value={humT} onChange={(e) => setHumT(Number(e.target.value))} className="w-32 accent-cyan-400" /></label>
            <label className={row}>Velocity {humV}%<input type="range" min={0} max={100} value={humV} onChange={(e) => setHumV(Number(e.target.value))} className="w-32 accent-cyan-400" /></label>
            <button className={btn} onClick={() => apply('Humanized', (s) => humanize(s, humT / 100, humV / 100))}>Apply humanize</button>
          </div>

          <div className="bg-neutral-900/80 p-2 rounded border border-cyan-800/60 space-y-1.5">
            <div className={row}>
              <span className="font-bold text-cyan-200">VELOCITY</span>
              <select value={velMode} onChange={(e) => setVelMode(e.target.value as VelocityMode)} className="bg-neutral-800 border border-neutral-700 rounded text-cyan-300">
                <option value="set">Set to</option>
                <option value="scale">Scale by %</option>
                <option value="ramp">Ramp to</option>
                <option value="random">Randomize ±</option>
              </select>
            </div>
            <label className={row}>{velMode === 'scale' ? `${velVal}%` : velMode === 'random' ? `±${velVal}%` : `${Math.round((velVal / 100) * 127)}`}<input type="range" min={1} max={velMode === 'scale' ? 200 : 100} value={velVal} onChange={(e) => setVelVal(Number(e.target.value))} className="w-32 accent-cyan-400" /></label>
            <button className={btn} onClick={() => apply('Velocity', (s) => velocity(s, velMode, velVal / 100))}>Apply velocity</button>
          </div>

          <div className="bg-neutral-900/80 p-2 rounded border border-cyan-800/60 space-y-1.5">
            <span className="font-bold text-cyan-200 text-[11px]">STRUM</span>
            <label className={row}>Spread {strumMs} ms<input type="range" min={0} max={STRUM_MAX_MS} value={strumMs} onChange={(e) => setStrumMs(Number(e.target.value))} className="w-32 accent-cyan-400" /></label>
            <button className={btn} onClick={() => apply(`Strummed ${strumMs} ms`, (s) => strum(s, strumMs))}>Apply to chords</button>
          </div>

          <div className="bg-neutral-900/80 p-2 rounded border border-cyan-800/60 flex flex-wrap gap-1 items-center">
            <button className={btn} onClick={() => apply('Legato', legato)}>Legato</button>
            <button className={btn} onClick={() => apply('Snapped to scale', (s) => snapPitches(s, (m) => audioEngine.snapMidiToScale(m)))}>Snap to scale</button>
            <span className="text-[11px] text-cyan-300 ml-1">Transpose</span>
            <input type="number" value={semis} onChange={(e) => setSemis(Number(e.target.value) || 0)} className="w-12 bg-neutral-800 border border-neutral-700 rounded text-cyan-200 text-[11px] px-1" aria-label="Semitones" />
            <button className={btn} onClick={() => apply(`Transposed +${semis}`, (s) => transpose(s, semis))}>+</button>
            <button className={btn} onClick={() => apply(`Transposed −${semis}`, (s) => transpose(s, -semis))}>−</button>
          </div>

          <div className="bg-neutral-900/90 p-2 rounded border border-cyan-500/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300 text-[11px]">⚡ LOCAL HARDWARE AI GENERATOR</span>
              <span className="text-[9px] font-mono text-emerald-400">ON-DEVICE</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                className="px-2 py-1 rounded bg-cyan-600/80 hover:bg-cyan-500 text-white font-bold text-[10px] text-left truncate"
                onClick={async () => {
                  if (!track) return;
                  const { localHardwareAi } = await import('../../ai/hardware/localHardwareAiEngine.ts');
                  const ctx = {
                    bpm: audioEngine.bpm,
                    timeSignature: '4/4',
                    stepsPerBar: 16,
                    targetTrack: { id: track.id, name: track.name },
                    patternLength: track.steps.length,
                    focusedClip: null,
                    tracks: audioEngine.tracks.map((t) => ({ id: t.id, name: t.name, muted: !!t.mute })),
                  };
                  const res = await localHardwareAi.generateMusicalActionsOnHardware('Generate minor chord progression', ctx);
                  const act = res.actions.find((a) => a.type === 'write_notes');
                  if (act && act.type === 'write_notes') {
                    track.steps = Array.from({ length: Math.max(16, track.steps.length) }, () => null);
                    for (const n of act.notes) {
                      const idx = Math.round(n.step);
                      if (idx < track.steps.length) {
                        track.steps[idx] = { note: n.note, velocity: Math.round(n.velocity * 127), length: Math.max(1, Math.round(n.length)), probability: 1 };
                      }
                    }
                    audioEngine.commitEdit();
                    setDone(`Local AI Chords → ${track.name}`);
                  }
                }}
              >
                + AI Chords
              </button>
              <button
                className="px-2 py-1 rounded bg-cyan-600/80 hover:bg-cyan-500 text-white font-bold text-[10px] text-left truncate"
                onClick={async () => {
                  if (!track) return;
                  const { localHardwareAi } = await import('../../ai/hardware/localHardwareAiEngine.ts');
                  const ctx = {
                    bpm: audioEngine.bpm,
                    timeSignature: '4/4',
                    stepsPerBar: 16,
                    targetTrack: { id: track.id, name: track.name },
                    patternLength: track.steps.length,
                    focusedClip: null,
                    tracks: audioEngine.tracks.map((t) => ({ id: t.id, name: t.name, muted: !!t.mute })),
                  };
                  const res = await localHardwareAi.generateMusicalActionsOnHardware('Generate 16th note bassline', ctx);
                  const act = res.actions.find((a) => a.type === 'write_notes');
                  if (act && act.type === 'write_notes') {
                    track.steps = Array.from({ length: Math.max(16, track.steps.length) }, () => null);
                    for (const n of act.notes) {
                      const idx = Math.round(n.step);
                      if (idx < track.steps.length) {
                        track.steps[idx] = { note: n.note, velocity: Math.round(n.velocity * 127), length: Math.max(1, Math.round(n.length)), probability: 1 };
                      }
                    }
                    audioEngine.commitEdit();
                    setDone(`Local AI Bassline → ${track.name}`);
                  }
                }}
              >
                + AI Bassline
              </button>
              <button
                className="px-2 py-1 rounded bg-cyan-600/80 hover:bg-cyan-500 text-white font-bold text-[10px] text-left truncate"
                onClick={async () => {
                  if (!track) return;
                  const { localHardwareAi } = await import('../../ai/hardware/localHardwareAiEngine.ts');
                  const ctx = {
                    bpm: audioEngine.bpm,
                    timeSignature: '4/4',
                    stepsPerBar: 16,
                    targetTrack: { id: track.id, name: track.name },
                    patternLength: track.steps.length,
                    focusedClip: null,
                    tracks: audioEngine.tracks.map((t) => ({ id: t.id, name: t.name, muted: !!t.mute })),
                  };
                  const res = await localHardwareAi.generateMusicalActionsOnHardware('Generate melodic arpeggio', ctx);
                  const act = res.actions.find((a) => a.type === 'write_notes');
                  if (act && act.type === 'write_notes') {
                    track.steps = Array.from({ length: Math.max(16, track.steps.length) }, () => null);
                    for (const n of act.notes) {
                      const idx = Math.round(n.step);
                      if (idx < track.steps.length) {
                        track.steps[idx] = { note: n.note, velocity: Math.round(n.velocity * 127), length: Math.max(1, Math.round(n.length)), probability: 1 };
                      }
                    }
                    audioEngine.commitEdit();
                    setDone(`Local AI Arp → ${track.name}`);
                  }
                }}
              >
                + AI Arpeggio
              </button>
              <button
                className="px-2 py-1 rounded bg-cyan-600/80 hover:bg-cyan-500 text-white font-bold text-[10px] text-left truncate"
                onClick={async () => {
                  if (!track) return;
                  const { localHardwareAi } = await import('../../ai/hardware/localHardwareAiEngine.ts');
                  const ctx = {
                    bpm: audioEngine.bpm,
                    timeSignature: '4/4',
                    stepsPerBar: 16,
                    targetTrack: { id: track.id, name: track.name },
                    patternLength: track.steps.length,
                    focusedClip: null,
                    tracks: audioEngine.tracks.map((t) => ({ id: t.id, name: t.name, muted: !!t.mute })),
                  };
                  const res = await localHardwareAi.generateMusicalActionsOnHardware('Generate house drum beat', ctx);
                  const act = res.actions.find((a) => a.type === 'write_notes');
                  if (act && act.type === 'write_notes') {
                    track.steps = Array.from({ length: Math.max(16, track.steps.length) }, () => null);
                    for (const n of act.notes) {
                      const idx = Math.round(n.step);
                      if (idx < track.steps.length) {
                        track.steps[idx] = { note: n.note, velocity: Math.round(n.velocity * 127), length: Math.max(1, Math.round(n.length)), probability: 1 };
                      }
                    }
                    audioEngine.commitEdit();
                    setDone(`Local AI Drum Beat → ${track.name}`);
                  }
                }}
              >
                + AI Drum Beat
              </button>
            </div>
          </div>
          {done && <div className="text-[11px] text-emerald-300">{done}</div>}
        </div>
      )}
    </div>
  );
}

export const ToolWindowF8: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (isOpen ? <F8Body onClose={onClose} /> : null);
