'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const sampleRate = 48_000;
const maxFrames = sampleRate * 30;

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('unboxVst3Clip', {
    async renderDelay(request) {
      const channels = request?.channels;
      if (request?.sampleRate !== sampleRate || !Array.isArray(channels) || channels.length !== 2 ||
          channels.some((channel) => !(channel instanceof Float32Array) || channel.length < 1 ||
            channel.length > maxFrames || channel.buffer.byteLength > maxFrames * Float32Array.BYTES_PER_ELEMENT) ||
          channels[0].length !== channels[1].length) {
        throw new Error('Unbox Test Delay accepts up to 30 seconds of stereo audio at 48 kHz.');
      }
      return ipcRenderer.invoke('unbox:vst3-test-delay', { sampleRate, channels });
    },
  });
}
