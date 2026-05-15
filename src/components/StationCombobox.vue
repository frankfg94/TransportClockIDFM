<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { StationSearchOption, TransferLineOption } from "../types/transit";

const props = defineProps<{
  options: StationSearchOption[];
  modelValue?: StationSearchOption;
  query: string;
  disabled?: boolean;
  loading?: boolean;
  transferMap: Record<string, TransferLineOption[]>;
  transferLoadingIds: string[];
}>();

const emit = defineEmits<{
  "update:modelValue": [station?: StationSearchOption];
  "update:query": [query: string];
  inspect: [station: StationSearchOption];
}>();

const open = ref(false);
let blurTimer: number | undefined;

const buttonLabel = computed(() =>
  props.modelValue
    ? formatStationLabel(props.modelValue)
    : "Sélectionner une station",
);

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
  emit("update:query", station.label);
  open.value = false;
}

function updateQuery(event: Event): void {
  emit("update:query", (event.target as HTMLInputElement).value);
  emit("update:modelValue", undefined);
  setOpen(true);
}

function inspectStation(station: StationSearchOption): void {
  emit("inspect", station);
}

function formatStationLabel(station: StationSearchOption): string {
  return station.city ? `${station.label} · ${station.city}` : station.label;
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
    class="station-combobox"
    @focusin="setOpen(true)"
    @focusout="scheduleClose"
  >
    <input
      :value="query"
      :disabled="disabled"
      class="station-combobox__input"
      placeholder="Filtrer les stations"
      type="search"
      @input="updateQuery"
      @click="setOpen(true)"
    />

    <button
      class="station-combobox__button"
      type="button"
      :disabled="disabled || loading"
      :aria-expanded="open"
      @click="setOpen(!open)"
    >
      <span>{{ buttonLabel }}</span>
    </button>

    <div v-if="open && !disabled" class="station-combobox__menu" role="listbox">
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
        </button>
      </template>
      <div
        v-if="!loading && options.length === 0"
        class="station-combobox__state"
      >
        Aucune station
      </div>
    </div>
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
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 8;
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
}
</style>
