import { NEWS_SOURCES } from "../../../src/features/transport-news/sources";
import type { NewsSource, NewsSourceResult } from "../../../src/features/transport-news/types";
import { discoverIdfmProjects, newsHtmlLinks, parseNewsArticleHtml, parseNewsRss } from "./parser";
import { mergeNewsArticles } from "../../../src/features/transport-news/filter";

export const NEWS_CACHE_MS = 30 * 60_000;
class SourceError extends Error {
  constructor(
    public kind: NewsSourceResult["error"],
    public status?: number,
  ) {
    super(kind);
  }
}
const allowedHost = (host: string, initial: string) =>
  host === initial ||
  host.replace(/^www\./, "") === initial.replace(/^www\./, "") ||
  (initial === "94.citoyens.com" && host === "citoyens.com");
let activeDocuments = 0;
const documentQueue: (() => void)[] = [];
async function acquireDocumentSlot() {
  if (activeDocuments >= 4) await new Promise<void>((resolve) => documentQueue.push(resolve));
  else activeDocuments++;
}
function releaseDocumentSlot() {
  const next = documentQueue.shift();
  if (next) next();
  else activeDocuments--;
}
export async function fetchNewsDocument(url: string): Promise<string> {
  const initial = new URL(url);
  await acquireDocumentSlot();
  let current = initial;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          Accept: "application/rss+xml, application/atom+xml, text/html, application/xml",
          "User-Agent": "TransportClock/1.0 (transport news reader)",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new SourceError("http", response.status);
        const next = new URL(location, current);
        if (next.protocol !== "https:" || !allowedHost(next.hostname, initial.hostname))
          throw new SourceError("http", response.status);
        current = next;
        continue;
      }
      if (!response.ok) throw new SourceError("http", response.status);
      if (Number(response.headers.get("content-length")) > 2_000_000)
        throw new SourceError("parse");
      const reader = response.body?.getReader();
      if (!reader) throw new SourceError("parse");
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > 2_000_000) {
          await reader.cancel();
          throw new SourceError("parse");
        }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const declaration = new TextDecoder()
        .decode(bytes.slice(0, 250))
        .match(/encoding=["']([^"']+)/i)?.[1];
      const charset =
        response.headers.get("content-type")?.match(/charset=([^;\s]+)/i)?.[1] ??
        declaration ??
        "utf-8";
      try {
        return new TextDecoder(charset).decode(bytes);
      } catch {
        return new TextDecoder().decode(bytes);
      }
    }
    throw new SourceError("http");
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
    releaseDocumentSlot();
  }
}

export function createNewsCollector(readDocument = fetchNewsDocument, now = Date.now) {
  const records = new Map<string, NewsSourceResult>();
  const pending = new Map<string, Promise<NewsSourceResult>>();
  async function collect(source: NewsSource, refresh = false): Promise<NewsSourceResult> {
    const previous = records.get(source.id);
    const age = previous ? now() - Date.parse(previous.checkedAt) : Infinity;
    if (
      previous &&
      age < (refresh ? 60_000 : previous.state === "ready" ? NEWS_CACHE_MS : 5 * 60_000)
    )
      return previous;
    const inFlight = pending.get(source.id);
    if (inFlight) return inFlight;
    const task = (async (): Promise<NewsSourceResult> => {
      try {
        const body = await readDocument(source.url);
        let articles;
        let partial = false;
        if (source.method === "rss") articles = parseNewsRss(body, source);
        else if (source.method === "article") {
          const article = parseNewsArticleHtml(body, source);
          if (!article) throw new SourceError("parse");
          articles = [article];
        } else {
          const links = newsHtmlLinks(body, source);
          if (!links.length) throw new SourceError("parse");
          articles = [];
          let successfulDocuments = 0;
          for (let i = 0; i < links.length; i += 4) {
            const responses = await Promise.allSettled(
              links.slice(i, i + 4).map(async (url) => {
                const document = await readDocument(url);
                successfulDocuments++;
                return parseNewsArticleHtml(document, source, url);
              }),
            );
            for (const response of responses) {
              if (response.status === "fulfilled" && response.value) articles.push(response.value);
              if (response.status === "rejected") partial = true;
            }
          }
          if (!successfulDocuments) throw new SourceError("network");
        }
        const result: NewsSourceResult = {
          sourceId: source.id,
          articles: partial
            ? mergeNewsArticles([...articles, ...(previous?.articles ?? [])]).slice(0, 100)
            : articles,
          state: partial ? "stale" : "ready",
          fetchedAt: new Date(now()).toISOString(),
          checkedAt: new Date(now()).toISOString(),
          ...(partial ? { error: "network" as const } : {}),
        };
        records.set(source.id, result);
        return result;
      } catch (error) {
        const result: NewsSourceResult = {
          sourceId: source.id,
          articles: previous?.articles ?? [],
          fetchedAt: previous?.fetchedAt,
          state: previous?.fetchedAt ? "stale" : "unavailable",
          checkedAt: new Date(now()).toISOString(),
          error: error instanceof SourceError ? error.kind : "parse",
          httpStatus: error instanceof SourceError ? error.status : undefined,
        };
        records.set(source.id, result);
        return result;
      }
    })();
    pending.set(source.id, task);
    try {
      return await task;
    } finally {
      pending.delete(source.id);
    }
  }
  return { collect, status: (sourceId: string) => records.get(sourceId) };
}
export const newsCollector = createNewsCollector();
let catalog:
  { sources: NewsSource[]; state: NewsSourceResult["state"]; checkedAt: number } | undefined;
let catalogPending: Promise<NonNullable<typeof catalog>> | undefined;
export async function getNewsCatalog() {
  if (catalog && Date.now() - catalog.checkedAt < NEWS_CACHE_MS) return catalog;
  if (catalogPending) return catalogPending;
  catalogPending = (async () => {
    try {
      const sources = discoverIdfmProjects(
        await fetchNewsDocument("https://www.iledefrance-mobilites.fr/le-reseau/projets"),
      );
      if (!sources.length) throw new Error("parse");
      catalog = { sources, state: "ready", checkedAt: Date.now() };
    } catch {
      catalog = {
        sources: catalog?.sources ?? [],
        state: catalog?.sources.length ? "stale" : "unavailable",
        checkedAt: Date.now(),
      };
    }
    return catalog;
  })();
  try {
    return await catalogPending;
  } finally {
    catalogPending = undefined;
  }
}
export async function getNewsSources(): Promise<NewsSource[]> {
  return [...NEWS_SOURCES, ...(await getNewsCatalog()).sources];
}
