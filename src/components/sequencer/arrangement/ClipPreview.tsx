/**
 * Mini note view inside an arrangement clip. One pass of the content is drawn once as an SVG
 * <pattern> tile and repeated across the clip, so very long clips cost nothing extra.
 */
import React from 'react';
import type { ArrangementClip, SequencerPattern } from '../../../audio/types.ts';
import { TICKS_PER_16TH, divisionTicks, patternLength16ths } from '../../../audio/sequencer/model.ts';
import { patternToRoll } from '../pianoRoll/rollAdapters.ts';

interface Props {
  clip: ArrangementClip;
  pattern?: SequencerPattern;
  barPx: number;
  spb: number;
  width: number;
  height: number;
  color: string;
}

interface Dash {
  x: number;
  w: number;
  note: number;
}

const MAX_DASHES = 600;

export const ClipPreview: React.FC<Props> = ({ clip, pattern, barPx, spb, width, height, color }) => {
  const px16 = barPx / spb;
  let dashes: Dash[] = [];
  let tileW = 0;
  let offsetPx = (clip.offsetSteps || 0) * px16;

  if (clip.kind === 'notes') {
    const notes = clip.notes || [];
    if (clip.loopBars && clip.loopBars > 0) {
      tileW = clip.loopBars * barPx;
      const loop16 = clip.loopBars * spb;
      dashes = notes.filter((n) => n.step < loop16).map((n) => ({ x: n.step * px16, w: Math.max(1, n.length * px16 - 0.5), note: n.note }));
    } else {
      dashes = notes.map((n) => ({ x: n.step * px16 - offsetPx, w: Math.max(1, n.length * px16 - 0.5), note: n.note }));
      offsetPx = 0;
    }
  } else if (pattern) {
    const stepPx = (divisionTicks(pattern.division) / TICKS_PER_16TH) * px16;
    tileW = patternLength16ths(pattern) * px16;
    dashes = patternToRoll(pattern.steps).map((n) => ({ x: n.step * stepPx, w: Math.max(1, n.length * stepPx - 0.5), note: n.note }));
  }
  if (!dashes.length || height < 10 || (tileW > 0 && tileW < 2)) return null;
  if (dashes.length > MAX_DASHES) dashes = dashes.slice(0, MAX_DASHES);

  let lo = 127;
  let hi = 0;
  for (const d of dashes) {
    lo = Math.min(lo, d.note);
    hi = Math.max(hi, d.note);
  }
  const span = Math.max(6, hi - lo + 1);
  const rowH = Math.max(1, Math.min(4, (height - 4) / span));
  const yOf = (note: number) => 2 + (hi - note) * ((height - 4 - rowH) / Math.max(1, span - 1));
  const rects = dashes.map((d, i) => <rect key={i} x={d.x} y={yOf(d.note)} width={d.w} height={rowH} rx={0.5} />);
  const id = `pv-${clip.id}`;

  return (
    <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden="true">
      {tileW > 0 ? (
        <>
          <defs>
            <pattern id={id} patternUnits="userSpaceOnUse" width={tileW} height={height} x={-offsetPx} y={0}>
              <g fill={color} fillOpacity={0.9}>
                {rects}
              </g>
            </pattern>
          </defs>
          <rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
        </>
      ) : (
        <g fill={color} fillOpacity={0.9}>
          {rects}
        </g>
      )}
    </svg>
  );
};
