import { defineEventHandler, getQuery, setHeader, setResponseStatus } from "h3";
import { NEWS_SOURCES } from "../../../src/features/transport-news/sources";
import { getNewsSources, newsCollector } from "../../services/transportNews/collector";
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const id = typeof query.sourceId === "string" ? query.sourceId : "";
  if (!/^[a-z0-9-]{1,100}$/.test(id)) {
    setResponseStatus(event, 400);
    return { error: true, message: "Invalid transport news source ID." };
  }
  setHeader(event, "Cache-Control", "no-store");
  try {
    const source =
      NEWS_SOURCES.find((item) => item.id === id) ??
      (await getNewsSources()).find((item) => item.id === id);
    if (!source) {
      setResponseStatus(event, 404);
      return { error: true, message: "Transport news source not found." };
    }
    return await newsCollector.collect(source, query.refresh === "1");
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message.trim().slice(0, 240)
        : "Unknown error.";
    console.error(`[transport-news] GET /api/transport-news/articles failed for ${id}`, error);
    setResponseStatus(event, 500);
    return {
      error: true,
      message: "Unable to load transport news articles.",
      detail,
    };
  }
});
