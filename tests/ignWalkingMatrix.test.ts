import { describe, expect, it, vi } from "vitest";
import { createIgnWalkingMatrix } from "../server/services/walking/ignWalkingMatrix";
const origin = { lon: 2.35, lat: 48.85 };
const destination = { id: "one", lon: 2.351, lat: 48.851 };
const toArray = (p: { lon: number; lat: number }) => [p.lon, p.lat];
function ignResponse(url: unknown) {
  const query = new URL(String(url)).searchParams;
  const parse = (p: string) => p.split(",").map(Number);
  const points = [parse(query.get("start")!), ...query.get("intermediates")!.split("|").map(parse), parse(query.get("end")!)];
  return Response.json({ resource: "bdtopo-osrm", resourceVersion: "fixture", distanceUnit: "meter", timeUnit: "second",
    portions: points.slice(1).map((to, i) => ({ start: points[i]!.join(","), end: to.join(","), distance: 100,
      duration: i % 2 ? 180 : 120, steps: [{ geometry: { type: "LineString", coordinates: [points[i], to] } }] })) });
}
describe("common IGN GTFS pedestrian matrix", () => {
  it("batches every eight independent destinations, retains ids and uses outward portions", async () => {
    const fetcher = vi.fn(async url => ignResponse(url));
    const matrix = createIgnWalkingMatrix(fetcher as typeof fetch);
    const destinations = Array.from({ length: 9 }, (_, i) => ({ ...destination, id: String(i), lon: destination.lon + i / 10000 }));
    const routes = await matrix(origin, destinations);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(routes.map(route => route.id)).toEqual(destinations.map(p => p.id));
    expect(routes.every(route => route.provider === "ign-bdtopo" && route.durationSeconds === 120 && route.datasetVersion === "fixture" && !route.fallback)).toBe(true);
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get("intermediates")!.split("|")).toHaveLength(15);
    expect(routes[0]!.coordinates[0]).toEqual(origin);
    expect(routes[0]!.coordinates.at(-1)).toEqual({ lon: destination.lon, lat: destination.lat });
  });
  it("deduplicates coordinates and pending subscribers, caches both directed routes independently", async () => {
    const fetcher = vi.fn(async url => ignResponse(url));
    const matrix = createIgnWalkingMatrix(fetcher as typeof fetch);
    const [one, two] = await Promise.all([matrix(origin, [destination, { ...destination, id: "two" }]), matrix(origin, [{ ...destination, id: "subscriber" }])]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(one.map(route => route.id)).toEqual(["one", "two"]); expect(two[0]!.id).toBe("subscriber");
    const reverse = await matrix(origin, [{ ...destination, id: "egress" }], { reverse: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reverse[0]).toMatchObject({ provider: "ign-bdtopo", durationSeconds: 180, id: "egress" });
    expect(reverse[0]!.coordinates[0]).toEqual({ lon: destination.lon, lat: destination.lat });
    expect(reverse[0]!.coordinates.at(-1)).toEqual(origin);
  });
  it("keeps fallback reasons explicit and observes an upstream cooldown", async () => {
    const fetcher = vi.fn(async () => Response.json({}, { status: 429, headers: { "retry-after": "60" } }));
    const matrix = createIgnWalkingMatrix(fetcher as typeof fetch);
    expect((await matrix(origin, [destination]))[0]).toMatchObject({ fallback: true, unavailabilityReason: "quota-exceeded" });
    expect((await matrix(origin, [{ ...destination, lon: 2.352 }]))[0]).toMatchObject({ fallback: true, unavailabilityReason: "quota-exceeded" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed units, missing portions and far-away snap points", async () => {
    const fetcher = vi.fn(async () => Response.json({ resource: "bdtopo-osrm", distanceUnit: "kilometer", timeUnit: "second", portions: [] }));
    const matrix = createIgnWalkingMatrix(fetcher as typeof fetch);
    expect((await matrix(origin, [destination]))[0]!.fallback).toBe(true);
    const far = { lon: 3, lat: 49 };
    const malformed = createIgnWalkingMatrix(vi.fn(async () => Response.json({ resource: "bdtopo-osrm", distanceUnit: "meter", timeUnit: "second",
      portions: [0, 1].map(() => ({ distance: 100, duration: 120, steps: [{ geometry: { type: "LineString", coordinates: [toArray(far), toArray(far)] } }] })) })) as typeof fetch);
    expect((await malformed(origin, [destination]))[0]).toMatchObject({ fallback: true, unavailabilityReason: "unreachable" });
  });
  it("includes short off-network connectors in the time and distance", async () => {
    const offset = { lon: origin.lon + .00001, lat: origin.lat };
    const fetcher = vi.fn(async () => Response.json({ resource: "bdtopo-osrm", distanceUnit: "meter", timeUnit: "second",
      portions: [{ distance: 100, duration: 120, steps: [{ geometry: { type: "LineString", coordinates: [toArray(offset), toArray(destination)] } }] },
        { distance: 100, duration: 180, steps: [{ geometry: { type: "LineString", coordinates: [toArray(destination), toArray(offset)] } }] }] }));
    const route = (await createIgnWalkingMatrix(fetcher as typeof fetch)(origin, [destination]))[0]!;
    expect(route.durationSeconds).toBeGreaterThan(120); expect(route.distanceMeters).toBeGreaterThan(100);
    expect(route.coordinates[0]).toEqual(origin); expect(route.coordinates.at(-1)).toEqual({ lon: destination.lon, lat: destination.lat });
  });
  it("does not request a route when the endpoints are identical", async () => {
    const fetcher = vi.fn(); const matrix = createIgnWalkingMatrix(fetcher as typeof fetch);
    expect((await matrix(origin, [{ ...origin, id: "same" }]))[0]).toMatchObject({ durationSeconds: 0, fallback: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
