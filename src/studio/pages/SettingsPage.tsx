/**
 * Settings · Audio & MIDI: output device, engine sample rate / latency, the monitor section
 * (dim, mono, mute, L/R swap, speaker calibration) and MIDI: inputs, the controller knob / button
 * map with MIDI Learn, and an activity monitor.
 */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { InputManager, type InputDeviceInfo } from '../../audio/recording/InputManager.ts';
import type { MonitorState } from '../../audio/mixer/MonitorController.ts';
import { Btn, Panel, Sel, Slide } from '../ui/controls.tsx';
import { useFrame } from '../../nexa/useEngine.ts';
import { clearMidi, learnMidi, MIDI_TARGETS, midiLearning, midiMap, resetMidiMap, subscribeMidiMap } from '../../workstation/midiControls.ts';
import { localHardwareAi } from '../../ai/hardware/localHardwareAiEngine.ts';
import { MIDI_NO_INPUT_GUIDANCE } from '../../audio/midi/MidiInput.ts';

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function describeMidi(d: Uint8Array): string {
  const cmd = d[0] & 0xf0;
  const ch = (d[0] & 0x0f) + 1;
  if (cmd === 0x90 && d[2] > 0) return `ch${ch} Note on ${NOTE[d[1] % 12]}${Math.floor(d[1] / 12) - 1} vel ${d[2]}`;
  if (cmd === 0x80 || cmd === 0x90) return `ch${ch} Note off ${NOTE[d[1] % 12]}${Math.floor(d[1] / 12) - 1}`;
  if (cmd === 0xb0) return `ch${ch} CC${d[1]} = ${d[2]}${d[1] === 1 ? ' (mod wheel)' : d[1] === 64 ? ' (sustain)' : ''}`;
  if (cmd === 0xe0) return `ch${ch} Pitch bend ${((d[2] << 7) | d[1]) - 8192}`;
  if (cmd === 0xd0) return `ch${ch} Aftertouch ${d[1]}`;
  return `0x${Array.from(d).map((b) => b.toString(16).padStart(2, '0')).join(' ')}`;
}

/** MIDI: status and ports (from the engine), what hardware notes play, the knob / button map
 *  with MIDI Learn, and an activity log. */
