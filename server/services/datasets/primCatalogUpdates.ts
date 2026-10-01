import { XMLParser, XMLValidator } from "fast-xml-parser";
import type {
  PrimCatalogUpdateEntry,
  PrimCatalogUpdatesResponse,
} from "../../../src/features/health/types";
import { fetchNewsDocument } from "../transportNews/collector";

export const PRIM_CATALOG_RSS_URL =
  "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/exports/rss?lang=fr&sort=-modified";
export const PRIM_CATALOG_UPDATES_PAGE_URL =
  "https://prim.iledefrance-mobilites.fr/fr/mise-a-jour-jeux-de-donnees";
const SUCCESS_TTL_MS = 30 * 60_000;
const FAILURE_TTL_MS = 5 * 60_000;

type CatalogSnapshot = PrimCatalogUpdatesResponse & { cacheUntil: number };
let snapshot: CatalogSnapshot | undefined;
let pending: Promise<CatalogSnapshot> | undefined;

export async function getPrimCatalogUpdates(now = Date.now()): Promise<PrimCatalogUpdatesResponse> {
  if (snapshot && now < snapshot.cacheUntil) return publicSnapshot(snapshot);
  if (pending) return publicSnapshot(await pending);

  pending = (async () => {
    const checkedAt = new Date(now).toISOString();
    try {
      const body = await fetchNewsDocument(PRIM_CATALOG_RSS_URL);
      const entries = parsePrimCatalogRss(body);
      if (!entries.length) throw new Error("empty-feed");
      snapshot = {
        feedUrl: PRIM_CATALOG_RSS_URL,
        catalogPageUrl: PRIM_CATALOG_UPDATES_PAGE_URL,
        state: "ready",
        checkedAt,
        fetchedAt: checkedAt,
        entries,
        cacheUntil: now + SUCCESS_TTL_MS,
      };
    } catch {
      const previous = snapshot;
      snapshot = {
        feedUrl: PRIM_CATALOG_RSS_URL,
        catalogPageUrl: PRIM_CATALOG_UPDATES_PAGE_URL,
        state: previous?.fetchedAt ? "stale" : "unavailable",
        checkedAt,
        ...(previous?.fetchedAt ? { fetchedAt: previous.fetchedAt } : {}),
        entries: previous?.entries ?? [],
        cacheUntil: now + FAILURE_TTL_MS,
      };
    }
    return snapshot;
  })();

  try {
    return publicSnapshot(await pending);
  } finally {
    pending = undefined;
  }
}

export function parsePrimCatalogRss(body: string): PrimCatalogUpdateEntry[] {
  if (XMLValidator.validate(body) !== true) throw new Error("invalid-rss");
  const xml = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: true,
    parseTagValue: false,
    removeNSPrefix: false,
  }).parse(body) as Record<string, any>;
  const feedItems = xml.rss?.channel?.item ?? xml.feed?.entry ?? xml["rdf:RDF"]?.item;
  if (!xml.rss && !xml.feed && !xml["rdf:RDF"]) throw new Error("invalid-rss");

  const unique = new Map<string, PrimCatalogUpdateEntry>();
  for (const raw of asArray(feedItems).slice(0, 500)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const title = asText(item.title).trim();
    const link = rssLink(item.link) ?? asText(item.guid).trim();
    const url = safeDatasetUrl(link);
    const datasetId = datasetIdFromUrl(url) ?? safeDatasetId(asText(item.guid));
    if (!title || !url || !datasetId) continue;
    const rawDate = asText(item.pubDate ?? item.published ?? item["dc:date"] ?? item.updated).trim();
    const timestamp = rawDate ? Date.parse(rawDate) : NaN;
    const entry: PrimCatalogUpdateEntry = {
      datasetId,
      title,
      url,
      ...(Number.isFinite(timestamp) ? { updatedAt: new Date(timestamp).toISOString() } : {}),
    };
    const previous = unique.get(datasetId);
    if (!previous || (entry.updatedAt && (!previous.updatedAt || entry.updatedAt > previous.updatedAt))) {
      unique.set(datasetId, entry);
    }
  }
  return [...unique.values()].sort((left, right) =>
    (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
  );
}

function publicSnapshot(value: CatalogSnapshot): PrimCatalogUpdatesResponse {
  const { cacheUntil: _cacheUntil, ...response } = value;
  return response;
}

function asArray(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function asText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !key.startsWith("@_"))
      .map(([, part]) => asText(part))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function rssLink(value: unknown): string | undefined {
  for (const link of asArray(value)) {
    if (typeof link === "string" && link.trim()) return link.trim();
    if (!link || typeof link !== "object") continue;
    const record = link as Record<string, unknown>;
    const href = record["@_href"];
    const rel = record["@_rel"];
    if (typeof href === "string" && (!rel || rel === "alternate")) return href.trim();
  }
  return undefined;
}

function safeDatasetUrl(value: string): string | undefined {
  try {
    const url = new URL(value, "https://prim.iledefrance-mobilites.fr");
    if (url.protocol !== "https:" || ![
      "prim.iledefrance-mobilites.fr",
      "data.iledefrance-mobilites.fr",
    ].includes(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function datasetIdFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/(?:fr\/)?(?:jeux-de-donnees|datasets|dataset)\/([^/]+)/iu)
      ?? url.pathname.match(/\/catalog\/datasets\/([^/]+)/iu);
    return match ? safeDatasetId(decodeURIComponent(match[1])) : undefined;
  } catch {
    return undefined;
  }
}

function safeDatasetId(value: string): string | undefined {
  const id = value.trim().replace(/\/$/u, "");
  return /^[a-z0-9][a-z0-9_-]{1,119}$/iu.test(id) ? id : undefined;
}
