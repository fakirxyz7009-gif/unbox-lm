import '../../src/main.tsx';
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { createPlayableInstrumentFromAsset } from '../../src/audio/ai/playableInstrument.ts';
import { audioStore } from '../../src/audio/clips/audioStore.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function waitFor(check: () => boolean, label: string, timeoutMs = 20_000): Promise<void> {
  const started = performance.now();
  while (!check()) {
    if (performance.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await pause(50);
  }
}

// One second of a 440 Hz tone: enough for pitch detection and note transcription.
function toneBuffer(): AudioBuffer {
  const sampleRate = 44100;
  const buffer = new AudioBuffer({ length: sampleRate, sampleRate, numberOfChannels: 1 });
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  return buffer;
}

// The part list marks the selected part with data-selected="true" on its row.
const selectedPartRow = (): string => document.querySelector('[data-testid="part-row"][data-selected="true"]')?.textContent ?? '';

async function run(): Promise<void> {
  await waitFor(() => (document.querySelector('#root')?.childElementCount ?? 0) > 0, 'the app to mount');
  audioEngine.newProject(true);
  // A first part makes the default selection (the first part) differ from the new instrument.
  await createPlayableInstrumentFromAsset(audioEngine, audioStore.add('App Selection First Tone', toneBuffer()), 'App Selection First');

  const asset = audioStore.add('App Selection Tone', toneBuffer());
  const created = (await createPlayableInstrumentFromAsset(audioEngine, asset, 'App Selection Probe')).instruments[0]!;
  await waitFor(() => selectedPartRow().includes('App Selection Probe'), 'the new instrument to become the selected part');

  result!.dataset.status = 'passed';
  result!.textContent = `PASS · the app made the new instrument (${created.instrumentName}) the selected part: its part row is the one marked selected.`;
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
