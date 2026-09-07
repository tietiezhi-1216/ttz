import assert from 'node:assert/strict';
import test from 'node:test';
import { createPillPanelController } from '../pill-panel.client.ts';

test('three mounted pill instances open one modal and close in one action', () => {
  const panel = createPillPanelController();
  const visible = [false, false, false];
  visible.forEach((_, i) => panel.register((open) => { visible[i] = open; }));
  panel.open();
  assert.equal(visible.filter(Boolean).length, 1);
  panel.open();
  panel.open();
  assert.equal(visible.filter(Boolean).length, 1);
  panel.close();
  assert.deepEqual(visible, [false, false, false]);
  panel.open();
  assert.equal(visible.filter(Boolean).length, 1);
});

test('unmounting the owner does not leave a stale controller lock', () => {
  const panel = createPillPanelController();
  let first = false;
  const removeFirst = panel.register((open) => { first = open; });
  const removeSecond = panel.register(() => {});
  panel.open();
  assert.equal(first, false);
  removeSecond();
  panel.open();
  assert.equal(first, true);
  panel.close();
  assert.equal(first, false);
  removeFirst();
  assert.equal(panel.size, 0);
  assert.doesNotThrow(() => { panel.open(); panel.close(); });
});

test('mounting another track while open does not create a second modal', () => {
  const panel = createPillPanelController();
  let first = false, second = false;
  panel.register((open) => { first = open; });
  panel.open();
  panel.register((open) => { second = open; });
  panel.open();
  assert.deepEqual([first, second], [true, false]);
  panel.close();
  assert.deepEqual([first, second], [false, false]);
});
