import type { H3Event } from "h3";
import { createR2SignedHeaders, getNetexRuntimeEnv, type NetexRuntimeEnv } from "../topology/netexCache";
import { VERDICT_SCHEMA_VERSION, type CompiledNeighborhoodVerdictData } from "./contracts";

let cached: { key: string; data: CompiledNeighborhoodVerdictData; expires: number } | undefined;
const pending = new Map<string, Promise<CompiledNeighborhoodVerdictData>>();

export function getNeighborhoodVerdictSource(env: NetexRuntimeEnv, localPath?: string) {
  const remote = env.IDFM_NEIGHBORHOOD_VERDICT_CACHE_REMOTE?.trim();
  if (remote) return { kind: remote.startsWith("r2://") ? "r2" : "remote", location: remote };
  return { kind: "directory", location: localPath || env.NUXT_NEIGHBORHOOD_VERDICT_DATA_PATH?.trim() ||
    `${env.NEIGHBORHOOD_VERDICT_DATA_DIR?.trim() || "../idfm-node-backend/.data/neighborhood-verdict"}/compiled.json` };
}

export async function getCompiledNeighborhoodVerdictData(event: H3Event): Promise<CompiledNeighborhoodVerdictData> {
  return loadCompiledNeighborhoodVerdictData(getNetexRuntimeEnv(event), String(useRuntimeConfig(event).neighborhoodVerdictDataPath || ""));
}

/** Shared by Nitro and check:data. An explicit remote never falls back to disk. */
export async function loadCompiledNeighborhoodVerdictData(env: NetexRuntimeEnv, localPath?: string): Promise<CompiledNeighborhoodVerdictData> {
  const source = getNeighborhoodVerdictSource(env, localPath);
  let key = source.location;
  if (source.kind === "directory") {
    const { stat } = await import("node:fs/promises");
    const info = await stat(source.location);
    key += `:${info.mtimeMs}:${info.size}`;
  }
  if (cached?.key === key && cached.expires > Date.now()) return cached.data;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    let data: CompiledNeighborhoodVerdictData;
    if (source.kind === "directory") {
      const { readFile } = await import("node:fs/promises");
      data = JSON.parse(await readFile(source.location, "utf8"));
    } else {
      let url = new URL(source.location);
      if (url.username || url.password || url.search || url.hash) throw new Error("Invalid verdict cache URL.");
      let headers = new Headers();
      if (source.kind === "r2") {
        for (const name of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
          if (!env[name]?.trim()) throw new Error(`Missing ${name} for verdict R2 cache.`);
        }
        if (!env.R2_ENDPOINT && !env.R2_ACCOUNT_ID) throw new Error("Missing R2_ACCOUNT_ID or R2_ENDPOINT.");
        const endpoint = env.R2_ENDPOINT?.replace(/\/+$/u, "") || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
        const objectKey = url.pathname.split("/").filter(Boolean).map(part => encodeURIComponent(decodeURIComponent(part))).join("/");
        if (!objectKey) throw new Error("Verdict R2 URL must point to compiled.json.");
        url = new URL(`${endpoint}/${encodeURIComponent(url.hostname)}/${objectKey}`);
        headers = await createR2SignedHeaders(url, env);
      }
      if (!/^https?:$/u.test(url.protocol)) throw new Error("Verdict cache requires r2:// or HTTP(S).");
      // Workers supports manual/follow only. Reject 3xx below without forwarding credentials.
      const response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Verdict cache request failed: HTTP ${response.status}`);
      data = await response.json() as CompiledNeighborhoodVerdictData;
    }
    validateCompiledNeighborhoodVerdictData(data);
    cached = { key, data, expires: Date.now() + 60_000 };
    return data;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}

export function validateCompiledNeighborhoodVerdictData(
  data: CompiledNeighborhoodVerdictData,
): void {
  if (data.schemaVersion !== VERDICT_SCHEMA_VERSION) {
    throw new Error(`Unsupported verdict schema ${data.schemaVersion}`);
  }
  if (!data.generatedAt || !Array.isArray(data.sources)) {
    throw new Error("Compiled verdict metadata is incomplete.");
  }
  if (!data.greenSpaces.length || !data.gpeStations.length) {
    throw new Error("Compiled verdict geometry is incomplete.");
  }
  if (!Object.keys(data.airNoiseCommunes).length) {
    throw new Error("Air/noise mapper produced no commune.");
  }
  if (!Object.keys(data.security.communes).length) {
    throw new Error("SSMSI mapper produced no publishable commune.");
  }
  if (data.airNoiseGrid) {
    const { columns, rows, classes, values } = data.airNoiseGrid;
    if (
      !Number.isInteger(columns) || columns <= 0 ||
      !Number.isInteger(rows) || rows <= 0 ||
      classes.length !== columns * rows || values.length === 0
    ) {
      throw new Error("Compiled air/noise grid is invalid.");
    }
  }
}
