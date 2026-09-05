import { describe, expect, it } from "vitest";
import {
  measureLineStationAngles,
  resolveDebugLine,
} from "../src/features/transport-map/debug/stationAngles";

const stations = new Map([
  ["station:a", { id: "station:a", name: "A" }],
  ["station:b", { id: "station:b", name: "B" }],
  ["station:c", { id: "station:c", name: "C" }],
]);

const line = {
  id: "line:IDFM:C01374",
  code: "C01374",
  label: "4",
  stationIds: ["station:a", "station:b", "station:c"],
};

describe("global-map station angle diagnostics", () => {
  it("flags a long acute V at a station while retaining endpoints", () => {
    const rows = measureLineStationAngles(line as never, [{
      id: "path:4",
      lineId: line.id,
      vertices: [
        { stationId: "station:a", x: 0, y: 0 },
        { stationId: "station:b", x: 0.000004, y: 0.000004 },
        { stationId: "station:c", x: 0.000001, y: 0.000001 },
      ],
    }] as never, stations as never);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ stationId: "station:a", inconsistent: false });
    expect(rows[0]).not.toHaveProperty("angleDegrees");
    expect(rows[1]).toMatchObject({ stationId: "station:b", inconsistent: true });
    expect(rows[1]?.angleDegrees).toBeLessThan(35);
    expect(rows[2]).toMatchObject({ stationId: "station:c", inconsistent: false });
    expect(rows[2]).not.toHaveProperty("angleDegrees");
  });

  it("flags a visible 68 degree station spike", () => {
    const rows = measureLineStationAngles(line as never, [{
      id: "path:4",
      lineId: line.id,
      vertices: [
        { stationId: "station:a", x: 0, y: 0 },
        { stationId: "station:b", x: 0.000001311, y: 0.000000723 },
        { stationId: "station:c", x: -0.000000231, y: 0.000001997 },
      ],
    }] as never, stations as never);

    expect(rows[1]).toMatchObject({ stationId: "station:b", inconsistent: true });
    expect(rows[1]?.angleDegrees).toBeLessThan(90);
  });

  it("resolves a debugLine value by line number, code, or full id", () => {
    const lines = [line, { ...line, id: "line:IDFM:C01384", code: "C01384", label: "14" }];
    expect(resolveDebugLine(lines as never, "4")?.id).toBe(line.id);
    expect(resolveDebugLine(lines as never, "C01374")?.id).toBe(line.id);
    expect(resolveDebugLine(lines as never, "line:IDFM:C01374")?.id).toBe(line.id);
    expect(resolveDebugLine(lines as never, "unknown")).toBeUndefined();
  });
});
