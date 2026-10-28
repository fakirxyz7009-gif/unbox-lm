/** Record settings popover: count-in, pre/post-roll, punch, mode, input device, gain, latency. */
import React, { useEffect, useReducer, useState } from 'react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { InputManager, type InputDeviceInfo } from '../../audio/recording/InputManager.ts';
import type { RecordMode } from '../../audio/recording/RecordController.ts';
import { Btn, NumField, Sel } from '../../studio/ui/controls.tsx';
import { StereoMeter } from '../../studio/ui/Meter.tsx';

export function RecordPanel({ onClose }: { onClose: () => void }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const rec = audioEngine.recorder;
  const s = rec.settings;
  const [inputs, setInputs] = useState<InputDeviceInfo[]>([]);
  const [gainDb, setGainDb] = useState(0);
  useEffect(() => {
    void InputManager.listDevices().then((d) => setInputs(d.inputs));
  }, []);
  const set = (patch: Partial<typeof s>) => {
    Object.assign(s, patch);
    bump();
  };
  const armed = audioEngine.tracks.filter((t) => t.armed);
  return (
    <div className="absolute z-50 bottom-11 left-0 w-[420px] bg-[#0d121b] border border-red-800/70 rounded-lg shadow-2xl p-3 text-[11px] text-slate-300" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Record settings">
      <div className="flex items-center mb-2">
        <span className="font-black text-red-400 text-[13px]">● RECORD</span>
        <span className="ml-2 text-slate-500">{armed.length ? `Armed: ${armed.map((t) => t.name).join(', ')}` : 'No track armed — use ● on a track (mixer or arrangement)'}</span>
        <button type="button" className="ml-auto text-slate-400 hover:text-white" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <label className="flex items-center justify-between gap-2">Count-in
          <Sel value={String(s.countInBars)} onChange={(v) => set({ countInBars: Number(v) })} options={[0, 1, 2, 4].map((n) => ({ value: String(n), label: n ? `${n} bar${n > 1 ? 's' : ''}` : 'Off' }))} />
        </label>
        <label className="flex items-center justify-between gap-2">Mode
          <Sel<RecordMode> value={s.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'overdub', label: 'Overdub (layer / merge)' }, { value: 'replace', label: 'Replace' }, { value: 'takes', label: 'Takes (comp lanes)' }]} />
        </label>
        <label className="flex items-center justify-between gap-2">Pre-roll
          <NumField value={s.preRollBars} min={0} max={8} step={1} onChange={(v) => set({ preRollBars: v })} suffix="bars" width={44} />
        </label>
        <label className="flex items-center justify-between gap-2">Post-roll
          <NumField value={s.postRollBars} min={0} max={8} step={1} onChange={(v) => set({ postRollBars: v })} suffix="bars" width={44} />
        </label>
        <div className="flex items-center gap-2 col-span-2">
          <Btn on={s.punch} tone="red" onClick={() => set({ punch: !s.punch })} title="Record only between the punch-in and punch-out bars">Auto punch</Btn>
          <NumField title="Punch-in bar" value={s.punchInBar + 1} min={1} step={1} onChange={(v) => set({ punchInBar: Math.max(0, v - 1) })} suffix="in" width={44} />
          <NumField title="Punch-out bar" value={s.punchOutBar + 1} min={2} step={1} onChange={(v) => set({ punchOutBar: Math.max(s.punchInBar + 1, v - 1) })} suffix="out" width={44} />
          <Btn onClick={() => { const l = audioEngine.getLoopRange(); set({ punchInBar: l.start, punchOutBar: l.end }); }} title="Use the loop locators">= L/R</Btn>
        </div>
        <label className="flex items-center justify-between gap-2">MIDI quantize
          <Sel value={String(s.midiQuantize)} onChange={(v) => set({ midiQuantize: Number(v) })} options={[{ value: '0', label: 'Off' }, { value: '4', label: '1/4' }, { value: '2', label: '1/8' }, { value: '1', label: '1/16' }, { value: '0.5', label: '1/32' }]} />
        </label>
        <label className="flex items-center justify-between gap-2">Metronome
          <Btn on={audioEngine.metronomeEnabled} onClick={() => { audioEngine.metronomeEnabled = !audioEngine.metronomeEnabled; audioEngine.changed(); bump(); }}>{audioEngine.metronomeEnabled ? 'On' : 'Off'}</Btn>
        </label>
      </div>
      <div className="mt-2 pt-2 border-t border-slate-800 flex items-start gap-3">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="flex items-center justify-between gap-2">Input
            <Sel
              value={rec.input.deviceId}
              onChange={(v) => { void rec.input.open(v).then(() => rec.syncInputs()).catch(() => undefined).finally(bump); }}
              options={[{ value: '', label: 'Default input' }, ...inputs.map((i) => ({ value: i.deviceId, label: i.label }))]}
              className="max-w-[200px]"
            />
          </label>
          <label className="flex items-center justify-between gap-2">Input gain
            <input type="range" min={-24} max={24} step={0.5} value={gainDb} aria-label="Input gain" onChange={(e) => { const v = Number(e.target.value); setGainDb(v); rec.input.setGainDb(v); }} />
            <span className="w-10 text-right font-mono">{gainDb > 0 ? '+' : ''}{gainDb} dB</span>
          </label>
          <label className="flex items-center justify-between gap-2" title="Measured output + input latency, plus your correction (+ moves recordings earlier)">Latency fix
            <NumField value={s.offsetMs} min={-200} max={200} step={1} onChange={(v) => set({ offsetMs: v })} suffix="ms" width={48} />
            <span className="text-slate-500">total {(rec.roundTripLatency * 1000).toFixed(1)} ms</span>
          </label>
          {rec.input.error && <div className="text-red-400">{rec.input.error}</div>}
          {!rec.input.isOpen && <Btn onClick={() => void rec.input.open().then(() => rec.syncInputs()).catch(() => undefined).finally(bump)}>Open input</Btn>}
        </div>
        <StereoMeter read={() => rec.input.levels()} height={70} width={14} />
      </div>
      <div className="mt-2 flex gap-2">
        <Btn tone="red" on={audioEngine.isRecording} onClick={() => { void rec.toggle().then(bump); }}>{audioEngine.isRecording ? '■ Stop recording' : '● Record armed tracks'}</Btn>
        <Btn tone="violet" on={rec.recordingMaster} onClick={() => { void rec.toggleMasterRecording().then(bump); }} title="Capture the master output onto a new (muted) audio track">
          {rec.recordingMaster ? '■ Stop master capture' : 'Capture master output'}
        </Btn>
      </div>
    </div>
  );
}
