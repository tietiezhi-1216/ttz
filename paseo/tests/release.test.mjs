import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { VERSION } from '../version.ts';
const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));

test('release versions are consistent', () => {
  assert.equal(read('../package.json').version, VERSION);
  assert.equal(read('../../package.json').version, VERSION);
  const lock = read('../package-lock.json');
  assert.equal(lock.version, VERSION);
  assert.equal(lock.packages[''].version, VERSION);
});

test('Git installation explicitly prepares dependencies and checks types', () => {
  const manifest = read('../paseo-plugin.json');
  assert.equal(manifest.id, 'ttz');
  assert.deepEqual(manifest.build, [
    ['npm', '--cache', '/tmp/ttz-npm-cache', 'ci', '--ignore-scripts'],
    ['npm', '--cache', '/tmp/ttz-npm-cache', 'run', 'typecheck'],
  ]);
  assert.match(read('../package.json').dependencies['@earendil-works/pi-ai'], /^\d+\.\d+\.\d+$/);
});
