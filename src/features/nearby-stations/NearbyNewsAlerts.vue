<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Bell, ExternalLink, RefreshCw, X } from "lucide-vue-next";
import { toServerApiUrl } from "../../services/serverApi";
import { useAppSettings } from "../app-settings/appSettings";
import { useI18n } from "../../i18n";
import { mergeNewsArticles, sameNewsLine } from "../transport-news/filter";
import { NEWS_SOURCES } from "../transport-news/sources";
import { isNearbyNewsArticle } from "./nearbyNewsAlerts";
import type { NewsArticle, NewsLine, NewsSource, NewsSourceResult } from "../transport-news/types";

const props = defineProps<{ lines: readonly NewsLine[]; localities: readonly string[] }>();
const { t, d } = useI18n();
const { settings } = useAppSettings();
const dialog = ref<HTMLDialogElement>();
const panelOpen = ref(false);
const loading = ref(false);
const catalogUnavailable = ref(false);
const pageSize = ref(12);
const completed = ref(0);
const total = ref(0);
const sources = ref<NewsSource[]>(NEWS_SOURCES);
const results = ref<Record<string, NewsSourceResult>>({});
const seenUrls = ref<Set<string>>(new Set());
const unreadWindowMs = 30 * 24 * 60 * 60 * 1_000;
let controller: AbortController | undefined;
let requestGeneration = 0;
let scopeRefreshTimer: ReturnType<typeof setTimeout> | undefined;

function readSeenUrls(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(-3_000) : []);
  } catch {
    return new Set();
  }
}

function normalizedPlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const localityKeys = computed(() => [...new Set(props.localities.map(normalizedPlace).filter(Boolean))]);
const seenStorageKey = computed(() => {
  const parts = [
    ...localityKeys.value.map((place) => `area:${place}`),
    ...props.lines.map((line) => `line:${line.mode}:${line.code}`).sort(),
  ].sort();
  let hash = 2_166_136_261;
  for (const character of parts.join("|")) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return `transportclock.nearby-news-seen.v1:${(hash >>> 0).toString(36)}`;
});
const preferences = computed(() => settings.value.transportNews);
const selectedSources = computed(() => {
  const lineModes = new Set(props.lines.map((line) => line.mode));
  const activeTopics = new Set(preferences.value.topics);
  const candidates = sources.value
    .filter((source) => !preferences.value.disabledSources.includes(source.id))
    .flatMap((source) => {
      const lineMatch = source.lines?.some((sourceLine) =>
        props.lines.some((line) => sameNewsLine(line, sourceLine)),
      ) ?? false;
      const areaMatch = source.areas?.some((area) => localityKeys.value.includes(normalizedPlace(area))) ?? false;
      const topicMatch = source.topics?.some((topic) => activeTopics.has(topic)) ?? false;
      const broadLineMatch = source.regional
        && !source.lines?.length
        && source.modes.some((mode) => lineModes.has(mode) && preferences.value.modes.includes(mode));
      if (!lineMatch && !areaMatch && !topicMatch && !broadLineMatch) return [];
      const score = (lineMatch ? 100 : 0) + (areaMatch ? 80 : 0) + (topicMatch ? 60 : 0) + (broadLineMatch ? 20 : 0);
      return [{ source, score }];
    })
    .sort((a, b) => b.score - a.score || a.source.name.localeCompare(b.source.name, "fr-FR"));
  return candidates.slice(0, 18).map(({ source }) => source);
});
const allArticles = computed(() => mergeNewsArticles(Object.values(results.value).flatMap((result) => result.articles)));

