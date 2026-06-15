import {
  defineEventHandler,
  readBody,
  setHeader,
} from "h3";
import type {
  HomeAssistantBoardsRequest,
  HomeAssistantBoardsResponse,
} from "../../../../src/types/homeAssistant";
import {
  assertHomeAssistantAuthorized,
  getHomeAssistantTransitApi,
  runHomeAssistantRequest,
} from "../../../services/homeAssistant/runtime";

export default defineEventHandler(
  async (event): Promise<HomeAssistantBoardsResponse> => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "no-store");

    const body = await readBody<HomeAssistantBoardsRequest>(event);

    return runHomeAssistantRequest(() =>
      getHomeAssistantTransitApi(event).getBoards(body?.boards),
    );
  },
);
