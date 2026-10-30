import React, { useRef, useSyncExternalStore } from 'react';
import { BaseDevice } from '../audio/BaseDevice.ts';
import { useEscapeKey } from '../shell/useEscapeKey.ts';
import { CVEngine } from '../audio/CVEngine.ts';
import { useFrame } from '../nexa/useEngine.ts';
import { setWidth } from '../ui/skin/dom.ts';
import {
  X,
  Plus,
  Trash2,
  Sliders,
  ArrowRight,
  Zap,
} from 'lucide-react';
interface CVMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: BaseDevice[];
  cvEngine: CVEngine;
}

/** A live CV readout must never cause the full matrix to re-render. */
function CVMeter({ cvEngine, entryId }: { cvEngine: CVEngine; entryId: string }) {
  const meterRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const shown = useRef('');
  useFrame(() => {
    const value = cvEngine.liveMeterValues.get(entryId) ?? 0;
    setWidth(fillRef.current, (value + 1) * 50);
    const text = value.toFixed(2);
    if (shown.current === text) return;
    shown.current = text;
    const meter = meterRef.current;
    if (!meter) return;
    meter.title = `Live CV: ${text}V`;
    meter.setAttribute('aria-valuenow', text);
    meter.setAttribute('aria-valuetext', `${text} volts`);
  });
  return (
    <div
      ref={meterRef}
      data-testid={`cv-meter-${entryId}`}
      role="meter"
      aria-label="Live CV"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={0}
      className="w-14 h-5 rounded bg-neutral-900 border border-neutral-800 overflow-hidden relative shadow-inner flex items-center"
      title="Live CV: 0.00V"
    >
      <div ref={fillRef} data-testid={`cv-meter-fill-${entryId}`} className="absolute h-full bg-gradient-to-r from-cyan-600 via-amber-500 to-red-500 transition-[width] duration-75" style={{ width: 0 }} />
      <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/40" />
    </div>
  );
}

