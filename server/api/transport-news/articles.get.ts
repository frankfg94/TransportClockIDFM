import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import { NEWS_SOURCES } from "../../../src/features/transport-news/sources";
import { getNewsSources, newsCollector } from "../../services/transportNews/collector";
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const id = typeof query.sourceId === "string" ? query.sourceId : "";
  if (!/^[a-z0-9-]{1,100}$/.test(id))
    throw createError({ statusCode: 400, statusMessage: "Invalid source ID" });
  const source =
    NEWS_SOURCES.find((item) => item.id === id) ??
    (await getNewsSources()).find((item) => item.id === id);
  if (!source) throw createError({ statusCode: 404, statusMessage: "Unknown source" });
  setHeader(event, "Cache-Control", "no-store");
  return newsCollector.collect(source, query.refresh === "1");
});
