import React from 'react';

export const UnboxedLogoIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Outer metallic chassis plate */}
    <rect x="15" y="15" width="70" height="70" rx="4" fill="url(#metalGrad)" stroke="#cbd5e1" strokeWidth="2" />
    
    {/* Dark green header banner */}
    <rect x="22" y="22" width="56" height="16" rx="2" fill="#064e3b" stroke="#10b981" strokeWidth="1" />
    <text x="50" y="33" fill="#ecfdf5" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle" letterSpacing="1">UNBOXED</text>
    
    {/* Oscilloscope screen with green wave */}
    <rect x="25" y="43" width="50" height="24" rx="2" fill="#030712" stroke="#334155" strokeWidth="1" />
    <path d="M 28 55 Q 37 45, 45 55 T 62 55 T 72 55" stroke="#34d399" strokeWidth="2" fill="none" filter="drop-shadow(0 0 4px #10b981)" />
    
    {/* Three physical silver knobs */}
    <circle cx="36" cy="76" r="4" fill="url(#knobGrad)" stroke="#475569" strokeWidth="1" />
    <line x1="36" y1="76" x2="36" y2="73" stroke="#0f172a" strokeWidth="1" strokeLinecap="round" />
    
    <circle cx="50" cy="76" r="4" fill="url(#knobGrad)" stroke="#475569" strokeWidth="1" />
    <line x1="50" y1="76" x2="52" y2="74" stroke="#0f172a" strokeWidth="1" strokeLinecap="round" />
    
    <circle cx="64" cy="76" r="4" fill="url(#knobGrad)" stroke="#475569" strokeWidth="1" />
    <line x1="64" y1="76" x2="66" y2="77" stroke="#0f172a" strokeWidth="1" strokeLinecap="round" />

    {/* Sparkles / Electric accents */}
    <circle cx="75" cy="25" r="2.5" fill="#fde047" className="animate-ping" />
    <path d="M 72 25 L 78 25 M 75 22 L 75 28" stroke="#fef08a" strokeWidth="1.5" />

    <defs>
      <linearGradient id="metalGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f1f5f9" />
        <stop offset="50%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#94a3b8" />
      </linearGradient>
      <radialGradient id="knobGrad" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="60%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#64748b" />
      </radialGradient>
    </defs>
  </svg>
);
