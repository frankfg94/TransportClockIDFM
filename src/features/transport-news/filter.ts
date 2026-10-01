import type { NewsArticle, NewsLine, NewsMode, NewsPreferences, NewsTopic } from "./types";

export function normalizeNewsLine(mode: string, code: string): NewsLine | undefined {
  const normalizedMode = mode === "transilien" ? "train" : mode;
  const normalizedCode = code
    .trim()
    .toUpperCase()
    .replace(/^(?:RER|TRANSILIEN|MÉTRO|METRO)\s*/u, "");
  if (
    !["metro", "rer", "train", "tram", "bus", "noctilien", "cable"].includes(normalizedMode) ||
    !/^[A-Z0-9-]{1,12}$/.test(normalizedCode)
  )
    return;
  return {
    mode: normalizedMode as NewsMode,
    code:
      normalizedMode === "tram"
        ? normalizedCode.replace(/^T?(\d+)/, "T$1")
        : normalizedMode === "metro"
          ? normalizedCode.replace(/^M(?=\d)/, "")
          : normalizedCode,
  };
}
export function sameNewsLine(left: NewsLine, right: NewsLine): boolean {
  return left.mode === right.mode && left.code === right.code;
}
export function mergeNewsArticles(articles: NewsArticle[]): NewsArticle[] {
  const unique = new Map<string, NewsArticle>();
  for (const article of articles) {
    const existing = unique.get(article.url);
    if (!existing) unique.set(article.url, article);
    else
      unique.set(article.url, {
        ...existing,
        lines: [...existing.lines, ...article.lines].filter(
          (line, index, all) => all.findIndex((other) => sameNewsLine(line, other)) === index,
        ),
        modes: [...new Set([...existing.modes, ...article.modes])],
        topics: [...new Set([...existing.topics, ...article.topics])],
      });
  }
  return [...unique.values()].sort(
    (a, b) =>
      (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0) ||
      a.title.localeCompare(b.title),
  );
}
export interface NewsFilters {
  query?: string;
  mode?: NewsMode;
  topic?: NewsTopic;
  sourceId?: string;
  line?: NewsLine;
}
export function filterNewsArticles(
  articles: NewsArticle[],
  preferences: NewsPreferences,
  filters: NewsFilters = {},
): NewsArticle[] {
  const search = (filters.query ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return articles.filter(
    (article) =>
      !preferences.disabledSources.includes(article.sourceId) &&
      article.modes.some((mode) =>
        filters.line ? mode === filters.line.mode : preferences.modes.includes(mode),
      ) &&
      article.topics.some((topic) => preferences.topics.includes(topic)) &&
      (!filters.mode || article.modes.includes(filters.mode)) &&
      (!filters.topic || article.topics.includes(filters.topic)) &&
      (!filters.sourceId || article.sourceId === filters.sourceId) &&
      (!filters.line || article.lines.some((line) => sameNewsLine(line, filters.line!))) &&
      (!search ||
        `${article.title} ${article.excerpt}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(search)),
  );
}
