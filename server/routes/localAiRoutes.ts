/**
 * The local assistant: the browser sends a request and the song state, this route asks a model
 * running on this computer through Ollama (https://ollama.com) in JSON mode, and the reply is
 * checked against shared/localAi/assistant.ts before it goes back. Nothing is sent to a cloud
 * service. OLLAMA_URL must point at this computer (127.0.0.1, localhost or ::1).
 */
import { Router, type Request, type Response } from 'express';
import {
  ASSISTANT_LIMITS,
  assistantInstructions,
  assistantStateText,
  checkAssistantReply,
  type AssistantContext,
} from '../../shared/localAi/assistant.ts';
import { rateLimit, requireLoopback } from './routeGuards.ts';

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const STATUS_TIMEOUT_MS = 3_000;
const CHAT_TIMEOUT_MS = 180_000;
const MODEL_NAME = /^[A-Za-z0-9._:/-]{1,100}$/;

/** The Ollama address, if it is on this computer; anything else falls back to the default. */
export function ollamaUrl(raw = process.env.OLLAMA_URL): string {
  if (!raw) return DEFAULT_OLLAMA_URL;
  try {
    const url = new URL(raw);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (!local || (url.protocol !== 'http:' && url.protocol !== 'https:')) return DEFAULT_OLLAMA_URL;
    return url.origin;
  } catch {
    return DEFAULT_OLLAMA_URL;
  }
}

/** Reads the song state the browser sends; anything malformed is dropped rather than trusted. */
export function readContext(raw: unknown): AssistantContext | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'The song state is missing.' };
  const c = raw as Record<string, unknown>;
  if (typeof c.bpm !== 'number' || !Number.isFinite(c.bpm)) return { error: 'The song state has no tempo.' };
  const tracks = Array.isArray(c.tracks)
    ? c.tracks
        .filter((t): t is { id: string; name: string; muted: boolean } => !!t && typeof t === 'object' && typeof (t as { id?: unknown }).id === 'string' && typeof (t as { name?: unknown }).name === 'string')
        .slice(0, 40)
        .map((t) => ({ id: t.id.slice(0, 120), name: t.name.slice(0, 80), muted: t.muted === true }))
    : [];
  const target = c.targetTrack && typeof c.targetTrack === 'object' ? (c.targetTrack as { id?: unknown; name?: unknown }) : null;
  const focused = c.focusedClip && typeof c.focusedClip === 'object' ? (c.focusedClip as { name?: unknown; lengthBars?: unknown }) : null;
  return {
    bpm: c.bpm,
    timeSignature: typeof c.timeSignature === 'string' ? c.timeSignature.slice(0, 8) : '4/4',
    stepsPerBar: typeof c.stepsPerBar === 'number' && c.stepsPerBar > 0 ? c.stepsPerBar : 16,
    targetTrack: target && typeof target.id === 'string' && typeof target.name === 'string' ? { id: target.id, name: target.name.slice(0, 80) } : null,
    patternLength: typeof c.patternLength === 'number' && c.patternLength > 0 ? c.patternLength : null,
    focusedClip:
      focused && typeof focused.name === 'string' && typeof focused.lengthBars === 'number'
        ? { name: focused.name.slice(0, 80), lengthBars: focused.lengthBars }
        : null,
    tracks,
  };
}

export function createLocalAiRouter(): Router {
  const router = Router();
  router.use(requireLoopback('The local assistant is only available on this computer.'));
  const chatLimit = rateLimit(20, 60_000);

  router.get('/status', async (_req, res) => {
    const url = ollamaUrl();
    try {
      const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { models?: { name?: unknown }[] };
      const models = (data.models ?? []).map((m) => String(m.name ?? '')).filter(Boolean);
      res.json({ online: true, url, models });
    } catch {
      res.json({
        online: false,
        url,
        models: [],
        hint: 'Start Ollama on this computer, then pull a model, for example: ollama pull qwen2.5-coder:7b',
      });
    }
  });

  router.post('/chat', chatLimit, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { model?: unknown; message?: unknown; context?: unknown };
    const model = typeof body.model === 'string' ? body.model.trim() : '';
    if (!MODEL_NAME.test(model)) return res.status(400).json({ error: 'Choose an installed model first.' });
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return res.status(400).json({ error: 'Write a request first.' });
    if (message.length > ASSISTANT_LIMITS.maxMessageChars) {
      return res.status(400).json({ error: `Keep the request under ${ASSISTANT_LIMITS.maxMessageChars} characters.` });
    }
    const context = readContext(body.context);
    if ('error' in context) return res.status(400).json({ error: context.error });

    const url = ollamaUrl();
    try {
      const response = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: { temperature: 0.2, num_ctx: 8192 },
          messages: [
            { role: 'system', content: assistantInstructions() },
            { role: 'user', content: `Request: ${message}\nSong state: ${assistantStateText(context)}` },
          ],
        }),
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      });
      if (response.status === 404) {
        return res.status(404).json({ error: `The model "${model}" is not installed. Pull it with: ollama pull ${model}` });
      }
      if (!response.ok) return res.status(502).json({ error: `Ollama answered with HTTP ${response.status}.` });
      const data = (await response.json()) as { message?: { content?: unknown } };
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof data.message?.content === 'string' ? data.message.content : '');
      } catch {
        return res.status(502).json({ error: 'The model did not return JSON. Try the request again, or pick another model.' });
      }
      const checked = checkAssistantReply(parsed, context);
      if ('error' in checked) return res.status(502).json({ error: checked.error });
      res.json({ ...checked, model });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      res.status(timedOut ? 504 : 503).json({
        error: timedOut ? 'The model took too long to answer. Try a smaller model or a shorter request.' : 'Ollama is not running on this computer.',
      });
    }
  });

  return router;
}
