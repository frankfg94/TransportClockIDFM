<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "#imports";
import { ExternalLink, RefreshCw, Rss, SlidersHorizontal, X } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import { useAppSettings } from "../app-settings/appSettings";
import { toServerApiUrl } from "../../services/serverApi";
import { NEWS_SOURCES } from "./sources";
import { filterNewsArticles, mergeNewsArticles, normalizeNewsLine, sameNewsLine } from "./filter";
import type { NewsLine, NewsMode, NewsSource, NewsSourceResult, NewsTopic } from "./types";
import NewsFilters, { type NewsFilterValues } from "./NewsFilters.vue";

const { t, d } = useI18n();
const { settings } = useAppSettings();
const route = useRoute();
const router = useRouter();
const sources = ref<NewsSource[]>(NEWS_SOURCES);
const results = ref<Record<string, NewsSourceResult>>({});
const filters = ref<NewsFilterValues>({
  query: "",
  mode: "",
  topic: "",
  sourceId: "",
  lineKey: "",
});
const pageSize = ref(30);
const loading = ref(false);
const completed = ref(0);
const total = ref(0);
const catalogUnavailable = ref(false);
const catalogError = ref(false);
const catalogErrorMessage = ref("");
const filterDialog = ref<HTMLDialogElement>();
let requestController: AbortController | undefined;
let generation = 0;
let mounted = false;
const selectedLine = computed(() => {
  const [mode, code] = filters.value.lineKey.split(":");
  return mode && code ? normalizeNewsLine(mode, code) : undefined;
});
const preferences = computed(() => ({
  ...settings.value.transportNews,
  modes: selectedLine.value
    ? [...new Set([...settings.value.transportNews.modes, selectedLine.value.mode])]
    : settings.value.transportNews.modes,
}));
const allArticles = computed(() =>
  mergeNewsArticles(Object.values(results.value).flatMap((result) => result.articles)),
);
const lines = computed(() => {
  const options: NewsLine[] = selectedLine.value ? [selectedLine.value] : [];
  allArticles.value.forEach((article) =>
    article.lines.forEach((line) => {
      if (!options.some((other) => sameNewsLine(other, line))) options.push(line);
    }),
  );
  return options.sort(
    (a, b) =>
      a.mode.localeCompare(b.mode) || a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
});
const articles = computed(() =>
  filterNewsArticles(allArticles.value, preferences.value, {
    query: filters.value.query,
    mode: (filters.value.mode as NewsMode) || undefined,
    topic: (filters.value.topic as NewsTopic) || undefined,
    sourceId: filters.value.sourceId || undefined,
    line: selectedLine.value,
  }),
);
const visibleArticles = computed(() => articles.value.slice(0, pageSize.value));
const failures = computed(
  () =>
    Object.values(results.value).filter(
      (result) => result.state === "unavailable" || result.state === "stale",
    ).length,
);
const enabledSources = computed(() =>
  sources.value.filter(
    (source) =>
      !preferences.value.disabledSources.includes(source.id) &&
      source.modes.some((mode) => preferences.value.modes.includes(mode)),
  ),
);
const sourceName = (id: string) => sources.value.find((source) => source.id === id)?.name ?? id;
function applyRoute() {
  const mode = typeof route.query.mode === "string" ? route.query.mode : "";
  const code = typeof route.query.line === "string" ? route.query.line : "";
  const line = normalizeNewsLine(mode, code);
  filters.value = { ...filters.value, mode: "", lineKey: line ? `${line.mode}:${line.code}` : "" };
}
async function clearLine() {
  filters.value = { ...filters.value, mode: "", lineKey: "" };
  if (route.query.line) await router.replace({ path: "/feed", query: {} });
}
async function load(refresh = false) {
  const run = ++generation;
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  loading.value = true;
  completed.value = 0;
  catalogError.value = false;
  catalogErrorMessage.value = "";
  try {
    const response = await fetch(toServerApiUrl("/api/transport-news/sources"), {
      signal: controller.signal,
    });
    const catalog = (await response.json().catch(() => null)) as
      | {
          sources?: NewsSource[];
          catalogState?: string;
          catalogErrorMessage?: string;
          message?: string;
          detail?: string;
        }
      | null;
    if (!response.ok) {
      throw new Error(
        [catalog?.message, catalog?.detail]
          .filter((message): message is string => Boolean(message))
          .join(" ") || t("news.catalogRequestFailed", { status: response.status }),
      );
    }
    if (!catalog || !Array.isArray(catalog.sources)) {
      throw new Error(t("news.catalogInvalidResponse"));
    }
    if (run !== generation) return;
    sources.value = catalog.sources;
    catalogUnavailable.value = catalog.catalogState !== "ready";
    catalogErrorMessage.value = catalog.catalogErrorMessage ?? "";
  } catch (error) {
    if (controller.signal.aborted) return;
    catalogError.value = true;
    catalogErrorMessage.value =
      error instanceof Error ? error.message : t("news.catalogInvalidResponse");
  }
  const queue = [...enabledSources.value];
  // A line-specific source is displayed first, while the other sources continue progressively.
  queue.sort(
    (a, b) =>
      Number(
        Boolean(
          b.lines?.some((line) => selectedLine.value && sameNewsLine(line, selectedLine.value)),
        ),
      ) -
      Number(
        Boolean(
          a.lines?.some((line) => selectedLine.value && sameNewsLine(line, selectedLine.value)),
        ),
      ),
  );
  total.value = queue.length;
  const worker = async () => {
    while (queue.length && !controller.signal.aborted) {
      const source = queue.shift()!;
      try {
        const response = await fetch(
          toServerApiUrl(
            `/api/transport-news/articles?sourceId=${encodeURIComponent(source.id)}${refresh ? "&refresh=1" : ""}`,
          ),
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("source");
        const result = (await response.json()) as NewsSourceResult;
        if (run === generation) results.value = { ...results.value, [source.id]: result };
      } catch {
        if (!controller.signal.aborted && run === generation) {
          const previous = results.value[source.id];
          results.value = {
            ...results.value,
            [source.id]: {
              sourceId: source.id,
              articles: previous?.articles ?? [],
              fetchedAt: previous?.fetchedAt,
              checkedAt: new Date().toISOString(),
              state: previous?.fetchedAt ? "stale" : "unavailable",
              error: "network",
            },
          };
        }
      } finally {
        if (run === generation) completed.value++;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (run === generation) loading.value = false;
}
function openFilters() {
  filterDialog.value?.showModal();
}
watch(() => [route.query.mode, route.query.line], applyRoute, { immediate: true });
watch(
  filters,
  () => {
    pageSize.value = 30;
  },
  { deep: true },
);
watch(
  () => [settings.value.transportNews, selectedLine.value?.mode],
  () => {
    if (mounted) void load();
  },
  { deep: true },
);
onMounted(async () => {
  mounted = true;
  await nextTick();
  void load();
});
onBeforeUnmount(() => {
  mounted = false;
  generation++;
  requestController?.abort();
  filterDialog.value?.close();
});
</script>
<template>
  <main class="news-page">
    <header class="news-page__heading">
      <div>
        <p class="eyebrow"><Rss :size="16" aria-hidden="true" /> {{ t("news.eyebrow") }}</p>
        <h1>{{ t("news.title") }}</h1>
        <p class="news-page__subtitle">{{ t("news.description") }}</p>
      </div>
      <button type="button" class="news-page__refresh" :disabled="loading" @click="load(true)">
        <RefreshCw :size="18" :class="{ 'news-spin': loading }" aria-hidden="true" />{{
          t("news.refresh")
        }}
      </button>
    </header>
    <section class="news-page__toolbar" :aria-label="t('news.filters')">
      <div class="news-page__desktop-filters">
        <NewsFilters
          v-model="filters"
          :sources="sources"
          :lines="lines"
          :preferences="preferences"
        />
      </div>
      <button class="news-page__mobile-filters" type="button" @click="openFilters">
        <SlidersHorizontal :size="18" aria-hidden="true" />{{ t("news.filters") }}
      </button>
      <div class="news-page__summary">
        <span>{{ t("news.articleCount", { count: articles.length }) }}</span
        ><NuxtLink to="/settings">{{ t("news.configure") }}</NuxtLink>
      </div>
      <button
        v-if="selectedLine"
        class="news-chip news-chip--selected"
        type="button"
        @click="clearLine"
      >
        {{ t(`news.modes.${selectedLine.mode}`) }} {{ selectedLine.code
        }}<X :size="16" :aria-label="t('news.clearLine')" />
      </button>
    </section>
    <div v-if="loading" class="news-page__progress" role="status" aria-live="polite">
      <progress :value="completed" :max="Math.max(total, 1)" />{{
        t("news.loading", { count: completed, total })
      }}
    </div>
    <p
      v-if="failures || catalogUnavailable || catalogError"
      class="news-page__notice"
      role="status"
    >
      {{
        catalogErrorMessage
          ? t("news.catalogFailure", { message: catalogErrorMessage })
          : t("news.partial")
      }}
    </p>
    <section class="news-page__articles" :aria-label="t('news.title')" :aria-busy="loading">
      <article v-for="article in visibleArticles" :key="article.url" class="news-card">
        <div class="news-card__meta">
          <span>{{ sourceName(article.sourceId) }}</span
          ><time v-if="article.publishedAt" :datetime="article.publishedAt">{{
            d(new Date(article.publishedAt), { dateStyle: "medium" })
          }}</time
          ><span v-else>{{ t("news.dateMissing") }}</span>
        </div>
        <h2>
          <a :href="article.url" target="_blank" rel="noopener noreferrer"
            >{{ article.title }}<ExternalLink :size="16" aria-hidden="true"
          /></a>
        </h2>
        <p v-if="article.excerpt">{{ article.excerpt }}</p>
        <div class="news-card__tags">
          <button
            v-for="line in article.lines"
            :key="`${line.mode}:${line.code}`"
            type="button"
            class="news-chip"
            @click="filters = { ...filters, mode: '', lineKey: `${line.mode}:${line.code}` }"
          >
            {{ t(`news.modes.${line.mode}`) }} {{ line.code }}</button
          ><span v-for="topic in article.topics" :key="topic" class="news-card__topic">{{
            t(`news.topics.${topic}`)
          }}</span>
        </div>
        <small v-if="results[article.sourceId]?.state === 'stale'">{{ t("news.stale") }}</small>
      </article>
      <div v-if="!loading && !articles.length" class="news-page__empty">
        <Rss :size="32" aria-hidden="true" />
        <h2>{{ t("news.empty") }}</h2>
        <p>{{ t("news.emptyDescription") }}</p>
        <NuxtLink to="/settings">{{ t("news.configure") }}</NuxtLink>
      </div>
      <div v-if="loading && !allArticles.length" class="news-page__skeleton" aria-hidden="true">
        <div v-for="index in 3" :key="index"></div>
      </div>
    </section>
    <button
      v-if="articles.length > pageSize"
      class="news-page__more"
      type="button"
      @click="pageSize += 30"
    >
      {{ t("news.more") }}
    </button>
    <details class="news-page__sources">
      <summary>{{ t("news.sourceStatus") }}</summary>
      <p v-if="catalogUnavailable">{{ t("news.catalogUnavailable") }}</p>
      <ul>
        <li v-for="source in sources" :key="source.id">
          <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.name }}</a
          ><span
            >{{ source.method === "rss" ? "RSS" : t("news.webPage") }} ·
            {{
              preferences.disabledSources.includes(source.id)
                ? t("news.disabled")
                : t(`news.states.${results[source.id]?.state ?? "pending"}`)
            }}<template v-if="results[source.id]?.httpStatus">
              (HTTP {{ results[source.id]?.httpStatus }})</template
            ></span
          ><small v-if="results[source.id]?.fetchedAt"
            >{{ t("news.lastFetched") }}
            {{
              d(new Date(results[source.id]!.fetchedAt!), {
                dateStyle: "short",
                timeStyle: "short",
              })
            }}</small
          >
        </li>
      </ul>
    </details>
    <dialog
      ref="filterDialog"
      class="news-filter-dialog"
      :aria-label="t('news.filters')"
      @click="$event.target === filterDialog && filterDialog?.close()"
    >
      <header>
        <h2>{{ t("news.filters") }}</h2>
        <button
          type="button"
          :aria-label="t('common.actions.close')"
          @click="filterDialog?.close()"
        >
          <X :size="20" />
        </button>
      </header>
      <NewsFilters
        v-model="filters"
        :sources="sources"
        :lines="lines"
        :preferences="preferences"
      /><button class="news-filter-dialog__apply" type="button" @click="filterDialog?.close()">
        {{ t("news.showResults", { count: articles.length }) }}
      </button>
    </dialog>
  </main>
</template>
<style scoped>
.news-page {
  max-width: var(--content-max-width);
  margin: auto;
  padding: 32px 20px 110px;
  color: var(--ink);
}
.news-page__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}
.news-page h1 {
  margin: 8px 0;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}
.news-page .eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--idfm-blue);
}
.news-page__subtitle {
  color: var(--muted);
  max-width: 650px;
  margin: 0;
}
.news-page__refresh,
.news-page__mobile-filters,
.news-page__more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  border-radius: var(--radius-pill);
  padding: 10px 18px;
  background: var(--idfm-blue);
  color: var(--surface);
  border: 0;
  font: inherit;
  font-weight: 700;
}
.news-page__toolbar {
  background: var(--surface);
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}
.news-page__summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
  color: var(--muted);
  font-size: 0.9rem;
}
.news-page a {
  color: var(--idfm-blue);
}
.news-page__mobile-filters {
  display: none;
}
.news-page__progress {
  display: grid;
  gap: 8px;
  color: var(--muted);
  font-size: 0.9rem;
  margin-bottom: 16px;
}
.news-page__progress progress {
  width: 100%;
  height: 6px;
  accent-color: var(--idfm-blue);
}
.news-page__notice {
  padding: 12px 16px;
  background: var(--surface);
  border-left: 3px solid var(--warning);
  border-radius: var(--radius-sm);
}
.news-page__articles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.news-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: 22px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.news-card__meta {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--muted);
}
.news-card h2 {
  font-size: 1.2rem;
  line-height: 1.35;
  margin: 14px 0 10px;
}
.news-card h2 a {
  color: var(--ink);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.news-card h2 a:hover {
  color: var(--idfm-blue);
  text-decoration: underline;
}
.news-card h2 svg {
  margin-left: 8px;
  color: var(--muted);
}
.news-card p {
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.55;
  margin: 0 0 16px;
}
.news-card__tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}
.news-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-soft);
  color: var(--ink);
  padding: 6px 10px;
  min-height: 32px;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
}
.news-chip--selected {
  background: var(--surface-muted);
  color: var(--idfm-blue);
  margin-top: 12px;
}
.news-card__topic {
  font-size: 0.76rem;
  color: var(--muted);
  padding: 7px 0;
}
.news-card small {
  color: var(--warning);
  margin-top: 12px;
}
.news-page__empty {
  grid-column: 1/-1;
  text-align: center;
  padding: 48px 20px;
  color: var(--muted);
}
.news-page__more {
  margin: 24px auto;
}
.news-page__sources {
  margin-top: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  padding: 18px;
}
.news-page__sources summary {
  cursor: pointer;
  font-weight: 700;
  min-height: 28px;
}
.news-page__sources ul {
  list-style: none;
  padding: 0;
}
.news-page__sources li {
  display: flex;
  gap: 8px 16px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}
