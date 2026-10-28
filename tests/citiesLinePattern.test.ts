import { describe, expect, it } from "vitest";
import { buildCitiesLinePatternCities, orderLineCityStations } from "../src/features/line-map/citiesLinePattern";
import type { GlobalMapLine, GlobalMapPath, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";

const stations = ["Paris", "Saint-Mard", "Le Plessis", "Nanteuil", "Crépy"].map((city, index) =>
  ({ id: String(index), name: `${city} gare`, city }) as GlobalMapStation);
const line = { id: "ter", stationIds: ["3", "4", "2", "0", "1"] } as GlobalMapLine;
const path = (stationIds: string[]) => ({ lineId: line.id, stationIds }) as GlobalMapPath;

describe("merged line city order", () => {
  it("orders the TER by its provider path instead of catalogue membership", () => {
    const result = orderLineCityStations(line, stations, [path(["0", "1", "2", "3", "4"])]);
    expect(result.ordered).toBe(true);
    expect(result.stations.map((station) => station.city)).toEqual(stations.map((station) => station.city));
    const cities = buildCitiesLinePatternCities(result.stations, [], result.ordered);
    expect(cities[0]?.departureStation).toBe("Paris gare");
    expect(cities.at(-1)?.terminalStation).toBe("Crépy gare");
  });

  it("joins fragmented paths and tolerates the reverse direction", () => {
    const result = orderLineCityStations(line, stations, [path(["0", "1", "2"]), path(["4", "3", "2"]), path(["2", "1", "0"])]);
    expect(result.ordered).toBe(true);
    expect(result.stations.map((station) => station.id)).toEqual(["0", "1", "2", "3", "4"]);
  });

  it.each([
    [["0", "1", "2", "3"], ["2", "4"]], // branch
    [["0", "1", "2", "3", "4", "0"]], // loop
    [["0", "1", "2", "3", "4", "3", "2", "1", "0"]], // out and back
    [["0", "1"], ["2", "3", "4"]], // disconnected
    [["0", "1", "2", "3"]], // incomplete
  ])("keeps every city without inventing endpoints for %j", (...sequences) => {
    const result = orderLineCityStations(line, stations, sequences.map(path));
    expect(result.ordered).toBe(false);
    expect(result.stations).toHaveLength(5);
    expect(buildCitiesLinePatternCities(result.stations, [], result.ordered)
      .some((city) => city.departureStation || city.terminalStation)).toBe(false);
  });
});
