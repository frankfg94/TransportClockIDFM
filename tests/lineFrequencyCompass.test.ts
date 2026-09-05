import { describe, expect, it } from "vitest";
import { inferLineFrequencyCompassDirection } from "../src/features/line-map/lineFrequencyCompass";

describe("line frequency compass direction", () => {
  it("infers south-to-north and west-to-east orientations from station coordinates", () => {
    expect(
      inferLineFrequencyCompassDirection(
        { id: "south", name: "South" },
        { id: "north", name: "North" },
        [
          { id: "south", name: "South", lat: 48.7, lon: 2.3 },
          { id: "north", name: "North", lat: 48.9, lon: 2.3 },
        ],
      ),
    ).toEqual({ from: "south", to: "north" });

    expect(
      inferLineFrequencyCompassDirection(
        { id: "west", name: "West" },
        { id: "east", name: "East" },
        [
          { id: "west", name: "West", lat: 48.85, lon: 2.2 },
          { id: "east", name: "East", lat: 48.85, lon: 2.5 },
        ],
      ),
    ).toEqual({ from: "west", to: "east" });
  });

  it("matches endpoints by their monomodal stop identifier when prefixes differ", () => {
    expect(
      inferLineFrequencyCompassDirection(
        { id: "FR::monomodalStopPlace:100:FR1", name: "From" },
        { id: "FR::monomodalStopPlace:200:FR1", name: "To" },
        [
          { id: "IDFM:monomodalStopPlace:100", name: "From", lat: 48.7, lon: 2.3 },
          { id: "IDFM:monomodalStopPlace:200", name: "To", lat: 48.7, lon: 2.5 },
        ],
      ),
    ).toEqual({ from: "west", to: "east" });
  });

  it("uses diagonal orientations when latitude and longitude both contribute materially", () => {
    expect(
      inferLineFrequencyCompassDirection(
        { id: "south-west", name: "South-West" },
        { id: "north-east", name: "North-East" },
        [
          { id: "south-west", name: "South-West", lat: 48.7, lon: 2.2 },
          { id: "north-east", name: "North-East", lat: 48.9, lon: 2.5 },
        ],
      ),
    ).toEqual({ from: "south-west", to: "north-east" });

    expect(
      inferLineFrequencyCompassDirection(
        { id: "north-west", name: "North-West" },
        { id: "south-east", name: "South-East" },
        [
          { id: "north-west", name: "North-West", lat: 48.9, lon: 2.2 },
          { id: "south-east", name: "South-East", lat: 48.7, lon: 2.5 },
        ],
      ),
    ).toEqual({ from: "north-west", to: "south-east" });
  });

  it("does not invent a direction when endpoint coordinates are unavailable", () => {
    expect(
      inferLineFrequencyCompassDirection(
        { id: "from", name: "From" },
        { id: "to", name: "To" },
        [],
      ),
    ).toBeUndefined();
  });
});
