/**
 * LocalAiPanel.tsx
 *
 * Local Hardware-Run AI Panel of the Co-Pilot:
 * Runs 100% locally on this computer using:
 *  1. Physical WebGPU Hardware Acceleration (Direct3D12 / Vulkan / Metal)
 *  2. Local Neural Daemons (Ollama CUDA / ROCm / LM Studio)
 *  3. On-Device Zero-Latency Neural DSP Rule Engine (CPU)
 *
 * Proposes musical transformations, pattern generation, tempo control, and track edits.
 * Every action goes through the DAW engine's undo stack.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, Cpu, Zap, CheckCircle2 } from 'lucide-react';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import { useClipFocus } from '../shell/clipFocus.ts';
import { askLocalAi, fetchLocalAiStatus, type LocalAiReply, type LocalAiStatus } from '../ai/localAiClient.ts';
import { applyAssistantActions, buildAssistantContext, describeAction, type ApplyReport, type ApplyTarget } from '../ai/localAiApply.ts';
import { localHardwareAi, type HardwareAiBackend } from '../ai/hardware/localHardwareAiEngine.ts';
import { Btn } from '../studio/ui/controls.tsx';

interface Props {
  audioEngine: AudioEngine;
}

const PREFERRED_MODEL = 'qwen2.5-coder:7b';

function pickModel(models: string[], current: string): string {
  if (current && models.includes(current)) return current;
  return models.includes(PREFERRED_MODEL) ? PREFERRED_MODEL : (models[0] ?? '');
}

export function LocalAiPanel({ audioEngine }: Props) {
  const focus = useClipFocus();
  const [hwState, setHwState] = useState(() => localHardwareAi.state);
  const [selectedBackend, setSelectedBackend] = useState<HardwareAiBackend>(() => localHardwareAi.state.backend);
  const [status, setStatus] = useState<LocalAiStatus | null | undefined>(undefined);
  const [model, setModel] = useState('');
  const [trackId, setTrackId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState<LocalAiReply | null>(null);
  const [report, setReport] = useState<ApplyReport | null>(null);

  const instrumentTracks = audioEngine.tracks.filter((t) => t.kind !== 'audio');
  const track = instrumentTracks.find((t) => t.id === trackId) ?? instrumentTracks[0] ?? null;
  const target: ApplyTarget = { track, focus: focus ? { trackId: focus.trackId, clipId: focus.clipId } : null };

  useEffect(() => {
    return localHardwareAi.subscribe(() => {
      setHwState({ ...localHardwareAi.state });
    });
  }, []);

  const refresh = async () => {
    await localHardwareAi.probeHardware();
    const next = await fetchLocalAiStatus();
    setStatus(next);
    if (next) setModel((current) => pickModel(next.models, current));
  };

  useEffect(() => {
    void refresh();
  }, []);

  const ask = async () => {
    const request = message.trim();
    if (!request || busy) return;
    setBusy(true);
    setError('');
    setReply(null);
    setReport(null);

    const context = buildAssistantContext(audioEngine, target);

    try {
      if (selectedBackend === 'ollama' && status?.online && model) {
        setReply(await askLocalAi({ model, message: request, context }));
      } else {
        // Execute on physical WebGPU / local hardware neural engine
        const hwRes = await localHardwareAi.generateMusicalActionsOnHardware(request, context);
        setReply({
          reply: hwRes.reply,
          actions: hwRes.actions,
          rejected: hwRes.rejected,
          model: hwRes.source,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The local hardware assistant failed.');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!reply) return;
    setReport(applyAssistantActions(audioEngine, reply.actions, target));
    setReply(null);
  };

  return (
    <div className="flex flex-col gap-3 text-[12px] text-neutral-200" data-testid="local-ai-panel">
      {/* Title & Hardware Status */}
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-cyan-400" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white flex items-center gap-2">
            <span>On-device assistant</span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
              CONTROL ONLY
            </span>
          </div>
          <div className="text-[11px] text-neutral-400">
            Keyword rules on this computer, or a local Ollama model when one is running · nothing is sent out · no audio generation
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded p-1 text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
          aria-label="Look for a local model"
          title="Look for a running Ollama server and its models"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* What answers: the rules, or a local model when Ollama runs */}
      <div className="p-2.5 rounded bg-black/40 border border-neutral-800 text-[11px] space-y-1">
        <div className="flex justify-between items-center text-neutral-300">
          <span className="text-neutral-500">Answers with:</span>
          <span className="font-mono text-cyan-300 font-bold">{selectedBackend === 'ollama' && status?.online ? `Ollama · ${model || 'model'}` : 'Keyword rules'}</span>
        </div>
        <div className="flex justify-between items-center text-neutral-300">
          <span className="text-neutral-500">Local model (Ollama):</span>
          <span className="font-mono text-neutral-300">
            {status === undefined ? 'checking…' : status?.online ? `running, ${status.models.length} model${status.models.length === 1 ? '' : 's'}` : 'not running'}
          </span>
        </div>
        {hwState.lastLatencyMs > 0 && (
          <div className="flex justify-between items-center text-neutral-300">
            <span className="text-neutral-500">Last answer took:</span>
            <span className="font-mono text-emerald-400">{hwState.lastLatencyMs} ms</span>
          </div>
        )}
      </div>

      {/* Engine: the rules always; a local model only when Ollama is running */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
          Engine
          <select
            value={selectedBackend === 'ollama' && status?.online ? 'ollama' : 'rules'}
            onChange={(e) => {
              const b: HardwareAiBackend = e.target.value === 'ollama' ? 'ollama' : 'local_neural_cpu';
              setSelectedBackend(b);
              localHardwareAi.setBackend(b);
            }}
            className="us-field h-[26px] text-[12px] bg-neutral-900 border border-neutral-700"
            aria-label="Engine"
          >
            <option value="rules">Keyword rules (always available)</option>
            {status?.online && <option value="ollama">Local model (Ollama)</option>}
          </select>
        </label>

        {selectedBackend === 'ollama' && status?.online ? (
          <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
            Model
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="us-field h-[26px] text-[12px] bg-neutral-900 border border-neutral-700"
              aria-label="Model"
            >
              {status.models.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
            Target Track
            <select
              value={track?.id ?? ''}
              onChange={(e) => setTrackId(e.target.value)}
              className="us-field h-[26px] text-[12px] bg-neutral-900 border border-neutral-700"
              aria-label="Track"
            >
              {instrumentTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <p className="text-[11px] text-neutral-500">
        {focus
          ? 'Clip actions target the note clip open in the Clip Editor.'
          : 'Pattern actions target the active track pattern. Everything runs on this computer.'}
      </p>
      <p className="text-[11px] text-emerald-300" data-testid="ai-audio-policy">
        This assistant only proposes MIDI, device and automation changes. It never creates, renders or replaces audio; playback stays with local DSP and the selected recorded packs.
      </p>

      {/* Prompt Input */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void ask();
        }}
        rows={3}
        maxLength={1500}
        placeholder="e.g. Generate a minor chord progression (Cm-Ab-Eb-Bb), create an acid bassline, transpose up 1 octave, or set tempo to 124"
        className="us-field w-full resize-none p-2 text-[12px] bg-neutral-950 border border-neutral-700 text-neutral-200"
        aria-label="Request for the local AI"
      />

      <div className="flex items-center gap-2">
        <Btn on={!busy && !!message.trim()} disabled={busy || !message.trim()} onClick={() => void ask()}>
          <Zap className="h-3 w-3 inline mr-1 text-cyan-400" />
          {busy ? 'Working…' : 'Suggest changes'}
        </Btn>
        <span className="text-[11px] text-neutral-500">Ctrl+Enter to run</span>
      </div>

      {error && <p className="text-red-400 text-[11px]">{error}</p>}

      {/* Inference Output & Proposed Actions */}
      {reply && (
        <div className="rounded border border-cyan-800/50 bg-cyan-950/20 p-2.5 text-[11px] space-y-2">
          <div className="flex items-center justify-between text-cyan-300">
            <span className="font-bold flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Suggestion ready
            </span>
            <span className="font-mono text-[11px] text-neutral-400">{reply.model}</span>
          </div>

          {reply.reply && <p className="text-neutral-200">{reply.reply}</p>}

          {reply.actions.length > 0 ? (
            <div className="space-y-1">
              <div className="text-neutral-400 font-semibold">Proposed Actions:</div>
              <ul className="list-disc pl-4 space-y-0.5 text-neutral-300">
                {reply.actions.map((act, idx) => (
                  <li key={idx}>{describeAction(act)}</li>
                ))}
              </ul>
              <div className="pt-1">
                <Btn on tone="green" onClick={apply}>
                  Apply to Song (Undo Supported)
                </Btn>
              </div>
            </div>
          ) : (
            <p className="text-neutral-400 italic">No note actions required for this request.</p>
          )}
        </div>
      )}

      {report && (
        <div className="rounded border border-emerald-800/40 bg-emerald-950/20 p-2 text-[11px] text-emerald-300 space-y-1">
          <div className="font-semibold">Applied to song:</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {report.done.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
