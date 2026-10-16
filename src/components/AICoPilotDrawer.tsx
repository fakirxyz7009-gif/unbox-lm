import React, { useState } from 'react';
import { BaseDevice } from '../audio/BaseDevice.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { Sparkles, Bot, Sliders, Disc, Wand2, CheckCircle2, ChevronRight, X, Play, Zap } from 'lucide-react';

interface AICoPilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  audioEngine: AudioEngine;
  devices: BaseDevice[];
}

export const AICoPilotDrawer: React.FC<AICoPilotDrawerProps> = ({
  isOpen,
  onClose,
  audioEngine,
  devices,
}) => {
  const [activeTab, setActiveTab] = useState<'spawn' | 'preset' | 'mastering'>('spawn');

  // Spawn tab state
  const [spawnPrompt, setSpawnPrompt] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);
  const [spawnResult, setSpawnResult] = useState<any>(null);

  // Preset tab state
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState(0);
  const [presetPrompt, setPresetPrompt] = useState('');
  const [isGeneratingPreset, setIsGeneratingPreset] = useState(false);
  const [presetResult, setPresetResult] = useState<any>(null);

  // Mastering tab state
  const [masterGoal, setMasterGoal] = useState('Warm Analog Tape Master');
  const [isAnalyzingMaster, setIsAnalyzingMaster] = useState(false);
  const [masterAdvice, setMasterAdvice] = useState<any>(null);

  if (!isOpen) return null;

  // 1. Natural Language Device & Chain Spawning
  const handleSpawnChain = async () => {
    if (!spawnPrompt.trim()) return;
    setIsSpawning(true);
    setSpawnResult(null);

    try {
      const res = await fetch('/api/gemini/device-spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: spawnPrompt }),
      });
      const data = await res.json();
      setSpawnResult(data);

      // Automatically construct the chain in Unboxed rack!
      if (data.devices && Array.isArray(data.devices)) {
        const spawnedDeviceIds: string[] = [];

        // 1. Create devices
        data.devices.forEach((d: any) => {
          const dev = audioEngine.createDevice(d.type, d.customName);
          spawnedDeviceIds.push(dev.id);
          if (d.parameters) {
            Object.entries(d.parameters).forEach(([k, v]) => {
              dev.setParam(k, v);
            });
          }
        });

        // 2. Patch Audio cables
        if (data.audioConnections && Array.isArray(data.audioConnections)) {
          data.audioConnections.forEach((c: any) => {
            const srcId = spawnedDeviceIds[c.sourceDeviceIndex];
            const tgtId = spawnedDeviceIds[c.targetDeviceIndex];
            if (srcId && tgtId) {
              audioEngine.connectAudio(srcId, c.sourceJack, tgtId, c.targetJack);
            }
          });
        }

        // 3. Patch CV cables
        if (data.cvConnections && Array.isArray(data.cvConnections)) {
          data.cvConnections.forEach((c: any) => {
            const srcId = spawnedDeviceIds[c.sourceDeviceIndex];
            const tgtId = spawnedDeviceIds[c.targetDeviceIndex];
            if (srcId && tgtId) {
              audioEngine.connectCV(srcId, c.sourceJack, tgtId, c.targetJack, c.amount || 1.0);
            }
          });
        }

        if (data.bpm) {
          audioEngine.setBpm(data.bpm);
        }
      }
    } catch (e) {
      console.error('Failed to spawn device chain:', e);
    } finally {
      setIsSpawning(false);
    }
  };

  // 2. Musically Relevant Preset Generation
  const handleGeneratePreset = async () => {
    const targetDev = devices[selectedDeviceIndex];
    if (!targetDev || !presetPrompt.trim()) return;

    setIsGeneratingPreset(true);
    setPresetResult(null);

    try {
      const res = await fetch('/api/gemini/generate-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceType: targetDev.type,
          prompt: presetPrompt,
        }),
      });
      const data = await res.json();
      setPresetResult(data);

      // Apply parameters live to the device
      if (data.parameters) {
        Object.entries(data.parameters).forEach(([k, v]) => {
          targetDev.setParam(k, v);
        });
      }
    } catch (e) {
      console.error('Failed to generate preset:', e);
    } finally {
      setIsGeneratingPreset(false);
    }
  };

  // 3. AI Mixing & Mastering Assistant
  const handleAnalyzeMix = async () => {
    setIsAnalyzingMaster(true);
    setMasterAdvice(null);

    try {
      const sessionSummary = {
        deviceCount: devices.length,
        devices: devices.map((d) => ({ name: d.name, type: d.type })),
        telemetry: audioEngine.telemetry,
        masterLimiterThreshold: -0.5,
      };

      const res = await fetch('/api/gemini/mix-master-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionInfo: sessionSummary,
          userGoal: masterGoal,
        }),
      });
      const data = await res.json();
      setMasterAdvice(data);
    } catch (e) {
      console.error('Failed to analyze mix:', e);
    } finally {
      setIsAnalyzingMaster(false);
    }
  };

  // Apply One-Click Mastering Preset
  const handleApplyMasterPreset = () => {
    if (!masterAdvice?.oneClickPreset) return;
    const p = masterAdvice.oneClickPreset;
    const mclass = devices.find((d) => d.type === 'mclass_master');
    if (mclass) {
      if (p.eqLowGain !== undefined) mclass.setParam('eqLowGain', p.eqLowGain);
      if (p.eqMidGain !== undefined) mclass.setParam('eqLowMidGain', p.eqMidGain);
      if (p.eqHighGain !== undefined) mclass.setParam('eqHighGain', p.eqHighGain);
      if (p.compThreshold !== undefined) mclass.setParam('compThreshold', p.compThreshold);
      if (p.compRatio !== undefined) mclass.setParam('compRatio', p.compRatio);
      if (p.compAttack !== undefined) mclass.setParam('compAttack', p.compAttack / 1000);
      if (p.compRelease !== undefined) mclass.setParam('compRelease', p.compRelease / 1000);
      if (p.limiterCeiling !== undefined) mclass.setParam('limiterCeiling', p.limiterCeiling);
      if (p.warmthDrive !== undefined) mclass.setParam('warmthDrive', p.warmthDrive);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-neutral-950/95 border-l border-neutral-800 shadow-2xl flex flex-col backdrop-blur-md animate-in slide-in-from-right duration-200 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-900/80">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-neutral-100 flex items-center space-x-1.5">
              <span>UNBOXED AI CO-PILOT</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-indigo-950 text-indigo-400 border border-indigo-700/50 rounded">
                STUDIO DSP
              </span>
            </h2>
            <p className="text-[11px] text-neutral-400">Generative rack architect, sound designer & mastering acoustician</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 bg-neutral-950 px-4 pt-2">
        <button
          onClick={() => setActiveTab('spawn')}
          className={`flex-1 py-2 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center justify-center space-x-1.5 ${
            activeTab === 'spawn'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Rack Builder</span>
        </button>
        <button
          onClick={() => setActiveTab('preset')}
          className={`flex-1 py-2 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center justify-center space-x-1.5 ${
            activeTab === 'preset'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Preset Crafter</span>
        </button>
        <button
          onClick={() => setActiveTab('mastering')}
          className={`flex-1 py-2 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center justify-center space-x-1.5 ${
            activeTab === 'mastering'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Disc className="w-3.5 h-3.5" />
          <span>Mix & Master</span>
        </button>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* TAB 1: DEVICE & CHAIN SPAWNER */}
        {activeTab === 'spawn' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800">
              <span className="text-[11px] font-mono uppercase text-indigo-400 font-bold block mb-1">
                NATURAL LANGUAGE RACK SPAWNING
              </span>
              <p className="text-xs text-neutral-400 mb-3">
                Describe the sonic world, genre, or instrument chain you want. Unboxed AI will spawn the units, tweak every parameter, and patch both audio and CV cables.
              </p>

              <textarea
                value={spawnPrompt}
                onChange={(e) => setSpawnPrompt(e.target.value)}
                placeholder="e.g. Build an aggressive acid bass rig with Subtractor, Scream 4 tape saturation, and The Echo delay modulated by Matrix CV..."
                className="w-full h-24 bg-neutral-950 border border-neutral-700 rounded-md p-3 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-indigo-500 resize-none font-sans"
              />

              <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                {[
                  'Gritty synthwave bassline setup',
                  'Europa ambient dreamscape pad with hall reverb',
                  'Groovy 90s hip hop drum & sub bass rig',
                  'Dark distorted industrial lead',
                ].map((quick) => (
                  <button
                    key={quick}
                    onClick={() => setSpawnPrompt(quick)}
                    className="text-[10px] font-mono px-2 py-1 rounded bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700/60 transition-colors"
                  >
                    + {quick}
                  </button>
                ))}
              </div>

              <button
                onClick={handleSpawnChain}
                disabled={isSpawning || !spawnPrompt.trim()}
                className="w-full py-2.5 rounded-md font-mono text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSpawning ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Architecting & Cabling Rack...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Spawn & Auto-Patch Rack</span>
                  </>
                )}
              </button>
            </div>

            {spawnResult && (
              <div className="p-4 rounded-lg bg-indigo-950/30 border border-indigo-800/60 space-y-2 animate-in fade-in">
                <div className="flex items-center space-x-2 text-indigo-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase">{spawnResult.rackName}</span>
                </div>
                <p className="text-xs text-neutral-300">{spawnResult.description}</p>
                <div className="text-[10px] font-mono text-neutral-400 pt-1 border-t border-indigo-900/40 flex justify-between">
                  <span>UNITS SPAWNED: {spawnResult.devices?.length || 0}</span>
                  <span>CABLES PATCHED: {(spawnResult.audioConnections?.length || 0) + (spawnResult.cvConnections?.length || 0)}</span>
                  <span>TEMPO: {spawnResult.bpm || 120} BPM</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PRESET CRAFTER */}
        {activeTab === 'preset' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800">
              <span className="text-[11px] font-mono uppercase text-amber-400 font-bold block mb-1">
                TARGET RACK DEVICE
              </span>
              <select
                value={selectedDeviceIndex}
                onChange={(e) => setSelectedDeviceIndex(Number(e.target.value))}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-md p-2 text-xs text-neutral-200 mb-3 focus:outline-none focus:border-amber-500 font-mono"
              >
                {devices.map((d, idx) => (
                  <option key={d.id} value={idx}>
                    [{d.type.toUpperCase()}] {d.name}
                  </option>
                ))}
              </select>

              <span className="text-[11px] font-mono uppercase text-amber-400 font-bold block mb-1">
                PRESET PROMPT
              </span>
              <textarea
                value={presetPrompt}
                onChange={(e) => setPresetPrompt(e.target.value)}
                placeholder="e.g. Generate a dark, ambient pad preset with long slow filter sweep..."
                className="w-full h-20 bg-neutral-950 border border-neutral-700 rounded-md p-3 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-amber-500 resize-none font-sans"
              />

              <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                {[
                  'Punchy 80s Stranger Things bass',
                  'Warm analog tube overdrive',
                  'Ethereal Blade Runner pad',
                  'Tight snappy drum bus compression',
                ].map((sample) => (
                  <button
                    key={sample}
                    onClick={() => setPresetPrompt(sample)}
                    className="text-[10px] font-mono px-2 py-1 rounded bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700/60"
                  >
                    + {sample}
                  </button>
                ))}
              </div>

              <button
                onClick={handleGeneratePreset}
                disabled={isGeneratingPreset || !presetPrompt.trim()}
                className="w-full py-2.5 rounded-md font-mono text-xs font-bold uppercase tracking-wider bg-amber-600 hover:bg-amber-500 text-neutral-950 shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingPreset ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-neutral-950/20 border-t-neutral-950 rounded-full animate-spin" />
                    <span>Synthesizing DSP Preset...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>Generate & Apply Preset Live</span>
                  </>
                )}
              </button>
            </div>

            {presetResult && (
              <div className="p-4 rounded-lg bg-amber-950/30 border border-amber-800/60 space-y-2 animate-in fade-in">
                <div className="flex items-center space-x-2 text-amber-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase">{presetResult.presetName}</span>
                </div>
                <p className="text-xs text-neutral-300">{presetResult.description}</p>
                <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-neutral-400 pt-2 border-t border-amber-900/40">
                  {presetResult.parameters &&
                    Object.entries(presetResult.parameters).map(([k, v]) => (
                      <div key={k} className="flex justify-between bg-black/30 px-1.5 py-0.5 rounded">
                        <span className="text-neutral-500">{k}:</span>
                        <span className="text-amber-300">{typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: AI MIXING & MASTERING ASSISTANT */}
        {activeTab === 'mastering' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800">
              <span className="text-[11px] font-mono uppercase text-emerald-400 font-bold block mb-1">
                TARGET MASTERING PROFILE & GENRE
              </span>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  'Warm Analog Tape Master',
                  'Heavy Club Ready Punch',
                  'Modern Pop Air & Polish',
                  'Vintage Vinyl Lofi Warmth',
                ].map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setMasterGoal(genre)}
                    className={`p-2 rounded text-left text-xs font-mono border transition-all ${
                      masterGoal === genre
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>

              <button
                onClick={handleAnalyzeMix}
                disabled={isAnalyzingMaster}
                className="w-full py-2.5 rounded-md font-mono text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-neutral-950 shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isAnalyzingMaster ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-neutral-950/20 border-t-neutral-950 rounded-full animate-spin" />
                    <span>Analyzing Multi-Stem Acoustics...</span>
                  </>
                ) : (
                  <>
                    <Disc className="w-4 h-4" />
                    <span>Analyze Session & Master Bus</span>
                  </>
                )}
              </button>
            </div>

            {masterAdvice && (
              <div className="space-y-3 animate-in fade-in">
                {/* Master Bus Telemetry Analysis */}
                <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2">
                  <span className="text-[11px] font-mono uppercase text-emerald-400 font-bold block">
                    MASTER BUS ACOUSTIC AUDIT
                  </span>
                  <p className="text-xs text-neutral-300">{masterAdvice.summary}</p>
                  <div className="grid grid-cols-3 gap-2 pt-2 text-[10px] font-mono">
                    <div className="bg-black/40 p-2 rounded border border-neutral-800">
                      <span className="text-neutral-500 block">DYNAMIC RANGE</span>
                      <span className="text-emerald-400 font-bold">{masterAdvice.masterBusAnalysis?.dynamicRange}</span>
                    </div>
                    <div className="bg-black/40 p-2 rounded border border-neutral-800">
                      <span className="text-neutral-500 block">LOUDNESS</span>
                      <span className="text-emerald-400 font-bold">{masterAdvice.masterBusAnalysis?.perceivedLoudness}</span>
                    </div>
                    <div className="bg-black/40 p-2 rounded border border-neutral-800">
                      <span className="text-neutral-500 block">TONAL PROFILE</span>
                      <span className="text-emerald-400 font-bold">{masterAdvice.masterBusAnalysis?.tonalBalance}</span>
                    </div>
                  </div>
                </div>

                {/* Track-by-Track Recommendations */}
                <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2">
                  <span className="text-[11px] font-mono uppercase text-amber-400 font-bold block">
                    TRACK-BY-TRACK RECOMMENDATIONS
                  </span>
                  <div className="space-y-2">
                    {masterAdvice.trackRecommendations?.map((rec: any, idx: number) => (
                      <div key={idx} className="p-2 rounded bg-black/40 border border-neutral-800 text-xs space-y-1">
                        <div className="flex justify-between font-mono font-bold text-neutral-200">
                          <span>{rec.track}</span>
                          <span className="text-amber-400 text-[10px]">{rec.suggestedEQ}</span>
                        </div>
                        <p className="text-neutral-400 text-[11px]">{rec.solution}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 1-Click Master Application */}
                {masterAdvice.oneClickPreset && (
                  <button
                    onClick={handleApplyMasterPreset}
                    className="w-full py-2.5 rounded-md font-mono text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 shadow-xl transition-all flex items-center justify-center space-x-2"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Apply 1-Click {masterAdvice.oneClickPreset.name}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
