import { promises as fs } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GtfsLineArtifact, GtfsManifest } from "../server/services/gtfs/types";
import {
  createSegmentsFromTraces,
  projectStopsMonotonically,
} from "../server/services/lineGeometry/traceProjection";
import {
  createUndirectedEdgeKey,
  type LineGeometryCoordinate,
} from "../src/features/line-map/lineGeometry";

const LAGNY_THORIGNY_STOP_ID = "IDFM:68494";
const stopCoordinates: Record<string, LineGeometryCoordinate> = {
  "IDFM:424727": { lon: 2.679061322007202, lat: 48.86967036278925 },
  "IDFM:462671": { lon: 2.727226729875133, lat: 48.87444826134756 },
  "IDFM:462719": { lon: 2.732513648183015, lat: 48.88961798368009 },
  "IDFM:478346": { lon: 2.7018089875660896, lat: 48.88241129046725 },
  "IDFM:485843": { lon: 2.6902869544523975, lat: 48.87321625934085 },
  "IDFM:491425": { lon: 2.68054600940581, lat: 48.868761525779824 },
  "IDFM:492871": { lon: 2.698633512682753, lat: 48.88566151656253 },
  "IDFM:68312": { lon: 2.709488245184355, lat: 48.86487826954372 },
  "IDFM:68316": { lon: 2.7163626998437387, lat: 48.86532643215609 },
  "IDFM:68330": { lon: 2.706197810061676, lat: 48.86703310085021 },
  "IDFM:68331": { lon: 2.719623600644716, lat: 48.86729463037447 },
  "IDFM:68336": { lon: 2.6771569836630875, lat: 48.86789358313076 },
  "IDFM:68344": { lon: 2.706178592455606, lat: 48.869231885621325 },
  "IDFM:68346": { lon: 2.6883706561419176, lat: 48.86879564331526 },
  "IDFM:68361": { lon: 2.702699337091453, lat: 48.86976288438698 },
  "IDFM:68371": { lon: 2.6830168959979277, lat: 48.87043183248182 },
  "IDFM:68376": { lon: 2.6904031271992355, lat: 48.87087384357793 },
  "IDFM:68377": { lon: 2.7003815151288952, lat: 48.87100265784675 },
  "IDFM:68378": { lon: 2.7186173238526563, lat: 48.86936069823397 },
  "IDFM:68380": { lon: 2.68165261658676, lat: 48.871714234348396 },
  "IDFM:68388": { lon: 2.6964470686498485, lat: 48.87241366298544 },
  "IDFM:68395": { lon: 2.700288724362741, lat: 48.872913470625626 },
  "IDFM:68400": { lon: 2.685714604709751, lat: 48.87407667660671 },
  "IDFM:68402": { lon: 2.7204230543904346, lat: 48.87327245147468 },
  "IDFM:68405": { lon: 2.6938693393424633, lat: 48.87491618385561 },
  "IDFM:68414": { lon: 2.6854321349876047, lat: 48.875699194944964 },
  "IDFM:68429": { lon: 2.686315504471664, lat: 48.877302288008856 },
  "IDFM:68430": { lon: 2.7201575102994062, lat: 48.87702195985535 },
  "IDFM:68433": { lon: 2.726726464597001, lat: 48.8775497416668 },
  "IDFM:68443": { lon: 2.6905366724205755, lat: 48.87822607452729 },
  "IDFM:68447": { lon: 2.6948646231668705, lat: 48.87840355630443 },
  "IDFM:68456": { lon: 2.707147228588909, lat: 48.878798452568375 },
  "IDFM:68457": { lon: 2.7220085107673078, lat: 48.87891032503394 },
  "IDFM:68458": { lon: 2.701550007673946, lat: 48.87882509870812 },
  "IDFM:68473": { lon: 2.7163511145291657, lat: 48.879971727775505 },
  "IDFM:68475": { lon: 2.6793645418148264, lat: 48.880206631183086 },
  "IDFM:68477": { lon: 2.7223325380231924, lat: 48.88079062979517 },
  "IDFM:68478": { lon: 2.6909799393537717, lat: 48.88164908956479 },
  "IDFM:68479": { lon: 2.6612685975505728, lat: 48.881577707940515 },
  "IDFM:68493": { lon: 2.715264034956044, lat: 48.88303128587364 },
  "IDFM:68494": { lon: 2.707526318411471, lat: 48.88291820691642 },
  "IDFM:68499": { lon: 2.720654271288964, lat: 48.883543097755904 },
  "IDFM:68500": { lon: 2.660762262901969, lat: 48.883950447205784 },
  "IDFM:68501": { lon: 2.727687558347591, lat: 48.88409438684435 },
  "IDFM:68509": { lon: 2.7133340527032543, lat: 48.884362148035905 },
  "IDFM:68511": { lon: 2.690905916299151, lat: 48.88493136565299 },
  "IDFM:68512": { lon: 2.706000653090066, lat: 48.88505931231434 },
  "IDFM:68513": { lon: 2.730778181344736, lat: 48.885018665658784 },
  "IDFM:68516": { lon: 2.7337769070363698, lat: 48.88526818257754 },
  "IDFM:68517": { lon: 2.7360133025991775, lat: 48.88526414122897 },
  "IDFM:68521": { lon: 2.740716118362455, lat: 48.88561615247342 },
  "IDFM:68523": { lon: 2.743565988039253, lat: 48.885649269013015 },
  "IDFM:68528": { lon: 2.7172178369421154, lat: 48.88608455672516 },
  "IDFM:68531": { lon: 2.6879783479880746, lat: 48.88649755459846 },
  "IDFM:68533": { lon: 2.71973753733845, lat: 48.88665704154198 },
  "IDFM:68534": { lon: 2.7226685520013922, lat: 48.88682574052925 },
  "IDFM:68535": { lon: 2.7030654313186266, lat: 48.8868506757206 },
  "IDFM:68537": { lon: 2.7441719379886305, lat: 48.8872153495622 },
  "IDFM:68542": { lon: 2.7278743578788283, lat: 48.88748967840901 },
  "IDFM:68543": { lon: 2.6897687319277, lat: 48.888120951908704 },
  "IDFM:68544": { lon: 2.721271112311526, lat: 48.888036552548584 },
  "IDFM:68545": { lon: 2.7330804808782942, lat: 48.88811741794916 },
  "IDFM:68547": { lon: 2.7241198155910027, lat: 48.88831294004914 },
  "IDFM:68548": { lon: 2.7107414077208887, lat: 48.888362306078406 },
  "IDFM:68550": { lon: 2.704528216357762, lat: 48.888612429446795 },
  "IDFM:68551": { lon: 2.6589021271123836, lat: 48.888972277165955 },
  "IDFM:68560": { lon: 2.7137627584414954, lat: 48.889475706274546 },
  "IDFM:68561": { lon: 2.7433563751548284, lat: 48.88944386781135 },
  "IDFM:68562": { lon: 2.7203083109848594, lat: 48.8895631180189 },
  "IDFM:68563": { lon: 2.7374511651866174, lat: 48.889476030607575 },
  "IDFM:68567": { lon: 2.7219689041894917, lat: 48.89016052284162 },
  "IDFM:68568": { lon: 2.727001115306465, lat: 48.89018109420075 },
  "IDFM:68570": { lon: 2.717794692667117, lat: 48.89035759695586 },
  "IDFM:68571": { lon: 2.710428789519405, lat: 48.890627786861934 },
  "IDFM:68575": { lon: 2.725552073667911, lat: 48.89083426991082 },
  "IDFM:68576": { lon: 2.706133229342252, lat: 48.890563364261055 },
  "IDFM:68591": { lon: 2.7086252205000063, lat: 48.89366753578379 },
  "IDFM:68606": { lon: 2.7116265410113605, lat: 48.89721352747717 },
  "IDFM:68618": { lon: 2.7126769188500286, lat: 48.898425601461526 },
  "IDFM:68622": { lon: 2.706207459502438, lat: 48.89916081548718 },
  "IDFM:68640": { lon: 2.70650617060052, lat: 48.90182345008878 },
  "IDFM:73748": { lon: 2.6728577115823233, lat: 48.879577497195264 },
};

