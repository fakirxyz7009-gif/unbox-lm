import assert from 'node:assert/strict';
import test from 'node:test';
import { MatrixDevice } from '../src/audio/devices/MatrixDevice.ts';

function matrixAt(currentTime = 0): MatrixDevice {
  const ctx = {
    currentTime,
    createAnalyser: () => ({ fftSize: 0, smoothingTimeConstant: 0, disconnect() {} }),
  } as unknown as AudioContext;
  return new MatrixDevice(ctx, 'matrix-test');
}

test('Matrix CV evaluates scheduled note, curve, and short gate pulse at audio time', () => {
  const matrix = matrixAt();
  matrix.onStepTick(0, 10); // default step: note 0, gate true, curve 0.8
  matrix.onStepTick(1, 10.125); // default step: note 0, gate false, curve 0.2

  const note = matrix.cvOutputs.get('note_cv')!.getter!;
  const gate = matrix.cvOutputs.get('gate_cv')!.getter!;
  const curve = matrix.cvOutputs.get('curve_cv')!.getter!;
  assert.equal(gate(9.999), 0, 'a look-ahead pulse must not be high before its scheduled audio time');
  assert.equal(gate(10.069), 1);
  assert.equal(gate(10.07), 0, 'pulse ends at the audio-time gate boundary without a JS timer');
  assert.equal(note(10.05), 0);
  assert.equal(curve(10.05), 0.8);
  assert.equal(gate(10.126), 0);
  assert.equal(curve(10.126), 0.2);
});

test('Matrix CV keeps earlier scheduled values while later look-ahead steps are queued', () => {
  const matrix = matrixAt();
  matrix.currentPattern.notes[0] = 3;
  matrix.currentPattern.curveCV[0] = 0.4;
  matrix.currentPattern.gates[0] = true;
  matrix.currentPattern.notes[1] = 11;
  matrix.currentPattern.curveCV[1] = 0.9;
  matrix.currentPattern.gates[1] = true;
  matrix.onStepTick(0, 2);
  matrix.onStepTick(1, 2.125);

  const note = matrix.cvOutputs.get('note_cv')!.getter!;
  const gate = matrix.cvOutputs.get('gate_cv')!.getter!;
  const curve = matrix.cvOutputs.get('curve_cv')!.getter!;
  assert.equal(note(2.02), 3);
  assert.equal(curve(2.02), 0.4);
  assert.equal(gate(2.02), 1);
  assert.equal(note(2.126), 11);
  assert.equal(curve(2.126), 0.9);
  assert.equal(gate(2.126), 1);
});
