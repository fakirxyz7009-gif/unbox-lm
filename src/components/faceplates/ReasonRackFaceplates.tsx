import React from 'react';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { Knob } from '../Knob.tsx';
import { VacuumTube } from '../VacuumTube.tsx';
import { DeviceVisualizer } from '../visualizers/DeviceVisualizer.tsx';
import { Play } from 'lucide-react';

interface ReasonRackFaceplateProps {
  device: BaseDevice;
  onUpdate: () => void;
}


const VuNeedleBox: React.FC<{ label: string; drive: number; grDb: number }> = ({ label, drive, grDb }) => {
  const inAngle = -38 + Math.min(1, Math.max(0, drive)) * 76;
  const grAngle = 38 - Math.min(1, Math.max(0, grDb / 12)) * 76;
  return (
    <div className="flex flex-col items-center bg-gradient-to-b from-[#2b1f11] to-[#171008] p-1.5 rounded border border-amber-600/50 shadow-[inset_0_2px_10px_rgba(0,0,0,0.9)]">
      <span className="text-[11px] font-mono font-black tracking-widest text-amber-300 uppercase mb-0.5">{label}</span>
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

  // 6. OBJEKT: Physical Modeling Synthesizer
  if (device.type === 'objekt') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#14181d] via-[#1c222b] to-[#14181d] rounded border border-cyan-500/40">
        <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-cyan-500/30">
          <div className="flex flex-col">
            <span className="text-[11px] font-mono font-black text-cyan-300 tracking-wider">BODYWORK PHYSICAL MODELING</span>
            <span className="text-[11px] font-mono text-emerald-400">EXCITER &bull; 3 MODAL RESONATORS</span>
            <select
              value={p.modalObject || 'Hollow Steel Plate'}
              onChange={(e) => setP('modalObject', e.target.value)}
              className="mt-1 bg-slate-950 border border-cyan-500/40 text-[11px] px-1.5 py-0.5 rounded font-mono text-cyan-200"
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
          className="px-3 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-[11px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
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
            <span className="text-[11px] font-mono font-black text-cyan-300 tracking-wider">SESSION DRUM KITS &amp; ELECTRIC BASS</span>
            <select
              value={p.performanceMode || 'Reason Electric Bass (Fender Precision)'}
              onChange={(e) => setP('performanceMode', e.target.value)}
              className="mt-1 bg-slate-950 border border-cyan-500/40 text-[11px] px-1.5 py-0.5 rounded font-mono text-cyan-200"
            >
              <option value="Reason Electric Bass (Fender Precision)">Electric Bass: P-Style</option>
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
          className="px-3 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-[11px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>AUDITION</span>
        </button>
      </div>
    );
  }

  // 22. COMBINATOR: Multi-Device Container Macro Layout
  if (device.type === 'combinator') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-gradient-to-r from-[#0f1722] via-[#172334] to-[#0f1722] rounded border border-cyan-400/50">
        <div className="flex items-center space-x-3 bg-black/60 p-2 rounded border border-cyan-500/30">
          <div className="flex flex-col">
            <span className="text-[11px] font-mono font-black text-cyan-300 tracking-wider">COMBINER MACRO CONTAINER</span>
            <span className="text-[11px] font-mono text-emerald-400">{p.combiPatchName || 'Hyper-Techno SuperStack.cmb'}</span>
            <div className="flex items-center space-x-1 mt-1">
              {[1, 2, 3, 4].map((b) => {
                const key = `btn${b}Active`;
                const lbl = p[`btn${b}Name`] || `BTN ${b}`;
                return (
                  <button
                    key={b}
                    onClick={() => setP(key, !p[key])}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold border ${
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
          className="px-3 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-[11px] flex items-center space-x-1"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>RUN COMBI</span>
        </button>
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
      title: 'FLAGSTONE CONVOLUTION REVERB',
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
          <span className="text-[11px] font-mono font-black text-amber-200 tracking-wider" dangerouslySetInnerHTML={{ __html: meta.title }} />
          <span className="text-[11px] font-mono text-amber-400/90" dangerouslySetInnerHTML={{ __html: meta.subtitle }} />
          <div className="flex items-center space-x-1 pt-0.5">
            {['1/16', '1/8D', '1/4', 'GATE'].map((div) => (
              <button
                key={div}
                onClick={() => setP('syncMode', div)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold border ${
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
