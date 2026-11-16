import React from 'react';
import type { DeviceIdentity } from './deviceIdentity.ts';

/** Silk-screened model plate along the bottom edge of every front faceplate. */
export const DeviceSignatureStrip: React.FC<{ identity: DeviceIdentity; familyLabel?: string }> = ({ identity, familyLabel }) => (
  <div
    className="device-signature-strip"
    title="Unbox Audio Works · Signature Series Mk I"
    aria-hidden="true"
  >
    <span className="device-signature-led" />
    <span className="device-signature-brand">UNBOX AUDIO</span>
    <span className="device-signature-series">MK I</span>
    <span className="device-signature-family">{familyLabel ?? identity.label}</span>
    <span className="device-signature-code">{identity.code}</span>
    <span className="device-signature-serial">{identity.serial}</span>
  </div>
);
