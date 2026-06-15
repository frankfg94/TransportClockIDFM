import { defineEventHandler, getQuery, setHeader } from "h3";
import type {
  HomeAssistantCatalogResponse,
  HomeAssistantDirection,
} from "../../../../../src/types/homeAssistant";
import {
  assertHomeAssistantAuthorized,
  getHomeAssistantTransitApi,
  runHomeAssistantRequest,
} from "../../../../services/homeAssistant/runtime";

export default defineEventHandler(
  async (
    event,
  ): Promise<HomeAssistantCatalogResponse<HomeAssistantDirection>> => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "private, max-age=3600");

    const query = getQuery(event);

    return runHomeAssistantRequest(() =>
      getHomeAssistantTransitApi(event).listDirections(
        String(query.family ?? ""),
        String(query.lineId ?? ""),
        String(query.stationId ?? ""),
      ),
    );
  },
);
