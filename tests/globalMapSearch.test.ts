import { describe, expect, it } from "vitest";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import {
  createGlobalMapSearchIndex,
  groupGlobalMapStations,
  normalizeGlobalMapSearchText,
  searchGlobalMapIndex,
  searchGlobalMapNetwork,
} from "../src/features/transport-map/search/globalMapSearch";

const station = {
  id: "station:chatelet",
  index: 0,
  name: "Châtelet–Les Halles",
  normalizedName: "chatelet les halles",
  city: "Paris 1er",
  aliases: ["Châtelet", "Chatelet Les Halles"],
  rawRefs: ["station:chatelet"],
  lineIds: ["line:metro:14", "line:rer:a"],
  ownerChunkId: "chunk:0",
  isHub: true,
  sourceCrs: "EPSG:2154",
  sourceX: 652469,
  sourceY: 6861275,
  lon: 2.347,
  lat: 48.858,
  worldX: 0.5,
  worldY: 0.35,
  coordinateSource: "netex",
  transformVersion: "lambert93-ntf-v1",
} satisfies GlobalMapStation;

const otherStation = {
  ...station,
  id: "station:gare-du-nord",
  index: 1,
  name: "Gare du Nord",
  normalizedName: "gare du nord",
  aliases: ["Gare du Nord"],
  lineIds: ["line:rer:a"],
  isHub: false,
} satisfies GlobalMapStation;

const metro14 = {
  id: "line:metro:14",
  index: 0,
  code: "14",
  label: "14",
  mode: "METRO",
  color: "#be418d",
  textColor: "#ffffff",
  aliases: ["Métro 14", "metro 14"],
  stationIds: [station.id],
  geometryIds: ["path:14"],
} satisfies GlobalMapLine;

const rerA = {
  id: "line:rer:a",
  index: 1,
  code: "A",
  label: "A",
  mode: "RER",
  color: "#e2231a",
  textColor: "#ffffff",
  aliases: ["RER A"],
  stationIds: [station.id, otherStation.id],
  geometryIds: ["path:rer-a"],
} satisfies GlobalMapLine;

