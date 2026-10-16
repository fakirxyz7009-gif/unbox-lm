import React from 'react';
import { PortDefinition } from '../audio/types.ts';
import { Check, X, ArrowDownRight, ArrowUpRight } from 'lucide-react';

interface PatchJackProps {
  port: PortDefinition;
  deviceId: string;
  deviceName: string;
  isConnected: boolean;
  isConnectingSource?: boolean;
  isCompatibleTarget?: boolean;
  isIncompatible?: boolean;
  incompatibleReason?: string;
  connectedColor?: string;
  onClick: (e: React.MouseEvent) => void;
}

export const PatchJack: React.FC<PatchJackProps> = ({
  port,
  deviceId,
  deviceName,
  isConnected,
  isConnectingSource = false,
  isCompatibleTarget = false,
  isIncompatible = false,
  incompatibleReason,
  connectedColor,
  onClick,
}) => {
  const isCV = port.type.startsWith('cv');
  const isInput = port.type.endsWith('_in');

  const tooltipText = isConnectingSource
    ? `[Active Plug] ${deviceName} - ${port.name}. Click to cancel.`
    : isCompatibleTarget
    ? `[Valid Target] Click to plug cable into ${deviceName} - ${port.name}`
    : isIncompatible
    ? incompatibleReason || `Cannot connect here (${isInput ? 'IN' : 'OUT'} ${isCV ? 'CV' : 'Audio'})`
    : `${deviceName}: ${port.name} (${isInput ? 'INPUT' : 'OUTPUT'} - ${isCV ? 'Control Voltage' : 'Audio Signal'})`;

  return (
    <div
      className={`relative flex flex-col items-center justify-center p-1.5 select-none transition-all duration-200 group ${
        isIncompatible ? 'jack-incompatible' : ''
      }`}
      data-jack-id={`${deviceId}:${port.id}`}
      title={tooltipText}
    >
      {/* Compatibility Badge Indicator */}
      {isCompatibleTarget && (
        <div className="absolute -top-3 z-20 px-1.5 py-0.2 rounded bg-emerald-500 text-black font-mono text-[8px] font-black uppercase tracking-wider shadow-lg animate-bounce flex items-center space-x-0.5 pointer-events-none">
          <Check className="w-2.5 h-2.5 stroke-[3]" />
          <span>CONNECT</span>
        </div>
      )}

      {isConnectingSource && (
        <div className="absolute -top-3 z-20 px-1.5 py-0.2 rounded bg-amber-500 text-black font-mono text-[8px] font-black uppercase tracking-wider shadow-lg flex items-center space-x-0.5 pointer-events-none">
          <span>SOURCE</span>
        </div>
      )}

      {/* Port socket */}
      <button
        type="button"
        disabled={isIncompatible}
        onClick={onClick}
        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 ${
          isCV ? 'patch-jack-cv' : 'patch-jack'
        } ${isConnectingSource ? 'jack-source-active ring-4 ring-amber-400' : ''} ${
          isCompatibleTarget ? 'jack-compatible-target ring-4 ring-emerald-400' : ''
        }`}
      >
        {/* Hexagonal mounting nut detail */}
        <div className="absolute inset-0.5 rounded-full border border-white/20 pointer-events-none" />

        {/* Center phone plug receptacle socket */}
        <div className="patch-jack-hole flex items-center justify-center">
          {/* If connected, render the 1/4" plug barrel end inside the jack */}
          {isConnected && (
            <div
              className="w-4 h-4 rounded-full shadow-inner flex items-center justify-center transition-colors"
              style={{
                backgroundColor: connectedColor || (isCV ? '#06b6d4' : '#f59e0b'),
                boxShadow: `0 0 8px ${connectedColor || '#06b6d4'}`,
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-neutral-900 border border-white/50" />
            </div>
          )}
        </div>
      </button>

      {/* Jack label */}
      <span className="text-[9px] font-mono font-bold tracking-tight text-neutral-300 mt-1 uppercase text-center max-w-[64px] truncate">
        {port.name}
      </span>

      {/* Signal Type & Direction Badge */}
      <div className="flex items-center space-x-1 mt-0.5">
        <span
          className={`text-[7px] font-mono font-bold px-1 py-0.2 rounded uppercase tracking-tighter flex items-center space-x-0.5 ${
            isInput
              ? 'text-sky-300 bg-sky-950/80 border border-sky-800/60'
              : 'text-emerald-300 bg-emerald-950/80 border border-emerald-800/60'
          }`}
        >
          {isInput ? (
            <>
              <ArrowDownRight className="w-2 h-2 text-sky-400" />
              <span>IN</span>
            </>
          ) : (
            <>
              <ArrowUpRight className="w-2 h-2 text-emerald-400" />
              <span>OUT</span>
            </>
          )}
        </span>

        <span
          className={`text-[7px] font-mono font-bold px-1 py-0.2 rounded uppercase ${
            isCV ? 'text-amber-400 bg-amber-950/60' : 'text-neutral-400 bg-neutral-800/60'
          }`}
        >
          {isCV ? 'CV' : 'AUDIO'}
        </span>
      </div>
    </div>
  );
};
