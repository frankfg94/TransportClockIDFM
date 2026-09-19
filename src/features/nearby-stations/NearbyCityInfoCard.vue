<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Bike, BusFront, CableCar, Info, Minus, Search, TrainFront, TramFront } from "lucide-vue-next";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";

export interface NearbyCityInfoCardTransportMode {
  mode: GlobalMapMode;
  label: string;
  count: number;
}

export interface NearbyCityInfoCardItem {
  label: string;
  value?: string;
  transportModes?: readonly NearbyCityInfoCardTransportMode[];
  action?: "places-ranking";
  actionLabel?: string;
}

const props = defineProps<{
  ariaLabel: string;
  cityName: string;
  eyebrow: string;
  items: readonly NearbyCityInfoCardItem[];
  collapseLabel: string;
  expandLabel: string;
  selectedTransportMode?: GlobalMapMode;
}>();

const emit = defineEmits<{
  "transport-mode-toggle": [mode: GlobalMapMode];
  "item-action": [action: NonNullable<NearbyCityInfoCardItem["action"]>];
}>();

const isCollapsed = ref(false);
let hasUserToggled = false;
let mobileMedia: MediaQueryList | undefined;

function syncMobileDefault(media: { matches: boolean }): void {
  if (!hasUserToggled) isCollapsed.value = media.matches;
}

function toggleCollapsed(): void {
  hasUserToggled = true;
  isCollapsed.value = !isCollapsed.value;
}

onMounted(() => {
  if (typeof window.matchMedia !== "function") return;
  mobileMedia = window.matchMedia("(max-width: 680px)");
  syncMobileDefault(mobileMedia);
  mobileMedia.addEventListener?.("change", syncMobileDefault);
});

onBeforeUnmount(() => {
  mobileMedia?.removeEventListener?.("change", syncMobileDefault);
  mobileMedia = undefined;
});
</script>

<template>
  <article
    class="nearby-city-info-card"
    :class="{ 'nearby-city-info-card--collapsed': isCollapsed }"
    data-testid="nearby-city-info-card"
    :aria-label="ariaLabel"
  >
    <button
      v-if="isCollapsed"
      class="nearby-city-info-card__collapsed-toggle"
      data-testid="nearby-city-info-card-expand"
      type="button"
      :aria-expanded="false"
      :aria-label="expandLabel"
      :title="expandLabel"
      @click.stop="toggleCollapsed"
    >
      <Info :size="21" :stroke-width="2.4" aria-hidden="true" />
    </button>
    <template v-else>
      <header class="nearby-city-info-card__header">
        <p class="nearby-city-info-card__eyebrow">{{ eyebrow }}</p>
        <h2>{{ cityName }}</h2>
        <button
          class="nearby-city-info-card__collapse-toggle"
          data-testid="nearby-city-info-card-collapse"
          type="button"
          :aria-expanded="true"
          :aria-label="collapseLabel"
          :title="collapseLabel"
          @click.stop="toggleCollapsed"
        >
          <Minus :size="17" :stroke-width="2.7" aria-hidden="true" />
        </button>
      </header>
      <dl class="nearby-city-info-card__facts">
        <div
          v-for="item in items"
          :key="item.label"
          class="nearby-city-info-card__fact"
          :class="{ 'nearby-city-info-card__fact--transport': item.transportModes?.length }"
        >
          <dt>{{ item.label }}</dt>
          <dd v-if="item.transportModes?.length" class="nearby-city-info-card__transport-modes">
            <button
              v-for="transport in item.transportModes"
              :key="transport.mode"
              type="button"
              class="nearby-city-info-card__transport-mode"
              :class="{
                'nearby-city-info-card__transport-mode--selected': props.selectedTransportMode === transport.mode,
              }"
              :data-transport-mode="transport.mode"
              :aria-label="`${transport.label}: ${transport.count}`"
              :aria-pressed="props.selectedTransportMode === transport.mode"
              :title="`${transport.label}: ${transport.count}`"
              @click.stop="emit('transport-mode-toggle', transport.mode)"
            >
              <BusFront
                v-if="transport.mode === 'BUS' || transport.mode === 'NOCTILIEN'"
                :size="13"
                :stroke-width="2.6"
                aria-hidden="true"
              />
              <TramFront
                v-else-if="transport.mode === 'TRAM'"
                :size="13"
                :stroke-width="2.6"
                aria-hidden="true"
              />
              <CableCar
                v-else-if="transport.mode === 'CABLE'"
                :size="13"
                :stroke-width="2.6"
                aria-hidden="true"
              />
              <Bike
                v-else-if="transport.mode === 'BIKE'"
                :size="13"
                :stroke-width="2.6"
                aria-hidden="true"
              />
              <TrainFront
                v-else
                :size="13"
                :stroke-width="2.6"
                aria-hidden="true"
              />
              <span class="nearby-city-info-card__transport-label">{{ transport.label }}</span>
              <strong>{{ transport.count }}</strong>
            </button>
          </dd>
          <dd v-else-if="item.action" class="nearby-city-info-card__action-value">
            <span>{{ item.value }}</span>
            <button
              type="button"
              class="nearby-city-info-card__action"
              :aria-label="item.actionLabel || item.value"
              :title="item.actionLabel || item.value"
              :data-city-info-action="item.action"
              @pointerdown.stop
              @click.stop="emit('item-action', item.action)"
            >
              <Search :size="13" :stroke-width="2.6" aria-hidden="true" />
            </button>
          </dd>
          <dd v-else>{{ item.value }}</dd>
        </div>
      </dl>
    </template>
  </article>
</template>

