<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { Check } from "lucide-vue-next";
import type { StationSearchOption, TransferLineOption } from "../types/transit";

const props = defineProps<{
  options: StationSearchOption[];
  modelValue?: StationSearchOption;
  query: string;
  disabled?: boolean;
  loading?: boolean;
  inline?: boolean;
  compact?: boolean;
  transferMap: Record<string, TransferLineOption[]>;
  transferLoadingIds: string[];
}>();

const emit = defineEmits<{
  "update:modelValue": [station?: StationSearchOption];
  "update:query": [query: string];
  inspect: [station: StationSearchOption];
}>();

const open = ref(false);
const editing = ref(false);
const combobox = ref<HTMLElement>();
const menu = ref<HTMLElement>();
const menuStyle = ref<Record<string, string>>({});
const searchInput = ref<HTMLInputElement>();
let blurTimer: number | undefined;
let inlineStationObserver: IntersectionObserver | undefined;

const buttonLabel = computed(() =>
  props.modelValue
    ? formatStationLabel(props.modelValue)
    : "Sélectionner une station",
);
const compactSelection = computed(
  () => props.compact && Boolean(props.modelValue) && !editing.value,
);
const showSearch = computed(() => !compactSelection.value);

onBeforeUnmount(() => {
  if (blurTimer) {
    window.clearTimeout(blurTimer);
  }

  window.removeEventListener("resize", updateMenuPosition);
  window.removeEventListener("scroll", updateMenuPosition, true);
  inlineStationObserver?.disconnect();
});

onMounted(() => {
  window.addEventListener("resize", updateMenuPosition);
  window.addEventListener("scroll", updateMenuPosition, true);

  if (props.inline) {
    void nextTick(observeInlineStations);
  }
});

watch(
  [
    open,
    () => props.inline,
    () => props.loading,
    () => props.options.map((station) => station.id).join("|"),
  ],
  () => {
    if (props.inline) {
      void nextTick(observeInlineStations);
      return;
    }

    if (open.value) {
      void nextTick(updateMenuPosition);
    }
  },
  { flush: "post" },
);

function setOpen(value: boolean): void {
  if (blurTimer) {
    window.clearTimeout(blurTimer);
    blurTimer = undefined;
  }

  open.value = value;

  if (value) {
    void nextTick(updateMenuPosition);
  }
}

function toggleOpen(): void {
  setOpen(!open.value);
}

function toggleOpenFromClick(event: MouseEvent): void {
  if (event.detail === 0) {
    toggleOpen();
  }
}

function scheduleClose(): void {
  if (blurTimer) {
    window.clearTimeout(blurTimer);
  }

  blurTimer = window.setTimeout(() => {
    open.value = false;
  }, 140);
}

function selectStation(station: StationSearchOption): void {
  emit("update:modelValue", station);
  if (!props.inline) {
    emit("update:query", station.label);
  }
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

function handleCompactSelectionPointerDown(event: PointerEvent): void {
  event.preventDefault();
  beginEditing();
}

function handleCompactSelectionClick(event: MouseEvent): void {
  if (event.detail === 0) {
    beginEditing();
  }
}

function updateMenuPosition(): void {
  const anchor = combobox.value;

  if (props.inline || !open.value || !anchor) {
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const viewportPadding = 12;
  const gap = 6;
  const desiredMenuHeight = 320;
  const spaceAbove = rect.top - viewportPadding - gap;
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
  const opensAbove =
    spaceBelow < desiredMenuHeight && spaceAbove > spaceBelow;
  const availableHeight = Math.max(
    96,
    Math.min(desiredMenuHeight, opensAbove ? spaceAbove : spaceBelow),
  );
  const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
  const left = Math.min(
    Math.max(viewportPadding, rect.left),
    window.innerWidth - viewportPadding - width,
  );

  menuStyle.value = {
    left: `${left}px`,
    maxHeight: `${availableHeight}px`,
    top: opensAbove ? "auto" : `${rect.bottom + gap}px`,
    bottom: opensAbove
      ? `${window.innerHeight - rect.top + gap}px`
      : "auto",
    width: `${width}px`,
  };
}

function observeInlineStations(): void {
  inlineStationObserver?.disconnect();
  inlineStationObserver = undefined;

  if (!props.inline || props.loading || !menu.value) {
    return;
  }

  const inspectStationById = (stationId?: string): void => {
    const station = props.options.find((option) => option.id === stationId);

    if (station) {
      inspectStation(station);
    }
  };

  if (typeof IntersectionObserver === "undefined") {
    return;
  }

  inlineStationObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        inspectStationById((entry.target as HTMLElement).dataset.stationId);
        inlineStationObserver?.unobserve(entry.target);
      });
    },
    {
      root: menu.value,
      threshold: 0.1,
    },
  );

  menu.value
    .querySelectorAll<HTMLElement>("[data-station-id]")
    .forEach((option) => inlineStationObserver?.observe(option));
}

