import { createR2SignedHeaders, type NetexRuntimeEnv } from "../topology/netexCache";
import { GlobalIsochroneError } from "../../../src/features/transport-map/isochrones/contracts";

export interface IsochroneRangeSource {
  size: number;
  identity: string;
  read(offset: number, length: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** Only server configuration chooses a source; request parameters never contain paths/URLs. */
export async function openIsochroneSource(env: NetexRuntimeEnv, fetcher = fetch): Promise<IsochroneRangeSource> {
  const remote = env.IDFM_MAP_ISOCHRONES_REMOTE?.trim();
  if (remote) return openRemote(remote, env, fetcher);
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const location = path.resolve(env.IDFM_MAP_ISOCHRONES_LOCAL?.trim() || "../idfm-node-backend/public/data/isochrones/walking-isochrones.zip");
  const handle = await fs.open(location, "r").catch((error: NodeJS.ErrnoException) => {
    throw new GlobalIsochroneError(error.code === "ENOENT" ? "missing" : "unavailable");
  });
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new GlobalIsochroneError("invalid");
    return {
      size: info.size,
      identity: `${location}|${info.dev}|${info.ino}|${info.size}|${info.mtimeMs}|${info.ctimeMs}`,
      async read(offset, length) {
        assertRange(info.size, offset, length);
        const result = new Uint8Array(length);
        let cursor = 0;
        while (cursor < length) {
          const { bytesRead } = await handle.read(result, cursor, length - cursor, offset + cursor);
          if (!bytesRead) throw new GlobalIsochroneError("invalid");
          cursor += bytesRead;
        }
        return result;
      },
      close: () => handle.close(),
    };
  } catch (error) { await handle.close(); throw error; }
}

async function openRemote(location: string, env: NetexRuntimeEnv, fetcher: typeof fetch): Promise<IsochroneRangeSource> {
  let url = new URL(location);
  const signed = url.protocol === "r2:";
  if (signed) {
    const endpoint = env.R2_ENDPOINT?.replace(/\/+$/u, "") || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const key = url.pathname.split("/").filter(Boolean).map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
    url = new URL(`${endpoint}/${encodeURIComponent(url.hostname)}/${key}`);
  }
  if (!/^https?:$/u.test(url.protocol) || url.username || url.password) throw new GlobalIsochroneError("unavailable");
  const headersFor = async (method: "HEAD" | "GET") => signed ? createR2SignedHeaders(url, env, method) : new Headers();
  const head = await fetcher(url, { method: "HEAD", headers: await headersFor("HEAD"), signal: AbortSignal.timeout(15_000), redirect: "manual" });
  assertResponse(head);
  const size = Number(head.headers.get("content-length"));
  const etag = head.headers.get("etag");
  // A stable validator prevents mixing bytes of two atlas publications.
  if (!Number.isSafeInteger(size) || size < 22 || !etag || etag.startsWith("W/")) throw new GlobalIsochroneError("invalid");
  assertIdentityEncoding(head);
  return {
    size, identity: `${url.href}|${etag}|${size}`, close: async () => {},
    async read(offset, length) {
      assertRange(size, offset, length);
      const headers = await headersFor("GET");
      headers.set("Range", `bytes=${offset}-${offset + length - 1}`);
      headers.set("If-Match", etag);
      headers.set("Accept-Encoding", "identity");
      const response = await fetcher(url, { headers, signal: AbortSignal.timeout(20_000), redirect: "manual" });
      assertResponse(response);
      if (response.status !== 206 || response.headers.get("content-range") !== `bytes ${offset}-${offset + length - 1}/${size}` ||
        (response.headers.get("etag") && response.headers.get("etag") !== etag)) {
        await response.body?.cancel();
        throw new GlobalIsochroneError("invalid");
      }
      assertIdentityEncoding(response);
      return readBoundedBody(response, length, true);
    },
  };
}

function assertResponse(response: Response): void {
  if (response.status === 404) throw new GlobalIsochroneError("missing");
  if (!response.ok) throw new GlobalIsochroneError("unavailable");
}
function assertIdentityEncoding(response: Response): void {
  const encoding = response.headers.get("content-encoding");
  if (encoding && encoding !== "identity") throw new GlobalIsochroneError("invalid");
}
function assertRange(size: number, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 || offset + length > size) throw new GlobalIsochroneError("invalid");
}

export async function readBoundedBody(response: Response, maximum: number, exact = false): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel();
    throw new GlobalIsochroneError("invalid");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new GlobalIsochroneError("invalid");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new GlobalIsochroneError("invalid"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  if (exact && size !== maximum) throw new GlobalIsochroneError("invalid");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
