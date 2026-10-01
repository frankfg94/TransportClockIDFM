import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { acquireUpdateLock } from './updateLock.mjs';
test('concurrent CLI/UI updates cannot own the same target', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'transit-lock-test-'));
  const target = path.join(root, 'data');
  try {
    const release = await acquireUpdateLock(target);
    await assert.rejects(acquireUpdateLock(target), /already running/);
    await release();
    const again = await acquireUpdateLock(target);
    await again();
  } finally {
    assert.ok(root.startsWith(path.resolve(tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});
