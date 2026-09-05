<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "#imports";
import { Check, Copy, Eye, EyeOff, LoaderCircle, Map as MapIcon, MapPin, RefreshCw, Route, RotateCcw, Trash2 } from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import ContextMenu from "../../components/ContextMenu.vue";
import DepartureAlarmModal from "../../components/DepartureAlarmModal.vue";
import FullscreenStationPanel from "../../components/FullscreenStationPanel.vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import UserFriendlyTrafficModal from "../../components/UserFriendlyTrafficModal.vue";
import {
  requestTemporaryAlarmWakeLock,
  useAppSettings,
} from "../app-settings";
import { useI18n } from "../../i18n";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { GlobalMapMode, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapBasemapStyle } from "../transport-map/basemap/tileMath";
import { createIgnTransportMapGeocoder } from "./geocoding";
import NearbyStationSchedulePanel from "./NearbyStationSchedulePanel.vue";
import NearbyStationScheduleInline from "./NearbyStationScheduleInline.vue";
import NearbyHeavyAccessGuide from "./NearbyHeavyAccessGuide.vue";
import NearbyLineTraceModal from "./NearbyLineTraceModal.vue";
import NearbyStationsMap from "./NearbyStationsMap.vue";
import NearbyPlacesDirectoryOverlay from "./NearbyPlacesDirectoryOverlay.vue";
import LeftNearbySidebar from "./LeftNearbySidebar.vue";
import LeftNearbySidebarBodyTravel from "./LeftNearbySidebarBodyTravel.vue";
import {
  NEARBY_RADIUS_MAX_METERS,
  NEARBY_RADIUS_MIN_METERS,
  NEARBY_RADIUS_STEP_METERS,
  NEARBY_SUPPORTED_MODES,
} from "./nearbyStations";
import {
  NEARBY_ADDRESS_PRESETS,
  type NearbyAddressPresetId,
} from "./nearbyStationPresets";
import { useNearbyStationSchedules } from "./useNearbyStationSchedules";
import { useNearbyHeavyTransports } from "./useNearbyHeavyTransports";
import { useNearbyStations } from "./useNearbyStations";
import { useNearbyStationsLineFlow } from "./useNearbyStationsLineFlow";
import { useNearbyPlaces } from "./useNearbyPlaces";
import {
  nearbyPlaceGoogleMapsUrl,
  walkingMinutesToMeters,
  type NearbyPlaceGroupId,
  type NearbyWalkingMinutes,
} from "./nearbyPlacePresentation";
import type { NearbyPlace } from "./nearbyPlaces";
import { haversineMeters, type NearbyWalkingRoute } from "./nearbyWalkingRoutes";
import { useNearbyWalkingRoutes } from "./useNearbyWalkingRoutes";
import { saveNearbyNeighborhoodScoreSnapshot } from "./nearbyNeighborhoodScoreSnapshot";
import { useTravelRoutes, type TravelRoute } from "./useTravelRoutes";
import {
  getBoardTrafficAlertForReport,
  getTrafficDisruptionsTone,
  normalizeTrafficLineRef,
  type BoardTrafficAlert,
  type TrafficAlertModalData,
  type TrafficLineReport,
  type TrafficResponse,
} from "../traffic";
import type { NearbyStationScheduleItem } from "./nearbyStationSchedules";
import {
  isNearbyJourneyWalkingSection,
  type NearbyJourneyPoint,
  type NearbyJourneySection,
  type RouteExit,
} from "./nearbyHeavyTransports";
import { alignNearbyWalkingGeometryToEndpoints, createNearbyTravelWalkingSegments } from "./nearbyTravelGeometry";
import {
  createTravelRouteAlarmTarget,
  type TravelRouteAlarmContext,
} from "./nearbyTravelAlarm";
import { toServerApiUrl } from "../../services/serverApi";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import { buildCitiesLinePatternCities, normalizeCityPatternLabel } from "../line-map/citiesLinePattern";
import type { GlobalMapLine } from "../transport-map/contracts/manifest";
import {
  createRouteExitsForStation,
  resolveTravelBoundaryPoint,
  resolveTravelBoundaryStation,
  selectFastestRouteExit,
} from "./travelBoundary";
import type {
  AlarmDraft,
  Departure,
  DirectionDepartureGroup,
  TransitBoardConfig,
  DepartureAlarm,
} from "../../types/transit";
import {
  cancelDepartureAlarm,
  getDepartureAlarmCapability,
  initializeDepartureAlarmRuntime,
  isNativeDepartureAlarmPlatform,
  removeDepartureAlarmNotification,
  requestDepartureAlarmPermissions,
  scheduleDepartureAlarm,
  synchronizeDepartureAlarms,
  type DepartureAlarmNotificationCopy,
} from "../../services/departureAlarmRuntime";
import {
  createDepartureAlarm,
  findActiveAlarmForDeparture,
  findDepartureAlarmById,
  loadDepartureAlarms,
  markAlarmNotified,
  removeDepartureAlarmById,
  saveDepartureAlarms,
} from "../../storage/transitAlarms";

const { settings } = useAppSettings();
const { locale, t } = useI18n();
const route = useRoute();
const router = useRouter();
const geocoder = createIgnTransportMapGeocoder();
const NEARBY_CUSTOM_PRESET_ID = "__custom" as const;
const selectedPresetId = ref<NearbyAddressPresetId | typeof NEARBY_CUSTOM_PRESET_ID>(NEARBY_ADDRESS_PRESETS[0].id);
const customAddressLabel = ref("");
const placeLoading = ref(false);
const placeError = ref("");
const presetRequestToken = ref(0);
const placeCache = new Map<NearbyAddressPresetId, Promise<GeocoderPoint>>();
const nearby = useNearbyStations();
const nearbyDataProviders = createNearbyDataProviders();
const lineFlow = useNearbyStationsLineFlow(nearby);
const travelRoutes = useTravelRoutes({
  origin: nearby.selectedPlace,
  placesProvider: nearbyDataProviders.places,
  travelRoutesProvider: nearbyDataProviders.travelRoutes,
  searchStations: true,
  searchPlaces: true,
});
const travelPanelOpen = ref(false);
const travelClusterGroupingRestore = ref<number>();
// Keep the page compatible with lightweight consumers that still expose only
// the legacy single ghost model while the multi-line flow API rolls out.
const lineFlowModels = computed(() => lineFlow.lineFlowModels?.value ?? []);
const travelAllowedModes = ref<GlobalMapMode[]>([...NEARBY_SUPPORTED_MODES]);
const visibleTravelRoutes = computed(() => travelRoutes.routes.value.filter(route =>
  route.transitSections.every(section => travelSectionMode(section) === undefined ||
    travelAllowedModes.value.includes(travelSectionMode(section)!)),
));
const selectedTravelRouteForMap = computed(() => {
  const route = travelRoutes.selectedRoute.value;
  return route && visibleTravelRoutes.value.some(candidate => candidate.id === route.id)
    ? route
    : undefined;
});
const nearbyWalking = useNearbyWalkingRoutes();
const baseTravelWalkingSegments = computed(() => createNearbyTravelWalkingSegments(
  selectedTravelRouteForMap.value,
  nearby.selectedPlace.value,
  travelRoutes.destination.value,
  {
    resolveTransitBoundaryPoint: resolveNearbyTravelBoundaryPoint,
    resolveTransitExitPoint: (section, target) => selectFastestRouteExit(
      getNearbySectionExits(section),
      target,
    ),
  },
));
const nativeTravelWalkingRoutes = computed<Record<string, NearbyWalkingRoute | undefined>>(() => Object.fromEntries(
  baseTravelWalkingSegments.value
    .filter((segment) => Boolean(segment.coordinates?.length && segment.coordinates.length >= 2))
    .map((segment) => [segment.id, {
      id: segment.id,
      provider: "idfm-navitia" as const,
      distanceMeters: segment.distanceMeters ?? haversineMeters(segment.from, segment.to),
      durationSeconds: segment.durationSeconds ?? Math.max(60, Math.ceil(haversineMeters(segment.from, segment.to) / 80) * 60),
      coordinates: segment.coordinates!,
    }]),
));
const travelWalkingRoutes = computed<Record<string, NearbyWalkingRoute | undefined>>(() => ({
  ...nativeTravelWalkingRoutes.value,
  ...nearbyWalking.segmentRoutes.value,
}));
const travelWalkingSegments = computed(() => baseTravelWalkingSegments.value.map((segment) => {
  const route = travelWalkingRoutes.value[segment.id];
  const coordinates = route?.coordinates ?? segment.coordinates;
  return {
    ...segment,
    coordinates: coordinates ? alignNearbyWalkingGeometryToEndpoints(coordinates, segment.from, segment.to) : undefined,
    distanceMeters: route?.distanceMeters ?? segment.distanceMeters,
    durationSeconds: route?.durationSeconds ?? segment.durationSeconds,
  };
}));

function resolveNearbyTravelBoundaryStation(
  section: NearbyJourneySection,
  side: "from" | "to",
  fallback?: NearbyJourneyPoint,
): GlobalMapStation | undefined {
  const candidates = nearby.visibleStations.value.flatMap((entry) =>
    (entry.memberStations.length > 0 ? entry.memberStations : [entry.station]).map((station) => ({ station, entry })),
  );
  return resolveTravelBoundaryStation({
    network: nearby.transportMapNetwork?.value,
    section,
    side,
    fallback,
    candidates: candidates.map(({ station }) => station),
  });
}

function resolveNearbyTravelBoundaryPoint(
  section: NearbyJourneySection,
  side: "from" | "to",
  fallback?: NearbyJourneyPoint,
): NearbyJourneyPoint | undefined {
  return resolveTravelBoundaryPoint({
    network: nearby.transportMapNetwork?.value,
    section,
    side,
    fallback,
    candidates: nearby.visibleStations.value.flatMap((entry) =>
      entry.memberStations.length > 0 ? entry.memberStations : [entry.station],
    ),
  });
}

function getNearbySectionExits(section: NearbyJourneySection): readonly RouteExit[] {
  const network = nearby.transportMapNetwork?.value;
  if (!network) return [];
  const station = resolveTravelBoundaryStation({
    network,
    section,
    side: "to",
    fallback: section.toPoint,
  });
  if (!station) return [];
  return createRouteExitsForStation(network, station.id);
}

