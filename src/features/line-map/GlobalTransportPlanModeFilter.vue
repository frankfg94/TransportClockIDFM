<template>
  <nav
    class="global-transport-plan__filters"
    :class="{ 'global-transport-plan__filters--embedded': embedded }"
    data-global-map-filters
    :aria-label="t('globalMap.page.filtersAria')"
  >
    <div
      class="global-transport-plan__filter-group"
      role="group"
      :aria-label="t('globalMap.page.primaryModesAria')"
    >
      <header class="global-transport-plan__filter-heading">
        <span class="global-transport-plan__filter-heading-icon" aria-hidden="true">
          <Layers :size="22" :stroke-width="2.15" />
        </span>
        <div class="global-transport-plan__filter-heading-copy">
          <h2>{{ t("globalMap.page.exploreNetworks") }}</h2>
          <p>{{ t("globalMap.page.quickViewSubtitle") }}</p>
        </div>
      </header>

      <div class="global-transport-plan__mode-list" role="list">
        <div
          class="global-transport-plan__mode-preset-row global-transport-plan__mode-preset-row--all"
          :class="{ 'global-transport-plan__mode-preset-row--active': activePreset === 'ALL' }"
          role="listitem"
          data-global-map-preset="ALL"
        >
          <button
            type="button"
            class="global-transport-plan__mode-preset-select global-transport-plan__mode-preset-select--all"
            :aria-pressed="activePreset === 'ALL'"
            @click="emit('select-preset', 'ALL')"
          >
            <span class="global-transport-plan__mode-icon global-transport-plan__mode-icon--all" aria-hidden="true">
              <LayoutGrid :size="18" :stroke-width="2.1" />
            </span>
            <span class="global-transport-plan__mode-label">{{ t("globalMap.page.showAllModes") }}</span>
          </button>
        </div>

        <div
          v-for="mode in primaryModes"
          :key="mode"
          class="global-transport-plan__mode-preset-row"
          :class="{
            'global-transport-plan__mode-preset-row--active': activePreset === mode,
            'global-transport-plan__mode-preset-row--disabled': !availableModes.includes(mode),
          }"
          role="listitem"
          :data-global-map-preset="mode"
        >
          <button
            type="button"
            class="global-transport-plan__mode-preset-select"
            :disabled="!isModeAvailable(mode) && mode !== 'BIKE'"
            :aria-disabled="!isModeAvailable(mode)"
            :aria-pressed="activePreset === mode"
            :title="mode === 'BIKE' && !isModeAvailable(mode) ? t('globalMap.page.installBikeData') : undefined"
            @click="handleModeClick(mode)"
          >
            <span
              class="global-transport-plan__mode-icon"
              :style="{ '--mode-color': modeColor(mode) }"
              aria-hidden="true"
            >
              <GlobalTransportPlanModeIcon :mode="mode" :size="18" />
            </span>
            <span class="global-transport-plan__mode-label">{{ modeLabel(mode) }}</span>
          </button>
          <button
            v-if="availableModes.includes(mode)"
            type="button"
            class="global-transport-plan__mode-radar"
            :class="{ 'global-transport-plan__mode-radar--active': radarEnabledModes.includes(mode) }"
            :aria-label="t('globalMap.radar.openMode', { mode: modeLabel(mode) })"
            :title="t('globalMap.radar.openMode', { mode: modeLabel(mode) })"
            :data-global-map-mode-radar="mode"
            aria-controls="global-map-radar-panel"
            @click.stop="emit('open-radar', mode)"
          >
            <Radar :size="17" aria-hidden="true" />
          </button>
          <button
            v-if="availableModes.includes(mode)"
            type="button"
            class="global-transport-plan__mode-preset-detail"
            :aria-label="t('globalMap.page.viewModeLines', { mode: modeLabel(mode) })"
            @click.stop="emit('open-line-panel', mode)"
          >
            <ChevronRight :size="18" :stroke-width="2.05" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="global-transport-plan__filter-actions">
        <button
          type="button"
          class="global-transport-plan__customize-button"
          :class="{ 'global-transport-plan__customize-button--custom': activePreset === undefined }"
          data-global-map-customize
          aria-controls="global-map-customization"
          aria-expanded="false"
          @click="emit('open-customization')"
        >
          <span class="global-transport-plan__customize-icon" aria-hidden="true">
            <SlidersHorizontal :size="19" :stroke-width="2.1" />
          </span>
          <span class="global-transport-plan__customize-copy">
            <strong>
              {{ activePreset === undefined ? t("globalMap.page.customView") : t("globalMap.page.customizeMap") }}
            </strong>
            <small v-if="activePreset === undefined">{{ customSummary }}</small>
          </span>
          <ChevronRight class="global-transport-plan__customize-arrow" :size="18" :stroke-width="2.05" aria-hidden="true" />
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ChevronRight, LayoutGrid, Layers, Radar, SlidersHorizontal } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import GlobalTransportPlanModeIcon from "./GlobalTransportPlanModeIcon.vue";
import type { GlobalTransportPlanPreset } from "./globalTransportPlanModes";

