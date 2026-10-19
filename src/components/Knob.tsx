import React, { useRef, useState, useEffect, useCallback } from 'react';

export type KnobVariant = 'metal' | 'dark' | 'blue' | 'yellow' | 'white' | 'amber' | 'bakelite' | 'brass';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: KnobVariant;
  defaultValue?: number;
  cvModOffset?: number; // -1..1 live CV modulation offset for radial arc display
  onChange: (val: number) => void;
  formatValue?: (val: number) => string;
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  size = 'md',
  variant = 'metal',
  defaultValue,
  cvModOffset = 0,
  onChange,
  formatValue,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(0);

  // Store initial value as default reset value if not explicitly provided
  const initialDefaultRef = useRef<number>(
    defaultValue !== undefined
      ? defaultValue
      : min < 0 && max > 0 && Math.abs(min) === Math.abs(max)
      ? 0
      : value
  );

  const sizePixels = size === 'xs' ? 28 : size === 'sm' ? 38 : size === 'lg' ? 62 : 48;
  const clampedVal = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const normalized = (clampedVal - min) / (max - min || 1);
  // -135 deg to +135 deg (270 deg total range)
  const angle = -135 + normalized * 270;

  const modNormalized = Math.min(1, Math.max(0, normalized + cvModOffset * 0.35));

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = clampedVal;
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const targetReset =
      defaultValue !== undefined ? defaultValue : initialDefaultRef.current;
    onChange(Math.min(max, Math.max(min, targetReset)));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    startYRef.current = e.touches[0].clientY;
    startValRef.current = clampedVal;
  };

  const handlePointerMove = useCallback(
    (clientY: number, isFine: boolean) => {
      const deltaY = startYRef.current - clientY;
      const sensitivity = isFine ? 400 : 150;
      const range = max - min;
      const deltaVal = (deltaY / sensitivity) * range;
      let nextVal = startValRef.current + deltaVal;

      if (step > 0) {
        nextVal = Math.round(nextVal / step) * step;
      }

      nextVal = Math.min(max, Math.max(min, nextVal));
      onChange(nextVal);
    },
    [max, min, step, onChange]
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientY, e.shiftKey);
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      handlePointerMove(e.touches[0].clientY, false);
    };

    const onTouchEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, handlePointerMove]);

  const displayString = formatValue
    ? formatValue(clampedVal)
    : step < 1
    ? clampedVal.toFixed(2)
    : Math.round(clampedVal).toString();

  // Studio hardware color variants: grey, blue, black, white, yellow, bakelite, brass
  const getKnobBg = () => {
    switch (variant) {
      case 'blue':
        return 'linear-gradient(135deg, #2563eb 0%, #1e40af 50%, #172554 100%)';
      case 'yellow':
        return 'linear-gradient(135deg, #eab308 0%, #ca8a04 50%, #854d0e 100%)';
      case 'white':
        return 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #94a3b8 100%)';
      case 'dark':
        return 'linear-gradient(135deg, #262930 0%, #14161a 60%, #1c1e24 100%)';
      case 'amber':
        return 'linear-gradient(135deg, #d97706 0%, #92400e 60%, #451a03 100%)';
      case 'bakelite':
        return 'radial-gradient(circle at 35% 30%, #3a2318 0%, #1c100b 55%, #0d0705 100%)';
      case 'brass':
        return 'linear-gradient(135deg, #fde68a 0%, #d97706 48%, #78350f 100%)';
      case 'metal':
      default:
        return 'linear-gradient(135deg, #64748b 0%, #334155 50%, #475569 100%)';
    }
  };

  const getPointerColor = () => {
    switch (variant) {
      case 'yellow':
      case 'brass':
        return '#171717';
      case 'white':
        return '#0f172a';
      case 'blue':
        return '#ffffff';
      case 'amber':
      case 'bakelite':
        return '#fef3c7';
      default:
        return '#ffffff';
    }
  };

  const getArcColor = () => {
    switch (variant) {
      case 'blue':
        return '#38bdf8';
      case 'yellow':
      case 'brass':
        return '#eab308';
      case 'white':
        return '#e2e8f0';
      case 'amber':
      case 'bakelite':
        return '#f97316';
      case 'dark':
        return '#60a5fa';
      default:
        return '#38bdf8';
    }
  };

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className="flex flex-col items-center justify-center select-none group cursor-ns-resize"
    >
      {/* Knob outer bezel ring with graduation marks + live radial SVG value & CV arc */}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: sizePixels + 10,
          height: sizePixels + 10,
          background: 'radial-gradient(circle, #1a1d22 0%, #0a0b0d 100%)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9), 0 1px 1px rgba(255,255,255,0.08)',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        title={`${label}: ${displayString} ${unit} (Drag up/down • Shift=Fine • Double-click=Reset)`}
      >
        {/* Active arc guide + CV modulation offset halo */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={sizePixels + 10}
          height={sizePixels + 10}
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="#1c1f24"
            strokeWidth="4"
            strokeDasharray="197 100"
            strokeDashoffset="-32"
          />
          {Math.abs(cvModOffset) > 0.01 && (
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeDasharray={`${modNormalized * 197} 300`}
              strokeDashoffset="-32"
              strokeLinecap="round"
              opacity="0.85"
            />
          )}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={getArcColor()}
            strokeWidth={isDragging ? '4.5' : '3.5'}
            strokeDasharray={`${normalized * 197} 300`}
            strokeDashoffset="-32"
            strokeLinecap="round"
            style={{
              filter: isDragging ? `drop-shadow(0 0 4px ${getArcColor()})` : undefined,
            }}
          />
        </svg>

        {/* Knurled Edge Outer Grip Ring */}
        <div
          className="absolute rounded-full knurled-edge-ring pointer-events-none"
          style={{
            width: sizePixels + 4,
            height: sizePixels + 4,
          }}
        />

        {/* Knob Body */}
        <div
          className="relative rounded-full flex items-center justify-center transition-transform duration-75 shadow-xl"
          style={{
            width: sizePixels,
            height: sizePixels,
            background: getKnobBg(),
            boxShadow:
              '0 4px 8px rgba(0,0,0,0.85), inset 0 1px 2px rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.85)',
            transform: `rotate(${angle}deg)`,
          }}
        >
          {/* Subtle knurled ring notches & concentric bevel */}
          <div className="absolute inset-1 rounded-full border border-black/50 opacity-80 pointer-events-none" />
          <div className="absolute inset-2 rounded-full border border-white/10 pointer-events-none" />

          {/* Machined cap center dot with knurled cap */}
          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-white/40 to-black/40 border border-white/30 shadow-inner pointer-events-none" />

          {/* Pointer indicator line */}
          <div
            className="absolute top-1 w-[3px] rounded-full pointer-events-none"
            style={{
              height: sizePixels * 0.38,
              backgroundColor: getPointerColor(),
              boxShadow: '0 0 5px rgba(255,255,255,0.9)',
            }}
          />
        </div>
      </div>

      {/* Label and readout */}
      {label && (
        <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-300 mt-1 line-clamp-1 max-w-[76px] text-center font-mono">
          {label}
        </span>
      )}
      <span className="text-[9px] font-mono font-semibold text-neutral-400 tabular-nums">
        {displayString}
        {unit}
      </span>
    </div>
  );
};

