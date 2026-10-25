<script setup lang="ts">
import { computed } from "vue";
import MaterialCombobox from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import {
  NEWS_MODES,
  NEWS_TOPICS,
  type NewsSource,
  type NewsLine,
  type NewsPreferences,
} from "./types";
export interface NewsFilterValues {
  query: string;
  mode: string;
  topic: string;
  sourceId: string;
  lineKey: string;
  period: string;
}
const props = defineProps<{
  modelValue: NewsFilterValues;
  sources: NewsSource[];
  lines: NewsLine[];
  preferences: NewsPreferences;
}>();
const emit = defineEmits<{ "update:modelValue": [value: NewsFilterValues] }>();
const { t } = useI18n();
function update(key: keyof NewsFilterValues, value: string) {
  emit("update:modelValue", {
    ...props.modelValue,
    [key]: value,
  });
}
const filters = computed(() => [
  { key: "period" as const, label: t("news.period"), options: [
    { id: "30", label: t("news.last30Days") }, { id: "90", label: t("news.last90Days") }, { id: "all", label: t("news.allDates") },
  ] },
  { key: "mode" as const, label: t("news.mode"), options: [
    { id: "", label: t("news.allModes") }, ...NEWS_MODES.filter(mode => props.preferences.modes.includes(mode)).map(mode => ({ id: mode, label: t(`news.modes.${mode}`) })),
  ] },
  { key: "lineKey" as const, label: t("news.line"), options: [
    { id: "", label: t("news.allLines") }, ...props.lines.map(line => ({ id: `${line.mode}:${line.code}`, label: `${t(`news.modes.${line.mode}`)} ${line.code}` })),
  ] },
  { key: "topic" as const, label: t("news.topic"), options: [
    { id: "", label: t("news.allTopics") }, ...NEWS_TOPICS.filter(topic => props.preferences.topics.includes(topic)).map(topic => ({ id: topic, label: t(`news.topics.${topic}`) })),
  ] },
  { key: "sourceId" as const, label: t("news.source"), options: [
    { id: "", label: t("news.allSources") }, ...props.sources.filter(source => !props.preferences.disabledSources.includes(source.id)).map(source => ({ id: source.id, label: source.name })),
  ] },
]);
</script>
<template>
  <div class="news-filters">
    <label class="news-filters__search"
      ><span>{{ t("news.search") }}</span
      ><input
        type="search"
        :value="modelValue.query"
        :placeholder="t('news.searchPlaceholder')"
        @input="update('query', ($event.target as HTMLInputElement).value)"
    /></label>
    <label v-for="filter in filters" :key="filter.key">
      <span>{{ filter.label }}</span>
      <MaterialCombobox
        :model-value="modelValue[filter.key]"
        :options="filter.options"
        :aria-label="filter.label"
        :data-news-filter="filter.key"
        teleport
        @update:model-value="update(filter.key, $event)"
      />
    </label>
  </div>
</template>
<style scoped>
.news-filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}
.news-filters label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
  min-width: 0;
}
.news-filters__search {
  grid-column: 1/-1;
}
.news-filters input {
  width: 100%;
  min-width: 0;
  height: var(--control-height);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  padding: 0 12px;
  color: var(--ink);
  font: inherit;
}
@media (max-width: 640px) {
  .news-filters {
    grid-template-columns: 1fr;
  }
}
</style>
