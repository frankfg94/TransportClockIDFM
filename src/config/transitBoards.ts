import type { TransitBoardConfig } from "../types/transit";

export const transitBoards: TransitBoardConfig[] = [
  {
    id: "t10-les-peintres",
    title: "Les Peintres",
    city: "Châtenay-Malabry",
    line: {
      ref: "STIF:Line::C02528:",
      shortName: "T10",
      longName: "Tram T10",
      mode: "tram",
      color: "#9ACD32",
      textColor: "#10233f",
    },
    monitoringPoints: [
      {
        ref: "STIF:StopPoint:Q:486826:",
        label: "Jardin Parisien",
      },
      {
        ref: "STIF:StopPoint:Q:486845:",
        label: "La Croix de Berny",
      },
    ],
    directionGroups: [
      {
        id: "jardin-parisien",
        label: "Jardin Parisien",
        subtitle: "Direction Clamart",
        match: {
          monitoringRefs: ["STIF:StopPoint:Q:486826:"],
          destinationIncludes: ["Jardin Parisien", "Clamart"],
          navitiaStopPointRefs: ["stop_point:IDFM:486826"],
        },
      },
      {
        id: "malabry",
        label: "Malabry",
        subtitle: "Service partiel",
        match: {
          monitoringRefs: ["STIF:StopPoint:Q:486826:"],
          destinationIncludes: ["Malabry"],
          navitiaStopPointRefs: ["stop_point:IDFM:486826"],
        },
      },
      {
        id: "croix-de-berny",
        label: "La Croix de Berny",
        subtitle: "Direction Antony",
        match: {
          monitoringRefs: ["STIF:StopPoint:Q:486845:"],
          destinationIncludes: ["La Croix de Berny"],
          navitiaStopPointRefs: ["stop_point:IDFM:486845"],
        },
      },
    ],
    schedule: {
      lineRef: "line:IDFM:C02528",
      stopAreaRef: "stop_area:IDFM:69839",
    },
    maxDepartures: 8,
  },
  {
    id: "rer-b-croix-de-berny",
    title: "La Croix de Berny",
    city: "Antony",
    line: {
      ref: "STIF:Line::C01743:",
      shortName: "B",
      longName: "RER B",
      mode: "rer",
      color: "#4A90D9",
      textColor: "#ffffff",
    },
    monitoringPoints: [
      {
        ref: "STIF:StopArea:SP:46007:",
        label: "Tous quais",
      },
    ],
    directionGroups: [
      {
        id: "rer-b-nord",
        label: "Paris / Nord",
        subtitle: "Aéroport CDG, Mitry-Claye",
        match: {
          platforms: ["2"],
          destinationIncludes: [
            "Aéroport",
            "Charles de Gaulle",
            "Mitry",
            "Paris",
          ],
        },
      },
      {
        id: "rer-b-sud",
        label: "Massy / Saint-Rémy",
        subtitle: "Quai 1",
        match: {
          platforms: ["1"],
          destinationIncludes: ["Massy", "Saint-Rémy", "Saint-Remy"],
        },
      },
    ],
    schedule: {
      lineRef: "line:IDFM:C01743",
      stopAreaRef: "stop_area:IDFM:69813",
    },
    maxDepartures: 10,
  },
  {
    id: "transilien-j-saint-lazare",
    title: "Gare Saint-Lazare",
    city: "Paris",
    line: {
      ref: "STIF:Line::C01739:",
      shortName: "J",
      longName: "Transilien J",
      mode: "train",
      color: "#C58A30",
      textColor: "#ffffff",
    },
    monitoringPoints: [
      {
        ref: "STIF:StopArea:SP:58566:",
        label: "Tous quais",
      },
    ],
    directionGroups: [
      {
        id: "j-mantes",
        label: "Mantes-la-Jolie",
        subtitle: "Branches Seine et Conflans",
        match: {
          destinationIncludes: ["Mantes"],
          navitiaStopPointRefs: ["stop_point:IDFM:monomodalStopPlace:58566"],
        },
      },
      {
        id: "j-pontoise-ermont",
        label: "Pontoise / Ermont",
        subtitle: "Branches nord-ouest",
        match: {
          destinationIncludes: ["Pontoise", "Ermont"],
          navitiaStopPointRefs: ["stop_point:IDFM:monomodalStopPlace:58566"],
        },
      },
      {
        id: "j-gisors",
        label: "Gisors",
        subtitle: "Direction Normandie",
        match: {
          destinationIncludes: ["Gisors"],
          navitiaStopPointRefs: ["stop_point:IDFM:monomodalStopPlace:58566"],
        },
      },
    ],
    schedule: {
      lineRef: "line:IDFM:C01739",
      stopAreaRef: "stop_area:IDFM:71370",
    },
    maxDepartures: 10,
  },
];
