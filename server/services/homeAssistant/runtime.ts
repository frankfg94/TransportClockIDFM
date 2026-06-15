import {
  createError,
  getRequestHeader,
  getRequestURL,
  type H3Event,
} from "h3";
import { getServerIdfmApiKey } from "../idfm/resolveStopArea";
import { createServerIdfmRequestOptions } from "../idfm/serverClient";
import { fetchIdfmTrafficLineReport } from "../idfm/traffic";
import {
  HomeAssistantApiInputError,
  HomeAssistantApiNotFoundError,
  HomeAssistantTransitApi,
} from "./transitApi";

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, string | undefined>;
  };
};

type RuntimeGlobal = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

const apiInstances = new Map<string, HomeAssistantTransitApi>();

export function getHomeAssistantTransitApi(event: H3Event): HomeAssistantTransitApi {
  const apiKey = getServerIdfmApiKey(event);

  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "IDFM_API_KEY is not configured on this deployment.",
    });
  }

  const cached = apiInstances.get(apiKey);

  if (cached) {
    return cached;
  }

  const api = new HomeAssistantTransitApi({
    fetchTraffic: (lineRef) => fetchIdfmTrafficLineReport(lineRef, apiKey),
    requestOptions: createServerIdfmRequestOptions(apiKey),
  });

  apiInstances.set(apiKey, api);
  return api;
}

export function assertHomeAssistantAuthorized(event: H3Event): void {
  const token = getHomeAssistantToken(event);

  if (!token) {
    return;
  }

  const authorization = getRequestHeader(event, "authorization") ?? "";

  if (!isHomeAssistantAuthorized(token, authorization)) {
    throw createError({
      data: {
        code: "invalid_auth",
      },
      statusCode: 401,
      statusMessage: "A valid Transport Clock bearer token is required.",
    });
  }
}

export function isHomeAssistantAuthorized(
  configuredToken: string,
  authorizationHeader: string,
): boolean {
  if (!configuredToken) {
    return true;
  }

  const providedToken = authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length)
    : "";

  return constantTimeEqual(configuredToken, providedToken);
}

export function getHomeAssistantInfo(event: H3Event): {
  authenticationRequired: boolean;
  canonicalUrl: string;
  instanceId: string;
} {
  const requestUrl = getRequestURL(event);
  const configuredInstanceId = getRuntimeValue(
    event,
    "TRANSPORT_CLOCK_INSTANCE_ID",
  );

  return {
    authenticationRequired: Boolean(getHomeAssistantToken(event)),
    canonicalUrl: requestUrl.origin,
    instanceId: configuredInstanceId || requestUrl.origin,
  };
}

export async function runHomeAssistantRequest<T>(
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof HomeAssistantApiInputError) {
      throw createError({
        data: { code: "invalid_request" },
        statusCode: 400,
        statusMessage: error.message,
      });
    }

    if (error instanceof HomeAssistantApiNotFoundError) {
      throw createError({
        data: { code: "not_found" },
        statusCode: 404,
        statusMessage: error.message,
      });
    }

    throw error;
  }
}

function getHomeAssistantToken(event: H3Event): string {
  return getRuntimeValue(event, "TRANSPORT_CLOCK_HA_TOKEN");
}

function getRuntimeValue(event: H3Event, key: string): string {
  const cloudflareEnv = (event.context as CloudflareContext).cloudflare?.env;
  const nodeEnv = (globalThis as RuntimeGlobal).process?.env;

  return (cloudflareEnv?.[key] ?? nodeEnv?.[key] ?? "").trim();
}

function constantTimeEqual(expected: string, actual: string): boolean {
  const maxLength = Math.max(expected.length, actual.length);
  let difference = expected.length ^ actual.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |=
      (expected.charCodeAt(index) || 0) ^ (actual.charCodeAt(index) || 0);
  }

  return difference === 0;
}
