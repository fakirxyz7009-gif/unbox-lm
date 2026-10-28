import React, { useRef, useEffect } from 'react';

interface StereoGoniometerProps {
  analyser?: AnalyserNode;
  panSpread: number;
}

export const StereoGoniometer: React.FC<StereoGoniometerProps> = ({ analyser, panSpread }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;
    const buffer = new Uint8Array(analyser ? analyser.fftSize : 128);

    const render = () => {
      t += 0.05;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // Subtle phosphor decay persistence
      ctx.fillStyle = 'rgba(2, 8, 16, 0.35)';
      ctx.fillRect(0, 0, w, h);

      // Polar grid
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.18)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.42, 0, Math.PI * 2);
      ctx.moveTo(cx, 4);
      ctx.lineTo(cx, h - 4);
      ctx.moveTo(4, cy);
      ctx.lineTo(w - 4, cy);
      ctx.stroke();

      let energy = 0.2;
      if (analyser) {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += Math.abs(buffer[i] - 128);
        }
        energy = Math.max(0.1, (sum / buffer.length) / 128 * 2.5);
      }

      // Draw Lissajous Stereo Pattern
      const spreadNorm = (panSpread || 75) / 100;
      const numPts = 64;
      ctx.beginPath();
      ctx.strokeStyle = '#22d3ee';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.6;

      for (let i = 0; i <= numPts; i++) {
        const angle = (i / numPts) * Math.PI * 2;
        // Phase modulation influenced by pan spread and audio energy
        const left = Math.sin(angle * 2 + t) * energy;
        const right = Math.cos(angle * 3 + t * 1.2 + spreadNorm * Math.PI) * energy;

        // Goniometer rotation: M = (L+R)/sqrt(2), S = (L-R)/sqrt(2)
        const s = (left - right) * 0.707 * (w * 0.38) * spreadNorm;
        const m = (left + right) * 0.707 * (h * 0.38);

        const x = cx + s;
        const y = cy - m;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.stroke();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [analyser, panSpread]);

  return (
    <div className="relative w-full h-full bg-[#020810] rounded overflow-hidden border border-cyan-800/60 shadow-inner flex items-center justify-center">
      <canvas ref={canvasRef} width={130} height={90} className="w-full h-full block" />
      <div className="absolute bottom-1 text-[11px] font-mono text-cyan-400/80 pointer-events-none">
        STEREO GONIOMETER
      </div>
    </div>
  );
};

