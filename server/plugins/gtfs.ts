import { getGtfsPublicStatus } from "../services/gtfs/runtime";
import { getRidershipStatus } from "../services/ridership/ridershipCache";
import {
  getNetexCacheStatus,
  getNetexRuntimeEnv,
  type NetexCacheStatus,
} from "../services/topology/netexCache";
import type { GtfsPublicStatus } from "../services/gtfs/types";
import type { AnnualRidershipStatusResponse } from "../../src/types/ridership";

let preloadPromise: Promise<void> | undefined;

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", async (event) => {
    preloadPromise ??= preloadDataStatuses(event);
    await preloadPromise;
  });
});

async function preloadDataStatuses(event: Parameters<typeof getGtfsPublicStatus>[0]): Promise<void> {
  const runtimeEnv = getNetexRuntimeEnv(event);
  const [gtfs, netex, ridership] = await Promise.all([
    getGtfsPublicStatus(event).catch((error): GtfsPublicStatus => {
      console.warn(
        "[gtfs] unable to preload status",
        error instanceof Error ? error.message : error,
      );
      return {
        enabled: true,
        available: false,
        stale: false,
        storage: "unconfigured",
      };
    }),
    getNetexCacheStatus(runtimeEnv).catch((error): NetexCacheStatus => ({
      available: false,
      source: { kind: "auto", location: "unknown" },
      message: error instanceof Error ? error.message : String(error),
    })),
    getRidershipStatus(runtimeEnv).catch((error): AnnualRidershipStatusResponse => ({
      available: false,
      source: { kind: "auto", location: "unknown" },
      message: error instanceof Error ? error.message : String(error),
    })),
  ]);

  console.info(
    `[data-status] netex loaded=${netex.available} mode=${cacheMode(netex.source?.kind)} ` +
      `lines=${netex.lineCount ?? 0}${netex.message ? ` error="${netex.message}"` : ""}`,
  );
  console.info(
    `[data-status] gtfs enabled=${gtfs.enabled} loaded=${gtfs.available} ` +
      `mode=${gtfsMode(gtfs)} lines=${gtfs.lineCount ?? 0}`,
  );
  console.info(
    `[data-status] ridership loaded=${ridership.available} mode=${cacheMode(ridership.source?.kind)} ` +
      `lines=${ridership.counts?.availableLines ?? 0}/${ridership.counts?.lines ?? 0} ` +
      `stations=${ridership.counts?.availableStations ?? 0}/${ridership.counts?.stations ?? 0}` +
      `${ridership.message ? ` error="${ridership.message}"` : ""}`,
  );
}

function cacheMode(kind?: string): string {
  if (kind === "directory") return "Local";
  if (kind === "r2") return "Online (Cloudflare R2)";
  if (kind === "remote") return "Online (HTTP)";
  return "Not configured";
}

function gtfsMode(status: GtfsPublicStatus): string {
  if (!status.enabled || status.storage === "unconfigured") return "Not configured";
  if (status.storage === "r2") return "Online (Cloudflare R2)";
  return "Local";
}
