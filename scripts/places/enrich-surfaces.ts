import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { assertCompiledPlacesCity, assertPlacesManifest, MAX_PLACES_ASSET_BYTES, type OverpassElement } from "../../src/services/places/compiledPlaces";
import { CINEMA_FOOTPRINT_AREAS_FILE, MARKET_FOOTPRINT_AREAS_FILE } from "../../src/services/places/venueFootprintAreas";
import { elementAreaSquareMeters, elementFootprintRings } from "../../src/services/places/placeSurface";

type VenueKind = "marketplace" | "cinema";
type OsmTarget = { type: string; id: number };

export async function enrichCompiledPlaceSurfaces(options: { root?: string; endpoint?: string; fetcher?: typeof fetch; onlyVenue?: VenueKind } = {}) {
  const root = resolve(options.root ?? "public/data/places");
  const endpoint = options.endpoint ?? process.env.PLACES_OVERPASS_URL ?? "http://127.0.0.1:12345/api/interpreter";
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  assertPlacesManifest(manifest);
  const selected = new Map<string, OsmTarget>();
  const venueAssets = [
    { kind: "marketplace", filename: MARKET_FOOTPRINT_AREAS_FILE, targets: new Map<string, OsmTarget>() },
    { kind: "cinema", filename: CINEMA_FOOTPRINT_AREAS_FILE, targets: new Map<string, OsmTarget>() },
  ].filter(venue => !options.onlyVenue || options.onlyVenue === venue.kind);
  const assetNames = [...new Set(manifest.cities.flatMap((city) => city.assetMetadata?.map(({ asset }) => asset) ?? city.assets ?? [city.asset]))];
  const assetPath = (asset: string) => {
    const name = asset.replace(/^places\//u, "");
    if (!/^[\w.-]+\.json$/u.test(name)) throw new Error("Invalid places asset path");
    return resolve(root, name);
  };
  for (const asset of assetNames) {
    const file = JSON.parse(await readFile(assetPath(asset), "utf8"));
    assertCompiledPlacesCity(file);
    for (const place of file.places) {
      const match = /^(way|relation):(\d+)$/u.exec(place.id);
      if (!match) continue;
      const target = { type: match[1]!, id: Number(match[2]) };
      for (const venue of venueAssets) {
        if (place.kind === venue.kind || place.tags?.amenity === venue.kind) venue.targets.set(place.id, target);
      }
      if (!options.onlyVenue && ["mall", "shopping_centre", "supermarket", "hypermarket"].includes(place.tags?.shop ?? place.kind)) {
        selected.set(place.id, target);
      }
    }
  }
  const targets = [...new Map([...selected, ...venueAssets.flatMap(venue => [...venue.targets])]).values()];
  console.log(`Compiling verified footprints for ${targets.length} places`);
  const surfaces = new Map<string, number>();
  const footprints = new Map<string, [number, number][][]>();
  const seen = new Set<string>();
  // ID lookups avoid a spatial scan and keep large builds in bounded batches.
  for (let index = 0; index < targets.length; index += 1_000) {
    const batch = targets.slice(index, index + 1_000);
    const clauses = ["way", "relation"].flatMap((type) => {
      const ids = batch.filter((item) => item.type === type).map(({ id }) => id);
      return ids.length ? [`${type}(id:${ids.join(",")});`] : [];
    });
    const query = `[out:json][timeout:25][maxsize:67108864];(${clauses.join("")});out geom tags qt;`;
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST", headers: { accept: "application/json", "user-agent": "TransportClockGPT/0.1 (compiled place surfaces)", "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(40_000),
    });
    if (!response.ok) throw new Error(`Places surface compilation failed: HTTP ${response.status} ${(await response.text()).slice(0, 250)}`);
    const payload = await response.json() as { elements?: OverpassElement[]; remark?: string };
    if (!Array.isArray(payload.elements) || payload.remark) throw new Error("Incomplete Overpass surface compilation");
    for (const element of payload.elements) {
      const id = `${element.type}:${element.id}`;
      seen.add(id);
      const area = elementAreaSquareMeters(element);
      if (area !== undefined && Number.isFinite(area) && area > 0) surfaces.set(id, Math.round(area));
      const rings = selected.has(id) ? elementFootprintRings(element) : undefined;
      if (rings) footprints.set(id, rings);
    }
    console.log(`Surfaces: ${Math.min(index + batch.length, targets.length)}/${targets.length}`);
  }
  const venueCoverage = await Promise.all(venueAssets.map(async ({ kind, filename, targets }) => {
    const areas = Object.fromEntries([...targets.keys()].sort().flatMap(id => {
      const area = surfaces.get(id);
      return area !== undefined && area > 0 ? [[id, area]] : [];
    }));
    await writeFile(resolve(root, filename), JSON.stringify({ schemaVersion: 1, areas }) + "\n");
    return { kind, eligible: targets.size, withSurface: Object.keys(areas).length };
  }));
  if (options.onlyVenue) return { venueCoverage, changedFiles: venueAssets.length };
  // Finish all upstream reads before touching published assets. Network failure
  // leaves the previous dataset intact; no runtime Overpass fallback is needed.
  const metadata = new Map<string, { asset: string; bytes: number; checksumSha256: string; placeCount: number }>();
  const commercialPlaces = new Map<string, import("../../src/services/places/compiledPlaces").CompiledPlaceRecord>();
  let changedFiles = 0;
  for (const asset of assetNames) {
    const original = await readFile(assetPath(asset), "utf8");
    const file = JSON.parse(original);
    assertCompiledPlacesCity(file);
    let changed = false;
    for (const place of file.places) {
      if (["mall", "shopping_centre", "supermarket", "hypermarket"].includes(place.tags?.shop ?? place.kind)) commercialPlaces.set(place.id, place);
      if (!selected.has(place.id)) continue;
      const area = surfaces.get(place.id);
      if (place.areaM2 !== area) {
        if (area === undefined) delete place.areaM2;
        else place.areaM2 = area;
        changed = true;
      }
      if (["supermarket", "hypermarket"].includes(place.tags?.shop ?? place.kind)) {
        const rings = footprints.get(place.id);
        if (JSON.stringify(place.footprintRings) !== JSON.stringify(rings)) {
          if (rings) place.footprintRings = rings;
          else delete place.footprintRings;
          changed = true;
        }
      }
    }
    const bytes = Buffer.from(changed ? JSON.stringify(file) : original);
    if (bytes.length > MAX_PLACES_ASSET_BYTES) throw new Error(`Surface-enriched asset exceeds Pages limit: ${asset}`);
    metadata.set(asset, { asset, bytes: bytes.length, checksumSha256: createHash("sha256").update(bytes).digest("hex"), placeCount: file.places.length });
    if (changed) { await writeFile(assetPath(asset), bytes); changedFiles += 1; }
  }
  for (const city of manifest.cities) {
    const assets = city.assetMetadata?.map(({ asset }) => asset) ?? city.assets ?? [city.asset];
    city.assetMetadata = assets.map((asset) => metadata.get(asset)!);
    city.bytes = city.assetMetadata[0]!.bytes;
    city.checksumSha256 = city.assetMetadata[0]!.checksumSha256;
    if (assets.length > 1) city.totalBytes = city.assetMetadata.reduce((sum, asset) => sum + asset.bytes, 0);
  }
  manifest.normalizationVersion = "osm-places-normalization-v2-surfaces";
  const coverage = { generatedAt: new Date().toISOString(), eligible: selected.size,
    observed: [...selected.keys()].filter(id => seen.has(id)).length,
    withSurface: [...selected.keys()].filter(id => surfaces.has(id)).length };
  const commercialBytes = Buffer.from(JSON.stringify({ schemaVersion: manifest.schemaVersion, datasetId: manifest.datasetId,
    generatedAt: coverage.generatedAt, sourceGeneratedAt: manifest.generatedAt,
    places: [...commercialPlaces.values()].sort((left, right) => left.id.localeCompare(right.id)),
  }));
  const commercialAsset = "commercial-places.json";
  if (commercialBytes.length > MAX_PLACES_ASSET_BYTES) throw new Error("Commercial places index exceeds Pages asset limit");
  await writeFile(resolve(root, commercialAsset), commercialBytes);
  manifest.commercial = { asset: commercialAsset, bytes: commercialBytes.length,
    checksumSha256: createHash("sha256").update(commercialBytes).digest("hex"), placeCount: commercialPlaces.size };
  await writeFile(resolve(root, "manifest.json"), JSON.stringify({ ...manifest, surfaceCoverage: coverage }));
  return { ...coverage, venueCoverage, changedFiles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const endpoint = process.argv.find((arg) => arg.startsWith("--endpoint="))?.slice("--endpoint=".length);
  const onlyVenue = process.argv.includes("--markets-only") ? "marketplace"
    : process.argv.includes("--cinemas-only") ? "cinema" : undefined;
  enrichCompiledPlaceSurfaces({ endpoint, onlyVenue }).then(console.log).catch((error) => { console.error(error); process.exitCode = 1; });
}
