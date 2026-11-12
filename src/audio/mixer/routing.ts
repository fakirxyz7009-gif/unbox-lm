/**
 * Pure mixer routing logic (no Web Audio): solo / mute audibility and feedback checks.
 * Channels are identified by their owner device id; `output` / send targets are bus channel ids.
 */

export interface RouteNode {
  id: string;
  mute: boolean;
  solo: boolean;
  soloSafe?: boolean;
  /** 'master' or a bus id. */
  output: string;
  /** Bus ids this channel sends to (active sends only). */
  sends: string[];
}

/**
 * Solo-in-place: with any channel soloed, a channel is heard when it is soloed, solo-safe,
 * fed by a soloed channel (its bus / return), or routes its output into a soloed bus.
 */
export function computeAudibility(nodes: RouteNode[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const anySolo = nodes.some((n) => n.solo);
  if (!anySolo) {
    nodes.forEach((n) => result.set(n.id, !n.mute));
    return result;
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const active = new Set<string>();
  // Downstream of soloed channels (outputs and sends).
  const down = (id: string, seen: Set<string>) => {
    const n = byId.get(id);
    if (!n || seen.has(id)) return;
    seen.add(id);
    active.add(id);
    [n.output, ...n.sends].forEach((t) => t !== 'master' && down(t, seen));
  };
  nodes.filter((n) => n.solo).forEach((n) => down(n.id, new Set()));
  // Upstream: channels whose output feeds a soloed bus (not sends: a send alone doesn't un-mute its source).
  const soloedBuses = new Set(nodes.filter((n) => n.solo).map((n) => n.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (!active.has(n.id) && n.output !== 'master' && soloedBuses.has(n.output)) {
        active.add(n.id);
        soloedBuses.add(n.id);
        grew = true;
      }
    }
  }
  nodes.forEach((n) => result.set(n.id, !n.mute && (active.has(n.id) || !!n.soloSafe)));
  return result;
}

/** True when routing `from` into `to` (output or send) would make a loop. */
export function wouldLoop(nodes: RouteNode[], from: string, to: string): boolean {
  if (to === 'master') return false;
  if (from === to) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (n) [n.output, ...n.sends].forEach((t) => t !== 'master' && stack.push(t));
  }
  return false;
}
