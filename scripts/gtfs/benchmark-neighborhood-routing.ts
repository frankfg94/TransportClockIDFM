import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { routeNeighborhoodJourneys } from "../../server/services/gtfs/routing";

// Same loader contract as Nitro's local GTFS storage; no network/provider is used.
Object.assign(globalThis, { useStorage: () => ({
  async getItem(key: string) { try { return JSON.parse(await readFile(resolve(".data/gtfs", key), "utf8")); } catch { return undefined; } },
}) });
const request = { origin: { lat: 48.8006, lon: 2.2870 }, datetime: "20261012T090000", destinations: [
  { id: "chatelet", lat: 48.8615, lon: 2.347 },
  { id: "montparnasse", lat: 48.8412, lon: 2.3205 },
] };
for (const state of ["cold", "warm"]) {
  const start = performance.now(), before = process.memoryUsage();
  const result = await routeNeighborhoodJourneys(undefined, request);
  (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
  console.info(JSON.stringify({ state, elapsedMs: Math.round(performance.now() - start), memoryMB: Object.fromEntries(Object.entries(process.memoryUsage()).map(([key, value]) => [key, Math.round(value / 1024 / 1024)])),
    initialHeapMB: Math.round(before.heapUsed / 1024 / 1024), diagnostics: result.diagnostics,
    destinations: result.destinations.map(d => ({ id: d.id, status: d.status, minutes: d.journeys[0]?.durationSeconds / 60, sections: d.journeys[0]?.sections.map(s => ({ type: s.type, line: s.lineCode, minutes: s.durationSeconds / 60, from: s.fromName, to: s.toName })) })) }));
}
