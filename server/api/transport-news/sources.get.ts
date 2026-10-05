import { defineEventHandler, setHeader, setResponseStatus } from "h3";
import { NEWS_SOURCES } from "../../../src/features/transport-news/sources";
import {
  getNewsCatalog,
  newsCollector,
} from "../../services/transportNews/collector";
export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store");
  try {
    const catalog = await getNewsCatalog();
    const sources = [...NEWS_SOURCES, ...catalog.sources];
    return {
      sources,
      statuses: sources.flatMap((source) => {
        const status = newsCollector.status(source.id);
        return status ? [{ ...status, articles: [] }] : [];
      }),
      catalogState: catalog.state,
      ...(catalog.errorMessage ? { catalogErrorMessage: catalog.errorMessage } : {}),
    };
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message.trim().slice(0, 240)
        : "Unknown error.";
    console.error("[transport-news] GET /api/transport-news/sources failed", error);
    setResponseStatus(event, 500);
    return {
      error: true,
      message: "Unable to load transport news sources.",
      detail,
    };
  }
});
