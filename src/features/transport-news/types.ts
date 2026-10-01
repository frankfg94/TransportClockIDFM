export const NEWS_MODES = ["metro", "rer", "train", "tram", "bus", "noctilien", "cable"] as const;
export type NewsMode = (typeof NEWS_MODES)[number];
export const NEWS_TOPICS = [
  "projects",
  "works",
  "stations",
  "vehicles",
  "service",
  "urbanism",
  "realEstate",
  "disruptions",
  "strikes",
  "general",
] as const;
export type NewsTopic = (typeof NEWS_TOPICS)[number];
export const DEFAULT_NEWS_TOPICS: NewsTopic[] = [
  "projects",
  "works",
  "stations",
  "vehicles",
  "service",
  "urbanism",
  "realEstate",
];
export interface NewsLine {
  mode: NewsMode;
  code: string;
}
export interface NewsSource {
  id: string;
  name: string;
  url: string;
  method: "rss" | "html" | "article";
  kind: "official" | "press";
  modes: NewsMode[];
  lines?: NewsLine[];
  /** Primary themes advertised by this source, when its publisher has a clear focus. */
  topics?: NewsTopic[];
  /** Exact towns covered by a municipality-specific source. */
  areas?: string[];
  regional: boolean;
  articlePath?: string;
}
export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  publishedAt?: string;
  excerpt: string;
  modes: NewsMode[];
  lines: NewsLine[];
  topics: NewsTopic[];
}
export type NewsSourceState = "ready" | "stale" | "unavailable" | "pending";
export interface NewsSourceResult {
  sourceId: string;
  articles: NewsArticle[];
  state: NewsSourceState;
  fetchedAt?: string;
  checkedAt: string;
  error?: "http" | "timeout" | "parse" | "network";
  httpStatus?: number;
}
export interface NewsPreferences {
  modes: NewsMode[];
  topics: NewsTopic[];
  disabledSources: string[];
}
export function normalizeNewsPreferences(value: unknown): NewsPreferences {
  const input = value && typeof value === "object" ? (value as Partial<NewsPreferences>) : {};
  const select = <T extends string>(
    raw: unknown,
    allowed: readonly T[],
    defaults: readonly T[],
  ): T[] =>
    Array.isArray(raw)
      ? [...new Set(raw.filter((item): item is T => allowed.includes(item as T)))]
      : [...defaults];
  return {
    modes: select(input.modes, NEWS_MODES, NEWS_MODES),
    topics: select(input.topics, NEWS_TOPICS, DEFAULT_NEWS_TOPICS),
    disabledSources: Array.isArray(input.disabledSources)
      ? [
          ...new Set(
            input.disabledSources.filter(
              (id): id is string => typeof id === "string" && /^[a-z0-9-]{1,100}$/.test(id),
            ),
          ),
        ].slice(0, 500)
      : [],
  };
}
