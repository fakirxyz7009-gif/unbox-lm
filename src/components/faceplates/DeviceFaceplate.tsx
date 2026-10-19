import React from 'react';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { SubtractorDevice } from '../../audio/devices/SubtractorDevice.ts';
import { ThorDevice } from '../../audio/devices/ThorDevice.ts';
import { EuropaDevice } from '../../audio/devices/EuropaDevice.ts';
import { MonotoneDevice } from '../../audio/devices/MonotoneDevice.ts';
import { RedrumDevice } from '../../audio/devices/RedrumDevice.ts';
import { MimicDevice } from '../../audio/devices/MimicDevice.ts';
import { MatrixDevice } from '../../audio/devices/MatrixDevice.ts';
import { PulsarDevice } from '../../audio/devices/PulsarDevice.ts';
import { MClassMasterSuite } from '../../audio/devices/MClassMasterSuite.ts';
import { Knob } from '../Knob.tsx';
import { VacuumTube } from '../VacuumTube.tsx';
import { DeviceVisualizer } from '../visualizers/DeviceVisualizer.tsx';
import { ReasonRackFaceplate } from './ReasonRackFaceplates.tsx';
import { soundFontEngine } from '../../audio/SoundFontEngine.ts';
import { Play, Upload, Radio, Wand2, Disc } from 'lucide-react';

interface DeviceFaceplateProps {
  device: BaseDevice;
  onUpdate: () => void;
}

/**
 * Interactive SVG Real-Time Filter Frequency Response Curve (LP24 / BP12 / HP12 / Notch)
 */
