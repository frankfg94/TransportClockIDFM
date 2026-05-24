<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

export interface MaterialComboboxOption {
  id: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    options: MaterialComboboxOption[];
    modelValue?: string;
    placeholder?: string;
    ariaLabel?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: "Sélectionner",
    ariaLabel: "Sélectionner une option",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
}>();

const root = ref<HTMLElement>();
const open = ref(false);
const activeIndex = ref(-1);

const selectedOption = computed(() =>
  props.options.find((option) => option.id === props.modelValue),
);
const displayLabel = computed(
  () => selectedOption.value?.label ?? props.placeholder,
);
const enabledOptions = computed(() =>
  props.options.filter((option) => !option.disabled),
);

watch(
  () => props.modelValue,
  () => {
    activeIndex.value = Math.max(
      0,
      props.options.findIndex((option) => option.id === props.modelValue),
    );
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutsidePointer);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutsidePointer);
});

function closeOnOutsidePointer(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) {
    open.value = false;
  }
}

function toggleOpen(): void {
  if (props.disabled || enabledOptions.value.length === 0) {
    return;
  }

  open.value = !open.value;

  if (open.value) {
    focusSelectedOption();
  }
}

function focusSelectedOption(): void {
  activeIndex.value = Math.max(
    0,
    props.options.findIndex(
      (option) => !option.disabled && option.id === props.modelValue,
    ),
  );
}

function moveActive(delta: number): void {
  if (!open.value) {
    open.value = true;
  }

  const options = props.options;
  if (options.length === 0) {
    return;
  }

  let nextIndex = activeIndex.value;
  for (let step = 0; step < options.length; step += 1) {
    nextIndex = (nextIndex + delta + options.length) % options.length;

    if (!options[nextIndex].disabled) {
      activeIndex.value = nextIndex;
      void nextTick(scrollActiveOptionIntoView);
      return;
    }
  }
}

function scrollActiveOptionIntoView(): void {
  root.value
    ?.querySelector<HTMLElement>("[data-combobox-active='true']")
    ?.scrollIntoView({ block: "nearest" });
}

function selectOption(option: MaterialComboboxOption): void {
  if (option.disabled) {
    return;
  }

  emit("update:modelValue", option.id);
  emit("change", option.id);
  open.value = false;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveActive(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActive(-1);
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();

    if (!open.value) {
      open.value = true;
      focusSelectedOption();
      return;
    }

    const option = props.options[activeIndex.value];
    if (option) {
      selectOption(option);
    }
    return;
  }

  if (event.key === "Escape") {
    open.value = false;
  }
}
</script>

<template>
  <div ref="root" class="material-combobox">
    <button
      class="material-combobox__trigger"
      type="button"
      role="combobox"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      :disabled="disabled"
      @click="toggleOpen"
      @keydown="handleKeydown"
    >
      <span
        class="material-combobox__value"
        :class="{ 'material-combobox__value--placeholder': !selectedOption }"
      >
        {{ displayLabel }}
      </span>
      <span class="material-combobox__chevron" aria-hidden="true"></span>
    </button>

    <Transition name="material-combobox-menu">
      <div v-if="open" class="material-combobox__menu" role="listbox">
        <button
          v-for="(option, index) in options"
          :key="option.id"
          class="material-combobox__option"
          type="button"
          role="option"
          :disabled="option.disabled"
          :aria-selected="option.id === modelValue"
          :data-combobox-active="index === activeIndex ? 'true' : undefined"
          @mouseenter="activeIndex = index"
          @mousedown.prevent="selectOption(option)"
        >
          {{ option.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.material-combobox {
  --combobox-accent: var(--line-color, var(--idfm-blue));
  display: block;
  min-width: min(360px, 100%);
  position: relative;
}

.material-combobox__trigger {
  align-items: center;
  background: transparent;
  border: 1px solid rgba(16, 35, 63, 0.16);
  border-radius: 8px;
  color: var(--ink);
  display: grid;
  font: inherit;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto;
  justify-content: stretch;
  min-height: 44px;
  padding: 7px 12px;
  text-align: left;
  transform: none;
  width: 100%;
}

.material-combobox__trigger:hover:not(:disabled) {
  background: rgba(0, 100, 255, 0.035);
  border-color: rgba(16, 35, 63, 0.26);
  color: var(--ink);
  transform: none;
}

.material-combobox__trigger:focus-visible,
.material-combobox__trigger[aria-expanded="true"] {
  background: #ffffff;
  border-color: color-mix(in srgb, var(--combobox-accent), #ffffff 22%);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--combobox-accent), transparent 84%),
    0 10px 28px rgba(16, 35, 63, 0.08);
  outline: none;
}

.material-combobox__value {
  color: var(--ink);
  display: block;
  font-size: 1.25rem;
  font-weight: 950;
  line-height: 1.08;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-combobox__value--placeholder {
  color: var(--muted);
}

.material-combobox__chevron {
  border-bottom: 2px solid var(--ink);
  border-right: 2px solid var(--ink);
  height: 8px;
  transform: rotate(45deg) translateY(-2px);
  transition: transform 160ms ease;
  width: 8px;
}

.material-combobox__trigger[aria-expanded="true"] .material-combobox__chevron {
  transform: rotate(225deg) translate(-2px, -1px);
}

.material-combobox__menu {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.14);
  border-radius: 10px;
  box-shadow:
    0 22px 55px rgba(16, 35, 63, 0.18),
    0 2px 10px rgba(16, 35, 63, 0.06);
  display: grid;
  gap: 2px;
  left: 0;
  max-height: min(360px, 58vh);
  overflow: auto;
  padding: 6px;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
}

.material-combobox__option {
  background: transparent;
  border-radius: 7px;
  color: var(--ink);
  display: block;
  font-size: 1rem;
  font-weight: 760;
  justify-content: start;
  line-height: 1.2;
  min-height: 40px;
  overflow: hidden;
  padding: 9px 10px;
  text-align: left;
  text-overflow: ellipsis;
  transform: none;
  white-space: nowrap;
  width: 100%;
}

.material-combobox__option:hover:not(:disabled),
.material-combobox__option[data-combobox-active="true"]:not(:disabled) {
  background: color-mix(in srgb, var(--combobox-accent), transparent 90%);
  color: var(--ink);
  transform: none;
}

.material-combobox__option[aria-selected="true"] {
  background: color-mix(in srgb, var(--combobox-accent), transparent 84%);
  color: color-mix(in srgb, var(--combobox-accent), black 18%);
  font-weight: 920;
}

.material-combobox-menu-enter-active,
.material-combobox-menu-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.material-combobox-menu-enter-from,
.material-combobox-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