const articles = computed(() => allArticles.value.filter((article) =>
  isNearbyNewsArticle(article, props, sources.value, preferences.value),
));
const visibleArticles = computed(() => articles.value.slice(0, pageSize.value));
const unreadCount = computed(() => {
  const since = Date.now() - unreadWindowMs;
  return articles.value.filter((article) => {
    const publishedAt = Date.parse(article.publishedAt ?? "");
    return Number.isFinite(publishedAt)
      && publishedAt >= since
      && publishedAt <= Date.now() + 5 * 60_000
      && !seenUrls.value.has(article.url);
  }).length;
});
const failedSourceCount = computed(() => Object.values(results.value).filter(
  (result) => result.state === "stale" || result.state === "unavailable",
).length);
const sourceLabel = (id: string) => sources.value.find((source) => source.id === id)?.name ?? id;
const isArticleUnread = (article: NewsArticle) => {
  const publishedAt = Date.parse(article.publishedAt ?? "");
  return Number.isFinite(publishedAt)
    && publishedAt >= Date.now() - unreadWindowMs
    && !seenUrls.value.has(article.url);
};

function markVisibleRead() {
  const merged = new Set(seenUrls.value);
  articles.value.forEach((article) => merged.add(article.url));
  seenUrls.value = new Set([...merged].slice(-3_000));
  try {
    window.localStorage.setItem(seenStorageKey.value, JSON.stringify([...seenUrls.value]));
  } catch {
    // The feed remains usable if browser storage is unavailable.
  }
}

