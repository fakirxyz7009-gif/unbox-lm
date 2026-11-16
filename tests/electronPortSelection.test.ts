import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { listenOnFixedPort } from '../electron/listenOnFixedPort.cjs';
import { startProfileOrigin } from '../electron/profileOrigin.cjs';

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

test('desktop profile keeps its first fallback port across launches and refuses a second origin', async (t) => {
  const profileDirectory = mkdtempSync(path.join(os.tmpdir(), 'unbox-desktop-origin-'));
  const occupied = createServer();
  const first = createServer();
  const restarted = createServer();
  const conflicting = createServer();
  t.after(async () => {
    await Promise.all([occupied, first, restarted, conflicting].map(close));
    rmSync(profileDirectory, { recursive: true, force: true });
  });
  const firstChoice = await listen(occupied);
  const start = (server: Server) => startProfileOrigin({
    profileDirectory,
    defaultPorts: [firstChoice, 0],
    startServer: (ports: number[]) => listenOnFixedPort(server, ports),
    chooseLegacyOrigin: () => assert.fail('The fresh profile should not need a legacy choice'),
  });

  const firstPort = await start(first);
  assert.notEqual(firstPort, firstChoice);
  assert.equal(readFileSync(path.join(profileDirectory, 'loopback-origin-port'), 'utf8').trim(), String(firstPort));
  await close(first);
  await close(occupied);

  assert.equal(await start(restarted), firstPort);
  await assert.rejects(start(conflicting), {
    code: 'UNBOX_PROFILE_ORIGIN',
    message: new RegExp(`127\\.0\\.0\\.1:${firstPort} is in use`),
  });
  assert.equal(conflicting.listening, false);
  assert.equal(readFileSync(path.join(profileDirectory, 'loopback-origin-port'), 'utf8').trim(), String(firstPort));
});

test('desktop profile migrates old IndexedDB origins without moving their data', async (t) => {
  const profileDirectory = mkdtempSync(path.join(os.tmpdir(), 'unbox-desktop-origin-'));
  t.after(() => rmSync(profileDirectory, { recursive: true, force: true }));
  const addLegacyPort = (port: number) => {
    const directory = path.join(profileDirectory, 'IndexedDB', `http_127.0.0.1_${port}.indexeddb.leveldb`);
    mkdirSync(directory, { recursive: true });
    const projectData = path.join(directory, '000003.log');
    writeFileSync(projectData, `project-${port}`);
    return projectData;
  };
  const owner = addLegacyPort(59_246);
  const marker = path.join(profileDirectory, 'loopback-origin-port');
  const options = {
    profileDirectory,
    defaultPorts: [47_821, 0],
    startServer: async (ports: number[]) => {
      assert.deepEqual(ports, [59_246]);
      return ports[0];
    },
    chooseLegacyOrigin: () => assert.fail('A single legacy origin is unambiguous'),
  };
  assert.equal(await startProfileOrigin(options), 59_246);
  assert.equal(readFileSync(marker, 'utf8').trim(), '59246');

  const second = addLegacyPort(47_821);
  rmSync(marker);
  assert.equal(await startProfileOrigin({
    ...options,
    startServer: async () => assert.fail('Cancelling must not start a server'),
    chooseLegacyOrigin: (ports: number[]) => {
      assert.deepEqual(ports, [47_821, 59_246]);
      return null;
    },
  }), null);
  assert.equal(existsSync(marker), false);
  assert.equal(await startProfileOrigin({ ...options, chooseLegacyOrigin: () => 59_246 }), 59_246);
  assert.equal(await startProfileOrigin({
    ...options,
    selectLegacyOrigin: true,
    chooseLegacyOrigin: (ports: number[], assignedPort: number) => {
      assert.deepEqual(ports, [47_821, 59_246]);
      assert.equal(assignedPort, 59_246);
      return ports[0];
    },
    startServer: async (ports: number[]) => {
      assert.deepEqual(ports, [47_821]);
      return ports[0];
    },
  }), 47_821);
  assert.equal(readFileSync(marker, 'utf8').trim(), '47821');
  assert.equal(readFileSync(owner, 'utf8'), 'project-59246');
  assert.equal(readFileSync(second, 'utf8'), 'project-47821');
});
