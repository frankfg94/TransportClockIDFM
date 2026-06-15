import { defineEventHandler, getQuery, setHeader } from "h3";
import type {
  HomeAssistantCatalogResponse,
  HomeAssistantStation,
} from "../../../../../src/types/homeAssistant";
import {
  assertHomeAssistantAuthorized,
  getHomeAssistantTransitApi,
  runHomeAssistantRequest,
} from "../../../../services/homeAssistant/runtime";

export default defineEventHandler(
  async (event): Promise<HomeAssistantCatalogResponse<HomeAssistantStation>> => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "private, max-age=3600");

    const query = getQuery(event);

    return runHomeAssistantRequest(() =>
      getHomeAssistantTransitApi(event).searchStations(
        String(query.family ?? ""),
        String(query.lineId ?? ""),
        String(query.q ?? ""),
      ),
    );
  },
);
