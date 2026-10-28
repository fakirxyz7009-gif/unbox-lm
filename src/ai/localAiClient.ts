/**
 * Browser side of the local assistant (server/routes/localAiRoutes.ts). Requests go to this
 * computer only; the server returns actions that have already been checked against the contract.
 */
import type { AssistantAction, AssistantContext } from '../../shared/localAi/assistant.ts';

export interface LocalAiStatus {
  online: boolean;
  url: string;
  models: string[];
  hint?: string;
}

export interface LocalAiReply {
  reply: string;
  actions: AssistantAction[];
  rejected: string[];
  model: string;
}

export async function fetchLocalAiStatus(): Promise<LocalAiStatus | null> {
  try {
    const res = await fetch('/api/local-ai/status');
    if (!res.ok) return null;
    return (await res.json()) as LocalAiStatus;
  } catch {
    return null;
  }
}

export async function askLocalAi(params: { model: string; message: string; context: AssistantContext }): Promise<LocalAiReply> {
  const res = await fetch('/api/local-ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<LocalAiReply> & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `The assistant answered with HTTP ${res.status}.`);
  return data as LocalAiReply;
}
