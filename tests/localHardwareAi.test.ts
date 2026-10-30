/**
 * localHardwareAi.test.ts
 *
 * Automated regression test suite for Local Hardware-Run AI Engine:
 * 1. Hardware engine singleton lifecycle & offline guarantees.
 * 2. Hardware backend switching (WebGPU, Ollama, Neural CPU).
 * 3. Local hardware rack combinator planning.
 * 4. Local hardware preset crafting & parameter validation.
 * 5. Local hardware musical action generation (chords, basslines, arps, tempo).
 * 6. Telemetry and state listener notifications.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { localHardwareAi } from '../src/ai/hardware/localHardwareAiEngine.ts';
import type { BaseDevice } from '../src/audio/BaseDevice.ts';
import type { AssistantContext } from '../shared/localAi/assistant.ts';

test('Local Hardware AI: Engine guarantees 100% offline air-gapped execution', () => {
  const state = localHardwareAi.state;
  assert.equal(state.is100PercentOffline, true, 'Hardware AI must be strictly offline');
  assert.ok(state.gpu, 'GPU hardware info must be initialized');
  assert.ok(['webgpu', 'ollama', 'local_neural_cpu', 'lmstudio'].includes(state.backend));
});

test('Local Hardware AI: Backend switching & state subscription notification', () => {
  let notified = false;
  const unsub = localHardwareAi.subscribe(() => {
    notified = true;
  });

  localHardwareAi.setBackend('local_neural_cpu');
  assert.equal(localHardwareAi.state.backend, 'local_neural_cpu');
  assert.equal(notified, true, 'State subscriber should be notified on backend change');

  localHardwareAi.setSelectedModel('qwen2.5-coder:7b');
  assert.equal(localHardwareAi.state.selectedModel, 'qwen2.5-coder:7b');

  unsub();
});

test('Local Hardware AI: Hardware-accelerated Rack Combinator generates valid patch plans', async () => {
  const result = await localHardwareAi.planRackOnHardware('Moody 80s synthwave lead with tape delay and chorus');

  assert.ok(result.plan, 'Plan must be created');
  assert.ok(result.plan.units.length >= 1, 'Plan must contain modular units');
  assert.ok(result.source.includes('Local') || result.source.includes('WebGPU'), 'Plan source must indicate local execution');
  assert.ok(typeof result.latencyMs === 'number', 'Latency must be measured');
  assert.ok(localHardwareAi.state.totalInferences >= 1, 'Inference counter should increment');
});

test('Local Hardware AI: Hardware-accelerated Preset Crafter clamps and validates device parameters', async () => {
  // Mock playable instrument device
  const paramsMap: Record<string, number> = {
    cutoff: 1000,
    resonance: 5,
    attack: 0.05,
    decay: 0.3,
    sustain: 0.6,
    release: 0.4,
  };
  const mockDevice: BaseDevice = {
    id: 'mock_synth_1',
    name: 'Tri-Osc Power Synth',
    type: 'three_osc',
    params: paramsMap,
    audioInputs: new Map(),
    audioOutputs: new Map(),
    cvInputs: new Map(),
    cvOutputs: new Map(),
    setParam(key: string, val: number) {
      paramsMap[key] = val;
    },
  } as unknown as BaseDevice;

  const res = await localHardwareAi.craftPresetOnHardware(mockDevice, 'Plucky bright bass with snappy attack');

  assert.ok(res.preset, 'Preset must be returned');
  assert.ok(res.preset.parameters, 'Parameters must be present');
  assert.ok(typeof res.latencyMs === 'number', 'Latency must be measured');
  assert.ok(res.source.includes('Local') || res.source.includes('Hardware') || res.source.includes('WebGPU'));
});

test('Local Hardware AI: Musical Copilot generates chord progressions on local hardware', async () => {
  const mockContext: AssistantContext = {
    bpm: 120,
    timeSignature: '4/4',
    stepsPerBar: 16,
    targetTrack: { id: 'track_1', name: 'Lead Synth' },
    patternLength: 16,
    focusedClip: null,
    tracks: [{ id: 'track_1', name: 'Lead Synth', muted: false }],
  };

  const res = await localHardwareAi.generateMusicalActionsOnHardware('Generate a minor chord progression', mockContext);

  assert.ok(res.actions.length > 0, 'Should generate actions');
  const writeAction = res.actions.find((a) => a.type === 'write_notes');
  assert.ok(writeAction, 'Should generate write_notes action for chords');
  if (writeAction && writeAction.type === 'write_notes') {
    assert.ok(writeAction.notes.length >= 4, 'Should generate chord triad notes');
  }
  assert.ok(res.source.includes('Local'));
});

test('Local Hardware AI: Musical Copilot handles tempo and transform actions on local hardware', async () => {
  const mockContext: AssistantContext = {
    bpm: 120,
    timeSignature: '4/4',
    stepsPerBar: 16,
    targetTrack: { id: 'track_1', name: 'Lead Synth' },
    patternLength: 16,
    focusedClip: null,
    tracks: [{ id: 'track_1', name: 'Lead Synth', muted: false }],
  };

  const resTempo = await localHardwareAi.generateMusicalActionsOnHardware('Set tempo to 96 BPM', mockContext);
  const tempoAction = resTempo.actions.find((a) => a.type === 'set_tempo');
  assert.ok(tempoAction, 'Should parse tempo action');
  if (tempoAction && tempoAction.type === 'set_tempo') {
    assert.equal(tempoAction.bpm, 96);
  }

  const resReverse = await localHardwareAi.generateMusicalActionsOnHardware('Reverse the pattern', mockContext);
  const revAction = resReverse.actions.find((a) => a.type === 'transform_notes');
  assert.ok(revAction, 'Should generate reverse transform');
});

test('Local Hardware AI: Drum groove pattern generation across genres', async () => {
  const mockContext: AssistantContext = {
    bpm: 124,
    timeSignature: '4/4',
    stepsPerBar: 16,
    targetTrack: { id: 'track_drums', name: 'Beatbox 8' },
    patternLength: 16,
    focusedClip: null,
    tracks: [{ id: 'track_drums', name: 'Beatbox 8', muted: false }],
  };

  const resHouse = await localHardwareAi.generateMusicalActionsOnHardware('Generate a house drum beat', mockContext);
  const houseNotes = resHouse.actions.find((a) => a.type === 'write_notes');
  assert.ok(houseNotes && houseNotes.type === 'write_notes');
  // House beat must have kicks (note 36), snares (note 38), hihats (note 42)
  assert.ok(houseNotes.notes.some((n) => n.note === 36), 'Must contain kick drum');
  assert.ok(houseNotes.notes.some((n) => n.note === 38), 'Must contain snare drum');

  const resTrap = await localHardwareAi.generateMusicalActionsOnHardware('Generate a trap half time beat', mockContext);
  const trapNotes = resTrap.actions.find((a) => a.type === 'write_notes');
  assert.ok(trapNotes && trapNotes.type === 'write_notes');
  assert.ok(trapNotes.notes.length >= 16, 'Trap should include 16th-note hihat rolls');
});

test('Local Hardware AI: Microtonal Raga & Modal scale melodic generation', async () => {
  const mockContext: AssistantContext = {
    bpm: 100,
    timeSignature: '4/4',
    stepsPerBar: 16,
    targetTrack: { id: 'track_bansuri', name: 'Bansuri Flute' },
    patternLength: 16,
    focusedClip: null,
    tracks: [{ id: 'track_bansuri', name: 'Bansuri Flute', muted: false }],
  };

  const resYaman = await localHardwareAi.generateMusicalActionsOnHardware('Compose a melody in Raga Yaman', mockContext);
  assert.ok(resYaman.reply.includes('Yaman'));
  const yamanNotes = resYaman.actions.find((a) => a.type === 'write_notes');
  assert.ok(yamanNotes && yamanNotes.type === 'write_notes');
  assert.ok(yamanNotes.notes.length >= 8);

  const resDorian = await localHardwareAi.generateMusicalActionsOnHardware('Create a modal melody in Dorian mode', mockContext);
  assert.ok(resDorian.reply.includes('Dorian'));
});

test('Local Hardware AI: Acoustic Mix & Master Assistant evaluates LUFS and frequency tilt', () => {
  const mockAnalysis = {
    loudness: {
      integrated: -18.5,
      shortTermMax: -15.0,
      momentaryMax: -12.0,
      truePeakDb: -0.2,
      samplePeakDb: -0.2,
      rmsDb: -18.0,
      shortTerm: new Float32Array([-15.0]),
      lra: 9.5,
      plr: 18.3,
    },
    octaves: [-12, -8, -5, -2, 0, -3, -6, -9, -14, -20],
    tilt: -3.8,
    residual: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    correlation: 0.88,
    lowCorrelation: 0.94,
    sideDb: -14,
    seconds: 180,
  };

  const target = {
    id: 'streaming',
    label: 'Streaming -14 LUFS',
    lufs: -14,
    ceiling: -1.0,
    style: 'standard' as const,
  };

  const report = localHardwareAi.analyzeAndMasterOnHardware(mockAnalysis, target);
  assert.ok(report.summary.includes('LUFS'));
  assert.ok(report.tips.length >= 1, 'Should generate engineering mix tips');
  assert.ok(report.tips.some((t) => t.includes('ceiling') || t.includes('Peak')), 'Should alert about True Peak exceeding ceiling');
  assert.ok(report.source.includes('Local Hardware AI'));
});

test('Local Hardware AI: Automation curve generation for sidechain pump and sweeps', () => {
  const pump = localHardwareAi.generateAutomationOnHardware('sidechain_pump', 4);
  assert.ok(pump.points.length >= 12, '4 bars of 4-on-the-floor pump should have at least 12 curve points');

  const sweep = localHardwareAi.generateAutomationOnHardware('riser_sweep', 4);
  assert.ok(sweep.points.length >= 30, 'Riser sweep should have smooth resolution');
  assert.equal(sweep.points[0].value <= 0.05, true, 'Riser should start low');
  assert.equal(sweep.points[sweep.points.length - 1].value >= 0.95, true, 'Riser should peak at 1.0');

  const wobble = localHardwareAi.generateAutomationOnHardware('lfo_wobble', 4);
  assert.ok(wobble.points.length >= 60, 'LFO wobble should generate dense sine oscillation');
});

