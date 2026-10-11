import type { GlobalMapBootstrap, GlobalMapLinePaletteDocument, GlobalMapManifest } from "../contracts/manifest";
import { assertRegionalPayload, decodeBootstrap, decodeRegionalPaths, parseCatalogPayload } from "../data/assetLoader";
import { buildStationSpatialIndex } from "../spatial/packedIndex";
import type { TransportMapWorkerCollection, TransportMapWorkerPart } from "./protocol";

export interface CatalogDecodePayload {
  raw: string;
  bootstrap: GlobalMapBootstrap;
  manifest: Pick<GlobalMapManifest, "schemaVersion" | "dataVersion" | "bounds">;
  palette?: GlobalMapLinePaletteDocument;
}

export interface RegionalDecodePayload {
  raw: string;
  bootstrap: Pick<GlobalMapBootstrap, "lines">;
  manifest: Pick<GlobalMapManifest, "schemaVersion" | "dataVersion">;
}

export function decodeCatalogAsset(payload: CatalogDecodePayload) {
  const catalog = parseCatalogPayload(payload.raw, payload.manifest);
  // The data source retains its already loaded regional geometry. Do not
  // rebuild thousands of fallback paths while upgrading only the catalogue.
  const network = decodeBootstrap({ ...payload.bootstrap, paths: [] }, payload.manifest, catalog, payload.palette);
  return { network, stationIndex: buildStationSpatialIndex(network.stations) };
}

export function decodeRegionalAsset(payload: RegionalDecodePayload) {
  return decodeRegionalPaths(assertRegionalPayload(JSON.parse(payload.raw), payload.manifest), payload.bootstrap);
}

/** Preserve every record/vertex, but never clone the entire dataset in one task. */
export function* assetResultParts(
  collection: TransportMapWorkerCollection,
  items: readonly unknown[],
): Generator<TransportMapWorkerPart> {
  let batch: unknown[] = [];
  let vertices = 0;
  for (const item of items) {
    const path = item as { vertices?: unknown[]; lodVertices?: Record<string, unknown[]> };
    const count = collection === "paths"
      ? (path.vertices?.length ?? 0) + Object.values(path.lodVertices ?? {}).reduce((sum, vertices) => sum + vertices.length, 0)
      : 0;
    if (batch.length && (batch.length >= 256 || vertices + count > 4096)) {
      yield { collection, items: batch };
      batch = [];
      vertices = 0;
    }
    batch.push(item);
    vertices += count;
  }
  if (batch.length) yield { collection, items: batch };
}
