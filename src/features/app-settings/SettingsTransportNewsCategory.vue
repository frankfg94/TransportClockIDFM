<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "../../i18n";
import { toServerApiUrl } from "../../services/serverApi";
import { NEWS_SOURCES } from "../transport-news/sources";
import {
  NEWS_MODES,
  NEWS_TOPICS,
  type NewsSource,
  type NewsSourceResult,
} from "../transport-news/types";
import type { AppSettings } from "./appSettings";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryProps, SettingsCategoryEmits } from "./settingsCategoryContract";
const props = defineProps<SettingsCategoryProps<Pick<AppSettings, "transportNews">>>();
const emit = defineEmits<SettingsCategoryEmits>();
const { t } = useI18n();
const sources = ref<NewsSource[]>(NEWS_SOURCES);
const statuses = ref<NewsSourceResult[]>([]);
const catalogUnavailable = ref(false);
const controller = new AbortController();
function toggle(key: "modes" | "topics" | "disabledSources", value: string, checked: boolean) {
  const prefs = props.settings.transportNews;
  const values = prefs[key] as string[];
  emit("update-settings", {
    transportNews: {
      ...prefs,
      [key]: checked ? [...new Set([...values, value])] : values.filter((item) => item !== value),
    },
  });
}
onMounted(async () => {
  try {
    const response = await fetch(toServerApiUrl("/api/transport-news/sources"), {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("catalog");
    const catalog = (await response.json()) as {
      sources: NewsSource[];
      statuses: NewsSourceResult[];
      catalogState: string;
    };
    if (!Array.isArray(catalog.sources)) throw new Error("catalog");
    sources.value = catalog.sources;
    statuses.value = catalog.statuses ?? [];
    catalogUnavailable.value = catalog.catalogState !== "ready";
  } catch {
    catalogUnavailable.value = true;
  }
});
onBeforeUnmount(() => controller.abort());
</script>
<template>
  <SettingsCategoryPanel
    title-id="settings-news-title"
    :eyebrow="t('news.eyebrow')"
    :title="t('news.title')"
    :panel-open="panelOpen"
    @toggle="emit('toggle')"
  >
    <p>{{ t("news.settingsDescription") }}</p>
    <fieldset v-if="isSettingVisible('feed.modes', 'feed')">
      <legend>{{ t("news.mode") }}</legend>
      <label v-for="mode in NEWS_MODES" :key="mode"
        ><input
          type="checkbox"
          :checked="settings.transportNews.modes.includes(mode)"
          @change="toggle('modes', mode, ($event.target as HTMLInputElement).checked)"
        />{{ t(`news.modes.${mode}`) }}</label
      >
    </fieldset>
    <fieldset v-if="isSettingVisible('feed.topics', 'feed')">
      <legend>{{ t("news.topic") }}</legend>
      <label v-for="topic in NEWS_TOPICS" :key="topic"
        ><input
          type="checkbox"
          :checked="settings.transportNews.topics.includes(topic)"
          @change="toggle('topics', topic, ($event.target as HTMLInputElement).checked)"
        />{{ t(`news.topics.${topic}`) }}</label
      >
    </fieldset>
    <fieldset v-if="isSettingVisible('feed.sources', 'feed')">
      <legend>{{ t("news.source") }}</legend>
      <p v-if="catalogUnavailable">{{ t("news.catalogUnavailable") }}</p>
      <label v-for="source in sources" :key="source.id"
        ><input
          type="checkbox"
          :checked="!settings.transportNews.disabledSources.includes(source.id)"
          @change="
            toggle('disabledSources', source.id, !($event.target as HTMLInputElement).checked)
          "
        /><span
          >{{ source.name
          }}<small>{{
            t(
              `news.states.${statuses.find((status) => status.sourceId === source.id)?.state ?? "pending"}`,
            )
          }}</small></span
        ></label
      >
    </fieldset>
  </SettingsCategoryPanel>
</template>
<style scoped>
fieldset {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin: 16px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}
legend {
  font-weight: 800;
  color: var(--ink);
  padding: 0 6px;
}
label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  min-width: 220px;
  flex: 1;
  font-size: 0.95rem;
}
input {
  width: 18px;
  height: 18px;
  accent-color: var(--idfm-blue);
  flex-shrink: 0;
}
small {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
}
p {
  color: var(--muted);
}
fieldset p {
  width: 100%;
}
</style>