function MidiPanel() {
  const midi = audioEngine.midi;
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => midi.subscribe(force), [midi]);
  useEffect(() => subscribeMidiMap(force), []);
  useEffect(() => () => learnMidi(null), []); // leaving the page cancels a pending Learn
  const log = useRef<HTMLDivElement>(null);
  const lines = useRef<string[]>([]);
  const dirty = useRef(false);
  useEffect(
    () =>
      midi.monitor((d, port) => {
        lines.current.unshift(`${port}: ${describeMidi(d)}`);
        lines.current.length = Math.min(lines.current.length, 12);
        dirty.current = true;
      }),
    [midi]
  );
  useFrame(() => {
    if (!dirty.current || !log.current) return;
    dirty.current = false;
    log.current.textContent = lines.current.join('\n');
  });
  const target = audioEngine.midiTarget();
  const map = midiMap();
  const learning = midiLearning();
  const status =
    midi.status === 'unsupported'
      ? 'This browser has no Web MIDI (use Chrome / Edge, or the desktop app).'
      : midi.status === 'blocked'
        ? 'MIDI access was refused. Allow MIDI for this site, then press Ask again.'
        : midi.status === 'off'
          ? 'MIDI is not connected yet. Press Connect MIDI to request access to your controller.'
        : midi.status !== 'ready'
          ? 'Looking for MIDI devices…'
          : '';
  const canRetry = midi.status !== 'unsupported' && (midi.status !== 'ready' || midi.ports.length === 0);
  return (
    <Panel title="MIDI" right={canRetry ? <Btn onClick={() => void midi.refresh()}>{midi.status === 'ready' ? 'Rescan MIDI' : midi.status === 'blocked' ? 'Ask again' : 'Connect MIDI'}</Btn> : undefined}>
      <div className="space-y-2 text-[11px]" data-testid="midi-panel">
        {status && <div className="text-amber-300">{status}</div>}
        <div className="text-slate-400">
          Every connected input plays the selected part: <span className="text-white font-bold">{target?.name ?? 'none (add an instrument)'}</span>. Notes on any channel, velocity, pitch bend,
          mod wheel (CC1) and sustain pedal (CC64) are used. To record notes, select the instrument part, arm its track, then press Record in the transport before playing; stop recording to commit the notes. The Activity log confirms whether key messages arrive. Held keys and the wheels show on the Workstation keyboard.
        </div>
        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-slate-400">MIDI output</span>
          <Sel
            value={midi.outputId}
            onChange={(id) => midi.setOutput(id)}
            options={[{ value: '', label: 'No external output' }, ...midi.outputs.map((p) => ({ value: p.id, label: p.name }))]}
            title="MIDI output destination for MIDI Out tracks and transport clock"
            className="flex-1"
          />
        </div>
        {midi.status === 'ready' && midi.outputs.length === 0 && (
          <div className="text-slate-500">No MIDI output connected. MIDI Out tracks and clock need a connected Web MIDI destination.</div>
        )}
        {midi.status === 'ready' &&
          (midi.ports.length === 0 ? (
            <div className="text-slate-500">{MIDI_NO_INPUT_GUIDANCE}</div>
          ) : (
            <ul className="space-y-0.5">
              {midi.ports.map((p) => (
                <li key={p.id} className="flex justify-between bg-black/30 rounded px-2 py-1">
                  <span className="text-slate-200">{p.name}</span>
                  <span className={p.error ? 'text-amber-300' : 'text-emerald-400'}>{p.error ?? 'connected'}</span>
                </li>
              ))}
            </ul>
          ))}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-slate-300 font-bold">Knobs, fader &amp; buttons</span>
          <div className="flex-1" />
          <Btn onClick={resetMidiMap} title="Knobs 1–8 → CC 21–28, fader → CC 49 (Novation Impulse in MIDI mode); buttons unassigned">
            Defaults
          </Btn>
        </div>
        <div className="text-slate-500">
          Learn: click it, then move a knob or press a button on the controller. Buttons that send nothing in the controller's current mode can't be learned.
        </div>
        <div className="grid grid-cols-[minmax(120px,max-content)_auto_auto_auto] justify-start gap-x-3 gap-y-0.5 items-center" data-testid="midi-map">
          {MIDI_TARGETS.map((t) => {
            const cc = map[t.id];
            const isLearning = learning === t.id;
            return (
              <React.Fragment key={t.id}>
                <span className="text-slate-300">{t.label}</span>
                <span className={`font-mono w-[120px] ${isLearning ? 'text-amber-300' : cc === null ? 'text-slate-600' : 'text-cyan-200'}`}>
                  {isLearning ? (t.button ? 'press a button…' : 'move a knob…') : cc === null ? '—' : `CC ${cc}`}
                </span>
                <Btn on={isLearning} onClick={() => learnMidi(isLearning ? null : t.id)} title={`Assign a controller knob or button to ${t.label}`}>
                  {isLearning ? 'Cancel' : 'Learn'}
                </Btn>
                <Btn onClick={() => clearMidi(t.id)} disabled={cc === null} title={`Unassign ${t.label}`}>
                  Clear
                </Btn>
              </React.Fragment>
            );
          })}
        </div>
        <div className="text-slate-400 pt-1">Activity</div>
        <div ref={log} className="font-mono whitespace-pre text-[11px] text-cyan-200 bg-black/50 rounded p-2 h-28 overflow-hidden" data-testid="midi-activity">
          Play your MIDI keyboard…
        </div>
      </div>
    </Panel>
  );
}

