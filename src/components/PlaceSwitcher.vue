<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Briefcase, ChevronDown, Home, MapPin, Plus } from "lucide-vue-next";
import {
  DEFAULT_TRANSIT_PLACE_ID,
  WORK_TRANSIT_PLACE_ID,
  type TransitPlaceKind,
} from "../storage/transitPreferences";

interface PlaceOption {
  id: string;
  kind: TransitPlaceKind;
  label: string;
}

const props = defineProps<{
  places: PlaceOption[];
  activePlaceId: string;
}>();

const emit = defineEmits<{
  add: [];
  select: [placeId: string];
}>();

const open = ref(false);
const root = ref<HTMLElement>();

const activePlace = computed(
  () =>
    props.places.find((place) => place.id === props.activePlaceId) ??
    props.places[0],
);

onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutsidePointer);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutsidePointer);
});

watch(
  () => props.activePlaceId,
  () => {
    open.value = false;
  },
);

function toggle(): void {
  open.value = !open.value;
}

function selectPlace(placeId: string): void {
  emit("select", placeId);
  open.value = false;
}

function addPlace(): void {
  emit("add");
  open.value = false;
}

function closeOnOutsidePointer(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) {
    open.value = false;
  }
}

function iconForPlace(place: PlaceOption) {
  if (place.id === DEFAULT_TRANSIT_PLACE_ID) {
    return Home;
  }

  if (place.id === WORK_TRANSIT_PLACE_ID) {
    return Briefcase;
  }

  return MapPin;
}
</script>

<template>
  <div ref="root" class="place-switcher" @keydown.esc="open = false">
    <button
      class="place-switcher__trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <component
        :is="activePlace ? iconForPlace(activePlace) : MapPin"
        aria-hidden="true"
      />
      <span class="place-label">{{ activePlace?.label ?? "Lieu" }}</span>
      <ChevronDown
        class="place-switcher__chevron"
        :class="{ 'place-switcher__chevron--open': open }"
        aria-hidden="true"
      />
    </button>

    <Transition name="place-switcher-menu">
      <div
        v-if="open"
        class="place-switcher__menu"
        role="menu"
        aria-label="Choisir un lieu"
      >
        <button
          v-for="place in places"
          :key="place.id"
          class="place-switcher__item"
          :class="{
            'place-switcher__item--active': place.id === activePlaceId,
          }"
          type="button"
          role="menuitem"
          @click="selectPlace(place.id)"
        >
          <component :is="iconForPlace(place)" aria-hidden="true" />
          <span>{{ place.label }}</span>
        </button>
        <button
          class="place-switcher__item place-switcher__item--add"
          type="button"
          role="menuitem"
          @click="addPlace"
        >
          <Plus aria-hidden="true" />
          <span>Ajouter un lieu</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.place-switcher {
  position: relative;
}

.place-label {
  font-size: 18px;
}

.place-switcher__trigger {
  background: rgba(246, 248, 255, 0.72);
  border: 1px solid rgba(0, 100, 255, 0.08);
  color: var(--ink);
  font-weight: 820;
  min-height: 40px;
  min-width: 134px;
  padding-inline: 11px;
}

.place-switcher__trigger:hover:not(:disabled) {
  background: rgba(238, 243, 255, 0.95);
  border-color: rgba(0, 100, 255, 0.16);
}

.place-switcher__trigger svg {
  color: var(--idfm-blue);
  height: 18px;
  width: 18px;
}

.place-switcher__chevron {
  margin-left: 4px;
  transition: transform 160ms ease;
}

.place-switcher__chevron--open {
  transform: rotate(180deg);
}

.place-switcher__menu {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-menu);
  display: grid;
  gap: 4px;
  min-width: 250px;
  padding: 8px;
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 30;
}

.place-switcher__item {
  background: transparent;
  color: var(--ink);
  justify-content: flex-start;
  min-height: 42px;
  padding: 0 12px;
  width: 100%;
}

.place-switcher__item:hover:not(:disabled),
.place-switcher__item--active {
  background: var(--surface-muted);
  color: var(--idfm-blue);
  transform: none;
}

.place-switcher__item svg {
  color: currentColor;
  height: 18px;
  width: 18px;
}

.place-switcher__item--add {
  border-top: 1px solid var(--border);
  margin-top: 4px;
  padding-top: 4px;
}

.place-switcher-menu-enter-active,
.place-switcher-menu-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.place-switcher-menu-enter-from,
.place-switcher-menu-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

@media (max-width: 720px) {
  .place-switcher__trigger {
    min-width: 0;
    width: 100%;
  }

  .place-switcher__menu {
    left: 0;
    right: auto;
    width: 100%;
  }
}
</style>
