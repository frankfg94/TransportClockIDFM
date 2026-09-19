import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { GLOBAL_MAP_MODE_ORDER } from "../src/features/transport-map/contracts/manifest";
import { GlobalIsochroneArchive } from "../src/features/transport-map/isochrones/archive";
import {
  assertGlobalIsochroneIndex, createGlobalIsochroneSettings, GLOBAL_ISOCHRONE_MINUTES,
  globalIsochronePresetMinutes, globalIsochroneScopeKey, globalIsochroneZoneAsset,
} from "../src/features/transport-map/isochrones/contracts";
import { selectGlobalIsochroneScopes } from "../src/features/transport-map/isochrones/selection";
import { normalizeWalkingIsochroneGeometry } from "../src/shared/walkingIsochroneGeometry";
import { walkingArchiveFixture, walkingPolygon, walkingRing } from "./fixtures/walkingIsochrones";

describe("walking radar scope selection", () => {
  it("follows the transports currently selected by the map, including bus families", () => {
    const settings = createGlobalIsochroneSettings();
    expect([...new Set(selectGlobalIsochroneScopes({ preset: "ALL", selectedModes: GLOBAL_MAP_MODE_ORDER }, settings).map((scope) => scope.mode))])
      .toEqual(GLOBAL_MAP_MODE_ORDER);
    expect(selectGlobalIsochroneScopes({ preset: "ALL", selectedModes: GLOBAL_MAP_MODE_ORDER }, settings)).toHaveLength(GLOBAL_MAP_MODE_ORDER.length * 3);
    expect([...new Set(selectGlobalIsochroneScopes({ selectedModes: ["BUS", "NOCTILIEN"] }, settings).map((scope) => scope.mode))])
      .toEqual(["BUS", "NOCTILIEN"]);
    expect(selectGlobalIsochroneScopes({ selectedModes: ["BUS"] }, settings)).toEqual([
      ...globalIsochronePresetMinutes(settings.BUS.preset).map((minutes) => ({ key: "mode:BUS", mode: "BUS", minutes })),
    ]);
  });

  it.each(GLOBAL_MAP_MODE_ORDER)("includes the entire explicit %s preset with its default durations", (mode) => {
    const settings = createGlobalIsochroneSettings();
    expect(selectGlobalIsochroneScopes({ preset: mode, selectedModes: GLOBAL_MAP_MODE_ORDER }, settings)).toEqual([
      ...globalIsochronePresetMinutes(settings[mode].preset).map((minutes) => ({ key: `mode:${mode}`, mode, minutes })),
    ]);
    expect(settings.METRO.preset).toBe("standard");
    expect(settings.RER.preset).toBe("standard");
    expect(settings.TRANSILIEN.preset).toBe("standard");
    expect(settings.BUS.preset).toBe("extended");
    expect(settings.NOCTILIEN.preset).toBe("extended");
  });

  it("gives the selected line priority without deriving stations from directions or connections", () => {
    const settings = createGlobalIsochroneSettings();
    const context = { activeLine: { id: "line:BUS:1", mode: "BUS" as const }, preset: "METRO" as const, selectedModes: ["METRO" as const, "RER" as const] };
    expect(selectGlobalIsochroneScopes(context, settings)).toEqual(
      globalIsochronePresetMinutes(settings.BUS.preset).map((minutes) => ({ key: "line:line:BUS:1", mode: "BUS", minutes })),
    );
    settings.BUS.enabled = false;
    expect(selectGlobalIsochroneScopes(context, settings)).toEqual([]);
  });

  it("keeps each duration and enable flag independent without mutating network filters", () => {
    const settings = createGlobalIsochroneSettings();
    const selectedModes = ["METRO", "RER", "TRAM"] as const;
    settings.METRO.preset = "extended";
    settings.TRAM.enabled = false;
    expect(selectGlobalIsochroneScopes({ selectedModes }, settings)).toEqual([
      ...globalIsochronePresetMinutes("extended").map((minutes) => ({ key: "mode:METRO", mode: "METRO", minutes })),
      ...globalIsochronePresetMinutes("standard").map((minutes) => ({ key: "mode:RER", mode: "RER", minutes })),
    ]);
    expect(selectedModes).toEqual(["METRO", "RER", "TRAM"]);
    expect(createGlobalIsochroneSettings().METRO.preset).toBe("standard");
  });
});

