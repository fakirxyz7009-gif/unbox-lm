import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { audioStore } from '../../src/audio/clips/audioStore.ts';
import { takeLengthLabel } from '../../src/audio/recording/takeLabel.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

/** `m:ss.d` back to seconds, so the label can be compared with the recorded audio. */
function labelSeconds(label: string): number | null {
  const parts = /^(\d+):(\d\d\.\d)$/.exec(label);
  return parts ? Number(parts[1]) * 60 + Number(parts[2]) : null;
}

async function run(): Promise<void> {
  const engine = audioEngine;
  await engine.resumeContext();
  engine.recorder.settings.countInBars = 0;

  const track = engine.createAudioTrack('Probe Input');
  track.armed = true;
  await engine.recorder.syncInputs();
  if (!engine.recorder.input.isOpen) throw new Error(`The fake microphone did not open (${engine.recorder.message ?? 'no message'}).`);

  if (!(await engine.recorder.start())) throw new Error(`The recorder did not start (${engine.recorder.message ?? 'no message'}).`);
  await new Promise((resolve) => setTimeout(resolve, 1400));
  await engine.recorder.stop();

  if (engine.recorder.state !== 'idle') throw new Error(`The take did not finish (state ${engine.recorder.state}).`);
  const clip = (track.arrangementClips ?? []).find((entry) => entry.kind === 'audio');
  if (!clip) throw new Error('The take left no audio clip on its track.');
  const asset = audioStore.get(clip.audioId);
  if (!asset) throw new Error('The take left no audio asset for its clip.');

  const parts = /^(.*) take (\d+) · (.+)$/.exec(clip.name ?? '');
  if (!parts) throw new Error(`The clip name carries no take length: ${JSON.stringify(clip.name)}`);
  const [, namedPart, takeNumber, label] = parts;
  if (namedPart !== track.name) throw new Error(`The clip is named for ${JSON.stringify(namedPart)}, not the recorded part ${JSON.stringify(track.name)}.`);
  const seconds = labelSeconds(label);
  if (seconds === null) throw new Error(`The take length ${JSON.stringify(label)} is not m:ss.d.`);
  const duration = asset.buffer.duration;
  if (label !== takeLengthLabel(duration)) {
    throw new Error(`The clip says ${label} but the take is ${duration.toFixed(3)} s (${takeLengthLabel(duration)}).`);
  }
  if (Math.abs(seconds - duration) > 0.06) throw new Error(`The clip label ${label} is ${seconds}s, the take ${duration.toFixed(3)} s.`);
  // The headless page's transport can advance slower than wall time, so only require a real take.
  if (duration < 0.2) throw new Error(`The take is only ${duration.toFixed(3)} s; the fake input was barely recorded.`);

  // A second take must keep its own number and its own length in the name.
  if (!(await engine.recorder.start())) throw new Error('The second take did not start.');
  await new Promise((resolve) => setTimeout(resolve, 700));
  await engine.recorder.stop();
  const audioClips = (track.arrangementClips ?? []).filter((entry) => entry.kind === 'audio');
  const second = audioClips.find((entry) => entry.id !== clip.id) ?? audioClips[audioClips.length - 1];
  if (!second || second.id === clip.id) throw new Error('The second take did not add its own clip.');
  const secondParts = /^.* take (\d+) · (\d+:\d\d\.\d)$/.exec(second.name ?? '');
  if (!secondParts) throw new Error(`The second clip name carries no take length: ${JSON.stringify(second.name)}`);
  if (Number(secondParts[1]) === Number(takeNumber)) throw new Error(`Both takes are numbered ${takeNumber}: ${clip.name} / ${second.name}`);

  resultNode.dataset.status = 'passed';
  resultNode.textContent = `PASS · ${clip.name} for a ${duration.toFixed(3)} s take from the fake input; second take ${second.name}.`;
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