export const InteractiveFilterCurve: React.FC<{
  cutoff: number;
  resonance: number;
  filterType: string;
  onChangeCutoff: (hz: number) => void;
  onChangeResonance: (q: number) => void;
  onChangeType: (t: string) => void;
  accentColor?: string;
}> = ({
  cutoff,
  resonance,
  filterType,
  onChangeCutoff,
  onChangeResonance,
  onChangeType,
  accentColor = '#38bdf8',
}) => {
  const normCut = Math.min(1, Math.max(0.05, Math.log10(Math.max(40, cutoff) / 40) / Math.log10(18000 / 40)));
  const normRes = Math.min(1, Math.max(0, (resonance - 0.5) / 15));

  const w = 156;
  const h = 58;
  const cutX = 12 + normCut * (w - 24);
  const peakY = Math.max(6, 34 - normRes * 24);

  const buildPath = () => {
    if (filterType === 'highpass' || filterType === 'HP12') {
      return `M 4 ${h - 4} L ${Math.max(8, cutX - 18)} ${h - 4} Q ${cutX} ${peakY}, ${Math.min(w - 6, cutX + 14)} 26 L ${w - 4} 26`;
    }
    if (filterType === 'bandpass' || filterType === 'BP12') {
      return `M 4 ${h - 4} Q ${Math.max(8, cutX - 20)} ${h - 6}, ${cutX} ${peakY} Q ${Math.min(w - 8, cutX + 20)} ${h - 6}, ${w - 4} ${h - 4}`;
    }
    if (filterType === 'notch' || filterType === 'Notch') {
      return `M 4 24 L ${Math.max(8, cutX - 14)} 24 Q ${cutX} ${h - 4}, ${Math.min(w - 8, cutX + 14)} 24 L ${w - 4} 24`;
    }
    // Default LP24
    return `M 4 28 L ${Math.max(8, cutX - 16)} 28 Q ${cutX} ${peakY}, ${Math.min(w - 6, cutX + 18)} ${h - 4} L ${w - 4} ${h - 4}`;
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = Math.min(1, Math.max(0.02, (e.clientX - rect.left) / rect.width));
    const ry = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const nextHz = Math.round(40 * Math.pow(18000 / 40, rx));
    const nextQ = Number((0.5 + ry * 14.5).toFixed(1));
    onChangeCutoff(nextHz);
    onChangeResonance(nextQ);
  };

  return (
    <div className="flex flex-col bg-[#05080f] p-1.5 rounded border border-slate-800 shadow-inner select-none">
      <div className="flex items-center justify-between mb-1 px-0.5">
        <span className="text-[8px] font-mono font-bold text-slate-400">FILTER RESPONSE</span>
        <div className="flex space-x-0.5">
          {(['LP24', 'BP12', 'HP12', 'Notch'] as const).map((mode) => {
            const active =
              (filterType === 'lowpass' && mode === 'LP24') ||
              filterType === mode ||
              (!filterType && mode === 'LP24');
            return (
              <button
                key={mode}
                onClick={() => onChangeType(mode)}
                className={`px-1 py-0.2 rounded text-[7px] font-mono font-bold transition-colors ${
                  active
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>
      <svg
        width={w}
        height={h}
        onClick={handleSvgClick}
        className="cursor-crosshair rounded bg-[#030509] border border-slate-900"
      >
        <title>Click to sculpt Filter Cutoff ({Math.round(cutoff)} Hz) &amp; Resonance ({resonance.toFixed(1)})</title>
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={w * g} y1={0} x2={w * g} y2={h} stroke="#111827" strokeWidth="1" />
        ))}
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#111827" strokeWidth="1" />
        {/* Fill under curve */}
        <path d={`${buildPath()} L ${w - 4} ${h} L 4 ${h} Z`} fill={accentColor} fillOpacity="0.16" />
        {/* Main response curve */}
        <path d={buildPath()} fill="none" stroke={accentColor} strokeWidth="2" />
        {/* Interactive Cutoff/Q node */}
        <circle
          cx={cutX}
          cy={peakY + 4}
          r="4"
          fill="#ffffff"
          stroke={accentColor}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
};

/**
 * 4 Vertical ADSR Envelope Sliders + Unison Spread LEDs
 */
export const VerticalAdsrEnvelopeBank: React.FC<{
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  unisonSpread?: number;
  onChange: (key: string, val: number) => void;
}> = ({ attack, decay, sustain, release, unisonSpread = 0.5, onChange }) => {
  const sliders = [
    { key: 'attack', label: 'A', val: attack, min: 0.01, max: 2.0, step: 0.01 },
    { key: 'decay', label: 'D', val: decay, min: 0.05, max: 2.5, step: 0.02 },
    { key: 'sustain', label: 'S', val: sustain, min: 0.0, max: 1.0, step: 0.02 },
    { key: 'release', label: 'R', val: release, min: 0.05, max: 3.5, step: 0.05 },
  ];

  return (
    <div className="flex items-center space-x-2.5 bg-black/55 px-2.5 py-1.5 rounded border border-neutral-800 shadow-inner">
      <div className="flex items-center space-x-1.5">
        {sliders.map((s) => {
          const pct = Math.min(100, Math.max(5, ((s.val - s.min) / (s.max - s.min)) * 100));
          return (
            <div key={s.key} className="flex flex-col items-center">
              <div className="relative w-3.5 h-12 bg-neutral-950 rounded-xs border border-neutral-800 flex items-end p-0.5">
                <div
                  className="w-full bg-gradient-to-t from-cyan-600 to-emerald-400 rounded-xs pointer-events-none"
                  style={{ height: `${pct}%` }}
                />
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={s.val}
                  onChange={(e) => onChange(s.key, parseFloat(e.target.value))}
                  className="absolute inset-0 opacity-0 cursor-ns-resize w-full h-full"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  title={`${s.key.toUpperCase()}: ${s.val.toFixed(2)}`}
                />
              </div>
              <span className="text-[8px] font-mono font-bold text-neutral-300 mt-0.5">{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Unison Spread 5-LED Detune Indicator */}
      <div className="flex flex-col items-center pl-1.5 border-l border-neutral-800">
        <span className="text-[7px] font-mono font-bold text-amber-400 uppercase mb-1">UNISON</span>
        <div className="flex space-x-0.5 mb-1">
          {[0, 1, 2, 3, 4].map((led) => {
            const isLit = unisonSpread >= led * 0.2;
            return (
              <div
                key={led}
                className={`w-1.5 h-3 rounded-xs ${
                  isLit ? 'bg-amber-400 shadow-[0_0_5px_#f59e0b]' : 'bg-neutral-900 border border-neutral-800'
                }`}
              />
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={unisonSpread}
          onChange={(e) => onChange('unison', parseFloat(e.target.value))}
          className="w-12 h-1 accent-amber-400 bg-neutral-800 rounded cursor-pointer"
          title="Unison Detune Spread"
        />
      </div>
    </div>
  );
};

/**
 * Interactive 16-Step Hardware Run-Light Ribbon for Drum Computers & Samplers
 */
export const HardwareStepRibbon: React.FC<{
  device: BaseDevice;
  onUpdate: () => void;
}> = ({ device, onUpdate }) => {
  const track = audioEngine.tracks.find((t) => t.deviceId === device.id);
  const curStep = audioEngine.currentStep % 16;

  return (
    <div className="bg-black/75 px-3 py-1.5 rounded border border-neutral-800 flex items-center justify-between gap-2 shadow-inner">
      <div className="flex items-center space-x-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_#ef4444]" />
        <span className="text-[8px] font-mono font-black text-amber-400 uppercase tracking-wider">
          16-STEP RUN-LIGHT RIBBON
        </span>
      </div>
      <div className="flex-1 grid grid-cols-16 gap-1 max-w-xl">
        {Array.from({ length: 16 }).map((_, sIdx) => {
          const hasStep = !!track?.steps[sIdx];
          const isPlayhead = audioEngine.isPlaying && curStep === sIdx;
          return (
            <button
              key={sIdx}
              onClick={() => {
                if (!track) return;
                if (hasStep) {
                  audioEngine.setTrackStep(track.id, sIdx, null);
                } else {
                  audioEngine.setTrackStep(track.id, sIdx, {
                    note: 60 + (sIdx % 4),
                    velocity: 0.92,
                    length: 1,
                  });
                  device.noteOn(60 + (sIdx % 4), 0.92);
                }
                onUpdate();
              }}
              className={`h-4 rounded-xs border transition-all flex items-center justify-center text-[7px] font-mono font-bold ${
                isPlayhead
                  ? 'bg-white text-black border-white shadow-[0_0_10px_#ffffff] scale-105'
                  : hasStep
                  ? sIdx % 4 === 0
                    ? 'bg-red-500 text-white border-red-300 shadow-[0_0_6px_#ef4444]'
                    : 'bg-amber-500 text-black border-amber-300 shadow-[0_0_5px_#f59e0b]'
                  : sIdx % 4 === 0
                  ? 'bg-neutral-800 text-neutral-400 border-neutral-700'
                  : 'bg-neutral-950 text-neutral-600 border-neutral-800'
              }`}
              title={`Step ${sIdx + 1}: Click to toggle drum trigger`}
            >
              {sIdx + 1}
            </button>
          );
        })}
      </div>
      <span className="text-[8px] font-mono text-emerald-400 font-bold">
        SYNC: {audioEngine.bpm} BPM
      </span>
    </div>
  );
};

/**
 * Dual-Needle Illuminated Vintage VU & Gain Reduction Meter for Outboard FX & Mastering
 */
export const DualNeedleVuMeter: React.FC<{
  label?: string;
  driveLevel?: number;
  grDb?: number;
}> = ({ label = 'VU / GR', driveLevel = 0.5, grDb = 1.8 }) => {
  const angleL = -38 + Math.min(1, Math.max(0.05, driveLevel)) * 72;
  const angleR = -38 + Math.min(1, Math.max(0.05, driveLevel * 0.92)) * 72;

  return (
    <div className="flex flex-col items-center bg-[#1c1309] p-1.5 rounded border border-amber-600/50 shadow-inner w-28 select-none">
      <div className="w-full h-11 rounded bg-gradient-to-b from-[#fef3c7] via-[#fde68a] to-[#f59e0b] border border-amber-900 relative overflow-hidden shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)]">
        {/* dB Scale Arc */}
        <div className="absolute inset-x-1.5 top-1 flex justify-between text-[6px] font-mono font-black text-amber-950">
          <span>-20</span>
          <span>-10</span>
          <span>-3</span>
          <span className="text-red-700">0</span>
          <span className="text-red-700">+3</span>
        </div>
        {/* Left Needle (Input Drive) */}
        <div
          className="absolute bottom-0 left-1/2 w-0.5 h-9 bg-neutral-900 origin-bottom transition-transform duration-100"
          style={{ transform: `translateX(-4px) rotate(${angleL}deg)` }}
        />
        {/* Right Needle (Gain Reduction / Output) */}
        <div
          className="absolute bottom-0 left-1/2 w-0.5 h-9 bg-red-700 origin-bottom transition-transform duration-100"
          style={{ transform: `translateX(4px) rotate(${angleR}deg)` }}
        />
        <div className="absolute bottom-0.5 inset-x-0 text-center text-[6px] font-mono font-black text-amber-950 uppercase">
          {label} &bull; -{grDb.toFixed(1)}dB
        </div>
      </div>
    </div>
  );
};

/**
 * One-Click Taal / Raga Phrase Selector for Indian Classical & World Acoustic Suite
 */
export const TaalRagaPhraseSelector: React.FC<{
  device: BaseDevice;
  onUpdate: () => void;
}> = ({ device, onUpdate }) => {
  const isPerc = device.type === 'tabla' || device.type === 'dhol';
  const presets = isPerc
    ? [
        { id: 'teentaal', label: 'Teentaal (16-Matra)', notes: [60, null, 62, 64, 65, null, 67, 48, 60, 62, 64, null, 65, 67, 48, 62] },
        { id: 'keherwa', label: 'Keherwa (8-Beat Folk)', notes: [65, null, 62, 60, 48, null, 67, 64, 65, null, 62, 60, 48, 62, 67, 64] },
        { id: 'bhangra', label: 'Punjabi Bhangra Chacha', notes: [48, 60, 64, 48, 65, null, 60, 64, 48, 60, 64, 48, 65, 67, 60, 64] },
      ]
    : [
        { id: 'bhairav', label: 'Raga Bhairav Alap', notes: [60, null, 61, null, 64, null, 65, null, 67, null, 68, null, 71, null, 72, null] },
        { id: 'yaman', label: 'Raga Yaman Gat', notes: [59, 62, 64, null, 66, 67, 71, null, 72, 71, 67, null, 66, 64, 62, 60] },
        { id: 'desh', label: 'Raga Desh Taan', notes: [60, 62, 65, 67, 71, 72, null, 70, 69, 67, 65, 64, 62, null, 60, null] },
      ];

  const applyPhrase = (phrase: { label: string; notes: (number | null)[] }) => {
    const track = audioEngine.getOrCreateTrackForDevice(device.id);
    if (track) {
      phrase.notes.forEach((n, idx) => {
        audioEngine.setTrackStep(
          track.id,
          idx,
          n !== null
            ? {
                note: n,
                velocity: idx % 4 === 0 ? 0.96 : 0.84,
                length: isPerc ? 1 : 2,
              }
            : null
        );
      });
    }
    const firstMidi = phrase.notes.find((n) => n !== null) ?? 60;
    device.noteOn(firstMidi, 0.95);
    setTimeout(() => device.noteOff(firstMidi), 280);
    onUpdate();
  };

  return (
    <div className="flex flex-col bg-[#160b04]/90 p-2 rounded border border-amber-500/40 shadow-inner">
      <span className="text-[8px] font-mono font-black text-amber-300 uppercase flex items-center mb-1">
        <Wand2 className="w-2.5 h-2.5 mr-1 text-amber-400" />
        {isPerc ? 'TAAL BOL PHRASE SELECTOR' : 'RAGA PHRASE SELECTOR'}
      </span>
      <div className="flex flex-wrap gap-1">
        {presets.map((pr) => (
          <button
            key={pr.id}
            onClick={() => applyPhrase(pr)}
            className="px-2 py-1 rounded bg-gradient-to-b from-amber-500/25 to-amber-900/40 hover:from-amber-400 hover:to-amber-500 text-amber-200 hover:text-slate-950 border border-amber-500/50 text-[8px] font-mono font-bold transition-all"
            title={`Seed ${pr.label} phrase into Sequencer & Audition`}
          >
            {pr.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const DeviceFaceplate: React.FC<DeviceFaceplateProps> = ({ device, onUpdate }) => {
  const p = device.params;

  const setP = (key: string, val: any) => {
    device.setParam(key, val);
    onUpdate();
  };

  // 0. RED COMBINATOR — POLYPHONIC SYNTHESIZER (Reference Rack Unit #1)
  if (device.type === 'combinator') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        {/* Left: 5 Rotary Knobs matching Reference UI (Cutoff, Resonance, Attack, Decay, Release) */}
        <div className="flex items-center space-x-3 bg-black/45 px-3 py-2 rounded border border-rose-400/30 shadow-inner">
          <Knob
            label="Cutoff"
            value={p.macro1 ?? 0.65}
            min={0.05}
            max={1}
            step={0.02}
            size="sm"
            variant="metal"
            onChange={(v) => setP('macro1', v)}
          />
          <Knob
            label="Resonance"
            value={p.macro2 ?? 0.35}
            min={0}
            max={1}
            step={0.02}
            size="sm"
            variant="metal"
            onChange={(v) => setP('macro2', v)}
          />
          <Knob
            label="Attack"
            value={p.macro3 ?? 0.08}
            min={0.01}
            max={1}
            step={0.02}
            size="sm"
            variant="metal"
            onChange={(v) => setP('macro3', v)}
          />
          <Knob
            label="Decay"
            value={p.macro4 ?? 0.55}
            min={0.05}
            max={1}
            step={0.02}
            size="sm"
            variant="metal"
            onChange={(v) => setP('macro4', v)}
          />
          <Knob
            label="Release"
            value={p.release ?? 0.4}
            min={0.05}
            max={1.5}
            step={0.05}
            size="sm"
            variant="metal"
            onChange={(v) => setP('release', v)}
          />
        </div>

        {/* Center/Right: Real-time Canvas Waveform Visualizer Window + PATCH SELECT */}
        <div className="flex items-center space-x-3">
          <DeviceVisualizer device={device} width={180} height={54} />
          <div className="flex flex-col space-y-1.5">
            <select
              value={p.patchName || 'Analog Brass Poly'}
              onChange={(e) => {
                const val = e.target.value;
                setP('patchName', val);
                if (val === 'Cyber Pluck') {
                  setP('macro1', 0.78);
                  setP('macro2', 0.52);
                } else if (val === 'Warm Pad') {
                  setP('macro1', 0.42);
                  setP('macro3', 0.45);
                } else {
                  setP('macro1', 0.65);
                  setP('macro2', 0.35);
                }
              }}
              className="px-2.5 py-1 rounded bg-rose-950/90 border border-rose-400/50 text-[10px] font-mono font-bold text-rose-100 uppercase tracking-wider shadow cursor-pointer"
            >
              <option value="Analog Brass Poly">PATCH SELECT: ANALOG POLY</option>
              <option value="Cyber Pluck">PATCH: CYBER PLUCK LEAD</option>
              <option value="Warm Pad">PATCH: HORIZON PAD</option>
              <option value="SoundFont Grand">PATCH: SOUNDFONT LAYER</option>
            </select>
            <button
              onClick={() => {
                const now = audioEngine.ctx.currentTime;
                device.noteOn(60, 0.92, now);
                device.noteOn(64, 0.88, now);
                device.noteOn(67, 0.88, now);
                device.noteOff(60, now + 0.35);
                device.noteOff(64, now + 0.35);
                device.noteOff(67, now + 0.35);
              }}
              className="px-3 py-1 rounded bg-rose-500 hover:bg-rose-400 text-white font-mono font-black text-[10px] flex items-center justify-center space-x-1 shadow"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>AUDITION CHORD</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1. SUBTRACTOR SYNTH (Matte-Black Anodized Aluminum Faceplate with Dual Osc, SVG Filter Curve, Vertical ADSR & LFO)
  if (device.type === 'subtractor') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        {/* Dual Oscillator Section */}
        <div className="flex items-center space-x-2.5 bg-black/50 p-2 rounded border border-neutral-800 shadow-inner">
          <div className="flex flex-col space-y-1">
            <span className="text-[8px] font-mono font-bold text-amber-400 uppercase">OSC 1 WAVE</span>
            <select
              value={p.osc1Type}
              onChange={(e) => setP('osc1Type', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Sawtooth</option>
              <option value="square">Square / Pulse</option>
              <option value="triangle">Triangle</option>
            </select>
            <span className="text-[8px] font-mono font-bold text-cyan-400 uppercase mt-1">OSC 2 WAVE</span>
            <select
              value={p.osc2Type}
              onChange={(e) => setP('osc2Type', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Sawtooth</option>
              <option value="square">Square / Pulse</option>
              <option value="triangle">Triangle</option>
            </select>
          </div>

          <Knob label="OCT 1" value={p.osc1Octave ?? 0} min={-2} max={2} step={1} size="xs" variant="yellow" onChange={(v) => setP('osc1Octave', v)} />
          <Knob label="OCT 2" value={p.osc2Octave ?? 0} min={-2} max={2} step={1} size="xs" variant="yellow" onChange={(v) => setP('osc2Octave', v)} />
          <Knob label="DETUNE" value={p.osc2Detune ?? 12} min={-50} max={50} step={1} unit="¢" size="xs" variant="white" onChange={(v) => setP('osc2Detune', v)} />
          <Knob label="SUB LVL" value={p.subOscLevel ?? 0.4} min={0} max={1} step={0.05} size="xs" variant="dark" onChange={(v) => setP('subOscLevel', v)} />
        </div>

        {/* Interactive SVG Filter Frequency Response Curve + Cutoff/Resonance */}
        <div className="flex items-center space-x-2.5 bg-black/50 p-2 rounded border border-neutral-800 shadow-inner">
          <InteractiveFilterCurve
            cutoff={p.cutoff ?? 2400}
            resonance={p.resonance ?? 3.5}
            filterType={p.filterType || 'LP24'}
            onChangeCutoff={(hz) => setP('cutoff', hz)}
            onChangeResonance={(q) => setP('resonance', q)}
            onChangeType={(t) => setP('filterType', t)}
            accentColor="#f59e0b"
          />
          <Knob label="CUTOFF" value={p.cutoff ?? 2400} min={40} max={16000} step={10} unit="Hz" size="sm" variant="yellow" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 3.5} min={0.5} max={15} step={0.1} size="xs" variant="metal" onChange={(v) => setP('resonance', v)} />
        </div>

        {/* 4 Vertical ADSR Envelope Sliders + Unison Spread LEDs */}
        <VerticalAdsrEnvelopeBank
          attack={p.attack ?? 0.02}
          decay={p.decay ?? 0.35}
          sustain={p.sustain ?? 0.5}
          release={p.release ?? 0.25}
          unisonSpread={p.unison ?? 0.6}
          onChange={setP}
        />

        {/* LFO Rate/Amount + Real-Time Scope */}
        <div className="flex items-center space-x-2 bg-black/50 p-2 rounded border border-neutral-800">
          <Knob label="LFO RATE" value={p.lfoRate ?? 3.2} min={0.1} max={20} step={0.1} unit="Hz" size="xs" variant="blue" onChange={(v) => setP('lfoRate', v)} />
          <Knob label="LFO AMT" value={p.lfoAmount ?? 0.35} min={0} max={1} step={0.05} size="xs" variant="white" onChange={(v) => setP('lfoAmount', v)} />
          <DeviceVisualizer device={device} width={125} height={54} />
        </div>

        {/* Master Output & Test trigger */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              (device as SubtractorDevice).noteOn(60, 0.9);
              setTimeout(() => (device as SubtractorDevice).noteOff(60), 250);
            }}
            className="px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center space-x-1 shadow-md transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>PLAY</span>
          </button>
          <Knob label="VOL" value={p.volume ?? 0.85} min={0} max={1.5} step={0.05} size="xs" variant="metal" onChange={(v) => setP('volume', v)} />
        </div>
      </div>
    );
  }

  // 2. THOR POLYSONIC SYNTH (Brushed Cobalt Faceplate with Dual Osc, SVG Filter Curve, Vertical ADSR & Tubes)
  if (device.type === 'thor') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex items-center space-x-2">
          <VacuumTube label="TUBE A" isPowered={device.isPowered} glowLevel={Math.min(1, (p.drive ?? 2) / 8)} />
          <VacuumTube label="TUBE B" isPowered={device.isPowered} glowLevel={Math.min(1, (p.drive ?? 2) / 8)} />
        </div>

        {/* Oscillators with Waveform Selectors & Studio Yellow Knobs */}
        <div className="flex items-center space-x-2.5 bg-black/45 p-2 rounded border border-blue-900/40 shadow-inner">
          <div className="flex flex-col space-y-1">
            <span className="text-[8px] font-mono font-bold text-amber-300">OSC 1 / 2 MODE</span>
            <select
              value={p.osc1Type || 'sawtooth'}
              onChange={(e) => setP('osc1Type', e.target.value)}
              className="bg-slate-950 border border-blue-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-white"
            >
              <option value="sawtooth">Multi-Osc Saw</option>
              <option value="square">PWM Pulse</option>
              <option value="triangle">FM Pair</option>
            </select>
          </div>
          <Knob label="OSC 1 OCT" value={p.osc1Octave ?? 0} min={-2} max={2} step={1} size="xs" variant="yellow" onChange={(v) => setP('osc1Octave', v)} />
          <Knob label="DETUNE" value={p.osc2Detune ?? 14} min={-50} max={50} step={1} unit="¢" size="xs" variant="white" onChange={(v) => setP('osc2Detune', v)} />
          <Knob label="SHAPER" value={p.drive ?? 2.4} min={1} max={10} step={0.2} size="xs" variant="yellow" onChange={(v) => setP('drive', v)} />
        </div>

        {/* Interactive Filter Curve */}
        <div className="flex items-center space-x-2.5 bg-black/45 p-2 rounded border border-blue-900/40 shadow-inner">
          <InteractiveFilterCurve
            cutoff={p.cutoff ?? 3600}
            resonance={p.resonance ?? 4.2}
            filterType={p.filterType || 'LP24'}
            onChangeCutoff={(hz) => setP('cutoff', hz)}
            onChangeResonance={(q) => setP('resonance', q)}
            onChangeType={(t) => setP('filterType', t)}
            accentColor="#38bdf8"
          />
          <Knob label="CUTOFF" value={p.cutoff ?? 3600} min={40} max={18000} step={10} unit="Hz" size="sm" variant="yellow" onChange={(v) => setP('cutoff', v)} />
          <Knob label="CHORUS" value={p.chorusAmount ?? 0.45} min={0} max={1} step={0.05} size="xs" variant="white" onChange={(v) => setP('chorusAmount', v)} />
        </div>

        {/* 4 Vertical ADSR Envelope Sliders */}
        <VerticalAdsrEnvelopeBank
          attack={p.attack ?? 0.02}
          decay={p.decay ?? 0.4}
          sustain={p.sustain ?? 0.65}
          release={p.release ?? 0.35}
          unisonSpread={p.chorusAmount ?? 0.5}
          onChange={setP}
        />

        <DeviceVisualizer device={device} width={135} height={54} />

        <button
          onClick={() => {
            (device as ThorDevice).noteOn(60, 0.9);
            setTimeout(() => (device as ThorDevice).noteOff(60), 300);
          }}
          className="px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center space-x-1 shadow-md transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>PLAY</span>
        </button>
      </div>
    );
  }

  // 3. EUROPA WAVETABLE SYNTH (Studio Cobalt Blue Faceplate with Wavetable Selector, Filter Response Curve & Vertical ADSR)
  if (device.type === 'europa') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <VacuumTube label="SPECTRAL" isPowered={device.isPowered} glowLevel={p.morph ?? 0.6} />

        {/* Wavetable display & Morph */}
        <div className="flex items-center space-x-2.5 bg-black/45 p-2 rounded border border-blue-900/40 shadow-inner">
          <div className="flex flex-col space-y-1">
            <span className="text-[8px] font-mono font-bold text-cyan-400 uppercase">ENGINE 1 WAVETABLE</span>
            <select
              value={p.wavetableShape}
              onChange={(e) => setP('wavetableShape', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Harmonic Saw</option>
              <option value="triangle">Morph Triangle</option>
              <option value="square">Pulse Spectrum</option>
            </select>
            <span className="text-[8px] font-mono font-bold text-amber-400 uppercase">ENGINE 2 MOD</span>
            <select
              value={p.engine2Wave || 'square'}
              onChange={(e) => setP('engine2Wave', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-200"
            >
              <option value="square">FM Vocal Formant</option>
              <option value="sawtooth">Sync Harmonic</option>
              <option value="triangle">Sub Octave</option>
            </select>
          </div>

          <Knob label="MORPH" value={p.morph ?? 0.5} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('morph', v)} />
          <Knob label="UNISON" value={p.unison ?? 0.65} min={0} max={1} step={0.05} size="xs" variant="white" onChange={(v) => setP('unison', v)} />
          <Knob label="SUB OSC" value={p.subLevel ?? 0.4} min={0} max={1} step={0.05} size="xs" variant="dark" onChange={(v) => setP('subLevel', v)} />
        </div>

        {/* Interactive SVG Spectral Filter Curve */}
        <div className="flex items-center space-x-2.5 bg-black/45 p-2 rounded border border-blue-900/40 shadow-inner">
          <InteractiveFilterCurve
            cutoff={p.cutoff ?? 4200}
            resonance={p.resonance ?? 3.8}
            filterType={p.filterType || 'LP24'}
            onChangeCutoff={(hz) => setP('cutoff', hz)}
            onChangeResonance={(q) => setP('resonance', q)}
            onChangeType={(t) => setP('filterType', t)}
            accentColor="#06b6d4"
          />
          <Knob label="CUTOFF" value={p.cutoff ?? 4200} min={50} max={18000} step={20} unit="Hz" size="sm" variant="blue" onChange={(v) => setP('cutoff', v)} />
          <Knob label="FORMANT" value={p.formantFreq ?? 1200} min={300} max={4000} step={20} unit="Hz" size="xs" variant="white" onChange={(v) => setP('formantFreq', v)} />
        </div>

        {/* 4 Vertical ADSR Envelope Sliders */}
        <VerticalAdsrEnvelopeBank
          attack={p.attack ?? 0.03}
          decay={p.decay ?? 0.45}
          sustain={p.sustain ?? 0.7}
          release={p.release ?? 0.5}
          unisonSpread={p.unison ?? 0.65}
          onChange={setP}
        />

        <DeviceVisualizer device={device} width={135} height={54} />

        <button
          onClick={() => {
            (device as EuropaDevice).noteOn(57, 0.9);
            setTimeout(() => (device as EuropaDevice).noteOff(57), 400);
          }}
          className="px-3 py-2 rounded bg-sky-500 hover:bg-sky-400 text-black font-mono font-bold text-xs flex items-center space-x-1 shadow-md transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>PLAY</span>
        </button>
      </div>
    );
  }

  // 4. MONOTONE BASS SYNTH (Slate Black with Filter Curve & Vertical ADSR)
  if (device.type === 'monotone') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-neutral-800 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-amber-400 uppercase mb-1">OSC SHAPE</span>
            <select
              value={p.waveform}
              onChange={(e) => setP('waveform', e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs px-2 py-1 rounded font-mono text-neutral-200"
            >
              <option value="sawtooth">Sawtooth</option>
              <option value="square">Square</option>
            </select>
          </div>
          <Knob label="SUB BASS" value={p.subLevel ?? 0.6} min={0} max={1} step={0.05} size="sm" variant="white" onChange={(v) => setP('subLevel', v)} />
          <Knob label="DRIVE" value={p.drive ?? 2.5} min={1} max={8} step={0.2} size="sm" variant="yellow" onChange={(v) => setP('drive', v)} />
        </div>

        <div className="flex items-center space-x-2.5 bg-black/50 p-2 rounded border border-neutral-800 shadow-inner">
          <InteractiveFilterCurve
            cutoff={p.cutoff ?? 950}
            resonance={p.resonance ?? 5.5}
            filterType={p.filterType || 'LP24'}
            onChangeCutoff={(hz) => setP('cutoff', hz)}
            onChangeResonance={(q) => setP('resonance', q)}
            onChangeType={(t) => setP('filterType', t)}
            accentColor="#eab308"
          />
          <Knob label="CUTOFF" value={p.cutoff ?? 950} min={30} max={8000} step={10} unit="Hz" size="sm" variant="yellow" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 5.5} min={0.5} max={12} step={0.2} size="xs" variant="metal" onChange={(v) => setP('resonance', v)} />
        </div>

        <VerticalAdsrEnvelopeBank
          attack={p.attack ?? 0.01}
          decay={p.decay ?? 0.3}
          sustain={p.sustain ?? 0.4}
          release={p.release ?? 0.2}
          unisonSpread={0.35}
          onChange={setP}
        />

        <DeviceVisualizer device={device} width={135} height={54} />

        <button
          onClick={() => {
            (device as MonotoneDevice).noteOn(36, 1.0);
            setTimeout(() => (device as MonotoneDevice).noteOff(36), 250);
          }}
          className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center space-x-1.5 shadow-md transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>SUB HIT</span>
        </button>
      </div>
    );
  }

  // 5. REDRUM DRUM COMPUTER (8-Channel Drum Workstation with Flashing MPC Pads & 16-Step Run-Light Ribbon)
  if (device.type === 'redrum') {
    const redrum = device as RedrumDevice;
    const isStepActive = audioEngine.isPlaying;
    return (
      <div className="flex flex-col space-y-2.5 p-2">
        <div className="flex items-center justify-between bg-black/60 px-3 py-1.5 rounded border border-neutral-700 shadow-inner">
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-mono font-bold text-amber-400 tracking-wider">
              REDRUM · 8-CHANNEL HARDWARE DRUM COMPUTER
            </span>
            <span className="text-[9px] font-mono text-neutral-400">ANALOG SYNTHESIS &amp; PCM TRANSIENTS</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-[8px] font-mono text-neutral-400 uppercase">TRANSIENT BUS:</span>
            <DeviceVisualizer device={device} width={150} height={44} />
          </div>
        </div>

        {/* 8-Channel Strip Row with Velocity-Sensitive Flashing Pads */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 bg-neutral-900/95 p-2.5 rounded border border-neutral-700 shadow-inner overflow-x-auto">
          {redrum.voices.map((v, idx) => {
            const flashOnBeat = isStepActive && audioEngine.currentStep % 8 === idx;
            return (
              <div key={v.id} className="flex flex-col items-center bg-neutral-950 p-2 rounded border border-neutral-800">
                <span className="text-[9px] font-mono font-bold text-amber-400 mb-1 truncate w-full text-center">
                  {idx + 1}. {v.name}
                </span>

                {/* Glowing Velocity-Sensitive MPC Pad */}
                <button
                  onClick={() => {
                    redrum.triggerPad(idx, 1.0);
                    onUpdate();
                  }}
                  className={`w-full h-11 rounded border text-[9px] font-mono font-black flex flex-col items-center justify-center transition-all mb-2 ${
                    flashOnBeat
                      ? 'bg-amber-400 text-black border-white shadow-[0_0_14px_#f59e0b] scale-105'
                      : 'bg-gradient-to-b from-neutral-800 to-neutral-900 hover:from-neutral-700 hover:to-neutral-800 active:from-amber-500 active:to-amber-600 border-amber-500/40 text-amber-200 shadow'
                  }`}
                >
                  <span>PAD {idx + 1}</span>
                  <span className="text-[7px] opacity-75">TRIG</span>
                </button>

                <Knob
                  label="PITCH"
                  value={v.pitch}
                  min={idx === 0 ? 30 : idx === 1 ? 80 : 100}
                  max={idx === 0 ? 120 : idx === 1 ? 400 : 8000}
                  step={5}
                  size="xs"
                  variant="dark"
                  onChange={(val) => {
                    v.pitch = val;
                    onUpdate();
                  }}
                />

                <Knob
                  label="DECAY"
                  value={v.decay}
                  min={0.05}
                  max={1.5}
                  step={0.02}
                  size="xs"
                  variant="yellow"
                  onChange={(val) => {
                    v.decay = val;
                    onUpdate();
                  }}
                />

                <div className="flex space-x-1 mt-1">
                  <button
                    onClick={() => {
                      v.mute = !v.mute;
                      onUpdate();
                    }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-mono border font-bold ${
                      v.mute ? 'bg-red-950 border-red-600 text-red-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    M
                  </button>
                  <button
                    onClick={() => {
                      v.solo = !v.solo;
                      onUpdate();
                    }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-mono border font-bold ${
                      v.solo ? 'bg-amber-950 border-amber-500 text-amber-300' : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    S
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Interactive 16-Step Run-Light Ribbon */}
        <HardwareStepRibbon device={device} onUpdate={onUpdate} />
      </div>
    );
  }

  // 6. MIMIC SAMPLER (8-Pad Multi-Slot Sample Workstation + 16-Step Run-Light Ribbon)
  if (device.type === 'mimic') {
    const mimic = device as MimicDevice;
    return (
      <div className="flex flex-col space-y-2.5 p-2">
        <div className="flex items-center justify-between bg-black/60 px-3 py-1.5 rounded border border-neutral-700 shadow-inner">
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
              MIMIC · MULTI-SLOT SAMPLE WORKSTATION
            </span>
            <span className="text-[9px] font-mono text-neutral-400">8 VELOCITY PADS &bull; DRAG &amp; DROP WAV</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-[8px] font-mono text-neutral-400 uppercase">SAMPLE SCOPE:</span>
            <DeviceVisualizer device={device} width={150} height={44} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {mimic.pads.map((pad, idx) => {
            const flashOnBeat = audioEngine.isPlaying && audioEngine.currentStep % 8 === idx;
            return (
              <div
                key={pad.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer?.files?.[0];
                  if (f) {
                    mimic.loadSampleFile(idx, f).then(() => onUpdate());
                  }
                }}
                className="flex flex-col items-center bg-neutral-900/95 p-2 rounded border border-neutral-700 group hover:border-cyan-500/60 transition-colors shadow-inner"
                title="Click to trigger or Drag & Drop .WAV / .MP3 onto Pad"
              >
                <button
                  onClick={() => mimic.triggerPad(idx, 1.0)}
                  className={`w-full h-14 rounded border flex flex-col items-center justify-center p-1 transition-all mb-1.5 ${
                    flashOnBeat
                      ? 'bg-cyan-400 text-slate-950 border-white shadow-[0_0_12px_#06b6d4]'
                      : 'bg-gradient-to-b from-neutral-800 to-neutral-950 hover:from-neutral-700 hover:to-neutral-900 active:from-cyan-500 active:to-cyan-600 border-cyan-500/40 text-neutral-100 shadow'
                  }`}
                >
                  <span className="text-[9px] font-mono font-bold truncate w-full text-center">
                    {pad.name}
                  </span>
                  <span className="text-[8px] font-mono text-cyan-400 mt-0.5">PAD {idx + 1}</span>
                </button>

                <label
                  className="text-[8px] font-mono text-neutral-300 hover:text-cyan-400 cursor-pointer flex items-center space-x-1 mb-1.5 px-1.5 py-0.5 rounded bg-neutral-950 border border-neutral-800 hover:border-cyan-500/40"
                  title="Load or Drop custom audio WAV/MP3"
                >
                  <Upload className="w-2.5 h-2.5" />
                  <span>LOAD WAV</span>
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
                  label="PITCH"
                  value={pad.pitchSemi}
                  min={-24}
                  max={24}
                  step={1}
                  size="xs"
                  variant="white"
                  onChange={(v) => {
                    pad.pitchSemi = v;
                    onUpdate();
                  }}
                />

                <Knob
                  label="LEVEL"
                  value={pad.volume}
                  min={0}
                  max={1.5}
                  step={0.05}
                  size="xs"
                  variant="yellow"
                  onChange={(v) => {
                    pad.volume = v;
                    onUpdate();
                  }}
                />
              </div>
            );
          })}
        </div>

        <HardwareStepRibbon device={device} onUpdate={onUpdate} />
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
              <option value="random">S&amp;H Random</option>
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
              <option value="random">S&amp;H Random</option>
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

  // 9. SCREAM 4 TAPE DISTORTION (Vintage Bakelite Knobs, Glowing Tube Saturation Window & Dual-Needle VU Meter)
  if (device.type === 'scream4') {
    const driveRatio = Math.min(1, (p.drive ?? 4) / 16);
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex items-center space-x-2">
          <VacuumTube label="SAT TUBE A" isPowered={device.isPowered} glowLevel={driveRatio} />
          <VacuumTube label="SAT TUBE B" isPowered={device.isPowered} glowLevel={driveRatio * 0.9} />
          <DualNeedleVuMeter label="TUBE VU" driveLevel={driveRatio} grDb={driveRatio * 6.5} />
        </div>

        <div className="flex items-center space-x-3 bg-black/55 p-2.5 rounded border border-amber-700/40 shadow-inner">
          <div className="flex flex-col space-y-1">
            <span className="text-[8px] font-mono font-bold text-amber-400">DAMAGE MODE</span>
            <select
              value={p.damageType || 'Tape'}
              onChange={(e) => setP('damageType', e.target.value)}
              className="bg-neutral-950 border border-amber-600/50 text-[10px] px-2 py-0.5 rounded font-mono text-amber-200"
            >
              <option value="Tape">Analog Tape</option>
              <option value="Tube">Triode Tube</option>
              <option value="Overdrive">Scream Overdrive</option>
              <option value="Fuzz">Germanium Fuzz</option>
            </select>
          </div>
          <Knob label="DRIVE" value={p.drive ?? 4} min={1} max={20} step={0.2} size="md" variant="bakelite" onChange={(v) => setP('drive', v)} />
          <Knob label="WARMTH" value={p.warmth ?? 0.6} min={0} max={1} step={0.05} size="sm" variant="bakelite" onChange={(v) => setP('warmth', v)} />
          <Knob label="BIAS" value={p.bias ?? 0} min={-0.5} max={0.5} step={0.05} size="sm" variant="brass" onChange={(v) => setP('bias', v)} />
          <Knob label="TONE" value={p.tone ?? 4800} min={500} max={16000} step={100} unit="Hz" size="sm" variant="metal" onChange={(v) => setP('tone', v)} />
          <Knob label="MIX" value={p.mix ?? 0.8} min={0} max={1} step={0.05} size="sm" variant="yellow" onChange={(v) => setP('mix', v)} />
        </div>

        <DeviceVisualizer device={device} width={135} height={54} />
      </div>
    );
  }

  // 10. THE ECHO STEREO DELAY (Bakelite Knobs, Tempo-Synced Delay Matrix Toggles & VU Meter)
  if (device.type === 'echo') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex items-center space-x-2">
          <VacuumTube label="BBD TAPE" isPowered={device.isPowered} glowLevel={p.feedback ?? 0.55} />
          <DualNeedleVuMeter label="ECHO VU" driveLevel={p.mix ?? 0.5} grDb={(p.feedback ?? 0.4) * 4} />
        </div>

        <div className="flex items-center space-x-3 bg-black/50 p-2.5 rounded border border-neutral-800 shadow-inner">
          {/* Tempo-Synced Delay Subdivision Matrix Toggles */}
          <div className="flex flex-col space-y-1">
            <span className="text-[8px] font-mono font-bold text-cyan-400">TEMPO SYNC MATRIX</span>
            <div className="grid grid-cols-2 gap-1">
              {[
                { label: '1/16', sec: 0.125 },
                { label: '1/8D', sec: 0.375 },
                { label: '1/4', sec: 0.5 },
                { label: '1/2', sec: 1.0 },
              ].map((sync) => (
                <button
                  key={sync.label}
                  onClick={() => setP('time', sync.sec)}
                  className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold border ${
                    Math.abs((p.time ?? 0.375) - sync.sec) < 0.03
                      ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white'
                  }`}
                >
                  {sync.label}
                </button>
              ))}
            </div>
          </div>

          <Knob label="TIME" value={p.time ?? 0.35} min={0.05} max={1.8} step={0.02} unit="s" size="md" variant="bakelite" onChange={(v) => setP('time', v)} />
          <Knob label="FEEDBACK" value={p.feedback ?? 0.45} min={0} max={0.92} step={0.02} size="sm" variant="blue" onChange={(v) => setP('feedback', v)} />
          <Knob label="DAMP" value={p.damp ?? 5200} min={800} max={16000} step={100} unit="Hz" size="sm" variant="dark" onChange={(v) => setP('damp', v)} />

          <button
            onClick={() => setP('pingPong', !p.pingPong)}
            className={`px-2.5 py-1.5 rounded text-[10px] font-mono font-bold border transition-colors ${
              p.pingPong
                ? 'bg-blue-950 border-blue-500 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.4)]'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400'
            }`}
          >
            PING-PONG {p.pingPong ? 'ON' : 'OFF'}
          </button>

          <Knob label="WET / DRY" value={p.mix ?? 0.35} min={0} max={1} step={0.05} size="sm" variant="white" onChange={(v) => setP('mix', v)} />
        </div>

        <DeviceVisualizer device={device} width={135} height={54} />
      </div>
    );
  }

  // 11. RV7000 REVERB (Studio Grey Faceplate with Dual-Needle VU & Gate Matrix Toggle)
  if (device.type === 'rv7000') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <DualNeedleVuMeter label="REVERB TAIL" driveLevel={p.mix ?? 0.45} grDb={(p.decay ?? 2.8) * 0.6} />

        <div className="flex items-center space-x-3 bg-black/50 p-2.5 rounded border border-neutral-800 shadow-inner">
          <div className="flex flex-col space-y-1">
            <span className="text-[9px] font-mono font-bold text-amber-400 uppercase">ALGORITHM</span>
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
            <button
              onClick={() => setP('gateEnable', !p.gateEnable)}
              className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold border ${
                p.gateEnable ? 'bg-amber-500 text-black border-amber-300' : 'bg-neutral-900 text-neutral-400 border-neutral-700'
              }`}
            >
              GATE MATRIX: {p.gateEnable ? 'ON' : 'OFF'}
            </button>
          </div>

          <Knob label="DECAY" value={p.decay ?? 2.8} min={0.3} max={10} step={0.1} unit="s" size="md" variant="yellow" onChange={(v) => setP('decay', v)} />
          <Knob label="PRE-DELAY" value={p.preDelay ?? 0.02} min={0} max={0.2} step={0.01} unit="s" size="sm" variant="white" onChange={(v) => setP('preDelay', v)} />
          <Knob label="DAMPING" value={p.damping ?? 6500} min={1000} max={16000} step={200} unit="Hz" size="sm" variant="bakelite" onChange={(v) => setP('damping', v)} />
          <Knob label="WET / DRY" value={p.mix ?? 0.35} min={0} max={1} step={0.05} size="sm" variant="blue" onChange={(v) => setP('mix', v)} />
        </div>

        <DeviceVisualizer device={device} width={135} height={54} />
      </div>
    );
  }

  // 12. MCLASS MASTERING SUITE (Studio Brushed Steel & Grey with Dual-Needle VU Gain Reduction & Glowing Tubes)
  if (device.type === 'mclass_master') {
    const mclass = device as MClassMasterSuite;
    const gr = mclass.getGainReduction();

    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex items-center space-x-2">
          <VacuumTube label="MASTER" isPowered={device.isPowered} glowLevel={Math.min(1, (p.warmthDrive ?? 1.5) / 4)} />
          <DualNeedleVuMeter label="MASTER GR" driveLevel={0.78} grDb={gr} />
        </div>

        {/* 4-Band Parametric EQ */}
        <div className="flex items-center space-x-2 bg-black/45 p-2 rounded border border-neutral-800 shadow-inner">
          <Knob label="LOW 90Hz" value={p.eqLowGain} min={-12} max={12} step={0.5} unit="dB" size="xs" variant="bakelite" onChange={(v) => setP('eqLowGain', v)} />
          <Knob label="LMID 350" value={p.eqLowMidGain} min={-12} max={12} step={0.5} unit="dB" size="xs" variant="blue" onChange={(v) => setP('eqLowMidGain', v)} />
          <Knob label="HMID 3.8k" value={p.eqHighMidGain} min={-12} max={12} step={0.5} unit="dB" size="xs" variant="blue" onChange={(v) => setP('eqHighMidGain', v)} />
          <Knob label="HIGH 10k" value={p.eqHighGain} min={-12} max={12} step={0.5} unit="dB" size="xs" variant="bakelite" onChange={(v) => setP('eqHighGain', v)} />
        </div>

        <DeviceVisualizer device={device} width={140} height={54} />

        {/* Bus Compressor & Maximizer */}
        <div className="flex items-center space-x-2 bg-black/45 p-2 rounded border border-neutral-800 shadow-inner">
          <Knob label="THRESH" value={p.compThreshold} min={-36} max={0} step={1} unit="dB" size="xs" variant="yellow" onChange={(v) => setP('compThreshold', v)} />
          <Knob label="RATIO" value={p.compRatio} min={1.5} max={12} step={0.5} size="xs" variant="white" onChange={(v) => setP('compRatio', v)} />
          <Knob label="WARMTH" value={p.warmthDrive} min={1} max={4} step={0.1} size="xs" variant="brass" onChange={(v) => setP('warmthDrive', v)} />
          <Knob label="CEILING" value={p.limiterCeiling} min={-6} max={0} step={0.1} unit="dB" size="xs" variant="metal" onChange={(v) => setP('limiterCeiling', v)} />
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

  // One-Click Taal / Raga Phrase Selector for Indian Classical & World Acoustic Suite
  const TaalRagaSelector: React.FC<{ mode: 'taal' | 'raga' }> = ({ mode }) => {
    const applyPhrase = (phraseId: string) => {
      const track = audioEngine.getOrCreateTrackForDevice(device.id);
      if (!track) return;
      const len = Math.max(16, audioEngine.patternLength);
      const newSteps = Array(len).fill(null);

      for (let bar = 0; bar < len; bar += 16) {
        if (phraseId === 'teental') {
          // 16-Beat Classical Teental: Dha Dhin Dhin Dha | Dha Dhin Dhin Dha | Dha Tin Tin Ta | Ta Dhin Dhin Dha
          const notes = [65, 67, 67, 65, 65, 67, 67, 65, 65, 62, 62, 60, 60, 67, 67, 65];
          const vels = [1.0, 0.88, 0.85, 0.92, 0.96, 0.86, 0.85, 0.9, 0.94, 0.82, 0.8, 0.86, 0.9, 0.88, 0.92, 0.98];
          notes.forEach((n, i) => {
            if (bar + i < len) newSteps[bar + i] = { note: n, velocity: vels[i], length: 1 };
          });
        } else if (phraseId === 'keherwa') {
          // 8-Beat Energetic Keherwa / Dhol Chaal: Dha Ge Na Tin | Na Ka Dhin Na
          const notes = [65, 48, 60, 62, 60, 48, 67, 60, 65, 48, 64, 62, 65, 48, 67, 65];
          notes.forEach((n, i) => {
            if (bar + i < len) newSteps[bar + i] = { note: n, velocity: i % 4 === 0 ? 1.0 : 0.85, length: 1 };
          });
        } else if (phraseId === 'rupak') {
          // 7-Beat Classical Rupak Taal cycle mapped across 16th grid
          const hits = [
            { s: 0, n: 62, v: 0.96 },
            { s: 2, n: 62, v: 0.86 },
            { s: 4, n: 60, v: 0.9 },
            { s: 6, n: 67, v: 0.94 },
            { s: 8, n: 60, v: 0.86 },
            { s: 10, n: 67, v: 0.94 },
            { s: 12, n: 65, v: 0.98 },
            { s: 14, n: 48, v: 0.88 },
          ];
          hits.forEach((h) => {
            if (bar + h.s < len) newSteps[bar + h.s] = { note: h.n, velocity: h.v, length: 2 };
          });
        } else if (phraseId === 'bhairav') {
          // Raga Bhairav (Sa, komal Re, Ga, Ma, Pa, komal Dha, Ni, Sa)
          const ragaNotes = [
            { s: 0, n: 60, l: 3, v: 0.95 },
            { s: 3, n: 61, l: 1, v: 0.84 },
            { s: 4, n: 64, l: 2, v: 0.92 },
            { s: 6, n: 65, l: 2, v: 0.88 },
            { s: 8, n: 67, l: 3, v: 0.96 },
            { s: 11, n: 68, l: 1, v: 0.85 },
            { s: 12, n: 71, l: 2, v: 0.9 },
            { s: 14, n: 72, l: 2, v: 0.98 },
          ];
          ragaNotes.forEach((r) => {
            if (bar + r.s < len) newSteps[bar + r.s] = { note: r.n, velocity: r.v, length: r.l };
          });
        } else if (phraseId === 'yaman') {
          // Raga Yaman Evening Gat (Ni Re Ga Ma# Dha Ni Sa)
          const ragaNotes = [
            { s: 0, n: 59, l: 2, v: 0.9 },
            { s: 2, n: 62, l: 2, v: 0.92 },
            { s: 4, n: 64, l: 3, v: 0.96 },
            { s: 7, n: 66, l: 1, v: 0.86 },
            { s: 8, n: 67, l: 2, v: 0.94 },
            { s: 10, n: 69, l: 2, v: 0.9 },
            { s: 12, n: 71, l: 2, v: 0.92 },
            { s: 14, n: 72, l: 2, v: 0.98 },
          ];
          ragaNotes.forEach((r) => {
            if (bar + r.s < len) newSteps[bar + r.s] = { note: r.n, velocity: r.v, length: r.l };
          });
        } else if (phraseId === 'bhimpalasi') {
          // Raga Bhimpalasi Afternoon Meend Phrase
          const ragaNotes = [
            { s: 0, n: 60, l: 2, v: 0.92 },
            { s: 2, n: 63, l: 3, v: 0.95 },
            { s: 5, n: 65, l: 3, v: 0.9 },
            { s: 8, n: 67, l: 4, v: 0.96 },
            { s: 12, n: 70, l: 2, v: 0.88 },
            { s: 14, n: 67, l: 2, v: 0.92 },
          ];
          ragaNotes.forEach((r) => {
            if (bar + r.s < len) newSteps[bar + r.s] = { note: r.n, velocity: r.v, length: r.l };
          });
        }
      }

      track.steps = newSteps;
      if (!track.patterns) track.patterns = {};
      track.patterns[audioEngine.activePatternIndex] = newSteps.map((s) => (s ? { ...s } : null));
      onUpdate();
    };

    const options =
      mode === 'taal'
        ? [
            { id: 'teental', label: 'TEENTAL (16-MATRA)' },
            { id: 'keherwa', label: 'KEHERWA (8-BEAT)' },
            { id: 'rupak', label: 'RUPAK (7-MATRA)' },
          ]
        : [
            { id: 'bhairav', label: 'RAGA BHAIRAV' },
            { id: 'yaman', label: 'RAGA YAMAN' },
            { id: 'bhimpalasi', label: 'RAGA BHIMPALASI' },
          ];

    return (
      <div className="flex flex-col space-y-1 bg-black/55 px-2.5 py-1.5 rounded border border-amber-500/40 shadow-inner">
        <span className="text-[7.5px] font-mono font-black tracking-widest text-amber-300 uppercase">
          1-CLICK {mode === 'taal' ? 'TAAL RHYTHM' : 'RAGA PHRASE'} SELECTOR
        </span>
        <div className="flex items-center space-x-1">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => applyPhrase(opt.id)}
              className="px-2 py-1 rounded text-[8px] font-mono font-black bg-gradient-to-b from-amber-500/25 to-amber-900/40 hover:from-amber-400 hover:to-amber-500 text-amber-200 hover:text-slate-950 border border-amber-500/50 transition-all shadow"
              title={`Load ${opt.label} directly into Sequencer Track`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // 15. 3X OSC POWER SYNTH (Anodized Aluminum with Dual/Triple Osc Selectors, SVG Filter Curve & Vertical ADSR)
  if (device.type === 'three_osc') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex items-center space-x-2.5 bg-black/45 p-2 rounded border border-neutral-800 shadow-inner">
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
            <Knob label="COARSE" value={p.osc1Coarse} min={-24} max={24} step={1} size="xs" variant="metal" onChange={(v) => setP('osc1Coarse', v)} />
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
            <Knob label="FINE" value={p.osc2Fine} min={-50} max={50} step={1} size="xs" variant="metal" onChange={(v) => setP('osc2Fine', v)} />
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
            <Knob label="SUB VOL" value={p.osc3Vol} min={0} max={1} step={0.05} size="xs" variant="yellow" onChange={(v) => setP('osc3Vol', v)} />
          </div>
        </div>

        {/* Interactive SVG Filter Curve + Cutoff/Res */}
        <div className="flex items-center space-x-2.5 bg-black/45 p-2 rounded border border-neutral-800 shadow-inner">
          <SvgFilterCurve
            cutoffHz={p.cutoff ?? 3200}
            resonance={p.resonance ?? 2.5}
            filterMode={p.filterType || 'LP24'}
            accentColor="#10b981"
            onChangeCutoff={(hz) => setP('cutoff', hz)}
            onChangeMode={(m) => setP('filterType', m)}
          />
          <Knob label="CUTOFF" value={p.cutoff} min={100} max={12000} step={50} size="sm" variant="metal" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RES" value={p.resonance} min={0.1} max={12} step={0.2} size="sm" variant="metal" onChange={(v) => setP('resonance', v)} />
        </div>

        <VerticalAdsrBank
          attack={p.attack ?? 0.01}
          decay={p.decay ?? 0.3}
          sustain={p.sustain ?? 0.65}
          release={p.release ?? 0.25}
          accentColor="#10b981"
          onChange={(k, v) => setP(k, v)}
        />

        <DeviceVisualizer device={device} width={140} height={54} />
      </div>
    );
  }

  // 16. SYTRUS FM SYNTHESIZER (Interactive SVG Filter Curve + ADSR Sliders + Unison Spread LEDs)
  if (device.type === 'sytrus') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex items-center space-x-3 bg-black/45 p-2 rounded border border-neutral-800 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase">CARRIER OP 1</span>
            <span className="text-[8px] font-mono text-neutral-400">SINE 1x FUNDAMENTAL</span>
            <Knob label="RATIO" value={p.carrierRatio} min={0.5} max={8} step={0.5} size="xs" variant="metal" onChange={(v) => setP('carrierRatio', v)} />
          </div>

          <div className="w-px h-14 bg-neutral-800" />

          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase">MODULATOR OP 2</span>
            <div className="flex space-x-2 mt-0.5">
              <Knob label="MOD RATIO" value={p.modRatio} min={1} max={12} step={1} size="xs" variant="metal" onChange={(v) => setP('modRatio', v)} />
              <Knob label="FM DEPTH" value={p.fmDepth} min={0} max={1000} step={10} size="xs" variant="yellow" onChange={(v) => setP('fmDepth', v)} />
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 bg-black/45 p-2 rounded border border-neutral-800 shadow-inner">
          <SvgFilterCurve
            cutoffHz={p.cutoff ?? 4200}
            resonance={p.resonance ?? 3.0}
            filterMode={p.filterType || 'LP24'}
            accentColor="#f59e0b"
            onChangeCutoff={(hz) => setP('cutoff', hz)}
            onChangeMode={(m) => setP('filterType', m)}
          />
          <Knob label="CUTOFF" value={p.cutoff} min={200} max={14000} step={100} size="sm" variant="metal" onChange={(v) => setP('cutoff', v)} />
        </div>

        <VerticalAdsrBank
          attack={p.attack ?? 0.01}
          decay={p.decay ?? 0.35}
          sustain={p.sustain ?? 0.55}
          release={p.release ?? 0.3}
          accentColor="#f59e0b"
          onChange={(k, v) => setP(k, v)}
        />

        <DeviceVisualizer device={device} width={140} height={54} />
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

          <div className="flex items-center space-x-2">
            <Knob label="BRIGHT" value={p.macro1} min={0} max={1} step={0.02} size="xs" variant="metal" onChange={(v) => setP('macro1', v)} />
            <Knob label="SPACE" value={p.macro2} min={0} max={1} step={0.02} size="xs" variant="metal" onChange={(v) => setP('macro2', v)} />
            <Knob label="WIDTH" value={p.macro3} min={0} max={1} step={0.02} size="xs" variant="metal" onChange={(v) => setP('macro3', v)} />
            <Knob label="PUNCH" value={p.macro4} min={0} max={1} step={0.02} size="xs" variant="yellow" onChange={(v) => setP('macro4', v)} />
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
            <span className="text-[8px] font-mono text-neutral-400">CURVE LFO &amp; ENVELOPE MODULATOR</span>
          </div>

          <div className="flex items-center space-x-2">
            <Knob label="DEPTH" value={0.75} min={0} max={1} step={0.05} size="xs" variant="yellow" onChange={() => {}} />
            <Knob label="SPEED" value={1.0} min={0.1} max={4} step={0.1} size="xs" variant="metal" onChange={() => {}} />
          </div>
        </div>

        <DeviceVisualizer device={device} width={160} height={58} />
      </div>
    );
  }

  // 19. BANSURI BAMBOO FLUTE (Carved Rosewood & Brushed Brass with Meend Microtonal Glide, Breath Pressure & Raga Selector)
  if (device.type === 'bansuri') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 relative overflow-hidden">
        <div className="flex items-center space-x-3 bg-black/55 p-2.5 rounded border border-amber-500/40 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-black text-amber-300 uppercase">BANSURI CONCERT FLUTE</span>
            <span className="text-[8px] font-mono text-amber-400/80">MEEND GLIDE &bull; BREATH PRESSURE</span>
          </div>
          <Knob
            label="BREATH"
            value={p.breathPressure ?? (device as any).breathPressure ?? 0.85}
            min={0.1}
            max={1}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP('breathPressure', v)}
          />
          <Knob
            label="MEEND GLIDE"
            value={p.meendBending ?? (device as any).meendBending ?? 0.08}
            min={-0.25}
            max={0.25}
            step={0.01}
            size="sm"
            variant="brass"
            onChange={(v) => setP('meendBending', v)}
          />
          <Knob
            label="VIBRATO"
            value={p.vibratoDepth ?? (device as any).vibratoDepth ?? 0.15}
            min={0}
            max={0.5}
            step={0.02}
            size="sm"
            variant="bakelite"
            onChange={(v) => setP('vibratoDepth', v)}
          />
          <Knob
            label="AIR TONE"
            value={p.cutoff ?? 4200}
            min={800}
            max={12000}
            step={100}
            unit="Hz"
            size="xs"
            variant="brass"
            onChange={(v) => setP('cutoff', v)}
          />
        </div>

        <TaalRagaSelector mode="raga" />

        <DeviceVisualizer device={device} width={140} height={54} />

        <button
          onClick={() => {
            device.noteOn?.(64, 0.92);
            setTimeout(() => device.noteOff?.(64), 380);
          }}
          className="px-3 py-2 rounded bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>BLOW BANSURI</span>
        </button>
      </div>
    );
  }

  // 20. CLASSICAL HARMONIUM (Carved Teak & Brass Reeds with Bellows Pressure & Raga Selector)
  if (device.type === 'harmonium') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 relative overflow-hidden">
        <div className="flex items-center space-x-3 bg-black/55 p-2.5 rounded border border-amber-500/40 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-black text-amber-300 uppercase">CLASSICAL HARMONIUM</span>
            <span className="text-[8px] font-mono text-amber-400/80">BELLOWS RESERVOIR &bull; TRIPLE REED</span>
          </div>
          <Knob
            label="BELLOWS"
            value={p.airReservoir ?? (device as any).airReservoir ?? 0.85}
            min={0.2}
            max={1}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP('airReservoir', v)}
          />
          <Knob
            label="DRONE CPL"
            value={p.droneCoupling ?? (device as any).droneCoupling ?? 0.45}
            min={0}
            max={1}
            step={0.05}
            size="sm"
            variant="bakelite"
            onChange={(v) => setP('droneCoupling', v)}
          />
          <Knob
            label="SYMPATHETIC"
            value={p.sympatheticRes ?? 0.6}
            min={0}
            max={1}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP('sympatheticRes', v)}
          />
        </div>

        <TaalRagaSelector mode="raga" />

        <DeviceVisualizer device={device} width={140} height={54} />

        <button
          onClick={() => {
            device.noteOn?.(60, 0.9);
            device.noteOn?.(67, 0.85);
            setTimeout(() => {
              device.noteOff?.(60);
              device.noteOff?.(67);
            }, 420);
          }}
          className="px-3 py-2 rounded bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>PUMP REED CHORD</span>
        </button>
      </div>
    );
  }

  // 21. TABLA PERCUSSION (Dayan/Bayan Pitch & Skin Tension, Syahi Harmonics, Multi-Bol Pads & 1-Click Taal Selector)
  if (device.type === 'tabla') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 relative overflow-hidden">
        <div className="flex items-center space-x-2.5 bg-black/55 p-2 rounded border border-amber-500/45 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-black text-amber-300 uppercase">TABLA (DAYAN &amp; BAYAN)</span>
            <span className="text-[8px] font-mono text-amber-400/80">SKIN TENSION &bull; SYAHI &bull; MEEND</span>
          </div>
          <Knob
            label="DAYAN PITCH"
            value={p.skinTension ?? (device as any).skinTension ?? 0.85}
            min={0.3}
            max={1.5}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP('skinTension', v)}
          />
          <Knob
            label="BAYAN SUB"
            value={p.bayanResonance ?? (device as any).bayanResonance ?? 0.8}
            min={0.2}
            max={1.3}
            step={0.05}
            size="sm"
            variant="bakelite"
            onChange={(v) => setP('bayanResonance', v)}
          />
          <Knob
            label="SYAHI"
            value={p.syahiHarmonics ?? (device as any).syahiHarmonics ?? 0.78}
            min={0.1}
            max={1.0}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP('syahiHarmonics', v)}
          />
          <Knob
            label="BAYAN MEEND"
            value={p.bayanMeend ?? (device as any).bayanMeend ?? 0.45}
            min={0}
            max={1.0}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP('bayanMeend', v)}
          />
        </div>

        {/* Authentic Multi-Bol Strike Test Pads */}
        <div className="flex items-center space-x-1 bg-black/55 p-1.5 rounded border border-amber-500/40">
          {[
            { label: 'NA', midi: 60 },
            { label: 'TIN', midi: 62 },
            { label: 'TUN', midi: 64 },
            { label: 'GE', midi: 48 },
            { label: 'DHA', midi: 65 },
            { label: 'DHIN', midi: 67 },
          ].map((bol) => (
            <button
              key={bol.label}
              onClick={() => {
                device.noteOn?.(bol.midi, 0.95);
                setTimeout(() => device.noteOff?.(bol.midi), 250);
              }}
              className="px-2 py-1.5 rounded bg-amber-500/20 hover:bg-amber-400 text-amber-200 hover:text-slate-950 border border-amber-500/50 font-mono font-black text-[8.5px] transition-all"
              title={`Strike Tabla Bol ${bol.label} (MIDI ${bol.midi})`}
            >
              {bol.label}
            </button>
          ))}
        </div>

        <TaalRagaSelector mode="taal" />

        <DeviceVisualizer device={device} width={130} height={52} />
      </div>
    );
  }

  // 22. TANPURA & DRONE GENERATOR (Jivari Bridge Buzz, Sympathetic String Resonance & Raga Selector)
  if (device.type === 'tanpura') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 relative overflow-hidden">
        <div className="flex items-center space-x-3 bg-black/55 p-2.5 rounded border border-amber-500/45 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-black text-amber-300 uppercase">TANPURA JIVARI DRONE</span>
            <span className="text-[8px] font-mono text-amber-400/80">JIVARI BRIDGE &bull; SYMPATHETIC STRINGS</span>
          </div>
          <Knob
            label="ROOT SA"
            value={p.droneRoot ?? (device as any).droneRoot ?? 110.0}
            min={55}
            max={220}
            step={1}
            unit=" Hz"
            size="sm"
            variant="brass"
            onChange={(v) => setP('droneRoot', v)}
          />
          <Knob
            label="JIVARI BUZZ"
            value={p.jivariBuzz ?? 0.72}
            min={0}
            max={1}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP('jivariBuzz', v)}
          />
          <Knob
            label="SYMP STRINGS"
            value={p.sympatheticRes ?? 0.8}
            min={0}
            max={1}
            step={0.05}
            size="sm"
            variant="bakelite"
            onChange={(v) => setP('sympatheticRes', v)}
          />
        </div>

        <TaalRagaSelector mode="raga" />

        <DeviceVisualizer device={device} width={135} height={52} />

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => {
              (device as any).toggleDrone?.();
              onUpdate();
            }}
            className={`px-2.5 py-2 rounded font-mono font-black text-[9.5px] flex items-center space-x-1 border transition-all ${
              (device as any).isRunning || p.droneActive
                ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.6)]'
                : 'bg-amber-950/70 text-amber-200 border-amber-500/50 hover:bg-amber-900'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>{(device as any).isRunning || p.droneActive ? 'STOP DRONE' : 'START DRONE'}</span>
          </button>
          <button
            onClick={() => {
              device.noteOn?.(48, 0.9);
              setTimeout(() => device.noteOff?.(48), 500);
            }}
            className="px-2.5 py-2 rounded bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 font-mono font-black text-[9.5px] flex items-center space-x-1"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>PLUCK</span>
          </button>
        </div>
      </div>
    );
  }

  // 23. DHOL FOLK DRUM (Dayan/Tilli & Bayan/Dugga Skin Tension + 1-Click Taal Selector)
  if (device.type === 'dhol') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 relative overflow-hidden">
        <div className="flex items-center space-x-3 bg-black/55 p-2.5 rounded border border-amber-500/45 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-black text-amber-300 uppercase">PUNJABI DHOL DRUM</span>
            <span className="text-[8px] font-mono text-amber-400/80">DUGGA BASS &bull; TILLI SKIN TENSION</span>
          </div>
          <Knob
            label="SKIN TENSION"
            value={p.punchTension ?? (device as any).punchTension ?? 0.85}
            min={0.4}
            max={1.5}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP('punchTension', v)}
          />
          <Knob
            label="DUGGA RES"
            value={p.shellResonance ?? (device as any).shellResonance ?? 0.78}
            min={0.2}
            max={1.3}
            step={0.05}
            size="sm"
            variant="bakelite"
            onChange={(v) => setP('shellResonance', v)}
          />
        </div>

        <div className="flex items-center space-x-1.5 bg-black/55 p-2 rounded border border-amber-500/40">
          <button
            onClick={() => {
              device.noteOn?.(48, 0.95);
              setTimeout(() => device.noteOff?.(48), 250);
            }}
            className="px-2 py-1.5 rounded bg-amber-500/20 hover:bg-amber-400 text-amber-200 hover:text-slate-950 border border-amber-500/50 font-mono font-black text-[9px]"
          >
            DUGGA BASS
          </button>
          <button
            onClick={() => {
              device.noteOn?.(64, 0.95);
              setTimeout(() => device.noteOff?.(64), 250);
            }}
            className="px-2 py-1.5 rounded bg-amber-500/20 hover:bg-amber-400 text-amber-200 hover:text-slate-950 border border-amber-500/50 font-mono font-black text-[9px]"
          >
            TILLI STICK
          </button>
          <button
            onClick={() => {
              device.noteOn?.(60, 0.98);
              setTimeout(() => device.noteOff?.(60), 250);
            }}
            className="px-2 py-1.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono font-black text-[9px]"
          >
            CHAAL HIT
          </button>
        </div>

        <TaalRagaSelector mode="taal" />

        <DeviceVisualizer device={device} width={130} height={52} />
      </div>
    );
  }

  // 24. TUMBI & SITAR / WORLD ACOUSTIC INSTRUMENT (Jivari Bridge Buzz, Sympathetic Taraf Strings, Meend Glide & Raga Selector)
  if (device.type === 'tumbi' || device.type === 'world_instrument') {
    const isTumbi = device.type === 'tumbi';
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 relative overflow-hidden">
        <div className="flex items-center space-x-3 bg-black/55 p-2.5 rounded border border-amber-500/45 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-black text-amber-300 uppercase">
              {isTumbi ? 'TUMBI FOLK RESONATOR' : `${device.name.toUpperCase()} (SITAR / WORLD)`}
            </span>
            <span className="text-[8px] font-mono text-amber-400/80">
              JIVARI BRIDGE &bull; TARAF SYMPATHETIC RESONANCE
            </span>
          </div>
          <Knob
            label="JIVARI BUZZ"
            value={p.stringTension ?? p.pluckBrightness ?? 0.85}
            min={0.2}
            max={1.4}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP(isTumbi ? 'stringTension' : 'pluckBrightness', v)}
          />
          <Knob
            label="TARAF RES"
            value={p.bodyResonance ?? 0.78}
            min={0.1}
            max={1.0}
            step={0.05}
            size="sm"
            variant="brass"
            onChange={(v) => setP('bodyResonance', v)}
          />
          <Knob
            label="MEEND GLIDE"
            value={p.meendGlide ?? 0.25}
            min={0}
            max={1}
            step={0.05}
            size="sm"
            variant="bakelite"
            onChange={(v) => setP('meendGlide', v)}
          />
        </div>

        <TaalRagaSelector mode="raga" />

        <DeviceVisualizer device={device} width={135} height={52} />

        <button
          onClick={() => {
            device.noteOn?.(67, 0.92);
            setTimeout(() => device.noteOff?.(67), 320);
          }}
          className="px-3 py-2 rounded bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>PLUCK MIZRAB</span>
        </button>
      </div>
    );
  }

  // 25. WYVERN SYNTHESIZER MODULE (Dual-Wavetable / FM / Sub-Harmonic Dragon Synth + Mod Containers & Macros)
  if (device.type === 'wyvern') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#07111e] via-[#0a1829] to-[#07111e] rounded border border-cyan-500/40 relative overflow-hidden">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-cyan-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-cyan-300 tracking-wider">WYVERN SYNTH</span>
            <span className="text-[8px] font-mono text-emerald-400">WAVETABLE &bull; FM &bull; COMB DSP</span>
            <select
              value={p.wavetableA || 'sawtooth'}
              onChange={(e) => setP('wavetableA', e.target.value)}
              className="mt-1 bg-slate-950 border border-cyan-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-cyan-200"
            >
              <option value="sawtooth">WT-A: Cyber Saw</option>
              <option value="square">WT-A: Pulse Matrix</option>
              <option value="triangle">WT-A: Sub Triangle</option>
            </select>
          </div>
          <Knob label="MORPH" value={p.morph ?? 0.45} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('morph', v)} />
          <Knob label="FM DEPTH" value={p.fmDepth ?? 140} min={0} max={600} step={10} unit="Hz" size="sm" variant="metal" onChange={(v) => setP('fmDepth', v)} />
          <Knob label="DRAGON DRV" value={p.dragonDrive ?? 0.35} min={0} max={1} step={0.05} size="sm" variant="yellow" onChange={(v) => setP('dragonDrive', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 3200} min={60} max={16000} step={20} unit="Hz" size="sm" variant="white" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 5.2} min={0.5} max={16} step={0.2} size="sm" variant="dark" onChange={(v) => setP('resonance', v)} />
        </div>

        {/* Modulation Container Slots & Bounded Macro Knobs */}
        <div className="flex items-center space-x-2 bg-black/50 p-2 rounded border border-emerald-500/30">
          <div className="flex flex-col space-y-1 text-[8px] font-mono pr-2 border-r border-slate-800">
            <span className="text-emerald-400 font-bold">MOD CONTAINERS</span>
            <div className="px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/40 text-cyan-200">
              S1: {p.modSlot1Source} &rarr; {p.modSlot1Target}
            </div>
            <div className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-200">
              S2: {p.modSlot2Source} &rarr; {p.modSlot2Target}
            </div>
          </div>
          <Knob label="M1: ROAR" value={p.macroRoar ?? 0.45} min={0} max={1} step={0.02} size="xs" variant="yellow" onChange={(v) => setP('macroRoar', v)} />
          <Knob label="M2: SCALE" value={p.macroScale ?? 0.6} min={0} max={1} step={0.02} size="xs" variant="metal" onChange={(v) => setP('macroScale', v)} />
        </div>

        <DeviceVisualizer device={device} width={140} height={54} />

        <button
          onClick={() => {
            (device as any).noteOn?.(60, 0.92);
            setTimeout(() => (device as any).noteOff?.(60), 280);
          }}
          className="px-3 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1 shadow-[0_0_12px_rgba(6,182,212,0.5)]"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION WYVERN</span>
        </button>
      </div>
    );
  }

  // 26. EMBER SYNTHESIZER MODULE (Analog Warmth / Formant & Thermal Saturation Synth + Mod Containers & Macros)
  if (device.type === 'ember') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#1a0c08] via-[#26120b] to-[#1a0c08] rounded border border-amber-500/40 relative overflow-hidden">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-amber-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-amber-300 tracking-wider">EMBER SYNTH</span>
            <span className="text-[8px] font-mono text-orange-400">THERMAL FORMANT &bull; TUBE DSP</span>
            <select
              value={p.oscWave || 'sawtooth'}
              onChange={(e) => setP('oscWave', e.target.value)}
              className="mt-1 bg-slate-950 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-amber-200"
            >
              <option value="sawtooth">CORE: Warm Saw</option>
              <option value="triangle">CORE: Ember Tri</option>
              <option value="square">CORE: HollowReed</option>
            </select>
          </div>
          <Knob label="DRIFT" value={p.thermalDrift ?? 12} min={0} max={40} step={1} unit="¢" size="sm" variant="yellow" onChange={(v) => setP('thermalDrift', v)} />
          <Knob label="HARMONICS" value={p.emberHarmonics ?? 0.55} min={0} max={1} step={0.05} size="sm" variant="metal" onChange={(v) => setP('emberHarmonics', v)} />
          <Knob label="FORMANT" value={p.formantFreq ?? 1150} min={300} max={4500} step={25} unit="Hz" size="sm" variant="yellow" onChange={(v) => setP('formantFreq', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 2600} min={60} max={16000} step={20} unit="Hz" size="sm" variant="white" onChange={(v) => setP('cutoff', v)} />
          <Knob label="WARMTH" value={p.warmthDrive ?? 0.4} min={0} max={1} step={0.05} size="sm" variant="dark" onChange={(v) => setP('warmthDrive', v)} />
        </div>

        {/* Modulation Container Slots & Bounded Macro Knobs */}
        <div className="flex items-center space-x-2 bg-black/50 p-2 rounded border border-amber-500/30">
          <div className="flex flex-col space-y-1 text-[8px] font-mono pr-2 border-r border-slate-800">
            <span className="text-amber-400 font-bold">MOD CONTAINERS</span>
            <div className="px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-500/40 text-amber-200">
              S1: {p.modSlot1Source} &rarr; {p.modSlot1Target}
            </div>
            <div className="px-1.5 py-0.5 rounded bg-orange-950/70 border border-orange-500/40 text-orange-200">
              S2: {p.modSlot2Source} &rarr; {p.modSlot2Target}
            </div>
          </div>
          <Knob label="M1: GLOW" value={p.macroGlow ?? 0.55} min={0} max={1} step={0.02} size="xs" variant="yellow" onChange={(v) => setP('macroGlow', v)} />
          <Knob label="M2: HEAT" value={p.macroHeat ?? 0.4} min={0} max={1} step={0.02} size="xs" variant="metal" onChange={(v) => setP('macroHeat', v)} />
        </div>

        <DeviceVisualizer device={device} width={140} height={54} />

        <button
          onClick={() => {
            (device as any).noteOn?.(60, 0.92);
            setTimeout(() => (device as any).noteOff?.(60), 280);
          }}
          className="px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1 shadow-[0_0_12px_rgba(245,158,11,0.5)]"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION EMBER</span>
        </button>
      </div>
    );
  }

  return <ReasonRackFaceplate device={device} onUpdate={onUpdate} />;
};
