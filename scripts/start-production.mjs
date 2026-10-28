import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['scripts/local-temp.mjs', 'tsx', 'server.ts'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

child.on('error', (error) => {
  console.error('Could not start the production server:', error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
