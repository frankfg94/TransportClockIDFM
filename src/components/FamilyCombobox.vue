<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useI18n } from "../i18n";
import { createTransportModeIcon } from "../services/linePresentation";
import type { TransitFamily, TransitFamilyOption } from "../types/transit";

const props = defineProps<{
  options: TransitFamilyOption[];
  modelValue?: TransitFamilyOption;
  disabled?: boolean;
  loading?: boolean;
  inline?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [network?: TransitFamilyOption];
}>();

const open = ref(false);
const hoveredFamily = ref<TransitFamily>();
const { t } = useI18n();
let blurTimer: number | undefined;

const buttonLabel = computed(() =>
  props.modelValue ? props.modelValue.label : t("common.actions.select"),
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

function selectNetwork(network?: TransitFamilyOption): void {
  hoveredFamily.value = undefined;
  emit("update:modelValue", network);
  open.value = false;
}

function handleOptionPointerEnter(
  event: PointerEvent,
  family: TransitFamily,
): void {
  if (event.pointerType === "touch") {
    return;
  }

  hoveredFamily.value = family;
}

function clearHoveredFamily(family: TransitFamily): void {
  if (hoveredFamily.value === family) {
    hoveredFamily.value = undefined;
  }
}
</script>

<template>
  <div
    class="family-combobox"
    :class="{ 'family-combobox--inline': inline }"
    @focusin="setOpen(true)"
    @focusout="scheduleClose"
  >
    <button
      v-if="!inline"
      class="family-combobox__button"
      type="button"
      :disabled="disabled || loading"
      :aria-expanded="open"
      @pointerdown.prevent="toggleOpen"
      @click="toggleOpenFromClick"
    >
      {{ loading ? t("common.states.loading") : buttonLabel }}
    </button>

    <div
      v-if="(inline || open) && !disabled"
      class="family-combobox__menu"
      :class="{ 'family-combobox__menu--inline': inline }"
      role="listbox"
    >
      <div v-if="loading" class="family-combobox__state">
        <span aria-hidden="true" class="loader-dot"></span>
        {{ t("common.states.loading") }}
      </div>
      <template v-else>
        <button
          v-if="!inline"
          class="family-combobox__option"
          type="button"
          role="option"
          :aria-selected="!modelValue"
          @mousedown.prevent="selectNetwork(undefined)"
        >
          {{ t("common.actions.select") }}
        </button>
        <button
          v-for="option in options"
          :key="option.family"
          class="family-combobox__option family-combobox__option--with-icon"
          :class="{
            'family-combobox__option--hovered':
              hoveredFamily === option.family,
          }"
          type="button"
          role="option"
          :aria-selected="option.family === modelValue?.family"
          @mousedown.prevent="selectNetwork(option)"
          @pointerenter="handleOptionPointerEnter($event, option.family)"
          @pointerleave="clearHoveredFamily(option.family)"
          @pointercancel="clearHoveredFamily(option.family)"
        >
          <span
            class="pattern-board__mode-icon family-combobox__mode-icon"
            :class="`pattern-board__mode-icon--${
              createTransportModeIcon(option.family).key
            }`"
            :aria-label="createTransportModeIcon(option.family).title"
            :title="createTransportModeIcon(option.family).title"
          >
            <span aria-hidden="true">
              {{ createTransportModeIcon(option.family).label }}
            </span>
          </span>
          <span>{{ option.label }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.family-combobox {
  display: grid;
  position: relative;
}

.family-combobox__button {
  background: #f8fafc;
  border: 1px solid var(--border);
  color: #111827;
  justify-content: flex-start;
  min-height: 44px;
  width: 100%;
}

.family-combobox__button:hover:not(:disabled) {
  background: #eef2f7;
  color: #111827;
  transform: none;
}

.family-combobox__menu {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 18px 45px rgba(16, 35, 63, 0.14);
  display: grid;
  gap: 4px;
  left: 0;
  max-height: 280px;
  overflow: auto;
  padding: 6px;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 9;
}

.family-combobox--inline {
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.family-combobox__menu--inline {
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

.family-combobox__menu--inline .family-combobox__option {
  align-items: center;
  display: flex;
  flex: 1 1 150px;
  gap: 10px;
}

.family-combobox__mode-icon {
  height: 32px;
  min-width: 32px;
}

.family-combobox__option {
  background: #f8fafc;
  border-radius: 6px;
  color: #111827;
  justify-content: flex-start;
  min-height: 42px;
  padding: 7px 10px;
  transform: none;
}

.family-combobox__option--with-icon {
  align-items: center;
  justify-items: start;
  display: grid;
  gap: 20px;
  grid-template-columns: 50px 1fr;
}

.family-combobox__option--with-icon .family-combobox__mode-icon {
  justify-self: flex-start;
}

.family-combobox__option:hover {
  background: #f8fafc;
  color: #111827;
  transform: none;
}
.family-combobox__option[aria-selected="true"] {
  background: #f8fafc;
  box-shadow: inset 0 0 0 2px #d4dce8;
  color: #111827;
  transform: none;
}

.family-combobox__option.family-combobox__option--hovered {
  background: #e8edf4;
  color: #111827;
  transform: none;
}

.family-combobox__option[aria-selected="true"].family-combobox__option--hovered {
  box-shadow: inset 0 0 0 2px #c0ccdc;
}
.family-combobox__state {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.84rem;
  font-weight: 800;
  gap: 8px;
  min-height: 42px;
  padding: 8px;
}
</style>
