import { describe, expect, it, vi } from "vitest";
import { createEvent } from "h3";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { shoppingCentresFromPlaces, supermarketFootprintsFromPlaces } from "../server/services/places/shoppingCentres";
import { loadCompiledPlacesAround } from "../server/services/places/compiledDataset";
import { normalizeCompiledPlace, type CompiledPlaceRecord } from "../src/services/places/compiledPlaces";
import { elementAreaSquareMeters } from "../src/services/places/placeSurface";

const origin = { lat: 48.798422, lon: 2.278538 };
const place = (id: string, kind: string, areaM2?: number): CompiledPlaceRecord => ({ id, name: id, ...origin, category: "shop", kind, areaM2 });
describe("precompiled commercial footprints", () => {
  it("keeps unknown surfaces unknown and never infers them from names or brands", () => {
    const places = [place("node:1", "mall"), place("way:2", "supermarket", 750), place("node:3", "hypermarket"), place("way:4", "supermarket", Number.NaN)];
    expect(shoppingCentresFromPlaces(places, origin.lat, origin.lon)).toEqual([expect.objectContaining({ id: "node:1" })]);
    expect(shoppingCentresFromPlaces(places, origin.lat, origin.lon)[0]).not.toHaveProperty("areaM2");
    expect(supermarketFootprintsFromPlaces(places, origin.lat, origin.lon)).toEqual([{ placeId: "way:2", surfaceM2: 750 }]);
  });
  it("preserves the complete nearby radius across commune boundaries", () => {
    const places = [{ ...place("way:1", "mall", 5000), lon: 2.30 }, { ...place("way:2", "mall", 8000), lon: 2.50 }];
    expect(shoppingCentresFromPlaces(places, origin.lat, origin.lon).map(({ id }) => id)).toEqual(["way:1"]);
  });
  it("computes a verified footprint at compilation time and rejects open rings", () => {
    const geometry = [{ lat: 48.8, lon: 2.3 }, { lat: 48.8, lon: 2.301 }, { lat: 48.801, lon: 2.301 }, { lat: 48.801, lon: 2.3 }, { lat: 48.8, lon: 2.3 }];
    const element = { type: "way", id: 1, center: origin, tags: { shop: "mall", name: "Centre" }, geometry };
    expect(normalizeCompiledPlace(element)?.areaM2).toBeGreaterThan(8000);
    expect(elementAreaSquareMeters({ geometry: geometry.slice(0, -1) })).toBeUndefined();
    expect(elementAreaSquareMeters({ members: [{ role: "outer", geometry }, { role: "inner", geometry }] })).toBeUndefined();
  });
  it("uses the same compact compiled asset through the Pages ASSETS binding", async () => {
    const manifest = JSON.parse(await readFile("public/data/places/manifest.json", "utf8"));
    const bytes = await readFile(`public/data/places/${manifest.commercial.asset}`);
    expect(bytes.byteLength).toBe(manifest.commercial.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.commercial.checksumSha256);
    const assetFetch = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith("/manifest.json")) return Response.json(manifest);
      if (path.endsWith(`/${manifest.commercial.asset}`)) return new Response(bytes);
      throw new Error(`Unexpected asset ${path}`);
    });
    const request = new IncomingMessage(new Socket());
    request.url = "/api/places/shopping-centres";
    request.headers.host = "compiled-commercial-test.local";
    const event = createEvent(request, new ServerResponse(request));
    event.context.cloudflare = { env: { ASSETS: { fetch: assetFetch } } };
    const places = await loadCompiledPlacesAround(event, origin.lat, origin.lon, 5000);
    expect(places).toHaveLength(manifest.commercial.placeCount);
    expect(places.find(({ id }) => id === "way:257103526")?.areaM2).toBe(1013);
    await loadCompiledPlacesAround(event, origin.lat, origin.lon, 2000);
    expect(assetFetch).toHaveBeenCalledTimes(2);
  });
  it("returns an explicit error when the compiled asset is unavailable", async () => {
    const request = new IncomingMessage(new Socket());
    request.url = "/api/places/shopping-centres";
    request.headers.host = "missing-commercial-test.local";
    const event = createEvent(request, new ServerResponse(request));
    event.context.cloudflare = { env: { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } } };
    await expect(loadCompiledPlacesAround(event, origin.lat, origin.lon, 5000))
      .rejects.toMatchObject({ statusCode: 503, statusMessage: "Compiled places dataset unavailable." });
  });
});
