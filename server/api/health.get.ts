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
  return timedCheck("netex", "Données NeTEx", "Données", true, async () => {
    const status = await getNetexCacheStatus(getNetexRuntimeEnv(event));

    if (!status.available) {
      return {
        status: "error",
        message: "Cache NeTEx introuvable",
        detail: status.message ?? "Aucun index NeTEx chargé.",
      };
    }

    return {
      status: status.warning ? "warning" : "ok",
      message: `${status.lineCount ?? 0} lignes chargées`,
      detail: [
        `Source ${formatNetexSource(status.source?.kind)}`,
        status.generatedAt ? `générée le ${formatDate(status.generatedAt)}` : "",
        status.warning,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
}

async function checkR2Cache(event: H3Event): Promise<HealthCheck> {
  return timedCheck("r2", "Cloudflare R2", "Stockage", false, async () => {
    const runtimeEnv = getNetexRuntimeEnv(event);
    const remote = runtimeEnv.IDFM_NETEX_CACHE_REMOTE?.trim();

    if (!remote || !remote.startsWith("r2://")) {
      return {
        status: "not_configured",
        message: "R2 non configuré",
        detail:
          "IDFM_NETEX_CACHE_REMOTE ne pointe pas vers une source r2:// pour ce déploiement.",
      };
    }

    const missing = getMissingR2Variables(runtimeEnv);

    if (missing.length > 0) {
      return {
        status: "error",
        message: "Identifiants R2 incomplets",
        detail: `Variables manquantes: ${missing.join(", ")}`,
      };
    }

    const status = await getNetexCacheStatus(runtimeEnv);

    if (!status.available) {
      return {
        status: "error",
        message: "Lecture R2 impossible",
        detail: status.message ?? "Le fichier index.json n'a pas pu être lu.",
      };
    }

    return {
      status: "ok",
      message: "Bucket R2 accessible",
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
  return timedCheck(id, label, "Temps réel", true, async () => {
    const apiKey = getServerIdfmApiKey(event);

    if (!apiKey) {
      return {
        status: "error",
        message: "Clé API absente",
        detail: "Configurez IDFM_API_KEY ou NUXT_IDFM_API_KEY côté serveur.",
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
        detail: "L'endpoint IDFM a répondu mais pas avec un statut OK.",
        quota,
      };
    }

    return {
      status: "ok",
      message: "Endpoint joignable",
      detail: "Test court via le proxy marketplace IDFM.",
      quota,
    };
  });
}

async function checkOpenMeteoWeather(): Promise<HealthCheck> {
  return timedCheck(
    "open-meteo",
    "Open-Meteo météo",
    "Météo",
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
          detail: "L'API météo a répondu mais pas avec un statut OK.",
          quota: extractQuota(response.headers),
        };
      }

      return {
        status: "ok",
        message: "Prévisions météo joignables",
        detail: "Test court Open-Meteo sur Paris, sans clé API.",
        quota: extractQuota(response.headers),
      };
    },
  );
}

async function checkMapTiles(): Promise<HealthCheck> {
  return timedCheck("map-tiles", "Carte vectorielle", "Carte", false, async () => {
    const response = await fetchWithTimeout(MAP_TILE_HEALTH_URL, {
      headers: {
        accept: "image/png,image/*;q=0.8,*/*;q=0.5",
      },
    });

    if (!response.ok) {
      return {
        status: "warning",
        message: `${response.status} ${response.statusText}`,
        detail: "Le fond Carto basemap ne répond pas correctement.",
        quota: extractQuota(response.headers),
      };
    }

    return {
      status: "ok",
      message: "Fond de carte joignable",
      detail: "Carto basemap light_all répond correctement.",
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
      category,
      required,
      latencyMs: Math.round(performance.now() - startedAt),
      ...result,
      quota: result.quota ?? { exposed: false },
    };
  } catch (error) {
    return {
      id,
      label,
      category,
      required,
      status: required ? "error" : "warning",
      latencyMs: Math.round(performance.now() - startedAt),
      message: "Service injoignable",
      detail: error instanceof Error ? error.message : "Erreur inconnue",
      quota: { exposed: false },
    };
  }
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
    return "inconnue";
  }

  return kind === "directory" ? "locale" : kind.toUpperCase();
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
    return "Source configurée";
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
      return "URL distante configurée";
    }
  }

  return "Dossier local configuré";
}
