import React from 'react';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { SubtractorDevice } from '../../audio/devices/SubtractorDevice.ts';
import { ThorDevice } from '../../audio/devices/ThorDevice.ts';
import { EuropaDevice } from '../../audio/devices/EuropaDevice.ts';
import { MonotoneDevice } from '../../audio/devices/MonotoneDevice.ts';
import { RedrumDevice } from '../../audio/devices/RedrumDevice.ts';
import { MimicDevice } from '../../audio/devices/MimicDevice.ts';
import { MatrixDevice } from '../../audio/devices/MatrixDevice.ts';
import { PulsarDevice } from '../../audio/devices/PulsarDevice.ts';
import { Scream4Device } from '../../audio/devices/Scream4Device.ts';
import { EchoDevice } from '../../audio/devices/EchoDevice.ts';
import { RV7000Device } from '../../audio/devices/RV7000Device.ts';
import { MClassMasterSuite } from '../../audio/devices/MClassMasterSuite.ts';
import { Knob } from '../Knob.tsx';
import { VacuumTube } from '../VacuumTube.tsx';
import { DeviceVisualizer } from '../visualizers/DeviceVisualizer.tsx';
import { Volume2, Play, Upload, Waves, Radio } from 'lucide-react';

interface DeviceFaceplateProps {
  device: BaseDevice;
  onUpdate: () => void;
}

