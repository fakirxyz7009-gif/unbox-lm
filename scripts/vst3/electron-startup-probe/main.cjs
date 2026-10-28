'use strict';

const fs = require('node:fs');
const { app } = require('electron');

const marker = process.env.UNBOX_ELECTRON_STARTUP_MARKER;
if (!marker) throw new Error('UNBOX_ELECTRON_STARTUP_MARKER was not provided');

function record(stage) {
  fs.appendFileSync(marker, `${stage}\n`);
}

record('main-loaded');
const timeout = setTimeout(() => {
  record('ready-timeout');
  app.exit(1);
}, 8_000);

app.whenReady().then(() => {
  clearTimeout(timeout);
  record('app-ready');
  app.exit(0);
}).catch((error) => {
  record(`ready-error:${error instanceof Error ? error.message : String(error)}`);
  app.exit(1);
});