.news-page__sources li span,
.news-page__sources li small {
  color: var(--muted);
}
.news-page__skeleton {
  grid-column: 1/-1;
  display: grid;
  gap: 16px;
}
.news-page__skeleton div {
  min-height: 150px;
  border-radius: var(--radius-md);
  background: var(--surface);
}
.news-filter-dialog {
  border: 0;
  border-radius: 16px 16px 0 0;
  padding: 24px;
  width: 100%;
  max-width: 640px;
  max-height: 85dvh;
  overflow: auto;
  margin: auto auto 0;
  color: var(--ink);
  background: var(--surface);
  box-shadow: var(--shadow-modal);
}
.news-filter-dialog::backdrop {
  background: rgba(16, 35, 63, 0.45);
}
.news-filter-dialog header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.news-filter-dialog header button {
  min-width: 44px;
  min-height: 44px;
  background: var(--surface-muted);
  color: var(--ink);
  border: 0;
  border-radius: var(--radius-pill);
}
.news-filter-dialog__apply {
  margin-top: 20px;
  width: 100%;
  min-height: 44px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--idfm-blue);
  color: var(--surface);
  font: inherit;
  font-weight: 700;
}
.news-spin {
  animation: news-spin 1s linear infinite;
}
@keyframes news-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 640px) {
  .news-page {
    padding: 20px 12px 100px;
  }
  .news-page__heading {
    flex-wrap: wrap;
  }
  .news-page__articles {
    grid-template-columns: 1fr;
  }
  .news-page__desktop-filters {
    display: none;
  }
  .news-page__mobile-filters {
    display: flex;
    width: 100%;
  }
  .news-card {
    padding: 18px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .news-spin {
    animation: none;
  }
}
</style>
