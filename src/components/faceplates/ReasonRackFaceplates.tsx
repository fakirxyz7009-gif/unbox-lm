import React from 'react';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { Knob } from '../Knob.tsx';
import { VacuumTube } from '../VacuumTube.tsx';
import { DeviceVisualizer } from '../visualizers/DeviceVisualizer.tsx';
import { Play } from 'lucide-react';

interface ReasonRackFaceplateProps {
  device: BaseDevice;
  onUpdate: () => void;
}

const StepRibbon16: React.FC<{ device: BaseDevice; onUpdate: () => void }> = ({ device, onUpdate }) => {
  const track = audioEngine.tracks.find((t) => t.deviceId === device.id);
  const currentStep = audioEngine.currentStep % 16;
  const isPlaying = audioEngine.isPlaying;

  return (
    <div className="w-full flex items-center justify-between bg-black/75 px-2.5 py-1 rounded border border-neutral-800 mt-1.5">
      <span className="text-[7.5px] font-mono font-black tracking-widest text-amber-400 mr-2">
        16-STEP LED RUN RIBBON
      </span>
      <div className="flex-1 grid grid-cols-16 gap-1">
        {Array.from({ length: 16 }).map((_, idx) => {
          const stepNote = track?.steps?.[idx];
          const isActive = !!stepNote && !stepNote.muted;
          const isCurrent = isPlaying && currentStep === idx;
          return (
            <button
              key={idx}
              onClick={() => {
                if (track) {
                  if (isActive) {
                    audioEngine.setTrackStep(track.id, idx, null);
                  } else {
                    audioEngine.setTrackStep(track.id, idx, {
                      note: 60 + (idx % 4),
                      velocity: idx % 4 === 0 ? 1.0 : 0.85,
                      length: 1,
                    });
                  }
                  onUpdate();
                }
              }}
              className={`h-3.5 rounded-xs border flex flex-col items-center justify-center transition-all ${
                isCurrent
                  ? 'bg-amber-300 border-white shadow-[0_0_8px_#f59e0b]'
                  : isActive
                  ? 'bg-red-600/90 border-red-400 shadow-[0_0_5px_rgba(239,68,68,0.6)]'
                  : idx % 4 === 0
                  ? 'bg-neutral-800 border-neutral-600'
                  : 'bg-neutral-950 border-neutral-800'
              }`}
            >
              <span className={`text-[6.5px] font-mono font-bold ${isCurrent ? 'text-black' : 'text-neutral-300'}`}>
                {idx + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const VuNeedleBox: React.FC<{ label: string; drive: number; grDb: number }> = ({ label, drive, grDb }) => {
  const inAngle = -38 + Math.min(1, Math.max(0, drive)) * 76;
  const grAngle = 38 - Math.min(1, Math.max(0, grDb / 12)) * 76;
  return (
    <div className="flex flex-col items-center bg-gradient-to-b from-[#2b1f11] to-[#171008] p-1.5 rounded border border-amber-600/50 shadow-[inset_0_2px_10px_rgba(0,0,0,0.9)]">
      <span className="text-[7px] font-mono font-black tracking-widest text-amber-300 uppercase mb-0.5">{label}</span>
      <svg width={90} height={42} className="rounded bg-[#22170a] border border-amber-700/40 overflow-hidden">
        <path d="M 10 36 A 36 36 0 0 1 80 36" fill="none" stroke="#78350f" strokeWidth="3" />
        <path d="M 60 15 A 36 36 0 0 1 80 36" fill="none" stroke="#ef4444" strokeWidth="3" />
        <g transform={`translate(45, 38) rotate(${inAngle})`}>
          <line x1={0} y1={0} x2={0} y2={-30} stroke="#fbbf24" strokeWidth="1.6" />
        </g>
        <g transform={`translate(45, 38) rotate(${grAngle})`}>
          <line x1={0} y1={0} x2={0} y2={-26} stroke="#ef4444" strokeWidth="1.3" strokeDasharray="2 1" />
        </g>
        <circle cx={45} cy={38} r={3} fill="#d97706" />
      </svg>
    </div>
  );
};

export const ReasonRackFaceplate: React.FC<ReasonRackFaceplateProps> = ({ device, onUpdate }) => {
  const p = device.params;
  const setP = (key: string, val: any) => {
    device.setParam(key, val);
    onUpdate();
  };

  const triggerAudition = (note: number = 60, ms: number = 300) => {
    (device as any).noteOn?.(note, 0.92);
    setTimeout(() => (device as any).noteOff?.(note), ms);
  };

  // 1. MALSTRÖM: Graintable Synthesizer
  if (device.type === 'malstrom') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#0b191e] via-[#10262e] to-[#0b191e] rounded border border-teal-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-teal-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-teal-300 tracking-wider">MALSTRÖM GRAINTABLE</span>
            <span className="text-[8px] font-mono text-cyan-400">DUAL GRAINTABLE &bull; SHAPER</span>
            <select
              value={p.graintableA || 'Ghost Choir'}
              onChange={(e) => setP('graintableA', e.target.value)}
              className="mt-1 bg-slate-950 border border-teal-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-teal-200"
            >
              <option value="Ghost Choir">GT-A: Ghost Choir</option>
              <option value="Metal Saw">GT-A: Metal Saw</option>
              <option value="Formant Vox">GT-A: Formant Vox</option>
              <option value="Tibetan Bell">GT-A: Tibetan Bell</option>
            </select>
          </div>
          <Knob label="MOTION" value={p.motion ?? 0.62} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('motion', v)} />
          <Knob label="INDEX" value={p.index ?? 0.45} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('index', v)} />
          <Knob label="SHIFT" value={p.shift ?? 4} min={-12} max={12} step={1} unit="st" size="sm" variant="white" onChange={(v) => setP('shift', v)} />
          <Knob label="SHAPER" value={p.drive ?? 0.45} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('drive', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 3800} min={80} max={16000} step={25} unit="Hz" size="sm" variant="dark" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 4.5} min={0.5} max={15} step={0.2} size="sm" variant="metal" onChange={(v) => setP('resonance', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 320)}
          className="px-3 py-2 rounded bg-teal-500 hover:bg-teal-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 2. ALGORITM: 9-Slot FM Synthesizer
  if (device.type === 'algoritm') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#12131c] via-[#191b28] to-[#12131c] rounded border border-indigo-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-indigo-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-indigo-300 tracking-wider">ALGORITM 9-SLOT FM</span>
            <span className="text-[8px] font-mono text-cyan-400">PROGRAMMABLE FM MATRIX</span>
            <select
              value={p.algorithm || 'ALG-4 Bell Matrix'}
              onChange={(e) => setP('algorithm', e.target.value)}
              className="mt-1 bg-slate-950 border border-indigo-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-indigo-200"
            >
              <option value="ALG-4 Bell Matrix">ALG-4: Bell Matrix</option>
              <option value="ALG-1 Stack 9-Op">ALG-1: 9-Op Stack</option>
              <option value="ALG-7 Parallel Bass">ALG-7: Parallel Bass</option>
              <option value="ALG-9 Carrier Feedback">ALG-9: Feedback Lead</option>
            </select>
          </div>
          <Knob label="OP1 RATIO" value={p.op1Ratio ?? 1.0} min={0.5} max={8} step={0.5} size="sm" variant="white" onChange={(v) => setP('op1Ratio', v)} />
          <Knob label="OP2 RATIO" value={p.op2Ratio ?? 2.0} min={0.5} max={12} step={0.5} size="sm" variant="yellow" onChange={(v) => setP('op2Ratio', v)} />
          <Knob label="OP3 RATIO" value={p.op3Ratio ?? 3.5} min={0.5} max={16} step={0.5} size="sm" variant="metal" onChange={(v) => setP('op3Ratio', v)} />
          <Knob label="FM INDEX" value={p.fmIndex ?? 240} min={10} max={800} step={10} size="sm" variant="yellow" onChange={(v) => setP('fmIndex', v)} />
          <Knob label="FEEDBACK" value={p.feedback ?? 0.35} min={0} max={1} step={0.02} size="sm" variant="dark" onChange={(v) => setP('feedback', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 6400} min={100} max={16000} step={40} unit="Hz" size="sm" variant="white" onChange={(v) => setP('cutoff', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(64, 300)}
          className="px-3 py-2 rounded bg-indigo-500 hover:bg-indigo-400 text-white font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 3. COMPLEX-1: Modular Synthesizer
  if (device.type === 'complex1') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#141414] via-[#1f1f1f] to-[#141414] rounded border border-amber-500/40">
        <div className="flex items-center space-x-3 bg-black/60 p-2 rounded border border-amber-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-amber-300 tracking-wider">COMPLEX-1 MODULAR</span>
            <span className="text-[8px] font-mono text-emerald-400">WEST-COAST WAVEFOLDER &bull; LPG</span>
          </div>
          <Knob label="WAVEFOLD" value={p.wavefold ?? 0.68} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('wavefold', v)} />
          <Knob label="TIMBRE MOD" value={p.timbreMod ?? 0.52} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('timbreMod', v)} />
          <Knob label="LPG GATE" value={p.lpgResponse ?? 0.75} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('lpgResponse', v)} />
          <Knob label="COMB DLY" value={p.combPitch ?? 0.4} min={0} max={1} step={0.02} size="sm" variant="dark" onChange={(v) => setP('combPitch', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 2900} min={80} max={15000} step={25} unit="Hz" size="sm" variant="yellow" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 5.4} min={0.5} max={16} step={0.2} size="sm" variant="metal" onChange={(v) => setP('resonance', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(48, 280)}
          className="px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 4. PARSEC 2: Spectral Synthesizer
  if (device.type === 'parsec2') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#071622] via-[#0c2336] to-[#071622] rounded border border-sky-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-sky-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-sky-300 tracking-wider">PARSEC 2 SPECTRAL</span>
            <span className="text-[8px] font-mono text-emerald-400">1024-PARTIAL ADDITIVE ENGINE</span>
            <select
              value={p.mod1Type || 'Formant Filter'}
              onChange={(e) => setP('mod1Type', e.target.value)}
              className="mt-1 bg-slate-950 border border-sky-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-sky-200"
            >
              <option value="Formant Filter">MOD1: Formant Filter</option>
              <option value="Harmonic Stretch">MOD1: Harmonic Stretch</option>
              <option value="Vocoder Mask">MOD1: Vocoder Mask</option>
              <option value="PWM Spectra">MOD1: PWM Spectra</option>
            </select>
          </div>
          <Knob label="SLOPE" value={p.spectralSlope ?? 0.65} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('spectralSlope', v)} />
          <Knob label="ENSEMBLE" value={p.ensembleMix ?? 0.55} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('ensembleMix', v)} />
          <Knob label="A/B BAL" value={p.abBalance ?? 0.5} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('abBalance', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 5200} min={100} max={16000} step={40} unit="Hz" size="sm" variant="dark" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RELEASE" value={p.release ?? 0.6} min={0.05} max={2.5} step={0.05} unit="s" size="sm" variant="metal" onChange={(v) => setP('release', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 350)}
          className="px-3 py-2 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 5. POLYTONE: Dual-Layer Synthesizer
  if (device.type === 'polytone') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#1f130d] via-[#2c1a12] to-[#1f130d] rounded border border-orange-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-orange-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-orange-300 tracking-wider">POLYTONE DUAL-LAYER</span>
            <span className="text-[8px] font-mono text-amber-400">LAYER A/B MORPH &bull; VINTAGE DRIFT</span>
          </div>
          <Knob label="A/B MORPH" value={p.layerMorph ?? 0.5} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('layerMorph', v)} />
          <Knob label="AGE DRIFT" value={p.ageDrift ?? 0.42} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('ageDrift', v)} />
          <Knob label="SPREAD" value={p.spreadWidth ?? 0.65} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('spreadWidth', v)} />
          <Knob label="CHORUS" value={p.chorusMix ?? 0.5} min={0} max={1} step={0.02} size="sm" variant="dark" onChange={(v) => setP('chorusMix', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 3100} min={80} max={16000} step={25} unit="Hz" size="sm" variant="yellow" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 3.4} min={0.5} max={15} step={0.2} size="sm" variant="metal" onChange={(v) => setP('resonance', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 320)}
          className="px-3 py-2 rounded bg-orange-500 hover:bg-orange-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 6. OBJEKT: Physical Modeling Synthesizer
  if (device.type === 'objekt') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#14181d] via-[#1c222b] to-[#14181d] rounded border border-cyan-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-cyan-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-cyan-300 tracking-wider">OBJEKT PHYSICAL MODELING</span>
            <span className="text-[8px] font-mono text-emerald-400">EXCITER &bull; 3 MODAL RESONATORS</span>
            <select
              value={p.modalObject || 'Hollow Steel Plate'}
              onChange={(e) => setP('modalObject', e.target.value)}
              className="mt-1 bg-slate-950 border border-cyan-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-cyan-200"
            >
              <option value="Hollow Steel Plate">MODAL: Hollow Steel Plate</option>
              <option value="Crystal Marimba Bar">MODAL: Crystal Marimba Bar</option>
              <option value="Bowed Nylon String">MODAL: Bowed Nylon String</option>
              <option value="Ceramic Kettle Bell">MODAL: Ceramic Kettle Bell</option>
            </select>
          </div>
          <Knob label="INHARM" value={p.inharmonicity ?? 0.28} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('inharmonicity', v)} />
          <Knob label="DAMPING" value={p.damping ?? 0.55} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('damping', v)} />
          <Knob label="BODY RES" value={p.bodyResonance ?? 0.7} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('bodyResonance', v)} />
          <Knob label="DECAY" value={p.decay ?? 0.85} min={0.05} max={2.5} step={0.05} unit="s" size="sm" variant="dark" onChange={(v) => setP('decay', v)} />
          <Knob label="RESO Q" value={p.resonance ?? 6.5} min={1} max={18} step={0.2} size="sm" variant="yellow" onChange={(v) => setP('resonance', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(67, 340)}
          className="px-3 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 7. GRAIN: Sample Manipulator / Granular Synth
  if (device.type === 'grain') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#18140c] via-[#261f12] to-[#18140c] rounded border border-amber-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-amber-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-amber-300 tracking-wider">GRAIN SAMPLE MANIPULATOR</span>
            <span className="text-[8px] font-mono text-cyan-400">GRANULAR CLOUD &bull; FFT ENGINE</span>
            <select
              value={p.algorithm || 'Spectral Grains'}
              onChange={(e) => setP('algorithm', e.target.value)}
              className="mt-1 bg-slate-950 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-amber-200"
            >
              <option value="Spectral Grains">Spectral Grains</option>
              <option value="Long Grains">Long Grains</option>
              <option value="Tape Scrub">Tape Scrub</option>
            </select>
          </div>
          <Knob label="POSITION" value={p.position ?? 0.35} min={0} max={1} step={0.01} size="sm" variant="yellow" onChange={(v) => setP('position', v)} />
          <Knob label="GRAIN SZ" value={p.grainSize ?? 0.48} min={0.05} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('grainSize', v)} />
          <Knob label="DENSITY" value={p.density ?? 0.72} min={0.1} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('density', v)} />
          <Knob label="JITTER" value={p.jitter ?? 0.3} min={0} max={1} step={0.02} size="sm" variant="dark" onChange={(v) => setP('jitter', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 4400} min={80} max={16000} step={30} unit="Hz" size="sm" variant="yellow" onChange={(v) => setP('cutoff', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 380)}
          className="px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 8. NN-XT: Advanced Sampler
  if (device.type === 'nnxt') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#0a1929] via-[#102740] to-[#0a1929] rounded border border-blue-400/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-blue-400/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-blue-300 tracking-wider">NN-XT ADVANCED SAMPLER</span>
            <span className="text-[8px] font-mono text-cyan-300">MULTI-ZONE KEYMAP &bull; VEL XFADE</span>
            <select
              value={p.patchZone || 'Orchestral Grand + Strings'}
              onChange={(e) => setP('patchZone', e.target.value)}
              className="mt-1 bg-slate-950 border border-blue-400/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-blue-200"
            >
              <option value="Orchestral Grand + Strings">Orchestral Grand + Strings</option>
              <option value="Symphonic Brass Section">Symphonic Brass Section</option>
              <option value="Vintage Tape Mellotron">Vintage Tape Mellotron</option>
              <option value="Acoustic Harp & Celesta">Acoustic Harp & Celesta</option>
            </select>
          </div>
          <Knob label="VEL XFADE" value={p.velCrossfade ?? 0.65} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('velCrossfade', v)} />
          <Knob label="SMP START" value={p.sampleStart ?? 0} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('sampleStart', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 4800} min={80} max={16000} step={30} unit="Hz" size="sm" variant="white" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 2.1} min={0.5} max={15} step={0.2} size="sm" variant="dark" onChange={(v) => setP('resonance', v)} />
          <Knob label="RELEASE" value={p.release ?? 0.5} min={0.05} max={2.5} step={0.05} unit="s" size="sm" variant="metal" onChange={(v) => setP('release', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 350)}
          className="px-3 py-2 rounded bg-blue-500 hover:bg-blue-400 text-white font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 9. NN-19: Digital Sampler
  if (device.type === 'nn19') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#131822] via-[#1c2433] to-[#131822] rounded border border-slate-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-slate-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-cyan-300 tracking-wider">NN-19 DIGITAL SAMPLER</span>
            <span className="text-[8px] font-mono text-slate-400">CLASSIC RACK PCM WORKHORSE</span>
            <select
              value={p.sampleBank || '90s Rave Piano & Brass'}
              onChange={(e) => setP('sampleBank', e.target.value)}
              className="mt-1 bg-slate-950 border border-cyan-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-cyan-200"
            >
              <option value="90s Rave Piano & Brass">90s Rave Piano & Brass</option>
              <option value="Classic House Organ M1">Classic House Organ M1</option>
              <option value="Lo-Fi 12-Bit Strings">Lo-Fi 12-Bit Strings</option>
            </select>
          </div>
          <Knob label="START" value={p.sampleStart ?? 0.05} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('sampleStart', v)} />
          <Knob label="BIT CRUSH" value={p.bitCrush ?? 0.25} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('bitCrush', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 3900} min={80} max={16000} step={30} unit="Hz" size="sm" variant="white" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 3.5} min={0.5} max={15} step={0.2} size="sm" variant="dark" onChange={(v) => setP('resonance', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 280)}
          className="px-3 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 10. KONG: 16-Pad Drum Designer (Velocity-Sensitive MPC Pads + Per-Channel Pitch/Decay/Pan/Level + 16-Step Run Ribbon)
  if (device.type === 'kong') {
    const padLabels = ['KICK 1', 'SNARE 1', 'CLOSED HH', 'OPEN HH', 'CLAP', 'TOM LO', 'TOM MID', 'TOM HI', 'RIM', 'COWBELL', 'CRASH', 'RIDE', 'SUB 808', 'PERC 1', 'PERC 2', 'NOISE'];
    return (
      <div className="flex flex-col space-y-1.5 p-2.5 bg-gradient-to-r from-[#1a110d] via-[#261812] to-[#1a110d] rounded border border-amber-500/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-amber-500/30">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-black text-amber-300 tracking-wider">KONG 16-PAD MPC DRUM DESIGNER</span>
              <span className="text-[8px] font-mono text-emerald-400">VELOCITY-SENSITIVE PADS &bull; PITCH / DECAY / PAN / LEVEL</span>
              <div className="grid grid-cols-8 gap-1 mt-1.5">
                {padLabels.map((lbl, idx) => {
                  const flashSeq = audioEngine.isPlaying && audioEngine.currentStep % 16 === idx;
                  return (
                    <button
                      key={lbl}
                      onClick={() => {
                        setP('activePad', idx);
                        (device as any).triggerPad?.(idx, 0.95);
                      }}
                      className={`px-1.5 py-1 rounded text-[7px] font-mono font-bold border transition-all ${
                        flashSeq
                          ? 'bg-amber-300 text-slate-950 border-white shadow-[0_0_12px_#f59e0b] scale-105'
                          : (p.activePad ?? 0) === idx
                          ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                          : 'bg-slate-900 text-amber-200 border-amber-500/30 hover:bg-amber-950'
                      }`}
                    >
                      {idx + 1}:{lbl.slice(0, 4)}
                    </button>
                  );
                })}
              </div>
            </div>
            <Knob label="PITCH" value={p.pitch ?? 0} min={-12} max={12} step={1} unit="st" size="sm" variant="white" onChange={(v) => setP('pitch', v)} />
            <Knob label="DECAY" value={p.decay ?? 0.38} min={0.05} max={1.2} step={0.02} unit="s" size="sm" variant="metal" onChange={(v) => setP('decay', v)} />
            <Knob label="PAN" value={p.pan ?? 0} min={-1} max={1} step={0.05} size="sm" variant="blue" onChange={(v) => setP('pan', v)} />
            <Knob label="LEVEL" value={p.punch ?? 0.85} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('punch', v)} />
          </div>
          <DeviceVisualizer device={device} width={140} height={54} />
        </div>
        <StepRibbon16 device={device} onUpdate={onUpdate} />
      </div>
    );
  }

  // 11. DR. OCTO REX: 8-Slot Loop Player + 16-Step Run Ribbon
  if (device.type === 'dr_octo_rex') {
    const activeSlot = p.activeLoopSlot ?? 1;
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer?.files?.[0];
          if (f && (device as any).loadSampleFile) {
            (device as any).loadSampleFile(activeSlot, f).then(() => onUpdate());
          }
        }}
        className="flex flex-col space-y-1.5 p-2.5 bg-gradient-to-r from-[#0d1915] via-[#132620] to-[#0d1915] rounded border border-emerald-500/40"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-emerald-500/30">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-black text-emerald-300 tracking-wider">DR. OCTO REX LOOP PLAYER</span>
              <span className="text-[8px] font-mono text-cyan-400">
                8-SLOT SLICED REX WORKSTATION &bull; {p.loopBank || 'Breakbeat Jungle 170.rx2'}
              </span>
              <div className="flex items-center space-x-1 mt-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((slot) => (
                  <button
                    key={slot}
                    onClick={() => {
                      setP('activeLoopSlot', slot);
                      triggerAudition(59 + slot, 200);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-black border ${
                      activeSlot === slot
                        ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-[0_0_8px_#10b981]'
                        : 'bg-slate-900 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    L{slot}
                  </button>
                ))}
                <label
                  className="ml-1.5 px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-500/40 text-[8px] font-mono font-bold cursor-pointer"
                  title="Load or Drag & Drop .WAV / .MP3 loop into active slot"
                >
                  + LOAD WAV
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && (device as any).loadSampleFile) {
                        (device as any).loadSampleFile(activeSlot, f).then(() => onUpdate());
                      }
                    }}
                  />
                </label>
              </div>
            </div>
            <Knob label="PITCH" value={p.slicePitch ?? 0} min={-12} max={12} step={1} unit="st" size="sm" variant="yellow" onChange={(v) => setP('slicePitch', v)} />
            <Knob label="DECAY" value={p.filterEnv ?? 0.65} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('filterEnv', v)} />
            <Knob label="CUTOFF" value={p.cutoff ?? 4600} min={100} max={16000} step={40} unit="Hz" size="sm" variant="white" onChange={(v) => setP('cutoff', v)} />
            <Knob label="LEVEL" value={p.resonance ?? 3.8} min={0.5} max={15} step={0.2} size="sm" variant="dark" onChange={(v) => setP('resonance', v)} />
          </div>
          <DeviceVisualizer device={device} width={150} height={54} />
          <button
            onClick={() => triggerAudition(60, 220)}
            className="px-3 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>TRIG SLICE</span>
          </button>
        </div>
        <StepRibbon16 device={device} onUpdate={onUpdate} />
      </div>
    );
  }

  // 12. UMPF CLUB DRUMS / UMPF RETRO BEATS + 8 MPC Pads & 16-Step Run Ribbon
  if (device.type === 'umpf') {
    const umpfPads = ['SUB KICK', 'CLAP', 'SNARE', 'CHH', 'OHH', 'TOM', 'COWBELL', 'FX'];
    return (
      <div className="flex flex-col space-y-1.5 p-2.5 bg-gradient-to-r from-[#1d0d1d] via-[#2b132b] to-[#1d0d1d] rounded border border-fuchsia-500/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-fuchsia-500/30">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-black text-fuchsia-300 tracking-wider">UMPF CLUB &amp; RETRO DRUM MPC</span>
              <div className="grid grid-cols-4 gap-1 mt-1">
                {umpfPads.map((lbl, idx) => {
                  const flash = audioEngine.isPlaying && audioEngine.currentStep % 8 === idx;
                  return (
                    <button
                      key={lbl}
                      onClick={() => triggerAudition(36 + idx * 2, 180)}
                      className={`px-1.5 py-0.5 rounded text-[7px] font-mono font-black border transition-all ${
                        flash
                          ? 'bg-fuchsia-400 text-slate-950 border-white shadow-[0_0_10px_#e879f9]'
                          : 'bg-slate-900 text-fuchsia-200 border-fuchsia-500/40 hover:bg-fuchsia-950'
                      }`}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
            <Knob label="PITCH" value={p.chopAmount ?? 0.45} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('chopAmount', v)} />
            <Knob label="DECAY" value={p.decay ?? 0.32} min={0.05} max={1} step={0.02} unit="s" size="sm" variant="metal" onChange={(v) => setP('decay', v)} />
            <Knob label="PAN" value={p.gatedReverb ?? 0.0} min={-1} max={1} step={0.05} size="sm" variant="white" onChange={(v) => setP('gatedReverb', v)} />
            <Knob label="LEVEL" value={p.tapeDrive ?? 0.85} min={0} max={1} step={0.02} size="sm" variant="dark" onChange={(v) => setP('tapeDrive', v)} />
          </div>
          <DeviceVisualizer device={device} width={150} height={54} />
          <button
            onClick={() => triggerAudition(36, 220)}
            className="px-3 py-2 rounded bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>HIT UMPF</span>
          </button>
        </div>
        <StepRibbon16 device={device} onUpdate={onUpdate} />
      </div>
    );
  }

  // 13. FRIKTION: Modeled Strings
  if (device.type === 'friktion') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#1f120b] via-[#2e1a10] to-[#1f120b] rounded border border-amber-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-amber-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-amber-300 tracking-wider">FRIKTION MODELED STRINGS</span>
            <div className="flex items-center space-x-1 mt-1">
              <select
                value={p.instrumentModel || 'Solo Violin'}
                onChange={(e) => setP('instrumentModel', e.target.value)}
                className="bg-slate-950 border border-amber-500/40 text-[9px] px-1.5 py-0.5 rounded font-mono text-amber-200"
              >
                <option value="Solo Violin">Solo Violin</option>
                <option value="Solo Cello">Solo Cello</option>
                <option value="Chamber Ensemble">Chamber Ensemble</option>
                <option value="Contrabass">Contrabass</option>
              </select>
              <select
                value={p.articulation || 'Sustain Arc'}
                onChange={(e) => setP('articulation', e.target.value)}
                className="bg-slate-950 border border-cyan-500/40 text-[9px] px-1.5 py-0.5 rounded font-mono text-cyan-200"
              >
                <option value="Sustain Arc">Sustain Arc</option>
                <option value="Pizzicato">Pizzicato</option>
                <option value="Staccato">Staccato</option>
                <option value="Tremolo">Tremolo</option>
              </select>
            </div>
          </div>
          <Knob label="BOW PRESS" value={p.bowPressure ?? 0.68} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('bowPressure', v)} />
          <Knob label="VIB RATE" value={p.vibratoRate ?? 5.8} min={1} max={12} step={0.2} unit="Hz" size="sm" variant="white" onChange={(v) => setP('vibratoRate', v)} />
          <Knob label="VIB DEPTH" value={p.vibratoDepth ?? 14} min={0} max={40} step={1} unit="¢" size="sm" variant="metal" onChange={(v) => setP('vibratoDepth', v)} />
          <Knob label="BODY RES" value={p.bodyResonance ?? 0.75} min={0} max={1} step={0.02} size="sm" variant="dark" onChange={(v) => setP('bodyResonance', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(64, 420)}
          className="px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>BOW NOTE</span>
        </button>
      </div>
    );
  }

  // 14. SCENIC: Hybrid Instrument
  if (device.type === 'scenic') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#091521] via-[#0e2236] to-[#091521] rounded border border-cyan-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-cyan-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-cyan-300 tracking-wider">SCENIC HYBRID INSTRUMENT</span>
            <span className="text-[8px] font-mono text-emerald-400">CINEMATIC ATMOSPHERE &bull; SHIMMER</span>
          </div>
          <Knob label="A/B BLEND" value={p.abBlend ?? 0.5} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('abBlend', v)} />
          <Knob label="BLUR" value={p.atmosphereBlur ?? 0.72} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('atmosphereBlur', v)} />
          <Knob label="SHIMMER" value={p.shimmerMix ?? 0.58} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('shimmerMix', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 3600} min={80} max={15000} step={30} unit="Hz" size="sm" variant="dark" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RELEASE" value={p.release ?? 0.95} min={0.1} max={3} step={0.05} unit="s" size="sm" variant="yellow" onChange={(v) => setP('release', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 450)}
          className="px-3 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 15. HUMANA: Vocal Ensemble Instrument
  if (device.type === 'humana') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#1a1426] via-[#261d38] to-[#1a1426] rounded border border-purple-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-purple-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-purple-300 tracking-wider">HUMANA VOCAL ENSEMBLE</span>
            <select
              value={p.choirSection || 'Cathedral Mixed Choir'}
              onChange={(e) => setP('choirSection', e.target.value)}
              className="mt-1 bg-slate-950 border border-purple-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-purple-200"
            >
              <option value="Cathedral Mixed Choir">Cathedral Mixed Choir</option>
              <option value="Soprano Soloists">Soprano Soloists</option>
              <option value="Gregorian Tenor & Bass">Gregorian Tenor &amp; Bass</option>
            </select>
          </div>
          <Knob label="BREATH AIR" value={p.breathAir ?? 0.35} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('breathAir', v)} />
          <Knob label="SPREAD" value={p.ensembleSpread ?? 0.78} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('ensembleSpread', v)} />
          <Knob label="ATTACK" value={p.attack ?? 0.1} min={0.01} max={1} step={0.01} unit="s" size="sm" variant="metal" onChange={(v) => setP('attack', v)} />
          <Knob label="RELEASE" value={p.release ?? 0.65} min={0.05} max={2.5} step={0.05} unit="s" size="sm" variant="dark" onChange={(v) => setP('release', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 400)}
          className="px-3 py-2 rounded bg-purple-500 hover:bg-purple-400 text-white font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>SING CHOIR</span>
        </button>
      </div>
    );
  }

  // 16. PANGEA: World Instrument
  if (device.type === 'pangea') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#1f160c] via-[#2e2012] to-[#1f160c] rounded border border-amber-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-amber-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-amber-300 tracking-wider">PANGEA WORLD INSTRUMENT</span>
            <select
              value={p.worldPatch || 'Anatolian Electric Saz'}
              onChange={(e) => setP('worldPatch', e.target.value)}
              className="mt-1 bg-slate-950 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-amber-200"
            >
              <option value="Anatolian Electric Saz">Anatolian Electric Saz</option>
              <option value="Andean Charango">Andean Charango</option>
              <option value="Armenian Duduk">Armenian Duduk</option>
              <option value="Arabic Fretless Oud">Arabic Fretless Oud</option>
            </select>
          </div>
          <Knob label="PLUCK" value={p.pluckAttack ?? 0.72} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('pluckAttack', v)} />
          <Knob label="TREMOLO" value={p.tremoloSpeed ?? 0.35} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('tremoloSpeed', v)} />
          <Knob label="AMBIENCE" value={p.roomAmbience ?? 0.5} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('roomAmbience', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 5100} min={100} max={15000} step={40} unit="Hz" size="sm" variant="dark" onChange={(v) => setP('cutoff', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(62, 320)}
          className="px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 17. KLANG: Tuned Percussion
  if (device.type === 'klang') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#0e1a1a] via-[#152828] to-[#0e1a1a] rounded border border-teal-400/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-teal-400/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-teal-300 tracking-wider">KLANG TUNED PERCUSSION</span>
            <select
              value={p.percussionModel || 'Orchestral Glockenspiel'}
              onChange={(e) => setP('percussionModel', e.target.value)}
              className="mt-1 bg-slate-950 border border-teal-400/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-teal-200"
            >
              <option value="Orchestral Glockenspiel">Orchestral Glockenspiel</option>
              <option value="Thumb Kalimba">Thumb Kalimba</option>
              <option value="Vintage Music Box">Vintage Music Box</option>
              <option value="Singing Wine Glass">Singing Wine Glass</option>
            </select>
          </div>
          <Knob label="MALLET" value={p.malletHardness ?? 0.75} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('malletHardness', v)} />
          <Knob label="OVERTONES" value={p.metallicOvertones ?? 0.6} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('metallicOvertones', v)} />
          <Knob label="DECAY" value={p.decay ?? 0.85} min={0.1} max={2.5} step={0.05} unit="s" size="sm" variant="metal" onChange={(v) => setP('decay', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(72, 340)}
          className="px-3 py-2 rounded bg-teal-400 hover:bg-teal-300 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>STRIKE</span>
        </button>
      </div>
    );
  }

  // 18. RADICAL PIANO / RADICAL KEYS
  if (device.type === 'radical_piano') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#171210] via-[#241b18] to-[#171210] rounded border border-amber-400/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-amber-400/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-amber-200 tracking-wider">RADICAL PIANO &amp; RADICAL KEYS</span>
            <select
              value={p.pianoModel || 'Concert Grand + Rhodes MkI'}
              onChange={(e) => setP('pianoModel', e.target.value)}
              className="mt-1 bg-slate-950 border border-amber-400/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-amber-200"
            >
              <option value="Concert Grand + Rhodes MkI">Concert Grand + Rhodes MkI</option>
              <option value="Nordic Studio Grand">Nordic Studio Grand</option>
              <option value="Suitcase Rhodes 73">Suitcase Rhodes 73</option>
              <option value="Wurlitzer 200A Reed">Wurlitzer 200A Reed</option>
            </select>
          </div>
          <Knob label="CHARACTER" value={p.character ?? 0.55} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('character', v)} />
          <Knob label="MIC BLEND" value={p.micBlend ?? 0.45} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('micBlend', v)} />
          <Knob label="HAMMER" value={p.hammerNoise ?? 0.35} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('hammerNoise', v)} />
          <Knob label="SYMP RES" value={p.sympatheticRes ?? 0.6} min={0} max={1} step={0.02} size="sm" variant="dark" onChange={(v) => setP('sympatheticRes', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 360)}
          className="px-3 py-2 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>PLAY CHORD</span>
        </button>
      </div>
    );
  }

  // 19. REASON DRUM KITS / REASON ELECTRIC BASS
  if (device.type === 'reason_performance') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#141920] via-[#1c2530] to-[#141920] rounded border border-cyan-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-cyan-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-cyan-300 tracking-wider">REASON DRUM KITS &amp; ELECTRIC BASS</span>
            <select
              value={p.performanceMode || 'Reason Electric Bass (Fender Precision)'}
              onChange={(e) => setP('performanceMode', e.target.value)}
              className="mt-1 bg-slate-950 border border-cyan-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-cyan-200"
            >
              <option value="Reason Electric Bass (Fender Precision)">Electric Bass: Fender Precision</option>
              <option value="Reason Electric Bass (Jazz Fretless)">Electric Bass: Jazz Fretless</option>
              <option value="Reason Drum Kits (Abbey Studio)">Drum Kits: Vintage Studio Kit</option>
              <option value="Reason Drum Kits (Tight Funk)">Drum Kits: Tight Funk Kit</option>
            </select>
          </div>
          <Knob label="OH MIC MIX" value={p.overheadMicMix ?? 0.55} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('overheadMicMix', v)} />
          <Knob label="AMP DRIVE" value={p.ampCabinetDrive ?? 0.4} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('ampCabinetDrive', v)} />
          <Knob label="TONE CUT" value={p.cutoff ?? 2800} min={100} max={12000} step={40} unit="Hz" size="sm" variant="white" onChange={(v) => setP('cutoff', v)} />
          <Knob label="DECAY" value={p.decay ?? 0.42} min={0.05} max={1.5} step={0.02} unit="s" size="sm" variant="dark" onChange={(v) => setP('decay', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(40, 300)}
          className="px-3 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 20. LAYERS / ID8: Sample Players & Songwriter Toolboxes
  if (device.type === 'layers_id8') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#121624] via-[#1a2036] to-[#121624] rounded border border-indigo-400/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-indigo-400/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-indigo-300 tracking-wider">LAYERS &amp; ID8 TOOLBOX</span>
            <select
              value={p.toolboxPreset || 'Layers Quad-Synth Stack'}
              onChange={(e) => setP('toolboxPreset', e.target.value)}
              className="mt-1 bg-slate-950 border border-indigo-400/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-indigo-200"
            >
              <option value="Layers Quad-Synth Stack">Layers: Quad-Wave Vintage Stack</option>
              <option value="ID8 Acoustic Grand">ID8: Songwriter Grand Piano</option>
              <option value="ID8 Vintage Strings">ID8: Orchestral Strings</option>
              <option value="ID8 Synth Brass">ID8: 80s Polysynth Brass</option>
            </select>
          </div>
          <Knob label="DETUNE" value={p.spreadDetune ?? 0.55} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('spreadDetune', v)} />
          <Knob label="CUTOFF" value={p.cutoff ?? 4500} min={80} max={16000} step={30} unit="Hz" size="sm" variant="white" onChange={(v) => setP('cutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 2.5} min={0.5} max={15} step={0.2} size="sm" variant="metal" onChange={(v) => setP('resonance', v)} />
          <Knob label="RELEASE" value={p.release ?? 0.4} min={0.05} max={2} step={0.05} unit="s" size="sm" variant="dark" onChange={(v) => setP('release', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 320)}
          className="px-3 py-2 rounded bg-indigo-500 hover:bg-indigo-400 text-white font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 21. ALLIGATOR: Three-Channel Pattern Filter (Vintage Bakelite Knobs, Tube Saturation Window, VU Meter & Gate Matrix)
  if (device.type === 'alligator') {
    const steps: boolean[] = p.gateSteps || Array(16).fill(true);
    return (
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 bg-gradient-to-r from-[#0c1d12] via-[#132b1b] to-[#0c1d12] rounded border border-emerald-500/40">
        <div className="flex items-center space-x-2">
          <VacuumTube label="GATE DRIVE" isPowered={device.isPowered} glowLevel={p.drive ?? 0.55} />
          <VuNeedleBox label="GATE VU" drive={p.drive ?? 0.55} grDb={(p.resonance ?? 5) * 0.6} />
        </div>
        <div className="flex items-center space-x-2.5 bg-black/55 p-2 rounded border border-emerald-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-emerald-300 tracking-wider">ALLIGATOR 3-CH PATTERN FILTER</span>
            <span className="text-[8px] font-mono text-cyan-400">HP &bull; BP &bull; LP TEMPO-SYNCED GATE MATRIX</span>
            <div className="flex items-center space-x-0.5 mt-1">
              {steps.map((on, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const next = [...steps];
                    next[idx] = !next[idx];
                    setP('gateSteps', next);
                  }}
                  className={`w-3.5 h-4 rounded-xs text-[7px] font-mono font-bold border ${
                    on
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : 'bg-slate-900 text-slate-500 border-slate-700'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
          <Knob label="HP FREQ" value={p.hpCutoff ?? 1800} min={200} max={8000} step={40} unit="Hz" size="sm" variant="bakelite" onChange={(v) => setP('hpCutoff', v)} />
          <Knob label="BP FREQ" value={p.bpCutoff ?? 1100} min={150} max={5000} step={30} unit="Hz" size="sm" variant="bakelite" onChange={(v) => setP('bpCutoff', v)} />
          <Knob label="RESO" value={p.resonance ?? 5.0} min={0.5} max={15} step={0.2} size="sm" variant="brass" onChange={(v) => setP('resonance', v)} />
          <Knob label="TUBE DRV" value={p.drive ?? 0.48} min={0} max={1} step={0.02} size="sm" variant="bakelite" onChange={(v) => setP('drive', v)} />
          <Knob label="MIX" value={p.mix ?? 0.85} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('mix', v)} />
        </div>
        <DeviceVisualizer device={device} width={130} height={52} />
      </div>
    );
  }

  // 22. COMBINATOR: Multi-Device Container Macro Layout
  if (device.type === 'combinator') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#0f1722] via-[#172334] to-[#0f1722] rounded border border-cyan-400/50">
        <div className="flex items-center space-x-3 bg-black/60 p-2 rounded border border-cyan-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-cyan-300 tracking-wider">COMBINATOR MACRO CONTAINER</span>
            <span className="text-[8px] font-mono text-emerald-400">{p.combiPatchName || 'Hyper-Techno SuperStack.cmb'}</span>
            <div className="flex items-center space-x-1 mt-1">
              {[1, 2, 3, 4].map((b) => {
                const key = `btn${b}Active`;
                const lbl = p[`btn${b}Name`] || `BTN ${b}`;
                return (
                  <button
                    key={b}
                    onClick={() => setP(key, !p[key])}
                    className={`px-1.5 py-0.5 rounded text-[7.5px] font-mono font-bold border ${
                      p[key]
                        ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
          <Knob label={p.rotary1Name || 'ROTARY 1'} value={p.rotary1Val ?? 0.65} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('rotary1Val', v)} />
          <Knob label={p.rotary2Name || 'ROTARY 2'} value={p.rotary2Val ?? 0.48} min={0} max={1} step={0.02} size="sm" variant="white" onChange={(v) => setP('rotary2Val', v)} />
          <Knob label={p.rotary3Name || 'ROTARY 3'} value={p.rotary3Val ?? 0.55} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('rotary3Val', v)} />
          <Knob label={p.rotary4Name || 'ROTARY 4'} value={p.rotary4Val ?? 0.4} min={0} max={1} step={0.02} size="sm" variant="dark" onChange={(v) => setP('rotary4Val', v)} />
        </div>
        <DeviceVisualizer device={device} width={140} height={54} />
        <button
          onClick={() => triggerAudition(60, 320)}
          className="px-3 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>RUN COMBI</span>
        </button>
      </div>
    );
  }

  // 23. RPG-8: Monophonic Arpeggiator
  if (device.type === 'rpg8') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#141820] via-[#1c2330] to-[#141820] rounded border border-emerald-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-emerald-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-emerald-300 tracking-wider">RPG-8 MONOPHONIC ARPEGGIATOR</span>
            <select
              value={p.arpMode || 'UP + DOWN'}
              onChange={(e) => setP('arpMode', e.target.value)}
              className="mt-1 bg-slate-950 border border-emerald-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono text-emerald-200"
            >
              <option value="UP">MODE: UP</option>
              <option value="DOWN">MODE: DOWN</option>
              <option value="UP + DOWN">MODE: UP + DOWN</option>
              <option value="RANDOM">MODE: RANDOM</option>
            </select>
          </div>
          <Knob label="OCTAVES" value={p.octaveRange ?? 3} min={1} max={4} step={1} size="sm" variant="yellow" onChange={(v) => setP('octaveRange', v)} />
          <Knob label="GATE LEN" value={p.gateLength ?? 0.65} min={0.1} max={1} step={0.05} size="sm" variant="white" onChange={(v) => setP('gateLength', v)} />
          <Knob label="VEL LOCK" value={p.velocityLock ?? 0.88} min={0.1} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('velocityLock', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
        <button
          onClick={() => triggerAudition(60, 260)}
          className="px-3 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-black text-[10px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>ARP TRIG</span>
        </button>
      </div>
    );
  }

  // 24. LINE MIXER 6:2 / 14:2 MIXER
  if (device.type === 'line_mixer') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#11151c] via-[#181f29] to-[#11151c] rounded border border-cyan-500/40">
        <div className="flex items-center space-x-2.5 bg-black/50 p-2 rounded border border-cyan-500/30">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-cyan-300 tracking-wider">LINE MIXER 6:2 / 14:2</span>
            <select
              value={p.mixerFormat || '14:2 Rack Studio Mixer'}
              onChange={(e) => setP('mixerFormat', e.target.value)}
              className="mt-1 bg-slate-950 border border-cyan-500/40 text-[9px] px-1.5 py-0.5 rounded font-mono text-cyan-200"
            >
              <option value="6:2 Micromixer">6:2 Stereo Line Mixer</option>
              <option value="14:2 Rack Studio Mixer">14:2 Rack Studio Mixer</option>
            </select>
          </div>
          <Knob label="CH 1-2" value={p.ch1Level ?? 0.85} min={0} max={1} step={0.02} size="xs" variant="white" onChange={(v) => setP('ch1Level', v)} />
          <Knob label="CH 3-4" value={p.ch2Level ?? 0.8} min={0} max={1} step={0.02} size="xs" variant="white" onChange={(v) => setP('ch2Level', v)} />
          <Knob label="CH 5-6" value={p.ch3Level ?? 0.75} min={0} max={1} step={0.02} size="xs" variant="white" onChange={(v) => setP('ch3Level', v)} />
          <Knob label="AUX SEND" value={p.auxSend1 ?? 0.45} min={0} max={1} step={0.02} size="xs" variant="yellow" onChange={(v) => setP('auxSend1', v)} />
          <Knob label="MASTER" value={p.masterLevel ?? 0.9} min={0} max={1} step={0.02} size="sm" variant="metal" onChange={(v) => setP('masterLevel', v)} />
        </div>
        <DeviceVisualizer device={device} width={150} height={54} />
      </div>
    );
  }

  // 25. OUTBOARD EFFECTS & MASTERING UNITS (Pulveriser, RV-9, Ripley, Osmium, BV-X, Neptune, Quartet, Sweeper, Audiomatic, Rotor, Softube Amp, MIDI Out)
  // Bespoke Vintage Bakelite Knobs, Glowing Vacuum-Tube Saturation Windows, Dual-Needle VU Meters & Tempo-Synced Delay/Gate Matrix Toggles
  const fxMeta: Record<
    string,
    {
      title: string;
      subtitle: string;
      border: string;
      knobs: [string, string, string, string, string];
    }
  > = {
    pulveriser: {
      title: 'PULVERISER DEMOLITION COMPRESSOR',
      subtitle: 'OPTICAL SQUASH &bull; TUBE DIRT &bull; TREMOR FILTER',
      border: 'border-amber-500/50',
      knobs: ['SQUASH', 'DIRT DRIVE', 'FILTER', 'TREMOR', 'PARALLEL'],
    },
    rv9: {
      title: 'RV-9 CONVOLUTION REVERB STATION',
      subtitle: 'SHIMMER &bull; VORTEX &bull; HALL CONVOLUTION',
      border: 'border-cyan-500/40',
      knobs: ['SHIMMER', 'HIGH DAMP', 'DIFFUSION', 'DECAY', 'WET MIX'],
    },
    ripley: {
      title: 'RIPLEY SPACE DELAY &amp; REVERB',
      subtitle: 'TAPE WOBBLE &bull; DUCKER &bull; BITCRUSH',
      border: 'border-teal-500/40',
      knobs: ['WOBBLE', 'FILTER', 'FEEDBACK', 'SPACE', 'WET MIX'],
    },
    osmium: {
      title: 'OSMIUM TUBE &amp; WAVEFOLD MATRIX',
      subtitle: 'MULTIBAND TRIODE / WAVEFOLD / FUZZ',
      border: 'border-rose-500/40',
      knobs: ['BIAS DRV', 'CROSSOVER', 'WAVEFOLD', 'SAG', 'OUTPUT'],
    },
    bvx_vocoder: {
      title: 'BV-X / BV512 FFT VOCODER',
      subtitle: '512-BAND FFT &amp; 32-BAND VINTAGE CARRIER',
      border: 'border-orange-500/40',
      knobs: ['CARRIER', 'FORMANT', 'UNVOICED', 'DECAY', 'BLEND'],
    },
    neptune: {
      title: 'NEPTUNE PITCH &amp; VOICE SYNTH',
      subtitle: 'LIVE AUTO-PITCH &bull; FORMANT &bull; HARMONIZER',
      border: 'border-sky-500/40',
      knobs: ['CORRECT', 'FORMANT', 'VIBRATO', 'HARMONY', 'SYNTH MIX'],
    },
    quartet: {
      title: 'QUARTET 4-VOICE CHORUS ENSEMBLE',
      subtitle: 'BBD &bull; FFT &bull; GRANULAR ENSEMBLE',
      border: 'border-indigo-500/40',
      knobs: ['DEPTH', 'WIDTH', 'DELAY', 'MOD RATE', 'ENSEMBLE'],
    },
    sweeper: {
      title: 'SWEEPER DYNAMIC PHASER &amp; FLANGER',
      subtitle: 'ENVELOPE FOLLOWER &bull; HARMONIC SWEEP',
      border: 'border-emerald-500/40',
      knobs: ['ENV SENS', 'CENTER HZ', 'SPREAD', 'LFO RATE', 'DEPTH'],
    },
    audiomatic: {
      title: 'AUDIOMATIC RETRO TRANSFORMER',
      subtitle: 'TAPE &bull; VINYL &bull; VHS &bull; CIRCUIT TRANSFORM',
      border: 'border-amber-400/40',
      knobs: ['TRANSFORM', 'BRIGHT', 'WEAR', 'SATURATE', 'DRY / WET'],
    },
    rotor: {
      title: 'ROTOR LESLIE SPEAKER EMULATION',
      subtitle: 'DOPPLER HORN/DRUM &bull; TUBE OVERDRIVE',
      border: 'border-yellow-500/40',
      knobs: ['TUBE DRV', 'HORN BAL', 'DOPPLER', 'SPIN SPD', 'MIC DIST'],
    },
    softube_amp: {
      title: 'SOFTUBE VALVE GUITAR &amp; BASS AMP',
      subtitle: 'EL34 VALVE HEAD &bull; 4x12 / 8x10 CABINET',
      border: 'border-red-500/40',
      knobs: ['PRE GAIN', 'CAB TONE', 'PRESENCE', 'ROOM AIR', 'MASTER'],
    },
    midi_out: {
      title: 'MIDI OUT EXTERNAL HARDWARE MODULE',
      subtitle: '16-CH WEBMIDI &bull; 8 CC ASSIGNABLE KNOBS',
      border: 'border-cyan-500/40',
      knobs: ['CC 1', 'CC 74', 'CC 71', 'CC 91', 'VELOCITY'],
    },
  };

  const meta = fxMeta[device.type] || {
    title: device.name.toUpperCase(),
    subtitle: 'VINTAGE OUTBOARD TUBE &amp; MATRIX PROCESSOR',
    border: 'border-amber-500/40',
    knobs: ['TUBE DRV', 'TONE HZ', 'CHARACTER', 'SYNC AMT', 'WET MIX'],
  };

  const driveVal = p.drive ?? 0.55;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2.5 p-2.5 bg-gradient-to-r from-[#17120d] via-[#221a12] to-[#17120d] rounded border ${meta.border}`}>
      <div className="flex items-center space-x-2">
        <VacuumTube label="SAT TUBE" isPowered={device.isPowered} glowLevel={driveVal} />
        <VuNeedleBox label="OUTBOARD VU" drive={driveVal} grDb={driveVal * 8.5} />
      </div>

      <div className="flex items-center space-x-2.5 bg-black/55 p-2 rounded border border-amber-700/35 shadow-inner">
        <div className="flex flex-col space-y-1">
          <span className="text-[9.5px] font-mono font-black text-amber-200 tracking-wider" dangerouslySetInnerHTML={{ __html: meta.title }} />
          <span className="text-[7.5px] font-mono text-amber-400/90" dangerouslySetInnerHTML={{ __html: meta.subtitle }} />
          <div className="flex items-center space-x-1 pt-0.5">
            {['1/16', '1/8D', '1/4', 'GATE'].map((div) => (
              <button
                key={div}
                onClick={() => setP('syncMode', div)}
                className={`px-1.5 py-0.5 rounded text-[7px] font-mono font-bold border ${
                  (p.syncMode || '1/8D') === div
                    ? 'bg-amber-500 text-slate-950 border-amber-300'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white'
                }`}
              >
                {div}
              </button>
            ))}
          </div>
        </div>
        <Knob label={meta.knobs[0]} value={p.drive ?? 0.55} min={0} max={1} step={0.02} size="sm" variant="bakelite" onChange={(v) => setP('drive', v)} />
        <Knob label={meta.knobs[1]} value={p.cutoff ?? 4200} min={100} max={16000} step={40} unit="Hz" size="sm" variant="bakelite" onChange={(v) => setP('cutoff', v)} />
        <Knob label={meta.knobs[2]} value={p.resonance ?? 3.2} min={0.5} max={15} step={0.2} size="sm" variant="brass" onChange={(v) => setP('resonance', v)} />
        <Knob label={meta.knobs[3]} value={p.feedback ?? 0.35} min={0} max={0.9} step={0.02} size="sm" variant="bakelite" onChange={(v) => setP('feedback', v)} />
        <Knob label={meta.knobs[4]} value={p.mix ?? 0.65} min={0} max={1} step={0.02} size="sm" variant="yellow" onChange={(v) => setP('mix', v)} />
      </div>

      <DeviceVisualizer device={device} width={135} height={52} />
    </div>
  );
};
