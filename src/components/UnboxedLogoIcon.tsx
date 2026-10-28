import React from 'react';

export const UnboxedLogoIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Outer anodized dark titanium techno chassis plate */}
    <rect x="12" y="12" width="76" height="76" rx="8" fill="url(#technoMetalGrad)" stroke="#06b6d4" strokeWidth="2.5" />

    {/* Inner cyber-grid bezel */}
    <rect x="18" y="18" width="64" height="20" rx="3" fill="#04151f" stroke="#22d3ee" strokeWidth="1.2" />
    <text x="50" y="31" fill="#67e8f9" fontSize="8.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle" letterSpacing="1.5">
      HI-FI DSP
    </text>

    {/* High-DPI Oscilloscope screen with dual laser-cyan & emerald waves */}
    <rect x="20" y="42" width="60" height="26" rx="3" fill="#020617" stroke="#0e7490" strokeWidth="1.2" />
    <path
      d="M 23 55 Q 32 43, 41 55 T 59 55 T 77 55"
      stroke="#00f0ff"
      strokeWidth="2.2"
      fill="none"
      filter="drop-shadow(0 0 5px #06b6d4)"
    />
    <path
      d="M 23 57 Q 34 65, 45 53 T 66 57 T 77 51"
      stroke="#10b981"
      strokeWidth="1.5"
      strokeDasharray="3 2"
      fill="none"
    />

    {/* Three precision rotary encoders */}
    <circle cx="33" cy="77" r="4.5" fill="url(#encoderGrad)" stroke="#22d3ee" strokeWidth="1" />
    <line x1="33" y1="77" x2="33" y2="73" stroke="#00f0ff" strokeWidth="1.2" strokeLinecap="round" />

    <circle cx="50" cy="77" r="4.5" fill="url(#encoderGrad)" stroke="#10b981" strokeWidth="1" />
    <line x1="50" y1="77" x2="53" y2="74" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" />

    <circle cx="67" cy="77" r="4.5" fill="url(#encoderGrad)" stroke="#818cf8" strokeWidth="1" />
    <line x1="67" y1="77" x2="70" y2="78" stroke="#a5b4fc" strokeWidth="1.2" strokeLinecap="round" />

    {/* Active telemetry pulse LED */}
    <circle cx="75" cy="24" r="2.5" fill="#00f0ff" className="animate-ping" />
    <circle cx="75" cy="24" r="2" fill="#67e8f9" />

    <defs>
      <linearGradient id="technoMetalGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0f172a" />
        <stop offset="50%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#090d16" />
      </linearGradient>
      <radialGradient id="encoderGrad" cx="35%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#334155" />
        <stop offset="70%" stopColor="#0f172a" />
        <stop offset="100%" stopColor="#020617" />
      </radialGradient>
    </defs>
  </svg>
);
