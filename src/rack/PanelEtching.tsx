import React from 'react';

/**
 * Low-contrast panel artwork for the sparse legacy faceplates. These are printed diagrams,
 * not controls: they sit behind the panel content, never intercept pointers, and use the
 * family accent so the drawing belongs to the unit rather than the cabinet.
 */
const LEGACY_MOTIF: Record<string, string> = {
  rv7000: 'reverb',
  echo: 'delay',
  redrum: 'drums',
  subtractor: 'synth',
  thor: 'synth',
  europa: 'synth',
  malstrom: 'synth',
  mclass_master: 'dynamics',
  mclass_compressor: 'dynamics',
  la2a: 'dynamics',
  ua1176: 'dynamics',
  pulveriser: 'drive',
  scream: 'drive',
  neptune: 'voice',
  matrix: 'matrix',
  kong: 'drums',
  mimic: 'sampler',
  nn19: 'sampler',
  nnxt: 'sampler',
};

const motifFor = (type: string, engine?: string): string => {
  if (engine === 'delay' || engine === 'timeFX') return 'delay';
  if (engine === 'reverb') return 'reverb';
  if (engine === 'drums' || engine === 'groove') return 'drums';
  if (engine === 'sampler' || engine === 'multisample' || engine === 'granular' || engine === 'loops') return 'sampler';
  if (engine === 'dynamics' || engine === 'stereo') return 'dynamics';
  if (engine === 'distortion') return 'drive';
  if (engine === 'modulation' || engine === 'timed') return 'modulation';
  if (engine === 'vocoder' || engine === 'pitch' || engine === 'pitchCorrect') return 'voice';
  if (engine === 'eq' || engine === 'filter') return 'eq';
  if (engine === 'poly' || engine === 'wavetable' || engine === 'fm' || engine === 'westcoast' || engine === 'modal' || engine === 'karplus') return 'synth';
  return LEGACY_MOTIF[type] ?? 'grid';
};

const ReverbField: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1">
    <path d="M214 92c0-23-19-42-42-42S130 69 130 92" />
    <path d="M214 92c0-38-31-69-69-69S76 54 76 92" opacity=".72" />
    <path d="M214 92c0-54-44-98-98-98S18 38 18 92" opacity=".4" />
    {[-70, -50, -30, -10, 10, 30, 50, 70].map((angle) => {
      const rad = ((angle - 90) * Math.PI) / 180;
      return (
        <line
          key={angle}
          x1={166}
          y1={92}
          x2={166 + Math.cos(rad) * 42}
          y2={92 + Math.sin(rad) * 42}
          opacity=".35"
          strokeDasharray="2 4"
        />
      );
    })}
    <circle cx="166" cy="92" r="3" fill={ink} stroke="none" />
  </g>
);

const EchoTaps: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1">
    <path d="M8 58h204" opacity=".35" />
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const x = 24 + i * 32;
      const h = 34 - i * 4.5;
      return (
        <g key={i} opacity={1 - i * 0.1}>
          <path d={`M${x} 58c4-${h} 10-${h} 14 0`} strokeDasharray={i === 5 ? '2 3' : undefined} />
          <circle cx={x + 7} cy={58 - h} r="1.5" fill={ink} stroke="none" opacity=".7" />
        </g>
      );
    })}
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <line key={i} x1={31 + i * 32} y1="62" x2={31 + i * 32} y2="68" opacity=".35" />
    ))}
  </g>
);

const DrumGrid: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1">
    {[0, 1, 2, 3].map((row) =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((col) => (
        <rect
          key={`${row}-${col}`}
          x={26 + col * 19}
          y={36 + row * 13}
          width="7"
          height="4"
          rx="1"
          opacity={(row + col) % 4 === 0 ? '.8' : '.34'}
          fill={(row + col) % 4 === 0 ? ink : 'none'}
        />
      )),
    )}
    <path d="M20 32h150M20 82h150" opacity=".3" />
  </g>
);

const SynthWaves: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1.1">
    <path d="M8 30c8-16 16-16 24 0s16 16 24 0 16-16 24 0 16 16 24 0 16-16 24 0 16 16 24 0 16-16 24 0" opacity=".8" />
    <path d="M8 50l12-12 12 24 12-24 12 24 12-24 12 24 12-24 12 24 12-24 12 24 12-24 12 24 12-24 12 24 12-24" opacity=".45" />
    <path d="M8 72c0-18 12-18 12 0V54c0-18 12-18 12 0v18c0-18 12-18 12 0V54c0-18 12-18 12 0v18c0-18 12-18 12 0V54c0-18 12-18 12 0v18" opacity=".3" />
  </g>
);

