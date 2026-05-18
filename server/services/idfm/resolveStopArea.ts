import type { H3Event } from "h3";

export const IDFM_MARKETPLACE_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace";

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

interface NavitiaStopAreaPayload {
  name?: string;
  label?: string;
  stop_area?: {
    name?: string;
    label?: string;
  };
  stop_areas?: Array<{
    name?: string;
    label?: string;
  }>;
}

export function getServerIdfmApiKey(event: H3Event): string {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env;
  const nodeEnv = (globalThis as RuntimeGlobal).process?.env;

  return (
    cfEnv?.NUXT_IDFM_API_KEY ??
    cfEnv?.IDFM_API_KEY ??
    nodeEnv?.NUXT_IDFM_API_KEY ??
    nodeEnv?.IDFM_API_KEY ??
    ""
  ).trim();
}

export async function resolveStopAreaPatternCandidates(
  value: string | undefined,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  if (!value?.startsWith("stop_area:")) {
    return [];
  }

  const url = new URL(
    `${IDFM_MARKETPLACE_BASE}/v2/navitia/stop_areas/${encodeURIComponent(
      value,
    )}`,
  );

  url.searchParams.set("disable_disruption", "true");
  url.searchParams.set("disable_geojson", "true");

  const response = await fetcher(url, {
    headers: {
      apikey: apiKey,
    },
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as NavitiaStopAreaPayload;
  const names = [
    payload.name,
    payload.label,
    payload.stop_area?.name,
    payload.stop_area?.label,
    ...(payload.stop_areas ?? []).flatMap((stopArea) => [
      stopArea.name,
      stopArea.label,
    ]),
  ];

  return Array.from(
    new Set(names.filter((name): name is string => Boolean(name?.trim()))),
  );
}
