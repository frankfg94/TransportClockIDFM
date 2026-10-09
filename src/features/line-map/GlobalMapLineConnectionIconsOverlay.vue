<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { usePreferredReducedMotion } from "@vueuse/core";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { SELECTED_LINE_CONNECTION_METRICS } from "../transport-map/render/selectedLineLabelLayout";
import { STATION_LABEL_TRANSLATION_DURATION_MS } from "../transport-map/render/stationLabelTranslation";
import type { GlobalMapLine } from "../transport-map/contracts/manifest";
import type {
  SelectedLineAnnotationLayout,
  SelectedLineLabelOrientation,
} from "../transport-map/render/selectedLineLabelLayout";
import { createGlobalLineConnectionIconEntries } from "./globalLineConnectionIcons";
import type { GlobalLineConnectionStation } from "./globalLineMetadata";

interface ConnectionIconGroup extends GlobalLineConnectionStation {
  lines: GlobalMapLine[];
}

const props = defineProps<{
  enabled: boolean;
  groups: readonly ConnectionIconGroup[];
  orientation: SelectedLineLabelOrientation;
  layout?: SelectedLineAnnotationLayout;
  reduceMotion?: boolean;
}>();
const preferredReducedMotion = usePreferredReducedMotion();
const animationEnabled = computed(() => !props.reduceMotion && preferredReducedMotion.value !== "reduce");

const liveIconGroups = computed(() => {
  if (!props.layout) return [];
  const boxesByStationId = new Map(
    props.layout.connectionIconBoxes.map((box) => [box.stationId, box]),
  );

  return props.groups.flatMap((group) => {
    const lines = createGlobalLineConnectionIconEntries(group.lines);
    if (lines.length === 0) return [];
    const box = boxesByStationId.get(group.station.id);
    if (!box) return [];

    return [{
      id: group.station.id,
      stationName: group.station.name,
      orientation: props.orientation,
      ...box,
      lines,
    }];
  });
});
// Keep the last geometry until the pop-out completes, even though the shared
// Deck layout switches back to its normal positions as soon as logos are off.
const iconGroups = shallowRef(liveIconGroups.value);
watch([() => props.enabled, liveIconGroups], ([enabled, groups]) => {
  if (enabled) iconGroups.value = groups;
}, { immediate: true });
</script>

<template>
  <div
    v-if="iconGroups.length"
    class="global-map-line-connection-icons-overlay"
    data-testid="global-map-line-connection-icons"
    aria-hidden="true"
    :style="{
      '--connection-icon-width': `${SELECTED_LINE_CONNECTION_METRICS.iconWidth}px`,
      '--connection-icon-height': `${SELECTED_LINE_CONNECTION_METRICS.iconHeight}px`,
      '--connection-icon-gap': `${SELECTED_LINE_CONNECTION_METRICS.iconGap}px`,
      '--connection-padding-x': `${SELECTED_LINE_CONNECTION_METRICS.paddingX}px`,
      '--connection-padding-y': `${SELECTED_LINE_CONNECTION_METRICS.paddingY}px`,
    }"
  >
    <Transition name="connection-connectors" :css="animationEnabled">
      <svg
        v-if="enabled"
        class="global-map-line-connection-icons-overlay__connectors"
        aria-hidden="true"
        focusable="false"
      >
        <line
          v-for="group in iconGroups"
          :key="`connector:${group.id}`"
          :x1="group.anchorX"
          :y1="group.anchorY"
          :x2="group.orientation === 'vertical' ? group.left + group.width : group.left + group.width / 2"
          :y2="group.orientation === 'vertical' ? group.top + group.height / 2 : group.top"
        />
      </svg>
    </Transition>
    <TransitionGroup name="connection-pop" :css="animationEnabled" :duration="animationEnabled ? STATION_LABEL_TRANSLATION_DURATION_MS : 0" appear>
      <span
        v-for="group in enabled ? iconGroups : []"
        :key="group.id"
        class="global-map-line-connection-icons__group"
        :class="`global-map-line-connection-icons__group--${group.orientation}`"
        :data-station-id="group.id"
        :data-station-name="group.stationName"
        :data-label-side="group.side"
        :data-layout-left="group.left"
        :data-layout-top="group.top"
        :data-layout-width="group.width"
        :data-layout-height="group.height"
        :style="{
          left: `${group.left}px`,
          top: `${group.top}px`,
          width: `${group.width}px`,
          height: `${group.height}px`,
        }"
      >
        <span
          class="global-map-line-connection-icons__badges"
          data-testid="global-map-line-connection-list"
        >
          <LineIconBadge
            v-for="entry in group.lines"
            :key="entry.line.id"
            :line="entry.presentation"
            compact
            eager
          />
        </span>
      </span>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.global-map-line-connection-icons-overlay {
  position: absolute;
  z-index: 5;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.global-map-line-connection-icons-overlay__connectors {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.global-map-line-connection-icons-overlay__connectors line {
  stroke: rgba(24, 35, 63, .28);
  stroke-linecap: round;
  stroke-width: 1px;
}

.global-map-line-connection-icons__group {
  position: absolute;
  z-index: 1;
  display: block;
  transform-origin: right center;
}

.global-map-line-connection-icons__group--horizontal { transform-origin: center top; }

.connection-pop-enter-active { animation: connection-pop-in .5s ease-out both; }
.connection-pop-leave-active { animation: connection-pop-out .5s ease-in both; }
.connection-connectors-enter-active,
.connection-connectors-leave-active { transition: opacity .5s ease; }
.connection-connectors-enter-from,
.connection-connectors-leave-to { opacity: 0; }

@keyframes connection-pop-in {
  0% { opacity: 0; transform: scale(.65); }
  65% { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes connection-pop-out {
  0% { opacity: 1; transform: scale(1); }
  20% { opacity: 1; transform: scale(1.06); }
  100% { opacity: 0; transform: scale(.65); }
}

@media (prefers-reduced-motion: reduce) {
  .connection-pop-enter-active,
  .connection-pop-leave-active { animation-duration: 1ms; }
  .connection-connectors-enter-active,
  .connection-connectors-leave-active { transition-duration: 1ms; }
}

.global-map-line-connection-icons__badges {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: var(--connection-icon-gap);
  padding: var(--connection-padding-y) var(--connection-padding-x);
  border: 1px solid rgba(24, 35, 63, .16);
  border-radius: 6px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 2px 6px rgba(15, 23, 42, .16);
  width: 100%;
  height: 100%;
}

.global-map-line-connection-icons__badges :deep(.line-icon-badge) {
  box-sizing: border-box;
  flex: 0 0 var(--connection-icon-width);
  height: var(--connection-icon-height);
  min-width: 0;
  width: var(--connection-icon-width);
}

.global-map-line-connection-icons__badges :deep(.line-icon-badge img) {
  max-height: var(--connection-icon-height);
  max-width: var(--connection-icon-width);
}

.global-map-line-connection-icons__badges :deep(.line-icon-badge__fallback) {
  height: 22px;
  width: var(--connection-icon-width);
}

.global-map-line-connection-icons__badges :deep(.line-icon-badge__label) {
  min-width: 0;
  width: 100%;
  padding: 0 2px;
  font-size: .6rem;
}

</style>
