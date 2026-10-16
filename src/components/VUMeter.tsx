import React, { useEffect, useState } from 'react';

interface VUMeterProps {
  label?: string;
  rms: number;      // 0.0 to 1.0+
  peak: number;     // 0.0 to 1.0+
  width?: number;
  height?: number;
  theme?: 'vintage' | 'modern';
}

export const VUMeter: React.FC<VUMeterProps> = ({
  label = 'MASTER L',
  rms,
  peak,
  width = 110,
  height = 68,
  theme = 'vintage',
}) => {
  const [smoothNeedle, setSmoothNeedle] = useState(-35); // degrees
  const [peakHold, setPeakHold] = useState(false);

  useEffect(() => {
    // Map RMS to decibels: 0 -> -40dB, 1 -> 0dB, >1 -> +3dB
    const clampedRms = Math.max(0.0001, rms);
    const db = 20 * Math.log10(clampedRms);
    // Range -30dB to +3dB mapped to -40deg to +40deg
    const normalized = Math.min(1, Math.max(0, (db + 30) / 33));
    const targetAngle = -38 + normalized * 76;

    // Smooth ballistics
    setSmoothNeedle((prev) => prev + (targetAngle - prev) * 0.35);

    if (peak > 0.95) {
      setPeakHold(true);
      const timer = setTimeout(() => setPeakHold(false), 250);
      return () => clearTimeout(timer);
    }
  }, [rms, peak]);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative overflow-hidden rounded border border-neutral-700 select-none shadow-inner"
        style={{
          width,
          height,
          background:
            theme === 'vintage'
              ? 'linear-gradient(180deg, #f7eccb 0%, #ecd8a5 70%, #d4bf88 100%)'
              : 'linear-gradient(180deg, #1b2029 0%, #11141a 100%)',
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.7)',
        }}
      >
        {/* Warm incandescent bulb glow behind vintage meter */}
        {theme === 'vintage' && (
          <div
            className="absolute inset-0 pointer-events-none opacity-60"
            style={{
              background: 'radial-gradient(circle at 50% 120%, rgba(255, 170, 40, 0.8) 0%, transparent 75%)',
            }}
          />
        )}

        {/* Meter scale markings */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 60">
          {/* Arc */}
          <path
            d="M 15 48 A 45 45 0 0 1 85 48"
            fill="none"
            stroke={theme === 'vintage' ? '#4a3b20' : '#475569'}
            strokeWidth="1.2"
          />
          {/* Red danger zone arc from +0dB to +3dB */}
          <path
            d="M 68 25 A 45 45 0 0 1 85 48"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2.5"
          />
          {/* Scale labels */}
          <text x="18" y="44" fontSize="5" fill="#4a3b20" fontWeight="bold" fontFamily="monospace">-20</text>
          <text x="35" y="27" fontSize="5" fill="#4a3b20" fontWeight="bold" fontFamily="monospace">-7</text>
          <text x="50" y="22" fontSize="5" fill="#4a3b20" fontWeight="bold" fontFamily="monospace">-1</text>
          <text x="68" y="22" fontSize="5" fill="#ef4444" fontWeight="bold" fontFamily="monospace">0</text>
          <text x="82" y="38" fontSize="5" fill="#ef4444" fontWeight="bold" fontFamily="monospace">+3</text>
          <text x="50" y="38" fontSize="6.5" fill="#302613" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">VU</text>
        </svg>

        {/* Peak overload LED */}
        <div className="absolute top-1 right-1.5 flex items-center space-x-0.5">
          <span className="text-[7px] font-bold tracking-tighter text-neutral-800">PEAK</span>
          <div
            className={`w-2 h-2 rounded-full border border-black/40 transition-colors duration-75 ${
              peakHold ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-red-950/60'
            }`}
          />
        </div>

        {/* Analog VU needle pivot and needle arm */}
        <div
          className="absolute bottom-0 left-1/2 w-0.5 origin-bottom pointer-events-none transition-transform duration-75 ease-out"
          style={{
            height: height * 0.76,
            backgroundColor: '#1c1917',
            transform: `translateX(-50%) rotate(${smoothNeedle}deg)`,
            boxShadow: '1px 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          {/* Red needle tip */}
          <div className="w-full h-3 bg-red-600 rounded-t-full" />
        </div>

        {/* Pivot cap at bottom */}
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border border-neutral-700 bg-neutral-900 shadow-md"
        />
      </div>

      <span className="text-[9px] uppercase font-bold text-neutral-400 mt-0.5 tracking-wider font-mono">
        {label}
      </span>
    </div>
  );
};
