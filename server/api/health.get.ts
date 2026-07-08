import { defineEventHandler, type H3Event } from "h3";
import type {
  HealthCheck,
  HealthQuota,
  HealthResponse,
} from "../../src/features/health/types";
import { getServerIdfmApiKey } from "../services/idfm/resolveStopArea";
import {
  getNetexCacheStatus,
  getNetexRuntimeEnv,
  type NetexRuntimeEnv,
} from "../services/topology/netexCache";

const MARKETPLACE_ROOT =
  "https://prim.iledefrance-mobilites.fr/marketplace";
const HEALTH_TIMEOUT_MS = 2_800;
const MAP_TILE_HEALTH_URL =
  "https://a.basemaps.cartocdn.com/light_all/12/2074/1408.png";
const OPEN_METEO_HEALTH_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current=temperature_2m,weather_code&forecast_days=1&timezone=Europe%2FParis";
const BROWSER_LIKE_HEALTH_HEADERS = {
  accept: "application/json",
  "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
};
const NETEX_UPDATE_RECOMMENDED_AFTER_MONTHS = 6;
const NETEX_OUTDATED_AFTER_MONTHS = 12;

type NetexDatasetFreshness = {
  status: "warning" | "error";
  message: string;
  detail: string;
};

export default defineEventHandler(async (event): Promise<HealthResponse> => {
  const checks = await Promise.all([
    checkNetexCache(event),
    checkR2Cache(event),
    checkMarketplaceApi(
      event,
      "prim",
      "PRIM live API",
      "/stop-monitoring?MonitoringRef=STIF%3AStopPoint%3AQ%3A463401%3A&count=1",
    ),
    checkMarketplaceApi(
      event,
      "navitia",
      "Navitia API",
      "/v2/navitia/commercial_modes?count=1&disable_disruption=true&disable_geojson=true",
    ),
    checkMarketplaceApi(
      event,
      "prim-traffic",
      "PRIM info trafic",
      "/v2/navitia/line_reports/lines/line%3AIDFM%3AC01743/line_reports?count=1&disable_geojson=true",
    ),
    checkOpenMeteoWeather(),
    checkMapTiles(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    checks,
  };
});

async function checkNetexCache(event: H3Event): Promise<HealthCheck> {
  return timedCheck("netex", "NeTEx data", "Data", true, async () => {
    const status = await getNetexCacheStatus(getNetexRuntimeEnv(event));

    if (!status.available) {
      return {
        status: "error",
        message: "NeTEx cache not found",
        messageKey: "health.messages.netexMissing",
        detail: status.message ?? "No NeTEx index loaded.",
        detailKey: status.message ? undefined : "health.messages.netexIndexMissing",
      };
    }

    const freshness = getNetexDatasetFreshness(status.generatedAt);

    return {
      status: freshness?.status ?? (status.warning ? "warning" : "ok"),
      message: [
        `${status.lineCount ?? 0} lines loaded`,
        freshness?.message,
      ]
        .filter(Boolean)
        .join(" · "),
      detail: [
        `Source ${formatNetexSource(status.source?.kind)}`,
        status.generatedAt ? `generated at ${formatDate(status.generatedAt)}` : "",
        freshness?.detail,
        status.warning,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
}

async function checkR2Cache(event: H3Event): Promise<HealthCheck> {
  return timedCheck("r2", "Cloudflare R2", "Storage", false, async () => {
    const runtimeEnv = getNetexRuntimeEnv(event);
    const remote = runtimeEnv.IDFM_NETEX_CACHE_REMOTE?.trim();

    if (!remote || !remote.startsWith("r2://")) {
      return {
        status: "not_configured",
        message: "R2 not configured",
        messageKey: "health.messages.r2NotConfigured",
        detail:
          "IDFM_NETEX_CACHE_REMOTE does not point to an r2:// source for this deployment.",
        detailKey: "health.messages.r2NotConfiguredDetail",
      };
    }

    const missing = getMissingR2Variables(runtimeEnv);

    if (missing.length > 0) {
      return {
        status: "error",
        message: "Incomplete R2 credentials",
        messageKey: "health.messages.r2MissingCredentials",
        detail: `Missing variables: ${missing.join(", ")}`,
        detailKey: "health.messages.missingVariables",
        detailParams: { variables: missing.join(", ") },
      };
    }

    const status = await getNetexCacheStatus(runtimeEnv);

    if (!status.available) {
      return {
        status: "error",
        message: "Unable to read R2",
        messageKey: "health.messages.r2ReadFailed",
        detail: status.message ?? "The index.json file could not be read.",
        detailKey: status.message ? undefined : "health.messages.indexReadFailed",
      };
    }

    return {
      status: "ok",
      message: "R2 bucket accessible",
      messageKey: "health.messages.r2Accessible",
      detail: sanitizeNetexLocation(status.source?.location),
    };
  });
}

async function checkMarketplaceApi(
  event: H3Event,
  id: string,
  label: string,
  path: string,
): Promise<HealthCheck> {
  return timedCheck(id, label, "Realtime", true, async () => {
    const apiKey = getServerIdfmApiKey(event);

    if (!apiKey) {
      return {
        status: "error",
        message: "Missing API key",
        messageKey: "health.messages.missingApiKey",
        detail: "Configure IDFM_API_KEY or NUXT_IDFM_API_KEY on the server.",
        detailKey: "health.messages.missingApiKeyDetail",
        quota: { exposed: false },
      };
    }

    const response = await fetchWithTimeout(`${MARKETPLACE_ROOT}${path}`, {
      headers: {
        apikey: apiKey,
        accept: "application/json",
      },
    });
    const quota = extractQuota(response.headers);

    if (!response.ok) {
      return {
        status: "error",
        message: `${response.status} ${response.statusText}`,
        detail: "The IDFM endpoint responded without an OK status.",
        detailKey: "health.messages.idfmEndpointBadStatus",
        quota,
      };
    }

    return {
      status: "ok",
      message: "Endpoint reachable",
      messageKey: "health.messages.endpointReachable",
      detail: "Short test through the IDFM marketplace proxy.",
      detailKey: "health.messages.idfmProxyTest",
      quota,
    };
  });
}

async function checkOpenMeteoWeather(): Promise<HealthCheck> {
  return timedCheck(
    "open-meteo",
    "Open-Meteo weather",
    "Weather",
    false,
    async () => {
      const response = await fetchWithTimeout(OPEN_METEO_HEALTH_URL, {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        return {
          status: "warning",
          message: `${response.status} ${response.statusText}`,
          detail: "The weather API responded without an OK status.",
          detailKey: "health.messages.weatherBadStatus",
          quota: extractQuota(response.headers),
        };
      }

      return {
        status: "ok",
        message: "Weather forecast reachable",
        messageKey: "health.messages.weatherReachable",
        detail: "Short Open-Meteo test on Paris, without an API key.",
        detailKey: "health.messages.weatherTest",
        quota: extractQuota(response.headers),
      };
    },
  );
}

async function checkMapTiles(): Promise<HealthCheck> {
  return timedCheck("map-tiles", "Vector map", "Map", false, async () => {
    const response = await fetchWithTimeout(MAP_TILE_HEALTH_URL, {
      headers: {
        accept: "image/png,image/*;q=0.8,*/*;q=0.5",
      },
    });

    if (!response.ok) {
      return {
        status: "warning",
        message: `${response.status} ${response.statusText}`,
        detail: "The Carto basemap did not respond correctly.",
        detailKey: "health.messages.mapBadStatus",
        quota: extractQuota(response.headers),
      };
    }

    return {
      status: "ok",
      message: "Map background reachable",
      messageKey: "health.messages.mapReachable",
      detail: "Carto basemap light_all responds correctly.",
      detailKey: "health.messages.mapTest",
      quota: extractQuota(response.headers),
    };
  });
}

async function timedCheck(
  id: string,
  label: string,
  category: string,
  required: boolean,
  check: () => Promise<Omit<HealthCheck, "id" | "label" | "category" | "required" | "latencyMs">>,
): Promise<HealthCheck> {
  const startedAt = performance.now();

  try {
    const result = await check();

    return {
      id,
      label,
      labelKey: getHealthCheckLabelKey(id),
      category,
      categoryKey: getHealthCategoryKey(category),
      required,
      latencyMs: Math.round(performance.now() - startedAt),
      ...result,
      quota: result.quota ?? { exposed: false },
    };
  } catch (error) {
    return {
      id,
      label,
      labelKey: getHealthCheckLabelKey(id),
      category,
      categoryKey: getHealthCategoryKey(category),
      required,
      status: required ? "error" : "warning",
      latencyMs: Math.round(performance.now() - startedAt),
      message: "Service unreachable",
      messageKey: "health.messages.serviceUnreachable",
      detail: error instanceof Error ? error.message : "Unknown error",
      detailKey:
        error instanceof Error ? undefined : "health.messages.unknownError",
      quota: { exposed: false },
    };
  }
}

function getHealthCheckLabelKey(id: string): HealthCheck["labelKey"] {
  return {
    netex: "health.checks.netex",
    r2: "health.checks.r2",
    prim: "health.checks.prim",
    navitia: "health.checks.navitia",
    "prim-traffic": "health.checks.primTraffic",
    "open-meteo": "health.checks.openMeteo",
    "map-tiles": "health.checks.mapTiles",
  }[id] as HealthCheck["labelKey"];
}

function getHealthCategoryKey(category: string): HealthCheck["categoryKey"] {
  return {
    Data: "health.categories.data",
    Storage: "health.categories.storage",
    Realtime: "health.categories.realtime",
    Weather: "health.categories.weather",
    Map: "health.categories.map",
  }[category] as HealthCheck["categoryKey"];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractQuota(headers: Headers): HealthQuota {
  const quota = {
    limit:
      headers.get("x-ratelimit-limit") ??
      headers.get("x-rate-limit-limit") ??
      headers.get("ratelimit-limit") ??
      undefined,
    remaining:
      headers.get("x-ratelimit-remaining") ??
      headers.get("x-rate-limit-remaining") ??
      headers.get("ratelimit-remaining") ??
      undefined,
    reset:
      headers.get("x-ratelimit-reset") ??
      headers.get("x-rate-limit-reset") ??
      headers.get("ratelimit-reset") ??
      undefined,
  };

  return {
    ...quota,
    exposed: Boolean(quota.limit || quota.remaining || quota.reset),
  };
}

function getMissingR2Variables(runtimeEnv: NetexRuntimeEnv): string[] {
  return [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ].filter((key) => !runtimeEnv[key]?.trim());
}

function formatNetexSource(kind?: string): string {
  if (!kind) {
    return "unknown";
  }

  return kind === "directory" ? "local" : kind.toUpperCase();
}

export function getNetexDatasetFreshness(
  generatedAt?: string,
  now = new Date(),
): NetexDatasetFreshness | undefined {
  if (!generatedAt) {
    return undefined;
  }

  const generatedDate = new Date(generatedAt);

  if (Number.isNaN(generatedDate.getTime()) || Number.isNaN(now.getTime())) {
    return undefined;
  }

  if (
    now.getTime() >
    addUtcMonths(generatedDate, NETEX_OUTDATED_AFTER_MONTHS).getTime()
  ) {
    return {
      status: "error",
      message: "dataset outdated",
      detail: "NeTEx dataset is over one year old and must be regenerated.",
    };
  }

  if (
    now.getTime() >
    addUtcMonths(generatedDate, NETEX_UPDATE_RECOMMENDED_AFTER_MONTHS).getTime()
  ) {
    return {
      status: "warning",
      message: "update recommended",
      detail: "NeTEx dataset is over six months old; updating it is recommended.",
    };
  }

  return undefined;
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const originalDay = next.getUTCDate();

  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);

  const lastDayInTargetMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();

  next.setUTCDate(Math.min(originalDay, lastDayInTargetMonth));

  return next;
}

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function sanitizeNetexLocation(location?: string): string {
  if (!location) {
    return "Source configured";
  }

  if (location.startsWith("r2://")) {
    const withoutScheme = location.slice("r2://".length);
    const [bucket, ...prefixParts] = withoutScheme.split("/");
    const prefix = prefixParts.filter(Boolean).join("/");

    return prefix ? `r2://${bucket}/${prefix}` : `r2://${bucket}`;
  }

  if (location.startsWith("http://") || location.startsWith("https://")) {
    try {
      const parsed = new URL(location);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return "Remote URL configured";
    }
  }

  return "Local folder configured";
}

