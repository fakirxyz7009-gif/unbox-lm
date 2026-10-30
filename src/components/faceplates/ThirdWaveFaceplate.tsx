import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ThirdWaveDevice } from '../../audio/devices/ThirdWaveDevice.ts';
import { scheduleAudition } from '../../audio/audition.ts';
import { Knob } from '../Knob.tsx';
import { Wavetable3DWaterfall } from '../visualizers/Wavetable3DWaterfall.tsx';
import { StereoGoniometer } from '../visualizers/StereoGoniometer.tsx';
import {
  Play,
  Waves,
  Sliders,
  Activity,
  Sparkles,
  Box,
} from 'lucide-react';

interface ThirdWaveFaceplateProps {
  device: ThirdWaveDevice;
  onUpdate: () => void;
}

export const ThirdWaveFaceplate: React.FC<ThirdWaveFaceplateProps> = ({ device, onUpdate }) => {
  const p = device.params;
  const setP = (key: string, val: any) => {
    device.setParam(key, val);
    onUpdate();
  };

  const [activeTab, setActiveTab] = useState<'wave' | 'waveEnv' | 'filters' | 'envs' | 'fx'>('wave');
  const [selectedOsc, setSelectedOsc] = useState<1 | 2 | 3>(1);
  const [selectedLfo, setSelectedLfo] = useState<1 | 2 | 3 | 4>(1);
  const [displayMode, setDisplayMode] = useState<'2d' | '3d' | 'stereo'>('3d');
  const [isAuditioning, setIsAuditioning] = useState(false);

  // Waveform visualization calculation
  const curOscType = selectedOsc === 1 ? p.osc1_type : selectedOsc === 2 ? p.osc2_type : p.osc3_type;
  const curOscTable = selectedOsc === 1 ? p.osc1_table : selectedOsc === 2 ? p.osc2_table : p.osc3_table;
  const curOscWave = selectedOsc === 1 ? p.osc1_wave : selectedOsc === 2 ? p.osc2_wave : p.osc3_wave;
  const waveSurfer = p.waveSurfer ?? 0;
  const effectiveWave = Math.max(0, Math.min(63, (curOscWave ?? 0) + waveSurfer));

  // PPG Wavetable Group Names
  const PPG_TABLES = [
    'P00: Resonant Sweep (Classic PPG 2.2)',
    'P01: Digital Pulse Width',
    'P02: Harmonic Chorus',
    'P03: Vocal Formants (Ah-Ee-Oh-Oo)',
    'P04: Heavy Saw Sweep',
    'P05: Organ & Drawbars',
    'P06: Acoustic Bell Harmonics',
    'P07: Metallic Inharmonics',
    'P08: Digital Wave Clang',
    'P09: Vintage Synclavier Sweep',
    'P10: 8-Bit Step Quantized',
    'P12: Robot Vocoder Formant',
    'P20: High Resonance Whistle',
    'P30: Upper Wavetable (PPG)',
    'P32: Prophet VS Spectrum 1',
    'P33: Prophet VS Digital Bells',
    'P34: Prophet VS Harsh Pulse',
    'P35: Prophet VS Ethereal Pad',
  ];

  const USER_TABLES = [
    'U00: Modern Spectrum 1',
    'U05: High-Res Multi-Saw',
    'U10: Crystal Sine Morph',
    'U15: Complex Glassy Pad',
    'U20: Vintage String Machine',
    'U30: Acid Resonance Ramp',
    'U40: Granular Harmonic Sweep',
    'U50: Cinematic Brass Warp',
    'U55: Dark Sub Harmonic',
  ];

  const ANALOG_WAVES = [
    'A00: Sawtooth (Analog Core)',
    'A01: Pulse / Square (Variable PWM)',
    'A02: Triangle',
    'A03: Pure Sine Wave',
    'A04: 7-Voice Supersaw Stack',
    'A05: White Noise Generator',
    'A06: Pink / Vintage Drift Noise',
  ];

  const SAMPLE_SLOTS = [
    'S00: Vintage Transient Kalimba',
    'S01: Acoustic Piano Hammer Strike',
    'S02: Metallic Gamelan Strike',
    'S03: Breath / Choral Air',
    'S04: Electric Rhodes Key Click',
    'S05: Celesta Bell Strike',
    'S06: Pizzicato String Transient',
  ];

  const handleAudition = () => {
    setIsAuditioning(true);
    scheduleAudition(device, [{ note: 57, velocity: 0.9 }], 600);
    // Presentation state only. The audible release is already scheduled on AudioContext time.
    window.setTimeout(() => setIsAuditioning(false), 600);
  };

  return (
    <div className="w-full bg-gradient-to-b from-[#061528] via-[#091b34] to-[#040e1d] text-cyan-100 p-3 rounded-lg border-2 border-cyan-600/70 shadow-[0_12px_40px_rgba(0,0,0,0.85)] font-sans select-none relative overflow-hidden transition-all duration-300">
      {/* Background Subtle Brushed Electric Blue Texture & Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/15 via-transparent to-black/60 pointer-events-none" />

      {/* ================= TOP HEADER BAR ================= */}
      <div className="relative z-10 flex items-center justify-between border-b border-cyan-800/60 pb-2 mb-2.5">
        <div className="flex items-center space-x-3">
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="text-base font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-blue-400 font-mono drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]">
                3rd WAVE
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-mono font-bold tracking-wider shadow-[0_0_8px_rgba(6,182,212,0.3)]">
                24-VOICE ADVANCED WAVETABLE SYNTH
              </span>
            </div>
            <span className="text-[11px] font-mono text-cyan-400/80 tracking-tight">
              GROOVE SYNTHESIS VINTAGE PPG · DUAL ANALOG/SVF ENGINE · DIRECT HARDWARE ACCELERATED
            </span>
          </div>
        </div>

        {/* Global Performance & 24 Voice Indicator Bank */}
        <div className="flex items-center space-x-3 bg-black/55 px-3 py-1 rounded-md border border-cyan-900/70 shadow-inner">
          {/* 24-Voice Hardware LED Array */}
          <div className="flex flex-col space-y-0.5">
            <span className="text-[11px] font-mono text-cyan-400 font-bold">24-VOICE HARDWARE MATRIX</span>
            <div className="grid grid-cols-12 gap-0.5">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-150 ${
                    isAuditioning && i < (p.unisonVoices > 1 ? p.unisonVoices : 3)
                      ? 'bg-cyan-300 shadow-[0_0_6px_#38bdf8]'
                      : i % 4 === 0
                      ? 'bg-cyan-950 border border-cyan-800/60'
                      : 'bg-black/60 border border-cyan-950'
                  }`}
                  title={`Voice ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="h-5 w-px bg-cyan-800/40" />

          {/* Unison Mode */}
          <div className="flex items-center space-x-1.5 text-[11px] font-mono">
            <span className="text-cyan-400">POLY:</span>
            <span className="text-emerald-400 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/40">
              {p.unisonVoices > 1 ? `UNISON ×${p.unisonVoices}` : '24 VOICES'}
            </span>
          </div>

          <div className="h-5 w-px bg-cyan-800/40" />

          {/* Quick Audition Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAudition}
            className={`flex items-center space-x-1 px-3 py-1 bg-gradient-to-r ${
              isAuditioning
                ? 'from-emerald-400 to-cyan-300 text-black shadow-[0_0_14px_rgba(52,211,153,0.8)]'
                : 'from-cyan-600 to-sky-500 hover:from-cyan-500 hover:to-sky-400 text-black shadow-[0_0_8px_rgba(6,182,212,0.5)]'
            } font-mono font-bold text-[11px] rounded transition duration-200 cursor-pointer`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>AUDITION</span>
          </motion.button>
        </div>
      </div>

      {/* ================= HIGH CONTRAST HARDWARE BACKLIT LCD SCREEN ================= */}
      <div className="relative z-10 bg-[#030c16] border-2 border-cyan-700/80 rounded-md p-2.5 shadow-[inset_0_2px_15px_rgba(0,0,0,0.9)] mb-3 backdrop-blur-md">
        {/* LCD Header Navigation */}
        <div className="flex items-center justify-between border-b border-cyan-900/60 pb-1.5 mb-2">
          <div className="flex items-center space-x-2 text-[11px] font-mono">
            <span className="text-cyan-400/80">PAGE:</span>
            <span className="font-bold text-cyan-200">
              {activeTab === 'wave' && 'WAVETABLE & WAVE SURFER'}
              {activeTab === 'waveEnv' && '6-STAGE WAVE ENVELOPE'}
              {activeTab === 'filters' && 'DUAL FILTERS (SVF & 4-POLE)'}
              {activeTab === 'envs' && 'ENVELOPES & 4 LFOs'}
              {activeTab === 'fx' && 'DUAL FX PROCESSORS'}
            </span>
          </div>

          {/* Display Mode (2D / 3D Waterfall / Stereo Vectorscope) */}
          {activeTab === 'wave' && (
            <div className="flex items-center space-x-1 bg-black/60 px-1.5 py-0.5 rounded border border-cyan-900/60">
              <span className="text-[11px] font-mono text-cyan-400 mr-1">VIEW:</span>
              <button
                onClick={() => setDisplayMode('3d')}
                className={`px-1.5 py-0.5 text-[11px] font-mono rounded flex items-center space-x-1 ${
                  displayMode === '3d'
                    ? 'bg-cyan-500 text-black font-bold'
                    : 'text-cyan-400 hover:text-cyan-200'
                }`}
              >
                <Box className="w-2.5 h-2.5" />
                <span>3D MESH</span>
              </button>
              <button
                onClick={() => setDisplayMode('2d')}
                className={`px-1.5 py-0.5 text-[11px] font-mono rounded flex items-center space-x-1 ${
                  displayMode === '2d'
                    ? 'bg-cyan-500 text-black font-bold'
                    : 'text-cyan-400 hover:text-cyan-200'
                }`}
              >
                <Waves className="w-2.5 h-2.5" />
                <span>2D WAVE</span>
              </button>
              <button
                onClick={() => setDisplayMode('stereo')}
                className={`px-1.5 py-0.5 text-[11px] font-mono rounded flex items-center space-x-1 ${
                  displayMode === 'stereo'
                    ? 'bg-cyan-500 text-black font-bold'
                    : 'text-cyan-400 hover:text-cyan-200'
                }`}
              >
                <Activity className="w-2.5 h-2.5" />
                <span>VECTORSCOPE</span>
              </button>
            </div>
          )}

          {/* LCD Navigation Tabs */}
          <div className="flex space-x-1">
            {(['wave', 'waveEnv', 'filters', 'envs', 'fx'] as const).map((tabKey) => (
              <motion.button
                key={tabKey}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setActiveTab(tabKey)}
                className={`px-2 py-0.5 text-[11px] font-mono rounded transition-all duration-200 ${
                  activeTab === tabKey
                    ? 'bg-cyan-500 text-black font-bold shadow-[0_0_10px_rgba(6,182,212,0.7)]'
                    : 'bg-cyan-950/70 text-cyan-300 hover:bg-cyan-900/60'
                }`}
              >
                {tabKey === 'wave' && 'WAVETABLE'}
                {tabKey === 'waveEnv' && 'WAVE ENV'}
                {tabKey === 'filters' && 'FILTERS'}
                {tabKey === 'envs' && 'ENVELOPES'}
                {tabKey === 'fx' && 'FX 1 & 2'}
              </motion.button>
            ))}
          </div>
        </div>

        {/* LCD Body Content with Smooth Framer Motion Transition */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="grid grid-cols-12 gap-3 items-center min-h-[92px]"
          >
            {/* TAB 1: WAVETABLE & WAVE SURFER */}
            {activeTab === 'wave' && (
              <>
                <div className="col-span-8 h-24">
                  {displayMode === '3d' && (
                    <Wavetable3DWaterfall
                      waveType={curOscType}
                      tableIndex={curOscTable}
                      activeWave={effectiveWave}
                      waveFlow={p.waveFlow ?? 65}
                      isHighPower={true}
                      analyser={device.analyser}
                    />
                  )}
                  {displayMode === '2d' && (
                    <div className="h-full w-full bg-[#020810] border border-cyan-800/60 rounded relative overflow-hidden flex items-center justify-center p-2">
                      <svg className="w-full h-full" viewBox="0 0 280 64" preserveAspectRatio="none">
                        <line x1="0" y1="32" x2="280" y2="32" stroke="#0e3a5a" strokeDasharray="2,2" strokeWidth="0.8" />
                        <path
                          d={`M 0,32 Q 70,${32 - (effectiveWave / 63) * 28} 140,32 T 280,32`}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute bottom-1 right-2 text-[11px] font-mono text-cyan-400">
                        2D OSCILLOGRAM (POS: {effectiveWave}/63)
                      </div>
                    </div>
                  )}
                  {displayMode === 'stereo' && (
                    <StereoGoniometer
                      analyser={device.analyser}
                      panSpread={p.panSpread ?? 75}
                    />
                  )}
                </div>

                {/* Status overview */}
                <div className="col-span-4 flex flex-col justify-between h-24 bg-[#030b14] border border-cyan-900/60 rounded p-2 text-[11px] font-mono shadow-inner">
                  <div className="flex justify-between items-center">
                    <span className="text-cyan-400 font-bold">OSC 1:</span>
                    <span className="text-white font-bold bg-cyan-950/60 px-1 rounded">
                      {p.osc1_type.toUpperCase()} / WAVE: {p.osc1_wave}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-cyan-400 font-bold">OSC 2:</span>
                    <span className="text-white font-bold bg-cyan-950/60 px-1 rounded">
                      {p.osc2_type.toUpperCase()} / WAVE: {p.osc2_wave}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-cyan-400 font-bold">OSC 3:</span>
                    <span className="text-white font-bold bg-cyan-950/60 px-1 rounded">
                      {p.osc3_type.toUpperCase()} / WAVE: {p.osc3_wave}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-cyan-950 pt-1 text-cyan-300">
                    <span>SURFER GLOBAL:</span>
                    <span className="text-sky-300 font-bold">
                      {waveSurfer > 0 ? `+${waveSurfer}` : waveSurfer}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: 6-STAGE WAVE ENVELOPE */}
            {activeTab === 'waveEnv' && (
              <div className="col-span-12 flex flex-col space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300">
                  <span>6-STAGE DYNAMIC WAVETABLE TRAJECTORY</span>
                  <span className="text-emerald-400">
                    LOOP: STAGE {p.waveEnv_loopStart || 2} → STAGE {p.waveEnv_loopEnd || 4} | AMOUNT: {p.waveEnv_amt || 35}%
                  </span>
                </div>
                <div className="h-20 w-full bg-[#020810] border border-cyan-800/60 rounded relative flex items-center px-4">
                  <svg className="w-full h-full" viewBox="0 0 400 64" preserveAspectRatio="none">
                    <line x1="0" y1="32" x2="400" y2="32" stroke="#0e3a5a" strokeDasharray="2,2" strokeWidth="0.8" />
                    {(() => {
                      const p1 = 64 - ((p.waveEnv_p1 || 4) / 63) * 56 - 4;
                      const p2 = 64 - ((p.waveEnv_p2 || 24) / 63) * 56 - 4;
                      const p3 = 64 - ((p.waveEnv_p3 || 45) / 63) * 56 - 4;
                      const p4 = 64 - ((p.waveEnv_p4 || 32) / 63) * 56 - 4;
                      const p5 = 64 - ((p.waveEnv_p5 || 18) / 63) * 56 - 4;
                      const p6 = 64 - ((p.waveEnv_p6 || 8) / 63) * 56 - 4;
                      const pts = `M 10,${p1} L 75,${p2} L 150,${p3} L 225,${p4} L 310,${p5} L 390,${p6}`;
                      return (
                        <>
                          <path d={pts} fill="none" stroke="#22d3ee" strokeWidth="2.5" />
                          <circle cx="10" cy={p1} r="3.5" fill="#38bdf8" />
                          <circle cx="75" cy={p2} r="3.5" fill="#38bdf8" />
                          <circle cx="150" cy={p3} r="3.5" fill="#38bdf8" />
                          <circle cx="225" cy={p4} r="3.5" fill="#38bdf8" />
                          <circle cx="310" cy={p5} r="3.5" fill="#38bdf8" />
                          <circle cx="390" cy={p6} r="3.5" fill="#38bdf8" />
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>
            )}

            {/* TAB 3: DUAL FILTERS */}
            {activeTab === 'filters' && (
              <div className="col-span-12 flex flex-col space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300">
                  <span>SERIES FILTER RESPONSE: SVF (12dB) → 4-POLE LOWPASS (24dB) WITH BASS COMP</span>
                  <span className="text-amber-300">
                    F1: {p.f1_cutoff}Hz ({p.f1_mode}) | F2: {p.f2_cutoff}Hz (DRIVE: {p.f2_drive}%)
                  </span>
                </div>
                <div className="h-20 w-full bg-[#020810] border border-cyan-800/60 rounded relative flex items-center px-4">
                  <svg className="w-full h-full" viewBox="0 0 400 64" preserveAspectRatio="none">
                    <path
                      d={`M 10,25 Q ${(p.f1_cutoff / 20000) * 350},${10 - (p.f1_resonance * 1.5)} ${(p.f1_cutoff / 20000) * 380 + 20},60`}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2"
                    />
                    <path
                      d={`M 10,20 Q ${(p.f2_cutoff / 20000) * 350},${5 - (p.f2_resonance * 1.5)} ${(p.f2_cutoff / 20000) * 380 + 30},62`}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      strokeDasharray="4,2"
                    />
                  </svg>
                </div>
              </div>
            )}

            {/* TAB 4: ENVELOPES */}
            {activeTab === 'envs' && (
              <div className="col-span-12 flex justify-between items-center h-20 bg-[#020810] border border-cyan-800/60 rounded p-2 text-[11px] font-mono">
                <div className="flex flex-col space-y-1">
                  <span className="text-cyan-400 font-bold">FILTER ADSR ({p.fenv_mode || 'vintage_ppg'})</span>
                  <span className="text-cyan-200">
                    A: {p.fenv_attack}s | D: {p.fenv_decay}s | S: {Math.round((p.fenv_sustain || 0.45) * 100)}% | R: {p.fenv_release}s
                  </span>
                </div>
                <div className="h-full w-px bg-cyan-900/40" />
                <div className="flex flex-col space-y-1">
                  <span className="text-sky-400 font-bold">AMP ADSR (VCA)</span>
                  <span className="text-cyan-200">
                    A: {p.aenv_attack}s | D: {p.aenv_decay}s | S: {Math.round((p.aenv_sustain || 0.75) * 100)}% | R: {p.aenv_release}s
                  </span>
                </div>
                <div className="h-full w-px bg-cyan-900/40" />
                <div className="flex flex-col space-y-1">
                  <span className="text-emerald-400 font-bold">LFO {selectedLfo}</span>
                  <span className="text-cyan-200">
                    RATE: {p[`lfo${selectedLfo}_rate`] ?? 1.8}Hz | DEST: {p[`lfo${selectedLfo}_dest`] ?? 'waveSurfer'}
                  </span>
                </div>
              </div>
            )}

            {/* TAB 5: DUAL FX */}
            {activeTab === 'fx' && (
              <div className="col-span-12 flex justify-between items-center h-20 bg-[#020810] border border-cyan-800/60 rounded p-2 text-[11px] font-mono">
                <div className="flex flex-col space-y-1">
                  <span className="text-cyan-400 font-bold">FX 1: {String(p.fx1_type || 'chorus').toUpperCase()}</span>
                  <span className="text-cyan-200">
                    MIX: {Math.round((p.fx1_mix || 0.35) * 100)}% | TIME: {p.fx1_time}s | TONE: {p.fx1_tone}Hz
                  </span>
                </div>
                <div className="h-full w-px bg-cyan-900/40" />
                <div className="flex flex-col space-y-1">
                  <span className="text-sky-400 font-bold">FX 2: {String(p.fx2_type || 'hall_reverb').toUpperCase()}</span>
                  <span className="text-cyan-200">
                    MIX: {Math.round((p.fx2_mix || 0.38) * 100)}% | DECAY: {p.fx2_decay}s | TONE: {p.fx2_tone}Hz
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ================= SECTION 1: OSCILLATORS & THE WAVE SURFER ================= */}
      <div className="relative z-10 bg-black/40 border border-cyan-900/60 rounded-md p-2.5 mb-2.5 shadow-inner backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-cyan-900/40 pb-1.5 mb-2">
          <div className="flex items-center space-x-2">
            <Waves className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-mono font-bold text-cyan-300 tracking-wider">
              WAVETABLE OSCILLATORS & WAVE SURFER
            </span>
          </div>

          {/* Oscillator 1 / 2 / 3 Selector Buttons */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[11px] font-mono text-cyan-400/80 mr-1">EDIT OSC:</span>
            {([1, 2, 3] as const).map((num) => (
              <motion.button
                key={num}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedOsc(num)}
                className={`px-2.5 py-0.5 text-[11px] font-mono font-bold rounded transition cursor-pointer ${
                  selectedOsc === num
                    ? 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                    : 'bg-cyan-950/80 text-cyan-300 hover:bg-cyan-900/60 border border-cyan-800/40'
                }`}
              >
                OSC {num}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* THE ICONIC MASTER WAVE SURFER KNOB */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="flex flex-col items-center bg-gradient-to-b from-cyan-950/80 to-black/70 p-2 rounded border border-cyan-600/70 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
          >
            <span className="text-[11px] font-mono font-extrabold text-cyan-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
              <Sparkles className="w-2.5 h-2.5 text-cyan-400 animate-spin" />
              <span>WAVE SURFER</span>
            </span>
            <Knob
              label="SURFER"
              value={p.waveSurfer ?? 0}
              min={-63}
              max={63}
              step={1}
              size="md"
              variant="blue"
              onChange={(v) => setP('waveSurfer', v)}
            />
            <span className="text-[11px] font-mono text-cyan-400 font-bold mt-1">
              {p.waveSurfer > 0 ? `+${p.waveSurfer}` : p.waveSurfer}
            </span>
          </motion.div>

          {/* Wavetable Bank & Preset Selector */}
          <div className="flex flex-col space-y-1.5 bg-black/45 p-2 rounded border border-cyan-900/50">
            <div className="flex items-center space-x-1">
              <span className="text-[11px] font-mono text-cyan-400">BANK:</span>
              <div className="flex space-x-1">
                {(['p', 'u', 'a', 's'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setP(`osc${selectedOsc}_type`, type)}
                    className={`px-1.5 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                      p[`osc${selectedOsc}_type`] === type
                        ? 'bg-cyan-500 text-black font-bold'
                        : 'bg-cyan-950 text-cyan-300 hover:bg-cyan-900'
                    }`}
                  >
                    {type === 'p' ? 'PPG (P)' : type === 'u' ? 'USER (U)' : type === 'a' ? 'ANALOG (A)' : 'SAMPLE (S)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Table Dropdown */}
            <select
              value={p[`osc${selectedOsc}_table`] || 0}
              onChange={(e) => setP(`osc${selectedOsc}_table`, Number(e.target.value))}
              className="bg-[#030b14] border border-cyan-800 text-[11px] px-2 py-1 rounded font-mono text-cyan-200 w-52"
            >
              {p[`osc${selectedOsc}_type`] === 'p' &&
                PPG_TABLES.map((t, idx) => (
                  <option key={idx} value={parseInt(t.slice(1, 3))}>
                    {t}
                  </option>
                ))}
              {p[`osc${selectedOsc}_type`] === 'u' &&
                USER_TABLES.map((t, idx) => (
                  <option key={idx} value={parseInt(t.slice(1, 3))}>
                    {t}
                  </option>
                ))}
              {p[`osc${selectedOsc}_type`] === 'a' &&
                ANALOG_WAVES.map((t, idx) => (
                  <option key={idx} value={parseInt(t.slice(1, 3))}>
                    {t}
                  </option>
                ))}
              {p[`osc${selectedOsc}_type`] === 's' &&
                SAMPLE_SLOTS.map((t, idx) => (
                  <option key={idx} value={parseInt(t.slice(1, 3))}>
                    {t}
                  </option>
                ))}
            </select>
          </div>

          {/* Active Osc Knobs */}
          <div className="flex items-center space-x-2">
            <Knob
              label="WAVE POS"
              value={p[`osc${selectedOsc}_wave`] ?? 0}
              min={0}
              max={63}
              step={1}
              size="xs"
              variant="blue"
              onChange={(v) => setP(`osc${selectedOsc}_wave`, v)}
            />
            <Knob
              label="PITCH"
              value={p[`osc${selectedOsc}_pitch`] ?? 0}
              min={-24}
              max={24}
              step={1}
              unit="st"
              size="xs"
              variant="white"
              onChange={(v) => setP(`osc${selectedOsc}_pitch`, v)}
            />
            <Knob
              label="FINE"
              value={p[`osc${selectedOsc}_fine`] ?? 0}
              min={-50}
              max={50}
              step={1}
              unit="c"
              size="xs"
              variant="white"
              onChange={(v) => setP(`osc${selectedOsc}_fine`, v)}
            />
            <Knob
              label="LEVEL"
              value={p[`osc${selectedOsc}_level`] ?? 80}
              min={0}
              max={100}
              step={1}
              size="xs"
              variant="yellow"
              onChange={(v) => setP(`osc${selectedOsc}_level`, v)}
            />
            <Knob
              label="KEY->WAVE"
              value={p[`osc${selectedOsc}_kw`] ?? 0}
              min={-63}
              max={63}
              step={1}
              size="xs"
              variant="metal"
              onChange={(v) => setP(`osc${selectedOsc}_kw`, v)}
            />
          </div>

          {/* Global Wave Flow, Drift, & Linear FM */}
          <div className="flex items-center space-x-2 bg-black/40 p-1.5 rounded border border-cyan-900/40">
            <Knob
              label="WAVE FLOW"
              value={p.waveFlow ?? 65}
              min={0}
              max={100}
              step={1}
              unit="%"
              size="xs"
              variant="blue"
              onChange={(v) => setP('waveFlow', v)}
            />
            <Knob
              label="DRIFT"
              value={p.circuitDrift ?? 25}
              min={0}
              max={100}
              step={1}
              unit="%"
              size="xs"
              variant="amber"
              onChange={(v) => setP('circuitDrift', v)}
            />
            <Knob
              label="FM 2->1"
              value={p.osc2_fm ?? 0}
              min={0}
              max={1}
              step={0.02}
              size="xs"
              variant="yellow"
              onChange={(v) => setP('osc2_fm', v)}
            />
          </div>
        </div>
      </div>

      {/* ================= SECTION 2: DUAL FILTERS IN SERIES ================= */}
      <div className="relative z-10 bg-black/40 border border-cyan-900/60 rounded-md p-2.5 mb-2.5 shadow-inner backdrop-blur-sm">
        <div className="flex items-center space-x-2 border-b border-cyan-900/40 pb-1.5 mb-2">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-mono font-bold text-cyan-300 tracking-wider">
            DUAL FILTERS (FILTER 1: 12dB SVF → FILTER 2: 24dB 4-POLE WITH SATURATION)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* FILTER 1: State-Variable Filter (SVF) */}
          <div className="flex items-center justify-between bg-black/45 p-2 rounded border border-cyan-800/40">
            <div className="flex flex-col space-y-1">
              <span className="text-[11px] font-mono font-bold text-cyan-400">FILTER 1 (SVF)</span>
              <div className="flex space-x-1">
                {(['lowpass', 'notch', 'highpass', 'bandpass'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setP('f1_mode', mode)}
                    className={`px-1.5 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                      p.f1_mode === mode ? 'bg-cyan-500 text-black font-bold' : 'bg-cyan-950 text-cyan-300'
                    }`}
                  >
                    {mode === 'lowpass' ? 'LP' : mode === 'notch' ? 'NOTCH' : mode === 'highpass' ? 'HP' : 'BP'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Knob
                label="CUTOFF"
                value={p.f1_cutoff ?? 4200}
                min={20}
                max={20000}
                step={20}
                unit="Hz"
                size="xs"
                variant="blue"
                onChange={(v) => setP('f1_cutoff', v)}
              />
              <Knob
                label="RES"
                value={p.f1_resonance ?? 2.5}
                min={0.5}
                max={20}
                step={0.1}
                unit="Q"
                size="xs"
                variant="blue"
                onChange={(v) => setP('f1_resonance', v)}
              />
              <Knob
                label="AMT"
                value={p.f1_envAmt ?? 30}
                min={-100}
                max={100}
                step={1}
                unit="%"
                size="xs"
                variant="yellow"
                onChange={(v) => setP('f1_envAmt', v)}
              />
            </div>
          </div>

          {/* FILTER 2: 24dB 4-Pole Low-Pass Filter */}
          <div className="flex items-center justify-between bg-black/45 p-2 rounded border border-cyan-800/40">
            <div className="flex flex-col space-y-0.5">
              <span className="text-[11px] font-mono font-bold text-sky-400">FILTER 2 (4-POLE 24dB)</span>
              <span className="text-[11px] font-mono text-cyan-400/80">OVERDRIVE & BASS COMP</span>
            </div>

            <div className="flex items-center space-x-2">
              <Knob
                label="CUTOFF"
                value={p.f2_cutoff ?? 2800}
                min={20}
                max={20000}
                step={20}
                unit="Hz"
                size="xs"
                variant="metal"
                onChange={(v) => setP('f2_cutoff', v)}
              />
              <Knob
                label="RES"
                value={p.f2_resonance ?? 3.8}
                min={0.5}
                max={25}
                step={0.1}
                unit="Q"
                size="xs"
                variant="metal"
                onChange={(v) => setP('f2_resonance', v)}
              />
              <Knob
                label="DRIVE"
                value={p.f2_drive ?? 20}
                min={0}
                max={100}
                step={1}
                unit="%"
                size="xs"
                variant="amber"
                onChange={(v) => setP('f2_drive', v)}
              />
              <Knob
                label="BASS COMP"
                value={p.f2_bassComp ?? 60}
                min={0}
                max={100}
                step={1}
                unit="%"
                size="xs"
                variant="metal"
                onChange={(v) => setP('f2_bassComp', v)}
              />
              <Knob
                label="AMT"
                value={p.f2_envAmt ?? 45}
                min={-100}
                max={100}
                step={1}
                unit="%"
                size="xs"
                variant="yellow"
                onChange={(v) => setP('f2_envAmt', v)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ================= SECTION 3: ENVELOPES & 4 LFOs ================= */}
      <div className="relative z-10 grid grid-cols-12 gap-2.5 mb-2.5">
        {/* Filter & Amp Envelopes */}
        <div className="col-span-8 bg-black/40 border border-cyan-900/60 rounded-md p-2 shadow-inner backdrop-blur-sm">
          <div className="flex items-center space-x-2 border-b border-cyan-900/40 pb-1 mb-2">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-mono font-bold text-cyan-300 tracking-wider">
              ENVELOPES (FILTER EXPONENTIAL / PPG + AMP VCA)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Filter ADSR */}
            <div className="flex items-center space-x-1.5 bg-black/45 p-1.5 rounded border border-cyan-900/30">
              <span className="text-[11px] font-mono text-cyan-400 font-bold rotate-180 [writing-mode:vertical-lr]">
                FILTER
              </span>
              <Knob
                label="ATTACK"
                value={p.fenv_attack ?? 0.04}
                min={0.005}
                max={6}
                step={0.01}
                unit="s"
                size="xs"
                variant="blue"
                onChange={(v) => setP('fenv_attack', v)}
              />
              <Knob
                label="DECAY"
                value={p.fenv_decay ?? 0.75}
                min={0.01}
                max={10}
                step={0.05}
                unit="s"
                size="xs"
                variant="blue"
                onChange={(v) => setP('fenv_decay', v)}
              />
              <Knob
                label="SUSTAIN"
                value={p.fenv_sustain ?? 0.45}
                min={0}
                max={1}
                step={0.02}
                size="xs"
                variant="blue"
                onChange={(v) => setP('fenv_sustain', v)}
              />
              <Knob
                label="RELEASE"
                value={p.fenv_release ?? 0.85}
                min={0.01}
                max={10}
                step={0.05}
                unit="s"
                size="xs"
                variant="blue"
                onChange={(v) => setP('fenv_release', v)}
              />
            </div>

            {/* Amp ADSR */}
            <div className="flex items-center space-x-1.5 bg-black/45 p-1.5 rounded border border-cyan-900/30">
              <span className="text-[11px] font-mono text-sky-400 font-bold rotate-180 [writing-mode:vertical-lr]">
                AMP
              </span>
              <Knob
                label="ATTACK"
                value={p.aenv_attack ?? 0.02}
                min={0.005}
                max={6}
                step={0.01}
                unit="s"
                size="xs"
                variant="white"
                onChange={(v) => setP('aenv_attack', v)}
              />
              <Knob
                label="DECAY"
                value={p.aenv_decay ?? 0.65}
                min={0.01}
                max={10}
                step={0.05}
                unit="s"
                size="xs"
                variant="white"
                onChange={(v) => setP('aenv_decay', v)}
              />
              <Knob
                label="SUSTAIN"
                value={p.aenv_sustain ?? 0.75}
                min={0}
                max={1}
                step={0.02}
                size="xs"
                variant="white"
                onChange={(v) => setP('aenv_sustain', v)}
              />
              <Knob
                label="RELEASE"
                value={p.aenv_release ?? 0.95}
                min={0.01}
                max={10}
                step={0.05}
                unit="s"
                size="xs"
                variant="white"
                onChange={(v) => setP('aenv_release', v)}
              />
            </div>
          </div>
        </div>

        {/* 4 LFOs Section */}
        <div className="col-span-4 bg-black/40 border border-cyan-900/60 rounded-md p-2 shadow-inner backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-cyan-900/40 pb-1 mb-2">
            <span className="text-[11px] font-mono font-bold text-cyan-300">4 LFOs</span>
            <div className="flex space-x-1">
              {([1, 2, 3, 4] as const).map((num) => (
                <button
                  key={num}
                  onClick={() => setSelectedLfo(num)}
                  className={`px-1.5 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                    selectedLfo === num ? 'bg-cyan-500 text-black font-bold' : 'bg-cyan-950 text-cyan-300'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Knob
              label="RATE"
              value={p[`lfo${selectedLfo}_rate`] ?? 1.8}
              min={0.05}
              max={30}
              step={0.1}
              unit="Hz"
              size="xs"
              variant="blue"
              onChange={(v) => setP(`lfo${selectedLfo}_rate`, v)}
            />
            <Knob
              label="AMT"
              value={p[`lfo${selectedLfo}_amt`] ?? 0.2}
              min={0}
              max={1}
              step={0.02}
              size="xs"
              variant="blue"
              onChange={(v) => setP(`lfo${selectedLfo}_amt`, v)}
            />

            <div className="flex flex-col space-y-1">
              <span className="text-[11px] font-mono text-cyan-400">DEST</span>
              <select
                value={p[`lfo${selectedLfo}_dest`] || 'waveSurfer'}
                onChange={(e) => setP(`lfo${selectedLfo}_dest`, e.target.value)}
                className="bg-[#030b14] border border-cyan-800 text-[11px] px-1 py-0.5 rounded font-mono text-cyan-200"
              >
                <option value="waveSurfer">Wave Surfer</option>
                <option value="f1_cutoff">Filter 1 Cutoff</option>
                <option value="f2_cutoff">Filter 2 Cutoff</option>
                <option value="pitch">Osc Pitch</option>
                <option value="pan">Amp Pan</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ================= SECTION 4: DUAL EFFECTS & MASTER SPREAD ================= */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 bg-black/45 border border-cyan-900/60 rounded-md p-2 shadow-inner backdrop-blur-sm">
        {/* FX 1 */}
        <div className="flex items-center space-x-2 bg-black/50 p-1.5 rounded border border-cyan-900/40">
          <div className="flex flex-col space-y-0.5">
            <span className="text-[11px] font-mono font-bold text-cyan-400">FX 1 (MOD / DELAY)</span>
            <select
              value={p.fx1_type || 'chorus'}
              onChange={(e) => setP('fx1_type', e.target.value)}
              className="bg-[#030b14] border border-cyan-800 text-[11px] px-1 py-0.5 rounded font-mono text-cyan-200"
            >
              <option value="chorus">Chorus (Lush Multi-Tap)</option>
              <option value="bbd_delay">BBD Delay</option>
              <option value="stereo_delay">Stereo Delay</option>
              <option value="tape_delay">Tape Echo (Echoplex)</option>
              <option value="flanger">Flanger</option>
              <option value="phaser">Phaser</option>
            </select>
          </div>
          <Knob
            label="TIME"
            value={p.fx1_time ?? 0.32}
            min={0.02}
            max={2.0}
            step={0.02}
            unit="s"
            size="xs"
            variant="metal"
            onChange={(v) => setP('fx1_time', v)}
          />
          <Knob
            label="FEEDBK"
            value={p.fx1_feedback ?? 0.45}
            min={0}
            max={0.92}
            step={0.02}
            size="xs"
            variant="metal"
            onChange={(v) => setP('fx1_feedback', v)}
          />
          <Knob
            label="MIX"
            value={p.fx1_mix ?? 0.35}
            min={0}
            max={1}
            step={0.02}
            size="xs"
            variant="yellow"
            onChange={(v) => setP('fx1_mix', v)}
          />
        </div>

        {/* FX 2 */}
        <div className="flex items-center space-x-2 bg-black/50 p-1.5 rounded border border-cyan-900/40">
          <div className="flex flex-col space-y-0.5">
            <span className="text-[11px] font-mono font-bold text-sky-400">FX 2 (REVERB / DRIVE)</span>
            <select
              value={p.fx2_type || 'hall_reverb'}
              onChange={(e) => setP('fx2_type', e.target.value)}
              className="bg-[#030b14] border border-cyan-800 text-[11px] px-1 py-0.5 rounded font-mono text-cyan-200"
            >
              <option value="hall_reverb">Hall Reverb</option>
              <option value="room_reverb">Room Reverb</option>
              <option value="superplate">Superplate Reverb</option>
              <option value="distortion">Analog Distortion</option>
            </select>
          </div>
          <Knob
            label="DECAY"
            value={p.fx2_decay ?? 3.8}
            min={0.5}
            max={12}
            step={0.2}
            unit="s"
            size="xs"
            variant="metal"
            onChange={(v) => setP('fx2_decay', v)}
          />
          <Knob
            label="DRIVE"
            value={p.fx2_drive ?? 1.0}
            min={0}
            max={10}
            step={0.2}
            size="xs"
            variant="amber"
            onChange={(v) => setP('fx2_drive', v)}
          />
          <Knob
            label="MIX"
            value={p.fx2_mix ?? 0.38}
            min={0}
            max={1}
            step={0.02}
            size="xs"
            variant="yellow"
            onChange={(v) => setP('fx2_mix', v)}
          />
        </div>

        {/* Master Section: Pan Spread & Volume */}
        <div className="flex items-center space-x-2 bg-gradient-to-r from-cyan-950/50 to-black/70 p-1.5 rounded border border-cyan-800/50">
          <Knob
            label="PAN SPREAD"
            value={p.panSpread ?? 75}
            min={0}
            max={100}
            step={1}
            unit="%"
            size="xs"
            variant="blue"
            onChange={(v) => setP('panSpread', v)}
          />
          <Knob
            label="GLIDE"
            value={p.glide ?? 0}
            min={0}
            max={2.0}
            step={0.05}
            unit="s"
            size="xs"
            variant="metal"
            onChange={(v) => setP('glide', v)}
          />
          <Knob
            label="MASTER VOL"
            value={p.volume ?? 0.85}
            min={0}
            max={1.5}
            step={0.02}
            size="xs"
            variant="yellow"
            onChange={(v) => setP('volume', v)}
          />
        </div>
      </div>
    </div>
  );
};
