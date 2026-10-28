import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveStaticPath } from '../electron/staticPath.cjs';

test('static server resolves ordinary request paths inside its root', () => {
  const root = path.resolve('dist');
  const result = resolveStaticPath(root, '/assets/app.js?v=1');
  assert.equal(result.status, 200);
  assert.equal(result.pathname, '/assets/app.js');
  assert.equal(result.filePath, path.join(root, 'assets', 'app.js'));
});

test('static server rejects traversal into a sibling sharing the dist prefix', () => {
  const root = path.resolve('dist');
  for (const requestUrl of [
    '/../dist-private/secret.txt',
    '/%2e%2e%2fdist-private%2fsecret.txt',
    '/..%5c..%5cdist-private%5csecret.txt',
  ]) {
    assert.equal(resolveStaticPath(root, requestUrl).status, 403, requestUrl);
  }
});

test('static server returns a client error for malformed or NUL-encoded paths', () => {
  const root = path.resolve('dist');
  assert.equal(resolveStaticPath(root, '/%E0%A4%A').status, 400);
  assert.equal(resolveStaticPath(root, '/assets%00/app.js').status, 400);
});
