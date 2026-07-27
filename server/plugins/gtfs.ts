import { getGtfsPublicStatus } from "../services/gtfs/runtime";

let preloadPromise: Promise<void> | undefined;

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", async (event) => {
    preloadPromise ??= getGtfsPublicStatus(event)
      .then((status) => {
        console.info(
          `[gtfs] enabled=${status.enabled} available=${status.available} storage=${status.storage}` +
            (status.datasetVersion
              ? ` version=${status.datasetVersion} hash=${status.sha256 ?? "unknown"} ageDays=${status.ageDays ?? "unknown"}`
              : ""),
        );
      })
      .catch((error) => {
        console.warn(
          "[gtfs] unable to preload status",
          error instanceof Error ? error.message : error,
        );
      });
    await preloadPromise;
  });
});