const {
  primaryModes,
  availableModes,
  activePreset,
  customSummary,
  modeLabel,
  modeColor,
  embedded = false,
  radarEnabledModes = [],
} = defineProps<{
  primaryModes: GlobalMapMode[];
  availableModes: GlobalMapMode[];
  activePreset?: GlobalTransportPlanPreset;
  customSummary: string;
  modeLabel: (mode: GlobalMapMode) => string;
  modeColor: (mode: GlobalMapMode) => string;
  embedded?: boolean;
  radarEnabledModes?: readonly GlobalMapMode[];
}>();

const emit = defineEmits<{
  "select-preset": [preset: GlobalTransportPlanPreset];
  "open-customization": [];
  "open-line-panel": [mode: GlobalMapMode];
  "request-preset-install": [mode: GlobalMapMode];
  "open-radar": [mode: GlobalMapMode];
}>();

const { t } = useI18n();

function isModeAvailable(mode: GlobalMapMode): boolean {
  return availableModes.includes(mode);
}

function handleModeClick(mode: GlobalMapMode): void {
  if (isModeAvailable(mode)) {
    emit("select-preset", mode);
    return;
  }
  emit("request-preset-install", mode);
}
</script>

<style scoped>
.global-transport-plan__filters {
  display: block;
  width: 100%;
  min-width: 0;
}
.global-transport-plan__filter-group {
  display: grid;
  gap: 0;
  width: 100%;
  min-width: 0;
  padding: 16px 13px 13px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow:
    0 13px 30px rgba(15, 23, 42, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(15px) saturate(1.02);
}
.global-transport-plan__filters--embedded .global-transport-plan__filter-group {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}
.global-transport-plan__filter-heading {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  min-width: 0;
  padding: 0 3px 15px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.19);
}
.global-transport-plan__filter-heading-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(110, 168, 255, 0.2);
  border-radius: 14px;
  background: #f2f7ff;
  color: #5279b3;
}
.global-transport-plan__filter-heading-copy {
  min-width: 0;
  padding-top: 2px;
}
.global-transport-plan__filter-heading h2 {
  color: #172642;
  font-size: 1.03rem;
  font-weight: 820;
  letter-spacing: -0.025em;
  line-height: 1.15;
}
.global-transport-plan__filter-heading p {
  margin-top: 5px;
  color: #78869b;
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1.25;
}
.global-transport-plan__mode-list {
  display: grid;
  gap: 4px;
  padding-top: 12px;
}
.global-transport-plan__mode-preset-row {
  position: relative;
  display: flex;
  align-items: stretch;
  min-width: 0;
  min-height: 43px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 11px;
  background: #fff;
  color: #2d3b53;
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.global-transport-plan__mode-preset-row::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 3px;
  border-radius: 999px;
  background: #6ea8ff;
  content: "";
  opacity: 0;
  transform: scaleY(0.65);
  transition: opacity 140ms ease, transform 140ms ease;
}
.global-transport-plan__mode-preset-row:hover {
  border-color: rgba(148, 163, 184, 0.18);
  background: #fbfdff;
}
.global-transport-plan__mode-preset-row--active {
  border-color: #7db1f5;
  background: #f2f7ff;
  box-shadow: 0 3px 10px rgba(78, 132, 201, 0.08);
}
.global-transport-plan__mode-preset-row--active::before {
  opacity: 1;
  transform: scaleY(1);
}
.global-transport-plan__mode-preset-row--disabled {
  opacity: 0.4;
}
.global-transport-plan__mode-preset-select,
.global-transport-plan__mode-preset-detail,
.global-transport-plan__mode-radar {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.global-transport-plan__mode-preset-select {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 10px;
  justify-content: flex-start;
  min-width: 0;
  padding: 5px 8px 5px 12px;
  text-align: left;
}
.global-transport-plan__mode-preset-select:disabled {
  cursor: not-allowed;
}
.global-transport-plan__mode-preset-select:not(:disabled):hover .global-transport-plan__mode-icon {
  transform: scale(1.04);
}
.global-transport-plan__mode-preset-select:focus-visible,
.global-transport-plan__mode-preset-detail:focus-visible,
.global-transport-plan__mode-radar:focus-visible,
.global-transport-plan__customize-button:focus-visible {
  position: relative;
  z-index: 1;
  outline: 3px solid rgba(110, 168, 255, 0.34);
  outline-offset: -2px;
}
.global-transport-plan__mode-preset-detail,
.global-transport-plan__mode-radar {
  display: inline-flex;
  flex: 0 0 37px;
  align-items: center;
  justify-content: center;
  margin: 5px 4px 5px 0;
  border-radius: 8px;
  color: #8aa0bc;
  transition: background 140ms ease, color 140ms ease, transform 140ms ease;
}
.global-transport-plan__mode-preset-detail:hover,
.global-transport-plan__mode-radar:hover {
  background: rgba(110, 168, 255, 0.1);
  color: #4d78b6;
  transform: translateX(1px);
}
.global-transport-plan__mode-radar--active {
  background: #dbeafe;
  color: #2563eb;
}
.global-transport-plan__mode-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 31px;
  border: 1px solid color-mix(in srgb, var(--mode-color, #64748b) 14%, #fff);
  border-radius: 9px;
  background: color-mix(in srgb, var(--mode-color, #64748b) 6%, #fff);
  color: color-mix(in srgb, var(--mode-color, #64748b) 74%, #2b405f);
  transition: transform 140ms ease;
}
.global-transport-plan__mode-icon--all {
  border-color: rgba(110, 168, 255, 0.2);
  background: #fff;
  color: #5279b3;
}
.global-transport-plan__mode-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
  font-weight: 770;
}
.global-transport-plan__filter-actions {
  padding-top: 12px;
  margin-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.19);
}
.global-transport-plan__customize-button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  min-height: 46px;
  padding: 6px 8px 6px 10px;
  border: 1px solid rgba(110, 168, 255, 0.25);
  border-radius: 11px;
  background: #f8fbff;
  color: #416795;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
}
.global-transport-plan__customize-button:hover {
  border-color: rgba(110, 168, 255, 0.52);
  background: #f2f7ff;
  transform: translateY(-1px);
}
.global-transport-plan__customize-button--custom {
  border-color: rgba(110, 168, 255, 0.52);
  background: #f2f7ff;
}
.global-transport-plan__customize-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 31px;
  border: 1px solid rgba(110, 168, 255, 0.22);
  border-radius: 9px;
  background: #fff;
  color: #5279b3;
}
.global-transport-plan__customize-copy {
  display: grid;
  min-width: 0;
  line-height: 1.2;
}
.global-transport-plan__customize-copy strong {
  overflow: hidden;
  color: #315b91;
  font-size: 0.75rem;
  font-weight: 820;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.global-transport-plan__customize-copy small {
  margin-top: 3px;
  overflow: hidden;
  color: #6f86a4;
  font-size: 0.65rem;
  font-weight: 690;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.global-transport-plan__customize-arrow {
  flex: 0 0 auto;
  margin-left: auto;
  color: #8aa0bc;
}

@media (min-width: 701px) {
  .global-transport-plan__filter-group {
    padding: 13px 11px 10px;
  }
  .global-transport-plan__filter-heading {
    padding-bottom: 11px;
  }
  .global-transport-plan__mode-list {
    gap: 2px;
    padding-top: 8px;
  }
  .global-transport-plan__mode-preset-row {
    min-height: 38px;
  }
  .global-transport-plan__mode-preset-select {
    min-height: 0;
    padding: 3px 7px 3px 10px;
  }
  .global-transport-plan__mode-preset-detail,
  .global-transport-plan__mode-radar {
    flex-basis: 30px;
    min-height: 0;
    padding: 0;
    margin: 3px 3px 3px 0;
  }
  .global-transport-plan__mode-icon {
    width: 28px;
    height: 28px;
  }
  .global-transport-plan__mode-label {
    font-size: 0.74rem;
  }
  .global-transport-plan__filter-actions {
    padding-top: 8px;
    margin-top: 7px;
  }
  .global-transport-plan__customize-button {
    min-height: 40px;
  }
  .global-transport-plan__customize-icon {
    width: 29px;
    height: 29px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .global-transport-plan__mode-preset-row,
  .global-transport-plan__mode-preset-row::before,
  .global-transport-plan__mode-preset-select,
  .global-transport-plan__mode-preset-detail,
  .global-transport-plan__mode-radar,
  .global-transport-plan__mode-icon,
  .global-transport-plan__customize-button {
    transition: none;
  }
}
</style>
