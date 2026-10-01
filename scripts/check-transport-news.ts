import { NEWS_SOURCES } from "../src/features/transport-news/sources";
import { getNewsCatalog, newsCollector } from "../server/services/transportNews/collector";

// Read-only live audit: bounded collection, no credentials or generated files.
const selected = process.argv
  .find((arg) => arg.startsWith("--sources="))
  ?.slice(10)
  .split(",");
const queue = NEWS_SOURCES.filter((source) => !selected || selected.includes(source.id));
let available = 0;
let articles = 0;
async function worker() {
  while (queue.length) {
    const source = queue.shift()!;
    const result = await newsCollector.collect(source);
    if (result.state === "ready") available++;
    articles += result.articles.length;
    console.log(
      JSON.stringify({
        id: source.id,
        url: source.url,
        state: result.state,
        error: result.error,
        httpStatus: result.httpStatus,
        articles: result.articles.length,
        example: process.argv.includes("--details")
          ? result.articles.slice(0, 3)
          : result.articles[0]?.title,
      }),
    );
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
const catalog = await getNewsCatalog();
console.log(
  JSON.stringify({
    available,
    sources: NEWS_SOURCES.length,
    articles,
    projectCatalog: catalog.state,
    discoveredProjects: catalog.sources.length,
  }),
);
