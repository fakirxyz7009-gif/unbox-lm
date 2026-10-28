/**
 * Unbox skin building blocks: brushed-metal panel, LCD glass and hardware buttons.
 * Colours come from the tokens in src/index.css (@theme + .us-* classes).
 */
import React from 'react';

export const MetalPanel: React.FC<{ className?: string; children: React.ReactNode; screws?: boolean }> = ({ className = '', children, screws }) => (
  <div className={`us-metal us-metal-frame relative ${className}`}>
    {screws && (
      <>
        <span className="us-screw absolute left-2 top-2" aria-hidden />
        <span className="us-screw absolute right-2 top-2" aria-hidden />
        <span className="us-screw absolute left-2 bottom-2" aria-hidden />
        <span className="us-screw absolute right-2 bottom-2" aria-hidden />
      </>
    )}
    {children}
  </div>
);

/** Warm LCD accent with a dark bezel. */
export const Lcd: React.FC<{ className?: string; innerClassName?: string; children: React.ReactNode }> = ({ className = '', innerClassName = '', children }) => (
  <div className={`us-bezel ${className}`}>
    <div className={`us-lcd h-full ${innerClassName}`}>{children}</div>
  </div>
);

/** Small dark hardware button; `on` lights it (amber by default). */
export const LedButton: React.FC<{
  on?: boolean;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children?: React.ReactNode;
  color?: string;
  className?: string;
  testId?: string;
}> = ({ on, onClick, title, children, color = '#ffb347', className = '', testId }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    aria-pressed={on}
    onClick={onClick}
    data-testid={testId}
    className={`us-btn rounded-[5px] grid place-items-center font-label font-bold text-[11px] ${className}`}
    style={on ? { background: `linear-gradient(180deg, ${color}, ${color}99)`, color: '#141414', boxShadow: `0 0 8px ${color}aa, inset 0 1px 0 rgba(255,255,255,0.5)` } : undefined}
  >
    {children}
  </button>
);

/** Side-panel function button with illuminated indicator (LOAD / EDIT / MIDI …). */
export const PanelButton: React.FC<{
  label: string;
  active?: boolean;
  led?: boolean;
  onClick: () => void;
  title: string;
  testId?: string;
}> = ({ label, active, led, onClick, title, testId }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={active}
    data-testid={testId}
    className="us-btn-light w-[64px] h-[22px] rounded-[4px] flex items-center justify-between px-1.5 transition-all cursor-pointer"
    style={active ? { boxShadow: '0 0 0 1.5px #d6a358, inset 0 1px 0 #fff', background: '#e4dcd0' } : undefined}
  >
    <span
      className="block w-[7px] h-[7px] rounded-full shrink-0"
      style={{
        background: (active || led) ? 'radial-gradient(circle, #ffe1a8 15%, #d69b50 75%, #8a5314 100%)' : '#33291e',
        boxShadow: (active || led) ? '0 0 6px #f59e0b' : 'inset 0 1px 1px #000',
      }}
    />
    <span className="font-label font-bold text-[11px] tracking-wider text-[#241c14] leading-none">{label}</span>
  </button>
);
