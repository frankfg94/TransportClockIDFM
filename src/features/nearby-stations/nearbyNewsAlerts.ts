import { sameNewsLine } from "../transport-news/filter";
import type { NewsArticle, NewsLine, NewsPreferences, NewsSource, NewsTopic } from "../transport-news/types";

function normalizePlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mentionsNearbyArea(article: NewsArticle, source: NewsSource | undefined, localities: readonly string[]): boolean {
  const nearby = localities.map(normalizePlace).filter(Boolean);
  if (!nearby.length) return false;
  const text = normalizePlace(`${article.title} ${article.excerpt}`);
  const mentionsTown = nearby.some((place) => ` ${text} `.includes(` ${place} `));
  const sourceCoversTown = source?.areas?.some((area) => nearby.includes(normalizePlace(area))) ?? false;
  return mentionsTown || sourceCoversTown;
}

export function isNearbyNewsArticle(
  article: NewsArticle,
  scope: { lines: readonly NewsLine[]; localities: readonly string[] },
  sources: readonly NewsSource[],
  preferences: NewsPreferences,
): boolean {
  if (preferences.disabledSources.includes(article.sourceId)) return false;
  if (!article.modes.some((mode) => preferences.modes.includes(mode))) return false;
  if (!article.topics.some((topic) => preferences.topics.includes(topic))) return false;

  const lineNews = article.lines.some((line) => scope.lines.some((nearbyLine) => sameNewsLine(line, nearbyLine)));
  const hasLocalTopic = article.topics.some((topic: NewsTopic) => topic === "urbanism" || topic === "realEstate");
  const source = sources.find((candidate) => candidate.id === article.sourceId);
  return lineNews || (hasLocalTopic && mentionsNearbyArea(article, source, scope.localities));
}