function travelSectionMode(section: NearbyJourneySection): GlobalMapMode | undefined {
  if (isNearbyJourneyWalkingSection(section)) return undefined;
  return section.lineMode ?? "BUS";
}

const heavy = useNearbyHeavyTransports({
  origin: nearby.selectedPlace,
  network: nearby.transportMapNetwork,
  stations: nearby.visibleStations,
  activeModes: nearby.activeModes,
  radius: nearby.radius,
}, {
  journeyProvider: nearbyDataProviders.travelRoutes,
});
const hiddenStationIds = ref<Set<string>>(new Set());
const scheduleStations = computed(() => nearby.visibleStations.value.filter((entry) => !hiddenStationIds.value.has(entry.id)));
const scheduleHeavyStations = computed(() => heavy.visibleCandidates.value.filter((candidate) => !hiddenStationIds.value.has(candidate.id)));
const schedules = useNearbyStationSchedules({
  stations: scheduleStations,
  activeModes: nearby.activeModes,
  extraCandidates: scheduleHeavyStations,
});
const displayedScheduleItems = computed(() => schedules.items.value.filter((item) =>
  nearby.activeModes.value.includes(item.line.mode),
));
const nearbyTrafficReports = ref<TrafficLineReport[]>([]);
const nearbyTrafficModalOpen = ref(false);
const nearbyTrafficModalAlert = ref<TrafficAlertModalData>();
let nearbyTrafficRequestToken = 0;

const nearbyTrafficLineRefs = computed(() => Array.from(new Set(
  [
    ...displayedScheduleItems.value.map((item) => resolveNearbyTrafficLineRef(item)),
    ...travelRoutes.routes.value.flatMap((route) => route.transitSections.flatMap((section) => [section.lineId, section.lineCode])),
  ]
    .map((lineRef) => normalizeTrafficLineRef(lineRef ?? ""))
    .filter(Boolean),
)));
const nearbyTrafficReportByLineRef = computed(() => new Map(
  nearbyTrafficReports.value.map((report) => [normalizeTrafficLineRef(report.lineRef), report]),
));

const stationMenuOpen = ref(false);
const stationMenuAnchor = ref<HTMLElement>();
const stationMenuStationId = ref<string>();
const placeMenuOpen = ref(false);
const placeMenuAnchor = ref<HTMLElement>();
const placeMenuPlaceId = ref<string>();
const stationCopyFeedback = ref("");
let stationCopyFeedbackTimer: number | undefined;
const stationDeleteModalOpen = ref(false);
const stationToDelete = ref<string>();
const sidebarMenuOpen = ref(false);
const sidebarMenuAnchor = ref<HTMLElement>();
const directionMenuOpen = ref(false);
const directionMenuAnchor = ref<HTMLElement>();
const directionMenuItemId = ref<string>();
const directionMenuId = ref<string>();
const directionMenuLabel = ref("");
const focusedScheduleStationId = ref<string>();
const hideStationsWithoutDepartures = ref(false);
const hideLongWaitTransports = ref(true);
const showNearbyPlaces = ref(true);
const showNearbyPlaceNames = ref(false);
const nearbyDirectoryOpen = ref(false);
const nearbySelectedPlaceId = ref<string>();
const nearbyDirectoryWalkingMinutes = ref<NearbyWalkingMinutes>(15);
const nearbyDirectoryRadiusMeters = computed(() => walkingMinutesToMeters(nearbyDirectoryWalkingMinutes.value));
const nearbyPlacesLoadEnabled = ref(true);
const nearbyPlaces = useNearbyPlaces({
  origin: nearby.selectedPlace,
  radius: nearbyDirectoryRadiusMeters,
  enabled: nearbyPlacesLoadEnabled,
  provider: nearbyDataProviders.places,
});
const nearbyMapPlaces = computed(() => nearbyPlaces.places.value.filter((place) =>
  place.distanceMeters <= nearby.radius.value,
));
const nearbyPlacesErrorMessage = computed(() => nearbyPlaces.error.value
  ? t("nearbyStations.directory.error")
  : "");
const nearbyPlaceLoadingGroupIds = ref<Set<NearbyPlaceGroupId>>(new Set());
const nearbySelectedPlace = computed(() => nearbySelectedPlaceId.value
  ? nearbyPlaces.places.value.find((place) => place.id === nearbySelectedPlaceId.value)
  : undefined);
const nearbySelectedWalkingRoute = computed(() => nearbySelectedPlaceId.value
  ? nearbyWalking.placeRoutes.value[nearbySelectedPlaceId.value]
  : undefined);
const nearbyPlaceWalkingRoutes = computed(() => nearbyWalking.placeRoutes.value);
const nearbyPlaceWalkingProgress = computed(() => nearbyWalking.placeLoadProgress.value);

const contextStation = computed<GlobalMapStation | undefined>(() => {
  const stationId = stationMenuStationId.value;
  if (!stationId) return undefined;
  const entries = [
    ...nearby.visibleStations.value,
    ...heavy.visibleCandidates.value.map((candidate) => candidate.entry),
  ];
  for (const entry of entries) {
    if (entry.id === stationId) return entry.station;
    const member = entry.memberStations.find((candidate) => candidate.id === stationId);
    if (member) return member;
  }
  return undefined;
});
const contextPlace = computed<NearbyPlace | undefined>(() => {
  const placeId = placeMenuPlaceId.value;
  return placeId ? nearbyPlaces.places.value.find((place) => place.id === placeId) : undefined;
});
const lineTraceModalOpen = ref(false);
const lineTraceLineId = ref<string>();
const lineTraceDirectionId = ref<string>();
const lineTraceStationId = ref<string>();
const nearbyFullscreenBoard = ref<TransitBoardConfig>();
const nearbyFullscreenItemId = ref<string>();
const nearbyMapFullscreen = ref(false);
const nearbyAlarmTarget = ref<{
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
  activeAlarm?: DepartureAlarm;
  context?: TravelRouteAlarmContext;
}>();
const nearbyDepartureAlarms = ref<DepartureAlarm[]>([]);
const nearbyAlarmModalBusy = ref(false);
const nearbyAlarmModalError = ref("");
const nearbyNativeAlarmPlatform = isNativeDepartureAlarmPlatform();
const nearbyAlarmPermissionState = ref<"ready" | "required" | "checking">(
  nearbyNativeAlarmPlatform ? "checking" : "ready",
);
let nearbyDisposeAlarmRuntime: (() => Promise<void>) | undefined;
let nearbyAlarmTriggerElement: HTMLElement | undefined;
let nearbyAlarmSyncRequest = 0;

const nearbyFullscreenItem = computed(() => displayedScheduleItems.value.find((item) => item.id === nearbyFullscreenItemId.value));
const nearbyFullscreenDirections = computed(() => (nearbyFullscreenItem.value?.result?.directionGroups ?? [])
  .filter((group) => schedules.isDirectionVisible(nearbyFullscreenItem.value!.id, group.id))
  .map((group) => ({
    id: group.id,
    label: group.label,
    subtitle: group.subtitle,
    serviceEnded: group.serviceEnded,
    departures: group.departures.slice(0, 2).map((departure) => ({
      id: departure.id,
      waitLabel: formatNearbyFullscreenWait(departure),
      destination: departure.destination,
      statusLabel: departure.status,
    })),
  })));

const presetOptions = computed(() => NEARBY_ADDRESS_PRESETS.map((preset) => ({
  ...preset,
  label: t(preset.labelKey),
})));
const selectedPreset = computed(() =>
  presetOptions.value.find((preset) => preset.id === selectedPresetId.value) ?? presetOptions.value[0],
);
const selectedAddressLabel = computed(() =>
  customAddressLabel.value || nearby.selectedPlace.value?.label || selectedPreset.value?.label || "",
);
const basemapStyle = computed<TransportMapBasemapStyle | undefined>(() => settings.value.globalMapBasemapStyle);
const errorMessage = computed(() => {
  if (placeError.value) return placeError.value;
  switch (nearby.errorType.value) {
    case "api_limit_reached": return t("nearbyStations.errors.apiLimit");
    case "map_data_unavailable": return t("nearbyStations.errors.mapDataUnavailable");
    case "address_not_found": return t("nearbyStations.errors.addressNotFound");
    case "geocoding_unavailable": return t("nearbyStations.errors.geocodingUnavailable");
    case "unknown": return t("nearbyStations.errors.unknown");
    default: return "";
  }
});
const heavyErrorMessage = computed(() => heavy.error.value ? t("nearbyStations.heavyTransportUnavailable") : "");
function stationHasUpcomingDeparture(stationId: string): boolean | undefined {
  const stationItems = displayedScheduleItems.value.filter((item) => item.stationId === stationId);
  if (stationItems.length === 0 || stationItems.some((item) => item.state === "loading")) return undefined;
  const visibleItems = stationItems.filter((item) => item.state === "visible");
  if (visibleItems.length === 0) return undefined;
  return visibleItems.some((item) =>
    (item.result?.directionGroups ?? []).some((group) => group.departures.length > 0),
  );
}

function resolveNearbyTrafficLineRef(item: NearbyStationScheduleItem): string {
  return item.board?.schedule?.lineRef ?? item.board?.line.ref ?? item.line.sourceLineId ?? item.line.id;
}

function getNearbyTrafficAlert(item: NearbyStationScheduleItem): BoardTrafficAlert | undefined {
  const report = nearbyTrafficReportByLineRef.value.get(
    normalizeTrafficLineRef(resolveNearbyTrafficLineRef(item)),
  );

  if (!report) return undefined;

  return getBoardTrafficAlertForReport(report, {
    lookaheadDays: settings.value.trafficWarningLookaheadDays,
    messages: {
      disruption: t("board.traffic.disruption"),
      disruptionAndInterruptionAt: (time) =>
        t("board.traffic.disruptionAndInterruptionAt", { time }),
      interruption: t("board.traffic.interruption"),
      multipleInterruptions: t("board.traffic.multipleInterruptions"),
      interruptionAt: (time) => t("board.traffic.interruptionAt", { time }),
      interruptionInDay: (count) => t("board.traffic.interruptionInDay", { count }),
      interruptionInDays: (count) => t("board.traffic.interruptionInDays", { count }),
      interruptionToday: t("board.traffic.interruptionToday"),
    },
  });
}

function travelTrafficTone(section: NearbyJourneySection): "orange" | "red" | undefined {
  const report = [section.lineId, section.lineCode]
    .map((lineRef) => nearbyTrafficReportByLineRef.value.get(normalizeTrafficLineRef(lineRef ?? "")))
    .find(Boolean);
  return report ? getTrafficDisruptionsTone(report.disruptions) : undefined;
}

