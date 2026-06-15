import { defineEventHandler, getQuery, setHeader } from "h3";
import type {
  HomeAssistantCatalogResponse,
  HomeAssistantLine,
} from "../../../../../src/types/homeAssistant";
import {
  assertHomeAssistantAuthorized,
  getHomeAssistantTransitApi,
  runHomeAssistantRequest,
} from "../../../../services/homeAssistant/runtime";

export default defineEventHandler(
  async (event): Promise<HomeAssistantCatalogResponse<HomeAssistantLine>> => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "private, max-age=3600");

    const query = getQuery(event);

    return runHomeAssistantRequest(() =>
      getHomeAssistantTransitApi(event).searchLines(
        String(query.family ?? ""),
        String(query.q ?? ""),
      ),
    );
  },
);
