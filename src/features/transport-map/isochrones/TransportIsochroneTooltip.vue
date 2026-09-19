<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../../i18n";
import type { GlobalIsochroneMinutes } from "./contracts";

export interface TransportIsochroneTooltipItem {
  minutes: GlobalIsochroneMinutes;
  transport: string;
  zoneIndex: number;
}

const props = defineProps<{
  items: readonly TransportIsochroneTooltipItem[];
  style?: Record<string, string>;
}>();

const { t } = useI18n();
const ariaLabel = computed(() => props.items
  .map((item) => t("globalMap.page.tooltip.walkingAccess", { minutes: item.minutes, transport: item.transport }))
  .join(" · "));
</script>

<template>
  <div
    v-if="items.length"
    class="transport-isochrone-tooltip"
    role="tooltip"
    :aria-label="ariaLabel"
    :style="style"
  >
    <span v-for="item in items" :key="`${item.transport}:${item.minutes}`" class="transport-isochrone-tooltip__row">
      <i :data-zone-index="item.zoneIndex" aria-hidden="true" />
      <span>{{ t("globalMap.page.tooltip.walkingAccess", { minutes: item.minutes, transport: item.transport }) }}</span>
    </span>
  </div>
</template>

<style scoped>
.transport-isochrone-tooltip {
  position: absolute;
  z-index: 30;
  display: grid;
  gap: 4px;
  min-width: 190px;
  max-width: min(300px, calc(100% - 16px));
  padding: 7px 9px;
  border: 1px solid rgba(51, 65, 85, .2);
  border-radius: 9px;
  background: rgba(255, 255, 255, .95);
  color: #334155;
  font-size: .7rem;
  font-weight: 700;
  line-height: 1.35;
  box-shadow: 0 6px 18px rgba(16, 35, 63, .16);
  pointer-events: none;
  white-space: normal;
}
.transport-isochrone-tooltip__row { display: flex; align-items: flex-start; gap: 7px; min-width: 0; }
.transport-isochrone-tooltip__row > span { min-width: 0; }
.transport-isochrone-tooltip__row i {
  display: block;
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  margin-top: 2px;
  border: 1px solid rgba(51, 65, 85, .2);
  border-radius: 50%;
}
.transport-isochrone-tooltip__row i[data-zone-index="0"] { background: rgba(34, 197, 94, .58); }
.transport-isochrone-tooltip__row i[data-zone-index="1"] { background: rgba(134, 239, 172, .62); }
.transport-isochrone-tooltip__row i[data-zone-index="2"] { background: rgba(250, 204, 21, .62); }
</style>