function resolveTravelNetworkLineId(section: NearbyJourneySection): string | undefined {
  const network = nearby.transportMapNetwork.value;
  if (!network) return undefined;
  if (section.lineId && network.linesById.has(section.lineId)) return section.lineId;
  const wanted = new Set([section.lineId, section.lineCode, ...(section.lineAliases ?? [])]
    .filter((value): value is string => Boolean(value))
    .map(normalizeTravelLineIdentity));
  for (const line of network.linesById.values()) {
    const references = [line.id, line.code, line.label, ...line.aliases].map(normalizeTravelLineIdentity);
    if (references.some((reference) => wanted.has(reference))) return line.id;
  }
  return undefined;
}

function normalizeTravelLineIdentity(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/^(?:line:)?idfm:/u, "").replace(/[^a-z0-9]/gu, "");
}

function selectTravelRoute(route: TravelRoute): void {
  travelRoutes.selectRoute(route.id);
  activateTravelRouteLines(route);
}

function travelRouteAlarmTarget(route: TravelRoute) {
  return createTravelRouteAlarmTarget(route, {
    origin: nearby.selectedPlace.value?.label ?? selectedPreset.value?.label ?? "",
    destination: travelRoutes.destination.value?.label ?? "",
    departure: t("nearbyStations.travel.routeAlarmDeparture"),
    fallback: t("nearbyStations.travel.routeAlarmFallback"),
    transportTypeLabel: travelRouteTransportLabel(route),
    safetyMinutes: settings.value.travelAlarmSafetyMinutes,
  });
}

function travelRouteTransportLabel(route: TravelRoute): string {
  const firstTransitSection = route.transitSections[0];
  if (firstTransitSection?.lineMode) return modeLabel(firstTransitSection.lineMode);

  const mode = `${firstTransitSection?.mode ?? ""}`.toLocaleLowerCase("fr-FR");
  if (mode.includes("noct")) return t("nearbyStations.modes.noctilien");
  if (mode.includes("metro")) return t("nearbyStations.modes.metro");
  if (mode.includes("rer")) return t("nearbyStations.modes.rer");
  if (mode.includes("tram")) return t("nearbyStations.modes.tram");
  if (mode.includes("train") || mode.includes("rail")) return t("nearbyStations.modes.train");
  return t("nearbyStations.modes.bus");
}

function isTravelRouteAlarmActive(route: TravelRoute): boolean {
  const target = travelRouteAlarmTarget(route);
  return target
    ? Boolean(findActiveAlarmForDeparture(target.board.id, target.departure, nearbyDepartureAlarms.value))
    : false;
}

function openTravelRouteAlarmModal(route: TravelRoute): void {
  const target = travelRouteAlarmTarget(route);
  if (target) openNearbyAlarmModal(target);
}

function activateTravelRouteLines(route: TravelRoute | undefined): void {
  if (!route || !visibleTravelRoutes.value.some(candidate => candidate.id === route.id)) {
    lineFlow.clearLineFocus();
    return;
  }

  // Keep the provider's raw code as a fallback. The global network can expose
  // the same line under an IDFM URI while the journey response only contains
  // the commercial code (for example J, 14 or 1425).
  const resolvedLineIds = route.transitSections
    .map(resolveTravelNetworkLineId)
    .filter((id): id is string => Boolean(id));
  const fallbackLineIds = route.transitSections
    .map((section) => section.lineId ?? section.lineCode)
    .filter((id): id is string => Boolean(id));
  // Prefer IDs known by the global map. Raw commercial codes are useful only
  // while the network catalogue is still loading; forwarding an unresolved
  // code alongside valid lines can make the viewport request discard the
  // whole batch for a route such as 1425 → 1401 → A.
  const lineIds = [...new Set(resolvedLineIds.length > 0 ? resolvedLineIds : fallbackLineIds)];
  if (lineIds.length > 0) {
    const firstTransitSection = route.transitSections[0];
    const boardingStation = firstTransitSection
      ? resolveNearbyTravelBoundaryStation(firstTransitSection, "from", firstTransitSection.fromPoint)
      : undefined;
    const directionLabel = firstTransitSection?.direction?.trim() || firstTransitSection?.toName?.trim();
    const focus = directionLabel && boardingStation
      ? { directionLabel, fromStationId: boardingStation.id }
      : undefined;
    lineFlow.handleActivateLine(lineIds[0]!, undefined, lineIds.slice(1), focus);
  } else {
    lineFlow.clearLineFocus();
  }
}

function updateTravelAllowedModes(modes: GlobalMapMode[]): void {
  travelAllowedModes.value = [...modes];
  const selected = travelRoutes.selectedRoute.value;
  if (selected && !visibleTravelRoutes.value.some(route => route.id === selected.id)) {
    lineFlow.clearLineFocus();
  } else {
    activateTravelRouteLines(selected);
  }
}

function nearbyBoardAlarmDepartureIds(boardId: string): string[] {
  return nearbyDepartureAlarms.value
    .filter((alarm) => alarm.boardId === boardId && !alarm.notified)
    .map((alarm) => alarm.departureId);
}

function openNearbyAlarmModal(payload: {
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
  context?: TravelRouteAlarmContext;
}): void {
  nearbyAlarmTriggerElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : undefined;
  nearbyAlarmModalError.value = "";
  nearbyAlarmModalBusy.value = false;
  nearbyAlarmTarget.value = {
    ...payload,
    activeAlarm: findActiveAlarmForDeparture(
      payload.board.id,
      payload.departure,
      nearbyDepartureAlarms.value,
    ),
  };

  if (nearbyNativeAlarmPlatform && !nearbyAlarmTarget.value.activeAlarm) {
    void refreshNearbyAlarmPermissionState();
  }
}

async function refreshNearbyAlarmPermissionState(): Promise<void> {
  if (!nearbyNativeAlarmPlatform) {
    nearbyAlarmPermissionState.value = "ready";
    return;
  }

  nearbyAlarmPermissionState.value = "checking";
  try {
    const capability = await getDepartureAlarmCapability();
    nearbyAlarmPermissionState.value = capability.ready ? "ready" : "required";
  } catch {
    nearbyAlarmPermissionState.value = "required";
    nearbyAlarmModalError.value = t("alarm.errors.permissionCheck");
  }
}

async function requestNearbyAlarmPermissions(): Promise<void> {
  nearbyAlarmModalBusy.value = true;
  nearbyAlarmModalError.value = "";
  nearbyAlarmPermissionState.value = "checking";
  try {
    const capability = await requestDepartureAlarmPermissions();
    nearbyAlarmPermissionState.value = capability.ready ? "ready" : "required";
    if (!capability.ready) nearbyAlarmModalError.value = t("alarm.errors.permissionRequired");
  } catch {
    nearbyAlarmPermissionState.value = "required";
    nearbyAlarmModalError.value = t("alarm.errors.permissionRequest");
  } finally {
    nearbyAlarmModalBusy.value = false;
  }
}

function nearbyAlarmNotificationCopy(alarm: DepartureAlarm): DepartureAlarmNotificationCopy {
  const details = [
    t("app.alarmNotificationLine", {
      line: alarm.lineLabel,
      destination: alarm.destination,
    }),
    alarm.platform
      ? t("alarm.notificationDetailsWithPlatform", {
          monitoring: alarm.monitoringLabel,
          platform: alarm.platform,
        })
      : alarm.monitoringLabel,
  ];
  return {
    title: t("app.alarmNotificationTitle", { station: alarm.boardTitle }),
    body: details.filter(Boolean).join("\n"),
  };
}

function updateNearbyAlarms(alarms: DepartureAlarm[]): void {
  nearbyDepartureAlarms.value = alarms;
  saveDepartureAlarms(alarms);
  void synchronizeNearbyAlarms();
}

async function synchronizeNearbyAlarms(): Promise<void> {
  const request = ++nearbyAlarmSyncRequest;
  try {
    const capability = await getDepartureAlarmCapability();
    nearbyAlarmPermissionState.value = capability.ready ? "ready" : "required";
    if (nearbyNativeAlarmPlatform && !capability.ready) return;

    const result = await synchronizeDepartureAlarms(
      nearbyDepartureAlarms.value,
      nearbyAlarmNotificationCopy,
    );
    if (request !== nearbyAlarmSyncRequest) return;

    const notifiedIds = new Set([...result.expiredAlarmIds, ...result.deliveredAlarmIds]);
    if (notifiedIds.size > 0) {
      nearbyDepartureAlarms.value = nearbyDepartureAlarms.value.map((alarm) =>
        notifiedIds.has(alarm.id) ? { ...alarm, notified: true } : alarm,
      );
      saveDepartureAlarms(nearbyDepartureAlarms.value);
    }
  } catch (cause) {
    console.error("Unable to synchronize nearby departure alarms", cause);
  }
}

async function handleNearbyAlarmDelivered(alarmId: string): Promise<boolean> {
  const alarm = findDepartureAlarmById(alarmId, nearbyDepartureAlarms.value);
  if (!alarm || alarm.notified) return false;

  updateNearbyAlarms(markAlarmNotified(alarm.id, nearbyDepartureAlarms.value));
  if (settings.value.wakeDeviceOnAlarm) void requestTemporaryAlarmWakeLock("1m");
  return true;
}

async function handleNearbyAlarmAction(alarmId: string): Promise<void> {
  const alarm = findDepartureAlarmById(alarmId, nearbyDepartureAlarms.value);
  if (!alarm) return;
  await removeDepartureAlarmNotification(alarm);
  await handleNearbyAlarmDelivered(alarmId);
}