export const CVMatrixModal: React.FC<CVMatrixModalProps> = ({
  isOpen,
  onClose,
  devices,
  cvEngine,
}) => {
  useEscapeKey(onClose, isOpen);
  // Re-render only when mappings or available devices structurally change. Live meters update in
  // CVMeter through the shared animation-frame service, not through React state.
  useSyncExternalStore(
    (callback) => cvEngine.subscribeMatrix(callback),
    () => cvEngine.matrixVersion(),
    () => 0,
  );

  if (!isOpen) return null;

  // Extract all available CV Sources across all session devices
  const sources: { deviceId: string; deviceName: string; portId: string; portName: string }[] = [];
  devices.forEach((dev) => {
    dev.ports
      .filter((p) => p.type === 'cv_out')
      .forEach((p) => {
        sources.push({
          deviceId: dev.id,
          deviceName: dev.name,
          portId: p.id,
          portName: p.name,
        });
      });
  });

  // Extract all available CV Destinations across all session devices
  const destinations: { deviceId: string; deviceName: string; paramId: string; paramName: string }[] = [];
  devices.forEach((dev) => {
    dev.ports
      .filter((p) => p.type === 'cv_in')
      .forEach((p) => {
        destinations.push({
          deviceId: dev.id,
          deviceName: dev.name,
          paramId: p.id,
          paramName: p.name,
        });
      });
  });

  const handleAddDefaultMapping = () => {
    if (sources.length === 0 || destinations.length === 0) return;
    cvEngine.addMatrixEntry({
      sourceDeviceId: sources[0].deviceId,
      sourcePortId: sources[0].portId,
      targetDeviceId: destinations[0].deviceId,
      targetParam: destinations[0].paramId,
      amount: 0.5,
      offset: 0,
      inverted: false,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden text-neutral-100 font-sans">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 bg-neutral-950">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-wide uppercase font-mono text-neutral-100">
                Control Voltage (CV) Modulation Matrix
              </h2>
              <p className="text-xs text-neutral-400">
                Route multi-source LFOs, sequencers, and envelope modulators to parameters with bipolar scaling and inversion.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-mono text-neutral-400">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>ACTIVE MODULATION ROUTES: {cvEngine.matrixEntries.length}</span>
            </div>
            <button
              onClick={handleAddDefaultMapping}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold bg-amber-600 hover:bg-amber-500 text-neutral-950 transition-colors shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>ADD CV ROUTE</span>
            </button>
          </div>

          {cvEngine.matrixEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-neutral-800 rounded-lg text-neutral-500 text-center">
              <Sliders className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm font-medium">No CV modulation mappings currently active.</p>
              <p className="text-xs text-neutral-600 mt-1 max-w-sm">
                Add a new CV routing connection to modulate filters, delay feedback, pitch detuning, or distortion stages.
              </p>
              <button
                onClick={handleAddDefaultMapping}
                className="mt-4 px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono uppercase tracking-wider"
              >
                Create First Route
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {cvEngine.matrixEntries.map((entry) => {
                return (
                  <div
                    key={entry.id}
                    className="flex flex-col md:flex-row items-center justify-between p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 gap-4 shadow-sm"
                  >
                    {/* Source Selection */}
                    <div className="flex flex-col w-full md:w-56">
                      <span className="text-[11px] font-mono uppercase text-amber-400 font-bold mb-1">
                        CV SOURCE
                      </span>
                      <select
                        value={`${entry.sourceDeviceId}:${entry.sourcePortId}`}
                        onChange={(e) => {
                          const [dId, pId] = e.target.value.split(':');
                          cvEngine.updateMatrixEntry(entry.id, {
                            sourceDeviceId: dId,
                            sourcePortId: pId,
                          });
                        }}
                        className="bg-neutral-900 border border-neutral-700 rounded text-xs px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
                      >
                        {sources.map((s) => (
                          <option key={`${s.deviceId}:${s.portId}`} value={`${s.deviceId}:${s.portId}`}>
                            {s.deviceName} &rarr; {s.portName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <ArrowRight className="w-4 h-4 text-neutral-500 hidden md:block flex-shrink-0" />

                    {/* Destination Selection */}
                    <div className="flex flex-col w-full md:w-56">
                      <span className="text-[11px] font-mono uppercase text-sky-400 font-bold mb-1">
                        DESTINATION PARAMETER
                      </span>
                      <select
                        value={`${entry.targetDeviceId}:${entry.targetParam}`}
                        onChange={(e) => {
                          const [dId, pId] = e.target.value.split(':');
                          cvEngine.updateMatrixEntry(entry.id, {
                            targetDeviceId: dId,
                            targetParam: pId,
                          });
                        }}
                        className="bg-neutral-900 border border-neutral-700 rounded text-xs px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-sky-500"
                      >
                        {destinations.map((d) => (
                          <option key={`${d.deviceId}:${d.paramId}`} value={`${d.deviceId}:${d.paramId}`}>
                            {d.deviceName} &rarr; {d.paramName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Scale & Invert Controls */}
                    <div className="flex flex-col flex-1 w-full min-w-[140px]">
                      <div className="flex justify-between items-center text-[11px] font-mono text-neutral-400 mb-1">
                        <span>DEPTH: {(entry.amount * 100).toFixed(0)}%</span>
                        <span>OFFSET: {entry.offset > 0 ? `+${entry.offset.toFixed(2)}` : entry.offset.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={entry.amount}
                        onChange={(e) =>
                          cvEngine.updateMatrixEntry(entry.id, { amount: parseFloat(e.target.value) })
                        }
                        className="w-full accent-amber-500 cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
                      />
                    </div>

                    {/* Polarity Invert & Live Signal Meter */}
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <button
                        onClick={() =>
                          cvEngine.updateMatrixEntry(entry.id, { inverted: !entry.inverted })
                        }
                        className={`text-[11px] font-mono px-2 py-1 rounded border font-bold transition-colors ${
                          entry.inverted
                            ? 'bg-red-950 border-red-600 text-red-400'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200'
                        }`}
                        title="Invert Polarity"
                      >
                        {entry.inverted ? 'INV (-)' : 'NORM (+)'}
                      </button>

                      <CVMeter cvEngine={cvEngine} entryId={entry.id} />

                      <button
                        onClick={() => cvEngine.removeMatrixEntry(entry.id)}
                        className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between text-xs text-neutral-500 font-mono">
          <span>HIGH-PRECISION 60FPS CV DSP ENGINE</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-sans font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
