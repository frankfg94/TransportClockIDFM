<script setup lang="ts">
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
}
const props = defineProps<{
  modelValue: NewsFilterValues;
  sources: NewsSource[];
  lines: NewsLine[];
  preferences: NewsPreferences;
}>();
const emit = defineEmits<{ "update:modelValue": [value: NewsFilterValues] }>();
const { t } = useI18n();
function update(key: keyof NewsFilterValues, event: Event) {
  emit("update:modelValue", {
    ...props.modelValue,
    [key]: (event.target as HTMLInputElement).value,
  });
}
</script>
<template>
  <div class="news-filters">
    <label class="news-filters__search"
      ><span>{{ t("news.search") }}</span
      ><input
        type="search"
        :value="modelValue.query"
        :placeholder="t('news.searchPlaceholder')"
        @input="update('query', $event)"
    /></label>
    <label
      ><span>{{ t("news.mode") }}</span
      ><select :value="modelValue.mode" @change="update('mode', $event)">
        <option value="">{{ t("news.allModes") }}</option>
        <option
          v-for="mode in NEWS_MODES.filter((mode) => preferences.modes.includes(mode))"
          :key="mode"
          :value="mode"
        >
          {{ t(`news.modes.${mode}`) }}
        </option>
      </select></label
    >
    <label
      ><span>{{ t("news.line") }}</span
      ><select :value="modelValue.lineKey" @change="update('lineKey', $event)">
        <option value="">{{ t("news.allLines") }}</option>
        <option
          v-for="line in lines"
          :key="`${line.mode}:${line.code}`"
          :value="`${line.mode}:${line.code}`"
        >
          {{ t(`news.modes.${line.mode}`) }} {{ line.code }}
        </option>
      </select></label
    >
    <label
      ><span>{{ t("news.topic") }}</span
      ><select :value="modelValue.topic" @change="update('topic', $event)">
        <option value="">{{ t("news.allTopics") }}</option>
        <option
          v-for="topic in NEWS_TOPICS.filter((topic) => preferences.topics.includes(topic))"
          :key="topic"
          :value="topic"
        >
          {{ t(`news.topics.${topic}`) }}
        </option>
      </select></label
    >
    <label
      ><span>{{ t("news.source") }}</span
      ><select :value="modelValue.sourceId" @change="update('sourceId', $event)">
        <option value="">{{ t("news.allSources") }}</option>
        <option
          v-for="source in sources.filter(
            (source) => !preferences.disabledSources.includes(source.id),
          )"
          :key="source.id"
          :value="source.id"
        >
          {{ source.name }}
        </option>
      </select></label
    >
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
.news-filters input,
.news-filters select {
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
