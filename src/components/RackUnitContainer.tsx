import React from 'react';
import { BaseDevice } from '../audio/BaseDevice.ts';
import { PatchJack } from './PatchJack.tsx';
import { Trash2, Power, EyeOff, Radio, Sliders, Mic } from 'lucide-react';

interface RackUnitContainerProps {
  device: BaseDevice;
  isBackView: boolean;
  children: React.ReactNode;
  onRemove: (id: string) => void;
  onPowerToggle: (id: string) => void;
  onBypassToggle: (id: string) => void;
  // Cable connection helper states
  activeConnectingJack: { deviceId: string; portId: string; type: string } | null;
  onJackClick: (deviceId: string, portId: string, portType: string) => void;
  connectedPortsMap: Map<string, string>; // "deviceId:portId" -> cableColor
}

export const RackUnitContainer: React.FC<RackUnitContainerProps> = ({
  device,
  isBackView,
  children,
  onRemove,
  onPowerToggle,
  onBypassToggle,
  activeConnectingJack,
  onJackClick,
  connectedPortsMap,
}) => {
  const heightClass =
    device.heightUnits === 1
      ? 'min-h-[115px]'
      : device.heightUnits === 2
      ? 'min-h-[195px]'
      : 'min-h-[290px]';

  // Real Studio Color Themes (Grey, Blue, Black, White) based on classic outboard studio gear
  // Real Studio Color Themes: Crisp White, Light Grey Metal, Dark Green, Studio Blue, Black
  const getFaceplateTheme = () => {
    switch (device.type) {
      case 'three_osc':
        // Precision Anodized Light Grey Brushed Metal
        return 'faceplate-light-grey-metal text-slate-900';
      case 'sytrus':
        // Deep Forest Green Lacquer
        return 'faceplate-forest-green text-emerald-100';
      case 'flex':
      case 'redrum':
      case 'mimic':
        // Studio Crisp White / Porcelain Enamel
        return 'faceplate-crisp-white text-slate-900';
      case 'thor':
      case 'europa':
        // Studio Blue
        return 'faceplate-studio-blue text-white';
      case 'subtractor':
      case 'monotone':
        // Slate Anodized Black
        return 'faceplate-slate-black text-neutral-100';
      case 'mclass_master':
      case 'echo':
      case 'rv7000':
      default:
        // Brushed Steel / Studio Grey
        return 'faceplate-brushed-grey text-neutral-900';
    }
  };

  // Studio tape label text for authentic hardware studio vibe
  const getTapeLabel = () => {
    switch (device.type) {
      case 'three_osc':
        return 'CH 1 // 3X OSC LEAD';
      case 'sytrus':
        return 'CH 2 // SYTRUS FM';
      case 'flex':
        return 'CH 3 // FLEX ROMPLER';
      case 'subtractor':
        return 'CH 4 // ACID BASS';
      case 'thor':
        return 'CH 5 // POLY LEAD';
      case 'europa':
        return 'CH 6 // WAVETABLE PAD';
      case 'monotone':
        return 'CH 7 // SUB BASS';
      case 'redrum':
        return 'DRUM BUS // 16-STEP';
      case 'mimic':
        return 'SAMPLER // ACOUSTIC';
      case 'automation_clip':
        return 'MOD // AUTO CLIP';
      case 'matrix':
        return 'SEQ // CV PATTERN';
      case 'pulsar':
        return 'MOD // DUAL LFO';
      case 'scream4':
        return 'TAPE WARMER // DRIVE';
      case 'echo':
        return 'AUX 1 // PING-PONG';
      case 'rv7000':
        return 'AUX 2 // STUDIO HALL';
      case 'mclass_master':
        return 'MASTER BUS // 4-BAND EQ & COMP';
      default:
        return 'OUTBOARD AUX';
    }
  };

  return (
    <div
      className={`relative w-full rounded-md mb-4 shadow-2xl flex transition-all duration-300 ${heightClass} ${
        isBackView ? 'metal-chassis-back text-neutral-100' : getFaceplateTheme()
      } ${!device.isPowered ? 'opacity-70 grayscale-[25%]' : ''}`}
      style={{
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
      }}
    >
      {/* 1. LEFT WOODEN BOX CHEEK (Warm Mahogany & Walnut Wood Grain with Countersunk Brass Screws) */}
      <div className="w-5 sm:w-6 flex-shrink-0 wooden-cheek rounded-l-md flex flex-col justify-between items-center py-2 border-r border-[#1a0f07] shadow-lg select-none">
        <div className="brass-screw" title="Countersunk Brass Chassis Screw" />
        <span className="text-[6px] font-mono font-black text-amber-200/40 rotate-90 tracking-widest uppercase pointer-events-none">
          TIMBER
        </span>
        <div className="brass-screw" title="Countersunk Brass Chassis Screw" />
      </div>

      {/* 2. LEFT RACK EAR (Black powder-coated industrial steel with screw holes and U marker) */}
      <div className="w-10 sm:w-11 flex-shrink-0 flex flex-col justify-between items-center py-2 px-1 border-r border-neutral-900 bg-neutral-950 shadow-inner">
        <div className="flex flex-col items-center space-y-1">
          <div className="rack-screw" />
          <span className="text-[7px] font-mono text-neutral-500 font-bold">{device.heightUnits}U</span>
        </div>

        {device.heightUnits >= 2 && (
          <div className="w-2.5 h-16 rounded-full bg-gradient-to-r from-neutral-400 via-neutral-200 to-neutral-500 shadow-lg border border-neutral-600/60 my-auto cursor-grab" />
        )}

        <div className="rack-screw" />
      </div>

      {/* CENTER FACEPLATE (FRONT OR BACK VIEW) */}
      <div className="flex-1 flex flex-col min-w-0 p-3.5">
        {/* Device Header Bar */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-black/20 select-none">
          <div className="flex items-center space-x-2.5">
            {/* Power Switch & Jewel Pilot LED */}
            <button
              onClick={() => onPowerToggle(device.id)}
              className={`p-1 rounded flex items-center space-x-1.5 transition-colors ${
                device.isPowered
                  ? 'text-sky-400 hover:text-sky-300'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
              title="Hardware Power Toggle"
            >
              <Power className="w-3.5 h-3.5" />
              <div
                className={`led-indicator ${
                  device.isPowered ? 'active-blue' : ''
                }`}
              />
            </button>

            {/* Bypass Switch */}
            <button
              onClick={() => onBypassToggle(device.id)}
              className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border transition-colors ${
                device.isBypassed
                  ? 'bg-amber-950/80 border-amber-600/80 text-amber-300'
                  : 'bg-black/30 border-black/40 text-neutral-300 hover:bg-black/50'
              }`}
              title="Bypass Hardware DSP"
            >
              {device.isBypassed ? 'BYPASSED' : 'ACTIVE'}
            </button>

            {/* Run / Stop Button */}
            <button
              onClick={() => onPowerToggle(device.id)}
              className={`text-[9px] font-mono font-black px-2.5 py-1 rounded border shadow-sm transition-all flex items-center space-x-1 ${
                device.isPowered
                  ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white shadow-emerald-900/50'
                  : 'bg-red-900 hover:bg-red-800 border-red-600 text-red-200 shadow-red-950/50'
              }`}
              title="Toggle Instrument DSP Processing Run / Stop"
            >
              <div className={`w-2 h-2 rounded-full ${device.isPowered ? 'bg-white animate-pulse' : 'bg-red-400'}`} />
              <span>{device.isPowered ? 'RUN' : 'STOP'}</span>
            </button>

            {/* Voice Name Announcer Button */}
            <button
              onClick={() => device.speakName()}
              className="p-1 rounded text-neutral-400 hover:text-white transition-colors"
              title="Voice Name Announcer"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>

            {/* Device Name Banner */}
            <span className="text-xs font-bold font-mono tracking-widest uppercase bg-black/40 px-2.5 py-0.5 rounded border border-white/10 shadow-sm">
              {device.name}
            </span>

            {/* Authentic Studio Console Masking Tape Strip */}
            {!isBackView && (
              <div className="masking-tape px-2 py-0.5 text-[9px] font-mono font-bold shadow-sm tracking-wider">
                {getTapeLabel()}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[9px] font-mono opacity-60 uppercase font-semibold">
              SERIES 500 // {device.type.toUpperCase()}
            </span>

            {/* Remove button */}
            <button
              onClick={() => onRemove(device.id)}
              className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
              title="Unmount device from studio rack"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* FRONT VIEW CONTROLS OR BACK VIEW MODULAR PATCH BAY */}
        {!isBackView ? (
          <div className="flex-1 flex flex-col justify-center">{children}</div>
        ) : (
          <div className="flex-1 flex flex-col justify-between py-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 mb-2 border-b border-neutral-800 pb-1">
              <span className="tracking-widest flex items-center space-x-1.5 text-neutral-300">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>MODULAR HARNESS // {device.name.toUpperCase()}</span>
              </span>
              <span className="text-[9px] text-neutral-500 font-mono">
                BALANCED 600&Omega; TRANSFORMER COUPLED
              </span>
            </div>

            {/* Patch Jacks Grid with Intelligent Guidance States */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-center justify-items-center bg-black/50 p-3 rounded border border-neutral-800/80 shadow-inner">
              {device.ports.map((port) => {
                const jackKey = `${device.id}:${port.id}`;
                const isConnected = connectedPortsMap.has(jackKey);
                const cableColor = connectedPortsMap.get(jackKey);

                // Compute intelligent connection helper states
                let isConnectingSource = false;
                let isCompatibleTarget = false;
                let isIncompatible = false;
                let incompatibleReason = '';

                if (activeConnectingJack) {
                  const isSource =
                    activeConnectingJack.deviceId === device.id &&
                    activeConnectingJack.portId === port.id;

                  if (isSource) {
                    isConnectingSource = true;
                  } else {
                    const activeIsCV = activeConnectingJack.type.startsWith('cv');
                    const targetIsCV = port.type.startsWith('cv');
                    const activeIsOut = activeConnectingJack.type.endsWith('_out');
                    const targetIsOut = port.type.endsWith('_out');

                    if (activeIsCV !== targetIsCV) {
                      // Prohibit Audio <-> CV cross patch
                      isIncompatible = true;
                      incompatibleReason = activeIsCV
                        ? 'Cannot plug CV into an Audio jack!'
                        : 'Cannot plug Audio into a CV jack!';
                    } else if (activeIsOut === targetIsOut) {
                      // Prohibit OUT <-> OUT or IN <-> IN
                      isIncompatible = true;
                      incompatibleReason = activeIsOut
                        ? 'Outputs must connect to Inputs (cannot connect Output to Output)'
                        : 'Inputs must connect from Outputs (cannot connect Input to Input)';
                    } else if (activeConnectingJack.deviceId === device.id && !activeIsCV) {
                      // Self audio loop check
                      isIncompatible = true;
                      incompatibleReason = 'Cannot loop a device output directly into its own input';
                    } else {
                      // It's a valid compatible target!
                      isCompatibleTarget = true;
                    }
                  }
                }

                return (
                  <PatchJack
                    key={port.id}
                    port={port}
                    deviceId={device.id}
                    deviceName={device.name}
                    isConnected={isConnected}
                    isConnectingSource={isConnectingSource}
                    isCompatibleTarget={isCompatibleTarget}
                    isIncompatible={isIncompatible}
                    incompatibleReason={incompatibleReason}
                    connectedColor={cableColor}
                    onClick={() => onJackClick(device.id, port.id, port.type)}
                  />
                );
              })}
            </div>

            <div className="text-[8px] font-mono text-neutral-500 flex justify-between mt-2 pt-1 border-t border-neutral-900">
              <span>UNBOXED ULTRA-LOW NOISE SHIELDED GROUND</span>
              <span>1V/OCT PITCH &plusmn;5V BI-POLAR CV</span>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT RACK EAR (Black powder-coated steel with screw holes and U marker) */}
      <div className="w-10 sm:w-11 flex-shrink-0 flex flex-col justify-between items-center py-2 px-1 border-l border-neutral-900 bg-neutral-950 shadow-inner">
        <div className="flex flex-col items-center space-y-1">
          <div className="rack-screw" />
          <span className="text-[7px] font-mono text-neutral-500 font-bold">{device.heightUnits}U</span>
        </div>

        {device.heightUnits >= 2 && (
          <div className="w-2.5 h-16 rounded-full bg-gradient-to-r from-neutral-400 via-neutral-200 to-neutral-500 shadow-lg border border-neutral-600/60 my-auto cursor-grab" />
        )}

        <div className="rack-screw" />
      </div>

      {/* RIGHT WOODEN BOX CHEEK (Warm Mahogany & Walnut Wood Grain with Countersunk Brass Screws) */}
      <div className="w-5 sm:w-6 flex-shrink-0 wooden-cheek rounded-r-md flex flex-col justify-between items-center py-2 border-l border-[#1a0f07] shadow-lg select-none">
        <div className="brass-screw" title="Countersunk Brass Chassis Screw" />
        <span className="text-[6px] font-mono font-black text-amber-200/40 -rotate-90 tracking-widest uppercase pointer-events-none">
          TIMBER
        </span>
        <div className="brass-screw" title="Countersunk Brass Chassis Screw" />
      </div>
    </div>
  );
};
