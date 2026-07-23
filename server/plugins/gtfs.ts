import { getGtfsPublicStatus } from "../services/gtfs/runtime";

export default defineNitroPlugin(async () => {
  try {
    const status = await getGtfsPublicStatus();
    console.info(
      `[gtfs] enabled=${status.enabled} available=${status.available} storage=${status.storage}` +
        (status.datasetVersion
          ? ` version=${status.datasetVersion} hash=${status.sha256 ?? "unknown"} ageDays=${status.ageDays ?? "unknown"}`
          : ""),
    );
  } catch (error) {
    console.warn("[gtfs] unable to preload status", error instanceof Error ? error.message : error);
  }
});