export const DeviceFaceplate: React.FC<DeviceFaceplateProps> = ({ device, onUpdate }) => {
  const p = device.params;

  const setP = (key: string, val: any) => {
    device.setParam(key, val);
    onUpdate();
  };

  // 1. SUBTRACTOR SYNTH (Slate Anodized Black Faceplate)
  if (device.type === 'subtractor') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        {/* Osc 1 & Osc 2 Section */}
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-amber-400 uppercase mb-1">OSC 1</span>
            <select
              value={p.osc1Type}
              onChange={(e) => setP('osc1Type', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs px-2 py-1 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Sawtooth</option>
              <option value="square">Square</option>
              <option value="triangle">Triangle</option>
            </select>
          </div>

          <Knob
            label="OCT 1"
            value={p.osc1Octave}
            min={-2}
            max={2}
            step={1}
            size="sm"
            variant="yellow"
            onChange={(v) => setP('osc1Octave', v)}
          />

          <div className="w-px h-12 bg-neutral-800 mx-1" />

          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-amber-400 uppercase mb-1">OSC 2</span>
            <select
              value={p.osc2Type}
              onChange={(e) => setP('osc2Type', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs px-2 py-1 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Sawtooth</option>
              <option value="square">Square</option>
              <option value="triangle">Triangle</option>
            </select>
          </div>

          <Knob
            label="OCT 2"
            value={p.osc2Octave}
            min={-2}
            max={2}
            step={1}
            size="sm"
            variant="yellow"
            onChange={(v) => setP('osc2Octave', v)}
          />

          <Knob
            label="DETUNE"
            value={p.osc2Detune}
            min={-50}
            max={50}
            step={1}
            unit="¢"
            size="sm"
            variant="white"
            onChange={(v) => setP('osc2Detune', v)}
          />

          <Knob
            label="SUB LEVEL"
            value={p.subOscLevel}
            min={0}
            max={1}
            step={0.05}
            size="sm"
            variant="dark"
            onChange={(v) => setP('subOscLevel', v)}
          />
        </div>

        {/* Filter Section */}
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <Knob
            label="CUTOFF"
            value={p.cutoff}
            min={40}
            max={16000}
            step={10}
            unit=" Hz"
            size="md"
            variant="yellow"
            onChange={(v) => setP('cutoff', v)}
          />

          <Knob
            label="RESONANCE"
            value={p.resonance}
            min={0.5}
            max={15}
            step={0.1}
            size="sm"
            variant="metal"
            onChange={(v) => setP('resonance', v)}
          />
        </div>

        {/* ADSR Envelope */}
        <div className="flex items-center space-x-2 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <Knob label="ATTACK" value={p.attack} min={0.01} max={2.0} step={0.01} unit="s" size="sm" variant="dark" onChange={(v) => setP('attack', v)} />
          <Knob label="DECAY" value={p.decay} min={0.05} max={3.0} step={0.02} unit="s" size="sm" variant="dark" onChange={(v) => setP('decay', v)} />
          <Knob label="SUSTAIN" value={p.sustain} min={0} max={1} step={0.05} size="sm" variant="dark" onChange={(v) => setP('sustain', v)} />
          <Knob label="RELEASE" value={p.release} min={0.05} max={4.0} step={0.05} unit="s" size="sm" variant="dark" onChange={(v) => setP('release', v)} />
        </div>

        {/* Real-time CRT Oscilloscope */}
        <DeviceVisualizer device={device} width={145} height={56} />

        {/* Master Output & Test trigger */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              (device as SubtractorDevice).noteOn(60, 0.9);
              setTimeout(() => (device as SubtractorDevice).noteOff(60), 250);
            }}
            className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center space-x-1.5 shadow-md transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>PLAY NOTE</span>
          </button>

          <Knob
            label="VOLUME"
            value={p.volume}
            min={0}
            max={1.5}
            step={0.05}
            size="sm"
            variant="metal"
            onChange={(v) => setP('volume', v)}
          />
        </div>
      </div>
    );
  }

  // 2. THOR POLYSONIC SYNTH (Studio Cobalt Blue Faceplate with Yellow & White Knobs, like reference photo!)
  if (device.type === 'thor') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <div className="flex items-center space-x-3">
          <VacuumTube label="TUBE A" isPowered={device.isPowered} />
          <VacuumTube label="TUBE B" isPowered={device.isPowered} />
        </div>

        {/* Oscillators with Studio Yellow Knobs */}
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-blue-900/40 shadow-inner">
          <Knob label="OSC 1 OCT" value={p.osc1Octave} min={-2} max={2} step={1} size="sm" variant="yellow" onChange={(v) => setP('osc1Octave', v)} />
          <Knob label="OSC 2 DETUNE" value={p.osc2Detune} min={-50} max={50} step={1} unit="¢" size="sm" variant="white" onChange={(v) => setP('osc2Detune', v)} />
          <Knob label="DRIVE" value={p.drive} min={1} max={10} step={0.2} size="sm" variant="yellow" onChange={(v) => setP('drive', v)} />
        </div>

        {/* Filter & Chorus */}
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-blue-900/40 shadow-inner">
          <Knob label="CUTOFF" value={p.cutoff} min={40} max={18000} step={10} unit=" Hz" size="md" variant="yellow" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESONANCE" value={p.resonance} min={0.5} max={15} step={0.2} size="sm" variant="metal" onChange={(v) => setP('resonance', v)} />
          <Knob label="CHORUS" value={p.chorusAmount} min={0} max={1} step={0.05} size="sm" variant="white" onChange={(v) => setP('chorusAmount', v)} />
        </div>

        {/* Envelope */}
        <div className="flex items-center space-x-2 bg-black/40 p-2.5 rounded border border-blue-900/40 shadow-inner">
          <Knob label="ATTACK" value={p.attack} min={0.01} max={2.0} step={0.01} unit="s" size="sm" variant="dark" onChange={(v) => setP('attack', v)} />
          <Knob label="DECAY" value={p.decay} min={0.05} max={3.0} step={0.02} unit="s" size="sm" variant="dark" onChange={(v) => setP('decay', v)} />
          <Knob label="RELEASE" value={p.release} min={0.05} max={4.0} step={0.05} unit="s" size="sm" variant="dark" onChange={(v) => setP('release', v)} />
        </div>

        {/* Spectral Harmonic Display */}
        <DeviceVisualizer device={device} width={150} height={56} />

        <button
          onClick={() => {
            (device as ThorDevice).noteOn(60, 0.9);
            setTimeout(() => (device as ThorDevice).noteOff(60), 300);
          }}
          className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center space-x-1.5 shadow-md transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>PLAY NOTE</span>
        </button>
      </div>
    );
  }

  // 3. EUROPA WAVETABLE SYNTH (Studio Blue Faceplate)
  if (device.type === 'europa') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <VacuumTube label="SPECTRAL" isPowered={device.isPowered} />

        {/* Wavetable display & Morph */}
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-blue-900/40 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-cyan-400 uppercase mb-1">WAVETABLE</span>
            <select
              value={p.wavetableShape}
              onChange={(e) => setP('wavetableShape', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs px-2 py-1 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Harmonic Saw</option>
              <option value="triangle">Morph Triangle</option>
              <option value="square">Pulse Spectrum</option>
            </select>
          </div>

          <Knob label="MORPH" value={p.morph} min={0} max={1} step={0.02} size="md" variant="yellow" onChange={(v) => setP('morph', v)} />
          <Knob label="UNISON WIDTH" value={p.unison} min={0} max={1} step={0.05} size="sm" variant="white" onChange={(v) => setP('unison', v)} />
          <Knob label="SUB OSC" value={p.subLevel} min={0} max={1} step={0.05} size="sm" variant="dark" onChange={(v) => setP('subLevel', v)} />
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-blue-900/40 shadow-inner">
          <Knob label="CUTOFF" value={p.cutoff} min={50} max={18000} step={20} unit=" Hz" size="md" variant="blue" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESONANCE" value={p.resonance} min={0.5} max={14} step={0.2} size="sm" variant="metal" onChange={(v) => setP('resonance', v)} />
          <Knob label="FORMANT" value={p.formantFreq} min={300} max={4000} step={20} unit=" Hz" size="sm" variant="white" onChange={(v) => setP('formantFreq', v)} />
        </div>

        {/* Envelope */}
        <div className="flex items-center space-x-2 bg-black/40 p-2.5 rounded border border-blue-900/40 shadow-inner">
          <Knob label="ATTACK" value={p.attack} min={0.01} max={3.0} step={0.02} unit="s" size="sm" variant="dark" onChange={(v) => setP('attack', v)} />
          <Knob label="RELEASE" value={p.release} min={0.05} max={5.0} step={0.05} unit="s" size="sm" variant="dark" onChange={(v) => setP('release', v)} />
        </div>

        {/* Morphing Spectral Waterfall */}
        <DeviceVisualizer device={device} width={150} height={56} />

        <button
          onClick={() => {
            (device as EuropaDevice).noteOn(57, 0.9);
            setTimeout(() => (device as EuropaDevice).noteOff(57), 400);
          }}
          className="px-3.5 py-2 rounded bg-sky-500 hover:bg-sky-400 text-black font-mono font-bold text-xs flex items-center space-x-1.5 shadow-md transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>PLAY NOTE</span>
        </button>
      </div>
    );
  }

  // 4. MONOTONE BASS SYNTH (Slate Black)
  if (device.type === 'monotone') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-amber-400 uppercase mb-1">SHAPE</span>
            <select
              value={p.waveform}
              onChange={(e) => setP('waveform', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs px-2 py-1 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Sawtooth</option>
              <option value="square">Square</option>
            </select>
          </div>
          <Knob label="SUB BASS" value={p.subLevel} min={0} max={1} step={0.05} size="sm" variant="white" onChange={(v) => setP('subLevel', v)} />
          <Knob label="DRIVE" value={p.drive} min={1} max={8} step={0.2} size="sm" variant="yellow" onChange={(v) => setP('drive', v)} />
        </div>

        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <Knob label="CUTOFF" value={p.cutoff} min={30} max={8000} step={10} unit=" Hz" size="md" variant="yellow" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESONANCE" value={p.resonance} min={0.5} max={12} step={0.2} size="sm" variant="metal" onChange={(v) => setP('resonance', v)} />
          <Knob label="ENV DECAY" value={p.decay} min={0.05} max={1.5} step={0.02} unit="s" size="sm" variant="dark" onChange={(v) => setP('decay', v)} />
        </div>

        {/* 24dB Ladder Filter Curve & Sub-Bass Scope */}
        <DeviceVisualizer device={device} width={150} height={56} />

        <button
          onClick={() => {
            (device as MonotoneDevice).noteOn(36, 1.0);
            setTimeout(() => (device as MonotoneDevice).noteOff(36), 250);
          }}
          className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center space-x-1.5 shadow-md transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>SUB BASS HIT</span>
        </button>
      </div>
    );
  }

  // 5. REDRUM DRUM COMPUTER (Studio White Enamel Faceplate with Dark & Yellow Knobs)
  if (device.type === 'redrum') {
    const redrum = device as RedrumDevice;
    return (
      <div className="flex flex-col space-y-3 p-2">
        {/* Top Header Strip with Real-time 8-Channel Transient Visualizer */}
        <div className="flex items-center justify-between bg-black/50 px-3 py-1.5 rounded border border-neutral-700 shadow-inner">
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-mono font-bold text-amber-400 tracking-wider">
              REDRUM // 8-CHANNEL SOUND ENGINE
            </span>
            <span className="text-[9px] font-mono text-neutral-400">ANALOG SYNTHESIS & PCM TRANSIENTS</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-[8px] font-mono text-neutral-400 uppercase">DYNAMIC BUS SCOPE:</span>
            <DeviceVisualizer device={device} width={160} height={46} />
          </div>
        </div>

        {/* Top Channel Controls row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 bg-neutral-900/90 p-2.5 rounded border border-neutral-700 shadow-inner overflow-x-auto">
          {redrum.voices.map((v, idx) => (
            <div key={v.id} className="flex flex-col items-center bg-neutral-950 p-2 rounded border border-neutral-800">
              <span className="text-[9px] font-mono font-bold text-amber-400 mb-1 truncate w-full text-center">
                {v.name}
              </span>

              {/* Trigger Pad button */}
              <button
                onClick={() => redrum.triggerPad(idx, 1.0)}
                className="w-12 h-10 rounded bg-gradient-to-b from-neutral-700 to-neutral-800 hover:from-neutral-600 hover:to-neutral-700 active:from-amber-500 active:to-amber-600 border border-neutral-600 shadow text-[9px] font-mono font-bold text-white flex items-center justify-center transition-all mb-2"
              >
                HIT
              </button>

              <Knob
                label="PITCH"
                value={v.pitch}
                min={idx === 0 ? 30 : idx === 1 ? 80 : 100}
                max={idx === 0 ? 120 : idx === 1 ? 400 : 8000}
                step={5}
                size="sm"
                variant="dark"
                onChange={(val) => { v.pitch = val; onUpdate(); }}
              />

              <Knob
                label="DECAY"
                value={v.decay}
                min={0.05}
                max={1.5}
                step={0.02}
                size="sm"
                variant="yellow"
                onChange={(val) => { v.decay = val; onUpdate(); }}
              />

              <div className="flex space-x-1 mt-1">
                <button
                  onClick={() => { v.mute = !v.mute; onUpdate(); }}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-mono border font-bold ${
                    v.mute ? 'bg-red-950 border-red-600 text-red-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                  }`}
                >
                  M
                </button>
                <button
                  onClick={() => { v.solo = !v.solo; onUpdate(); }}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-mono border font-bold ${
                    v.solo ? 'bg-amber-950 border-amber-500 text-amber-300' : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                  }`}
                >
                  S
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 16-Step Pattern Sequencer Grid */}
        <div className="bg-neutral-900/90 p-2.5 rounded border border-neutral-700 space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 mb-1">
            <span className="font-bold text-neutral-300">16-STEP PATTERN DRUM PROGRAMMER</span>
            <span className="text-amber-400 font-bold">STEP: {redrum.currentStep + 1} / 16</span>
          </div>

          {redrum.voices.map((v, vIdx) => (
            <div key={v.id} className="flex items-center space-x-1">
              <span className="w-16 text-[9px] font-mono text-neutral-400 truncate text-right pr-2">
                {v.name.slice(0, 8)}
              </span>
              <div className="flex-1 grid grid-cols-16 gap-1">
                {v.pattern.map((stepActive, sIdx) => {
                  const isCurrent = redrum.currentStep === sIdx;
                  const isBeatStart = sIdx % 4 === 0;

                  return (
                    <button
                      key={sIdx}
                      onClick={() => {
                        redrum.toggleStep(vIdx, sIdx);
                        onUpdate();
                      }}
                      className={`h-5 rounded-sm border transition-all ${
                        stepActive
                          ? 'bg-amber-500 border-amber-400 shadow-[0_0_6px_#f59e0b]'
                          : isBeatStart
                          ? 'bg-neutral-800 border-neutral-600'
                          : 'bg-neutral-950 border-neutral-800'
                      } ${isCurrent ? 'ring-2 ring-white scale-105' : ''}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 6. MIMIC SAMPLER (Studio White Enamel Faceplate)
  if (device.type === 'mimic') {
    const mimic = device as MimicDevice;
    return (
      <div className="flex flex-col space-y-3 p-2">
        {/* Header with Visualizer */}
        <div className="flex items-center justify-between bg-black/50 px-3 py-1.5 rounded border border-neutral-700 shadow-inner">
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
              MIMIC // MULTI-SLOT SAMPLE WORKSTATION
            </span>
            <span className="text-[9px] font-mono text-neutral-400">8 PADS &bull; TRANSIENT SLICING</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-[8px] font-mono text-neutral-400 uppercase">SAMPLE SCOPE:</span>
            <DeviceVisualizer device={device} width={160} height={46} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {mimic.pads.map((pad, idx) => (
            <div
              key={pad.id}
              className="flex flex-col items-center bg-neutral-900/90 p-2.5 rounded border border-neutral-700 group hover:border-neutral-500 transition-colors shadow-inner"
            >
              <button
                onClick={() => mimic.triggerPad(idx, 1.0)}
                className="w-full h-16 rounded bg-gradient-to-b from-neutral-800 to-neutral-950 hover:from-neutral-700 hover:to-neutral-900 active:from-cyan-600 active:to-cyan-700 border border-neutral-700 shadow flex flex-col items-center justify-center p-1 transition-all mb-2"
              >
                <span className="text-[10px] font-mono font-bold text-neutral-200 truncate w-full text-center">
                  {pad.name}
                </span>
                <span className="text-[8px] font-mono text-cyan-400 mt-1">PAD {idx + 1}</span>
              </button>

              <label
                className="text-[8px] font-mono text-neutral-400 hover:text-cyan-400 cursor-pointer flex items-center space-x-1 mb-2"
                title="Load custom audio WAV/MP3"
              >
                <Upload className="w-2.5 h-2.5" />
                <span>LOAD FILE</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      mimic.loadSampleFile(idx, f).then(() => onUpdate());
                    }
                  }}
                />
              </label>

              <Knob
                label="SEMITONES"
                value={pad.pitchSemi}
                min={-24}
                max={24}
                step={1}
                size="sm"
                variant="white"
                onChange={(v) => { pad.pitchSemi = v; onUpdate(); }}
              />

              <Knob
                label="LEVEL"
                value={pad.volume}
                min={0}
                max={1.5}
                step={0.05}
                size="sm"
                variant="yellow"
                onChange={(v) => { pad.volume = v; onUpdate(); }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 7. MATRIX PATTERN / CV SEQUENCER (Studio Grey Faceplate)
  if (device.type === 'matrix') {
    const matrix = device as MatrixDevice;
    const pat = matrix.currentPattern;

    return (
      <div className="flex flex-col space-y-3 p-2">
        <div className="flex items-center justify-between bg-black/40 px-3 py-1.5 rounded border border-neutral-800 text-xs font-mono shadow-inner">
          <div className="flex items-center space-x-3">
            <span className="text-amber-400 font-bold">PATTERN BANK:</span>
            <div className="flex space-x-1">
              {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((letter, idx) => (
                <button
                  key={letter}
                  onClick={() => setP('activePattern', idx)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    matrix.currentPatternIndex === idx
                      ? 'bg-amber-500 text-black border-amber-400 shadow'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <DeviceVisualizer device={device} width={130} height={46} />
            <div className="flex flex-col text-[10px]">
              <span className="text-neutral-400">RES: 1/16</span>
              <span className="text-cyan-400 font-bold">STEP: {matrix.currentStep + 1}</span>
            </div>
          </div>
        </div>

        {/* 16-Step Grid */}
        <div className="bg-black/50 p-3 rounded border border-neutral-800 space-y-2 shadow-inner">
          {/* Pitch Bars */}
          <div className="flex items-center space-x-1">
            <span className="w-14 text-[9px] font-mono text-neutral-400 text-right pr-2">PITCH CV</span>
            <div className="flex-1 grid grid-cols-16 gap-1 h-16 items-end bg-neutral-950 p-1 rounded border border-neutral-900">
              {pat.notes.slice(0, 16).map((note, idx) => {
                const heightPct = Math.min(100, Math.max(10, ((note + 12) / 24) * 100));
                const isCur = matrix.currentStep === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      const nextNote = note >= 12 ? -12 : note + 2;
                      matrix.setStepNote(idx, nextNote);
                      onUpdate();
                    }}
                    className={`rounded-t-sm transition-all cursor-pointer relative group flex flex-col justify-end items-center ${
                      isCur ? 'ring-1 ring-white' : ''
                    }`}
                    style={{ height: `${heightPct}%`, backgroundColor: '#38bdf8' }}
                    title={`Step ${idx + 1}: ${note >= 0 ? '+' : ''}${note} st`}
                  >
                    <span className="text-[7px] font-mono text-neutral-950 font-bold opacity-0 group-hover:opacity-100">
                      {note}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gate Row */}
          <div className="flex items-center space-x-1">
            <span className="w-14 text-[9px] font-mono text-neutral-400 text-right pr-2">GATE CV</span>
            <div className="flex-1 grid grid-cols-16 gap-1">
              {pat.gates.slice(0, 16).map((gate, idx) => {
                const isCur = matrix.currentStep === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      matrix.toggleStepGate(idx);
                      onUpdate();
                    }}
                    className={`h-5 rounded-sm border transition-all ${
                      gate
                        ? 'bg-amber-500 border-amber-400 shadow-[0_0_6px_#f59e0b]'
                        : 'bg-neutral-900 border-neutral-800'
                    } ${isCur ? 'ring-2 ring-white scale-105' : ''}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Curve Modulation Row */}
          <div className="flex items-center space-x-1">
            <span className="w-14 text-[9px] font-mono text-neutral-400 text-right pr-2">CURVE CV</span>
            <div className="flex-1 grid grid-cols-16 gap-1 h-10 items-end bg-neutral-950 p-1 rounded border border-neutral-900">
              {pat.curveCV.slice(0, 16).map((curve, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    const next = (curve + 0.25) % 1.25;
                    matrix.setStepCurve(idx, next > 1 ? 0.2 : next);
                    onUpdate();
                  }}
                  className="rounded-t-sm bg-purple-500 cursor-pointer hover:bg-purple-400 transition-all"
                  style={{ height: `${curve * 100}%` }}
                  title={`Curve CV: ${curve.toFixed(2)}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 8. PULSAR DUAL LFO (Studio Grey)
  if (device.type === 'pulsar') {
    const pulsar = device as PulsarDevice;
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        {/* LFO 1 */}
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-cyan-400 uppercase mb-1">LFO 1 SHAPE</span>
            <select
              value={p.shape1}
              onChange={(e) => setP('shape1', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs px-2 py-1 rounded font-mono text-neutral-200"
            >
              <option value="sine">Sine</option>
              <option value="triangle">Triangle</option>
              <option value="saw">Sawtooth</option>
              <option value="square">Square</option>
              <option value="random">S&H Random</option>
            </select>
          </div>

          <Knob label="RATE 1" value={p.rate1} min={0.1} max={20} step={0.1} unit=" Hz" size="md" variant="metal" onChange={(v) => setP('rate1', v)} />
          <Knob label="DEPTH 1" value={p.depth1} min={0} max={1} step={0.05} size="sm" variant="blue" onChange={(v) => setP('depth1', v)} />

          <div
            className="w-3.5 h-3.5 rounded-full border border-neutral-700 shadow"
            style={{
              backgroundColor: '#06b6d4',
              opacity: Math.max(0.15, (pulsar.lfo1Val + 1) * 0.5),
              boxShadow: `0 0 8px #06b6d4`,
            }}
          />
        </div>

        {/* Real-time Lissajous 2D Phase Scope */}
        <DeviceVisualizer device={device} width={140} height={56} />

        {/* LFO 2 */}
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-amber-400 uppercase mb-1">LFO 2 SHAPE</span>
            <select
              value={p.shape2}
              onChange={(e) => setP('shape2', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs px-2 py-1 rounded font-mono text-neutral-200"
            >
              <option value="sine">Sine</option>
              <option value="triangle">Triangle</option>
              <option value="saw">Sawtooth</option>
              <option value="square">Square</option>
              <option value="random">S&H Random</option>
            </select>
          </div>

          <Knob label="RATE 2" value={p.rate2} min={0.1} max={20} step={0.1} unit=" Hz" size="md" variant="yellow" onChange={(v) => setP('rate2', v)} />
          <Knob label="DEPTH 2" value={p.depth2} min={0} max={1} step={0.05} size="sm" variant="dark" onChange={(v) => setP('depth2', v)} />

          <div
            className="w-3.5 h-3.5 rounded-full border border-neutral-700 shadow"
            style={{
              backgroundColor: '#f59e0b',
              opacity: Math.max(0.15, (pulsar.lfo2Val + 1) * 0.5),
              boxShadow: `0 0 8px #f59e0b`,
            }}
          />
        </div>
      </div>
    );
  }

  // 9. SCREAM 4 TAPE DISTORTION (Brushed Steel Faceplate with Glowing Tube & Transfer Curve)
  if (device.type === 'scream4') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <VacuumTube label="WARMER" isPowered={device.isPowered} glowLevel={Math.min(1, p.drive / 10)} />

        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <Knob label="DRIVE" value={p.drive} min={1} max={20} step={0.2} size="md" variant="yellow" onChange={(v) => setP('drive', v)} />
          <Knob label="WARMTH" value={p.warmth} min={0} max={1} step={0.05} size="sm" variant="white" onChange={(v) => setP('warmth', v)} />
          <Knob label="BIAS" value={p.bias} min={-0.5} max={0.5} step={0.05} size="sm" variant="dark" onChange={(v) => setP('bias', v)} />
          <Knob label="TONE" value={p.tone} min={500} max={16000} step={100} unit=" Hz" size="sm" variant="metal" onChange={(v) => setP('tone', v)} />
          <Knob label="MIX" value={p.mix} min={0} max={1} step={0.05} size="sm" variant="blue" onChange={(v) => setP('mix', v)} />
        </div>

        {/* Real-time Saturation Curve & Dynamics Scope */}
        <DeviceVisualizer device={device} width={140} height={56} />
      </div>
    );
  }

  // 10. THE ECHO STEREO DELAY (Brushed Steel)
  if (device.type === 'echo') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <Knob label="TIME" value={p.time} min={0.05} max={1.8} step={0.02} unit="s" size="md" variant="metal" onChange={(v) => setP('time', v)} />
          <Knob label="FEEDBACK" value={p.feedback} min={0} max={0.92} step={0.02} size="sm" variant="blue" onChange={(v) => setP('feedback', v)} />
          <Knob label="DAMP" value={p.damp} min={800} max={16000} step={100} unit=" Hz" size="sm" variant="dark" onChange={(v) => setP('damp', v)} />

          <button
            onClick={() => setP('pingPong', !p.pingPong)}
            className={`px-3 py-1.5 rounded text-xs font-mono font-bold border transition-colors ${
              p.pingPong
                ? 'bg-blue-950 border-blue-500 text-blue-300'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400'
            }`}
          >
            PING-PONG {p.pingPong ? 'ON' : 'OFF'}
          </button>

          <Knob label="WET / DRY" value={p.mix} min={0} max={1} step={0.05} size="sm" variant="white" onChange={(v) => setP('mix', v)} />
        </div>

        {/* Real-time Echo Delay Tap Visualizer */}
        <DeviceVisualizer device={device} width={140} height={56} />
      </div>
    );
  }

  // 11. RV7000 REVERB (Studio Grey Faceplate)
  if (device.type === 'rv7000') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <div className="flex items-center space-x-3 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-amber-400 uppercase mb-1">ALGORITHM</span>
            <select
              value={p.preset}
              onChange={(e) => setP('preset', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs px-2 py-1 rounded font-mono text-neutral-200"
            >
              <option value="Hall">Concert Hall</option>
              <option value="Plate">Vintage Plate</option>
              <option value="Room">Studio Room</option>
              <option value="Spring">Spring Reverb</option>
              <option value="Space">Infinite Space</option>
            </select>
          </div>

          <Knob label="DECAY" value={p.decay} min={0.3} max={10} step={0.1} unit="s" size="md" variant="yellow" onChange={(v) => setP('decay', v)} />
          <Knob label="PRE-DELAY" value={p.preDelay} min={0} max={0.2} step={0.01} unit="s" size="sm" variant="white" onChange={(v) => setP('preDelay', v)} />
          <Knob label="DAMPING" value={p.damping} min={1000} max={16000} step={200} unit=" Hz" size="sm" variant="dark" onChange={(v) => setP('damping', v)} />
          <Knob label="WET / DRY" value={p.mix} min={0} max={1} step={0.05} size="sm" variant="blue" onChange={(v) => setP('mix', v)} />
        </div>

        {/* Real-time Exponential Decay Impulse Cloud */}
        <DeviceVisualizer device={device} width={140} height={56} />
      </div>
    );
  }

  // 12. MCLASS MASTERING SUITE (Studio Brushed Steel & Grey)
  if (device.type === 'mclass_master') {
    const mclass = device as MClassMasterSuite;
    const gr = mclass.getGainReduction();

    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        {/* 4-Band Parametric EQ */}
        <div className="flex items-center space-x-2 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <Knob label="LOW 90Hz" value={p.eqLowGain} min={-12} max={12} step={0.5} unit="dB" size="sm" variant="dark" onChange={(v) => setP('eqLowGain', v)} />
          <Knob label="LMID 350Hz" value={p.eqLowMidGain} min={-12} max={12} step={0.5} unit="dB" size="sm" variant="blue" onChange={(v) => setP('eqLowMidGain', v)} />
          <Knob label="HMID 3.8k" value={p.eqHighMidGain} min={-12} max={12} step={0.5} unit="dB" size="sm" variant="blue" onChange={(v) => setP('eqHighMidGain', v)} />
          <Knob label="HIGH 10k" value={p.eqHighGain} min={-12} max={12} step={0.5} unit="dB" size="sm" variant="dark" onChange={(v) => setP('eqHighGain', v)} />
        </div>

        {/* Real-time Bode Response & FFT Spectrum Visualizer */}
        <DeviceVisualizer device={device} width={150} height={56} />

        {/* Bus Compressor & GR Meter */}
        <div className="flex items-center space-x-2 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <Knob label="THRESH" value={p.compThreshold} min={-36} max={0} step={1} unit="dB" size="sm" variant="yellow" onChange={(v) => setP('compThreshold', v)} />
          <Knob label="RATIO" value={p.compRatio} min={1.5} max={12} step={0.5} size="sm" variant="white" onChange={(v) => setP('compRatio', v)} />
          <Knob label="MAKEUP" value={p.makeupGain} min={1} max={3} step={0.1} size="sm" variant="metal" onChange={(v) => setP('makeupGain', v)} />

          {/* Gain Reduction Meter */}
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-mono font-bold text-red-400 uppercase">GR METER</span>
            <div className="w-12 h-4 rounded bg-neutral-950 border border-neutral-800 relative overflow-hidden shadow-inner flex items-center">
              <div
                className="h-full bg-red-600 transition-all duration-75"
                style={{ width: `${Math.min(100, (gr / 15) * 100)}%` }}
              />
            </div>
            <span className="text-[7px] font-mono text-neutral-400">-{gr.toFixed(1)} dB</span>
          </div>
        </div>

        {/* Maximizer & Soft Clip */}
        <div className="flex items-center space-x-2 bg-black/40 p-2.5 rounded border border-neutral-800 shadow-inner">
          <Knob label="WARMTH" value={p.warmthDrive} min={1} max={4} step={0.1} size="sm" variant="yellow" onChange={(v) => setP('warmthDrive', v)} />
          <Knob label="CEILING" value={p.limiterCeiling} min={-6} max={0} step={0.1} unit="dB" size="sm" variant="metal" onChange={(v) => setP('limiterCeiling', v)} />
        </div>
      </div>
    );
  }

  // 13. SPIDER AUDIO UTILITY
  if (device.type === 'spider_audio') {
    return (
      <div className="flex items-center justify-between p-2 bg-neutral-900/60 rounded border border-neutral-800">
        <div className="flex items-center space-x-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase">SPIDER AUDIO</span>
            <span className="text-[8px] font-mono text-neutral-400">PARALLEL SIGNAL SPLITTER & MERGER</span>
          </div>
          <div className="flex space-x-2">
            <div className="px-2 py-1 bg-black/50 border border-neutral-700 rounded text-[9px] font-mono text-neutral-300">
              SPLIT: 1 In &rarr; 2 Out (Stereo)
            </div>
            <div className="px-2 py-1 bg-black/50 border border-neutral-700 rounded text-[9px] font-mono text-neutral-300">
              MERGE: 2 In &rarr; 1 Out (Stereo)
            </div>
          </div>
        </div>

        {/* Goniometer / Lissajous Stereo Phase Scope */}
        <div className="flex items-center space-x-3">
          <span className="text-[8px] font-mono text-neutral-500 uppercase">STEREO PHASE:</span>
          <DeviceVisualizer device={device} width={130} height={48} />
        </div>
      </div>
    );
  }

  // 14. SPIDER CV UTILITY
  if (device.type === 'spider_cv') {
    return (
      <div className="flex items-center justify-between p-2 bg-neutral-900/60 rounded border border-neutral-800">
        <div className="flex items-center space-x-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">SPIDER CV</span>
            <span className="text-[8px] font-mono text-neutral-400">CONTROL VOLTAGE SPLITTER & MERGER</span>
          </div>
          {/* Invert Switches */}
          <div className="flex items-center space-x-1.5">
            {[1, 2, 3, 4].map((ch) => (
              <button
                key={ch}
                onClick={() => setP(`invert${ch}`, !p[`invert${ch}`])}
                className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold border transition-colors ${
                  p[`invert${ch}`]
                    ? 'bg-amber-500 border-amber-400 text-black shadow'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
                }`}
                title={`Invert polarity of CV Output ${ch}`}
              >
                INV {ch}: {p[`invert${ch}`] ? 'ON' : 'OFF'}
              </button>
            ))}
          </div>
        </div>

        {/* Real-time Bipolar CV Scope & Voltage Level */}
        <div className="flex items-center space-x-3">
          <span className="text-[8px] font-mono text-neutral-500 uppercase">CV METERS:</span>
          <DeviceVisualizer device={device} width={130} height={48} />
        </div>
      </div>
    );
  }

  // 15. 3X OSC POWER SYNTH (Precision Brushed Light Grey Anodized Aluminum)
  if (device.type === 'three_osc') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <div className="flex items-center space-x-3 bg-black/40 p-2 rounded border border-neutral-800">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-mono font-bold text-emerald-400">OSC 1</span>
            <select
              value={p.osc1Type}
              onChange={(e) => setP('osc1Type', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Saw</option>
              <option value="square">Square</option>
              <option value="sine">Sine</option>
              <option value="triangle">Tri</option>
            </select>
            <Knob
              label="COARSE"
              value={p.osc1Coarse}
              min={-24}
              max={24}
              step={1}
              size="xs"
              variant="metal"
              onChange={(v) => setP('osc1Coarse', v)}
            />
          </div>

          <div className="w-px h-14 bg-neutral-800" />

          <div className="flex flex-col items-center">
            <span className="text-[9px] font-mono font-bold text-emerald-400">OSC 2</span>
            <select
              value={p.osc2Type}
              onChange={(e) => setP('osc2Type', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Saw</option>
              <option value="square">Square</option>
              <option value="sine">Sine</option>
            </select>
            <Knob
              label="FINE"
              value={p.osc2Fine}
              min={-50}
              max={50}
              step={1}
              size="xs"
              variant="metal"
              onChange={(v) => setP('osc2Fine', v)}
            />
          </div>

          <div className="w-px h-14 bg-neutral-800" />

          <div className="flex flex-col items-center">
            <span className="text-[9px] font-mono font-bold text-amber-400">OSC 3 (SUB)</span>
            <select
              value={p.osc3Type}
              onChange={(e) => setP('osc3Type', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-200"
            >
              <option value="square">Square</option>
              <option value="sawtooth">Saw</option>
              <option value="sine">Sine</option>
            </select>
            <Knob
              label="SUB VOL"
              value={p.osc3Vol}
              min={0}
              max={1}
              step={0.05}
              size="xs"
              variant="yellow"
              onChange={(v) => setP('osc3Vol', v)}
            />
          </div>
        </div>

        {/* Filter Section */}
        <div className="flex items-center space-x-2 bg-black/40 p-2 rounded border border-neutral-800">
          <Knob
            label="CUTOFF"
            value={p.cutoff}
            min={100}
            max={12000}
            step={50}
            size="sm"
            variant="metal"
            onChange={(v) => setP('cutoff', v)}
          />
          <Knob
            label="RES"
            value={p.resonance}
            min={0.1}
            max={12}
            step={0.2}
            size="sm"
            variant="metal"
            onChange={(v) => setP('resonance', v)}
          />
        </div>

        {/* Real-time DSP Visualizer Screen */}
        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 16. SYTRUS FM SYNTHESIZER
  if (device.type === 'sytrus') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <div className="flex items-center space-x-3 bg-black/40 p-2 rounded border border-neutral-800">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase">CARRIER OP 1</span>
            <span className="text-[8px] font-mono text-neutral-400">SINE 1x FUNDAMENTAL</span>
            <Knob
              label="RATIO"
              value={p.carrierRatio}
              min={0.5}
              max={8}
              step={0.5}
              size="xs"
              variant="metal"
              onChange={(v) => setP('carrierRatio', v)}
            />
          </div>

          <div className="w-px h-14 bg-neutral-800" />

          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase">MODULATOR OP 2</span>
            <span className="text-[8px] font-mono text-neutral-400">FM DEPTH & RATIO</span>
            <div className="flex space-x-2">
              <Knob
                label="MOD RATIO"
                value={p.modRatio}
                min={1}
                max={12}
                step={1}
                size="xs"
                variant="metal"
                onChange={(v) => setP('modRatio', v)}
              />
              <Knob
                label="FM DEPTH"
                value={p.fmDepth}
                min={0}
                max={1000}
                step={10}
                size="xs"
                variant="yellow"
                onChange={(v) => setP('fmDepth', v)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-black/40 p-2 rounded border border-neutral-800">
          <Knob
            label="CUTOFF"
            value={p.cutoff}
            min={200}
            max={14000}
            step={100}
            size="sm"
            variant="metal"
            onChange={(v) => setP('cutoff', v)}
          />
        </div>

        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 17. FLEX ADVANCED ROMPLER
  if (device.type === 'flex') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <div className="flex items-center space-x-3 bg-black/40 p-2 rounded border border-neutral-800">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase">ROMPLER PRESET</span>
            <select
              value={p.preset}
              onChange={(e) => setP('preset', e.target.value)}
              className="bg-neutral-900 border border-emerald-600 text-xs px-2 py-1 rounded font-mono text-white font-bold"
            >
              <option value="Future Bass Saw">Future Bass Saw</option>
              <option value="Acoustic Pluck">Acoustic Pluck</option>
              <option value="Vintage EP">Vintage EP</option>
              <option value="Dark Cinematic Sub">Dark Cinematic Sub</option>
            </select>
          </div>

          <div className="w-px h-14 bg-neutral-800" />

          {/* 4 Macro Dials */}
          <div className="flex items-center space-x-2">
            <Knob
              label="BRIGHT"
              value={p.macro1}
              min={0}
              max={1}
              step={0.02}
              size="xs"
              variant="metal"
              onChange={(v) => setP('macro1', v)}
            />
            <Knob
              label="SPACE"
              value={p.macro2}
              min={0}
              max={1}
              step={0.02}
              size="xs"
              variant="metal"
              onChange={(v) => setP('macro2', v)}
            />
            <Knob
              label="WIDTH"
              value={p.macro3}
              min={0}
              max={1}
              step={0.02}
              size="xs"
              variant="metal"
              onChange={(v) => setP('macro3', v)}
            />
            <Knob
              label="PUNCH"
              value={p.macro4}
              min={0}
              max={1}
              step={0.02}
              size="xs"
              variant="yellow"
              onChange={(v) => setP('macro4', v)}
            />
          </div>
        </div>

        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 18. AUTOMATION CLIP MODULATOR
  if (device.type === 'automation_clip') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2">
        <div className="flex items-center space-x-3 bg-black/40 p-2 rounded border border-neutral-800">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-amber-400 uppercase">AUTOMATION CLIP</span>
            <span className="text-[8px] font-mono text-neutral-400">CURVE LFO & ENVELOPE MODULATOR</span>
          </div>

          <div className="flex items-center space-x-2">
            <Knob
              label="DEPTH"
              value={0.75}
              min={0}
              max={1}
              step={0.05}
              size="xs"
              variant="yellow"
              onChange={() => {}}
            />
            <Knob
              label="SPEED"
              value={1.0}
              min={0.1}
              max={4}
              step={0.1}
              size="xs"
              variant="metal"
              onChange={() => {}}
            />
          </div>
        </div>

        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 19. BANSURI BAMBOO FLUTE (Mandala & Turquoise Motif)
  if (device.type === 'bansuri') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_20%_50%,_#06b6d4_0%,_transparent_60%),radial-gradient(circle_at_80%_50%,_#f59e0b_0%,_transparent_60%)]" />
        <div className="flex items-center space-x-3 bg-cyan-950/60 p-2.5 rounded border border-cyan-500/50 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-cyan-300 uppercase">BANSURI FLUTE</span>
            <span className="text-[8px] font-mono text-cyan-400/80">MEEND & MICROTONAL BENDING</span>
          </div>
          <Knob
            label="BREATH"
            value={(device as any).breathPressure ?? 0.75}
            min={0}
            max={1}
            step={0.05}
            size="sm"
            variant="yellow"
            onChange={(v) => setP('breathPressure', v)}
          />
          <Knob
            label="VIBRATO"
            value={(device as any).vibratoDepth ?? 0.15}
            min={0}
            max={0.5}
            step={0.02}
            size="sm"
            variant="metal"
            onChange={(v) => setP('vibratoDepth', v)}
          />
          <Knob
            label="MEEND"
            value={(device as any).meendBending ?? 0.0}
            min={-0.2}
            max={0.2}
            step={0.01}
            size="sm"
            variant="yellow"
            onChange={(v) => setP('meendBending', v)}
          />
        </div>
        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 20. CLASSICAL HARMONIUM (Mandala & Deep Red Motif)
  if (device.type === 'harmonium') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,_#ef4444_0%,_transparent_70%)]" />
        <div className="flex items-center space-x-3 bg-rose-950/60 p-2.5 rounded border border-rose-500/50 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-rose-300 uppercase">HARMONIUM</span>
            <span className="text-[8px] font-mono text-rose-400/80">AIR RESERVOIR & REEDS</span>
          </div>
          <Knob
            label="RESERVOIR"
            value={(device as any).airReservoir ?? 0.85}
            min={0.2}
            max={1}
            step={0.05}
            size="sm"
            variant="yellow"
            onChange={(v) => setP('airReservoir', v)}
          />
          <Knob
            label="COUPLING"
            value={(device as any).droneCoupling ?? 0.4}
            min={0}
            max={1}
            step={0.05}
            size="sm"
            variant="metal"
            onChange={(v) => setP('droneCoupling', v)}
          />
        </div>
        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 21. TABLA PERCUSSION (Mandala & Warm Yellow Motif)
  if (device.type === 'tabla') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_30%_50%,_#f59e0b_0%,_transparent_70%)]" />
        <div className="flex items-center space-x-3 bg-amber-950/60 p-2.5 rounded border border-amber-500/50 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-amber-300 uppercase">TABLA PERCUSSION</span>
            <span className="text-[8px] font-mono text-amber-400/80">SKIN TENSION & BAYAN RESONANCE</span>
          </div>
          <Knob
            label="TENSION"
            value={(device as any).skinTension ?? 0.8}
            min={0.3}
            max={1.5}
            step={0.05}
            size="sm"
            variant="yellow"
            onChange={(v) => setP('skinTension', v)}
          />
          <Knob
            label="BAYAN"
            value={(device as any).bayanResonance ?? 0.7}
            min={0.2}
            max={1.2}
            step={0.05}
            size="sm"
            variant="metal"
            onChange={(v) => setP('bayanResonance', v)}
          />
        </div>
        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 22. TANPURA & DRONE GENERATOR (Mandala & Orange/Turquoise Motif)
  if (device.type === 'tanpura') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_70%_50%,_#06b6d4_0%,_transparent_70%)]" />
        <div className="flex items-center space-x-3 bg-teal-950/60 p-2.5 rounded border border-teal-500/50 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-teal-300 uppercase">TANPURA & DRONE</span>
            <span className="text-[8px] font-mono text-teal-400/80">SA-PA CONTINUOUS HARMONICS</span>
          </div>
          <Knob
            label="ROOT SA"
            value={(device as any).droneRoot ?? 110.0}
            min={55}
            max={220}
            step={1}
            unit=" Hz"
            size="sm"
            variant="yellow"
            onChange={(v) => setP('droneRoot', v)}
          />
        </div>
        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 23. DHOL FOLK DRUM
  if (device.type === 'dhol') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_40%_50%,_#f97316_0%,_transparent_70%)]" />
        <div className="flex items-center space-x-3 bg-orange-950/60 p-2.5 rounded border border-orange-500/50 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-orange-300 uppercase">DHOL FOLK DRUM</span>
            <span className="text-[8px] font-mono text-orange-400/80">DUAL-HEADED TRANSIENT PUNCH</span>
          </div>
          <Knob
            label="PUNCH"
            value={(device as any).punchTension ?? 0.85}
            min={0.4}
            max={1.5}
            step={0.05}
            size="sm"
            variant="yellow"
            onChange={(v) => setP('punchTension', v)}
          />
        </div>
        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 24. TUMBI FOLK RESONATOR
  if (device.type === 'tumbi') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_60%_50%,_#a855f7_0%,_transparent_70%)]" />
        <div className="flex items-center space-x-3 bg-purple-950/60 p-2.5 rounded border border-purple-500/50 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-purple-300 uppercase">TUMBI RESONATOR</span>
            <span className="text-[8px] font-mono text-purple-400/80">PLUCKED STRING HARMONICS</span>
          </div>
          <Knob
            label="TENSION"
            value={(device as any).stringTension ?? 0.9}
            min={0.5}
            max={1.4}
            step={0.05}
            size="sm"
            variant="yellow"
            onChange={(v) => setP('stringTension', v)}
          />
        </div>
        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  return (
    <div className="p-3 text-center text-xs font-mono text-neutral-300">
      MODULAR SIGNAL ROUTER // FLIP RACK (TAB) TO ROUTE PATCH CABLES
    </div>
  );
};
