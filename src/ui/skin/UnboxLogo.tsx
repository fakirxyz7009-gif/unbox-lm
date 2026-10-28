import React from 'react';

/** Compact broadcast-TV mark and Unbox Studio wordmark for the application shell. */
export function UnboxLogo() {
  return (
    <span className="unbox-brand-lockup" aria-label="Unbox Studio">
      <svg className="unbox-brand-mark" viewBox="0 0 48 36" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="unbox-bezel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a3824" />
            <stop offset="1" stopColor="#17110c" />
          </linearGradient>
        </defs>
        <rect x="1" y="2" width="46" height="31" rx="6" fill="url(#unbox-bezel)" stroke="#bd9258" strokeWidth="1.4" />
        <rect x="4" y="5" width="30" height="25" rx="4" fill="#090b0c" stroke="#8a704d" strokeWidth="1" />
        <path d="M7 18h4l2.2-5.5 3.2 11 3.5-8 2.1 4H31" fill="none" stroke="#e1bd7e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="40" cy="11" r="2.6" fill="#d8a45d" stroke="#f1d8ac" strokeWidth="0.7" />
        <circle cx="40" cy="20" r="2.6" fill="#2b2117" stroke="#9f7948" strokeWidth="0.8" />
        <path d="M37 27h6M37.5 29h5M38 31h4" stroke="#b28c58" strokeWidth="0.7" strokeLinecap="round" opacity="0.8" />
      </svg>
      <span className="unbox-brand-type">
        <span className="unbox-brand-kicker">UNBOX</span>
        <span className="unbox-brand-word">STUDIO</span>
      </span>
    </span>
  );
}
