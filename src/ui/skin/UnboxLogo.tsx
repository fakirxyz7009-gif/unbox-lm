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
        <circle cx="40" cy="11" r="2.6" fill="#b6bdc5" stroke="#eef1f3" strokeWidth="0.7" />
        <circle cx="40" cy="20" r="2.6" fill="#2b2117" stroke="#9f7948" strokeWidth="0.8" />
        <path d="M37 27h6M37.5 29h5M38 31h4" stroke="#b28c58" strokeWidth="0.7" strokeLinecap="round" opacity="0.8" />
      </svg>
      <span className="unbox-brand-type">
        <span className="unbox-brand-kicker">UNBOX</span>
        <span className="unbox-brand-word">STUDIO</span>
      </span>
      <svg className="unbox-brand-tag" viewBox="0 0 100 20" aria-hidden="true" focusable="false">
        <path
          d="M2 16.2c12-2.6 24-2.9 36-1.4 12 1.5 24 1.2 36-.6 8-.7 15-.8 23 .2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M14 16.4c.9 1.2 1 2.2.6 3.3M33 16c.8 1.3.8 2.3.4 3.3M72 15.8c.9 1.1 1 2.1.6 3.1M90 15.9c.8 1 .9 2 .5 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.9"
        />
        <circle cx="24" cy="18.6" r="0.9" fill="currentColor" />
        <circle cx="61" cy="17.8" r="0.9" fill="currentColor" />
      </svg>
    </span>
  );
}
