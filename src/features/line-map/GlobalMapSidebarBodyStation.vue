<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronDown, MapPinned, Train } from "lucide-vue-next";
import StationTransferDetails from "../../components/StationTransferDetails.vue";
import AnnualRidershipStationCard from "./AnnualRidershipStationCard.vue";
import UserFriendlyTraffic from "../../components/UserFriendlyTraffic.vue";
import { useI18n } from "../../i18n";
import {
  createLinePresentation,
  transitFamilyToMode,
} from "../../services/linePresentation";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import type { GlobalMapLine } from "../transport-map/contracts/manifest";
import type { TransitFamily, TransferLineOption } from "../../types/transit";
import type {
  GlobalMapSidebarBodyEmits,
  GlobalMapSidebarBodyProps,
} from "./globalMapSidebarBodyTypes";

const props = defineProps<GlobalMapSidebarBodyProps>();
const emit = defineEmits<GlobalMapSidebarBodyEmits>();
const { t } = useI18n();
const entrancesExpanded = ref(false);

const transfers = computed<TransferLineOption[]>(() => props.lines.map((line) => {
  const family = toFamily(line.mode);
  const mode = family ? transitFamilyToMode(family) : toMode(line.mode);
  const label = line.label || line.code;
  const presentation = createLinePresentation({
    code: line.code,
    color: line.color,
    family,
    id: line.id,
    longName: line.label,
    mode,
    ref: line.sourceLineId ?? line.id,
    shortName: label,
    textColor: line.textColor,
  });

  return {
    id: line.id,
    // `code` is the internal Cxxxxx identity. The public line label is what
    // the station card must display and what the user can select.
    label,
    family,
    mode,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: presentation.iconUrl,
    iconUrls: presentation.iconUrls,
    ref: line.sourceLineId ?? line.id,
  };
}));

const isMajorStation = computed(() =>
  props.lines.length >= GLOBAL_TRANSPORT_PLAN_CONFIG.search.majorStationMinLines,
);

watch(() => props.station?.id, () => {
  entrancesExpanded.value = false;
});

function updateHoveredLine(transfer?: TransferLineOption): void {
  emit("hover-line", transfer?.id);
}

function toFamily(mode: GlobalMapLine["mode"]): TransitFamily | undefined {
  if (mode === "METRO") return "METRO";
  if (mode === "RER") return "RER";
  if (mode === "TRAM") return "TRAM";
  if (mode === "BUS") return "BUS";
  if (mode === "NOCTILIEN") return "NOCTILIEN";
  if (mode === "TRANSILIEN" || mode === "TRAIN") return "TRANSILIEN";
  if (mode === "CABLE") return "CABLE";
  return undefined;
}

function toMode(mode: GlobalMapLine["mode"]): string {
  if (mode === "METRO") return "metro";
  if (mode === "RER") return "rer";
  if (mode === "TRAM") return "tram";
  if (mode === "BUS" || mode === "NOCTILIEN") return "bus";
  return "train";
}
</script>

<template>
  <div v-if="station" class="global-map-picker-sidebar__station-profile">
    <section class="global-map-picker-sidebar__station-heading">
      <Train v-if="isMajorStation" :size="24" aria-hidden="true" />
      <div>
        <strong>{{ station.name }}</strong>
        <span>{{ station.city ?? t("globalMap.search.cityFallback") }}</span>
        <small>{{ t("globalMap.sidebar.connections", { count: props.lines.length }) }}</small>
      </div>
    </section>

    <UserFriendlyTraffic
      v-if="trafficDisruption && !isLinePreview"
      :disruption="trafficDisruption"
      compact
      collapsible
    />

    <AnnualRidershipStationCard
      :station="ridershipStation"
      :loading="ridershipStationLoading"
      :unavailable="ridershipStationUnavailable"
      :ranking="ridershipStationRanking"
      :scope="ridershipStationScope"
      :scope-options="ridershipStationScopeOptions"
      @update:scope="emit('update:scope', $event)"
    />

    <StationTransferDetails
      :station-label="station.name"
      :city="station.city"
      :transfers="transfers"
      :loading="false"
      :rich-details="false"
      :active-transfer-id="hoveredLineId"
      @hover-transfer="updateHoveredLine"
      @select-transfer="emit('select-line', $event.id)"
    />

    <section v-if="entrances.length" class="global-map-picker-sidebar__card">
      <div class="global-map-picker-sidebar__card-title">
        <button
          id="global-map-picker-sidebar-entrances-toggle"
          class="global-map-picker-sidebar__accordion-trigger"
          :class="{ 'global-map-picker-sidebar__accordion-trigger--expanded': entrancesExpanded }"
          type="button"
          aria-controls="global-map-picker-sidebar-entrances"
          :aria-expanded="entrancesExpanded"
          @click="entrancesExpanded = !entrancesExpanded"
        >
          <span><MapPinned :size="18" aria-hidden="true" />{{ t("globalMap.sidebar.exits") }}</span>
          <ChevronDown :size="16" aria-hidden="true" />
        </button>
        <small>{{ entrances.length }}</small>
      </div>
      <ul
        v-if="entrancesExpanded"
        id="global-map-picker-sidebar-entrances"
        class="global-map-picker-sidebar__list"
        aria-labelledby="global-map-picker-sidebar-entrances-toggle"
      >
        <li v-for="item in numberedEntrances" :key="item.entrance.id">
          <button
            class="global-map-picker-sidebar__entrance"
            :class="{ 'global-map-picker-sidebar__entrance--focused': item.entrance.id === focusedEntranceId }"
            type="button"
            :aria-label="t('globalMap.sidebar.focusEntranceAria', { exit: item.displayCode })"
            :aria-pressed="item.entrance.id === focusedEntranceId"
            :data-entrance-id="item.entrance.id"
            data-testid="global-map-picker-focus-entrance"
            @click="emit('focus-entrance', item.entrance)"
          >
            <strong>{{ t("globalMap.sidebar.exitWithCode", { code: item.displayCode }) }}</strong>
            <span>{{ item.entrance.name }}</span>
          </button>
        </li>
      </ul>
    </section>

    <button class="global-map-picker-sidebar__primary-action" type="button" :disabled="dashboardBusy" @click="emit('add-active-station')">
      {{ t("globalMap.sidebar.addDashboard") }}
    </button>
  </div>
</template>