export function SettingsPage() {
  const mon = audioEngine.monitor;
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [outputs, setOutputs] = useState<InputDeviceInfo[]>([]);
  const [outErr, setOutErr] = useState('');
  useEffect(() => {
    void InputManager.listDevices().then((d) => setOutputs(d.outputs));
  }, []);
  const ctx = audioEngine.ctx as AudioContext & { outputLatency?: number };
  const set = (patch: Partial<MonitorState>) => {
    mon.set(patch);
    force();
  };
  const s = mon.state;
  const ms = (sec: number | undefined) => (typeof sec === 'number' && Number.isFinite(sec) ? `${(sec * 1000).toFixed(1)} ms` : '—');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-[#070a10]" data-testid="settings-page">
      <h2 className="text-sm font-black uppercase tracking-widest text-slate-200">Settings · Audio &amp; MIDI</h2>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Panel title="Audio output">
          <div className="space-y-2 text-[11px]">
            {mon.canChooseOutput ? (
              <div className="flex items-center gap-2">
                <span className="w-24 text-slate-400">Output device</span>
                <Sel
                  value={mon.outputDeviceId}
                  onChange={(id) => {
                    setOutErr('');
                    void mon
                      .setOutputDevice(id)
                      .then(force)
                      .catch((e: unknown) => setOutErr(e instanceof Error ? e.message : 'Could not switch the device'));
                  }}
                  options={[{ value: '', label: 'System default' }, ...outputs.filter((o) => o.deviceId && o.deviceId !== 'default').map((o) => ({ value: o.deviceId, label: o.label }))]}
                  title="Output device"
                  className="flex-1"
                />
              </div>
            ) : (
              <div className="text-slate-500">This browser plays through the system default output (device choice needs Chrome / Edge 110+ or the desktop app).</div>
            )}
            {outputs.length > 0 && outputs.every((o) => !o.label || /^Output \d+$/.test(o.label)) && (
              <div className="text-slate-500">Device names appear after microphone access was allowed once (Record panel).</div>
            )}
            {outErr && <div className="text-red-400">{outErr}</div>}
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono pt-1 border-t border-slate-800">
              <span className="text-slate-400">Sample rate</span>
              <span>{ctx.sampleRate} Hz</span>
              <span className="text-slate-400">Engine latency</span>
              <span>{ms(ctx.baseLatency)}</span>
              <span className="text-slate-400">Output latency</span>
              <span>{ms(ctx.outputLatency)}</span>
              <span className="text-slate-400">State</span>
              <span>{ctx.state}</span>
            </div>
            <div className="text-slate-500">Recording compensates these latencies automatically (Record panel → offset for fine-tuning).</div>
            <div className="rounded border border-amber-500/20 bg-amber-950/20 px-2 py-1 text-amber-200/80">
              Audio runs through browser Web Audio. Native ASIO/CoreAudio drivers and VST/VST3 binaries are not hosted; plug-in catalog entries use proxy DSP.
            </div>
            <Slide label="Metronome level" value={Math.round(audioEngine.metronomeLevel * 100)} min={0} max={150} step={1} unit=" %" onChange={(v) => { audioEngine.metronomeLevel = v / 100; force(); }} />
          </div>
        </Panel>

        <Panel title="Monitor section" right={<span className="text-[11px] text-slate-500">speakers / headphones only — never in exports</span>}>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Btn on={s.dim} tone="yellow" onClick={() => set({ dim: !s.dim })} title="Lower the monitor level">Dim</Btn>
              <Btn on={s.mono} tone="cyan" onClick={() => set({ mono: !s.mono })} title="Check the mix in mono">Mono</Btn>
              <Btn on={s.swap} tone="violet" onClick={() => set({ swap: !s.swap })} title="Swap left and right">L/R swap</Btn>
              <Btn on={s.mute} tone="red" onClick={() => set({ mute: !s.mute })} title="Silence the speakers">Mute</Btn>
            </div>
            <Slide label="Dim amount" value={s.dimDb} min={-40} max={-3} step={1} unit=" dB" onChange={(v) => set({ dimDb: v })} />
            <Slide label="Output trim" value={s.trimDb} min={-24} max={12} step={0.5} unit=" dB" onChange={(v) => set({ trimDb: v })} />
            <div className="flex items-center gap-2 border-t border-slate-800 pt-1">
              <span className="text-[11px] font-bold text-slate-300">Speaker calibration EQ</span>
              <Btn on={s.calEnabled} tone="green" onClick={() => set({ calEnabled: !s.calEnabled })}>{s.calEnabled ? 'ON' : 'OFF'}</Btn>
            </div>
            <Slide label="Low shelf" value={s.calLowDb} min={-12} max={12} step={0.5} unit=" dB" onChange={(v) => set({ calLowDb: v })} />
            <Slide label="Low freq" value={s.calLowHz} min={40} max={400} step={5} unit=" Hz" onChange={(v) => set({ calLowHz: v })} />
            <Slide label="Mid bell" value={s.calMidDb} min={-12} max={12} step={0.5} unit=" dB" onChange={(v) => set({ calMidDb: v })} />
            <Slide label="Mid freq" value={s.calMidHz} min={200} max={6000} step={10} unit=" Hz" onChange={(v) => set({ calMidHz: v })} />
            <Slide label="High shelf" value={s.calHighDb} min={-12} max={12} step={0.5} unit=" dB" onChange={(v) => set({ calHighDb: v })} />
            <Slide label="High freq" value={s.calHighHz} min={2000} max={16000} step={100} unit=" Hz" onChange={(v) => set({ calHighHz: v })} />
          </div>
        </Panel>

        <MidiPanel />
        <HardwareAiPanel />
      </div>
    </div>
  );
}

