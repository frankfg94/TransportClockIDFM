import { IndexedIsochroneArchive } from "./indexedArchive";
import { openIsochroneSource } from "./rangeSource";
import type { NetexRuntimeEnv } from "../topology/netexCache";
import type { GlobalIsochroneRequest } from "../../../src/features/transport-map/isochrones/contracts";

const archives = new Map<string, { expires: number; value: Promise<IndexedIsochroneArchive> }>();
export function clearIsochroneServerCache(): void { archives.clear(); }

export async function selectServerIsochrones(requests: GlobalIsochroneRequest[], mapVersion: string, env: NetexRuntimeEnv, reload = false) {
  const source = await openIsochroneSource(env);
  try {
    let cached = archives.get(source.identity);
    if (reload || !cached || cached.expires < Date.now()) {
      archives.delete(source.identity);
      while (archives.size >= 2) archives.delete(archives.keys().next().value!);
      const value = IndexedIsochroneArchive.open(source);
      cached = { expires: Date.now() + 300_000, value };
      archives.set(source.identity, cached);
      value.catch(() => { if (archives.get(source.identity)?.value === value) archives.delete(source.identity); });
    }
    const archive = await cached.value;
    return await archive.select(source, requests, mapVersion);
  } finally { await source.close(); }
}