const DynamicsCurve: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1">
    <path d="M18 82h184M18 82V14" opacity=".4" />
    <path d="M18 82L198 18" opacity=".25" strokeDasharray="3 4" />
    <path d="M18 76c50 0 66-9 78-24s26-22 68-22" strokeWidth="1.5" />
    <path d="M18 82c58 0 88-10 112-32s40-18 68-18" opacity=".45" strokeDasharray="2 3" />
    <circle cx="112" cy="45" r="2.2" fill={ink} stroke="none" />
  </g>
);

const EqCurve: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1">
    {[34, 70, 106, 142, 178].map((x) => (
      <line key={x} x1={x} y1="18" x2={x} y2="78" opacity=".3" />
    ))}
    <path d="M12 62c22 0 28-38 48-38s22 42 42 42 30-32 48-32 24 14 54 14" strokeWidth="1.5" />
    <circle cx="60" cy="24" r="2" fill={ink} stroke="none" />
    <circle cx="102" cy="66" r="2" fill={ink} stroke="none" />
    <circle cx="150" cy="34" r="2" fill={ink} stroke="none" />
  </g>
);

const SamplerWave: React.FC<{ ink: string }> = ({ ink }) => {
  const bars = [18, 30, 22, 44, 38, 54, 26, 48, 34, 58, 28, 42, 20, 36, 26, 50, 30, 40];
  return (
    <g stroke={ink} fill="none" strokeWidth="1">
      {bars.map((h, i) => (
        <line key={i} x1={16 + i * 10} y1={46 - h / 2} x2={16 + i * 10} y2={46 + h / 2} opacity={i % 4 === 0 ? '.8' : '.45'} />
      ))}
      <path d="M10 74h196" opacity=".3" />
    </g>
  );
};

const ModulationWaves: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1">
    <path d="M8 38c12-24 24-24 36 0s24 24 36 0 24-24 36 0 24 24 36 0 24-24 36 0" strokeWidth="1.4" />
    <path d="M8 62c12-24 24-24 36 0s24 24 36 0 24-24 36 0 24 24 36 0 24-24 36 0" opacity=".4" />
    {[8, 44, 80, 116, 152, 188].map((x) => (
      <line key={x} x1={x} y1="22" x2={x} y2="78" opacity=".22" strokeDasharray="1 4" />
    ))}
  </g>
);

const DriveWave: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1.1">
    <path d="M8 46c10-18 20-18 30 0s20 18 30 0 20-18 30 0 20 18 30 0 20-18 30 0 20 18 30 0" opacity=".55" />
    <path d="M8 46h40l8-24h10l8 48h10l8-24h120" strokeWidth="1.4" />
  </g>
);

const VoiceWave: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1">
    {[20, 34, 48, 62, 76, 90, 104, 118, 132, 146, 160, 174, 188].map((x, i) => (
      <line key={x} x1={x} y1={46 - (18 + (i % 5) * 8)} x2={x} y2={46 + (18 + (i % 3) * 8)} opacity={i % 3 === 0 ? '.9' : '.45'} />
    ))}
    <path d="M8 46h204" opacity=".35" />
  </g>
);

const DefaultGrid: React.FC<{ ink: string }> = ({ ink }) => (
  <g stroke={ink} fill="none" strokeWidth="1">
    {[28, 56, 84, 112, 140, 168, 196].map((x) => (
      <line key={x} x1={x} y1="12" x2={x} y2="82" opacity=".24" />
    ))}
    {[24, 44, 64].map((y) => (
      <line key={y} x1="8" y1={y} x2="212" y2={y} opacity=".24" />
    ))}
    <path d="M8 82L212 12" opacity=".5" />
    <circle cx="166" cy="46" r="17" opacity=".7" />
    <circle cx="166" cy="46" r="10" opacity=".4" />
  </g>
);

export const PanelEtching: React.FC<{ type: string; engine?: string; accent: string; className?: string }> = ({ type, engine, accent, className }) => {
  const motif = motifFor(type, engine);
  const ink = accent;
  return (
    <svg
      viewBox="0 0 220 100"
      preserveAspectRatio="xMaxYMax meet"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {motif === 'reverb' && <ReverbField ink={ink} />}
      {motif === 'delay' && <EchoTaps ink={ink} />}
      {motif === 'drums' && <DrumGrid ink={ink} />}
      {motif === 'synth' && <SynthWaves ink={ink} />}
      {motif === 'dynamics' && <DynamicsCurve ink={ink} />}
      {motif === 'eq' && <EqCurve ink={ink} />}
      {motif === 'sampler' && <SamplerWave ink={ink} />}
      {motif === 'modulation' && <ModulationWaves ink={ink} />}
      {motif === 'drive' && <DriveWave ink={ink} />}
      {motif === 'voice' && <VoiceWave ink={ink} />}
      {motif === 'grid' && <DefaultGrid ink={ink} />}
    </svg>
  );
};
