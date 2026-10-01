import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Common source import: conditional HTTP, bounded streaming, SHA-256, ZIP signature,
 * timeout/retry and complete-file activation. Partial downloads never become inputs. */
export async function downloadSourceArchive({ url, archivePath, previous, reindex = false,
  maxBytes = 512 * 1024 * 1024, progress = () => {}, fetchSource = fetch }) {
  const headers = { Accept: 'application/zip' };
  if (!reindex && previous?.sourceEtag) headers['If-None-Match'] = previous.sourceEtag;
  if (!reindex && previous?.sourceLastModified) headers['If-Modified-Since'] = previous.sourceLastModified;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const partial = `${archivePath}.${randomUUID()}.part`;
    try {
      const signal = AbortSignal.timeout(15 * 60 * 1000);
      const response = await fetchSource(url, { headers, redirect: 'follow', signal });
      if (response.status === 304) {
        if (reindex) throw new SourceValidationError('Source reindex requires a full archive, but the source returned 304.');
        return { status: 'unchanged' };
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        const ErrorType = response.status === 429 || response.status >= 500 ? Error : SourceValidationError;
        throw new ErrorType(`Source download failed (HTTP ${response.status}).`);
      }
      const advertised = Number(response.headers.get('content-length')) || undefined;
      if (advertised && advertised > maxBytes) {
        await response.body.cancel();
        throw new SourceValidationError('Source archive exceeds the compressed size limit.');
      }
      const hash = createHash('sha256');
      let bytes = 0;
      let signature = Buffer.alloc(0);
      const meter = new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes) return callback(new SourceValidationError('Source archive exceeds the compressed size limit.'));
        if (signature.length < 4) signature = Buffer.concat([signature, chunk]).subarray(0, 4);
        hash.update(chunk);
        progress(bytes, advertised);
        callback(null, chunk);
      }});
      await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial, { flags: 'wx' }), { signal });
      if (signature.toString('hex') !== '504b0304') throw new SourceValidationError('Downloaded source is not a ZIP archive.');
      if (advertised && bytes !== advertised) throw new Error('Source download is incomplete.');
      const handle = await fs.open(partial, 'r+');
      try { await handle.sync(); } finally { await handle.close(); }
      await fs.rename(partial, archivePath);
      return { status: 'downloaded', sha256: hash.digest('hex'), bytes,
        etag: response.headers.get('etag') ?? undefined,
        lastModified: response.headers.get('last-modified') ?? undefined };
    } catch (error) {
      await fs.rm(partial, { force: true });
      if (attempt === 3 || error instanceof SourceValidationError) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
}

class SourceValidationError extends Error {}
