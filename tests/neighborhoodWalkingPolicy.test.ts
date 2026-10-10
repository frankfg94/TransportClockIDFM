import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import route from "../server/api/walking/route.post";
import matrix from "../server/api/walking/matrix.post";
import verdict from "../server/api/neighborhood-verdict.get";
const mocks = vi.hoisted(() => ({ body: vi.fn(), query: vi.fn(), ors: vi.fn(), orsMatrix: vi.fn(), preferred: vi.fn(), preferredMatrix: vi.fn(),
  compiled: vi.fn(), geo: vi.fn(), build: vi.fn() }));
vi.mock("h3", async original => ({ ...await original<typeof import("h3")>(), readBody: mocks.body, getQuery: mocks.query }));
vi.mock("../server/services/walking/openRouteService", () => ({
  routeWalkingWithOpenRouteService: mocks.ors, matrixWalkingWithOpenRouteService: mocks.orsMatrix,
  routeWalkingWithPreferredProvider: mocks.preferred, matrixWalkingWithPreferredProvider: mocks.preferredMatrix, OPEN_ROUTE_SERVICE_MAX_MATRIX_DESTINATIONS: 64,
}));
vi.mock("../server/services/neighborhoodVerdict/dataStore", () => ({ getCompiledNeighborhoodVerdictData: mocks.compiled }));
vi.mock("../server/services/neighborhoodVerdict/geoApi", () => ({ resolveAdministrativeLocation: mocks.geo }));
vi.mock("../server/services/neighborhoodVerdict/score", () => ({ buildNeighborhoodVerdict: mocks.build }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.preferred.mockRejectedValue(new Error("PRIM forbidden")); mocks.preferredMatrix.mockRejectedValue(new Error("PRIM forbidden"));
  mocks.ors.mockResolvedValue({ provider: "openrouteservice", durationSeconds: 600, distanceMeters: 800 });
  mocks.orsMatrix.mockResolvedValue([]);
  mocks.compiled.mockResolvedValue({ iris: { neighborhoods: [{ communeCode: "92020", communeName: "Châtillon", departmentCode: "92",
    geometry: { type: "Polygon", coordinates: [[[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]]] } }] } });
  mocks.build.mockResolvedValue({ categories: [] });
});
describe("verdict ORS-only policy", () => {
  it("selects ORS for both HTTP walking adapters", async () => {
    mocks.body.mockResolvedValue({ origin: { lon: 2.3, lat: 48.8 }, destination: { lon: 2.4, lat: 48.9 }, destinations: [{ id: "x", lon: 2.4, lat: 48.9 }], routingPolicy: "ors-only" });
    await route({} as H3Event); await matrix({} as H3Event);
    expect(mocks.ors).toHaveBeenCalledTimes(1); expect(mocks.orsMatrix).toHaveBeenCalledTimes(1);
    expect(mocks.preferred).not.toHaveBeenCalled(); expect(mocks.preferredMatrix).not.toHaveBeenCalled();
  });
  it("retains the preferred policy for other pages", async () => {
    mocks.preferred.mockResolvedValue({});
    mocks.body.mockResolvedValue({ origin: { lon: 2.3, lat: 48.8 }, destination: { lon: 2.4, lat: 48.9 } });
    await route({} as H3Event); expect(mocks.preferred).toHaveBeenCalledTimes(1); expect(mocks.ors).not.toHaveBeenCalled();
  });
  it("loads documentary data independently of walking and resolves the commune from IRIS", async () => {
    mocks.query.mockReturnValue({ lon: 2.3, lat: 48.8, includeWalking: "0", routingPolicy: "ors-only" });
    await verdict({} as H3Event);
    expect(mocks.build.mock.calls[0]?.[2]).toEqual({ commune: { code: "92020", name: "Châtillon" }, departmentCode: "92" });
    expect(mocks.build.mock.calls[0]?.[3]).toBeUndefined(); expect(mocks.geo).not.toHaveBeenCalled(); expect(mocks.preferred).not.toHaveBeenCalled();
  });
  it("uses ORS for indirect GPE and green-space walking", async () => {
    mocks.query.mockReturnValue({ lon: 2.3, lat: 48.8, routingPolicy: "ors-only" });
    await verdict({} as H3Event);
    const router = mocks.build.mock.calls[0]![3];
    await router([2.3, 48.8], [2.4, 48.9]); expect(mocks.orsMatrix).toHaveBeenCalled(); expect(mocks.preferred).not.toHaveBeenCalled();
  });
  it("uses Geo API only outside reliable IRIS coverage and exposes documentary failure", async () => {
    mocks.query.mockReturnValue({ lon: 4, lat: 49, includeWalking: "0" }); mocks.geo.mockResolvedValue({});
    await verdict({} as H3Event); expect(mocks.geo).toHaveBeenCalledTimes(1);
    mocks.compiled.mockRejectedValue(new Error("dataset unavailable"));
    await expect(verdict({} as H3Event)).rejects.toMatchObject({ statusCode: 503 });
  });
});
