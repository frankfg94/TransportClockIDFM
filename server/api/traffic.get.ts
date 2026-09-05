import { defineEventHandler, getQuery, setHeader } from "h3";
import {
  normalizeTrafficLineRef,
} from "../../src/features/traffic/trafficNormalization";
import type { TrafficResponse } from "../../src/features/traffic/types";
import {
  resolveTrafficLocale,
  type TrafficLocale,
} from "../../src/features/traffic/trafficLocale";
import {
  getTrafficSnapshot,
  refreshTrafficLineDetail,
} from "../services/idfm/traffic";

export default defineEventHandler(async (event): Promise<TrafficResponse> => {
  const query = getQuery(event);
  const lineRefs = parseLineRefs(query.lineRefs);
  const detail = isEnabled(query.detail) && lineRefs.length === 1;
  const locale = resolveTrafficLocale(query.locale);
  let snapshot = (await getTrafficSnapshot(event, { locale })).response;

  if (detail && (snapshot.cache?.ageMs ?? 0) > (snapshot.cache?.detailRefreshAfterMs ?? 60_000)) {
    await refreshTrafficLineDetail(event, lineRefs[0], locale);
    snapshot = (await getTrafficSnapshot(event, { locale })).response;
  }

  const response: TrafficResponse = {
    ...snapshot,
    lines: lineRefs.length
      ? snapshot.lines.filter((line) =>
          lineRefs.includes(normalizeTrafficLineRef(line.lineRef)),
        )
      : snapshot.lines,
  };
  setTrafficDiagnostics(event, response, detail ? "detail" : "global", locale);
  return response;
});

function parseLineRefs(value: unknown): string[] {
  const rawValue = Array.isArray(value) ? value.join(",") : String(value ?? "");

  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((lineRef) => {
          try {
            return normalizeTrafficLineRef(decodeURIComponent(lineRef));
          } catch {
            return normalizeTrafficLineRef(lineRef);
          }
        })
        .filter(Boolean),
    ),
  );
}

function isEnabled(value: unknown): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export function setTrafficDiagnostics(
  event: Parameters<typeof setHeader>[0],
  response: TrafficResponse,
  requestKind: "global" | "detail",
  locale?: TrafficLocale,
): void {
  setHeader(event, "Cache-Control", "private, max-age=5, stale-while-revalidate=30");
  setHeader(event, "X-Traffic-Cache-State", response.cache?.state ?? "miss");
  setHeader(event, "X-Traffic-Source", response.source);
  setHeader(event, "X-Traffic-Request", requestKind);
  if (locale) setHeader(event, "X-Traffic-Locale", locale);
  if (response.cache?.refreshedAt) {
    setHeader(event, "X-Traffic-Refreshed-At", response.cache.refreshedAt);
  }
}
