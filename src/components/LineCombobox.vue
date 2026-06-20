<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import LineIconBadge from "./LineIconBadge.vue";
import type { LineSearchOption } from "../types/transit";

const props = defineProps<{
  options: LineSearchOption[];
  modelValue?: LineSearchOption;
  query: string;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  enableGrid?: boolean;
  compact?: boolean;
  inline?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [line?: LineSearchOption];
  "update:query": [query: string];
}>();

const open = ref(false);
const editing = ref(false);
const searchInput = ref<HTMLInputElement>();
let blurTimer: number | undefined;

const buttonLabel = computed(() =>
  props.modelValue
    ? getLineDisplayName(props.modelValue)
    : (props.placeholder ?? "S\u00e9lectionner une ligne"),
);
const compactSelection = computed(
  () => props.compact && Boolean(props.modelValue) && !editing.value,
);
const showSearch = computed(() => props.inline || !compactSelection.value);

onBeforeUnmount(() => {
  if (blurTimer) {
    window.clearTimeout(blurTimer);
  }
});

function setOpen(value: boolean): void {
  if (blurTimer) {
    window.clearTimeout(blurTimer);
    blurTimer = undefined;
  }

  open.value = value;
}

function toggleOpen(): void {
  setOpen(!open.value);
}

function scheduleClose(): void {
  if (blurTimer) {
    window.clearTimeout(blurTimer);
  }

  blurTimer = window.setTimeout(() => {
    open.value = false;
  }, 140);
}

function selectLine(line: LineSearchOption): void {
  emit("update:modelValue", line);
  emit("update:query", getLineDisplayName(line));
  editing.value = false;
  open.value = false;
}

function updateQuery(event: Event): void {
  emit("update:query", (event.target as HTMLInputElement).value);
  emit("update:modelValue", undefined);
  setOpen(true);
}

function beginEditing(): void {
  editing.value = true;
  void nextTick(() => {
    searchInput.value?.focus();
  });
}

function handleButtonPointerDown(event: PointerEvent): void {
  event.preventDefault();

  if (compactSelection.value) {
    beginEditing();
    return;
  }

  toggleOpen();
}

function handleButtonClick(event: MouseEvent): void {
  if (event.detail !== 0) {
    return;
  }

  if (compactSelection.value) {
    beginEditing();
    return;
  }

  toggleOpen();
}

function getLineDisplayName(line: LineSearchOption): string {
  return line.displayName ?? line.label;
}
</script>

<template>
  <div
    class="rich-combobox"
    :class="{ 'rich-combobox--inline': inline }"
    @focusin="setOpen(true)"
    @focusout="scheduleClose"
  >
    <input
      v-if="showSearch"
      ref="searchInput"
      :value="query"
      :disabled="disabled"
      class="rich-combobox__input"
      placeholder="Rechercher une ligne"
      type="search"
      @input="updateQuery"
      @click="setOpen(true)"
    />

    <button
      v-if="!inline"
      class="rich-combobox__button"
      type="button"
      :disabled="disabled || loading"
      :aria-expanded="open"
      @pointerdown="handleButtonPointerDown"
      @click="handleButtonClick"
    >
      <LineIconBadge v-if="modelValue" :line="modelValue" />
      <span v-else class="rich-combobox__placeholder">{{ buttonLabel }}</span>
      <span v-if="compactSelection" class="rich-combobox__edit">
        Modifier
      </span>
    </button>

    <div
      v-if="(inline || open) && !disabled"
      class="rich-combobox__menu"
      :class="{ 'rich-combobox__menu--inline': inline }"
      role="listbox"
    >
      <div v-if="loading" class="rich-combobox__state">
        <span aria-hidden="true" class="loader-dot"></span>
        Chargement
      </div>
      <template v-else>
        <button
          v-for="line in options"
          :key="line.id"
          class="rich-combobox__option line-option"
          type="button"
          role="option"
          :aria-selected="line.id === modelValue?.id"
          @mousedown.prevent="selectLine(line)"
        >
          <LineIconBadge :line="line" />
          <!-- <span>{{ getLineDisplayName(line) }}</span> -->
        </button>
      </template>
      <div v-if="!loading && options.length === 0" class="rich-combobox__state">
        Aucune ligne
      </div>
    </div>
  </div>
</template>

<style scoped>
.rich-combobox {
  display: grid;
  gap: 8px;
  position: relative;
}

.rich-combobox__input,
.rich-combobox__button {
  background: #f8fafc;
  border: 1px solid var(--border);
  color: #111827;
  width: 100%;
}

.rich-combobox__button {
  justify-content: flex-start;
  min-height: 46px;
}

.rich-combobox__button:hover:not(:disabled) {
  background: #eef2f7;
  color: #111827;
  transform: none;
}

.rich-combobox__input {
  border-radius: 8px;
}

.rich-combobox__placeholder {
  color: var(--muted);
  font-weight: 750;
}

.rich-combobox__edit {
  color: var(--idfm-blue);
  font-size: 0.76rem;
  font-weight: 850;
  margin-left: auto;
}

.rich-combobox__menu {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 18px 45px rgba(16, 35, 63, 0.14);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  left: 0;
  max-height: 280px;
  overflow: auto;
  padding: 6px;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 8;
}

.rich-combobox--inline {
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.rich-combobox__menu--inline {
  align-content: start;
  background: transparent;
  border: 0;
  box-shadow: none;
  max-height: none;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
  position: static;
  width: 100%;
  z-index: auto;
}

.rich-combobox__menu--inline .rich-combobox__option {
  align-items: center;
  flex: 0 0 76px;
  height: 76px;
  justify-content: center;
  padding: 6px;
}

.rich-combobox__option {
  background: #f8fafc;
  border-radius: 6px;
  color: #111827;
  justify-content: flex-start;
  min-height: 44px;
  padding: 7px 8px;
  transform: none;
}

.rich-combobox__option:hover,
.rich-combobox__option[aria-selected="true"] {
  background: #e8edf4;
  color: #111827;
  transform: none;
}

.rich-combobox__state {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.84rem;
  font-weight: 800;
  gap: 8px;
  min-height: 42px;
  padding: 8px;
}

.line-option {
  gap: 10px;
}
</style>
