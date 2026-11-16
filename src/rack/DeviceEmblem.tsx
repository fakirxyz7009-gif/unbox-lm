import React from 'react';
import type { EngineId } from '../../shared/rack/devices/types.ts';
import type { DeviceFamily } from './deviceIdentity.ts';
import { faceSignatureForSpec } from '../ui/skin/facePalette.ts';

type Glyph = 'synth' | 'sample' | 'rhythm' | 'dynamics' | 'eq' | 'drive' | 'space' | 'mod' | 'voice' | 'routing' | 'player' | 'core';

const glyphFor = (engine: EngineId | undefined): Glyph => {
  switch (engine) {
    case 'poly':
    case 'wavetable':
    case 'fm':
    case 'westcoast':
    case 'modal':
    case 'karplus':
    case 'formant':
    case 'bowed':
      return 'synth';
    case 'sampler':
    case 'multisample':
    case 'granular':
    case 'loops':
      return 'sample';
    case 'drums':
    case 'groove':
      return 'rhythm';
    case 'dynamics':
    case 'stereo':
      return 'dynamics';
    case 'eq':
    case 'filter':
      return 'eq';
    case 'distortion':
      return 'drive';
    case 'delay':
    case 'reverb':
      return 'space';
    case 'modulation':
    case 'timed':
      return 'mod';
    case 'vocoder':
    case 'pitch':
    case 'pitchCorrect':
      return 'voice';
    case 'mixer':
    case 'di':
    case 'patchbay':
      return 'routing';
    case 'player':
      return 'player';
    default:
      return 'core';
  }
};

const GlyphMark: React.FC<{ glyph: Glyph; color: string }> = ({ glyph, color }) => {
  switch (glyph) {
    case 'synth':
      return <path d="M9 24l4-9 4 9 4-9 4 9 4-9" />;
    case 'sample':
      return (
        <>
          <path d="M10 24v-5M13.5 26V14M17 22v-4M20.5 25V16M24 23v-6M27.5 26V13M31 21v-2" />
        </>
      );
    case 'rhythm':
      return (
        <>
          <rect x="10" y="15" width="5" height="5" rx=".5" />
          <rect x="17" y="15" width="5" height="5" rx=".5" />
          <rect x="24" y="15" width="5" height="5" rx=".5" />
          <rect x="10" y="22" width="5" height="5" rx=".5" />
          <rect x="17" y="22" width="5" height="5" rx=".5" />
          <rect x="24" y="22" width="5" height="5" rx=".5" />
        </>
      );
    case 'dynamics':
      return (
        <>
          <path d="M10 25a10 10 0 0 1 20 0" />
          <path d="M20 25l6-8" />
          <circle cx="20" cy="25" r="1.6" fill={color} stroke="none" />
        </>
      );
    case 'eq':
      return (
        <>
          <path d="M10 24c4 0 4-9 8-9s5 7 9 5 4 1 4 1" />
          <circle cx="18" cy="15" r="1.4" fill={color} stroke="none" />
          <circle cx="27" cy="20" r="1.4" fill={color} stroke="none" />
        </>
      );
    case 'drive':
      return <path d="M10 24h5v-8h6v8h5v-8h4" />;
    case 'space':
      return (
        <>
          <path d="M12 24a8 8 0 0 1 16 0" />
          <path d="M15.5 24a4.5 4.5 0 0 1 9 0" />
          <circle cx="20" cy="24" r="1.3" fill={color} stroke="none" />
        </>
      );
    case 'mod':
      return (
        <>
          <path d="M9 18c3-7 6-7 9 0s6 7 9 0" />
          <path d="M9 24c3-7 6-7 9 0s6 7 9 0" opacity=".55" />
        </>
      );
    case 'voice':
      return <path d="M11 25v-5M14 27V15M17 24v-7M20 28V12M23 24v-7M26 27V15M29 25v-5" />;
    case 'routing':
      return (
        <>
          <circle cx="14" cy="16" r="3" />
          <circle cx="26" cy="24" r="3" />
          <path d="M17 18c5 1 4 4 6 4" />
          <circle cx="14" cy="16" r=".9" fill={color} stroke="none" />
          <circle cx="26" cy="24" r=".9" fill={color} stroke="none" />
        </>
      );
    case 'player':
      return (
        <>
          <path d="M15 13l12 7-12 7z" />
          <path d="M10 12v16" opacity=".55" />
        </>
      );
    default:
      return (
        <>
          <path d="M20 10l10 10-10 10-10-10z" />
          <path d="M13 20l4 4 10-10" />
        </>
      );
  }
};

/** Octagonal model crest: gold bezel, family-coloured ring and an engine-specific mark. */
export function DeviceEmblem({
  engine,
  family,
  size = 20,
  className,
}: {
  engine?: EngineId;
  family: DeviceFamily;
  size?: number;
  className?: string;
}) {
  const ink = faceSignatureForSpec(engine, family).accent;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 1.8 36 10.5v19L20 38.2 4 29.5v-19Z" fill="#101214" stroke="#8e7c60" strokeWidth="1.1" />
      <path d="M20 5.2 33 12.35v15.3L20 34.8 7 27.65v-15.3Z" fill="none" stroke={ink} strokeWidth=".7" opacity=".38" />
      <g stroke={ink} fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <GlyphMark glyph={glyphFor(engine)} color={ink} />
      </g>
      <circle cx="32.2" cy="7.4" r="1.55" fill={ink} />
    </svg>
  );
}

/** Titlebar seal, a larger version of the crest used as the range's signature. */
export function UnboxSeal({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M20 1.8 36 10.5v19L20 38.2 4 29.5v-19Z" fill="#101214" stroke="#b08a5e" strokeWidth="1.2" />
      <path d="M20 6 31.5 12.4v13.2L20 33 8.5 25.6V12.4Z" fill="none" stroke="#c99561" strokeWidth=".8" opacity=".55" />
      <path d="M14 13v8a6 6 0 0 0 12 0v-8" fill="none" stroke="#d9b183" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 13h8M22 13h8" stroke="#c99561" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="20" cy="29.5" r="1.4" fill="#c99561" />
    </svg>
  );
}
