import type { H3Event } from "h3";

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