<style scoped>
.nearby-city-info-card {
  align-content: start;
  backdrop-filter: blur(12px);
  background: rgba(255, 255, 255, .95);
  border: 1px solid rgba(81, 70, 255, .18);
  border-radius: 16px;
  box-shadow: 0 10px 26px rgba(16, 35, 63, .18);
  display: grid;
  gap: 11px;
  left: 12px;
  max-width: min(258px, calc(100% - 24px));
  padding: 13px;
  pointer-events: none;
  position: absolute;
  top: 12px;
  width: min(258px, calc(100% - 24px));
  z-index: 13;
}

.nearby-city-info-card__header {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding-right: 30px;
  position: relative;
}

.nearby-city-info-card__collapse-toggle,
.nearby-city-info-card__collapsed-toggle {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  color: #5146ff;
  cursor: pointer;
  display: inline-flex;
  justify-content: center;
  padding: 0;
  pointer-events: auto;
}

.nearby-city-info-card__collapse-toggle {
  border-radius: 8px;
  height: 28px;
  position: absolute;
  right: -2px;
  top: -4px;
  width: 28px;
}

.nearby-city-info-card__collapse-toggle:hover,
.nearby-city-info-card__collapse-toggle:focus-visible {
  background: #f0efff;
  outline: 0;
}

.nearby-city-info-card--collapsed {
  align-items: center;
  display: flex;
  height: 44px;
  justify-content: center;
  max-width: none;
  padding: 0;
  width: 44px;
}

.nearby-city-info-card__collapsed-toggle {
  border-radius: 50%;
  height: 100%;
  width: 100%;
}

.nearby-city-info-card__collapsed-toggle:hover,
.nearby-city-info-card__collapsed-toggle:focus-visible {
  background: #f0efff;
  outline: 0;
}

.nearby-city-info-card__eyebrow {
  color: #7168d8;
  font-size: .61rem;
  font-weight: 900;
  letter-spacing: .1em;
  margin: 0;
  text-transform: uppercase;
}

.nearby-city-info-card h2 {
  color: #18233f;
  font-size: 1.12rem;
  line-height: 1.15;
  margin: 0;
  overflow-wrap: anywhere;
}

.nearby-city-info-card__facts {
  display: grid;
  gap: 5px;
  margin: 0;
}

.nearby-city-info-card__fact {
  align-items: baseline;
  background: #f7f8fc;
  border: 1px solid rgba(100, 116, 139, .13);
  border-radius: 8px;
  display: flex;
  font-size: .67rem;
  gap: 8px;
  justify-content: space-between;
  line-height: 1.25;
  padding: 6px 7px;
}

.nearby-city-info-card__fact dt {
  color: #64748b;
  min-width: 0;
}

.nearby-city-info-card__fact dd {
  color: #18233f;
  font-weight: 850;
  margin: 0;
  max-width: 62%;
  overflow-wrap: anywhere;
  text-align: right;
}
.nearby-city-info-card__action-value {
  align-items: center;
  display: inline-flex;
  gap: 5px;
  max-width: 70% !important;
}
.nearby-city-info-card__action {
  align-items: center;
  appearance: none;
  background: #fff;
  border: 1px solid rgba(81, 70, 255, .22);
  border-radius: 6px;
  color: #5146ff;
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  min-height: 23px;
  min-width: 23px;
  padding: 3px;
  pointer-events: auto;
}
.nearby-city-info-card__action:hover,
.nearby-city-info-card__action:focus-visible {
  background: #f0efff;
  border-color: rgba(81, 70, 255, .5);
  outline: 0;
  transform: translateY(-1px);
}

.nearby-city-info-card__fact--transport {
  align-items: start;
}

.nearby-city-info-card__fact--transport dt {
  padding-top: 4px;
}

.nearby-city-info-card__transport-modes {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
  max-width: none !important;
  min-width: 0;
}

.nearby-city-info-card__transport-mode {
  align-items: center;
  appearance: none;
  background: #fff;
  border: 1px solid rgba(81, 70, 255, .16);
  border-radius: 999px;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  gap: 3px;
  line-height: 1;
  padding: 4px 5px;
  pointer-events: auto;
  transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease, transform 160ms ease;
  white-space: nowrap;
}

.nearby-city-info-card__transport-mode:hover,
.nearby-city-info-card__transport-mode:focus-visible {
  background: #f0efff;
  border-color: rgba(81, 70, 255, .38);
  box-shadow: 0 3px 8px rgba(81, 70, 255, .16);
  outline: 0;
  transform: translateY(-1px);
}

.nearby-city-info-card__transport-mode--selected {
  background: #5146ff;
  border-color: #5146ff;
  box-shadow: 0 4px 10px rgba(81, 70, 255, .24);
  color: #fff;
}

.nearby-city-info-card__transport-mode--selected:hover,
.nearby-city-info-card__transport-mode--selected:focus-visible {
  background: #4034df;
  border-color: #4034df;
}

.nearby-city-info-card__transport-mode svg {
  color: #5146ff;
  flex: 0 0 auto;
}

.nearby-city-info-card__transport-label {
  color: #53617d;
  font-size: .61rem;
  font-weight: 800;
}

.nearby-city-info-card__transport-mode--selected .nearby-city-info-card__transport-label,
.nearby-city-info-card__transport-mode--selected svg {
  color: #fff;
}

.nearby-city-info-card__transport-mode strong {
  font-size: .67rem;
  font-weight: 950;
}

@media (max-width: 680px) {
  .nearby-city-info-card {
    gap: 8px;
    padding: 10px;
    top: 64px;
  }

  .nearby-city-info-card--collapsed {
    gap: 0;
    padding: 0;
  }

  .nearby-city-info-card__fact {
    padding: 5px 6px;
  }

  .nearby-city-info-card__transport-mode {
    min-height: 32px;
    padding: 3px 5px;
  }
}
</style>