async function confirmNearbyAlarm(draft: AlarmDraft): Promise<void> {
  const target = nearbyAlarmTarget.value;
  if (!target || target.activeAlarm || nearbyAlarmModalBusy.value) return;

  nearbyAlarmModalBusy.value = true;
  nearbyAlarmModalError.value = "";
  try {
    const capability = await getDepartureAlarmCapability();
    if (nearbyNativeAlarmPlatform) {
      nearbyAlarmPermissionState.value = capability.ready ? "ready" : "required";
      if (!capability.ready) {
        nearbyAlarmModalError.value = t("alarm.errors.permissionRequired");
        return;
      }
    } else {
      await requestDepartureAlarmPermissions();
    }

    const alarm = createDepartureAlarm(
      target.board,
      target.departure,
      { ...draft, soundEnabled: nearbyNativeAlarmPlatform ? true : draft.soundEnabled },
      nearbyDepartureAlarms.value,
    );
    await scheduleDepartureAlarm(alarm, nearbyAlarmNotificationCopy(alarm));
    const nextAlarms = nearbyDepartureAlarms.value.filter((item) =>
      !(item.boardId === alarm.boardId && item.departureId === alarm.departureId && !item.notified),
    );
    updateNearbyAlarms([...nextAlarms, alarm]);
    closeNearbyAlarmModal();
  } catch (cause) {
    nearbyAlarmModalError.value = cause instanceof Error && cause.message === "departure-alarm-time-passed"
      ? t("alarm.errors.timePassed")
      : t("alarm.errors.schedule");
  } finally {
    nearbyAlarmModalBusy.value = false;
  }
}

async function removeNearbyAlarm(): Promise<void> {
  const alarm = nearbyAlarmTarget.value?.activeAlarm;
  if (!alarm || nearbyAlarmModalBusy.value) return;

  nearbyAlarmModalBusy.value = true;
  nearbyAlarmModalError.value = "";
  try {
    await cancelDepartureAlarm(alarm);
    updateNearbyAlarms(removeDepartureAlarmById(alarm.id, nearbyDepartureAlarms.value));
    closeNearbyAlarmModal();
  } catch {
    nearbyAlarmModalError.value = t("alarm.errors.cancel");
  } finally {
    nearbyAlarmModalBusy.value = false;
  }
}

function cancelNearbyAlarmModal(): void {
  if (!nearbyAlarmModalBusy.value) closeNearbyAlarmModal();
}

function closeNearbyAlarmModal(): void {
  nearbyAlarmTarget.value = undefined;
  nearbyAlarmModalError.value = "";
  void nextTick(() => {
    if (nearbyAlarmTriggerElement?.isConnected) nearbyAlarmTriggerElement.focus();
    nearbyAlarmTriggerElement = undefined;
  });
}

function formatNearbyFullscreenWait(departure: Departure): string {
  if (departure.vehicleAtStop) return t("board.docked");
  const value = departure.expectedDepartureTime ?? departure.aimedDepartureTime ?? departure.expectedArrivalTime;
  if (!value) return "--";
  return String(Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 60_000)));
}

