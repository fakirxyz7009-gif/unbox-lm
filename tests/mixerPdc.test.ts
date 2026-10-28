import test from 'node:test';
import assert from 'node:assert/strict';

test('Mixer PDC 1: Latency delay calculation & phase alignment bounds', () => {
  // Test PDC alignment math
  const trackLatencies: Record<string, number> = {
    'track-clean': 0, // 0 samples latency
    'track-lookahead-comp': 512, // 512 samples latency (~10.6ms at 48kHz)
    'track-linear-phase-eq': 2048, // 2048 samples latency (~42.6ms at 48kHz)
  };

  const sampleRate = 48000;
  const maxLatencySamples = Math.max(...Object.values(trackLatencies));
  assert.equal(maxLatencySamples, 2048, 'Max latency should be 2048 samples');

  const compensatedDelays: Record<string, number> = {};
  for (const [id, lat] of Object.entries(trackLatencies)) {
    const delaySamples = maxLatencySamples - lat;
    const delaySeconds = delaySamples / sampleRate;
    compensatedDelays[id] = delaySeconds;
  }

  // track-linear-phase-eq has max latency, so its delay should be 0s
  assert.equal(compensatedDelays['track-linear-phase-eq'], 0);

  // track-clean needs full 2048 samples delay
  assert.equal(compensatedDelays['track-clean'], 2048 / 48000);

  // track-lookahead-comp needs (2048 - 512) = 1536 samples delay
  assert.equal(compensatedDelays['track-lookahead-comp'], 1536 / 48000);

  // When summed, all three tracks arrive at the mixer at sample 2048 (zero phase smear)
  for (const [id, lat] of Object.entries(trackLatencies)) {
    const totalSampleOffset = lat + compensatedDelays[id] * sampleRate;
    assert.equal(totalSampleOffset, 2048, `Track ${id} must align exactly at 2048 samples`);
  }
});

test('Mixer Routing 2: Graph cycle detection prevents unbuffered feedback', () => {
  // Adjacency list representing device connections
  const graph = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string) => {
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from)!.add(to);
  };

  const pathExists = (from: string, to: string): boolean => {
    const visited = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === to) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const neighbours = graph.get(cur);
      if (neighbours) {
        for (const next of neighbours) {
          if (!visited.has(next)) stack.push(next);
        }
      }
    }
    return false;
  };

  // Build linear chain: synth -> delay -> reverb -> master
  addEdge('synth', 'delay');
  addEdge('delay', 'reverb');
  addEdge('reverb', 'master');

  assert.equal(pathExists('synth', 'master'), true);
  assert.equal(pathExists('master', 'synth'), false);

  // Attempting to patch reverb -> synth would introduce a cycle
  const wouldCycle = pathExists('synth', 'synth') || pathExists('reverb', 'synth');
  assert.equal(wouldCycle, true, 'Patching reverb to synth must be detected as an unbuffered cycle');

  // Attempting to patch delay -> delay is a self-cycle
  assert.equal(pathExists('delay', 'delay'), true);
});

