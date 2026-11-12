import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { listenOnFixedPort } from '../electron/listenOnFixedPort.cjs';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return address.port;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('fixed-port fallback skips consecutive occupied ports without parallel retries', async () => {
  const occupied = [createServer(), createServer()];
  const candidate = createServer();
  try {
    const ports = await Promise.all(occupied.map(listen));
    const selected = await listenOnFixedPort(candidate, [...ports, 0]);
    const address = candidate.address();

    assert.ok(address && typeof address !== 'string');
    assert.equal(selected, address.port);
    assert.notEqual(selected, ports[0]);
    assert.notEqual(selected, ports[1]);
    assert.equal(candidate.listenerCount('error'), 0);
  } finally {
    await Promise.all([close(candidate), ...occupied.map(close)]);
  }
});