const cases = [
  { label: "Soir", lineId: "IDFM:C02688", expectedStops: 49 },
  { label: "2250", lineId: "IDFM:C00622", expectedStops: 21 },
  { label: "2253", lineId: "IDFM:C00633", expectedStops: 36 },
] as const;
const marneBridgeCases = [
  { label: "2226", lineId: "IDFM:C00629", expectedStops: 23 },
  { label: "2229", lineId: "IDFM:C00630", expectedStops: 25 },
] as const;

describe("Lagny - Thorigny GTFS bus geometry", () => {
  it.each(cases)(
    "projects every real $label stop monotonically on the installed GTFS shape",
    async ({ lineId, expectedStops }) => {
      const artifact = await loadInstalledArtifact(lineId);
      const pattern = artifact.patterns[0];
      const shape = artifact.shapes[pattern.shapeId];
      const stops = pattern.stopIds.map((stopId) => {
        const coordinate = stopCoordinates[stopId];
        expect(coordinate, `missing fixture coordinate for ${stopId}`).toBeDefined();
        return coordinate;
      });

      const projected = projectStopsMonotonically(stops, [shape]);

      expect(pattern.stopIds[0]).toBe(LAGNY_THORIGNY_STOP_ID);
      expect(pattern.stopIds).toHaveLength(expectedStops);
      expect(projected?.projections).toHaveLength(expectedStops);
      expect(
        projected?.projections.every(
          (projection, index, projections) =>
            index === 0 || projection.along >= projections[index - 1].along,
        ),
      ).toBe(true);
      expect(projected?.errorMeters).toBeLessThanOrEqual(300);
    },
  );

  it.each(cases)(
    "loads every unique $label edge from its GTFS shape instead of endpoint chords",
    async ({ lineId }) => {
      const artifact = await loadInstalledArtifact(lineId);
      const pattern = artifact.patterns[0];
      const stops = pattern.stopIds.map((id) => ({ id, ...stopCoordinates[id] }));
      const segments = createSegmentsFromTraces(
        {
          lineId,
          stops,
          branches: [{ id: pattern.id, stopIds: pattern.stopIds }],
        },
        [artifact.shapes[pattern.shapeId]],
      );
      const expectedEdges = new Set(
        pattern.stopIds
          .slice(1)
          .map((stopId, index) => createUndirectedEdgeKey(pattern.stopIds[index], stopId)),
      );

      expect(segments).toHaveLength(expectedEdges.size);
      expect(segments?.every(({ coordinates }) => coordinates.length >= 2)).toBe(true);
    },
  );

  it("keeps the 2253 Lagny - Thorigny to Verdun segment on the bridge detour", async () => {
    const artifact = await loadInstalledArtifact("IDFM:C00633");
    const pattern = artifact.patterns[0];
    const segments = createSegmentsFromTraces(
      {
        lineId: artifact.lineId,
        stops: pattern.stopIds.map((id) => ({ id, ...stopCoordinates[id] })),
        branches: [{ id: pattern.id, stopIds: pattern.stopIds }],
      },
      [artifact.shapes[pattern.shapeId]],
    );
    const firstEdge = segments?.find(
      ({ fromStopId, toStopId }) =>
        fromStopId === LAGNY_THORIGNY_STOP_ID && toStopId === "IDFM:68458",
    );
    const directDistance = distanceMeters(
      firstEdge!.coordinates[0],
      firstEdge!.coordinates.at(-1)!,
    );

    expect(firstEdge?.coordinates.length).toBeGreaterThan(10);
    expect(polylineLengthMeters(firstEdge!.coordinates) / directDistance).toBeGreaterThan(1.25);
  });

  it.each(marneBridgeCases)(
    "keeps the real $label departure from Lagny - Thorigny on the Marne bridge",
    async ({ lineId, expectedStops }) => {
      const artifact = await loadInstalledArtifact(lineId);
      const pattern = artifact.patterns.find(
        ({ stopIds }) => stopIds[0] === LAGNY_THORIGNY_STOP_ID,
      );

      expect(pattern?.stopIds).toHaveLength(expectedStops);
      if (!pattern) throw new Error(`Missing Lagny departure pattern for ${lineId}`);
      const shape =
        pattern.shapeDirection === "reverse"
          ? [...artifact.shapes[pattern.shapeId]].reverse()
          : artifact.shapes[pattern.shapeId];
      const from = pattern.projections[0];
      const to = pattern.projections[1];
      const coordinates = [
        from.coordinate,
        ...shape.slice(from.shapePointIndex + 1, to.shapePointIndex + 1),
        to.coordinate,
      ];
      const directDistance = distanceMeters(
        coordinates[0],
        coordinates.at(-1)!,
      );

      expect(coordinates.length).toBeGreaterThan(10);
      expect(polylineLengthMeters(coordinates) / directDistance).toBeGreaterThan(1.2);
    },
  );
});

async function loadInstalledArtifact(lineId: string): Promise<GtfsLineArtifact> {
  const root = join(process.cwd(), ".data", "gtfs");
  const manifest = JSON.parse(
    await fs.readFile(join(root, "current.json"), "utf8"),
  ) as GtfsManifest;
  return JSON.parse(
    await fs.readFile(
      join(root, "versions", manifest.sha256, "lines", `${encodeURIComponent(lineId)}.json`),
      "utf8",
    ),
  ) as GtfsLineArtifact;
}

function polylineLengthMeters(coordinates: LineGeometryCoordinate[]): number {
  return coordinates
    .slice(1)
    .reduce(
      (total, coordinate, index) => total + distanceMeters(coordinates[index], coordinate),
      0,
    );
}

function distanceMeters(left: LineGeometryCoordinate, right: LineGeometryCoordinate): number {
  const latitudeRadians = (((left.lat + right.lat) / 2) * Math.PI) / 180;
  return (
    Math.hypot((right.lon - left.lon) * Math.cos(latitudeRadians), right.lat - left.lat) * 111_320
  );
}
