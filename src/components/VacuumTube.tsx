import React from 'react';

interface VacuumTubeProps {
  glowLevel?: number; // 0 to 1
  label?: string;
  isPowered?: boolean;
}

export const VacuumTube: React.FC<VacuumTubeProps> = ({
  glowLevel = 0.85,
  label = '12AX7A',
  isPowered = true,
}) => {
  return (
    <div className="flex flex-col items-center select-none group">
      {/* Outer glass envelope */}
      <div className="relative w-9 h-16 rounded-t-full rounded-b-sm border border-neutral-600/60 bg-gradient-to-r from-white/10 via-white/5 to-white/2 backdrop-blur-[1px] p-0.5 shadow-lg overflow-hidden flex flex-col items-center justify-end">
        {/* Glass reflection highlight */}
        <div className="absolute top-1 left-1.5 w-1.5 h-7 rounded-full bg-gradient-to-b from-white/60 to-transparent pointer-events-none transform -rotate-6" />

        {/* Anode plate cylinder */}
        <div className="relative w-6 h-9 rounded bg-neutral-800 border border-neutral-700/80 shadow-inner flex flex-col items-center justify-center overflow-hidden">
          {/* Anode inspection holes */}
          <div className="w-2.5 h-1.5 rounded-full bg-neutral-950/80 mb-1" />
          <div className="w-2.5 h-1.5 rounded-full bg-neutral-950/80" />

          {/* Glowing filament wire behind anode */}
          {isPowered && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300"
              style={{ opacity: Math.max(0.2, glowLevel) }}
            >
              <div className="w-2.5 h-7 tube-glow rounded-full" />
            </div>
          )}
        </div>

        {/* Getter mirror silvery splash at the top dome */}
        <div className="absolute top-0 inset-x-2 h-3 rounded-t-full bg-gradient-to-b from-neutral-300/40 to-transparent pointer-events-none" />

        {/* Tube Bakelite base & pins */}
        <div className="w-7 h-2 rounded-b bg-neutral-950 border-t border-neutral-700 mt-1" />
      </div>

      <span className="text-[8px] font-mono font-bold tracking-tight text-amber-500/80 mt-1 uppercase">
        {label}
      </span>
    </div>
  );
};
