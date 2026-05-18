import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParam,
  getRequestURL,
  setHeader,
} from "h3";
import { buildLinePatternView } from "../../../../services/servicePattern/buildLinePatternView";
import { buildLiveLinePatternView } from "../../../../services/servicePattern/buildLiveLinePatternView";
import {
  getServerIdfmApiKey,
  resolveStopAreaPatternCandidates,
} from "../../../../services/idfm/resolveStopArea";
import { hydrateDeparturePatternTransfers } from "../../../../../src/features/service-pattern/patternTransfers";
import {
  fetchStationTransfers,
  fetchTransitFamilyOptions,
  searchLineStations,
  searchTransitLines,
} from "../../../../../src/services/idfm";

export default defineEventHandler(async (event) => {
  const transportType = getRouterParam(event, "transportType");
  const lineId = getRouterParam(event, "lineId");
  const query = getQuery(event);

  if (!transportType || !lineId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing transport type or line id.",
    });
  }

  try {
    const startStation = firstQueryValue(query.startStation);
    const apiKey = getServerIdfmApiKey(event);
    const startStationCandidates = await resolveStopAreaPatternCandidates(
      startStation,
      apiKey,
    );
    const request = {
      transportType,
      lineId,
      directionId: firstQueryValue(query.direction),
      startStationId: startStation,
      startStationCandidates,
    };
    const response = await buildLinePatternView(request).catch(() =>
      buildLiveLinePatternView({
        ...request,
        apiKey,
      }),
    );
    const origin = getRequestURL(event).origin;
    const hydratedPattern = await hydrateDeparturePatternTransfers(
      response.board,
      response.pattern,
      createServerPatternTransferClient(origin),
    ).catch(() => response.pattern);

    setHeader(event, "Cache-Control", "public, max-age=21600");

    return {
      ...response,
      pattern: hydratedPattern,
    };
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No pattern view found for ${transportType}/${lineId}.`,
    });
  }
});

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function createServerPatternTransferClient(origin: string) {
  const navitiaOptions = {
    apiBase: `${origin}/api/idfm/v2/navitia`,
  };

  return {
    getTransitFamilies: () => fetchTransitFamilyOptions(navitiaOptions),
    searchLines: (network, query) =>
      searchTransitLines(network, query, navitiaOptions),
    searchStations: (line, query) =>
      searchLineStations(line, query, navitiaOptions),
    fetchTransfers: (station, currentLineId) =>
      fetchStationTransfers(station, currentLineId, navitiaOptions),
  } satisfies Parameters<typeof hydrateDeparturePatternTransfers>[2];
}
