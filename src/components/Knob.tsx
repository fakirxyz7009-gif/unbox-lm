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

const KnobComponent: React.FC<KnobProps> = ({
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
  const lastYRef = useRef(0);
  const currentValRef = useRef(0);

  // Store initial value as default reset value if not explicitly provided
  const initialDefaultRef = useRef<number>(
    defaultValue !== undefined
      ? defaultValue
      : min < 0 && max > 0 && Math.abs(min) === Math.abs(max)
      ? 0
      : value
  );

  const sizePixels = size === 'xs' ? 28 : size === 'sm' ? 38 : size === 'lg' ? 62 : 48;
  // The coloured cap is an insert in a machined metal shell, not the whole control.
  const bodyPixels = Math.max(22, Math.round(sizePixels * 0.76));
  const clampedVal = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const normalized = (clampedVal - min) / (max - min || 1);
  // -135 deg to +135 deg (270 deg total range)
  const angle = -135 + normalized * 270;

  const modNormalized = Math.min(1, Math.max(0, normalized + cvModOffset * 0.35));

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    lastYRef.current = e.clientY;
    currentValRef.current = clampedVal;
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
    lastYRef.current = e.touches[0].clientY;
    currentValRef.current = clampedVal;
  };

  const handlePointerMove = useCallback(
    (clientY: number, isFine: boolean) => {
      const deltaY = lastYRef.current - clientY;
      lastYRef.current = clientY;
      const sensitivity = isFine ? 500 : 160;
      const range = max - min;
      const deltaVal = (deltaY / sensitivity) * range;
      let nextVal = Math.min(max, Math.max(min, currentValRef.current + deltaVal));
      currentValRef.current = nextVal;

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
        return 'linear-gradient(135deg, #506b7d 0%, #304958 52%, #1c2c36 100%)';
      case 'yellow':
        return 'linear-gradient(135deg, #cfa061 0%, #a4743d 50%, #654724 100%)';
      case 'white':
        return 'linear-gradient(135deg, #f0eee8 0%, #d5d1c8 52%, #a6a198 100%)';
      case 'dark':
        return 'linear-gradient(135deg, #2c3035 0%, #16191d 60%, #20242a 100%)';
      case 'amber':
        return 'linear-gradient(135deg, #b6793d 0%, #7d512c 60%, #3d2919 100%)';
      case 'bakelite':
        return 'radial-gradient(circle at 35% 30%, #3a2c24 0%, #201814 55%, #0d0908 100%)';
      case 'brass':
        return 'linear-gradient(135deg, #d8bd8c 0%, #b08855 48%, #6d5130 100%)';
      case 'metal':
      default:
        return 'linear-gradient(135deg, #778087 0%, #444b52 50%, #2b3035 100%)';
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
        return '#d6a358';
      case 'yellow':
      case 'brass':
        return '#e0b266';
      case 'white':
        return '#e2e8f0';
      case 'amber':
      case 'bakelite':
        return '#c9873c';
      case 'dark':
        return '#d6a358';
      default:
        return '#d6a358';
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
          background:
            'radial-gradient(circle at 36% 26%, #737a80 0%, #3d4348 26%, #191d20 64%, #050607 100%)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow:
            '0 4px 8px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.24), inset 0 -3px 6px rgba(0,0,0,0.9)',
        }}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clampedVal}
        tabIndex={0}
        onKeyDown={(e) => {
          const st = step && step > 0 ? step : (max - min) / 100;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onChange(Math.min(max, clampedVal + st));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onChange(Math.max(min, clampedVal - st));
          }
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
            opacity: 0.9,
          }}
        />

        {/* Knob Body */}
        <div
          className="relative rounded-full flex items-center justify-center transition-transform duration-75 shadow-xl"
          style={{
            width: bodyPixels,
            height: bodyPixels,
            background: `radial-gradient(circle at 36% 26%, rgba(255,255,255,0.3), transparent 44%), ${getKnobBg()}`,
            border: '1px solid rgba(0,0,0,0.55)',
            boxShadow:
              '0 3px 6px rgba(0,0,0,0.85), inset 0 2px 3px rgba(255,255,255,0.36), inset 0 -4px 7px rgba(0,0,0,0.62)',
            transform: `rotate(${angle}deg)`,
          }}
        >
          {/* Machined insert bevel and a raised centre hub. */}
          <div className="absolute inset-[2px] rounded-full border border-white/15 pointer-events-none" />
          <div className="absolute inset-[4px] rounded-full border border-black/35 pointer-events-none" />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: Math.max(7, Math.round(bodyPixels * 0.2)),
              height: Math.max(7, Math.round(bodyPixels * 0.2)),
              background: 'radial-gradient(circle at 35% 28%, #f2f5f6, #aeb6ba 42%, #464d51 100%)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.65), inset 0 1px 1px rgba(255,255,255,0.65)',
            }}
          />

          {/* Pointer indicator line, lit like a painted index mark. */}
          <div
            className="absolute w-[2px] rounded-full pointer-events-none"
            style={{
              top: 3,
              left: '50%',
              transform: 'translateX(-50%)',
              height: Math.round(bodyPixels * 0.32),
              backgroundColor: getPointerColor(),
              boxShadow: '0 0 4px rgba(255,255,255,0.65), 0 1px 1px rgba(0,0,0,0.6)',
            }}
          />
        </div>
      </div>

      {/* Label and readout */}
      {label && (
        <span className="text-[11px] uppercase font-semibold tracking-wider text-neutral-300 mt-1 line-clamp-1 max-w-[76px] text-center font-mono">
          {label}
        </span>
      )}
      <span className="text-[11px] font-mono font-medium text-neutral-400 tabular-nums">
        {displayString}
        {unit}
      </span>
    </div>
  );
};

export const Knob = React.memo(KnobComponent);

