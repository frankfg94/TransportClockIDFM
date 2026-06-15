import { defineEventHandler, setHeader } from "h3";
import type {
  HomeAssistantCatalogResponse,
  HomeAssistantFamily,
} from "../../../../../src/types/homeAssistant";
import {
  assertHomeAssistantAuthorized,
  getHomeAssistantTransitApi,
  runHomeAssistantRequest,
} from "../../../../services/homeAssistant/runtime";

export default defineEventHandler(
  async (event): Promise<HomeAssistantCatalogResponse<HomeAssistantFamily>> => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "private, max-age=3600");

    return runHomeAssistantRequest(() =>
      getHomeAssistantTransitApi(event).listFamilies(),
    );
  },
);