function openNearbyLinePage(_item: NearbyStationScheduleItem, board: TransitBoardConfig): void {
  const transportType = board.line.mode === "train" ? "transilien" : board.line.mode;
  const lineId = board.line.shortName || board.line.ref;
  const params = new URLSearchParams({ startStation: board.title });
  window.open(
    `/line/${encodeURIComponent(transportType)}/${encodeURIComponent(lineId)}?${params}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function openNearbyFullscreenPanel(item: NearbyStationScheduleItem, board: TransitBoardConfig): void {
  nearbyFullscreenItemId.value = item.id;
  nearbyFullscreenBoard.value = board;
}

function closeNearbyFullscreenPanel(): void {
  nearbyFullscreenBoard.value = undefined;
  nearbyFullscreenItemId.value = undefined;
}

function handleNearbyMapFullscreen(fullscreen: boolean): void {
  nearbyMapFullscreen.value = fullscreen;
}

async function refreshNearbyTraffic(): Promise<void> {
  const requestToken = ++nearbyTrafficRequestToken;
  const lineRefs = nearbyTrafficLineRefs.value;

  if (lineRefs.length === 0) {
    nearbyTrafficReports.value = [];
    return;
  }

  try {
    const params = new URLSearchParams({
      lineRefs: lineRefs.join(","),
      locale: locale.value,
    });
    const response = await fetch(toServerApiUrl(`/api/traffic?${params}`));

    if (!response.ok) throw new Error("nearby-traffic-request-failed");

    const payload = (await response.json()) as TrafficResponse;
    if (requestToken === nearbyTrafficRequestToken) {
      nearbyTrafficReports.value = Array.isArray(payload.lines) ? payload.lines : [];
    }
  } catch {
    if (requestToken === nearbyTrafficRequestToken) nearbyTrafficReports.value = [];
  }
}

function getNearbyTrafficModalData(alert: BoardTrafficAlert): TrafficAlertModalData {
  const report = nearbyTrafficReportByLineRef.value.get(normalizeTrafficLineRef(alert.target.lineRef));
  const targets = alert.targets?.length ? alert.targets : [alert.target];
  const disruptionsById = new Map(report?.disruptions.map((disruption) => [disruption.id, disruption]) ?? []);
  const disruptions = targets.flatMap((target) => {
    const disruption = disruptionsById.get(target.alertId);
    return disruption ? [disruption] : [];
  });

  return {
    ...alert,
    disruption: disruptions[0],
    disruptions,
  };
}

function openNearbyTrafficModal(_item: NearbyStationScheduleItem, alert: BoardTrafficAlert): void {
  nearbyTrafficModalAlert.value = getNearbyTrafficModalData(alert);
  nearbyTrafficModalOpen.value = true;
}

function closeNearbyTrafficModal(): void {
  nearbyTrafficModalOpen.value = false;
  nearbyTrafficModalAlert.value = undefined;
}

watch(
  () => `${locale.value}|${nearbyTrafficLineRefs.value.join(",")}`,
  () => void refreshNearbyTraffic(),
  { immediate: true },
);

const lineTraceLine = computed<GlobalMapLine | undefined>(() => {
  const lineId = lineTraceLineId.value;
  if (!lineId) return undefined;
  const network = nearby.transportMapNetwork?.value;
  return network?.linesById.get(lineId)
    ?? nearby.visibleStations.value.flatMap((entry) => entry.lines).find((line) => line.id === lineId)
    ?? heavy.visibleCandidates.value.flatMap((candidate) => candidate.lines).find((line) => line.id === lineId);
});
const lineTraceDirection = computed(() => {
  const directionId = lineTraceDirectionId.value;
  if (!directionId) return undefined;
  return (lineFlow.lineFlowDirections?.value ?? []).find((direction) => direction.flow.id === directionId);
});
const lineTraceCities = computed(() => {
  const direction = lineTraceDirection.value;
  if (!direction) return [];
  const network = nearby.transportMapNetwork?.value;
  const fallbackStations = nearby.visibleStations.value.flatMap((entry) => entry.memberStations);
  const stations = direction.flow.orderedStationIds
    .map((stationId) => network?.stationsById.get(stationId) ?? fallbackStations.find((station) => station.id === stationId))
    .filter((station): station is NonNullable<typeof station> => Boolean(station));
  return buildCitiesLinePatternCities(stations);
});
const lineTraceCurrentCity = computed(() => {
  const lineId = lineTraceLineId.value;
  if (!lineId) return "";

  const cities = new Map<string, { name: string; count: number }>();
  const seenStationIds = new Set<string>();
  for (const entry of nearby.visibleStations.value) {
    if (!entry.insideRadius) continue;
    const stations = entry.memberStations.length > 0 ? entry.memberStations : [entry.station];
    for (const station of stations) {
      if (seenStationIds.has(station.id) || !station.lineIds.includes(lineId)) continue;
      seenStationIds.add(station.id);
      const name = station.city?.trim();
      if (!name) continue;
      const key = normalizeCityPatternLabel(name);
      if (!key) continue;
      const current = cities.get(key);
      if (current) current.count += 1;
      else cities.set(key, { name, count: 1 });
    }
  }

  if (cities.size > 0) {
    const preferredCity = lineTraceStationId.value
      ? nearby.transportMapNetwork?.value?.stationsById.get(lineTraceStationId.value)?.city?.trim()
      : undefined;
    const preferredKey = preferredCity ? normalizeCityPatternLabel(preferredCity) : "";
    return [...cities.entries()]
      .sort((left, right) => right[1].count - left[1].count || (right[0] === preferredKey ? 1 : 0) - (left[0] === preferredKey ? 1 : 0))[0]?.[1].name ?? "";
  }

  const stationId = lineTraceStationId.value;
  if (!stationId) return "";
  const networkStation = nearby.transportMapNetwork?.value?.stationsById.get(stationId);
  if (networkStation?.city?.trim()) return networkStation.city.trim();
  const entry = [
    ...nearby.visibleStations.value,
    ...heavy.visibleCandidates.value.map((candidate) => candidate.entry),
  ].find((candidate) => candidate.id === stationId);
  return entry?.station.city?.trim() ?? "";
});
const lineTraceDirectionLabel = computed(() => lineTraceDirection.value?.flow.label
  || lineTraceLine.value?.label
  || lineTraceLine.value?.code
  || "");

function hasAnnuaryQuery(): boolean {
  return Object.prototype.hasOwnProperty.call(route.query, "annuary");
}

function syncAnnuaryQuery(open: boolean): void {
  const nextQuery = { ...route.query } as Record<string, string | string[] | null | undefined>;
  if (open) nextQuery.annuary = "";
  else delete nextQuery.annuary;
  void router.replace({ query: nextQuery });
}

function openNearbyDirectory(): void {
  nearbyDirectoryOpen.value = true;
  syncAnnuaryQuery(true);
}

function openNearbyNeighborhoodScore(): void {
  const origin = nearby.selectedPlace.value;
  if (!origin) return;

  saveNearbyNeighborhoodScoreSnapshot({
    origin: {
      lon: origin.lon,
      lat: origin.lat,
      label: origin.label,
      city: origin.city,
    },
    places: nearbyPlaces.places.value,
    placesLoaded: !nearbyPlaces.isLoading.value && !nearbyPlaces.error.value,
    walkingRoutes: Object.fromEntries(
      Object.entries(nearbyWalking.placeRoutes.value).map(([placeId, route]) => [placeId, route
        ? {
            provider: route.provider,
            distanceMeters: route.distanceMeters,
            durationSeconds: route.durationSeconds,
            fallback: route.fallback,
          }
        : undefined]),
    ),
    heavyCandidates: heavy.visibleCandidates.value,
  });

  const params = new URLSearchParams({
    lat: String(origin.lat),
    lon: String(origin.lon),
  });
  if (origin.label) params.set("address", origin.label);
  if (origin.city) params.set("city", origin.city);
  window.open(`/nearby-neighborhood-score?${params.toString()}`, "_blank", "noopener,noreferrer");
}

function closeNearbyDirectory(): void {
  nearbyDirectoryOpen.value = false;
  nearbySelectedPlaceId.value = undefined;
  syncAnnuaryQuery(false);
}

function selectNearbyPlace(placeId?: string): void {
  const nextPlaceId = nearbySelectedPlaceId.value === placeId ? undefined : placeId;
  nearbySelectedPlaceId.value = nextPlaceId;
  if (!nextPlaceId || !nearby.selectedPlace.value) return;
  const place = nearbyPlaces.places.value.find((candidate) => candidate.id === nextPlaceId);
  if (place) void nearbyWalking.loadPlaceRoute(nearby.selectedPlace.value, place);
}

function getQueryString(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function getNearbyQueryPlace(): GeocoderPoint | undefined {
  const latitude = Number(getQueryString(route.query.lat));
  const longitude = Number(getQueryString(route.query.lon));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return undefined;
  }

  const address = getQueryString(route.query.address);
  return {
    label: address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    lon: longitude,
    lat: latitude,
    provider: "global-map",
    type: address ? "address" : "unknown",
  };
}

async function requestNearbyPlaceGroupWalkingRoutes(
  groupId: NearbyPlaceGroupId,
  places: NearbyPlace[],
): Promise<void> {
  const origin = nearby.selectedPlace.value;
  if (!origin || places.length === 0 || nearbyPlaceLoadingGroupIds.value.has(groupId)) return;
  const missing = places.filter((place) => !nearbyWalking.placeRoutes.value[place.id]);
  if (missing.length === 0) return;
  nearbyPlaceLoadingGroupIds.value = new Set(nearbyPlaceLoadingGroupIds.value).add(groupId);
  try {
    await nearbyWalking.loadPlaceMetricsForGroup(origin, missing, groupId);
  } finally {
    const next = new Set(nearbyPlaceLoadingGroupIds.value);
    next.delete(groupId);
    nearbyPlaceLoadingGroupIds.value = next;
  }
}

async function selectPreset(id: NearbyAddressPresetId): Promise<void> {
  const preset = presetOptions.value.find((candidate) => candidate.id === id);
  if (!preset) return;

  selectedPresetId.value = id;
  customAddressLabel.value = "";
  const token = presetRequestToken.value + 1;
  presetRequestToken.value = token;
  placeLoading.value = true;
  placeError.value = "";
  nearby.clearError();
  schedules.resetVisibility();
  hiddenStationIds.value = new Set();
  heavy.resetVisibility();
  focusedScheduleStationId.value = undefined;
  lineTraceModalOpen.value = false;
  nearby.query.value = preset.label;

  try {
    const place = await resolvePreset(preset);
    if (token !== presetRequestToken.value) return;
    await nearby.selectPlace(place);
  } catch (cause) {
    if (token !== presetRequestToken.value) return;
    placeError.value = cause instanceof Error && cause.message === "address-not-found"
      ? t("nearbyStations.errors.addressNotFound")
      : t("nearbyStations.errors.geocodingUnavailable");
  } finally {
    if (token === presetRequestToken.value) placeLoading.value = false;
  }
}

async function selectCustomPlace(place: GeocoderPoint): Promise<void> {
  selectedPresetId.value = NEARBY_CUSTOM_PRESET_ID;
  customAddressLabel.value = place.label ?? `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;
  const token = presetRequestToken.value + 1;
  presetRequestToken.value = token;
  placeLoading.value = true;
  placeError.value = "";
  nearby.clearError();
  schedules.resetVisibility();
  hiddenStationIds.value = new Set();
  heavy.resetVisibility();
  focusedScheduleStationId.value = undefined;
  lineTraceModalOpen.value = false;
  nearby.query.value = customAddressLabel.value;

  try {
    await nearby.selectPlace(place);
  } catch {
    if (token === presetRequestToken.value) {
      placeError.value = t("nearbyStations.errors.geocodingUnavailable");
    }
  } finally {
    if (token === presetRequestToken.value) placeLoading.value = false;
  }
}

function resolvePreset(preset: { id: NearbyAddressPresetId; label: string }): Promise<GeocoderPoint> {
  const cached = placeCache.get(preset.id);
  if (cached) return cached;

  const request = geocoder.geocode(preset.label).then((results) => {
    const place = results[0];
    if (!place) throw new Error("address-not-found");
    return { ...place, label: preset.label };
  });
  placeCache.set(preset.id, request);
  void request.catch(() => {
    if (placeCache.get(preset.id) === request) placeCache.delete(preset.id);
  });
  return request;
}

function modeActive(mode: GlobalMapMode): boolean {
  return nearby.activeModes.value.includes(mode);
}

function modeLabel(mode: GlobalMapMode): string {
  switch (mode) {
    case "METRO": return t("nearbyStations.modes.metro");
    case "RER": return t("nearbyStations.modes.rer");
    case "TRAIN": return t("nearbyStations.modes.train");
    case "TRANSILIEN": return t("nearbyStations.modes.transilien");
    case "TRAM": return t("nearbyStations.modes.tram");
    case "CABLE": return t("nearbyStations.modes.cable");
    case "BUS": return t("nearbyStations.modes.bus");
    case "NOCTILIEN": return t("nearbyStations.modes.noctilien");
    default: return mode;
  }
}

function updateActiveModes(modes: GlobalMapMode[]): void {
  nearby.setActiveModes(modes);
}

function updateHideStationsWithoutDepartures(value: boolean): void {
  hideStationsWithoutDepartures.value = value;
}

function updateClusterGroupingDistance(value: number): void {
  nearby.clusterGroupingDistanceMeters.value = value;
}

function retry(): void {
  if (selectedPresetId.value === NEARBY_CUSTOM_PRESET_ID) {
    const place = getNearbyQueryPlace();
    if (place) void selectCustomPlace(place);
    return;
  }
  void selectPreset(selectedPresetId.value);
}

function openStationContextMenu(stationId: string, anchor: HTMLElement): void {
  stationMenuStationId.value = stationId;
  stationMenuAnchor.value = anchor;
  stationMenuOpen.value = true;
  placeMenuOpen.value = false;
  directionMenuOpen.value = false;
  sidebarMenuOpen.value = false;
}

function closeStationContextMenu(): void {
  stationMenuOpen.value = false;
}

function openPlaceContextMenu(placeId: string, anchor: HTMLElement): void {
  placeMenuPlaceId.value = placeId;
  placeMenuAnchor.value = anchor;
  placeMenuOpen.value = true;
  stationMenuOpen.value = false;
  directionMenuOpen.value = false;
  sidebarMenuOpen.value = false;
}

function closePlaceContextMenu(): void {
  placeMenuOpen.value = false;
}

function contextStationAddress(station: GlobalMapStation | undefined = contextStation.value): string {
  if (!station) return "";
  return [station.name.trim(), station.city?.trim()].filter(Boolean).join(", ");
}

function contextStationGoogleMapsUrl(station: GlobalMapStation): string {
  return nearbyPlaceGoogleMapsUrl({
    name: station.name,
    address: station.city,
    city: station.city,
    lat: station.lat,
    lon: station.lon,
  });
}

function contextPlaceAddress(place: NearbyPlace | undefined = contextPlace.value): string {
  if (!place) return "";
  return [place.name.trim(), place.address?.trim(), place.city?.trim()].filter(Boolean).join(", ");
}

function contextPlaceGoogleMapsUrl(place: NearbyPlace): string {
  return nearbyPlaceGoogleMapsUrl(place, { city: nearby.selectedPlace.value?.city });
}

function openContextStationInGoogleMaps(): void {
  const station = contextStation.value;
  if (!station) return;
  window.open(contextStationGoogleMapsUrl(station), "_blank", "noopener,noreferrer");
  closeStationContextMenu();
}

function openContextPlaceInGoogleMaps(): void {
  const place = contextPlace.value;
  if (!place) return;
  window.open(contextPlaceGoogleMapsUrl(place), "_blank", "noopener,noreferrer");
  closePlaceContextMenu();
}

function travelToContextStation(): void {
  const station = contextStation.value;
  if (!station) return;
  const destination: GeocoderPoint = {
    id: station.id,
    label: contextStationAddress(station),
    lon: station.lon,
    lat: station.lat,
    city: station.city,
    provider: "transport-map",
    type: "station",
  };
  closeStationContextMenu();
  travelPanelOpen.value = true;
  void travelRoutes.setDestination(destination);
}

function travelToContextPlace(): void {
  const place = contextPlace.value;
  if (!place) return;
  const destination: GeocoderPoint = {
    id: place.id,
    label: contextPlaceAddress(place),
    lon: place.lon,
    lat: place.lat,
    city: place.city,
    provider: "nearby-places",
    type: "place",
  };
  closePlaceContextMenu();
  travelPanelOpen.value = true;
  void travelRoutes.setDestination(destination);
}

async function copyTextToClipboard(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Fall through to the legacy textarea fallback for local and embedded browsers.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("clipboard-unavailable");
}

async function copyContextStationAddress(): Promise<void> {
  const address = contextStationAddress();
  if (!address) return;
  try {
    await copyTextToClipboard(address);
    stationCopyFeedback.value = t("nearbyStations.stationAddressCopied");
  } catch {
    stationCopyFeedback.value = t("nearbyStations.stationAddressCopyFailed");
  }
  if (stationCopyFeedbackTimer !== undefined) window.clearTimeout(stationCopyFeedbackTimer);
  stationCopyFeedbackTimer = window.setTimeout(() => {
    stationCopyFeedback.value = "";
    stationCopyFeedbackTimer = undefined;
  }, 2600);
  closeStationContextMenu();
}

async function copyContextPlaceAddress(): Promise<void> {
  const address = contextPlaceAddress();
  if (!address) return;
  try {
    await copyTextToClipboard(address);
    stationCopyFeedback.value = t("nearbyStations.placeAddressCopied");
  } catch {
    stationCopyFeedback.value = t("nearbyStations.placeAddressCopyFailed");
  }
  if (stationCopyFeedbackTimer !== undefined) window.clearTimeout(stationCopyFeedbackTimer);
  stationCopyFeedbackTimer = window.setTimeout(() => {
    stationCopyFeedback.value = "";
    stationCopyFeedbackTimer = undefined;
  }, 2600);
  closePlaceContextMenu();
}

function toggleContextStationSchedule(): void {
  if (!stationMenuStationId.value) return;
  schedules.toggleStationSchedule(stationMenuStationId.value);
  closeStationContextMenu();
}

function askToHideStation(): void {
  stationToDelete.value = stationMenuStationId.value;
  stationMenuOpen.value = false;
  stationDeleteModalOpen.value = Boolean(stationToDelete.value);
}

function confirmHideStation(): void {
  if (stationToDelete.value) {
    hiddenStationIds.value = new Set(hiddenStationIds.value).add(stationToDelete.value);
  }
  stationToDelete.value = undefined;
  stationDeleteModalOpen.value = false;
}

function resetNearbyVisibility(): void {
  hiddenStationIds.value = new Set();
  heavy.resetVisibility();
  schedules.resetAllVisibility();
  sidebarMenuOpen.value = false;
  focusedScheduleStationId.value = undefined;
}

async function refreshNearbyDepartures(): Promise<void> {
  sidebarMenuOpen.value = false;
  await Promise.all([schedules.refresh(), refreshNearbyTraffic()]);
}

function handleStationFocus(stationId?: string): void {
  focusedScheduleStationId.value = stationId;
}

function openLineTrace(lineId: string, directionId: string, stationId?: string): void {
  lineTraceLineId.value = lineId;
  lineTraceDirectionId.value = directionId;
  lineTraceStationId.value = stationId;
  lineTraceModalOpen.value = true;
}

function closeLineTrace(): void {
  lineTraceModalOpen.value = false;
}

function openSidebarMenu(anchor: HTMLElement): void {
  sidebarMenuAnchor.value = anchor;
  sidebarMenuOpen.value = true;
}

function openDirectionContextMenu(itemId: string, directionId: string, label: string, anchor: HTMLElement): void {
  directionMenuItemId.value = itemId;
  directionMenuId.value = directionId;
  directionMenuLabel.value = label;
  directionMenuAnchor.value = anchor;
  directionMenuOpen.value = true;
  stationMenuOpen.value = false;
  placeMenuOpen.value = false;
}

function toggleContextDirection(): void {
  if (directionMenuItemId.value && directionMenuId.value) {
    schedules.toggleDirection(directionMenuItemId.value, directionMenuId.value);
  }
  directionMenuOpen.value = false;
}

function isContextStationScheduleVisible(): boolean {
  return stationMenuStationId.value
    ? schedules.scheduleState(stationMenuStationId.value) !== "hidden"
    : false;
}

async function initializeNearbyAlarmRuntime(): Promise<void> {
  nearbyDepartureAlarms.value = loadDepartureAlarms();
  try {
    nearbyDisposeAlarmRuntime = await initializeDepartureAlarmRuntime({
      onAlarmDelivered: handleNearbyAlarmDelivered,
      onAlarmAction: handleNearbyAlarmAction,
      onResume: synchronizeNearbyAlarms,
    });
    await synchronizeNearbyAlarms();
  } catch (cause) {
    console.error("Unable to initialize nearby departure alarms", cause);
  }
}

watch(
  () => route.query.annuary,
  (value) => {
    const shouldOpen = value !== undefined;
    if (nearbyDirectoryOpen.value !== shouldOpen) nearbyDirectoryOpen.value = shouldOpen;
  },
  { immediate: true },
);

watch(
  () => [nearby.selectedPlace.value?.lon, nearby.selectedPlace.value?.lat],
  (next, previous) => {
    if (!previous || next[0] === previous[0] && next[1] === previous[1]) return;
    nearbyWalking.clear();
    nearbyPlaceLoadingGroupIds.value = new Set();
  },
  { flush: "post" },
);

watch(travelPanelOpen, (open) => {
  if (open) {
    if (travelClusterGroupingRestore.value === undefined) {
      travelClusterGroupingRestore.value = nearby.clusterGroupingDistanceMeters.value;
    }
    if (nearby.clusterGroupingDistanceMeters.value !== 0) {
      nearby.clusterGroupingDistanceMeters.value = 0;
    }
    return;
  }
  if (travelClusterGroupingRestore.value !== undefined) {
    nearby.clusterGroupingDistanceMeters.value = travelClusterGroupingRestore.value;
    travelClusterGroupingRestore.value = undefined;
  }
}, { flush: "sync" });

watch(
  () => [
    nearby.selectedPlace.value?.lon,
    nearby.selectedPlace.value?.lat,
    baseTravelWalkingSegments.value.map((segment) => segment.id).join("|"),
  ],
  () => {
    const origin = nearby.selectedPlace.value;
    if (origin && baseTravelWalkingSegments.value.length > 0) {
      void nearbyWalking.loadMissingSegmentRoutes(origin, baseTravelWalkingSegments.value);
    }
  },
  { flush: "post" },
);

watch(
  () => [
    travelRoutes.selectedRoute.value?.id,
    nearby.transportMapNetwork?.value?.linesById.size,
  ],
  () => activateTravelRouteLines(selectedTravelRouteForMap.value),
  { flush: "post" },
);

onMounted(() => {
  const queryPlace = getNearbyQueryPlace();
  void (queryPlace
    ? selectCustomPlace(queryPlace)
    : selectPreset(NEARBY_ADDRESS_PRESETS[0].id));
  void initializeNearbyAlarmRuntime();
});

onBeforeUnmount(() => {
  if (stationCopyFeedbackTimer !== undefined) window.clearTimeout(stationCopyFeedbackTimer);
  if (travelClusterGroupingRestore.value !== undefined) {
    nearby.clusterGroupingDistanceMeters.value = travelClusterGroupingRestore.value;
    travelClusterGroupingRestore.value = undefined;
  }
  nearbyAlarmSyncRequest += 1;
  void nearbyDisposeAlarmRuntime?.();
});
</script>

<template>
  <main class="my-nearby-stations-page">
    <header class="my-nearby-stations-page__hero">
      <div>
        <p class="my-nearby-stations-page__eyebrow">{{ t("nearbyStations.pageEyebrow") }}</p>
        <h1>{{ t("nearbyStations.pageTitle") }}</h1>
        <p>{{ t("nearbyStations.pageSubtitle") }}</p>
      </div>
      <MapPin class="my-nearby-stations-page__hero-icon" :size="34" aria-hidden="true" />
    </header>

    <section class="my-nearby-stations-page__controls" :aria-label="t('nearbyStations.addressPresetLabel')">
      <label class="my-nearby-stations-page__address">
        <span>{{ t("nearbyStations.addressPresetLabel") }}</span>
        <select
          :value="selectedPresetId"
          :disabled="placeLoading"
          @change="selectPreset(($event.target as HTMLSelectElement).value as NearbyAddressPresetId)"
        >
          <option v-if="selectedPresetId === NEARBY_CUSTOM_PRESET_ID" :value="NEARBY_CUSTOM_PRESET_ID">
            {{ customAddressLabel }}
          </option>
          <option v-for="preset in presetOptions" :key="preset.id" :value="preset.id">
            {{ preset.label }}
          </option>
        </select>
      </label>
      <div v-if="placeLoading" class="my-nearby-stations-page__status" role="status">
        <LoaderCircle class="my-nearby-stations-page__spin" :size="17" aria-hidden="true" />
        {{ t("nearbyStations.addressLoading") }}
      </div>
      <div v-else-if="nearby.selectedPlace.value" class="my-nearby-stations-page__resolved" role="status">
        <Check :size="17" aria-hidden="true" />
        {{ selectedAddressLabel }}
      </div>
    </section>

    <p v-if="errorMessage" class="my-nearby-stations-page__error" role="alert">
      {{ errorMessage }}
      <button type="button" @click="retry">{{ t("common.actions.retry") }}</button>
    </p>
    <p v-if="heavyErrorMessage" class="my-nearby-stations-page__notice" role="status">
      {{ heavyErrorMessage }}
    </p>
    <p v-if="stationCopyFeedback" class="my-nearby-stations-page__notice" role="status">
      {{ stationCopyFeedback }}
    </p>

    <section class="my-nearby-stations-page__radius">
      <div>
        <label for="my-nearby-radius">{{ t("nearbyStations.radius") }}</label>
        <strong>{{ nearby.radius.value }} m</strong>
      </div>
      <input
        id="my-nearby-radius"
        v-model.number="nearby.radius.value"
        type="range"
        :min="NEARBY_RADIUS_MIN_METERS"
        :max="NEARBY_RADIUS_MAX_METERS"
        :step="NEARBY_RADIUS_STEP_METERS"
      />
    </section>

    <section class="my-nearby-stations-page__filters" :aria-label="t('nearbyStations.filtersAria')">
      <button
        v-for="mode in NEARBY_SUPPORTED_MODES"
        :key="mode"
        type="button"
        :aria-pressed="modeActive(mode)"
        :class="{ 'my-nearby-stations-page__filter--active': modeActive(mode) }"
        @click="nearby.toggleMode(mode)"
      >
        {{ modeLabel(mode) }}
      </button>
    </section>

    <section v-if="nearby.selectedPlace.value && !nearbyDirectoryOpen" class="my-nearby-stations-page__map-section">
      <NearbyStationsMap
        :origin="nearby.selectedPlace.value"
        :radius="nearby.radius.value"
        :stations="nearby.visibleStations.value.filter((entry) => !hiddenStationIds.has(entry.id))"
        :supplemental-stations="scheduleHeavyStations"
        :selected-line-ids="nearby.selectedLineIds"
        :active-modes="nearby.activeModes.value"
        :available-modes="NEARBY_SUPPORTED_MODES"
        :basemap-style="basemapStyle"
        :show-isochrone-control="settings.nearbyMapShowIsochroneControl"
        :show-directory-control="settings.nearbyMapShowDirectoryControl"
        show-neighborhood-score-control
        :show-basemap-control="settings.nearbyMapShowBasemapControl"
        :show-display-control="settings.nearbyMapShowDisplayControl"
        :show-fullscreen-control="settings.nearbyMapShowFullscreenControl"
        :loading="nearby.isScanning.value || lineFlow.lineFlowLoading.value || heavy.isLoading.value"
        :line-flow-model="lineFlow.lineFlowModel.value"
        :line-flow-models="lineFlowModels"
        :active-line-id="lineFlow.activeLineId.value"
        :hovered-line-id="lineFlow.hoveredLineId.value"
        :trace-action-label="t('nearbyStations.viewTrace')"
        :cluster-grouping-distance-meters="nearby.clusterGroupingDistanceMeters.value"
        :station-has-upcoming-departure="stationHasUpcomingDeparture"
        :hide-stations-without-departures="hideStationsWithoutDepartures"
        v-model:hide-long-wait-transports="hideLongWaitTransports"
        v-model:show-nearby-places="showNearbyPlaces"
        v-model:show-nearby-place-names="showNearbyPlaceNames"
        :places="nearbyMapPlaces"
        :selected-place-id="nearbySelectedPlaceId"
        :walking-routes="nearbyPlaceWalkingRoutes"
        :walking-route="nearbySelectedWalkingRoute"
        :travel-panel-open="travelPanelOpen"
        :travel-walking-segments="travelWalkingSegments"
        :schedule-state="schedules.scheduleState"
        @camera-change="lineFlow.handleCameraChange"
        @hover-line="lineFlow.handleHoverLine"
        @leave-line="lineFlow.handleLeaveLine"
        @activate-line="lineFlow.handleActivateLine"
        @clear-line-focus="lineFlow.clearLineFocus"
        @update-active-modes="updateActiveModes"
        @update-cluster-grouping-distance="updateClusterGroupingDistance"
        @update-hide-stations-without-departures="updateHideStationsWithoutDepartures"
        @toggle-station="nearby.toggleStation"
        @toggle-line="nearby.toggleLine"
        @toggle-station-schedule="schedules.toggleStationSchedule"
        @station-context-menu="openStationContextMenu"
        @place-context-menu="openPlaceContextMenu"
        @sidebar-actions="openSidebarMenu"
        @station-focus="handleStationFocus"
        @view-trace="openLineTrace"
        @toggle-travel-panel="travelPanelOpen = !travelPanelOpen"
        @fullscreen-change="handleNearbyMapFullscreen"
        @open-places-directory="openNearbyDirectory"
        @open-neighborhood-score="openNearbyNeighborhoodScore"
        @select-place="selectNearbyPlace"
      >
        <template #travel-sidebar>
          <LeftNearbySidebar @close="travelPanelOpen = false">
            <LeftNearbySidebarBodyTravel
              :origin-label="nearby.selectedPlace.value?.label ?? selectedPreset?.label ?? ''"
              :show-line-icons="settings.showTravelRouteLineIcons"
              :destination="travelRoutes.destination.value"
              :destination-search="travelRoutes.searchDestinations"
              autocomplete-places
              :walking-routes="travelWalkingRoutes"
              :departure-date-time="travelRoutes.departureDateTime.value"
              :available-modes="NEARBY_SUPPORTED_MODES"
              :allowed-modes="travelAllowedModes"
              :mode-label="modeLabel"
              :resolve-line-id="resolveTravelNetworkLineId"
              :routes="visibleTravelRoutes"
              :selected-route-id="travelRoutes.selectedRouteId.value"
              :loading="travelRoutes.isLoading.value"
              :error="travelRoutes.error.value"
              :get-section-exits="getNearbySectionExits"
              :traffic-tone-for-line="travelTrafficTone"
              :route-alarm-active="isTravelRouteAlarmActive"
              @destination="travelRoutes.setDestination"
              @update:departure-date-time="travelRoutes.setDepartureDateTime"
              @update:allowed-modes="updateTravelAllowedModes"
              @select-route="selectTravelRoute"
              @schedule-route-alarm="openTravelRouteAlarmModal"
              @refresh="travelRoutes.refresh"
            />
          </LeftNearbySidebar>
        </template>
        <template #heavy-access-guide="{ candidate }">
          <NearbyHeavyAccessGuide
            v-if="candidate"
            :candidate="candidate"
            :items="displayedScheduleItems"
            :direction-visible="schedules.isDirectionVisible"
          />
        </template>
        <template #station-schedules="{ activeStationId, fullscreen }">
          <NearbyStationSchedulePanel
            :items="displayedScheduleItems"
            :active-modes="nearby.activeModes.value"
            :active-station-id="activeStationId"
            :loading="schedules.isRefreshing.value"
            :fullscreen="fullscreen"
            :radius-meters="nearby.radius.value"
            context-menu-mode="station"
            :direction-visible="schedules.isDirectionVisible"
            :focused-station-id="focusedScheduleStationId"
            :traffic-alert-for-item="getNearbyTrafficAlert"
            :alarm-departure-ids="nearbyBoardAlarmDepartureIds"
            @station-context-menu="openStationContextMenu"
            @direction-context-menu="openDirectionContextMenu"
            @clear-station-focus="focusedScheduleStationId = undefined"
            @open-traffic="openNearbyTrafficModal"
            @open-line-page="openNearbyLinePage"
            @open-fullscreen-panel="openNearbyFullscreenPanel"
            @remove-item="schedules.removeItem"
            @update-hidden-directions="schedules.setHiddenDirections"
            @schedule-alarm="openNearbyAlarmModal"
          />
        </template>
        <template #station-schedules-inline="{ stationId, emphasizedLineIds, hideLongWaitTransports }">
          <NearbyStationScheduleInline
            :items="displayedScheduleItems"
            :station-id="stationId"
            :emphasized-line-ids="emphasizedLineIds"
            :direction-visible="schedules.isDirectionVisible"
            :hide-long-wait-transports="hideLongWaitTransports"
          />
        </template>
        <template #sidebar-actions>
          <ContextMenu
            v-model:open="sidebarMenuOpen"
            :anchor="sidebarMenuAnchor"
            :aria-label="t('nearbyStations.sidebarOptions')"
            teleport-to=".nearby-map-shell"
            class="my-nearby-stations-page__context-menu"
            placement="bottom-end"
          >
            <button type="button" role="menuitem" @click="resetNearbyVisibility">
              <RotateCcw :size="16" aria-hidden="true" />
              {{ t("nearbyStations.resetVisibility") }}
            </button>
            <button type="button" role="menuitem" @click="refreshNearbyDepartures">
              <RefreshCw :size="16" aria-hidden="true" />
              {{ t("nearbyStations.refreshDepartures") }}
            </button>
          </ContextMenu>
        </template>
        <template #line-trace-modal>
          <NearbyLineTraceModal
            :open="lineTraceModalOpen"
            :line="lineTraceLine"
            :direction="lineTraceDirectionLabel"
            :current-city="lineTraceCurrentCity"
            :cities="lineTraceCities"
            @close="closeLineTrace"
          />
        </template>
        <template #traffic-modal>
          <UserFriendlyTrafficModal
            :open="nearbyTrafficModalOpen"
            :alert="nearbyTrafficModalAlert"
            :smart-formatting-enabled="settings.smartTrafficModalFormatting"
            @close="closeNearbyTrafficModal"
          />
        </template>
      </NearbyStationsMap>
    </section>

    <NearbyPlacesDirectoryOverlay
      v-if="nearby.selectedPlace.value"
      :open="nearbyDirectoryOpen"
      :origin="nearby.selectedPlace.value"
      :places="nearbyPlaces.places.value"
      :walking-minutes="nearbyDirectoryWalkingMinutes"
      :selected-place-id="nearbySelectedPlaceId"
      :walking-routes="nearbyPlaceWalkingRoutes"
      :walking-progress="nearbyPlaceWalkingProgress"
      :loading-group-ids="nearbyPlaceLoadingGroupIds"
      :loading="nearbyPlaces.isLoading.value"
      :error="nearbyPlacesErrorMessage"
      :basemap-style="basemapStyle"
      @close="closeNearbyDirectory"
      @retry="nearbyPlaces.refresh"
      @update:walking-minutes="nearbyDirectoryWalkingMinutes = $event"
      @select-place="selectNearbyPlace"
      @request-group-walking-routes="requestNearbyPlaceGroupWalkingRoutes"
      @place-context-menu="openPlaceContextMenu"
    />
    <section v-else class="my-nearby-stations-page__empty" role="status">
      <LoaderCircle v-if="placeLoading" class="my-nearby-stations-page__spin" :size="28" aria-hidden="true" />
      <MapPin v-else :size="30" aria-hidden="true" />
      <strong>{{ placeLoading ? t("nearbyStations.addressLoading") : t("nearbyStations.emptyTitle") }}</strong>
      <span>{{ t("nearbyStations.emptyBody") }}</span>
    </section>

    <ContextMenu
      v-model:open="stationMenuOpen"
      :anchor="stationMenuAnchor"
      :aria-label="t('nearbyStations.stationOptions')"
      teleport-to=".nearby-map-shell"
      class="my-nearby-stations-page__context-menu"
    >
      <button type="button" role="menuitem" @click="openContextStationInGoogleMaps">
        <MapIcon :size="16" aria-hidden="true" />
        {{ t("nearbyStations.openStationInGoogleMaps") }}
      </button>
      <button type="button" role="menuitem" @click="travelToContextStation">
        <Route :size="16" aria-hidden="true" />
        {{ t("nearbyStations.travelToStation") }}
      </button>
      <button type="button" role="menuitem" @click="copyContextStationAddress">
        <Copy :size="16" aria-hidden="true" />
        {{ t("nearbyStations.copyStationAddress") }}
      </button>
      <button type="button" role="menuitem" @click="toggleContextStationSchedule">
        <Check v-if="isContextStationScheduleVisible()" :size="16" aria-hidden="true" />
        <EyeOff v-else :size="16" aria-hidden="true" />
        {{ isContextStationScheduleVisible() ? t("nearbyStations.hideSchedule") : t("nearbyStations.showSchedule") }}
      </button>
      <button type="button" role="menuitem" class="context-menu-danger my-nearby-stations-page__context-danger" @click="askToHideStation">
        <Trash2 :size="16" aria-hidden="true" />
        {{ t("nearbyStations.hideStation") }}
      </button>
    </ContextMenu>

    <ContextMenu
      v-model:open="placeMenuOpen"
      :anchor="placeMenuAnchor"
      :aria-label="t('nearbyStations.placeOptions')"
      class="my-nearby-stations-page__context-menu"
      teleport-to="body"
      :z-index="12050"
    >
      <button type="button" role="menuitem" @click="openContextPlaceInGoogleMaps">
        <MapIcon :size="16" aria-hidden="true" />
        {{ t("nearbyStations.openPlaceInGoogleMaps") }}
      </button>
      <button type="button" role="menuitem" @click="travelToContextPlace">
        <Route :size="16" aria-hidden="true" />
        {{ t("nearbyStations.travelToPlace") }}
      </button>
      <button type="button" role="menuitem" @click="copyContextPlaceAddress">
        <Copy :size="16" aria-hidden="true" />
        {{ t("nearbyStations.copyPlaceAddress") }}
      </button>
    </ContextMenu>

    <ContextMenu
      v-model:open="directionMenuOpen"
      :anchor="directionMenuAnchor"
      :aria-label="t('nearbyStations.directionOptions')"
      teleport-to=".nearby-map-shell"
      class="my-nearby-stations-page__context-menu"
    >
      <button type="button" role="menuitem" @click="toggleContextDirection">
        <Check
          v-if="directionMenuItemId && directionMenuId && schedules.isDirectionVisible(directionMenuItemId, directionMenuId)"
          :size="16"
          aria-hidden="true"
        />
        <EyeOff v-else :size="16" aria-hidden="true" />
        {{ t("nearbyStations.showDirection", { direction: directionMenuLabel }) }}
      </button>
    </ContextMenu>

    <AppModal
      :open="stationDeleteModalOpen"
      :eyebrow="t('nearbyStations.hideStationEyebrow')"
      :title="t('nearbyStations.hideStationTitle')"
      @close="stationDeleteModalOpen = false"
    >
      <p class="my-nearby-stations-page__modal-copy">{{ t("nearbyStations.hideStationConfirmation") }}</p>
      <template #footer>
        <button class="button-secondary" type="button" @click="stationDeleteModalOpen = false">
          {{ t("common.actions.cancel") }}
        </button>
        <button class="my-nearby-stations-page__danger-button" type="button" @click="confirmHideStation">
          {{ t("nearbyStations.hideStation") }}
        </button>
      </template>
    </AppModal>

    <Teleport to="body">
      <FullscreenStationPanel
        v-if="nearbyFullscreenBoard"
        :station-name="nearbyFullscreenBoard.title"
        :city="nearbyFullscreenBoard.city"
        :line-name="nearbyFullscreenBoard.line.longName"
        :line-short-name="nearbyFullscreenBoard.line.shortName"
        :line-color="nearbyFullscreenBoard.line.color"
        :line-text-color="nearbyFullscreenBoard.line.textColor"
        :transport-type-label="nearbyFullscreenBoard.line.mode"
        :directions="nearbyFullscreenDirections"
        :loading="nearbyFullscreenItem?.state === 'loading'"
        :error="nearbyFullscreenItem?.state === 'unavailable' ? t('nearbyStations.scheduleUnavailable') : undefined"
        :smart-traffic-modal-formatting="settings.smartTrafficModalFormatting"
        @refresh="schedules.refresh"
        @close="closeNearbyFullscreenPanel"
      >
        <template #line-logo>
          <LineIconBadge :line="nearbyFullscreenBoard.line" />
        </template>
      </FullscreenStationPanel>
    </Teleport>

    <DepartureAlarmModal
      v-if="nearbyAlarmTarget"
      :board="nearbyAlarmTarget.board"
      :departure="nearbyAlarmTarget.departure"
      :open="Boolean(nearbyAlarmTarget)"
      :active-alarm="nearbyAlarmTarget.activeAlarm"
      :initial-minutes-before="nearbyAlarmTarget.context?.initialMinutesBefore"
      :transport-type-label="nearbyAlarmTarget.context?.transportTypeLabel"
      :native-sound-required="nearbyNativeAlarmPlatform"
      :native-permission-state="nearbyAlarmPermissionState"
      :busy="nearbyAlarmModalBusy"
      :error="nearbyAlarmModalError"
      :above-fullscreen="nearbyMapFullscreen || Boolean(nearbyFullscreenBoard)"
      :teleport-target="nearbyMapFullscreen ? '.nearby-map-shell' : 'body'"
      @cancel="cancelNearbyAlarmModal"
      @confirm="confirmNearbyAlarm"
      @remove="removeNearbyAlarm"
      @request-native-permissions="requestNearbyAlarmPermissions"
    >
      <template #before-departure-hint="{ minutesBefore, remainingMinutes, transportTypeLabel }">
        <p v-if="nearbyAlarmTarget.context" class="alarm-modal__context-copy">
          {{ t("nearbyStations.travel.routeAlarmHint", {
            remainingMinutes: remainingMinutes ?? 0,
            minutesBefore,
            transport: transportTypeLabel,
            walkingMinutes: nearbyAlarmTarget.context.walkingMinutes,
            safetyMinutes: nearbyAlarmTarget.context.safetyMinutes,
          }) }}
        </p>
      </template>
    </DepartureAlarmModal>

  </main>
</template>

<style scoped>
.my-nearby-stations-page { display: grid; gap: 16px; margin: 0 auto; max-width: 1240px; padding: 28px 22px 118px; }
.my-nearby-stations-page__hero { align-items: center; background: linear-gradient(135deg, #f4f2ff, #edf7ff); border: 1px solid rgba(81,70,255,.14); border-radius: 20px; display: flex; justify-content: space-between; overflow: hidden; padding: 24px 26px; }
.my-nearby-stations-page__eyebrow { color: #5146ff; font-size: .7rem; font-weight: 900; letter-spacing: .1em; margin: 0 0 5px; text-transform: uppercase; }
.my-nearby-stations-page h1 { color: var(--ink); font-size: clamp(1.5rem, 3vw, 2.2rem); margin: 0; }
.my-nearby-stations-page__hero p:last-child { color: var(--muted); margin: 7px 0 0; max-width: 680px; }
.my-nearby-stations-page__hero-icon { color: #5146ff; margin-right: 10px; opacity: .8; }
.my-nearby-stations-page__controls { align-items: end; background: #fff; border: 1px solid var(--border); border-radius: 14px; display: flex; gap: 14px; justify-content: space-between; padding: 14px 16px; }
.my-nearby-stations-page__address { display: grid; gap: 6px; min-width: min(100%, 560px); }
.my-nearby-stations-page__address span, .my-nearby-stations-page__radius label { color: var(--muted); font-size: .74rem; font-weight: 850; }
.my-nearby-stations-page__address select { background: #f8f9fd; border: 1px solid rgba(16,35,63,.14); border-radius: 9px; color: var(--ink); font: inherit; min-height: 42px; padding: 8px 11px; }
.my-nearby-stations-page__status, .my-nearby-stations-page__resolved { align-items: center; color: var(--muted); display: inline-flex; font-size: .78rem; gap: 7px; white-space: nowrap; }
.my-nearby-stations-page__resolved { color: #17864c; font-weight: 800; }
.my-nearby-stations-page__spin { animation: my-nearby-spin 900ms linear infinite; color: #5146ff; }
.my-nearby-stations-page__error { align-items: center; background: #fff5f4; border: 1px solid rgba(217,45,32,.18); border-radius: 10px; color: #a5231d; display: flex; font-size: .8rem; gap: 12px; justify-content: space-between; margin: 0; padding: 10px 13px; }
.my-nearby-stations-page__error button { background: transparent; color: #a5231d; font-weight: 850; padding: 3px 6px; }
.my-nearby-stations-page__notice { background: #f5f3ff; border: 1px solid rgba(81,70,255,.16); border-radius: 10px; color: #4034df; font-size: .78rem; margin: 0; padding: 10px 13px; }
.my-nearby-stations-page__radius { background: #fff; border: 1px solid var(--border); border-radius: 14px; display: grid; gap: 8px; padding: 13px 16px; }
.my-nearby-stations-page__radius > div { align-items: center; display: flex; justify-content: space-between; }
.my-nearby-stations-page__radius strong { color: #5146ff; font-size: .82rem; }
.my-nearby-stations-page__radius input { accent-color: #5146ff; width: 100%; }
.my-nearby-stations-page__filters { display: flex; flex-wrap: wrap; gap: 7px; }
.my-nearby-stations-page__filters button { background: #f2f4f8; color: var(--muted); font-size: .76rem; min-height: 32px; padding: 6px 10px; }
.my-nearby-stations-page__filters button.my-nearby-stations-page__filter--active { background: #e8e5ff; box-shadow: inset 0 0 0 1px rgba(81,70,255,.24); color: #4034df; }
.my-nearby-stations-page__map-section { min-width: 0; }
.my-nearby-stations-page__empty { align-items: center; background: linear-gradient(135deg, #f7f7ff, #eef4fa); border: 1px dashed rgba(81,70,255,.3); border-radius: 14px; color: var(--muted); display: flex; flex-direction: column; gap: 7px; justify-content: center; min-height: 280px; padding: 28px; text-align: center; }
.my-nearby-stations-page__empty svg { color: #5146ff; }
.my-nearby-stations-page__empty strong { color: var(--ink); }
.my-nearby-stations-page__context-menu { background: #fff; border: 1px solid rgba(16,35,63,.14); border-radius: 12px; box-shadow: 0 14px 34px rgba(16,35,63,.2); display: grid; gap: 3px; min-width: 230px; padding: 6px; }
.my-nearby-stations-page__context-menu button { align-items: center; background: transparent; border-radius: 8px; color: var(--ink); display: flex; font-size: .78rem; gap: 8px; justify-content: flex-start; min-height: 36px; padding: 7px 9px; text-align: left; width: 100%; }
.my-nearby-stations-page__context-menu button:hover, .my-nearby-stations-page__context-menu button:focus-visible { background: #f1efff; color: #4034df; outline: 0; }
.my-nearby-stations-page__context-menu .my-nearby-stations-page__context-danger { color: #b42318; }
.my-nearby-stations-page__context-menu .my-nearby-stations-page__context-danger:hover, .my-nearby-stations-page__context-menu .my-nearby-stations-page__context-danger:focus-visible { background: #fff1f0; color: #b42318; }
.my-nearby-stations-page__modal-copy { color: var(--muted); line-height: 1.5; margin: 0; }
.my-nearby-stations-page__danger-button { background: #b42318; color: #fff; font-weight: 850; }
.my-nearby-stations-page__danger-button:hover, .my-nearby-stations-page__danger-button:focus-visible { background: #8f1c14; color: #fff; }
@keyframes my-nearby-spin { to { transform: rotate(360deg); } }
@media (max-width: 680px) {
  .my-nearby-stations-page { padding: 18px 12px 108px; }
  .my-nearby-stations-page__hero { padding: 19px; }
  .my-nearby-stations-page__hero-icon { display: none; }
  .my-nearby-stations-page__controls { align-items: stretch; flex-direction: column; }
  .my-nearby-stations-page__address { min-width: 0; }
  .my-nearby-stations-page__status, .my-nearby-stations-page__resolved { white-space: normal; }
}
</style>
