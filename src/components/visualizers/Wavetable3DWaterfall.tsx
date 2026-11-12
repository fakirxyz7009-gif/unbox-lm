import React, { useRef, useEffect } from 'react';
import { useOnScreen } from '../../ui/skin/useOnScreen.ts';
import { meterDue } from '../../nexa/useEngine.ts';

interface Wavetable3DWaterfallProps {
  waveType: string;
  tableIndex: number;
  activeWave: number;
  waveFlow: number;
  isHighPower: boolean;
  analyser?: AnalyserNode;
}

export const Wavetable3DWaterfall: React.FC<Wavetable3DWaterfallProps> = ({
  waveType,
  tableIndex,
  activeWave,
  waveFlow,
  isHighPower,
  analyser,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onScreen = useOnScreen(canvasRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;
    const numSlices = isHighPower ? 16 : 10;
    const pointsPerSlice = isHighPower ? 64 : 40;

    const timeDomainData = new Uint8Array(analyser ? analyser.fftSize : 128);

    const render = (now: number) => {
      // off screen (a scrolled-away rack unit), or drawn less than ~33 ms ago: nothing to draw
      if (!onScreen.current || !meterDue(now)) {
        animId = requestAnimationFrame(render);
        return;
      }
      phase += 0.035;
      const width = canvas.width;
      const height = canvas.height;

      // Dark translucent clear for subtle motion persistence trail
      ctx.fillStyle = 'rgba(2, 8, 16, 0.45)';
      ctx.fillRect(0, 0, width, height);

      let audioEnergy = 0;
      if (analyser) {
        analyser.getByteTimeDomainData(timeDomainData);
        for (let i = 0; i < timeDomainData.length; i += 4) {
          audioEnergy += Math.abs(timeDomainData[i] - 128);
        }
        audioEnergy = (audioEnergy / (timeDomainData.length / 4)) / 128; // 0 to 1
      }

      // 3D Isometric projection parameters
      const originX = width * 0.12;
      const originY = height * 0.72;
      const sliceWidth = width * 0.65;
      const depthStepX = (width * 0.22) / numSlices;
      const depthStepY = (height * 0.48) / numSlices;

      const activeSliceIndex = Math.min(
        numSlices - 1,
        Math.max(0, Math.floor((activeWave / 63) * numSlices))
      );

      // Render slices back-to-front for proper 3D occlusion
      for (let s = numSlices - 1; s >= 0; s--) {
        const sliceRatio = s / (numSlices - 1);
        const isActive = s === activeSliceIndex;
        const startX = originX + s * depthStepX;
        const startY = originY - s * depthStepY;

        ctx.beginPath();

        for (let p = 0; p <= pointsPerSlice; p++) {
          const t = (p / pointsPerSlice) * Math.PI * 2;
          const x = startX + (p / pointsPerSlice) * sliceWidth;

          // Synthesize height profile based on slice position and wave harmonics
          let yNorm = 0;
          if (waveType === 'a') {
            if (tableIndex === 0) {
              // Saw
              yNorm = ((p % pointsPerSlice) / pointsPerSlice) * 2 - 1;
            } else if (tableIndex === 1) {
              // Square
              yNorm = (p / pointsPerSlice) < 0.5 ? 0.8 : -0.8;
            } else if (tableIndex === 2) {
              // Triangle
              yNorm = 1 - 4 * Math.abs(Math.round(p / pointsPerSlice - 0.25) - (p / pointsPerSlice - 0.25));
            } else {
              // Sine
              yNorm = Math.sin(t);
            }
          } else {
            // Wavetable interpolation
            const morph = sliceRatio;
            const h1 = Math.sin(t);
            const h2 = Math.sin(t * 2 + morph * 2) * (0.35 + morph * 0.3);
            const h3 = Math.sin(t * 3) * (0.2 + morph * 0.4);
            const h4 = Math.sin(t * 5 + phase) * (audioEnergy * 0.35);
            yNorm = (h1 + h2 + h3 + h4) * 0.7;
          }

          const ampScale = 22 + audioEnergy * 10;
          const y = startY - yNorm * ampScale;

          if (p === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        if (isActive) {
          // Highlight Active Wave Slice in Electric Cyan/Gold
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.6;
          ctx.shadowColor = '#00f5d4';
          ctx.shadowBlur = 12;
          ctx.stroke();

          // Fill underneath active slice
          ctx.lineTo(startX + sliceWidth, startY);
          ctx.lineTo(startX, startY);
          ctx.closePath();
          ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
          ctx.fill();
        } else {
          // Background 3D grid slices
          const alpha = 0.25 + (1 - sliceRatio) * 0.45;
          ctx.strokeStyle = `rgba(14, 165, 233, ${alpha})`;
          ctx.lineWidth = 1.0;
          ctx.shadowBlur = 0;
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [waveType, tableIndex, activeWave, waveFlow, isHighPower, analyser]);

  return (
    <div className="relative w-full h-full bg-[#020810] rounded overflow-hidden border border-cyan-800/60 shadow-inner flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={380}
        height={90}
        className="w-full h-full block"
      />
      {/* 3D HUD Stamp */}
      <div className="absolute top-1 right-2 flex items-center space-x-1.5 text-[11px] font-mono text-cyan-400/80 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        <span>3D WATERFALL MESH (64 FRAMES)</span>
      </div>
    </div>
  );
};

