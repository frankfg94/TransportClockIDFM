<script setup lang="ts">
import { computed } from "vue";
import type { Component } from "vue";
import { Briefcase, Home, LayoutDashboard, MapPin } from "lucide-vue-next";
import { useI18n } from "../i18n";
import type { TransitPlacePreset } from "../storage/transitPreferences";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    places?: TransitPlacePreset[];
    disabled?: boolean;
  }>(),
  {
    places: () => [],
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [placeId: string];
}>();
const { t } = useI18n();

const selectedPlaceId = computed({
  get: () => props.modelValue ?? "",
  set: (placeId: string) => {
    if (!props.disabled && placeId !== props.modelValue) {
      emit("update:modelValue", placeId);
    }
  },
});

const placeIconById: Record<string, Component> = {
  home: Home,
  maison: Home,
  work: Briefcase,
  travail: Briefcase,
  office: Briefcase,
  bureau: Briefcase,
};

function getPlaceIcon(place: TransitPlacePreset): Component {
  const normalizedId = place.id.toLowerCase();
  const normalizedLabel = place.label.toLowerCase();

  return (
    placeIconById[normalizedId] ??
    placeIconById[normalizedLabel] ??
    (place.kind === "builtin" ? LayoutDashboard : MapPin)
  );
}

function selectPlace(placeId: string): void {
  selectedPlaceId.value = placeId;
}
</script>

<template>
  <fieldset
    class="station-board-selector"
    data-testid="station-board-selector"
    :disabled="disabled"
  >
    <legend>{{ t("stationBoardSelector.title") }}</legend>
    <p>{{ t("stationBoardSelector.description") }}</p>

    <div class="station-board-selector__list" role="radiogroup">
      <label
        v-for="place in places"
        :key="place.id"
        class="station-board-selector__item"
        :class="{
          'station-board-selector__item--active': selectedPlaceId === place.id,
          'station-board-selector__item--disabled': disabled,
        }"
        @click="selectPlace(place.id)"
      >
        <span class="station-board-selector__icon" aria-hidden="true">
          <component :is="getPlaceIcon(place)" :size="18" :stroke-width="2.4" />
        </span>

        <span class="station-board-selector__content">
          <strong>{{ place.label }}</strong>
          <small>
            {{
              place.kind === "builtin"
                ? t("stationBoardSelector.builtin")
                : t("stationBoardSelector.custom")
            }}
          </small>
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.station-board-selector {
  border: 0;
  display: grid;
  gap: 10px;
  margin: 0;
  min-inline-size: 0;
  padding: 0;
}

.station-board-selector:disabled {
  opacity: 1;
}

.station-board-selector legend {
  color: var(--ink);
  font-size: 0.82rem;
  font-weight: 950;
  margin-bottom: 3px;
}

.station-board-selector p {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 750;
  line-height: 1.25;
  margin: 0;
}

.station-board-selector__list {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}

.station-board-selector__item {
  align-items: center;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  gap: 9px;
  min-height: 52px;
  padding: 10px;
  user-select: none;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}

.station-board-selector__item:hover:not(
    .station-board-selector__item--disabled
  ),
.station-board-selector__item--active {
  border-color: color-mix(in srgb, var(--idfm-blue), #ffffff 20%);
  box-shadow: 0 10px 22px rgba(0, 100, 255, 0.12);
  transform: translateY(-1px);
}

.station-board-selector__item--active .station-board-selector__icon {
  background: color-mix(in srgb, var(--idfm-blue), #ffffff 88%);
  border-color: color-mix(in srgb, var(--idfm-blue), #ffffff 45%);
  color: var(--idfm-blue);
}

.station-board-selector__item--disabled {
  cursor: not-allowed;
  opacity: 0.58;
  transform: none;
}

.station-board-selector__item input {
  accent-color: var(--idfm-blue);
  cursor: inherit;
  flex: 0 0 auto;
  height: 16px;
  margin: 0;
  width: 16px;
}

.station-board-selector__icon {
  align-items: center;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 9px;
  color: var(--muted);
  display: inline-flex;
  flex: 0 0 auto;
  height: 30px;
  justify-content: center;
  width: 30px;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.station-board-selector__content {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.station-board-selector__item strong {
  color: var(--ink);
  font-size: 0.82rem;
  line-height: 1.1;
}

.station-board-selector__item small {
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 800;
}
</style>
