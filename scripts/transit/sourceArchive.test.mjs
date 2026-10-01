import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { downloadSourceArchive } from './sourceArchive.mjs';

async function fixture(run) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'transit-source-test-'));
  try { await run(join(directory, 'archive.zip'), directory); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}
const zip = Buffer.from('504b030401020304', 'hex');

test('installs complete ZIP bytes and records source validators and SHA', () => fixture(async archivePath => {
  const result = await downloadSourceArchive({ url: 'https://source.test/feed.zip', archivePath,
    fetchSource: async () => new Response(zip, { headers: { 'content-length': String(zip.length), etag: 'v2' } }),
  });
  assert.equal(result.sha256, createHash('sha256').update(zip).digest('hex'));
  assert.equal(result.etag, 'v2');
  assert.deepEqual(await fs.readFile(archivePath), zip);
}));
test('conditional 304 does not create an input and full rebuild omits validators', () => fixture(async (archivePath, directory) => {
  const previous = { sourceEtag: 'v1', sourceLastModified: 'Tue, 29 Sep 2026 14:00:00 GMT' };
  const result = await downloadSourceArchive({ url: 'https://source.test/feed.zip', archivePath, previous,
    fetchSource: async (_url, options) => {
      assert.equal(options.headers['If-None-Match'], 'v1');
      return new Response(null, { status: 304 });
    },
  });
  assert.equal(result.status, 'unchanged');
  assert.deepEqual(await fs.readdir(directory), []);
  await assert.rejects(downloadSourceArchive({ url: 'https://source.test/feed.zip', archivePath, previous, reindex: true,
    fetchSource: async (_url, options) => {
      assert.equal(options.headers['If-None-Match'], undefined);
      return new Response(null, { status: 304 });
    },
  }), /requires a full archive/);
}));
test('rejects invalid ZIP or excessive size and removes incomplete bytes', () => fixture(async (archivePath, directory) => {
  for (const options of [
    { fetchSource: async () => new Response('HTML instead of a zip') },
    { maxBytes: 4, fetchSource: async () => new Response(zip) },
    { maxBytes: 4, fetchSource: async () => new Response(zip, { headers: { 'content-length': '8' } }) },
  ]) {
    await assert.rejects(downloadSourceArchive({ url: 'https://source.test/feed.zip', archivePath, ...options }));
    assert.deepEqual(await fs.readdir(directory), []);
  }
}));
test('retries a transient source error before installing a complete archive', () => fixture(async archivePath => {
  let requests = 0;
  const result = await downloadSourceArchive({ url: 'https://source.test/feed.zip', archivePath,
    fetchSource: async () => ++requests === 1 ? new Response(null, { status: 503 }) : new Response(zip),
  });
  assert.equal(requests, 2);
  assert.equal(result.status, 'downloaded');
}));
