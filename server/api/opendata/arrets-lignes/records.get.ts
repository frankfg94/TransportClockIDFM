import {
  createError,
  defineEventHandler,
  getQuery,
  type H3Event,
} from "h3";
import {
  ARRETS_LIGNES_RECORDS_URL,
  ARRETS_LIGNES_SELECT_FIELDS,
} from "../../../../src/services/idfmOpenDataTransfers";

const MAX_WHERE_LENGTH = 500;

export default defineEventHandler(async (event) => {
  const upstreamUrl = buildArretsLignesUpstreamUrl(event);
  const response = await fetch(upstreamUrl, {
    headers: {
      accept: "application/json",
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `IDFM Open Data arrets-lignes failed: ${response.status} ${response.statusText}`,
    });
  }

  return response.json();
});

export function buildArretsLignesUpstreamUrl(event: H3Event): string {
  const query = getQuery(event);
  const where = getSingleQueryValue(query.where).trim();

  if (!where || where.length > MAX_WHERE_LENGTH) {
    throw createError({
      statusCode: 400,
      statusMessage: "A valid where query is required.",
    });
  }

  const searchParams = new URLSearchParams({
    where,
    select: getSingleQueryValue(query.select).trim() || ARRETS_LIGNES_SELECT_FIELDS,
    limit: normalizeLimit(query.limit),
  });

  return `${ARRETS_LIGNES_RECORDS_URL}?${searchParams}`;
}

function getSingleQueryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function normalizeLimit(value: unknown): string {
  const numericValue = Number(getSingleQueryValue(value));

  if (!Number.isFinite(numericValue)) {
    return "100";
  }

  return String(Math.min(100, Math.max(1, Math.floor(numericValue))));
}
