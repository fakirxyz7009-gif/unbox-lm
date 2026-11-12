import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { createPlayableInstrumentFromAsset } from '../../src/audio/ai/playableInstrument.ts';
import { addStemNotes } from '../../src/audio/ai/stemNotes.ts';
import { audioStore } from '../../src/audio/clips/audioStore.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

// One second of a 440 Hz tone: enough for pitch detection and note transcription.
function toneBuffer(): AudioBuffer {
  const sampleRate = 44100;
  const buffer = new AudioBuffer({ length: sampleRate, sampleRate, numberOfChannels: 1 });
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  return buffer;
}

async function run(): Promise<void> {
  audioEngine.newProject(true);
  const announced: string[] = [];
  window.addEventListener('unbox:select-part', (event) => announced.push((event as CustomEvent<string>).detail));

  const asset = audioStore.add('Selection Probe Tone', toneBuffer());
  const created = (await createPlayableInstrumentFromAsset(audioEngine, asset, 'Selection Probe')).instruments[0]!;
  if (announced.at(-1) !== created.deviceId) {
    throw new Error(`Creating a playable instrument did not select it (announced ${announced.at(-1) ?? 'nothing'}, expected ${created.deviceId})`);
  }

  const stem = await addStemNotes(audioEngine, 'other', toneBuffer(), 'Selection Probe Stem');
  if (!stem) throw new Error('The stem produced no notes, so its selection cannot be checked');
  const stemTrack = audioEngine.tracks.at(-1);
  if (!stemTrack || announced.at(-1) !== stemTrack.deviceId) {
    throw new Error(`Creating stem notes did not select the new track (announced ${announced.at(-1) ?? 'nothing'})`);
  }

  result!.dataset.status = 'passed';
  result!.textContent = `PASS · a new playable instrument (${created.instrumentName}) and a new stem instrument each announced their device as the part to select.`;
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
