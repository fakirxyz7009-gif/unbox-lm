import React from 'react';
import { BaseDevice } from '../audio/BaseDevice.ts';
import { PatchJack } from './PatchJack.tsx';
import { Trash2, Power, Sliders, Mic, RotateCw } from 'lucide-react';

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

const WORLD_CLASSICAL_TYPES = new Set([
  'tabla',
  'dhol',
  'bansuri',
  'sitar',
  'sarod',
  'santoor',
  'harmonium',
  'tanpura',
  'tumbi',
  'world_instrument',
  'pangea',
]);

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
      ? 'min-h-[120px]'
      : device.heightUnits === 2
      ? 'min-h-[205px]'
      : 'min-h-[295px]';

  const isWorldAcoustic = WORLD_CLASSICAL_TYPES.has(device.type);

  // Real Studio Color Themes based on hardware archetype
  const getFaceplateTheme = () => {
    if (isWorldAcoustic) {
      return 'bg-gradient-to-r from-[#231409] via-[#341f0e] to-[#231409] text-amber-100 border-y border-amber-500/40';
    }
    switch (device.type) {
      case 'combinator':
        return 'bg-gradient-to-r from-[#5c121b] via-[#881b26] to-[#4c0e16] text-rose-50 border-y border-rose-400/50';
      case 'rv7000':
      case 'rv9':
        return 'bg-gradient-to-r from-[#0e2a47] via-[#1d4ed8] to-[#0c233d] text-sky-50 border-y border-sky-400/50';
      case 'scream4':
        return 'bg-gradient-to-r from-[#0e3a24] via-[#15803d] to-[#0b2e1c] text-emerald-50 border-y border-emerald-400/50';
      case 'mclass_master':
        return 'bg-gradient-to-r from-[#4a300d] via-[#925811] to-[#3d260a] text-amber-50 border-y border-amber-400/60';
      case 'three_osc':
        return 'faceplate-light-grey-metal text-slate-900';
      case 'sytrus':
        return 'faceplate-forest-green text-emerald-100';
      case 'flex':
      case 'redrum':
      case 'mimic':
        return 'faceplate-crisp-white text-slate-900';
      case 'thor':
      case 'europa':
      case 'wyvern':
        return 'faceplate-studio-blue text-white';
      case 'subtractor':
      case 'monotone':
      case 'kong':
      case 'umpf':
      case 'dr_octo_rex':
        return 'faceplate-slate-black text-neutral-100';
      case 'pulveriser':
      case 'alligator':
      case 'ember':
        return 'bg-gradient-to-r from-[#1c1410] via-[#281c15] to-[#1c1410] text-amber-100';
      case 'echo':
      default:
        return 'faceplate-brushed-grey text-neutral-900';
    }
  };

  // Studio tape label text for authentic hardware studio vibe
  const getTapeLabel = () => {
    switch (device.type) {
      case 'combinator':
        return 'POLYPHONIC SYNTHESIZER';
      case 'three_osc':
        return 'CH 1 · 3X OSC LEAD';
      case 'sytrus':
        return 'CH 2 · SYTRUS FM';
      case 'flex':
        return 'CH 3 · FLEX ROMPLER';
      case 'subtractor':
        return 'ANALOG SUBTRACTIVE';
      case 'thor':
        return 'SEMI-MODULAR POLY';
      case 'europa':
        return 'SPECTRAL WAVETABLE';
      case 'monotone':
        return 'ANALOG BASS SYNTH';
      case 'redrum':
        return 'DRUM COMPUTER · 8-CH';
      case 'kong':
        return '16-PAD MPC WORKSTATION';
      case 'mimic':
        return 'CREATIVE SAMPLER';
      case 'tabla':
        return 'SOUNDFONT · ROYAL TABLA';
      case 'dhol':
        return 'SOUNDFONT · FOLK DHOL';
      case 'bansuri':
        return 'SOUNDFONT · BANSURI MEEND';
      case 'sitar':
      case 'world_instrument':
        return 'SOUNDFONT · SITAR JIVARI';
      case 'harmonium':
        return 'SOUNDFONT · VEDIC HARMONIUM';
      case 'tanpura':
        return 'SA-PA JAWARI DRONE';
      case 'tumbi':
        return 'PUNJABI TUMBI PLUCK';
      case 'matrix':
        return 'SEQ · CV PATTERN';
      case 'pulsar':
        return 'MOD · DUAL LFO';
      case 'scream4':
        return 'SOUND DESTRUCTION UNIT';
      case 'echo':
        return 'AUX 1 · PING-PONG DELAY';
      case 'rv7000':
        return 'ADVANCED REVERB';
      case 'mclass_master':
        return 'MASTERING COMPRESSOR';
      default:
        return 'STUDIO RACK UNIT';
    }
  };

  return (
    <div
      className="relative w-full mb-4"
      style={{
        perspective: '1800px',
      }}
    >
      <div
        className={`relative w-full rounded-md shadow-2xl flex transition-all duration-500 ${heightClass} ${
          isBackView ? 'metal-chassis-back text-neutral-100' : getFaceplateTheme()
        } ${!device.isPowered ? 'opacity-70 grayscale-[25%]' : ''}`}
        style={{
          transformStyle: 'preserve-3d',
          transform: isBackView ? 'rotateY(180deg)' : 'rotateY(0deg)',
          boxShadow: '0 14px 32px rgba(0, 0, 0, 0.88), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
        }}
      >
        {/* Un-mirror inner content when flipped to 180deg so rear patch bay text and jacks read left-to-right */}
        <div
          className="flex w-full"
          style={{
            transform: isBackView ? 'rotateY(180deg)' : 'none',
          }}
        >
          {/* 1. LEFT WOODEN BOX CHEEK (Carved Rosewood/Teak for World Suite, Warm Mahogany for Studio Gear) */}
          <div
            className={`w-5 sm:w-6 flex-shrink-0 rounded-l-md flex flex-col justify-between items-center py-2 border-r shadow-lg select-none ${
              isWorldAcoustic
                ? 'bg-gradient-to-b from-[#4a1c0d] via-[#331107] to-[#4a1c0d] border-amber-500/40'
                : 'wooden-cheek border-[#1a0f07]'
            }`}
          >
            <div className="brass-screw" title="Countersunk Brass Chassis Screw" />
            <span className="text-[6px] font-mono font-black text-amber-200/50 rotate-90 tracking-widest uppercase pointer-events-none">
              {isWorldAcoustic ? 'ROSEWOOD' : 'TIMBER'}
            </span>
            <div className="brass-screw" title="Countersunk Brass Chassis Screw" />
          </div>

          {/* 2. LEFT RACK EAR (Black powder-coated industrial steel or Brushed Brass for World Suite) */}
          <div
            className={`w-10 sm:w-11 flex-shrink-0 flex flex-col justify-between items-center py-2 px-1 border-r shadow-inner ${
              isWorldAcoustic
                ? 'bg-gradient-to-b from-[#3d2610] via-[#261709] to-[#3d2610] border-amber-600/40'
                : 'border-neutral-900 bg-neutral-950'
            }`}
          >
            <div className="flex flex-col items-center space-y-1">
              <div className="rack-screw" />
              <span className="text-[7px] font-mono text-amber-400/70 font-bold">{device.heightUnits}U</span>
            </div>

            {device.heightUnits >= 2 && (
              <div className="w-2.5 h-16 rounded-full bg-gradient-to-r from-amber-300 via-amber-100 to-amber-500 shadow-lg border border-amber-700/60 my-auto cursor-grab" />
            )}

            <div className="rack-screw" />
          </div>

          {/* CENTER FACEPLATE (FRONT OR REAR PATCH BAY) */}
          <div className="flex-1 flex flex-col min-w-0 p-3.5 relative">
            {/* Ornamental Ethnic Brass Filigree Border for Indian Classical & World Acoustic Suite */}
            {isWorldAcoustic && !isBackView && (
              <div
                className="absolute inset-x-3 top-0.5 h-1 pointer-events-none opacity-60 rounded-full"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, #f59e0b 0px, #f59e0b 6px, transparent 6px, transparent 10px, #fbbf24 10px, #fbbf24 12px)',
                }}
              />
            )}

            {/* Device Header Bar */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-black/25 select-none">
              <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
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
                  <div className={`led-indicator ${device.isPowered ? 'active-blue' : ''}`} />
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
                <span
                  className={`text-xs font-bold font-mono tracking-widest uppercase px-2.5 py-0.5 rounded border shadow-sm ${
                    isWorldAcoustic
                      ? 'bg-[#1a0d05]/90 border-amber-500/50 text-amber-300'
                      : 'bg-black/40 border-white/10'
                  }`}
                >
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
                <span className="text-[9px] font-mono opacity-70 uppercase font-semibold">
                  {isBackView ? 'REAR PATCH BAY · 1/4" TRS & CV' : `SERIES 500 · ${device.type.toUpperCase()}`}
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
                  <span className="tracking-widest flex items-center space-x-1.5 text-neutral-200 font-bold">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    <span>REAR ANODIZED PATCH BAY · {device.name.toUpperCase()}</span>
                  </span>
                  <span className="text-[9px] text-amber-400/80 font-mono flex items-center space-x-1">
                    <RotateCw className="w-3 h-3" />
                    <span>1/4-INCH GOLD TS/TRS · BALANCED 600&Omega;</span>
                  </span>
                </div>

                {/* Patch Jacks Grid with Color-Coded LED Signal Rings */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-center justify-items-center bg-black/65 p-3 rounded border border-neutral-800 shadow-inner">
                  {device.ports.map((port) => {
                    const jackKey = `${device.id}:${port.id}`;
                    const isConnected = connectedPortsMap.has(jackKey);
                    const cableColor = connectedPortsMap.get(jackKey);

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
                          isIncompatible = true;
                          incompatibleReason = activeIsCV
                            ? 'Cannot plug CV into an Audio jack!'
                            : 'Cannot plug Audio into a CV jack!';
                        } else if (activeIsOut === targetIsOut) {
                          isIncompatible = true;
                          incompatibleReason = activeIsOut
                            ? 'Outputs must connect to Inputs (cannot connect Output to Output)'
                            : 'Inputs must connect from Outputs (cannot connect Input to Input)';
                        } else if (activeConnectingJack.deviceId === device.id && !activeIsCV) {
                          isIncompatible = true;
                          incompatibleReason = 'Cannot loop a device output directly into its own input';
                        } else {
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
                  <span>1V/OCT PITCH &plusmn;5V BI-POLAR CV · LED SIGNAL RING ACTIVE</span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT RACK EAR */}
          <div
            className={`w-10 sm:w-11 flex-shrink-0 flex flex-col justify-between items-center py-2 px-1 border-l shadow-inner ${
              isWorldAcoustic
                ? 'bg-gradient-to-b from-[#3d2610] via-[#261709] to-[#3d2610] border-amber-600/40'
                : 'border-neutral-900 bg-neutral-950'
            }`}
          >
            <div className="flex flex-col items-center space-y-1">
              <div className="rack-screw" />
              <span className="text-[7px] font-mono text-amber-400/70 font-bold">{device.heightUnits}U</span>
            </div>

            {device.heightUnits >= 2 && (
              <div className="w-2.5 h-16 rounded-full bg-gradient-to-r from-amber-300 via-amber-100 to-amber-500 shadow-lg border border-amber-700/60 my-auto cursor-grab" />
            )}

            <div className="rack-screw" />
          </div>

          {/* RIGHT WOODEN BOX CHEEK */}
          <div
            className={`w-5 sm:w-6 flex-shrink-0 rounded-r-md flex flex-col justify-between items-center py-2 border-l shadow-lg select-none ${
              isWorldAcoustic
                ? 'bg-gradient-to-b from-[#4a1c0d] via-[#331107] to-[#4a1c0d] border-amber-500/40'
                : 'wooden-cheek border-[#1a0f07]'
            }`}
          >
            <div className="brass-screw" title="Countersunk Brass Chassis Screw" />
            <span className="text-[6px] font-mono font-black text-amber-200/50 -rotate-90 tracking-widest uppercase pointer-events-none">
              {isWorldAcoustic ? 'ROSEWOOD' : 'TIMBER'}
            </span>
            <div className="brass-screw" title="Countersunk Brass Chassis Screw" />
          </div>
        </div>
      </div>
    </div>
  );
};