function inspectStation(station: StationSearchOption): void {
  emit("inspect", station);
}

function formatStationLabel(station: StationSearchOption): string {
  return station.city ? `${station.label} ? ${station.city}` : station.label;
}

function visibleTransfers(station: StationSearchOption): TransferLineOption[] {
  return (props.transferMap[station.id] ?? []).filter(
    (transfer) => !normalizeText(transfer.mode).includes("bus"),
  );
}

function isLoadingTransfers(station: StationSearchOption): boolean {
  return props.transferLoadingIds.includes(station.id);
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
</script>

<template>
  <div
    ref="combobox"
    class="station-combobox"
    :class="{ 'station-combobox--inline': inline }"
    @focusin="setOpen(true)"
    @focusout="scheduleClose"
  >
    <input
      v-if="showSearch"
      ref="searchInput"
      :value="query"
      :disabled="disabled"
      class="station-combobox__input"
      placeholder="Filtrer les stations"
      type="search"
      @input="updateQuery"
      @click="setOpen(true)"
    />

    <button
      v-if="!inline && !compactSelection"
      class="station-combobox__button"
      type="button"
      :disabled="disabled || loading"
      :aria-expanded="open"
      @pointerdown.prevent="toggleOpen"
      @click="toggleOpenFromClick"
    >
      <span>{{ buttonLabel }}</span>
    </button>

    <button
      v-else-if="compactSelection && modelValue"
      class="station-combobox__selected-button"
      type="button"
      @pointerdown="handleCompactSelectionPointerDown"
      @click="handleCompactSelectionClick"
    >
      <span class="station-combobox__station">
        <strong>{{ modelValue.label }}</strong>
        <small v-if="modelValue.city">{{ modelValue.city }}</small>
      </span>
      <span class="station-combobox__selection-meta">
        <span class="station-combobox__transfers">
          <span
            v-if="isLoadingTransfers(modelValue)"
            class="station-combobox__mini-loader"
            aria-label="Chargement des correspondances"
          ></span>
          <span
            v-for="transfer in visibleTransfers(modelValue).slice(0, 6)"
            :key="transfer.id"
            class="station-transfer-badge"
            :style="{
              background: transfer.color ?? '#eef3fb',
              color: transfer.textColor ?? '#10233f',
            }"
          >
            {{ transfer.label }}
          </span>
        </span>
        <span class="station-combobox__edit">Modifier</span>
      </span>
    </button>

    <Teleport to="body" :disabled="inline">
    <div
      ref="menu"
      v-if="(inline || open) && !disabled"
      class="station-combobox__menu"
      :class="{ 'station-combobox__menu--inline': inline }"
      :style="inline ? undefined : menuStyle"
      role="listbox"
    >
      <div v-if="loading" class="station-combobox__state">
        <span aria-hidden="true" class="loader-dot"></span>
        Chargement
      </div>
      <template v-else>
        <button
          v-for="station in options"
          :key="station.id"
          class="station-combobox__option"
          type="button"
          role="option"
          :aria-selected="station.id === modelValue?.id"
          :data-station-id="station.id"
          @focus="inspectStation(station)"
          @mouseenter="inspectStation(station)"
          @mousedown.prevent="selectStation(station)"
        >
          <span class="station-combobox__station">
            <strong>{{ station.label }}</strong>
            <small v-if="station.city">{{ station.city }}</small>
          </span>
          <span class="station-combobox__transfers">
            <span
              v-if="isLoadingTransfers(station)"
              class="station-combobox__mini-loader"
              aria-label="Chargement des correspondances"
            ></span>
            <span
              v-for="transfer in visibleTransfers(station).slice(0, 6)"
              :key="transfer.id"
              class="station-transfer-badge"
              :style="{
                background: transfer.color ?? '#eef3fb',
                color: transfer.textColor ?? '#10233f',
              }"
            >
              {{ transfer.label }}
            </span>
          </span>
          <Check
            v-if="station.id === modelValue?.id && inline"
            class="station-combobox__selected-check"
            aria-label="Station sélectionnée"
          />
        </button>
      </template>
      <div
        v-if="!loading && options.length === 0"
        class="station-combobox__state"
      >
        Aucune station
      </div>
    </div>
    </Teleport>
  </div>
