import { defineEventHandler, setHeader } from "h3";
import {
  getNewsCatalog,
  getNewsSources,
  newsCollector,
} from "../../services/transportNews/collector";
export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store");
  const sources = await getNewsSources();
  return {
    sources,
    statuses: sources.flatMap((source) => {
      const status = newsCollector.status(source.id);
      return status ? [{ ...status, articles: [] }] : [];
    }),
    catalogState: (await getNewsCatalog()).state,
  };
});
