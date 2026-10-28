/**
 * AI Co-Pilot: rack builder (AI Combinator), preset crafter for one device (validated against the
 * device's real parameters), and a mix & master assistant built on measurements of the song.
 * Every tab works without an API key (local planner / keyword rules / measurements only).
 */
import { useState } from 'react';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import { Sparkles, Bot, Cpu, Disc, Wand2, CheckCircle2, X, AlertCircle, Undo2 } from 'lucide-react';
import { applyRackPlan, requestRackPlan } from '../ai/rackCombinator.ts';
import { vstLibrary } from '../vst/libraryClient.ts';
import { deviceParams } from '../audio/deviceParams.ts';
import { localPreset, validatePreset, type CraftedPreset, type PresetParam } from '../../shared/rack/presetCraft.ts';
import { MASTER_TARGETS, analyzeMix, autoMaster, suggestMastering, type MixAnalysis } from '../audio/mastering/assistant.ts';
import { LocalAiPanel } from './LocalAiPanel.tsx';

interface AICoPilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  audioEngine: AudioEngine;
  devices: BaseDevice[];
  /** Called after a Combinator was mounted (e.g. to show the rack's rear panel). */
  onRackBuilt?: () => void;
  onOpenMastering?: () => void;
}

interface SpawnResult {
  rackName: string;
  description: string;
  units: number;
  cables: number;
  bpm: number;
  source: string;
  warnings: string[];
  error?: string;
}

/** The device's adjustable parameters with ranges and current values. */
const presetParamsOf = (dev: BaseDevice): PresetParam[] =>
  deviceParams(dev).map(({ key, label, min, max, value, options }) => ({ key, label, min, max, value, options }));

const isCrafted = (x: unknown): x is CraftedPreset =>
  !!x && typeof x === 'object' && typeof (x as CraftedPreset).presetName === 'string' && !!(x as CraftedPreset).parameters && typeof (x as CraftedPreset).parameters === 'object';

const fmt = (v: number, d = 1) => (Number.isFinite(v) && v > -69.9 ? v.toFixed(d) : '—');