</template>

<style scoped>
.station-combobox {
  display: grid;
  gap: 8px;
  position: relative;
}

.station-combobox__input,
.station-combobox__button {
  background: #f8fafc;
  border: 1px solid var(--border);
  color: #111827;
  width: 100%;
}

.station-combobox__selected-button {
  align-items: center;
  background: #eef2ff;
  border: 1px solid var(--border);
  color: #111827;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 58px;
  padding: 8px 12px;
  text-align: left;
  width: 100%;
}

.station-combobox__selected-button:hover {
  background: #e7edff;
  color: #111827;
  transform: none;
}

.station-combobox__selection-meta {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.station-combobox__edit {
  color: var(--idfm-blue);
  font-size: 0.78rem;
  font-weight: 900;
}

.station-combobox__button {
  justify-content: flex-start;
  min-height: 46px;
}

.station-combobox__input {
  border-radius: 8px;
}

.station-combobox__button:hover:not(:disabled) {
  background: #eef2f7;
  color: #111827;
  transform: none;
}

.station-combobox__menu {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 18px 45px rgba(16, 35, 63, 0.14);
  display: grid;
  gap: 4px;
  left: 0;
  max-height: 320px;
  overflow: auto;
  padding: 6px;
  position: fixed;
  z-index: 30;
}

.station-combobox--inline {
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.station-combobox__menu--inline {
  align-content: start;
  background: transparent;
  border: 0;
  box-shadow: none;
  display: flex;
  flex-wrap: wrap;
  max-height: none;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
  position: static;
  width: 100%;
  z-index: auto;
}

.station-combobox__menu--inline .station-combobox__option {
  flex: 1 1 230px;
}

.station-combobox__menu--inline .station-combobox__option[aria-selected="true"] {
  background: #e7f1ff;
}

.station-combobox__menu--inline .station-combobox__transfers {
  grid-column: 1;
  justify-content: flex-start;
  max-width: 100%;
}

.station-combobox__option {
  align-items: center;
  background: #f8fafc;
  border-radius: 6px;
  color: #111827;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 48px;
  padding: 8px 10px;
  text-align: left;
  transform: none;
}

.station-combobox__option:hover,
.station-combobox__option[aria-selected="true"] {
  background: #e8edf4;
  color: #111827;
  transform: none;
}

.station-combobox__station {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.station-combobox__station strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.station-combobox__station small {
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 750;
}

.station-combobox__transfers {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
  max-width: 220px;
}

.station-combobox__selected-check {
  color: var(--idfm-blue);
  flex: 0 0 auto;
  grid-column: 2;
  grid-row: 1 / span 2;
  height: 20px;
  width: 20px;
}

.station-transfer-badge {
  border-radius: 5px;
  font-size: 0.68rem;
  font-weight: 950;
  line-height: 1;
  min-width: 26px;
  padding: 5px 6px;
  text-align: center;
}

.station-combobox__state {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.84rem;
  font-weight: 800;
  gap: 8px;
  min-height: 42px;
  padding: 8px;
}

.station-combobox__mini-loader {
  border: 2px solid rgba(0, 100, 255, 0.18);
  border-top-color: var(--idfm-blue);
  border-radius: 50%;
  display: inline-block;
  height: 16px;
  width: 16px;
  animation: loader-spin 700ms linear infinite;
}

@media (max-width: 720px) {
  .station-combobox__option {
    align-items: start;
    grid-template-columns: minmax(0, 1fr);
  }

  .station-combobox__transfers {
    justify-content: flex-start;
    max-width: 100%;
  }

  .station-combobox__menu--inline .station-combobox__option {
    align-items: center;
    grid-template-columns: minmax(0, 1fr) auto;
  }
}
</style>