function HardwareAiPanel() {
  const [hwState, setHwState] = useState(() => localHardwareAi.state);
  const [benchmarkLatency, setBenchmarkLatency] = useState<number | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);

  useEffect(() => {
    return localHardwareAi.subscribe(() => {
      setHwState({ ...localHardwareAi.state });
    });
  }, []);

  const runBenchmark = async () => {
    setIsBenchmarking(true);
    const start = performance.now();
    try {
      await localHardwareAi.planRackOnHardware('80s synthwave lead with tape delay and chorus');
      setBenchmarkLatency(Math.round(performance.now() - start));
    } finally {
      // Cleared even when planning fails, so the button cannot stay on "Running…".
      setIsBenchmarking(false);
    }
  };

  return (
    <Panel
      title="On-device AI & GPU probe"
      right={
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
            ON THIS COMPUTER
          </span>
          <Btn onClick={() => void localHardwareAi.probeHardware()}>Re-scan GPU</Btn>
        </div>
      }
    >
      <div className="space-y-3 text-[11px]" data-testid="hardware-ai-settings-panel">
        <div className="text-slate-400">
          The rack planner, preset crafter and mix analysis run in this app on this computer. They only produce control suggestions—never generated audio or replacement instrument sounds. WebGPU is probed for the adapter details below. A local Ollama server, when it is running, answers chat questions. None of this path sends prompts, song state or audio to a cloud service; the CLOUD switch in the Co-Pilot does, when you choose it.
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono pt-1 border-t border-slate-800">
          <span className="text-slate-400">Graphics adapter</span>
          <span className="text-cyan-300 font-bold">{hwState.gpu.vendor}</span>

          <span className="text-slate-400">WebGPU (probed, not used)</span>
          <span className={hwState.gpu.supported ? 'text-emerald-400' : 'text-amber-400'}>
            {hwState.gpu.supported ? 'Adapter found (probed)' : 'No WebGPU adapter'}
          </span>

          <span className="text-slate-400">GPU Device / Driver</span>
          <span className="text-slate-200">{hwState.gpu.device}</span>

          <span className="text-slate-400">Max GPU Buffer</span>
          <span className="text-slate-200">{hwState.gpu.maxBufferSizeMb ? `${hwState.gpu.maxBufferSizeMb} MB` : 'Dynamic System RAM'}</span>

          <span className="text-slate-400">Local model (Ollama)</span>
          <span className={hwState.daemonOnline ? 'text-emerald-400' : 'text-slate-400'}>
            {hwState.daemonOnline ? `Online (${hwState.daemonModels.length} models installed)` : 'Not running (the built-in rule engine answers)'}
          </span>

          <span className="text-slate-400">Cloud Latency</span>
          <span className="text-emerald-400 font-bold">None on this path (localhost only)</span>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
          <Btn on tone="cyan" disabled={isBenchmarking} onClick={() => void runBenchmark()}>
            {isBenchmarking ? 'Timing the planner…' : 'Time the local planner'}
          </Btn>
          {benchmarkLatency !== null && (
            <span className="font-mono text-emerald-400">
              Benchmark: {benchmarkLatency} ms to plan a sample rack on this computer
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}
