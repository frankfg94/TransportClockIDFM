import { defineEventHandler, setHeader } from "h3";
import type { HomeAssistantInfoResponse } from "../../../../src/types/homeAssistant";
import { getHomeAssistantInfo } from "../../../services/homeAssistant/runtime";

export default defineEventHandler((event): HomeAssistantInfoResponse => {
  setHeader(event, "Cache-Control", "no-store");

  const info = getHomeAssistantInfo(event);

  return {
    apiVersion: "v1",
    authenticationRequired: info.authenticationRequired,
    canonicalUrl: info.canonicalUrl,
    capabilities: {
      catalog: true,
      departures: true,
      traffic: true,
    },
    instanceId: info.instanceId,
    name: "Transport Clock",
  };
});
