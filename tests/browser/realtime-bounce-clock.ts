import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { ensureRecorderWorklet } from '../../src/audio/recording/recorderWorklet.ts';
import type { SequencerTrack } from '../../src/audio/types.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;

async function run(): Promise<void> {
  const engine = audioEngine;
  const originalCreateObjectURL = URL.createObjectURL;
  const notices: string[] = [];
  const onToast = (event: Event) => {
    const message = (event as CustomEvent<{ message?: unknown }>).detail?.message;
    if (typeof message === 'string') notices.push(message);
  };
  window.addEventListener('unbox:toast', onToast);
  const download = { captured: null as Blob | null };
  let deviceId: string | null = null;

  try {
    await engine.resumeContext();
    engine.stopTransport();
    // Browser probes share the singleton engine with the application shell.
    // Start from returns-only so another template's pattern cannot extend the
    // intended four-step tempo-map duration.
    engine.newProject(true);
    engine.setPlaybackMode('song_arrangement');
    engine.timeMap.tempoMap.clear(240);
    engine.setBpm(240);
    // Four 16ths would take 250 ms at the root tempo. The final two run at
    // 60 BPM, producing a 625 ms real body: the old root-BPM wall timer ended
    // this bounce 375 ms before its final scheduled step.
    engine.timeMap.tempoMap.addTempoEvent(24, 60);
    const device = engine.createDevice('subtractor', 'Realtime bounce clock probe');
    deviceId = device.id;
    const track = engine.tracks.find((candidate) => candidate.deviceId === device.id) as SequencerTrack | undefined;
    if (!track) throw new Error('Bounce probe did not create an instrument track.');
    track.arrangementClips = [{
      id: 'bounce_clock_clip', kind: 'notes', startBar: 0, lengthBars: 0.25, name: 'tempo-map bounce',
      notes: [{ step: 0, note: 60, velocity: 0.85, length: 1 }, { step: 3, note: 67, velocity: 0.85, length: 1 }],
    }];

    // Let the recorder's Blob worklet use the browser's real object URL. The
    // download interception below starts only after that module is cached.
    if (!(await ensureRecorderWorklet(engine.ctx))) throw new Error('Recorder worklet did not load for the bounce probe.');
    URL.createObjectURL = ((blob: Blob) => {
      download.captured = blob;
      // Preserve a valid browser URL for the anchor click while retaining the
      // in-memory blob for inspection. A synthetic blob URL produces a page
      // error even though the actual WAV was generated correctly.
      return originalCreateObjectURL(blob);
    }) as typeof URL.createObjectURL;
    const began = engine.ctx.currentTime;
    if (!(await engine.bounceRealtimeWav())) throw new Error(`Real-time bounce returned false (${notices.join(' | ') || 'no toast'}).`);
    const elapsed = engine.ctx.currentTime - began;
    const captured = download.captured;
    if (!captured) throw new Error('Bounce did not hand its WAV to the download boundary.');
    const data = await captured.arrayBuffer();
    const view = new DataView(data);
    if (new TextDecoder().decode(new Uint8Array(data, 0, 4)) !== 'RIFF') throw new Error('Bounce download was not a WAV file.');
    const sampleRate = view.getUint32(24, true);
    const dataBytes = view.getUint32(40, true);
    const duration = dataBytes / (sampleRate * 2 * 3); // 24-bit stereo PCM
    if (duration < 2.5 || duration > 3.2) {
      throw new Error(`Tempo-mapped bounce duration ${duration.toFixed(3)} s does not include its 625 ms body plus 2 s tail.`);
    }
    if (elapsed < 2.5 || elapsed > 3.3) {
      throw new Error(`AudioContext elapsed ${elapsed.toFixed(3)} s does not follow the scheduled bounce boundary.`);
    }
    if (engine.isPlaying) throw new Error('Bounce returned while transport was still playing.');
    result.dataset.status = 'passed';
    result.textContent = `PASS · tempo-mapped real-time bounce captured ${duration.toFixed(3)} s after ${elapsed.toFixed(3)} audio-clock seconds (625 ms body + 2 s tail).`;
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    window.removeEventListener('unbox:toast', onToast);
    engine.stopTransport();
    engine.timeMap.tempoMap.clear(120);
    engine.setBpm(120);
    if (deviceId) engine.removeDevice(deviceId, true);
  }
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
