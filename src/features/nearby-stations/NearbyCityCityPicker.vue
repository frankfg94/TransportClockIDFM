<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Search, X } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { NearbyCityComparisonCityOption } from "./nearbyCityComparison";

const props = defineProps<{
  title: string;
  description: string;
  searchLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  options: readonly NearbyCityComparisonCityOption[];
  selectedCode?: string;
}>();

const emit = defineEmits<{
  select: [cityCode: string];
  close: [];
}>();

const { n, t } = useI18n();
const query = ref("");
const searchInput = ref<HTMLInputElement>();

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

const filteredOptions = computed(() => {
  const needle = normalizeSearchValue(query.value);
  if (!needle) return props.options;
  return props.options.filter((option) => normalizeSearchValue([
    option.name,
    option.departmentName ?? "",
    option.departmentCode,
    option.code,
  ].join(" ")).includes(needle));
});

watch(() => props.options, () => {
  query.value = "";
});

onMounted(() => {
  searchInput.value?.focus();
});

function select(cityCode: string): void {
  if (!cityCode) return;
  emit("select", cityCode);
}

function close(): void {
  emit("close");
}
</script>

<template>
  <div class="nearby-city-picker" data-testid="nearby-city-picker">
    <header class="nearby-city-picker__header">
      <div>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
      <button
        type="button"
        class="nearby-city-picker__close"
        :aria-label="t('nearbyStations.cityComparison.close')"
        :title="t('nearbyStations.cityComparison.close')"
        data-testid="nearby-city-picker-close"
        @click="close"
      >
        <X :size="16" :stroke-width="2.5" aria-hidden="true" />
      </button>
    </header>

    <label class="nearby-city-picker__search">
      <Search :size="15" aria-hidden="true" />
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        autocomplete="off"
        :aria-label="searchLabel"
        :placeholder="searchPlaceholder"
        data-testid="nearby-city-picker-search"
      />
    </label>

    <p v-if="filteredOptions.length === 0" class="nearby-city-picker__empty">{{ emptyLabel }}</p>
    <ul v-else class="nearby-city-picker__list" role="listbox" :aria-label="searchLabel">
      <li v-for="option in filteredOptions" :key="option.code">
        <button
          type="button"
          role="option"
          class="nearby-city-picker__option"
          :class="{ 'nearby-city-picker__option--selected': option.code === selectedCode }"
          :aria-selected="option.code === selectedCode"
          :data-city-option="option.code"
          @click="select(option.code)"
        >
          <span class="nearby-city-picker__option-main">
            <strong>{{ option.name }}</strong>
            <small>{{ option.departmentName ?? option.departmentCode }}</small>
          </span>
          <small v-if="typeof option.population === 'number'" class="nearby-city-picker__option-meta">
            {{ n(Math.round(option.population)) }}
          </small>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.nearby-city-picker {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  min-height: 0;
}

.nearby-city-picker__header {
  align-items: start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.nearby-city-picker__header h3 {
  color: #18233f;
  font-size: .95rem;
  margin: 0;
}

.nearby-city-picker__header p {
  color: #64748b;
  font-size: .72rem;
  line-height: 1.4;
  margin: 4px 0 0;
}

.nearby-city-picker__close {
  align-items: center;
  appearance: none;
  background: #f7f8fc;
  border: 1px solid rgba(100, 116, 139, .2);
  border-radius: 9px;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  min-height: 32px;
  min-width: 32px;
}

.nearby-city-picker__close:hover,
.nearby-city-picker__close:focus-visible {
  background: #f0efff;
  border-color: rgba(81, 70, 255, .42);
  color: #5146ff;
  outline: 0;
}

.nearby-city-picker__search {
  align-items: center;
  background: #f8fafc;
  border: 1px solid rgba(100, 116, 139, .2);
  border-radius: 10px;
  color: #64748b;
  display: flex;
  gap: 8px;
  padding: 0 10px;
}

.nearby-city-picker__search:focus-within {
  background: #fff;
  border-color: rgba(81, 70, 255, .45);
  color: #5146ff;
}

.nearby-city-picker__search input {
  appearance: none;
  background: transparent;
  border: 0;
  color: #18233f;
  flex: 1 1 auto;
  font: inherit;
  font-size: .78rem;
  min-height: 38px;
  min-width: 0;
  outline: 0;
}

.nearby-city-picker__list {
  display: grid;
  gap: 3px;
  list-style: none;
  margin: 0;
  max-height: min(46vh, 320px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2px;
}

.nearby-city-picker__option {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9px;
  color: #18233f;
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: 10px;
  justify-content: space-between;
  min-height: 38px;
  padding: 6px 9px;
  text-align: left;
  width: 100%;
}

.nearby-city-picker__option:hover,
.nearby-city-picker__option:focus-visible {
  background: #f4f3ff;
  border-color: rgba(81, 70, 255, .28);
  outline: 0;
}

.nearby-city-picker__option--selected {
  background: #eef2ff;
  border-color: rgba(81, 70, 255, .45);
}

.nearby-city-picker__option-main {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 8px;
  min-width: 0;
}

.nearby-city-picker__option-main strong {
  font-size: .78rem;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.nearby-city-picker__option-main small,
.nearby-city-picker__option-meta {
  color: #64748b;
  font-size: .66rem;
}

.nearby-city-picker__option-meta {
  flex: 0 0 auto;
  white-space: nowrap;
}

.nearby-city-picker__empty {
  color: #64748b;
  font-size: .74rem;
  margin: 6px 0;
}
</style>