describe("global map offline search", () => {
  it("normalizes accents and punctuation for station searches", () => {
    expect(normalizeGlobalMapSearchText("Châtelet–Les Halles")).toBe("chatelet les halles");

    const result = searchGlobalMapNetwork(
      [station, otherStation],
      [metro14, rerA],
      "chatelet",
    );

    expect(result.stations.map((item) => item.id)).toEqual([station.id]);
  });

  it("keeps the grouped catalogue and normalized fields in one reusable index", () => {
    const index = createGlobalMapSearchIndex([station, otherStation], [metro14, rerA]);
    const stationResult = searchGlobalMapIndex(index, "chatelet");
    const lineResult = searchGlobalMapIndex(index, "ligne 14");

    expect(index.groupsByMemberId.get(station.id)?.id).toBe(station.id);
    expect(stationResult.stations.map((item) => item.id)).toEqual([station.id]);
    expect(lineResult.lines.map((item) => item.id)).toEqual([metro14.id]);
    expect(searchGlobalMapIndex(index, "CHÂTELET")).toBe(stationResult);
  });

  it("matches a complete line by code, label, or the ligne prefix", () => {
    const result = searchGlobalMapNetwork(
      [station, otherStation],
      [metro14, rerA],
      "ligne 14",
    );

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ id: metro14.id, code: "14" });
  });

  it("matches a line when the mode precedes its code", () => {
    const result = searchGlobalMapNetwork(
      [station, otherStation],
      [metro14, rerA],
      "metro 14",
    );

    expect(result.lines.map((line) => line.id)).toEqual([metro14.id]);
  });

  it("keeps station and line result families separate", () => {
    const result = searchGlobalMapNetwork(
      [station, otherStation],
      [metro14, rerA],
      "gare",
    );

    expect(result.stations.map((item) => item.name)).toEqual(["Gare du Nord"]);
    expect(result.lines).toEqual([]);
  });

  it("groups close physical records when normalized name and city match", () => {
    const gareOne = {
      ...station,
      id: "station:gare-lyon-1",
      name: "Gare de Lyon",
      normalizedName: "gare de lyon",
      city: "Paris 12e",
      lineIds: ["line:rer:a", "line:metro:14", "line:bus:20"],
      isHub: true,
    } satisfies GlobalMapStation;
    const gareTwo = {
      ...gareOne,
      id: "station:gare-lyon-2",
      lineIds: ["line:train:j", "line:tram:t3", "line:bus:29"],
      isHub: false,
    } satisfies GlobalMapStation;
    const gareOtherCity = {
      ...gareOne,
      id: "station:gare-lyon-other-city",
      city: "Lyon",
      lineIds: ["line:metro:14"],
      isHub: false,
    } satisfies GlobalMapStation;
    const trainJ = { ...rerA, id: "line:train:j", code: "J", mode: "TRAIN", aliases: ["Train J"] } satisfies GlobalMapLine;
    const tramT3 = { ...metro14, id: "line:tram:t3", code: "T3", mode: "TRAM", aliases: ["Tram T3"] } satisfies GlobalMapLine;
    const bus20 = { ...metro14, id: "line:bus:20", code: "20", mode: "BUS", aliases: ["Bus 20"] } satisfies GlobalMapLine;
    const bus29 = { ...metro14, id: "line:bus:29", code: "29", mode: "BUS", aliases: ["Bus 29"] } satisfies GlobalMapLine;

    const result = searchGlobalMapNetwork(
      [gareOne, gareTwo, gareOtherCity],
      [metro14, rerA, trainJ, tramT3, bus20, bus29],
      "gare de lyon",
    );

    expect(result.stations).toHaveLength(2);
    const parisGroup = result.stations.find((item) => item.city === "Paris 12e");
    expect(parisGroup?.memberStationIds).toEqual([gareOne.id, gareTwo.id].sort());
    expect(parisGroup?.lineIds).toEqual([
      rerA.id,
      trainJ.id,
      metro14.id,
      tramT3.id,
      bus20.id,
      bus29.id,
    ]);
  });

  it("keeps a tram platform separate from a nearby same-name bus hub", () => {
    const t6Station = {
      ...station,
      id: "station:dewoitine-t6",
      index: 40,
      name: "Dewoitine",
      normalizedName: "dewoitine",
      city: "Vélizy-Villacoublay",
      lineIds: ["line:tram:t6"],
      isHub: false,
      lon: 2.21463218995095,
      lat: 48.7837413000707,
    } satisfies GlobalMapStation;
    const busStation = {
      ...t6Station,
      id: "station:dewoitine-bus",
      index: 41,
      lineIds: ["line:bus:6134", "line:bus:6140"],
      isHub: true,
      lon: 2.21301781028639,
      lat: 48.785196737914,
    } satisfies GlobalMapStation;
    const t6 = {
      ...metro14,
      id: "line:tram:t6",
      code: "T6",
      label: "T6",
      mode: "TRAM",
    } satisfies GlobalMapLine;
    const bus6134 = {
      ...metro14,
      id: "line:bus:6134",
      code: "6134",
      label: "6134",
      mode: "BUS",
    } satisfies GlobalMapLine;
    const bus6140 = {
      ...metro14,
      id: "line:bus:6140",
      code: "6140",
      label: "6140",
      mode: "BUS",
    } satisfies GlobalMapLine;

    const groups = groupGlobalMapStations(
      [busStation, t6Station],
      [t6, bus6134, bus6140],
    );
    const group = groups.find((candidate) => candidate.id === t6Station.id);

    expect(groups).toHaveLength(2);
    expect(group).toMatchObject({
      id: t6Station.id,
      lon: t6Station.lon,
      lat: t6Station.lat,
      memberStationIds: [t6Station.id],
    });
  });

  it("merges nearby same-name Paris districts when a heavy cluster supports the merge", () => {
    const chateletMetro = {
      ...station,
      id: "station:chatelet-metro",
      index: 10,
      name: "Chatelet",
      normalizedName: "chatelet",
      city: "Paris 1er",
      aliases: ["Chatelet"],
      lineIds: [metro14.id, rerA.id],
      lon: 2.348,
      lat: 48.858,
    } satisfies GlobalMapStation;
    const chateletBus = {
      ...chateletMetro,
      id: "station:chatelet-bus",
      index: 11,
      city: "Paris 4e",
      lineIds: ["line:bus:20"],
      isHub: false,
      lon: 2.3484,
      lat: 48.8581,
    } satisfies GlobalMapStation;
    const bus20 = {
      ...metro14,
      id: "line:bus:20",
      code: "20",
      mode: "BUS",
      aliases: ["Bus 20"],
    } satisfies GlobalMapLine;

    const result = searchGlobalMapNetwork(
      [chateletMetro, chateletBus],
      [metro14, rerA, bus20],
      "chatelet",
    );

    expect(result.stations).toHaveLength(1);
    expect(result.stations[0].memberStationIds).toEqual([
      chateletMetro.id,
      chateletBus.id,
    ].sort());
    expect(result.stations[0]).toMatchObject({ city: "Paris 1er", lineIds: [rerA.id, metro14.id, bus20.id] });
  });

  it("does not merge nearby Paris homonyms when there is no heavy-transport cluster", () => {
    const first = {
      ...station,
      id: "station:bus-homonym-1",
      index: 20,
      name: "Centre",
      normalizedName: "centre",
      city: "Paris 1er",
      aliases: ["Centre"],
      lineIds: ["line:bus:20"],
      isHub: false,
      lon: 2.348,
      lat: 48.858,
    } satisfies GlobalMapStation;
    const second = {
      ...first,
      id: "station:bus-homonym-2",
      index: 21,
      city: "Paris 4e",
      lineIds: ["line:bus:21"],
      lon: 2.3484,
      lat: 48.8581,
    } satisfies GlobalMapStation;
    const bus20 = { ...metro14, id: "line:bus:20", code: "20", mode: "BUS" } satisfies GlobalMapLine;
    const bus21 = { ...metro14, id: "line:bus:21", code: "21", mode: "BUS" } satisfies GlobalMapLine;

    expect(groupGlobalMapStations([first, second], [bus20, bus21])).toHaveLength(2);
  });

  it("does not merge same-name stations when their coordinates are too far apart", () => {
    const near = {
      ...station,
      id: "station:far-check-near",
      index: 30,
      name: "Gare Centrale",
      normalizedName: "gare centrale",
      city: "Paris 1er",
      aliases: ["Gare Centrale"],
      lineIds: [metro14.id, rerA.id],
      lon: 2.348,
      lat: 48.858,
    } satisfies GlobalMapStation;
    const far = {
      ...near,
      id: "station:far-check-far",
      index: 31,
      lon: 2.4,
      lat: 48.82,
    } satisfies GlobalMapStation;

    expect(groupGlobalMapStations([near, far], [metro14, rerA])).toHaveLength(2);
  });
});
