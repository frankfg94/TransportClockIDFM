<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { TransitFamilyOption } from "../types/transit";

const props = defineProps<{
  options: TransitFamilyOption[];
  modelValue?: TransitFamilyOption;
  disabled?: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [network?: TransitFamilyOption];
}>();

const open = ref(false);
let blurTimer: number | undefined;

const buttonLabel = computed(() =>
  props.modelValue ? props.modelValue.label : "Sélectionner",
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
  emit("update:modelValue", network);
  open.value = false;
}
</script>

<template>
  <div class="family-combobox" @focusin="setOpen(true)" @focusout="scheduleClose">
    <button
      class="family-combobox__button"
      type="button"
      :disabled="disabled || loading"
      :aria-expanded="open"
      @pointerdown.prevent="toggleOpen"
      @click="toggleOpenFromClick"
    >
      {{ loading ? "Chargement..." : buttonLabel }}
    </button>

    <div v-if="open && !disabled" class="family-combobox__menu" role="listbox">
      <div v-if="loading" class="family-combobox__state">
        <span aria-hidden="true" class="loader-dot"></span>
        Chargement
      </div>
      <template v-else>
        <button
          class="family-combobox__option"
          type="button"
          role="option"
          :aria-selected="!modelValue"
          @mousedown.prevent="selectNetwork(undefined)"
        >
          Sélectionner
        </button>
        <button
          v-for="option in options"
          :key="option.id"
          class="family-combobox__option"
          type="button"
          role="option"
          :aria-selected="option.id === modelValue?.id"
          @mousedown.prevent="selectNetwork(option)"
        >
          {{ option.label }}
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

.family-combobox__option {
  background: #f8fafc;
  border-radius: 6px;
  color: #111827;
  justify-content: flex-start;
  min-height: 42px;
  padding: 7px 10px;
  transform: none;
}

.family-combobox__option:hover,
.family-combobox__option[aria-selected="true"] {
  background: #e8edf4;
  color: #111827;
  transform: none;
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
