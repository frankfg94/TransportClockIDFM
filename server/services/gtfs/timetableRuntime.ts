import type { H3Event } from "h3";
import { createGtfsTimetableLoader } from "../../../shared/gtfs/timetableRuntime";
import { getGtfsManifest, getGtfsRuntimeCacheEpoch, isGtfsEnabled, readGtfsJson } from "./runtime";
const loader = createGtfsTimetableLoader<H3Event | undefined>({
  getManifest: getGtfsManifest,
  isEnabled: isGtfsEnabled,
  cacheEpoch: getGtfsRuntimeCacheEpoch,
  readJson: async <T>(event: H3Event | undefined, path: string) => (await readGtfsJson<T>(event, path)).value,
});
export const loadGtfsTimetableForDate = loader.loadForDate;
export const clearGtfsTimetableCaches = loader.clear;
