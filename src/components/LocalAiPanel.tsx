/**
 * Local AI tab of the Co-Pilot: ask a model that runs on this computer (Ollama) for a change to the
 * song or a question about the app. The reply lists the changes it proposes; nothing is applied
 * until Apply is pressed, and each change goes through the same engine calls as the editor's own
 * buttons, so Undo covers them.
 */
import { useEffect, useState } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import { useClipFocus } from '../shell/clipFocus.ts';
import { askLocalAi, fetchLocalAiStatus, type LocalAiReply, type LocalAiStatus } from '../ai/localAiClient.ts';
import { applyAssistantActions, buildAssistantContext, describeAction, type ApplyReport, type ApplyTarget } from '../ai/localAiApply.ts';
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

  const refresh = async () => {
    const next = await fetchLocalAiStatus();
    setStatus(next);
    if (next) setModel((current) => pickModel(next.models, current));
  };

  useEffect(() => {
    void refresh();
  }, []);

  const ask = async () => {
    const request = message.trim();
    if (!model || !request || busy) return;
    setBusy(true);
    setError('');
    setReply(null);
    setReport(null);
    try {
      setReply(await askLocalAi({ model, message: request, context: buildAssistantContext(audioEngine, target) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant failed.');
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
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-indigo-300" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Local AI</div>
          <div className="text-[11px] text-neutral-500">Runs on this computer through Ollama. Nothing is sent to a cloud service.</div>
        </div>
        <button type="button" onClick={() => void refresh()} className="rounded p-1 text-neutral-400 hover:bg-white/5 hover:text-neutral-100" aria-label="Check Ollama again" title="Check Ollama again">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {status === undefined && <p className="text-neutral-500">Checking Ollama…</p>}
      {status === null && <p className="text-amber-300">The assistant is not on this server. Run the full build on this computer.</p>}
      {status && !status.online && (
        <p className="text-amber-300">
          Ollama is not running on this computer. Start it, then press refresh. {status.hint ?? ''}
        </p>
      )}
      {status?.online && status.models.length === 0 && (
        <p className="text-amber-300">Ollama is running, but no model is installed yet. Install one, for example with: ollama pull {PREFERRED_MODEL}</p>
      )}

      {status?.online && status.models.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
              Model
              <select value={model} onChange={(e) => setModel(e.target.value)} className="us-field h-[26px] text-[12px]" aria-label="Model">
                {status.models.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
              Track
              <select value={track?.id ?? ''} onChange={(e) => setTrackId(e.target.value)} className="us-field h-[26px] text-[12px]" aria-label="Track">
                {instrumentTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-neutral-500">
            {focus ? 'Clip actions use the note clip open in the Clip Editor.' : 'No note clip is open, so clip actions are skipped. Pattern actions use the track above.'}
          </p>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void ask();
            }}
            rows={3}
            maxLength={1500}
            placeholder="For example: reverse the bass pattern, then set the tempo to 96. Or ask how to split a note."
            className="us-field w-full resize-none p-2 text-[12px]"
            aria-label="Request for the local AI"
          />
          <div className="flex items-center gap-2">
            <Btn on={!busy && !!message.trim()} disabled={busy || !message.trim()} onClick={() => void ask()}>
              {busy ? 'Thinking on this computer…' : 'Ask'}
            </Btn>
            {busy && <span className="text-[11px] text-neutral-500">The first answer can take a minute while the model loads.</span>}
          </div>

          {error && <p className="text-rose-300">{error}</p>}

          {reply && (
            <div className="flex flex-col gap-2 rounded border border-white/10 bg-black/30 p-2">
              <p className="whitespace-pre-wrap text-neutral-200">{reply.reply || 'No answer text.'}</p>
              {reply.actions.length > 0 && (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-neutral-500">Proposed changes (nothing has changed yet)</div>
                  <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-neutral-300">
                    {reply.actions.map((action, i) => (
                      <li key={i}>{describeAction(action)}</li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Btn on onClick={apply}>
                      Apply {reply.actions.length} change{reply.actions.length === 1 ? '' : 's'}
                    </Btn>
                    <Btn onClick={() => setReply(null)}>Discard</Btn>
                  </div>
                </>
              )}
              {reply.rejected.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-amber-300/80">
                  {reply.rejected.map((line, i) => (
                    <li key={i}>Not applied: {line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {report && (
            <div className="rounded border border-white/10 bg-black/30 p-2 text-[12px]">
              {report.done.length > 0 && <div className="text-emerald-300">Applied: {report.done.join('; ')}</div>}
              {report.skipped.length > 0 && <div className="text-amber-300">Skipped: {report.skipped.join('; ')}</div>}
              {report.done.length === 0 && report.skipped.length === 0 && <div className="text-neutral-500">Nothing to apply.</div>}
              <div className="mt-1 text-[11px] text-neutral-500">Ctrl+Z undoes these changes.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
