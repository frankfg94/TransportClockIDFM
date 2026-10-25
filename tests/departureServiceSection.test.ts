import { describe, expect, it } from "vitest";
import { inferSkippedStopSection } from "../src/features/service-pattern/serviceClassification";
import type { LineRouteSequence, LineRouteStop } from "../src/types/transit";

function stop(id: string, x: number, y: number): LineRouteStop {
  return { id, label: id, projectedX: x, projectedY: y, station: { id, label: id, monitoringRef: id } };
}
function line(stops: LineRouteStop[]): LineRouteSequence[] {
  return [{ id: "generic", label: "", stops }];
}
const positions = [-10, -8, -6, -4, 0, 4, 6, 8, 10];

describe("geographic context for skipped stations", () => {
  it.each([
    ["north", false, [5, 6]], ["south", false, [1, 2]],
    ["east", true, [5, 6]], ["west", true, [1, 2]],
  ] as const)("identifies the %s section without a line or mission rule", (section, horizontal, indices) => {
    const stops = positions.map((value, index) => stop(String(index), horizontal ? value : 0, horizontal ? 0 : value));
    expect(inferSkippedStopSection(indices.map((index) => stops[index]), line(stops))).toBe(section);
    expect(inferSkippedStopSection(indices.map((index) => stops[index]), line([...stops].reverse()))).toBe(section);
  });

  it("keeps the generic label when stops are skipped on opposite ends", () => {
    const stops = positions.map((value, index) => stop(String(index), 0, value));
    expect(inferSkippedStopSection([stops[1], stops[7]], line(stops))).toBeUndefined();
  });
  it("does not assign a cardinal section to skips close to the line center", () => {
    const stops = [stop("a", 0, -10), stop("b", 0, 0.5), stop("c", 0, 10)];
    expect(inferSkippedStopSection([stops[1]], line(stops))).toBeUndefined();
  });
  it("does not turn small lateral bends of an east-west line into north/south sections", () => {
    const stops = [stop("a", -10, 0), stop("b", 6, 0.05), stop("c", 10, -0.05)];
    expect(inferSkippedStopSection([stops[1]], line(stops))).toBe("east");
  });
  it("leaves an ambiguous diagonal section unspecified", () => {
    const stops = [stop("a", -10, -10), stop("b", 6, 6), stop("c", 10, 10)];
    expect(inferSkippedStopSection([stops[1]], line(stops))).toBeUndefined();
  });
  it("does not move the geographic midpoint when one section has more stations or duplicated segments", () => {
    const stops = positions.map((value, index) => stop(String(index), 0, value));
    const dense = Array.from({ length: 20 }, (_, index) => stop(`dense:${index}`, 0, -9 - index / 100));
    const topology = [...line([...stops, ...dense]), ...line(stops), ...line(stops)];
    expect(inferSkippedStopSection([stops[5]], topology)).toBe("north");
  });
  it("also uses geographic coordinates when projected coordinates are unavailable", () => {
    const stops = positions.map((value, index): LineRouteStop => ({
      id: String(index), label: String(index), lon: 2, lat: 48 + value / 100,
      station: { id: String(index), label: String(index), monitoringRef: "" },
    }));
    expect(inferSkippedStopSection([stops[5], stops[6]], line(stops))).toBe("north");
  });
  it("requires coordinates for the skipped stops and the complete line reference", () => {
    const stops = [stop("a", 0, -10), stop("b", 0, 6), stop("c", 0, 10)];
    stops[0].projectedY = undefined;
    expect(inferSkippedStopSection([stops[1]], line(stops))).toBeUndefined();
  });
  it("does not assign a section when no stop is skipped or the line has no extent", () => {
    const stops = [stop("a", 0, 0), stop("b", 0, 0), stop("c", 0, 0)];
    expect(inferSkippedStopSection([], line(stops))).toBeUndefined();
    expect(inferSkippedStopSection([stops[1]], line(stops))).toBeUndefined();
  });
});
