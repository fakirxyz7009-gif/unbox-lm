'use strict';

const FRAMES = 128;
const CHANNELS = 2;
const GAIN = 0.5;

process.on('message', (message) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'close') {
    process.disconnect();
    return;
  }
  if (message.type !== 'process') return;

  const { seq, sentAt, samples } = message;
  if (!Number.isSafeInteger(seq) || !(samples instanceof Float32Array) || samples.length !== FRAMES * CHANNELS) {
    process.send?.({ type: 'error', seq, error: 'Malformed stereo audio block.' });
    return;
  }

  for (let index = 0; index < samples.length; index++) samples[index] *= GAIN;
  process.send?.({ type: 'processed', seq, sentAt, completedAt: performance.now(), samples });
});

process.send?.({ type: 'ready', frames: FRAMES, channels: CHANNELS });
