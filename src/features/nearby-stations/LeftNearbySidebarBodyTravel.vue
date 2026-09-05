<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ArrowLeft,
  AlarmClock,
  AlarmClockCheck,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock3,
  Footprints,
  LoaderCircle,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type { TransitFamily } from "../../types/transit";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import type { NearbyJourneySection, RouteExit } from "./nearbyHeavyTransports";
import NearbyAddressSearch from "./NearbyAddressSearch.vue";
import { selectFastestRouteExit } from "./travelBoundary";
import type { TravelRoute } from "./useTravelRoutes";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";

const props = withDefaults(defineProps<{
  originLabel?: string;
  origin?: GeocoderPoint;
  originSearch?: (query: string, signal?: AbortSignal) => Promise<GeocoderPoint[]>;
  originSavedSuggestions?: readonly GeocoderPoint[];
  showOriginSave?: boolean;
  editableOrigin?: boolean;
  showRouteAlarms?: boolean;
  showLineIcons?: boolean;
  currentLocationAvailable?: boolean;
  currentLocationLabel?: string;
  destination?: GeocoderPoint;
  destinationSearch?: (query: string, signal?: AbortSignal) => Promise<GeocoderPoint[]>;
  autocompletePlaces?: boolean;
  departureDateTime?: string;
  availableModes?: readonly GlobalMapMode[];
  allowedModes?: readonly GlobalMapMode[];
  modeLabel?: (mode: GlobalMapMode) => string;
  resolveLineId?: (section: NearbyJourneySection) => string | undefined;
  routes: readonly TravelRoute[];
  selectedRouteId?: string;
  loading?: boolean;
  error?: Error;
  trafficToneForLine?: (section: NearbyJourneySection) => "orange" | "red" | undefined;
  routeAlarmActive?: (route: TravelRoute) => boolean;
  walkingRoutes?: Readonly<Record<string, NearbyWalkingRoute | undefined>>;
  getSectionExits?: (section: NearbyJourneySection) => readonly RouteExit[];
}>(), {
  editableOrigin: false,
  showRouteAlarms: true,
  showLineIcons: true,
  currentLocationAvailable: false,
  showOriginSave: false,
});
const emit = defineEmits<{
  origin: [point: GeocoderPoint];
  destination: [point: GeocoderPoint];
  "update:departureDateTime": [value: string];
  "update:allowedModes": [modes: GlobalMapMode[]];
  selectRoute: [route: TravelRoute];
  scheduleRouteAlarm: [route: TravelRoute];
  refresh: [];
  useCurrentLocation: [];
  saveOrigin: [point: GeocoderPoint];
}>();

type JourneySectionKind = "walking" | "waiting" | "transit" | "other";

