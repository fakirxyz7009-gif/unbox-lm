import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Set PORT to a valid browser-probe port before starting the server.');
}

const server = await createServer({
  configFile: false,
  root,
  appType: 'mpa',
  resolve: { alias: { '@': path.join(root, 'src') } },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] },
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    hmr: false,
  },
});

await server.listen();
console.log(`Unbox browser probe server listening on http://127.0.0.1:${port}`);
