<script setup lang="ts">
import { Footprints } from "lucide-vue-next";
import { useI18n } from "../i18n";
import type { NearbyPlace } from "../features/nearby-stations/nearbyPlaces";

type PlaceTooltipPlacement = "above" | "below" | "left" | "right";

defineProps<{
  place: NearbyPlace;
  typeLabel: string;
  walkingMinutes: number;
  placement?: PlaceTooltipPlacement;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="place-tooltip"
    :class="`place-tooltip--${placement ?? 'above'}`"
    data-testid="place-tooltip"
    role="tooltip"
  >
    <strong class="place-tooltip__name">{{ place.name }}</strong>
    <span class="place-tooltip__type">{{ typeLabel }}</span>
    <span class="place-tooltip__walking">
      <Footprints :size="14" aria-hidden="true" />
      {{ t("nearbyStations.walkingTime", { minutes: walkingMinutes }) }}
    </span>
  </div>
</template>

<style scoped>
.place-tooltip {
  align-items: center;
  backdrop-filter: blur(5px);
  background: rgba(255, 255, 255, .97);
  border: 1px solid rgba(16, 35, 63, .16);
  border-radius: 8px;
  bottom: calc(100% + 8px);
  box-shadow: 0 4px 12px rgba(16, 35, 63, .2);
  color: #18233f;
  display: grid;
  gap: 3px;
  left: 50%;
  max-width: min(190px, calc(100vw - 28px));
  min-width: 126px;
  padding: 6px 8px 7px;
  pointer-events: none;
  position: absolute;
  text-align: center;
  transform: translateX(-50%);
  white-space: nowrap;
  z-index: 100;
}
.place-tooltip--below { bottom: auto; top: calc(100% + 8px); }
.place-tooltip--left { bottom: 50%; left: auto; right: calc(100% + 8px); transform: translateY(50%); }
.place-tooltip--right { bottom: 50%; left: calc(100% + 8px); transform: translateY(50%); }
.place-tooltip__name { font-size: .68rem; font-weight: 850; max-width: 174px; overflow: hidden; text-overflow: ellipsis; }
.place-tooltip__type { color: #64748b; font-size: .6rem; font-weight: 750; overflow: hidden; text-overflow: ellipsis; }
.place-tooltip__walking { align-items: center; color: #5146ff; display: inline-flex; font-size: .63rem; font-weight: 850; gap: 4px; justify-content: center; line-height: 1.1; }
</style>