async function load(refresh = false) {
  const generation = ++requestGeneration;
  controller?.abort();
  const nextController = new AbortController();
  controller = nextController;
  loading.value = true;
  completed.value = 0;
  try {
    const response = await fetch(toServerApiUrl("/api/transport-news/sources"), { signal: nextController.signal });
    if (!response.ok) throw new Error("catalog");
    const catalog = await response.json() as { sources?: NewsSource[]; catalogState?: string };
    if (generation !== requestGeneration) return;
    if (catalog.sources?.length) sources.value = catalog.sources;
    catalogUnavailable.value = catalog.catalogState === "unavailable";
  } catch {
    if (nextController.signal.aborted) return;
    catalogUnavailable.value = true;
  }
  const queue = [...selectedSources.value];
  total.value = queue.length;
  const worker = async () => {
    while (queue.length && !nextController.signal.aborted) {
      const source = queue.shift();
      if (!source) continue;
      try {
        const suffix = refresh ? "&refresh=1" : "";
        const response = await fetch(
          toServerApiUrl(`/api/transport-news/articles?sourceId=${encodeURIComponent(source.id)}${suffix}`),
          { signal: nextController.signal },
        );
        if (!response.ok) throw new Error("source");
        const result = await response.json() as NewsSourceResult;
        if (generation === requestGeneration) results.value = { ...results.value, [source.id]: result };
      } catch {
        if (!nextController.signal.aborted && generation === requestGeneration) {
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
        if (generation === requestGeneration) completed.value++;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (generation === requestGeneration) loading.value = false;
}

async function openPanel() {
  panelOpen.value = true;
  await nextTick();
  if (dialog.value && !dialog.value.open) dialog.value.showModal();
  markVisibleRead();
  if (!loading.value) void load(false);
}

function closePanel() {
  if (dialog.value?.open) dialog.value.close();
  panelOpen.value = false;
}

function onDialogClose() {
  panelOpen.value = false;
}

watch(
  seenStorageKey,
  (key) => { seenUrls.value = readSeenUrls(key); },
);
watch(
  () => `${props.lines.map((line) => `${line.mode}:${line.code}`).sort().join(",")}|${localityKeys.value.join(",")}|${preferences.value.modes.join(",")}|${preferences.value.topics.join(",")}|${preferences.value.disabledSources.join(",")}`,
  () => {
    if (!controller) return;
    clearTimeout(scopeRefreshTimer);
    scopeRefreshTimer = setTimeout(() => { void load(false); }, 250);
  },
);
onMounted(() => {
  seenUrls.value = readSeenUrls(seenStorageKey.value);
  void load(false);
});
onBeforeUnmount(() => {
  requestGeneration++;
  clearTimeout(scopeRefreshTimer);
  controller?.abort();
  if (dialog.value?.open) dialog.value.close();
});
</script>

<template>
  <button
    class="nearby-news__trigger"
    type="button"
    :aria-label="t('nearbyNews.buttonAria', { count: unreadCount })"
    :title="t('nearbyNews.button')"
    :aria-haspopup="'dialog'"
    :aria-expanded="panelOpen"
    @click.stop="openPanel"
  >
    <Bell :size="18" aria-hidden="true" />
    <span v-if="unreadCount" class="nearby-news__badge" aria-hidden="true">{{ unreadCount > 99 ? "99+" : unreadCount }}</span>
  </button>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="nearby-news__dialog"
      :aria-label="t('nearbyNews.title')"
      @close="onDialogClose"
      @click="($event.target === dialog) && closePanel()"
    >
      <header class="nearby-news__header">
        <div>
          <p class="nearby-news__eyebrow">{{ t('nearbyNews.button') }}</p>
          <h2>{{ t('nearbyNews.title') }}</h2>
        </div>
        <div class="nearby-news__header-actions">
          <button class="nearby-news__icon-button" type="button" :disabled="loading" :aria-label="t('nearbyNews.refresh')" @click="load(true)">
            <RefreshCw :size="18" :class="{ 'nearby-news__spin': loading }" aria-hidden="true" />
          </button>
          <button class="nearby-news__icon-button" type="button" :aria-label="t('nearbyNews.close')" @click="closePanel">
            <X :size="20" aria-hidden="true" />
          </button>
        </div>
      </header>
      <p class="nearby-news__description">{{ t('nearbyNews.description') }}</p>
      <div v-if="props.lines.length || props.localities.length" class="nearby-news__scope">
        <span v-if="props.lines.length"><strong>{{ t('nearbyNews.lines') }} :</strong> {{ props.lines.map((line) => `${t(`news.modes.${line.mode}`)} ${line.code}`).join(' · ') }}</span>
        <span v-if="props.localities.length"><strong>{{ t('nearbyNews.areas') }} :</strong> {{ props.localities.join(' · ') }}</span>
      </div>
      <p v-if="loading" class="nearby-news__status" role="status" aria-live="polite">
        <RefreshCw :size="15" class="nearby-news__spin" aria-hidden="true" />
        {{ t('nearbyNews.loading') }} <span v-if="total">{{ completed }} / {{ total }}</span>
      </p>
      <p v-if="(failedSourceCount || catalogUnavailable) && !loading" class="nearby-news__notice" role="status">{{ t('nearbyNews.partial') }}</p>
      <p v-if="!props.lines.length && !props.localities.length" class="nearby-news__empty">{{ t('nearbyNews.noScope') }}</p>
      <section v-else-if="articles.length" class="nearby-news__articles" :aria-label="t('nearbyNews.title')">
        <article v-for="article in visibleArticles" :key="article.url" class="nearby-news__article">
          <div class="nearby-news__meta">
            <span>{{ sourceLabel(article.sourceId) }}</span>
            <time v-if="article.publishedAt" :datetime="article.publishedAt">{{ d(article.publishedAt, { dateStyle: 'medium' }) }}</time>
            <span v-else>{{ t('nearbyNews.dateMissing') }}</span>
          </div>
          <h3><a :href="article.url" target="_blank" rel="noopener noreferrer">{{ article.title }} <ExternalLink :size="14" aria-hidden="true" /></a></h3>
          <p v-if="article.excerpt">{{ article.excerpt }}</p>
          <div class="nearby-news__tags">
            <span v-for="line in article.lines.filter((candidate) => props.lines.some((nearbyLine) => sameNewsLine(candidate, nearbyLine)))" :key="`${line.mode}:${line.code}`" class="nearby-news__tag">{{ t(`news.modes.${line.mode}`) }} {{ line.code }}</span>
            <span v-for="topic in article.topics" :key="topic" class="nearby-news__topic">{{ t(`news.topics.${topic}`) }}</span>
            <span v-if="isArticleUnread(article)" class="nearby-news__new">{{ t('nearbyNews.new') }}</span>
          </div>
          <small v-if="results[article.sourceId]?.state === 'stale'">{{ t('nearbyNews.sourceStale') }}</small>
        </article>
        <button v-if="articles.length > pageSize" class="nearby-news__more" type="button" @click="pageSize += 12">{{ t('nearbyNews.more') }}</button>
      </section>
      <div v-else-if="!loading" class="nearby-news__empty">
        <Bell :size="28" aria-hidden="true" />
        <h3>{{ t('nearbyNews.empty') }}</h3>
        <p>{{ t('nearbyNews.emptyDescription') }}</p>
      </div>
      <details class="nearby-news__sources">
        <summary>{{ t('nearbyNews.sources') }} <span>({{ selectedSources.length }})</span></summary>
        <ul>
          <li v-for="source in selectedSources" :key="source.id">
            <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.name }}</a>
            <span v-if="results[source.id]?.state === 'unavailable'">{{ t('nearbyNews.sourceUnavailable') }}</span>
            <span v-else-if="results[source.id]?.state === 'stale'">{{ t('nearbyNews.sourceStale') }}</span>
            <span v-else-if="results[source.id]?.state === 'ready'">{{ t('news.states.ready') }}</span>
            <span v-else>{{ t('news.states.pending') }}</span>
          </li>
        </ul>
      </details>
    </dialog>
  </Teleport>
</template>

<style scoped>
.nearby-news__trigger { align-items: center; background: rgba(255,255,255,.94); border: 1px solid rgba(81,70,255,.18); border-radius: 10px; color: #4034df; cursor: pointer; display: inline-flex; flex: 0 0 38px; height: 38px; justify-content: center; padding: 0; position: relative; width: 38px; }
.nearby-news__trigger:hover, .nearby-news__trigger:focus-visible { background: #fff; outline: 2px solid rgba(81,70,255,.3); outline-offset: 2px; }
.nearby-news__badge { align-items: center; background: #d32f2f; border: 2px solid white; border-radius: 999px; color: white; display: inline-flex; font-size: .59rem; font-variant-numeric: tabular-nums; font-weight: 900; height: 18px; justify-content: center; line-height: 1; min-width: 18px; padding-inline: 4px; position: absolute; right: -7px; top: -7px; }
.nearby-news__dialog { background: #f8faff; border: 1px solid rgba(37,99,235,.18); border-radius: 20px; box-shadow: 0 24px 80px rgba(15,23,42,.28); box-sizing: border-box; color: #16243a; display: grid; gap: 12px; grid-template-rows: auto auto auto minmax(0,1fr) auto; margin: auto; max-height: min(82dvh, 820px); max-width: min(640px, calc(100vw - 32px)); overflow: hidden; padding: 20px; width: 640px; }
.nearby-news__dialog:not([open]) { display: none; }
.nearby-news__dialog::backdrop { background: rgba(15,23,42,.42); backdrop-filter: blur(2px); }
.nearby-news__header { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
.nearby-news__eyebrow { color: #2563eb; font-size: .7rem; font-weight: 850; letter-spacing: .04em; margin: 0 0 3px; text-transform: uppercase; }
.nearby-news__header h2 { font-size: 1.2rem; line-height: 1.2; margin: 0; }
.nearby-news__header-actions { display: flex; gap: 7px; }
.nearby-news__icon-button { align-items: center; background: white; border: 1px solid #d9e2f0; border-radius: 11px; color: #304563; cursor: pointer; display: inline-flex; height: 38px; justify-content: center; width: 38px; }
.nearby-news__icon-button:disabled { cursor: wait; opacity: .6; }
.nearby-news__icon-button:focus-visible, .nearby-news__icon-button:hover { background: #eef4ff; outline: 2px solid rgba(37,99,235,.28); }
.nearby-news__description { color: #52627a; font-size: .82rem; line-height: 1.45; margin: 0; }
.nearby-news__scope { background: #eef4ff; border: 1px solid #d8e5fb; border-radius: 12px; color: #324967; display: grid; font-size: .73rem; gap: 4px; line-height: 1.35; padding: 9px 11px; }
.nearby-news__status, .nearby-news__notice { align-items: center; color: #52627a; display: flex; font-size: .78rem; gap: 8px; margin: 0; }
.nearby-news__notice { background: #fff8e8; border-radius: 9px; color: #7a5311; padding: 8px 10px; }
.nearby-news__articles { display: grid; gap: 10px; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 1px 2px 3px 1px; }
.nearby-news__article { background: white; border: 1px solid #e1e8f2; border-radius: 14px; box-shadow: 0 2px 8px rgba(29,55,90,.04); padding: 12px 13px; }
.nearby-news__meta { align-items: center; color: #64748b; display: flex; font-size: .68rem; font-weight: 720; gap: 8px; justify-content: space-between; }
.nearby-news__article h3 { font-size: .91rem; line-height: 1.35; margin: 7px 0 5px; }
.nearby-news__article h3 a { color: #152e54; text-decoration: none; }
.nearby-news__article h3 a:hover { color: #1d4ed8; text-decoration: underline; }
.nearby-news__article h3 svg { display: inline; vertical-align: -2px; }
.nearby-news__article > p { color: #4b5d73; font-size: .76rem; line-height: 1.45; margin: 0; }
.nearby-news__tags { align-items: center; display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.nearby-news__tag, .nearby-news__topic, .nearby-news__new { border-radius: 999px; font-size: .63rem; font-weight: 790; line-height: 1; padding: 5px 7px; }
.nearby-news__tag { background: #e9efff; color: #2c4c91; }
.nearby-news__topic { background: #edf7f1; color: #287249; }
.nearby-news__new { background: #ffebe9; color: #b42318; }
.nearby-news__article small { color: #91621a; display: block; font-size: .67rem; margin-top: 7px; }
.nearby-news__more { background: white; border: 1px solid #cddbef; border-radius: 10px; color: #2753a5; cursor: pointer; font: inherit; font-size: .79rem; font-weight: 800; min-height: 38px; }
.nearby-news__empty { align-content: center; color: #53657e; display: grid; gap: 7px; justify-items: center; min-height: 160px; padding: 12px; text-align: center; }
.nearby-news__empty h3 { color: #203653; font-size: .92rem; margin: 0; }
.nearby-news__empty p { font-size: .77rem; line-height: 1.45; margin: 0; max-width: 370px; }
.nearby-news__sources { border-top: 1px solid #dfe6f0; max-height: 130px; overflow: auto; padding-top: 9px; }
.nearby-news__sources summary { color: #435570; cursor: pointer; font-size: .74rem; font-weight: 800; }
.nearby-news__sources summary span { color: #748198; font-weight: 650; }
.nearby-news__sources ul { display: grid; gap: 5px; list-style: none; margin: 8px 0 0; padding: 0; }
.nearby-news__sources li { align-items: baseline; display: flex; font-size: .69rem; gap: 9px; justify-content: space-between; }
.nearby-news__sources a { color: #2753a5; }
.nearby-news__sources li span { color: #6c7788; white-space: nowrap; }
.nearby-news__spin { animation: nearby-news-spin 1.2s linear infinite; }
@keyframes nearby-news-spin { to { transform: rotate(360deg); } }
@media (max-width: 680px) {
  .nearby-news__dialog { border: 0; border-radius: 22px 22px 0 0; bottom: 0; box-shadow: 0 -14px 48px rgba(15,23,42,.24); left: 0; margin: 0; max-height: min(86dvh, 760px); max-width: none; padding: 17px 15px max(16px, env(safe-area-inset-bottom)); position: fixed; right: 0; top: auto; width: 100%; }
  .nearby-news__dialog::backdrop { background: rgba(15,23,42,.34); }
  .nearby-news__scope { font-size: .68rem; }
}
</style>