const { d, t } = useI18n();
const destinationModel = computed({
  get: () => props.destination,
  set: (point) => { if (point) emit("destination", point); },
});
const originModel = computed({
  get: () => props.origin,
  set: (point) => { if (point) emit("origin", point); },
});
const expandedRouteId = ref<string>();
const expandedSectionKeys = ref<Set<string>>(new Set());
const timePickerOpen = ref(false);
const draftDepartureDate = ref("");
const draftDepartureTime = ref("");
const activeRoute = computed(() => props.routes.find((route) => route.id === expandedRouteId.value));
const activeRouteArrivalExits = computed<readonly RouteExit[]>(() => {
  const route = activeRoute.value;
  const getSectionExits = props.getSectionExits;
  if (!route || !getSectionExits) return [];

  const arrivalTransitSection = [...route.sections]
    .reverse()
    .find((section) => sectionKind(section) === "transit");
  return arrivalTransitSection ? getSectionExits(arrivalTransitSection) : [];
});
const activeRouteArrivalPoint = computed(() =>
  props.destination ?? activeRoute.value?.sections.at(-1)?.toPoint,
);
const activeRouteFastestExit = computed(() => selectFastestRouteExit(
  activeRouteArrivalExits.value,
  activeRouteArrivalPoint.value,
));
const fewestTransfersRouteId = computed(() => {
  const best = props.routes.reduce<TravelRoute | undefined>((candidate, route) => {
    if (!candidate) return route;
    const routeTransfers = route.transferCount ?? 0;
    const candidateTransfers = candidate.transferCount ?? 0;
    return routeTransfers < candidateTransfers
      || (routeTransfers === candidateTransfers && route.durationSeconds < candidate.durationSeconds)
      ? route
      : candidate;
  }, undefined);
  return best?.id;
});
const availableTravelModes = computed(() => props.availableModes ?? []);
const allowedTravelModes = computed(() => props.allowedModes ?? availableTravelModes.value);
const formattedDepartureDateTime = computed(() => {
  const value = props.departureDateTime;
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/u);
  if (!match) return "";

  return d(new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00`), {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    weekday: "short",
  });
});

watch(
  () => props.routes.map((route) => route.id).join("|"),
  () => {
    if (expandedRouteId.value && !props.routes.some((route) => route.id === expandedRouteId.value)) {
      backToRoutes();
    }
  },
);

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60
    ? t("nearbyStations.travel.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
    : t("nearbyStations.travel.minutes", { minutes });
}

function localDateTimeParts(value?: string): { date: string; time: string } {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/u);
  if (match) return { date: match[1]!, time: match[2]! };

  const now = new Date();
  return {
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  };
}

function openTimePicker(): void {
  const parts = localDateTimeParts(props.departureDateTime);
  draftDepartureDate.value = parts.date;
  draftDepartureTime.value = parts.time;
  timePickerOpen.value = true;
}

function toggleTimePicker(): void {
  if (timePickerOpen.value) {
    cancelTimePicker();
    return;
  }
  openTimePicker();
}

function cancelTimePicker(): void {
  timePickerOpen.value = false;
}

function selectDepartureNow(): void {
  timePickerOpen.value = false;
  emit("update:departureDateTime", "");
}

function clearDepartureTime(): void {
  timePickerOpen.value = false;
  emit("update:departureDateTime", "");
}

function applyTimePicker(): void {
  if (!draftDepartureDate.value || !draftDepartureTime.value) return;
  emit("update:departureDateTime", `${draftDepartureDate.value}T${draftDepartureTime.value}`);
  timePickerOpen.value = false;
}

function isTravelModeAllowed(mode: GlobalMapMode): boolean {
  return allowedTravelModes.value.includes(mode);
}

function toggleTravelMode(mode: GlobalMapMode, enabled: boolean): void {
  const next = new Set(allowedTravelModes.value);
  if (enabled) next.add(mode);
  else next.delete(mode);
  emit("update:allowedModes", [...next]);
}

function travelModeLabel(mode: GlobalMapMode): string {
  return props.modeLabel?.(mode) ?? mode;
}

function formatTime(value?: string): string {
  const match = value?.match(/T(\d{2}):?(\d{2})(?::?\d{2})?/u)
    ?? value?.match(/(?:^|[^\d])(\d{2}):?(\d{2})(?:\d{2})?$/u);
  return match ? `${match[1] ?? match[2]}:${match[2] ?? match[3]}` : "";
}

function clockMinutes(value?: string): number | undefined {
  const match = value?.match(/T(\d{2}):?(\d{2})(?::?(\d{2}))?/u)
    ?? value?.match(/(?:^|[^\d])(\d{2}):?(\d{2})(?:\d{2})?$/u);
  if (!match) return undefined;
  const hours = Number(match[1] ?? match[2]);
  const minutes = Number(match[2] ?? match[3]);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : undefined;
}

function formatClockMinutes(value: number): string {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function journeyDateTimeMs(value?: string): number | undefined {
  if (!value) return undefined;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/u);
  if (compact) {
    const date = new Date(
      Number(compact[1]),
      Number(compact[2]) - 1,
      Number(compact[3]),
      Number(compact[4]),
      Number(compact[5]),
      Number(compact[6] ?? "0"),
    );
    return Number.isFinite(date.getTime()) ? date.getTime() : undefined;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sectionStartMs(route: TravelRoute, sectionIndex: number): number | undefined {
  const section = route.sections[sectionIndex];
  const explicit = journeyDateTimeMs(section?.departureDateTime);
  if (explicit !== undefined) return explicit;
  const routeStart = journeyDateTimeMs(route.departureDateTime);
  if (routeStart === undefined) return undefined;
  return routeStart + route.sections
    .slice(0, sectionIndex)
    .reduce((sum, candidate) => sum + Math.max(0, candidate.durationSeconds) * 1000, 0);
}

function sectionEndMs(route: TravelRoute, sectionIndex: number): number | undefined {
  const section = route.sections[sectionIndex];
  const explicit = journeyDateTimeMs(section?.arrivalDateTime);
  if (explicit !== undefined) return explicit;
  const start = sectionStartMs(route, sectionIndex);
  return start === undefined ? undefined : start + Math.max(0, section?.durationSeconds ?? 0) * 1000;
}

function sectionClockTime(route: TravelRoute, sectionIndex: number): string {
  const start = sectionStartMs(route, sectionIndex);
  if (start === undefined) return "";
  const date = new Date(start);
  return formatClockMinutes(date.getHours() * 60 + date.getMinutes());
}

function waitingGapSeconds(route: TravelRoute, sectionIndex: number): number {
  if (sectionIndex <= 0 || sectionIsWaiting(route.sections[sectionIndex]!)) return 0;
  const currentStart = sectionStartMs(route, sectionIndex);
  const previousEnd = sectionEndMs(route, sectionIndex - 1);
  if (currentStart === undefined || previousEnd === undefined) return 0;
  const seconds = Math.round((currentStart - previousEnd) / 1000);
  return seconds >= 60 ? seconds : 0;
}

function waitingGapClockTime(route: TravelRoute, sectionIndex: number): string {
  const previousEnd = sectionEndMs(route, sectionIndex - 1);
  if (previousEnd === undefined) return "";
  const date = new Date(previousEnd);
  return formatClockMinutes(date.getHours() * 60 + date.getMinutes());
}

function sectionFamily(section: NearbyJourneySection): TransitFamily {
  if (section.lineMode === "METRO") return "METRO";
  if (section.lineMode === "RER") return "RER";
  if (section.lineMode === "TRAM") return "TRAM";
  if (section.lineMode === "CABLE") return "CABLE";
  if (section.lineMode === "TRAIN" || section.lineMode === "TRANSILIEN") return "TRANSILIEN";
  if (section.lineMode === "NOCTILIEN") return "NOCTILIEN";
  return "BUS";
}

function sectionBadge(section: NearbyJourneySection) {
  const family = sectionFamily(section);
  const identity = props.resolveLineId?.(section) ?? section.lineId ?? section.lineCode;
  const presentation = createLinePresentation({
    id: identity,
    code: section.lineCode,
    family,
    mode: transitFamilyToMode(family),
    ref: identity,
    shortName: section.lineCode,
    color: section.lineColor,
    textColor: section.lineTextColor,
  });
  return {
    id: identity,
    ref: identity,
    label: section.lineCode || "?",
    family,
    mode: transitFamilyToMode(family),
    ...presentation,
  };
}

function sectionCode(section: NearbyJourneySection): string {
  return section.lineCode || section.lineAliases?.[0] || "?";
}

function sectionIsWalking(section: NearbyJourneySection): boolean {
  const value = `${section.type ?? ""} ${section.mode ?? ""}`.toLocaleLowerCase("fr-FR");
  return value.includes("walking") || value.includes("walk") || value.includes("transfer") || value.includes("foot");
}

function sectionIsWaiting(section: NearbyJourneySection): boolean {
  const value = `${section.type ?? ""} ${section.mode ?? ""}`.toLocaleLowerCase("fr-FR");
  return value.includes("waiting") || value.includes("wait");
}

function sectionIsTransit(section: NearbyJourneySection): boolean {
  return Boolean(section.lineId || section.lineCode || section.lineMode);
}

function sectionKind(section: NearbyJourneySection): JourneySectionKind {
  if (sectionIsWalking(section)) return "walking";
  if (sectionIsWaiting(section)) return "waiting";
  if (sectionIsTransit(section)) return "transit";
  return "other";
}

function sectionIsTransferWalk(section: NearbyJourneySection): boolean {
  return (section.type ?? "").toLocaleLowerCase("fr-FR").includes("transfer");
}

function sectionModeLabel(section: NearbyJourneySection): string {
  const family = sectionFamily(section);
  const labels: Record<TransitFamily, string> = {
    METRO: t("nearbyStations.travel.modes.metro"),
    RER: t("nearbyStations.travel.modes.rer"),
    TRAM: t("nearbyStations.travel.modes.tram"),
    TRANSILIEN: t("nearbyStations.travel.modes.train"),
    BUS: t("nearbyStations.travel.modes.bus"),
    NOCTILIEN: t("nearbyStations.travel.modes.noctilien"),
    CABLE: t("nearbyStations.travel.modes.cable"),
  };
  return labels[family];
}

function sectionTitle(section: NearbyJourneySection): string {
  return `${sectionModeLabel(section)} ${sectionCode(section)}`;
}

function compactSections(route: TravelRoute): Array<{ section: NearbyJourneySection; index: number }> {
  return route.sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => sectionKind(section) !== "other");
}

function sectionStationNames(section: NearbyJourneySection): string[] {
  const provided = section.stopNames ?? [];
  const candidates = provided.length > 0 ? provided : [section.fromName, section.toName];
  const seen = new Set<string>();
  return candidates
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name) => {
      const key = name.toLocaleLowerCase("fr-FR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sectionDirection(section: NearbyJourneySection): string {
  return section.direction?.trim() || section.toName?.trim() || "";
}

function sectionStopsLabel(section: NearbyJourneySection): string {
  const count = section.stopNames?.filter((name) => Boolean(name.trim())).length ?? 0;
  return count > 0 ? t("nearbyStations.travel.stops", { count }) : "";
}

function walkingRouteForSection(route: TravelRoute, sectionIndex: number): NearbyWalkingRoute | undefined {
  return props.walkingRoutes?.[`${route.id}:walk:${sectionIndex}`];
}

function sectionDurationSeconds(route: TravelRoute, sectionIndex: number, section: NearbyJourneySection): number {
  return sectionIsWalking(section)
    ? walkingRouteForSection(route, sectionIndex)?.durationSeconds ?? section.durationSeconds
    : section.durationSeconds;
}

function formatWalkingDistance(route: TravelRoute, sectionIndex: number, section: NearbyJourneySection): string {
  const distanceMeters = walkingRouteForSection(route, sectionIndex)?.distanceMeters ?? section.distanceMeters;
  if (!Number.isFinite(distanceMeters)) return "";
  const meters = Math.round(distanceMeters ?? 0);
  return t("nearbyStations.travel.distanceMeters", { meters });
}

function sectionKey(routeId: string, sectionIndex: number): string {
  return `${routeId}:section:${sectionIndex}`;
}

function isSectionExpanded(routeId: string, sectionIndex: number): boolean {
  return expandedSectionKeys.value.has(sectionKey(routeId, sectionIndex));
}

function toggleSection(routeId: string, sectionIndex: number): void {
  const key = sectionKey(routeId, sectionIndex);
  const next = new Set(expandedSectionKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedSectionKeys.value = next;
}

function openRoute(route: TravelRoute): void {
  expandedRouteId.value = route.id;
  expandedSectionKeys.value = new Set();
  emit("selectRoute", route);
}

function backToRoutes(): void {
  expandedRouteId.value = undefined;
  expandedSectionKeys.value = new Set();
}

function isRouteAlarmActive(route: TravelRoute): boolean {
  return props.routeAlarmActive?.(route) ?? false;
}

function routeAlarmLabel(route: TravelRoute): string {
  return t(
    isRouteAlarmActive(route)
      ? "nearbyStations.travel.routeAlarmSet"
      : "nearbyStations.travel.routeAlarmSchedule",
  );
}
</script>

<template>
  <div class="left-nearby-travel">
    <section class="left-nearby-travel__inputs">
      <label>
        <span>{{ t("nearbyStations.travel.origin") }}</span>
        <NearbyAddressSearch
          v-if="editableOrigin"
          v-model="originModel"
          :placeholder="t('nearbyStations.travel.originPlaceholder')"
          :search="originSearch"
          :humanize-coordinates="editableOrigin"
          :autocomplete-places="autocompletePlaces"
          :saved-suggestions="originSavedSuggestions"
        />
        <input v-else :value="origin?.label ?? originLabel ?? ''" type="text" disabled />
        <button
          v-if="currentLocationAvailable"
          class="left-nearby-travel__current-location"
          type="button"
          @click="emit('useCurrentLocation')"
        >
          <MapPin :size="15" aria-hidden="true" />
          {{ currentLocationLabel }}
        </button>
        <button
          v-if="showOriginSave && origin"
          class="left-nearby-travel__save-origin"
          type="button"
          :aria-label="t('nearbyStations.travel.saveOriginAria')"
          @click="emit('saveOrigin', origin)"
        >
          <MapPin :size="15" aria-hidden="true" />
          {{ t("nearbyStations.travel.saveOrigin") }}
        </button>
      </label>
      <NearbyAddressSearch
        v-model="destinationModel"
        :label="t('nearbyStations.travel.destination')"
        :placeholder="t('nearbyStations.travel.destinationPlaceholder')"
        :search="destinationSearch"
        :humanize-coordinates="true"
        :autocomplete-places="autocompletePlaces"
      />
    </section>

    <details class="left-nearby-travel__advanced-filters">
      <summary>
        <SlidersHorizontal :size="15" aria-hidden="true" />
        <span>{{ t("nearbyStations.travel.advancedFilters") }}</span>
        <ChevronDown :size="15" aria-hidden="true" />
      </summary>
      <div
        v-if="availableTravelModes.length > 0"
        class="left-nearby-travel__mode-options"
        role="group"
        :aria-label="t('nearbyStations.travel.allowedModes')"
      >
        <label v-for="mode in availableTravelModes" :key="mode" class="left-nearby-travel__mode-option">
          <input
            type="checkbox"
            :checked="isTravelModeAllowed(mode)"
            @change="toggleTravelMode(mode, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ travelModeLabel(mode) }}</span>
        </label>
      </div>

    <section
      class="left-nearby-travel__time-card"
      :class="{ 'left-nearby-travel__time-card--scheduled': Boolean(departureDateTime) }"
      :aria-labelledby="'nearby-travel-departure-title'"
    >
      <div class="left-nearby-travel__time-header">
        <span class="left-nearby-travel__time-icon">
          <CalendarClock :size="18" aria-hidden="true" />
        </span>
        <span class="left-nearby-travel__time-copy">
          <strong id="nearby-travel-departure-title">{{ t("nearbyStations.travel.departureTimeTitle") }}</strong>
          <small>
            {{ formattedDepartureDateTime || t("nearbyStations.travel.departureTimeHint") }}
          </small>
        </span>
        <button
          v-if="departureDateTime"
          class="left-nearby-travel__time-clear"
          type="button"
          :aria-label="t('nearbyStations.travel.departureTimeClear')"
          @click="clearDepartureTime"
        >
          <X :size="15" aria-hidden="true" />
        </button>
      </div>

      <div class="left-nearby-travel__time-options" role="group" :aria-label="t('nearbyStations.travel.departureTimeOptions')">
        <button
          class="left-nearby-travel__time-now"
          :class="{ 'left-nearby-travel__time-now--active': !departureDateTime }"
          type="button"
          @click="selectDepartureNow"
        >
          <Clock3 :size="15" aria-hidden="true" />
          {{ t("nearbyStations.travel.departureNow") }}
        </button>
        <div class="left-nearby-travel__time-picker-wrap">
          <button
            class="left-nearby-travel__time-picker"
            :class="{ 'left-nearby-travel__time-picker--active': Boolean(departureDateTime) }"
            type="button"
            :aria-expanded="timePickerOpen"
            aria-haspopup="dialog"
            :aria-label="t('nearbyStations.travel.departureTime')"
            @click="toggleTimePicker"
          >
            <CalendarClock :size="15" aria-hidden="true" />
            <span>{{ formattedDepartureDateTime || (departureDateTime ? t("nearbyStations.travel.departureChange") : t("nearbyStations.travel.departurePlan")) }}</span>
          </button>
          <div
            v-if="timePickerOpen"
            class="left-nearby-travel__time-popover"
            role="dialog"
            :aria-label="t('nearbyStations.travel.departureTime')"
            @keydown.esc.prevent="cancelTimePicker"
          >
            <label>
              <span>{{ t("nearbyStations.travel.departureDate") }}</span>
              <input v-model="draftDepartureDate" type="date" />
            </label>
            <label>
              <span>{{ t("nearbyStations.travel.departureClock") }}</span>
              <input v-model="draftDepartureTime" type="time" step="60" />
            </label>
            <div class="left-nearby-travel__time-popover-actions">
              <button type="button" class="button-secondary" @click="cancelTimePicker">
                {{ t("common.actions.cancel") }}
              </button>
              <button type="button" @click="applyTimePicker">
                {{ t("common.actions.confirm") }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
    </details>

    <div class="left-nearby-travel__heading">
      <strong>{{ t("nearbyStations.travel.suggestions") }}</strong>
      <button type="button" :disabled="loading || !destination" :aria-label="t('common.actions.refresh')" @click="emit('refresh')">
        <RefreshCw :size="15" aria-hidden="true" />
      </button>
    </div>

    <div v-if="loading" class="left-nearby-travel__state" role="status">
      <LoaderCircle class="left-nearby-travel__spin" :size="21" />{{ t("nearbyStations.travel.loading") }}
    </div>
    <div v-else-if="error" class="left-nearby-travel__state left-nearby-travel__state--error" role="alert">
      <TriangleAlert :size="20" />{{ t("nearbyStations.travel.error") }}
    </div>
    <div v-else-if="destination && routes.length === 0" class="left-nearby-travel__state">
      {{ t("nearbyStations.travel.empty") }}
    </div>

    <div
      class="left-nearby-travel__routes"
      :class="{ 'left-nearby-travel__routes--detail': Boolean(activeRoute) }"
    >
      <section
        v-if="activeRoute"
        class="left-nearby-travel__route-detail"
        :aria-label="t('nearbyStations.travel.routeDetails')"
      >
        <header class="left-nearby-travel__detail-header">
          <button
            class="left-nearby-travel__back"
            type="button"
            :aria-label="t('nearbyStations.travel.backToRoutes')"
            @click="backToRoutes"
          >
            <ArrowLeft :size="19" aria-hidden="true" />
          </button>
          <div class="left-nearby-travel__detail-title">
            <strong>{{ t("nearbyStations.travel.routeDetails") }}</strong>
            <span v-if="formatTime(activeRoute.departureDateTime) && formatTime(activeRoute.arrivalDateTime)">
              <Clock3 :size="13" aria-hidden="true" />
              {{ formatTime(activeRoute.departureDateTime) }}–{{ formatTime(activeRoute.arrivalDateTime) }}
            </span>
          </div>
          <button
            v-if="showRouteAlarms"
            class="left-nearby-travel__route-alarm left-nearby-travel__route-alarm--detail"
            :class="{ 'left-nearby-travel__route-alarm--active': isRouteAlarmActive(activeRoute) }"
            type="button"
            :disabled="!activeRoute.departureDateTime"
            :aria-label="routeAlarmLabel(activeRoute)"
            :title="routeAlarmLabel(activeRoute)"
            @click="emit('scheduleRouteAlarm', activeRoute)"
          >
            <AlarmClockCheck v-if="isRouteAlarmActive(activeRoute)" :size="16" aria-hidden="true" />
            <AlarmClock v-else :size="16" aria-hidden="true" />
          </button>
          <strong class="left-nearby-travel__detail-duration">{{ formatDuration(activeRoute.durationSeconds) }}</strong>
        </header>

        <div class="left-nearby-travel__detail-summary">
          <div class="left-nearby-travel__detail-badges" :aria-label="t('nearbyStations.travel.legs')">
            <template v-if="activeRoute.transitSections.length">
              <span
                v-for="(section, sectionIndex) in activeRoute.transitSections"
                :key="`${activeRoute.id}:detail-badge:${sectionIndex}`"
                class="left-nearby-travel__badge"
              >
                <LineIconBadge v-if="showLineIcons" :line="sectionBadge(section)" compact eager />
                <span v-else class="left-nearby-travel__route-line-label">{{ sectionCode(section) }}</span>
                <i v-if="trafficToneForLine?.(section)" :class="`left-nearby-travel__traffic--${trafficToneForLine(section)}`">!</i>
              </span>
            </template>
            <Footprints v-else :size="18" aria-hidden="true" />
          </div>
          <div class="left-nearby-travel__detail-meta">
            <span v-if="formatTime(activeRoute.departureDateTime) && formatTime(activeRoute.arrivalDateTime)">
              <Clock3 :size="13" aria-hidden="true" />
              {{ formatTime(activeRoute.departureDateTime) }}–{{ formatTime(activeRoute.arrivalDateTime) }}
            </span>
            <span>{{ t("nearbyStations.travel.transfers", { count: activeRoute.transferCount ?? 0 }) }}</span>
          </div>
        </div>

        <div class="left-nearby-travel__timeline" role="list" :aria-label="t('nearbyStations.travel.legs')">
          <template v-for="(section, sectionIndex) in activeRoute.sections" :key="`${activeRoute.id}:detail-section:${sectionIndex}`">
            <article
              v-if="waitingGapSeconds(activeRoute, sectionIndex) > 0"
              class="left-nearby-travel__timeline-item left-nearby-travel__timeline-item--inferred-wait"
              role="listitem"
            >
              <div class="left-nearby-travel__timeline-row">
                <span class="left-nearby-travel__timeline-time">{{ waitingGapClockTime(activeRoute, sectionIndex) }}</span>
                <span class="left-nearby-travel__timeline-rail" aria-hidden="true">
                  <span class="left-nearby-travel__timeline-node left-nearby-travel__timeline-node--waiting">
                    <Clock3 :size="14" />
                  </span>
                </span>
                <span class="left-nearby-travel__timeline-copy">
                  <strong>{{ t("nearbyStations.travel.waiting") }} {{ formatDuration(waitingGapSeconds(activeRoute, sectionIndex)) }}</strong>
                  <small v-if="section.fromName">{{ section.fromName }}</small>
                </span>
                <span />
              </div>
            </article>

            <article
              class="left-nearby-travel__timeline-item"
              :class="{ 'left-nearby-travel__timeline-item--expanded': isSectionExpanded(activeRoute.id, sectionIndex) }"
              role="listitem"
            >
            <button
              v-if="sectionKind(section) === 'transit'"
              class="left-nearby-travel__timeline-row left-nearby-travel__timeline-row--button"
              type="button"
              :aria-expanded="isSectionExpanded(activeRoute.id, sectionIndex)"
              :aria-controls="`${activeRoute.id}:detail-stations:${sectionIndex}`"
              :aria-label="isSectionExpanded(activeRoute.id, sectionIndex)
                ? t('nearbyStations.travel.collapseLine', { line: sectionCode(section) })
                : t('nearbyStations.travel.expandLine', { line: sectionCode(section) })"
              @click="toggleSection(activeRoute.id, sectionIndex)"
            >
              <span class="left-nearby-travel__timeline-time">{{ sectionClockTime(activeRoute, sectionIndex) }}</span>
              <span class="left-nearby-travel__timeline-rail" aria-hidden="true">
                <span
                  class="left-nearby-travel__timeline-node left-nearby-travel__timeline-node--transit"
                  :style="{ '--section-color': section.lineColor ?? '#5146ff' }"
                />
              </span>
              <span class="left-nearby-travel__timeline-copy">
                <span class="left-nearby-travel__timeline-line">
                  <LineIconBadge v-if="showLineIcons" :line="sectionBadge(section)" compact eager />
                  <strong>{{ sectionTitle(section) }}</strong>
                  <small v-if="sectionStopsLabel(section)">· {{ sectionStopsLabel(section) }}</small>
                </span>
                <span class="left-nearby-travel__timeline-subtitle">
                  <span v-if="sectionDirection(section)">{{ t("nearbyStations.travel.direction", { direction: sectionDirection(section) }) }}</span>
                  <span v-if="section.durationSeconds"> · {{ formatDuration(section.durationSeconds) }}</span>
                </span>
              </span>
              <ChevronDown
                class="left-nearby-travel__timeline-chevron"
                :class="{ 'left-nearby-travel__timeline-chevron--expanded': isSectionExpanded(activeRoute.id, sectionIndex) }"
                :size="18"
                aria-hidden="true"
              />
            </button>

            <div
              v-else-if="sectionKind(section) === 'walking' || sectionKind(section) === 'waiting'"
              class="left-nearby-travel__timeline-row"
            >
              <span class="left-nearby-travel__timeline-time">{{ sectionClockTime(activeRoute, sectionIndex) }}</span>
              <span class="left-nearby-travel__timeline-rail" aria-hidden="true">
                <span
                  class="left-nearby-travel__timeline-node"
                  :class="`left-nearby-travel__timeline-node--${sectionKind(section)}`"
                >
                  <Footprints v-if="sectionKind(section) === 'walking'" :size="14" />
                  <Clock3 v-else :size="14" />
                </span>
              </span>
              <span class="left-nearby-travel__timeline-copy">
                <strong>
                  {{ sectionKind(section) === "walking"
                    ? (sectionIsTransferWalk(section) ? t("nearbyStations.travel.walkingTransfer") : t("nearbyStations.travel.walking"))
                    : t("nearbyStations.travel.waiting") }}
                  {{ formatDuration(sectionDurationSeconds(activeRoute, sectionIndex, section)) }}
                </strong>
                <small v-if="sectionKind(section) === 'walking' && formatWalkingDistance(activeRoute, sectionIndex, section)">{{ formatWalkingDistance(activeRoute, sectionIndex, section) }}</small>
                <small v-else-if="section.fromName">{{ section.fromName }}</small>
              </span>
              <span />
            </div>

            <div
              v-if="sectionKind(section) === 'transit' && isSectionExpanded(activeRoute.id, sectionIndex)"
              :id="`${activeRoute.id}:detail-stations:${sectionIndex}`"
              class="left-nearby-travel__stations"
              role="list"
            >
              <div
                v-for="(station, stationIndex) in sectionStationNames(section)"
                :key="`${activeRoute.id}:detail-station:${sectionIndex}:${stationIndex}`"
                class="left-nearby-travel__station"
                role="listitem"
              >
                <span class="left-nearby-travel__station-rail" aria-hidden="true"><span /></span>
                <span>{{ station }}</span>
              </div>
              <p v-if="sectionStationNames(section).length === 0" class="left-nearby-travel__stations-empty">
                {{ t("nearbyStations.travel.stationDetailsUnavailable") }}
              </p>
            </div>
            </article>
          </template>

          <div
            v-if="activeRouteFastestExit"
            class="left-nearby-travel__exits left-nearby-travel__exits--arrival"
            role="list"
          >
            <strong>{{ t("nearbyStations.travel.exitsAtArrival") }}</strong>
            <div
              :key="activeRouteFastestExit.id"
              class="left-nearby-travel__exit"
              role="listitem"
            >
              <span>
                {{ activeRouteFastestExit.code
                  ? t("nearbyStations.travel.exitWithCodeAndName", { code: activeRouteFastestExit.code, name: activeRouteFastestExit.name })
                  : activeRouteFastestExit.name }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <template v-else>
        <article
          v-for="(route, index) in routes"
          :key="route.id"
          class="left-nearby-travel__route"
          :class="{ 'left-nearby-travel__route--selected': route.id === selectedRouteId }"
        >
          <div class="left-nearby-travel__route-compact-row">
            <button
              class="left-nearby-travel__route-compact"
              type="button"
              :aria-label="t('nearbyStations.travel.openRoute', { duration: formatDuration(route.durationSeconds) })"
              @click="openRoute(route)"
            >
              <span class="left-nearby-travel__route-duration">
                <strong>{{ formatDuration(route.durationSeconds) }}</strong>
                <span v-if="formatTime(route.departureDateTime) && formatTime(route.arrivalDateTime)">
                  <Clock3 :size="12" aria-hidden="true" />
                  {{ formatTime(route.departureDateTime) }}–{{ formatTime(route.arrivalDateTime) }}
                </span>
                <span>{{ t("nearbyStations.travel.transfers", { count: route.transferCount ?? 0 }) }}</span>
                <span v-if="index === 0" class="left-nearby-travel__recommended">{{ t("nearbyStations.travel.recommended") }}</span>
                <span v-if="route.id === fewestTransfersRouteId" class="left-nearby-travel__fewest-transfers">{{ t("nearbyStations.travel.fewestTransfers") }}</span>
              </span>

              <span class="left-nearby-travel__route-chain" :aria-label="t('nearbyStations.travel.legs')">
                <template v-for="(compactSection, compactIndex) in compactSections(route)" :key="`${route.id}:compact:${compactSection.index}`">
                  <ChevronRight v-if="compactIndex > 0" class="left-nearby-travel__route-chain-arrow" :size="14" aria-hidden="true" />
                  <span class="left-nearby-travel__route-segment">
                    <span class="left-nearby-travel__route-segment-icon">
                      <Footprints v-if="sectionKind(compactSection.section) === 'walking'" :size="17" aria-hidden="true" />
                      <Clock3 v-else-if="sectionKind(compactSection.section) === 'waiting'" :size="15" aria-hidden="true" />
                      <span v-else class="left-nearby-travel__route-line-badge">
                        <LineIconBadge
                          v-if="showLineIcons"
                          :line="sectionBadge(compactSection.section)"
                          compact
                          eager
                        />
                        <span v-else class="left-nearby-travel__route-line-label">
                          {{ sectionCode(compactSection.section) }}
                        </span>
                        <i v-if="trafficToneForLine?.(compactSection.section)" :class="`left-nearby-travel__traffic--${trafficToneForLine(compactSection.section)}`">!</i>
                      </span>
                    </span>
                    <small>{{ formatDuration(sectionDurationSeconds(route, compactSection.index, compactSection.section)) }}</small>
                  </span>
                </template>
                <Footprints v-if="compactSections(route).length === 0" :size="17" aria-hidden="true" />
              </span>

              <ChevronRight class="left-nearby-travel__route-open" :size="18" aria-hidden="true" />
            </button>
            <button
              v-if="showRouteAlarms"
              class="left-nearby-travel__route-alarm"
              :class="{ 'left-nearby-travel__route-alarm--active': isRouteAlarmActive(route) }"
              type="button"
              :disabled="!route.departureDateTime"
              :aria-label="routeAlarmLabel(route)"
              :title="routeAlarmLabel(route)"
              @click.stop="emit('scheduleRouteAlarm', route)"
            >
              <AlarmClockCheck v-if="isRouteAlarmActive(route)" :size="16" aria-hidden="true" />
              <AlarmClock v-else :size="16" aria-hidden="true" />
            </button>
          </div>
        </article>
      </template>
    </div>
  </div>
</template>

<style scoped>
.left-nearby-travel { display: flex; flex: 1 1 auto; flex-direction: column; height: 100%; min-height: 0; min-width: 0; }
.left-nearby-travel__inputs { background: #f6f5ff; border-bottom: 1px solid rgba(81,70,255,.12); display: grid; flex: 0 0 auto; gap: 10px; overflow: visible; padding: 14px; position: relative; z-index: 30; }
.left-nearby-travel__inputs > label { display: grid; gap: 5px; }
.left-nearby-travel__current-location { align-items: center; background: transparent; border: 0; color: #5146ff; display: inline-flex; font-size: .7rem; font-weight: 850; gap: 5px; justify-self: start; padding: 0; }
.left-nearby-travel__current-location:hover { color: #4034df; text-decoration: underline; }
.left-nearby-travel__save-origin { align-items: center; background: transparent; border: 0; color: #5146ff; display: inline-flex; font-size: .7rem; font-weight: 850; gap: 5px; justify-self: start; padding: 0; }
.left-nearby-travel__save-origin:hover { color: #4034df; text-decoration: underline; }
.left-nearby-travel__inputs label > span { color: #64748b; font-size: .7rem; font-weight: 850; }
.left-nearby-travel__inputs input:disabled { background: #e9eaf0; border: 1px solid rgba(100,116,139,.18); border-radius: 10px; color: #6b7280; font: inherit; min-height: 42px; opacity: 1; padding: 0 11px; }
.left-nearby-travel__advanced-filters { background: #fff; border-bottom: 1px solid rgba(100,116,139,.14); flex: 0 0 auto; padding: 0 14px; }
.left-nearby-travel__advanced-filters summary { align-items: center; color: #4034df; cursor: pointer; display: flex; font-size: .7rem; font-weight: 900; gap: 6px; list-style: none; min-height: 35px; }
.left-nearby-travel__advanced-filters summary::-webkit-details-marker { display: none; }
.left-nearby-travel__advanced-filters summary svg:last-child { margin-left: auto; transition: transform .16s ease; }
.left-nearby-travel__advanced-filters[open] summary svg:last-child { transform: rotate(180deg); }
.left-nearby-travel__mode-options { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 0 10px; }
.left-nearby-travel__mode-option { align-items: center; background: #f6f5ff; border: 1px solid rgba(81,70,255,.12); border-radius: 999px; color: #334155; display: inline-flex; font-size: .65rem; font-weight: 800; gap: 5px; padding: 5px 8px; }
.left-nearby-travel__mode-option input { accent-color: #5146ff; margin: 0; }
.left-nearby-travel__heading { align-items: center; display: flex; flex: 0 0 auto; justify-content: space-between; padding: 12px 14px 6px; position: relative; z-index: 1; }
.left-nearby-travel__heading strong { color: #18233f; font-size: .78rem; }
.left-nearby-travel__heading button { align-items: center; background: transparent; border: 0; border-radius: 7px; color: #5146ff; display: flex; height: 30px; justify-content: center; width: 30px; }
.left-nearby-travel__time-card { background: linear-gradient(145deg, #faf9ff 0%, #f2f0ff 100%); border: 1px solid rgba(81,70,255,.16); border-radius: 16px; box-shadow: 0 7px 18px rgba(43,35,120,.08); display: grid; flex: 0 0 auto; gap: 11px; margin: 2px 0 12px; padding: 12px; }
.left-nearby-travel__time-card--scheduled { border-color: rgba(81,70,255,.35); box-shadow: 0 8px 20px rgba(81,70,255,.12); }
.left-nearby-travel__time-header { align-items: center; display: grid; gap: 9px; grid-template-columns: auto minmax(0, 1fr) auto; }
.left-nearby-travel__time-icon { align-items: center; background: #e4e1ff; border-radius: 11px; color: #5146ff; display: inline-flex; height: 35px; justify-content: center; width: 35px; }
.left-nearby-travel__time-copy { display: grid; gap: 2px; min-width: 0; }
.left-nearby-travel__time-copy strong { color: #18233f; font-size: .76rem; font-weight: 900; }
.left-nearby-travel__time-copy small { color: #64748b; font-size: .65rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.left-nearby-travel__time-clear { align-items: center; background: rgba(255,255,255,.72); border: 1px solid rgba(81,70,255,.14); border-radius: 8px; color: #64748b; display: inline-flex; height: 28px; justify-content: center; width: 28px; }
.left-nearby-travel__time-clear:hover { background: #fff; color: #5146ff; }
.left-nearby-travel__time-options { display: grid; gap: 6px; grid-template-columns: auto minmax(0, 1fr); }
.left-nearby-travel__time-now, .left-nearby-travel__time-picker { align-items: center; border: 1px solid rgba(81,70,255,.18); border-radius: 10px; display: inline-flex; font: inherit; font-size: .68rem; font-weight: 850; gap: 5px; justify-content: center; min-height: 37px; padding: 0 10px; transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, color .16s ease; }
.left-nearby-travel__time-now { background: rgba(255,255,255,.78); color: #475569; }
.left-nearby-travel__time-now:hover, .left-nearby-travel__time-picker:hover { border-color: rgba(81,70,255,.4); }
.left-nearby-travel__time-now--active { background: #5146ff; border-color: #5146ff; box-shadow: 0 4px 10px rgba(81,70,255,.22); color: #fff; }
.left-nearby-travel__time-picker { background: #fff; color: #4034df; cursor: pointer; min-width: 0; overflow: hidden; position: relative; width: 100%; }
.left-nearby-travel__time-picker--active { background: #eeecff; border-color: rgba(81,70,255,.34); }
.left-nearby-travel__time-picker > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.left-nearby-travel__time-picker-wrap { min-width: 0; position: relative; }
.left-nearby-travel__time-popover { background: #fff; border: 1px solid rgba(81,70,255,.22); border-radius: 12px; box-shadow: 0 12px 26px rgba(15,23,42,.2); display: grid; gap: 9px; left: 0; min-width: 230px; padding: 11px; position: absolute; top: calc(100% + 7px); z-index: 50; }
.left-nearby-travel__time-popover label { display: grid; gap: 4px; }
.left-nearby-travel__time-popover label > span { color: #64748b; font-size: .62rem; font-weight: 850; }
.left-nearby-travel__time-popover input { background: #f8f9fd; border: 1px solid rgba(100,116,139,.24); border-radius: 8px; color: #18233f; font: inherit; min-height: 34px; padding: 5px 7px; }
.left-nearby-travel__time-popover-actions { display: flex; gap: 7px; justify-content: flex-end; }
.left-nearby-travel__time-popover-actions button { font-size: .66rem; min-height: 31px; padding: 5px 9px; }
.left-nearby-travel__state { align-items: center; color: #64748b; display: flex; flex: 0 0 auto; font-size: .78rem; gap: 8px; padding: 18px 14px; }
.left-nearby-travel__state--error { color: #b42318; }
.left-nearby-travel__routes { display: grid; flex: 1 1 auto; gap: 8px; min-height: 0; overflow: auto; padding: 8px 12px 14px; position: relative; z-index: 1; }
.left-nearby-travel__routes--detail { display: block; overflow: hidden; padding: 0; }
.left-nearby-travel__route { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 14px; color: #18233f; min-width: 0; }
.left-nearby-travel__route:hover, .left-nearby-travel__route--selected { border-color: #5146ff; box-shadow: 0 0 0 2px rgba(81,70,255,.1); }
.left-nearby-travel__route-compact-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; min-width: 0; }
.left-nearby-travel__route-compact { align-items: stretch; background: transparent; border: 0; color: inherit; display: grid; gap: 9px; grid-template-columns: minmax(73px, auto) minmax(0, 1fr) auto; padding: 11px; text-align: left; width: 100%; }
.left-nearby-travel__route-compact:focus-visible, .left-nearby-travel__timeline-row--button:focus-visible, .left-nearby-travel__back:focus-visible, .left-nearby-travel__route-alarm:focus-visible { border-radius: 10px; outline: 2px solid #5146ff; outline-offset: -2px; }
.left-nearby-travel__route-duration { align-content: center; border-right: 1px solid rgba(100,116,139,.18); display: grid; gap: 3px; min-width: 0; padding-right: 9px; }
.left-nearby-travel__route-duration strong { font-size: .95rem; font-weight: 950; line-height: 1.05; white-space: nowrap; }
.left-nearby-travel__route-duration > span { align-items: center; color: #64748b; display: inline-flex; font-size: .58rem; gap: 3px; line-height: 1.2; white-space: nowrap; }
.left-nearby-travel__recommended { background: #e9e7ff; border-radius: 999px; color: #4034df !important; font-size: .55rem !important; font-weight: 900; justify-self: start; padding: 3px 5px; }
.left-nearby-travel__fewest-transfers { background: #e8f7ed; border-radius: 999px; color: #16733b !important; font-size: .55rem !important; font-weight: 900; justify-self: start; padding: 3px 5px; }
.left-nearby-travel__route-chain { align-content: center; align-items: flex-start; display: flex; flex-wrap: wrap; gap: 6px 3px; min-width: 0; overflow: visible; }
.left-nearby-travel__route-segment { align-items: center; display: grid; gap: 2px; min-width: 29px; }
.left-nearby-travel__route-segment-icon { align-items: center; display: inline-flex; height: 27px; justify-content: center; min-width: 28px; position: relative; }
.left-nearby-travel__route-segment small { color: #64748b; font-size: .56rem; font-weight: 800; line-height: 1; text-align: center; white-space: nowrap; }
.left-nearby-travel__route-chain-arrow { color: #94a3b8; flex: 0 0 auto; margin-top: 6px; }
.left-nearby-travel__route-open { align-self: center; color: #94a3b8; flex: 0 0 auto; }
.left-nearby-travel__route-alarm { align-items: center; align-self: center; background: transparent; border: 0; border-radius: 8px; color: #94a3b8; display: inline-flex; height: 30px; justify-content: center; margin: 7px 7px 7px 0; padding: 0; width: 30px; }
.left-nearby-travel__route-alarm:hover { background: #f1efff; color: #5146ff; }
.left-nearby-travel__route-alarm--active { color: #5146ff; }
.left-nearby-travel__route-alarm--detail { margin: 0; }
.left-nearby-travel__route-alarm:disabled { color: #cbd5e1; cursor: not-allowed; }
.left-nearby-travel__route-alarm:disabled:hover { background: transparent; }
.left-nearby-travel__route-line-badge { display: inline-flex; position: relative; }
.left-nearby-travel__route-line-label { align-items: center; background: #eeecff; border-radius: 8px; color: #4034df; display: inline-flex; font-size: .78rem; font-weight: 900; height: 26px; justify-content: center; min-width: 28px; padding: 0 5px; }
.left-nearby-travel__route-line-badge :deep(.line-icon-badge) { height: 27px; min-width: 30px; }
.left-nearby-travel__route-line-badge :deep(.line-icon-badge img) { max-height: 27px; max-width: 44px; }
.left-nearby-travel :deep(.line-icon-badge--compact .line-icon-badge__fallback) { height: 26px; }
.left-nearby-travel :deep(.line-icon-badge--compact .line-icon-badge__label) { font-size: .78rem; min-width: 28px; padding: 0 5px; }
.left-nearby-travel__badge { display: inline-flex; position: relative; }
.left-nearby-travel__badge i, .left-nearby-travel__route-line-badge i { align-items: center; border: 2px solid #fff; border-radius: 50%; bottom: -4px; color: #fff; display: flex; font-size: .5rem; font-style: normal; font-weight: 950; height: 14px; justify-content: center; position: absolute; right: -4px; width: 14px; }
.left-nearby-travel__traffic--orange { background: #f59e0b; }
.left-nearby-travel__traffic--red { background: #dc2626; }

.left-nearby-travel__route-detail { background: #fff; display: flex; flex-direction: column; height: 100%; min-height: 0; }
.left-nearby-travel__detail-header { align-items: center; border-bottom: 1px solid rgba(100,116,139,.16); display: grid; flex: 0 0 auto; gap: 9px; grid-template-columns: auto minmax(0, 1fr) auto auto; padding: 10px 12px; }
.left-nearby-travel__back { align-items: center; aspect-ratio: 1; background: #f1f2f8; border: 0; border-radius: 50%; color: #18233f; display: inline-flex; flex: 0 0 34px; height: 34px; justify-content: center; max-height: 34px; min-height: 34px; min-width: 34px; padding: 0; width: 34px; }
.left-nearby-travel__back:hover { background: #e7e5ff; color: #4034df; }
.left-nearby-travel__detail-title { display: grid; gap: 2px; min-width: 0; }
.left-nearby-travel__detail-title strong { color: #18233f; font-size: .78rem; font-weight: 950; }
.left-nearby-travel__detail-title span, .left-nearby-travel__detail-meta span { align-items: center; color: #64748b; display: inline-flex; font-size: .62rem; gap: 3px; }
.left-nearby-travel__detail-duration { color: #18233f; font-size: .9rem; white-space: nowrap; }
.left-nearby-travel__detail-summary { border-bottom: 1px solid rgba(100,116,139,.16); display: grid; flex: 0 0 auto; gap: 8px; padding: 10px 12px; }
.left-nearby-travel__detail-badges { align-items: center; display: flex; flex-wrap: wrap; gap: 5px; }
.left-nearby-travel__detail-badges :deep(.line-icon-badge) { height: 27px; min-width: 30px; }
.left-nearby-travel__detail-badges :deep(.line-icon-badge img) { max-height: 27px; max-width: 48px; }
.left-nearby-travel__detail-meta { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
.left-nearby-travel__timeline { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 5px 12px 14px; }
.left-nearby-travel__timeline-item { border-bottom: 1px solid rgba(100,116,139,.13); position: relative; }
.left-nearby-travel__timeline-item:last-child { border-bottom: 0; }
.left-nearby-travel__timeline-row { align-items: center; background: transparent; border: 0; color: #18233f; display: grid; gap: 7px; grid-template-columns: 42px 25px minmax(0,1fr) 18px; min-height: 62px; padding: 7px 0; text-align: left; width: 100%; }
.left-nearby-travel__timeline-row--button { cursor: pointer; }
.left-nearby-travel__timeline-row--button:hover { background: #fafaff; }
.left-nearby-travel__timeline-time { color: #64748b; font-size: .68rem; font-variant-numeric: tabular-nums; min-width: 0; text-align: left; }
.left-nearby-travel__timeline-rail { align-self: stretch; align-items: center; display: flex; justify-content: center; min-height: 48px; position: relative; }
.left-nearby-travel__timeline-rail::before { background: #dce1ee; content: ""; inset: 0 auto 0 50%; position: absolute; width: 2px; }
.left-nearby-travel__timeline-item:first-child .left-nearby-travel__timeline-rail::before { top: 50%; }
.left-nearby-travel__timeline-item:last-child .left-nearby-travel__timeline-rail::before { bottom: 50%; }
.left-nearby-travel__timeline-node { align-items: center; background: #fff; border: 2px solid #5146ff; border-radius: 50%; color: #5146ff; display: inline-flex; height: 18px; justify-content: center; position: relative; width: 18px; z-index: 1; }
.left-nearby-travel__timeline-node--transit { background: var(--section-color, #5146ff); border-color: var(--section-color, #5146ff); box-shadow: inset 0 0 0 3px #fff; height: 17px; width: 17px; }
.left-nearby-travel__timeline-node--walking { border-color: #5146ff; color: #5146ff; }
.left-nearby-travel__timeline-node--waiting { border-color: #8b5cf6; color: #8b5cf6; }
.left-nearby-travel__timeline-copy { display: grid; gap: 3px; min-width: 0; }
.left-nearby-travel__timeline-line { align-items: center; display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
.left-nearby-travel__timeline-line :deep(.line-icon-badge) { height: 27px; min-width: 30px; }
.left-nearby-travel__timeline-line :deep(.line-icon-badge img) { max-height: 27px; max-width: 48px; }
.left-nearby-travel__timeline-line strong, .left-nearby-travel__timeline-copy > strong { font-size: .76rem; font-weight: 900; line-height: 1.2; }
.left-nearby-travel__timeline-line small { color: #64748b; font-size: .62rem; font-weight: 750; }
.left-nearby-travel__timeline-subtitle, .left-nearby-travel__timeline-copy > small { color: #64748b; font-size: .64rem; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.left-nearby-travel__timeline-chevron { color: #64748b; transition: transform .16s ease; }
.left-nearby-travel__timeline-chevron--expanded { color: #4034df; transform: rotate(180deg); }
.left-nearby-travel__stations { display: grid; gap: 0; margin: -2px 0 8px 74px; padding: 0 0 2px 18px; position: relative; }
.left-nearby-travel__stations::before { background: rgba(81,70,255,.23); content: ""; inset: 0 auto 0 4px; position: absolute; width: 1px; }
.left-nearby-travel__station { align-items: center; color: #334155; display: grid; font-size: .7rem; grid-template-columns: 12px minmax(0,1fr); min-height: 28px; position: relative; }
.left-nearby-travel__station-rail { align-items: center; display: flex; height: 100%; justify-content: center; margin-left: -20px; position: relative; width: 12px; z-index: 1; }
.left-nearby-travel__station-rail span { background: #fff; border: 2px solid #5146ff; border-radius: 50%; height: 8px; width: 8px; }
.left-nearby-travel__stations-empty { color: #64748b; font-size: .68rem; margin: 4px 0; }
.left-nearby-travel__exits { border-top: 1px dashed rgba(81,70,255,.2); display: grid; gap: 5px; margin: 8px 0 3px; padding-top: 8px; }
.left-nearby-travel__exits--arrival { margin: 0 14px 8px 74px; padding-top: 8px; }
.left-nearby-travel__exits > strong { color: #4034df; font-size: .65rem; }
.left-nearby-travel__exit { align-items: baseline; color: #334155; display: flex; font-size: .68rem; gap: 6px; }
.left-nearby-travel__exit small { color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.left-nearby-travel__spin { animation: left-nearby-spin 850ms linear infinite; }
@keyframes left-nearby-spin { to { transform: rotate(360deg); } }
@media (max-width: 420px) {
  .left-nearby-travel__route-compact { grid-template-columns: minmax(66px, auto) minmax(0, 1fr) auto; padding: 10px 9px; }
  .left-nearby-travel__route-alarm { margin-right: 5px; }
  .left-nearby-travel__timeline-row { grid-template-columns: 36px 22px minmax(0,1fr) 17px; }
  .left-nearby-travel__stations { margin-left: 63px; }
}
</style>