export function AICoPilotDrawer({ isOpen, onClose, audioEngine, devices, onRackBuilt, onOpenMastering }: AICoPilotDrawerProps) {
  const [activeTab, setActiveTab] = useState<'spawn' | 'preset' | 'mastering' | 'local'>('spawn');

  // rack builder
  const [spawnPrompt, setSpawnPrompt] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);
  const [spawnResult, setSpawnResult] = useState<SpawnResult | null>(null);

  // preset crafter
  const craftable = devices.filter((d) => presetParamsOf(d).length > 0);
  const [deviceId, setDeviceId] = useState('');
  const [presetPrompt, setPresetPrompt] = useState('');
  const [isGeneratingPreset, setIsGeneratingPreset] = useState(false);
  const [presetResult, setPresetResult] = useState<(CraftedPreset & { warning?: string; deviceId: string; previous: Record<string, number> }) | null>(null);
  const [presetError, setPresetError] = useState('');

  // mix & master
  const [goal, setGoal] = useState(MASTER_TARGETS[0].id);
  const [busy, setBusy] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{ m: MixAnalysis; notes: string[] } | null>(null);
  const [mastered, setMastered] = useState<MixAnalysis | null>(null);
  const [aiNotes, setAiNotes] = useState<{ summary: string | null; tips: string[]; source: string; model?: string } | null>(null);
  const [masterError, setMasterError] = useState('');

  if (!isOpen) return null;

  const handleSpawnChain = async () => {
    const prompt = spawnPrompt.trim();
    if (!prompt) return;
    setIsSpawning(true);
    setSpawnResult(null);
    try {
      if (!vstLibrary.manifest) await vstLibrary.load();
      const res = await requestRackPlan(prompt);
      const applied = applyRackPlan(audioEngine, res.plan, { prompt, source: res.source });
      setSpawnResult({
        rackName: res.plan.name,
        description: res.plan.description,
        units: applied.deviceIds.length,
        cables: applied.audioCables + applied.cvCables,
        bpm: applied.bpmSet ?? audioEngine.bpm,
        source: res.source === 'gemini' ? `Gemini${res.model ? ` (${res.model})` : ''}` : res.source === 'local' ? 'Local planner' : 'In-app planner (offline)',
        warnings: [...res.warnings, ...applied.warnings],
      });
      if (applied.deviceIds.length) onRackBuilt?.();
    } catch (e) {
      setSpawnResult({ rackName: '', description: '', units: 0, cables: 0, bpm: audioEngine.bpm, source: '', warnings: [], error: (e as Error).message });
    } finally {
      setIsSpawning(false);
    }
  };

  const target = craftable.find((d) => d.id === deviceId) ?? craftable[0];
  const handleGeneratePreset = async () => {
    const dev = target;
    const prompt = presetPrompt.trim();
    if (!dev || !prompt) return;
    const params = presetParamsOf(dev);
    setIsGeneratingPreset(true);
    setPresetError('');
    setPresetResult(null);
    let preset: (CraftedPreset & { warning?: string }) | null = null;
    try {
      const res = await fetch('/api/gemini/generate-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceType: dev.type, deviceName: dev.name, prompt, params }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : `Server error ${res.status}`;
        if (res.status === 400 || res.status === 429) {
          setPresetError(msg);
          return;
        }
        throw new Error(msg);
      }
      if (!isCrafted(data)) throw new Error('Unexpected answer');
      // validate again here: the server is trusted for transport, not for values
      const v = validatePreset(Object.entries(data.parameters).map(([key, value]) => ({ key, value })), params);
      preset = { ...data, parameters: v.parameters, skipped: [...(data.skipped ?? []), ...v.skipped] };
    } catch {
      // server unreachable (static desktop build, offline): same rules in the browser
      preset = localPreset(prompt, params, 'local-offline');
    } finally {
      setIsGeneratingPreset(false);
    }
    if (!preset) return;
    const previous: Record<string, number> = {};
    for (const [k, v] of Object.entries(preset.parameters)) {
      const cur = dev.params[k];
      if (typeof cur === 'number') previous[k] = cur;
      dev.setParam(k, v);
    }
    audioEngine.changed();
    setPresetResult({ ...preset, deviceId: dev.id, previous });
  };

  const undoPreset = () => {
    const r = presetResult;
    const dev = r ? devices.find((d) => d.id === r.deviceId) : undefined;
    if (!r || !dev) return;
    Object.entries(r.previous).forEach(([k, v]) => dev.setParam(k, v));
    audioEngine.changed();
    setPresetResult(null);
  };

  const t = MASTER_TARGETS.find((x) => x.id === goal) ?? MASTER_TARGETS[0];
  const run = async (fn: () => Promise<void>) => {
    setMasterError('');
    try {
      await fn();
    } catch (e) {
      setMasterError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const analyze = () =>
    run(async () => {
      setBusy('Rendering the song');
      const m = await analyzeMix(audioEngine, false, (f) => setBusy(`Rendering the song · ${Math.round(f * 100)} %`));
      if (!(m.loudness.integrated > -60)) throw new Error('The song is silent — add notes or audio first.');
      const { notes } = suggestMastering(m, t);
      setAnalysis({ m, notes });
      setMastered(null);
      setAiNotes(null);
      setBusy('Asking the AI for mixing notes');
      try {
        const res = await fetch('/api/gemini/mix-master-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal: t.label,
            notes,
            measurements: {
              integratedLufs: m.loudness.integrated,
              truePeakDb: m.loudness.truePeakDb,
              loudnessRangeLu: m.loudness.lra,
              plrDb: m.loudness.plr,
              tiltDbPerOctave: m.tilt,
              correlation: m.correlation,
              lowCorrelation: m.lowCorrelation,
              sideToMidDb: m.sideDb,
              seconds: m.seconds,
              ...Object.fromEntries(m.octaves.map((v, i) => [`octave${i}`, v])),
            },
          }),
        });
        const data: unknown = await res.json();
        if (res.ok && data && typeof data === 'object') {
          const d = data as { summary?: unknown; tips?: unknown; source?: unknown; model?: unknown };
          setAiNotes({
            summary: typeof d.summary === 'string' ? d.summary : null,
            tips: Array.isArray(d.tips) ? d.tips.filter((x): x is string => typeof x === 'string') : [],
            source: typeof d.source === 'string' ? d.source : 'none',
            model: typeof d.model === 'string' ? d.model : undefined,
          });
        }
      } catch {
        setAiNotes({ summary: null, tips: [], source: 'offline' });
      }
    });
  const master = () =>
    run(async () => {
      const r = await autoMaster(audioEngine, t, (f, label) => setBusy(`${label} · ${Math.round(f * 100)} %`));
      audioEngine.mastering.set(r.state);
      audioEngine.changed();
      setAnalysis({ m: r.before, notes: r.notes });
      setMastered(r.after);
    });

  const tabBtn = (id: typeof activeTab, label: string, Icon: typeof Bot, color: string) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex-1 py-2.5 text-[11px] font-mono uppercase tracking-wider font-bold border-b-2 flex items-center justify-center gap-1.5 ${
        activeTab === id ? `${color} text-white` : 'border-transparent text-neutral-500 hover:text-neutral-300'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-chrome-0/95 border-l border-chrome-line shadow-2xl flex flex-col backdrop-blur-md select-none" role="dialog" aria-label="AI Co-Pilot">
      <div className="flex items-center justify-between px-5 py-4 border-b border-chrome-line bg-chrome-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[18px] font-bold tracking-wide font-label text-white">AI Co-Pilot</h2>
            <p className="text-[11px] text-neutral-400">Rack builder · preset crafter · mix &amp; master · local AI</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-chrome-line bg-chrome-0 px-4 pt-2">
        {tabBtn('spawn', 'Rack builder', Bot, 'border-indigo-500')}
        {tabBtn('preset', 'Preset crafter', Wand2, 'border-amber-500')}
        {tabBtn('mastering', 'Mix & master', Disc, 'border-emerald-500')}
        {tabBtn('local', 'Local AI', Cpu, 'border-sky-500')}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {activeTab === 'local' && <LocalAiPanel audioEngine={audioEngine} />}
        {activeTab === 'spawn' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-black/30 border border-chrome-line">
              <span className="text-[11px] font-mono uppercase text-indigo-400 font-bold block mb-1">AI Combiner · plugin library + built-in devices</span>
              <p className="text-xs text-neutral-400 mb-3">
                Describe the device setup you want. The AI only selects and configures devices already in the rack catalog or library, then patches and groups them in a Combiner; it does not create or render audio. Playback comes from local Web Audio DSP, recorded sample packs, or clearly labeled library proxy DSP. Without an API key a local planner does the setup.
              </p>
              <textarea
                value={spawnPrompt}
                onChange={(e) => setSpawnPrompt(e.target.value)}
                maxLength={2000}
                placeholder="e.g. Dark cinematic strings with lush reverb, or: vocal chain with autotune, EQ and loudness"
                className="w-full h-24 bg-neutral-950 border border-neutral-700 rounded-md p-3 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
              <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                {['Moody felt piano with slow evolving movement', 'Epic orchestral brass in a huge hall', 'Aggressive acid bass with distortion and delay', 'Mastering chain for a loud club track'].map((quick) => (
                  <button key={quick} onClick={() => setSpawnPrompt(quick)} className="text-[11px] font-mono px-2 py-1 rounded bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700/60">
                    + {quick}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void handleSpawnChain()}
                disabled={isSpawning || !spawnPrompt.trim()}
                className="w-full py-2.5 rounded-md font-mono text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                {isSpawning ? 'Building the rack…' : 'Build & patch the rack'}
              </button>
            </div>
            {spawnResult?.error && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{spawnResult.error}</span>
              </div>
            )}
            {spawnResult && !spawnResult.error && (
              <div className="p-4 rounded-lg bg-indigo-950/30 border border-indigo-800/60 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase">{spawnResult.rackName}</span>
                  <span className="ml-auto text-[11px] font-mono text-indigo-300/80">{spawnResult.source}</span>
                </div>
                <p className="text-xs text-neutral-300">{spawnResult.description}</p>
                <div className="text-[11px] font-mono text-neutral-400 pt-1 border-t border-indigo-900/40 flex justify-between">
                  <span>Units: {spawnResult.units}</span>
                  <span>Cables: {spawnResult.cables}</span>
                  <span>Tempo: {spawnResult.bpm} BPM</span>
                </div>
                {spawnResult.warnings.length > 0 && (
                  <ul className="text-[11px] text-neutral-400 list-disc ml-4 space-y-0.5">
                    {spawnResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'preset' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-black/30 border border-chrome-line">
              {craftable.length === 0 ? (
                <p className="text-xs text-neutral-400">Add an instrument or effect first.</p>
              ) : (
                <>
                  <span className="text-[11px] font-mono uppercase text-amber-400 font-bold block mb-1">Device</span>
                  <select
                    value={target?.id ?? ''}
                    onChange={(e) => setDeviceId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-md p-2 text-xs text-neutral-200 mb-3 focus:outline-none focus:border-amber-500 font-mono"
                    aria-label="Device"
                  >
                    {craftable.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({presetParamsOf(d).length} parameters)
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] font-mono uppercase text-amber-400 font-bold block mb-1">Sound wanted</span>
                  <textarea
                    value={presetPrompt}
                    onChange={(e) => setPresetPrompt(e.target.value)}
                    maxLength={2000}
                    placeholder="e.g. dark ambient pad with a slow filter, or: short punchy pluck"
                    className="w-full h-20 bg-neutral-950 border border-neutral-700 rounded-md p-3 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-amber-500 resize-none"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                    {['Punchy 80s bass', 'Warm soft pad', 'Bright plucky lead', 'Aggressive acid squelch'].map((sample) => (
                      <button key={sample} onClick={() => setPresetPrompt(sample)} className="text-[11px] font-mono px-2 py-1 rounded bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700/60">
                        + {sample}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => void handleGeneratePreset()}
                    disabled={isGeneratingPreset || !presetPrompt.trim() || !target}
                    className="w-full py-2.5 rounded-md font-mono text-xs font-bold uppercase tracking-wider bg-amber-600 hover:bg-amber-500 text-neutral-950 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="w-4 h-4" />
                    {isGeneratingPreset ? 'Crafting…' : 'Craft & apply preset'}
                  </button>
                </>
              )}
            </div>
            {presetError && <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-200">{presetError}</div>}
            {presetResult && (
              <div className="p-4 rounded-lg bg-amber-950/30 border border-amber-800/60 space-y-2">
                <div className="flex items-center gap-2 text-amber-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase">{presetResult.presetName}</span>
                  <span className="ml-auto text-[11px] font-mono text-amber-300/80">
                    {presetResult.source === 'gemini' ? `Gemini${presetResult.model ? ` (${presetResult.model})` : ''}` : presetResult.source === 'local' ? 'Keyword rules' : 'Keyword rules (offline)'}
                  </span>
                </div>
                {presetResult.warning && <p className="text-[11px] text-amber-200">{presetResult.warning}</p>}
                <p className="text-xs text-neutral-300">{presetResult.description}</p>
                {Object.keys(presetResult.parameters).length > 0 && (
                  <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-neutral-400 pt-2 border-t border-amber-900/40">
                    {Object.entries(presetResult.parameters).map(([k, v]) => (
                      <div key={k} className="flex justify-between bg-black/30 px-1.5 py-0.5 rounded">
                        <span className="text-neutral-500">{k}</span>
                        <span className="text-amber-300">{Number.isInteger(v) ? v : v.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {presetResult.skipped.length > 0 && <p className="text-[11px] text-neutral-500">Ignored (not parameters of this device): {presetResult.skipped.join(', ')}</p>}
                {Object.keys(presetResult.previous).length > 0 && (
                  <button onClick={undoPreset} className="text-[11px] font-mono px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1">
                    <Undo2 className="w-3 h-3" /> Undo (restore the previous values)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'mastering' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-black/30 border border-chrome-line space-y-3">
              <p className="text-xs text-neutral-400">
                Renders the whole song offline and measures it: loudness (LUFS), true peak, spectrum balance and stereo correlation. Auto-master sets the mastering chain from those
                numbers and re-renders until the loudness goal is met.
              </p>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
                aria-label="Loudness goal"
              >
                {MASTER_TARGETS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={() => void analyze()} disabled={!!busy} className="flex-1 py-2 rounded-md font-mono text-xs font-bold uppercase bg-neutral-800 hover:bg-neutral-700 text-neutral-100 disabled:opacity-50">
                  Analyze mix
                </button>
                <button onClick={() => void master()} disabled={!!busy} className="flex-1 py-2 rounded-md font-mono text-xs font-bold uppercase bg-emerald-600 hover:bg-emerald-500 text-neutral-950 disabled:opacity-50">
                  Auto-master
                </button>
              </div>
              {busy && <p className="text-[11px] text-cyan-300 font-mono">{busy}</p>}
              {masterError && <p className="text-[11px] text-red-300">{masterError}</p>}
            </div>
            {analysis && (
              <div className="p-3.5 rounded-lg bg-black/30 border border-chrome-line space-y-2 text-[11px]">
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                  <span className="text-neutral-500">Integrated</span>
                  <span className="text-neutral-100">{fmt(analysis.m.loudness.integrated)} LUFS{mastered ? ` → ${fmt(mastered.loudness.integrated)}` : ''}</span>
                  <span className="text-neutral-500">True peak</span>
                  <span className="text-neutral-100">{fmt(analysis.m.loudness.truePeakDb)} dBTP{mastered ? ` → ${fmt(mastered.loudness.truePeakDb)}` : ''}</span>
                  <span className="text-neutral-500">Loudness range</span>
                  <span className="text-neutral-100">{fmt(analysis.m.loudness.lra)} LU</span>
                  <span className="text-neutral-500">Spectrum tilt</span>
                  <span className="text-neutral-100">{analysis.m.tilt.toFixed(1)} dB/oct</span>
                  <span className="text-neutral-500">Correlation (all / lows)</span>
                  <span className="text-neutral-100">
                    {analysis.m.correlation.toFixed(2)} / {analysis.m.lowCorrelation.toFixed(2)}
                  </span>
                </div>
                {analysis.notes.length > 0 && (
                  <ul className="list-disc ml-4 text-neutral-300 space-y-0.5">
                    {analysis.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
                {mastered && <p className="text-emerald-300">Applied to the mastering chain. Fine-tune it on the Mastering page.</p>}
                {onOpenMastering && (
                  <button onClick={onOpenMastering} className="text-[11px] font-mono px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
                    Open the Mastering page
                  </button>
                )}
              </div>
            )}
            {aiNotes && (
              <div className="p-3.5 rounded-lg bg-black/30 border border-chrome-line text-[11px] space-y-1">
                {aiNotes.source === 'gemini' ? (
                  <>
                    <div className="text-[11px] font-mono text-emerald-400 uppercase">Mixing notes · Gemini{aiNotes.model ? ` (${aiNotes.model})` : ''} · from the measurements above</div>
                    {aiNotes.summary && <p className="text-neutral-300">{aiNotes.summary}</p>}
                    <ul className="list-disc ml-4 text-neutral-300 space-y-0.5">
                      {aiNotes.tips.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-neutral-500">Written mixing notes need a GEMINI_API_KEY{aiNotes.source === 'offline' ? ' and the app server' : ''}. The measurements and suggestions above are computed in the app.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