describe("versioned walking radar archive", () => {
  const request = { key: "mode:METRO", mode: "METRO" as const, minutes: 10 as const };
  it("decodes only requested contours, retains holes and reports partial coverage", () => {
    const fixture = walkingArchiveFixture();
    // An unrelated broken contour is not inflated/parsed at startup or for another duration.
    fixture.entries[globalIsochroneZoneAsset("mode:METRO", 30)] = strToU8("broken");
    const archive = new GlobalIsochroneArchive(fixture.bytes(), "test-v1");
    expect(archive.getCacheBytes()).toBe(0);
    const result = archive.select([request]);
    expect(result.surfaces[0]?.geometry).toEqual(walkingPolygon(2.35, 48.85, true));
    expect(result.coverage).toEqual({ total: 2, available: 1, missing: 1, missingScopes: [] });
    expect(archive.select([request]).surfaces[0]?.geometry).toBe(result.surfaces[0]?.geometry);
    expect(() => archive.select([{ ...request, minutes: 30 }])).toThrow("invalid");
  });

  it("deduplicates shared stations across modes without claiming missing coverage", () => {
    const fixture = walkingArchiveFixture([
      { kind: "mode", id: "METRO", mode: "METRO", stationIds: ["s1", "s2"], coveredStationIds: ["s1"] },
      { kind: "mode", id: "RER", mode: "RER", stationIds: ["s1", "s3"], coveredStationIds: ["s1", "s3"] },
      { kind: "mode", id: "BUS", mode: "BUS", stationIds: ["b1"], coveredStationIds: [] },
    ]);
    const archive = new GlobalIsochroneArchive(fixture.bytes());
    expect(archive.select([request, { key: "mode:RER", mode: "RER", minutes: 15 }]).coverage).toEqual({ total: 3, available: 2, missing: 1, missingScopes: [] });
    expect(archive.select([{ key: "mode:BUS", mode: "BUS", minutes: 5 }]).coverage.missing).toBe(1);
    expect(archive.select([{ key: "mode:CABLE", mode: "CABLE", minutes: 10 }]).coverage.missingScopes).toEqual(["mode:CABLE"]);
  });

  it("bounds the geometry cache and re-decodes evicted entries", () => {
    const fixture = walkingArchiveFixture();
    const size = fixture.entries[globalIsochroneZoneAsset("mode:METRO", 10)]!.byteLength * 4;
    const archive = new GlobalIsochroneArchive(fixture.bytes(), "test-v1", size);
    const first = archive.select([request]).surfaces[0]?.geometry;
    archive.select([{ ...request, minutes: 15 }]);
    expect(archive.getCacheBytes()).toBeLessThanOrEqual(size);
    expect(archive.select([request]).surfaces[0]?.geometry).not.toBe(first);
    const tiny = new GlobalIsochroneArchive(fixture.bytes(), "test-v1", 1);
    expect(tiny.select([request]).surfaces).toHaveLength(1);
    expect(tiny.getCacheBytes()).toBe(0);
  });

  it("rejects absent entries, invalid geometry and corrupt/incompatible archives", () => {
    const fixture = walkingArchiveFixture();
    expect(() => new GlobalIsochroneArchive(fixture.bytes(), "different-version")).toThrow("incompatible");
    expect(() => new GlobalIsochroneArchive(strToU8("<html>not a zip</html>"))).toThrow("invalid");
    const descriptor = fixture.index.scopes["mode:METRO"]!.zones[10]!;
    delete fixture.entries[descriptor.asset];
    expect(() => new GlobalIsochroneArchive(fixture.bytes()).select([request])).toThrow("invalid");
    const raw = strToU8(JSON.stringify({ type: "Polygon", coordinates: [[[181, 49], [2, 49], [2, 48], [181, 49]]] }));
    fixture.entries[descriptor.asset] = raw;
    descriptor.bytes = raw.byteLength;
    expect(() => new GlobalIsochroneArchive(fixture.bytes()).select([request])).toThrow("invalid");
    const incompatible = { ...fixture.index, parameters: { ...fixture.index.parameters, locationType: "start" } };
    expect(() => assertGlobalIsochroneIndex(incompatible)).toThrow("incompatible");
    fixture.index.scopes["mode:METRO"]!.coveredStationIds.push("foreign-station");
    expect(() => assertGlobalIsochroneIndex(fixture.index)).toThrow("invalid");
  });

  it("validates closed finite rings and keeps disconnected polygons with holes", () => {
    const geometry = { type: "MultiPolygon", coordinates: [[walkingRing(), walkingRing(2.35, 48.85, 0.0005)], [walkingRing(2.4, 48.9)]] };
    expect(normalizeWalkingIsochroneGeometry(geometry)).toEqual(geometry);
    expect(normalizeWalkingIsochroneGeometry({ type: "Polygon", coordinates: [walkingRing().slice(0, -1)] })).toBeUndefined();
    expect(normalizeWalkingIsochroneGeometry({ type: "MultiPolygon", coordinates: [] })).toBeUndefined();
    expect(GLOBAL_ISOCHRONE_MINUTES).toEqual([5, 10, 15, 20, 25, 30]);
    expect(globalIsochroneScopeKey("line", "line:RER:A")).toBe("line:line:RER:A");
  });

  it("detects ZIP corruption even if the modified coordinates remain valid JSON", () => {
    const fixture = walkingArchiveFixture();
    const bytes = zipSync({ ...fixture.entries, "index.json": strToU8(JSON.stringify(fixture.index)) }, { level: 0 });
    const start = Buffer.from(bytes).indexOf(Buffer.from('{"type":"Polygon"'));
    const coordinate = Buffer.from(bytes).indexOf(Buffer.from("2.348"), start);
    expect(coordinate).toBeGreaterThan(start);
    bytes[coordinate] = "3".charCodeAt(0);
    const archive = new GlobalIsochroneArchive(bytes);
    expect(() => archive.select([{ ...request, minutes: 5 }])).toThrow("invalid");
  });
});
