<script setup lang="ts">
import "@vue-flow/core/dist/style.css";
import "@vue-flow/controls/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { Handle, Position, VueFlow } from "@vue-flow/core";
import type { Edge, Node } from "@vue-flow/core";
import LineIconBadge from "../../components/LineIconBadge.vue";
import MaterialCombobox from "../../components/MaterialCombobox.vue";
import StationTransferDetails from "../../components/StationTransferDetails.vue";
import { transitModeToFamily } from "../../services/linePresentation";
import { Controls } from "@vue-flow/controls";
import {
  EllipsisVertical,
  Expand,
  Minimize2,
  SlidersHorizontal,
} from "lucide-vue-next";
import DistanceToggle from "../../components/DistanceToggle.vue";
import PatternFlowMiniMap from "./PatternFlowMiniMap.vue";
import { resolveTransitLonLat } from "../network-ghost/geoProjection";
import {
  formatTransitDistance,
  getCoordinatesDistanceKm,
} from "../../services/distance";
import {
  createPatternStationKey as createStationKey,
  patternStationKeysAreCompatible as stationKeysAreCompatible,
} from "./stationKeys";
import {
  getFlowLightEdgeClass,
  getVisualFlowEdgeEndpoints,
} from "./flowDirection";
import {
  countPatternTopologyStations,
  shouldUseCompactPatternFlow,
} from "./compactPatternFlow";
import {
  hydrateDeparturePatternTransfers,
  type PatternTransferHydrationProgress,
} from "./patternTransfers";
import { clearTransferBundleForBoard } from "./transferBundles";
import {
  filterCurrentLineTransfers,
  filterDuplicateBusTransfers,
  isBusLikeTransfer,
  isVisiblePatternPlanTransfer,
  type CurrentLineIdentity,
} from "./transferVisibility";
import type { TransferResolverMode } from "./transferResolverMode";
import type { HealthCheck, HealthResponse } from "../health/types";

import type {
  Departure,
  DepartureCall,
  DepartureCallingPattern,
  DepartureServiceType,
  LineRouteBranchLayout,
  LineRouteSequence,
  LineRouteStop,
  LinePatternDirectionOption,
  TransferLineOption,
  TransitBoardConfig,
} from "../../types/transit";

type PatternStationFlowNode = Node<
  PatternStationNodeData,
  Record<string, never>,
  "station"
>;
type PatternCityZoneFlowNode = Node<
  PatternCityZoneNodeData,
  Record<string, never>,
  "city-zone"
>;
type PatternFlowNode = PatternStationFlowNode | PatternCityZoneFlowNode;
type PatternFlowEdge = Edge<
  Record<string, never>,
  Record<string, never>,
  "straight"
>;

interface PatternStationNodeData {
  key: string;
  label: string;
  city?: string;
  time?: string;
  current: boolean;
  served: boolean;
  branchEnd: boolean;
  branchChip?: string;
  busTransfers: TransferLineOption[];
  nonBusTransfers: TransferLineOption[];
  transfers: TransferLineOption[];
}

interface PatternCityZoneNodeData {
  key: string;
  city: string;
  width: number;
  stationCount: number;
}

type PatternCompactMode = "auto" | "comfort" | "compact";

interface PatternGraphNode {
  id: string;
  label: string;
  city?: string;
  lon?: number;
  lat?: number;
  coordinatePriority: number;
  current: boolean;
  served: boolean;
  time?: string;
  transfers: TransferLineOption[];
  degree: number;
}

interface PatternGraphEdge {
  id: string;
  source: string;
  target: string;
  active: boolean;
  distanceKm?: number;
}

interface PatternFlowModel {
  nodes: PatternFlowNode[];
  stationNodes: PatternStationFlowNode[];
  edges: PatternFlowEdge[];
}

interface PatternCityZoneGroup {
  city: string;
  stationKeys: string[];
}

interface TransportModeIcon {
  key: string;
  label: string;
  title: string;
}

interface PatternViewport {
  x: number;
  y: number;
  zoom: number;
}

interface PatternFlowViewportController {
  setViewport?: (
    viewport: PatternViewport,
    options?: { duration?: number },
  ) => unknown;
}

interface PatternViewportPoint {
  x: number;
  y: number;
}

interface PatternViewportSize {
  width: number;
  height: number;
}

interface PatternTopologyLayout {
  degrees: Map<string, number>;
  positions: Map<string, { x: number; y: number }>;
  syntheticEdges: PatternGraphEdge[];
  visibleEdges: Set<string>;
}

const REGULAR_NODE_WIDTH = 184;
const REGULAR_NODE_HEIGHT = 104;
const COMPACT_NODE_WIDTH = 128;
const COMPACT_NODE_HEIGHT = 150;
const DISTANCE_LABEL_EXIT_MS = 240;
const TRANSFER_HYDRATION_STALLED_RETRY_MS = 60_000;
const TRANSFER_HYDRATION_RATE_LIMIT_CHECK_MS = 1_200;
type PatternLayoutOptions = {
  compact: boolean;
  nodeWidth: number;
  nodeHeight: number;
  stopGap: number;
  branchGap: number;
  sameDirectionForkGap: number;
  rankSeparator: number;
  nodeSeparator: number;
};

const props = withDefaults(
  defineProps<{
    open: boolean;
    board?: TransitBoardConfig;
    departure?: Departure;
    pattern?: DepartureCallingPattern;
    loading?: boolean;
    error?: string;
    embedded?: boolean;
    wheelZoom?: boolean;
    fullLine?: boolean;
    directionOptions?: LinePatternDirectionOption[];
    selectedDirectionId?: string;
    showMiniMap?: boolean;
    showCityZones?: boolean;
    compactMode?: PatternCompactMode;
    richTransferTooltips?: boolean;
    reduceMotion?: boolean;
    transferBundleRetentionDays?: number;
    transferBundleRequestConcurrency?: number;
    transferBundleRequestSpacingMs?: number;
    transferBundleLocalCacheEnabled?: boolean;
    transferBundleBackendCacheEnabled?: boolean;
    transportType?: string;
    transferResolverMode?: TransferResolverMode;
  }>(),
  {
    showMiniMap: true,
    showCityZones: true,
    compactMode: "auto",
    richTransferTooltips: true,
    reduceMotion: false,
    transferBundleLocalCacheEnabled: true,
    transferBundleBackendCacheEnabled: true,
    transferBundleRetentionDays: 15,
    transferBundleRequestConcurrency: 1,
    transferBundleRequestSpacingMs: 0,
    transferResolverMode: "auto",
  },
);

const emit = defineEmits<{
  close: [];
  directionChange: [directionId: string];
}>();

const isPatternFlowFullscreen = ref(false);
const isCompactPatternFlow = ref(false);
const showPatternDistances = ref(false);
const patternDistanceLabelsVisible = ref(false);
const patternDistanceLabelsLeaving = ref(false);
const patternFlowShell = ref<HTMLElement>();
const patternFlowViewport = ref<PatternViewport>({ x: 0, y: 0, zoom: 1 });
const patternFlowViewportController = ref<PatternFlowViewportController>();
const patternFlowViewportSize = ref<PatternViewportSize>({
  width: 0,
  height: 0,
});
const mobileFlowActionsOpen = ref(false);
const hydratedPattern = ref<DepartureCallingPattern>();
const transferHydrationLoading = ref(false);
const transferHydrationProgress = ref<PatternTransferHydrationProgress>({
  completed: 0,
  failed: 0,
  pending: 0,
  total: 0,
});
const transferHydrationRetryVisible = ref(false);
const transferHydrationRateLimited = ref(false);
const activeStationTooltipKey = ref<string>();
let transferHydrationRequest = 0;
let patternDistanceLabelHideTimer: number | undefined;
let transferHydrationRateLimitTimer: number | undefined;
let transferHydrationStalledTimer: number | undefined;
let compactDecisionKey = "";
let stationTooltipHideTimer: number | undefined;
const missingNetexTownWarningKeys = new Set<string>();

const serviceLabel = computed(() =>
  displayPattern.value
    ? formatServiceType(displayPattern.value.serviceType)
    : "Desserte",
);

const transferHydrationProgressPercent = computed(() => {
  const total = transferHydrationProgress.value.total;

  if (total <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, (transferHydrationProgress.value.completed / total) * 100),
  );
});

const transferHydrationProgressLabel = computed(() => {
  const total = transferHydrationProgress.value.total;

  if (total <= 0) {
    return "Préparation";
  }

  return `${transferHydrationProgress.value.completed}/${total}`;
});
const transferHydrationStatusLabel = computed(() =>
  transferHydrationRateLimited.value
    ? "Limite API quotidienne atteinte"
    : transferHydrationRetryVisible.value
      ? "Correspondances bloquées"
      : "Chargement des correspondances",
);
const transferHydrationDetailLabel = computed(() =>
  transferHydrationRateLimited.value
    ? "Les correspondances sont temporairement indisponibles"
    : transferHydrationProgressLabel.value,
);
const servedCalls = computed(
  () => displayPattern.value?.calls.filter((call) => call.served) ?? [],
);
const destinationLabel = computed(
  () =>
    props.departure?.destination ??
    displayPattern.value?.destination ??
    "Destination",
);
const hasDirectionPicker = computed(
  () => props.embedded && (props.directionOptions?.length ?? 0) > 1,
);
const isFullLineMode = computed(() =>
  Boolean(props.embedded && props.fullLine),
);
const departureClock = computed(() =>
  formatClock(departureTime(props.departure)),
);
const servedStopsLabel = computed(() => {
  if (isFullLineMode.value) {
    return "Ligne complète";
  }

  const count = servedCalls.value.length;

  return count > 1 ? `${count} arrêts desservis` : `${count} arrêt desservi`;
});
const displayPattern = computed(() => hydratedPattern.value ?? props.pattern);
const topologyStationCount = computed(() =>
  countPatternTopologyStations(displayPattern.value?.lineTopology ?? []),
);

watch(
  () => ({
    departureId: displayPattern.value?.departureId,
    lineTopology: displayPattern.value?.lineTopology,
    showCityZones: props.showCityZones,
  }),
  () => {
    warnMissingNetexTown(displayPattern.value, props.showCityZones);
  },
  { immediate: true },
);

const currentLayoutOptions = computed(() =>
  createPatternLayoutOptions(isCompactPatternFlow.value),
);
const shouldZoomOnWheel = computed(() => Boolean(props.wheelZoom));
const currentLineIdentity = computed<CurrentLineIdentity | undefined>(() => {
  const board = props.board;

  if (!board) {
    return undefined;
  }

  return {
    family: transitModeToFamily(board.line.mode),
    ids: [board.schedule?.lineRef, board.line.ref, props.departure?.lineRef],
    labels: [board.line.shortName, board.line.longName],
  };
});
const transportModeIcon = computed(() =>
  createTransportModeIcon(props.board?.line.mode),
);
const flowModel = computed(() =>
  createPatternFlow(
    displayPattern.value?.calls ?? [],
    displayPattern.value?.lineTopology ?? [],
    departureClock.value,
    isCompactPatternFlow.value,
    isFullLineMode.value,
    currentLineIdentity.value,
    patternDistanceLabelsVisible.value,
    patternDistanceLabelsLeaving.value,
    props.showCityZones,
  ),
);
const patternFlowKey = computed(
  () =>
    `${displayPattern.value?.departureId ?? "empty"}:${
      isPatternFlowFullscreen.value ? "fullscreen" : "modal"
    }:${isCompactPatternFlow.value ? "compact" : "comfortable"}:${
      isFullLineMode.value ? "full" : "route"
    }:${props.showCityZones ? "cities" : "no-cities"}${
      props.board?.line.mode ? `:${props.board.line.mode}` : ""
    }`,
);
const initialViewport = computed(() => {
  const currentNode =
    flowModel.value.stationNodes.find((node) => node.data?.current) ??
    flowModel.value.stationNodes.find((node) => node.data?.served) ??
    flowModel.value.stationNodes[0];
  const nodeCount = flowModel.value.stationNodes.length;
  const layout = currentLayoutOptions.value;
  const zoom = createInitialZoom({
    fullscreen: isPatternFlowFullscreen.value,
    compact: isCompactPatternFlow.value,
    nodeCount,
  });
  const center = isPatternFlowFullscreen.value
    ? { x: 560, y: 360 }
    : { x: 280, y: 230 };

  if (!currentNode) {
    return {
      x: isPatternFlowFullscreen.value ? 72 : 24,
      y: isPatternFlowFullscreen.value ? 240 : 160,
      zoom,
    };
  }

  return {
    x: center.x - (currentNode.position.x + layout.nodeWidth / 2) * zoom,
    y: center.y - (currentNode.position.y + layout.nodeHeight / 2) * zoom,
    zoom,
  };
});

watch(
  initialViewport,
  (viewport) => {
    patternFlowViewport.value = {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    };
  },
  { immediate: true },
);

watch(showPatternDistances, (visible) => {
  clearPatternDistanceLabelHideTimer();

  if (visible) {
    patternDistanceLabelsVisible.value = true;
    patternDistanceLabelsLeaving.value = false;
    return;
  }

  if (!patternDistanceLabelsVisible.value) {
    return;
  }

  if (props.reduceMotion || typeof window === "undefined") {
    patternDistanceLabelsVisible.value = false;
    patternDistanceLabelsLeaving.value = false;
    return;
  }

  patternDistanceLabelsLeaving.value = true;
  patternDistanceLabelHideTimer = window.setTimeout(() => {
    patternDistanceLabelHideTimer = undefined;
    patternDistanceLabelsVisible.value = false;
    patternDistanceLabelsLeaving.value = false;
  }, DISTANCE_LABEL_EXIT_MS);
});

watch(
  patternFlowShell,
  (element, _previousElement, onCleanup) => {
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(syncPatternFlowViewportSize);

    resizeObserver.observe(element);
    void nextTick(syncPatternFlowViewportSize);

    onCleanup(() => {
      resizeObserver.disconnect();
    });
  },
  { flush: "post" },
);

watch(
  () =>
    `${displayPattern.value?.departureId ?? "empty"}:${topologyStationCount.value}:${props.compactMode}`,
  (key) => {
    if (key === compactDecisionKey) {
      return;
    }

    compactDecisionKey = key;
    isCompactPatternFlow.value = resolveInitialCompactPatternFlow();
  },
  { immediate: true },
);

function resolveInitialCompactPatternFlow(): boolean {
  if (props.compactMode === "compact") {
    return true;
  }

  if (props.compactMode === "comfort") {
    return false;
  }

  return shouldUseCompactPatternFlow(displayPattern.value?.lineTopology ?? []);
}

function createPatternLayoutOptions(compact: boolean): PatternLayoutOptions {
  return compact
    ? {
        compact: true,
        nodeWidth: COMPACT_NODE_WIDTH,
        nodeHeight: COMPACT_NODE_HEIGHT,
        stopGap: 138,
        branchGap: 258,
        sameDirectionForkGap: 158,
        rankSeparator: 116,
        nodeSeparator: 46,
      }
    : {
        compact: false,
        nodeWidth: REGULAR_NODE_WIDTH,
        nodeHeight: REGULAR_NODE_HEIGHT,
        stopGap: 236,
        branchGap: 184,
        sameDirectionForkGap: 184 * 0.58,
        rankSeparator: 96,
        nodeSeparator: 54,
      };
}

function createInitialZoom({
  fullscreen,
  compact,
  nodeCount,
}: {
  fullscreen: boolean;
  compact: boolean;
  nodeCount: number;
}): number {
  if (fullscreen) {
    if (nodeCount > 64) {
      return compact ? 0.68 : 0.58;
    }

    if (nodeCount > 42) {
      return compact ? 0.78 : 0.66;
    }

    return compact ? 0.96 : 0.92;
  }

  if (nodeCount > 64) {
    return compact ? 0.5 : 0.42;
  }

  if (nodeCount > 42) {
    return compact ? 0.6 : 0.5;
  }

  return compact ? 0.82 : 0.78;
}

function handlePatternFlowReady(instance: PatternFlowViewportController): void {
  patternFlowViewportController.value = instance;
  void nextTick(syncPatternFlowViewportSize);
}

function handlePatternFlowViewportChange(viewport: PatternViewport): void {
  patternFlowViewport.value = {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  };
}

function syncPatternFlowViewportSize(): void {
  const flowElement =
    patternFlowShell.value?.querySelector<HTMLElement>(".pattern-flow") ??
    patternFlowShell.value;

  if (!flowElement) {
    return;
  }

  patternFlowViewportSize.value = {
    width: flowElement.clientWidth,
    height: flowElement.clientHeight,
  };
}

function focusPatternFlowOn(point: PatternViewportPoint): void {
  const zoom = patternFlowViewport.value.zoom;
  const viewport = {
    x: patternFlowViewportSize.value.width / 2 - point.x * zoom,
    y: patternFlowViewportSize.value.height / 2 - point.y * zoom,
    zoom,
  };

  patternFlowViewport.value = viewport;
  patternFlowViewportController.value?.setViewport?.(viewport, {
    duration: 220,
  });
}

function formatClock(value?: string): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function formatServiceType(type: DepartureServiceType): string {
  if (type === "semi-direct") {
    return "Semi direct";
  }

  if (type === "direct") {
    return "Direct";
  }

  if (type === "omnibus") {
    return "Toutes stations";
  }

  return "Desserte";
}

function toggleMobileFlowActions(): void {
  mobileFlowActionsOpen.value = !mobileFlowActionsOpen.value;
}

function closeMobileFlowActions(): void {
  mobileFlowActionsOpen.value = false;
}

function createTransportModeIcon(mode?: string): TransportModeIcon {
  const family = transitModeToFamily(mode);

  if (family === "TRAM") {
    return { key: "tram", label: "TRAM", title: "Tramway" };
  }

  if (family === "METRO") {
    return { key: "metro", label: "M", title: "Métro" };
  }

  if (family === "RER") {
    return { key: "rer", label: "RER", title: "RER" };
  }

  if (family === "TRANSILIEN") {
    return { key: "train", label: "TRAIN", title: "Train" };
  }

  if (family === "BUS" || family === "NOCTILIEN") {
    return { key: "bus", label: "BUS", title: "Bus" };
  }

  return { key: "line", label: "LIGNE", title: "Ligne" };
}

function departureTime(departure?: Departure): string | undefined {
  return (
    departure?.expectedDepartureTime ??
    departure?.expectedArrivalTime ??
    departure?.aimedDepartureTime
  );
}

watch(
  [
    () => props.open,
    () => props.board?.id,
    () => props.pattern?.departureId,
    () => props.transportType,
    () => props.transferResolverMode,
    () => props.transferBundleRetentionDays,
    () => props.transferBundleLocalCacheEnabled,
    () => props.transferBundleBackendCacheEnabled,
  ],
  () => {
    void hydratePatternTransfers();
  },
  { immediate: true },
);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      closeMobileFlowActions();
    }
  },
);

async function hydratePatternTransfers(): Promise<void> {
  const requestId = ++transferHydrationRequest;
  const pattern = props.pattern;
  const board = props.board;

  hydratedPattern.value = pattern;
  transferHydrationRetryVisible.value = false;
  transferHydrationRateLimited.value = false;
  transferHydrationProgress.value = {
    completed: 0,
    failed: 0,
    pending: 0,
    total: 0,
  };

  if (!props.open || !board || !pattern) {
    transferHydrationLoading.value = false;
    resetTransferHydrationStallState();
    clearTransferHydrationRateLimitTimer();
    return;
  }

  if (typeof window === "undefined") {
    transferHydrationLoading.value = false;
    resetTransferHydrationStallState();
    clearTransferHydrationRateLimitTimer();
    return;
  }

  transferHydrationLoading.value = true;
  syncTransferHydrationStallTimer(requestId);
  syncTransferHydrationRateLimitCheck(requestId);

  try {
    const enrichedPattern = await hydrateDeparturePatternTransfers(
      board,
      pattern,
      undefined,
      {
        onProgress(progress) {
          if (requestId === transferHydrationRequest) {
            transferHydrationProgress.value = progress;
            syncTransferHydrationStallTimer(requestId);
            syncTransferHydrationRateLimitCheck(requestId);
          }
        },
        localCacheEnabled: props.transferBundleLocalCacheEnabled,
        backendCacheEnabled: props.transferBundleBackendCacheEnabled,
        retentionDays: props.transferBundleRetentionDays,
        transferBundleRequestConcurrency:
          props.transferBundleRequestConcurrency,
        transferBundleRequestSpacingMs: props.transferBundleRequestSpacingMs,
        transportType: props.transportType,
        transferResolverMode: props.transferResolverMode,
      },
    );

    if (requestId === transferHydrationRequest) {
      hydratedPattern.value = enrichedPattern;
    }
  } catch {
    if (requestId === transferHydrationRequest) {
      hydratedPattern.value = pattern;
    }
  } finally {
    if (requestId === transferHydrationRequest) {
      if (!transferHydrationRateLimited.value) {
        transferHydrationLoading.value = false;
        resetTransferHydrationStallState();
      } else {
        transferHydrationRetryVisible.value = true;
        clearTransferHydrationStallTimer();
      }
      clearTransferHydrationRateLimitTimer();
    }
  }
}

async function retryTransferHydrationFromScratch(): Promise<void> {
  if (!props.board) {
    return;
  }

  await clearTransferBundleForBoard(props.board);
  transferHydrationRequest += 1;
  transferHydrationRateLimited.value = false;
  resetTransferHydrationStallState();
  clearTransferHydrationRateLimitTimer();
  void hydratePatternTransfers();
}

function syncTransferHydrationStallTimer(requestId: number): void {
  clearTransferHydrationStallTimer();

  if (
    !transferHydrationLoading.value ||
    transferHydrationProgress.value.completed > 0
  ) {
    transferHydrationRetryVisible.value = false;
    return;
  }

  transferHydrationStalledTimer = window.setTimeout(() => {
    transferHydrationStalledTimer = undefined;

    if (
      requestId === transferHydrationRequest &&
      transferHydrationLoading.value &&
      transferHydrationProgress.value.completed === 0
    ) {
      transferHydrationRetryVisible.value = true;
      void checkTransferHydrationRateLimit(requestId);
    }
  }, TRANSFER_HYDRATION_STALLED_RETRY_MS);
}

function syncTransferHydrationRateLimitCheck(requestId: number): void {
  clearTransferHydrationRateLimitTimer();

  if (
    !transferHydrationLoading.value ||
    transferHydrationRateLimited.value ||
    transferHydrationProgress.value.completed > 0
  ) {
    return;
  }

  transferHydrationRateLimitTimer = window.setTimeout(() => {
    transferHydrationRateLimitTimer = undefined;
    void checkTransferHydrationRateLimit(requestId);
  }, TRANSFER_HYDRATION_RATE_LIMIT_CHECK_MS);
}

async function checkTransferHydrationRateLimit(
  requestId: number,
): Promise<void> {
  if (
    requestId !== transferHydrationRequest ||
    !transferHydrationLoading.value ||
    transferHydrationProgress.value.completed > 0
  ) {
    return;
  }

  try {
    const response = await fetch("/api/health");

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as HealthResponse;

    if (
      requestId === transferHydrationRequest &&
      transferHydrationLoading.value &&
      transferHydrationProgress.value.completed === 0 &&
      healthChecksIndicateMarketplaceRateLimit(payload.checks)
    ) {
      transferHydrationRateLimited.value = true;
      transferHydrationRetryVisible.value = true;
      clearTransferHydrationStallTimer();
    }
  } catch {
    // Health is best-effort here: the loader must keep its normal behavior if
    // the health endpoint itself is unavailable.
  }
}

function healthChecksIndicateMarketplaceRateLimit(
  checks: HealthCheck[],
): boolean {
  return checks
    .filter((check) => ["prim", "navitia", "prim-traffic"].includes(check.id))
    .some(healthCheckIndicatesRateLimit);
}

function healthCheckIndicatesRateLimit(check: HealthCheck): boolean {
  const remaining = check.quota?.remaining;
  const numericRemaining =
    remaining === undefined || remaining === "" ? undefined : Number(remaining);

  if (
    numericRemaining !== undefined &&
    Number.isFinite(numericRemaining) &&
    numericRemaining <= 0
  ) {
    return true;
  }

  const text = `${check.message} ${check.detail ?? ""}`.toLowerCase();

  return (
    text.includes("429") ||
    text.includes("rate limit") ||
    text.includes("ratelimit") ||
    text.includes("quota")
  );
}

function resetTransferHydrationStallState(): void {
  transferHydrationRetryVisible.value = false;
  clearTransferHydrationStallTimer();
}

function clearTransferHydrationStallTimer(): void {
  if (transferHydrationStalledTimer === undefined) {
    return;
  }

  window.clearTimeout(transferHydrationStalledTimer);
  transferHydrationStalledTimer = undefined;
}

function clearTransferHydrationRateLimitTimer(): void {
  if (transferHydrationRateLimitTimer === undefined) {
    return;
  }

  window.clearTimeout(transferHydrationRateLimitTimer);
  transferHydrationRateLimitTimer = undefined;
}

function clearPatternDistanceLabelHideTimer(): void {
  if (patternDistanceLabelHideTimer === undefined) {
    return;
  }

  window.clearTimeout(patternDistanceLabelHideTimer);
  patternDistanceLabelHideTimer = undefined;
}

function createPatternFlow(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
  departureTimeLabel: string,
  compact: boolean,
  fullLine: boolean,
  currentLine?: CurrentLineIdentity,
  showDistances = false,
  distanceLabelsLeaving = false,
  showCityZones = true,
): PatternFlowModel {
  const layout = createPatternLayoutOptions(compact);
  const graph = buildPatternGraph(calls, lineTopology, fullLine);
  const topology =
    createTopologyLayout(
      graph.nodes,
      graph.edges,
      calls,
      lineTopology,
      layout,
    ) ?? createFallbackTopologyLayout(graph, layout);

  const activeTerminalIds = getActiveTerminalIds(graph);
  const drawableEdges = [...graph.edges, ...topology.syntheticEdges];
  const stationNodes = graph.nodes.map((node) => {
    const position = topology.positions.get(node.id) ?? { x: 0, y: 0 };
    const isBranchEnd = node.degree <= 1;
    const visibleTransfers = filterDuplicateBusTransfers(
      filterCurrentLineTransfers(node.transfers, currentLine),
    );

    return {
      id: node.id,
      type: "station",
      position: {
        x: position.x - layout.nodeWidth / 2,
        y: position.y - layout.nodeHeight / 2,
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      draggable: false,
      selectable: false,
      connectable: false,
      class: node.current ? "pattern-flow-node--current" : undefined,
      zIndex: node.current ? 80 : node.transfers.length > 0 ? 60 : undefined,
      data: {
        key: node.id,
        label: node.label,
        city: node.city,
        time: node.time,
        current: node.current,
        served: node.served,
        branchEnd: isBranchEnd,
        branchChip: fullLine
          ? undefined
          : getBranchChip(node, activeTerminalIds, departureTimeLabel),
        busTransfers: visibleTransfers.filter(isBusTransfer),
        nonBusTransfers: visibleTransfers.filter(
          isVisiblePatternPlanTransfer,
        ),
        transfers: visibleTransfers,
      },
    } satisfies PatternStationFlowNode;
  });
  const cityZoneNodes = showCityZones
    ? createCityZoneFlowNodes({
        graphNodes: graph.nodes,
        graphEdges: graph.edges,
        positions: topology.positions,
        layout,
        compact,
      })
    : [];
  const nodes: PatternFlowNode[] = [...cityZoneNodes, ...stationNodes];
  const visibleDrawableEdges = drawableEdges.filter((edge) =>
    topology.visibleEdges.has(createEdgeKey(edge.source, edge.target)),
  );
  const activeRouteEdgeOrder = fullLine
    ? new Map<string, number>()
    : createActiveRouteEdgeOrder(calls, lineTopology);
  const activeRouteEdgeDirections = fullLine
    ? new Map<string, { source: string; target: string }>()
    : createActiveRouteEdgeDirections(calls, lineTopology);
  const activeLightEdges = fullLine
    ? []
    : visibleDrawableEdges
        .filter((edge) => edge.active)
        .map((edge, fallbackOrder) => ({
          edge,
          direction: activeRouteEdgeDirections.get(
            createEdgeKey(edge.source, edge.target),
          ),
          order:
            activeRouteEdgeOrder.get(createEdgeKey(edge.source, edge.target)) ??
            fallbackOrder,
        }))
        .sort((left, right) => left.order - right.order);
  const edges = [
    ...visibleDrawableEdges.map((edge) =>
      createFlowEdge(
        edge,
        topology.positions,
        showDistances,
        distanceLabelsLeaving,
      ),
    ),
    ...activeLightEdges.map(({ edge, direction, order }) =>
      createFlowLightEdge(
        edge,
        topology.positions,
        direction,
        order,
        activeLightEdges.length,
      ),
    ),
  ];

  return { nodes, stationNodes, edges };
}

function createCityZoneFlowNodes({
  graphNodes,
  graphEdges,
  positions,
  layout,
  compact,
}: {
  graphNodes: PatternGraphNode[];
  graphEdges: PatternGraphEdge[];
  positions: Map<string, { x: number; y: number }>;
  layout: PatternLayoutOptions;
  compact: boolean;
}): PatternCityZoneFlowNode[] {
  const groups = createCityZoneGroups(graphNodes, graphEdges);
  const minWidth = compact ? 92 : 118;
  const zonePadding = compact ? 70 : 96;
  const topOffset = compact ? 112 : 34;

  return groups
    .map((group, index): PatternCityZoneFlowNode | undefined => {
      const stationPositions = group.stationKeys
        .map((key) => positions.get(key))
        .filter((position): position is { x: number; y: number } =>
          Boolean(position),
        );

      if (stationPositions.length === 0) {
        return undefined;
      }

      const minX = Math.min(...stationPositions.map((position) => position.x));
      const maxX = Math.max(...stationPositions.map((position) => position.x));
      const minY = Math.min(...stationPositions.map((position) => position.y));
      const width = Math.max(minWidth, maxX - minX + zonePadding);
      const x = (minX + maxX) / 2 - width / 2;
      const y = minY - layout.nodeHeight / 2 - topOffset;

      return {
        id: `city-zone:${index}:${normalizeCityZoneKey(group.city)}:${group.stationKeys.join("|")}`,
        type: "city-zone",
        position: { x, y },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        class: "pattern-flow-city-zone-node",
        zIndex: 4,
        data: {
          key: group.stationKeys.join("|"),
          city: group.city,
          width,
          stationCount: new Set(group.stationKeys).size,
        },
      };
    })
    .filter((node): node is PatternCityZoneFlowNode => Boolean(node));
}

function createCityZoneGroups(
  graphNodes: PatternGraphNode[],
  graphEdges: PatternGraphEdge[],
): PatternCityZoneGroup[] {
  const nodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const nodeOrder = new Map(graphNodes.map((node, index) => [node.id, index]));
  const adjacency = new Map<string, Set<string>>();
  const groups: PatternCityZoneGroup[] = [];

  graphNodes.forEach((node) => {
    adjacency.set(node.id, new Set());
  });

  graphEdges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const sourceCityKey = normalizeCityZoneKey(source?.city);
    const targetCityKey = normalizeCityZoneKey(target?.city);

    if (!source || !target || !sourceCityKey || sourceCityKey !== targetCityKey) {
      return;
    }

    adjacency.get(source.id)?.add(target.id);
    adjacency.get(target.id)?.add(source.id);
  });

  const visited = new Set<string>();

  graphNodes.forEach((node) => {
    const city = normalizeCityLabel(node.city);

    if (!city || visited.has(node.id)) {
      return;
    }

    const cityKey = normalizeCityZoneKey(city);
    const stationKeys: string[] = [];
    const queue = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const stationKey = queue.shift()!;
      const station = nodeById.get(stationKey);

      if (!station || normalizeCityZoneKey(station.city) !== cityKey) {
        continue;
      }

      stationKeys.push(stationKey);

      (adjacency.get(stationKey) ?? new Set()).forEach((nextStationKey) => {
        if (!visited.has(nextStationKey)) {
          visited.add(nextStationKey);
          queue.push(nextStationKey);
        }
      });
    }

    stationKeys.sort(
      (left, right) =>
        (nodeOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (nodeOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
    );

    groups.push({
      city,
      stationKeys,
    });
  });

  return groups.sort(
    (left, right) =>
      Math.min(
        ...left.stationKeys.map(
          (stationKey) => nodeOrder.get(stationKey) ?? Number.MAX_SAFE_INTEGER,
        ),
      ) -
      Math.min(
        ...right.stationKeys.map(
          (stationKey) => nodeOrder.get(stationKey) ?? Number.MAX_SAFE_INTEGER,
        ),
      ),
  );
}

function normalizeCityLabel(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim();

  return normalized || undefined;
}

function warnMissingNetexTown(
  pattern: DepartureCallingPattern | undefined,
  showCityZones: boolean,
): void {
  if (!showCityZones || !pattern?.lineTopology?.length) {
    return;
  }

  const missing = new Map<string, LineRouteStop>();

  pattern.lineTopology.forEach((sequence) => {
    sequence.stops.forEach((stop) => {
      const city = normalizeCityLabel(stop.city ?? stop.station.city);

      if (!city) {
        missing.set(stop.id, stop);
      }
    });
  });

  if (missing.size === 0) {
    return;
  }

  const warningKey = [
    pattern.departureId,
    ...Array.from(missing.keys()).sort(),
  ].join("|");

  if (missingNetexTownWarningKeys.has(warningKey)) {
    return;
  }

  missingNetexTownWarningKeys.add(warningKey);

  const sample = Array.from(missing.values())
    .slice(0, 5)
    .map((stop) => `${stop.label} (${stop.id})`);

  console.warn(
    "[DeparturePatternModal] NeTEx Town manquant pour certaines stations; les zones de ville les ignoreront.",
    { count: missing.size, sample },
  );
}

function normalizeCityZoneKey(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function createFlowEdge(
  edge: PatternGraphEdge,
  positions: Map<string, { x: number; y: number }>,
  showDistance = false,
  distanceLabelsLeaving = false,
): PatternFlowEdge {
  const { source, target } = getVisualFlowEdgeEndpoints(edge, positions);
  const distanceLabel =
    showDistance && edge.distanceKm !== undefined
      ? formatTransitDistance(edge.distanceKm)
      : undefined;

  return {
    id: `${edge.id}:${source}:${target}`,
    source,
    target,
    sourceHandle: "station-source",
    targetHandle: "station-target",
    type: "straight",
    selectable: false,
    focusable: false,
    class: [
      edge.active
        ? "pattern-flow-edge--active"
        : "pattern-flow-edge--skipped",
      distanceLabel ? "pattern-flow-edge--distance" : "",
      distanceLabel && distanceLabelsLeaving
        ? "pattern-flow-edge--distance-leave"
        : "",
    ],
    label: distanceLabel,
    labelShowBg: Boolean(distanceLabel),
    labelBgPadding: [7, 5],
    labelBgBorderRadius: 7,
    style: {
      stroke: edge.active ? "var(--line-color)" : "#cbd5e1",
      strokeWidth: edge.active ? 10 : 7,
    },
  };
}

function createFlowLightEdge(
  edge: PatternGraphEdge,
  positions: Map<string, { x: number; y: number }>,
  direction: { source: string; target: string } | undefined,
  order: number,
  count: number,
): PatternFlowEdge {
  const flowEdge = createFlowEdge(edge, positions);
  const lightCycleSeconds = Math.max(8.5, count * 0.72);
  const lightDelay = (order * lightCycleSeconds) / Math.max(count, 1);

  return {
    ...flowEdge,
    id: `${flowEdge.id}:light`,
    class: getFlowLightEdgeClass({
      direction,
      visualEdge: flowEdge,
    }),
    style: {
      stroke: "color-mix(in srgb, var(--line-color), white 58%)",
      strokeOpacity: 0.42,
      strokeWidth: 14,
      "--flow-light-cycle": `${lightCycleSeconds.toFixed(2)}s`,
      "--flow-light-delay": `${lightDelay.toFixed(2)}s`,
    } as PatternFlowEdge["style"],
  };
}

function createTopologyLayout(
  nodes: PatternGraphNode[],
  edges: PatternGraphEdge[],
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
  layout: PatternLayoutOptions,
): PatternTopologyLayout | null {
  if (nodes.length === 0 || edges.length === 0) {
    return null;
  }

  const adjacency = createAdjacency(edges);
  const activeKeys = new Set(
    calls.filter((call) => call.served).map(createStationKey),
  );
  const currentKey = calls.find((call) => call.current)
    ? createStationKey(calls.find((call) => call.current)!)
    : undefined;
  const destinationKey = getServedDestinationKey(calls);
  const preferStructuralSpine = graphHasCycle(nodes, edges);
  const mainPath = chooseMainPath(
    nodes,
    adjacency,
    activeKeys,
    currentKey,
    destinationKey,
    preferStructuralSpine,
  );

  if (mainPath.length < 2) {
    return null;
  }

  orientPathTowardDeparture(mainPath, calls);

  const positions = new Map<string, { x: number; y: number }>();
  const visibleEdges = new Set<string>();
  const syntheticEdges: PatternGraphEdge[] = [];
  const placed = new Set<string>();
  const branchLayoutHints = createBranchLayoutHints(lineTopology);

  mainPath.forEach((key, index) => {
    positions.set(key, { x: index * layout.stopGap, y: 0 });
    placed.add(key);
  });
  addPathEdges(mainPath, visibleEdges);
  placeSameDirectionForks(
    branchLayoutHints,
    positions,
    placed,
    visibleEdges,
    layout,
  );

  const laneSteps = createLaneSteps();
  let guard = 0;

  while (placed.size < nodes.length && guard < nodes.length * 2) {
    guard += 1;

    const connectorPath = findBestConnectorPath(nodes, adjacency, placed);

    if (connectorPath) {
      placeConnectorPath(
        connectorPath,
        positions,
        placed,
        visibleEdges,
        laneSteps,
        layout,
      );
      continue;
    }

    const branchPath = findBestBranchPath(nodes, adjacency, placed);

    if (!branchPath) {
      break;
    }

    placeBranchPath(
      branchPath,
      positions,
      placed,
      visibleEdges,
      laneSteps,
      destinationKey,
      branchLayoutHints,
      layout,
    );
  }

  placeRemainingComponents(
    nodes,
    adjacency,
    positions,
    placed,
    visibleEdges,
    laneSteps,
    destinationKey,
    layout,
  );
  addGraphEdges(edges, visibleEdges);

  return {
    positions,
    syntheticEdges,
    visibleEdges,
    degrees: createDegreesFromEdges(edges),
  };
}

function createFallbackTopologyLayout(
  graph: {
    nodes: PatternGraphNode[];
    edges: PatternGraphEdge[];
  },
  layout: PatternLayoutOptions,
): PatternTopologyLayout {
  const visibleEdges = new Set(
    graph.edges.map((edge) => createEdgeKey(edge.source, edge.target)),
  );

  return {
    positions: createDagreLayout(graph, layout),
    syntheticEdges: [],
    visibleEdges,
    degrees: createDegreesFromEdgeKeys(visibleEdges),
  };
}

function createAdjacency(edges: PatternGraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    addNeighbor(adjacency, edge.source, edge.target);
    addNeighbor(adjacency, edge.target, edge.source);
  });

  return adjacency;
}

function addNeighbor(
  adjacency: Map<string, Set<string>>,
  source: string,
  target: string,
): void {
  if (!adjacency.has(source)) {
    adjacency.set(source, new Set<string>());
  }

  adjacency.get(source)!.add(target);
}

function chooseMainPath(
  nodes: PatternGraphNode[],
  adjacency: Map<string, Set<string>>,
  activeKeys: Set<string>,
  currentKey?: string,
  destinationKey?: string,
  preferStructuralSpine = false,
): string[] {
  const terminals = nodes
    .filter((node) => (adjacency.get(node.id)?.size ?? 0) <= 1)
    .map((node) => node.id);
  const candidates =
    terminals.length >= 2 ? terminals : nodes.map((node) => node.id);
  let bestPath: string[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;

  candidates.forEach((source, sourceIndex) => {
    candidates.slice(sourceIndex + 1).forEach((target) => {
      const path = findShortestPath(source, (key) => key === target, adjacency);

      if (!path) {
        return;
      }

      const score = scoreMainPath(
        path,
        activeKeys,
        currentKey,
        destinationKey,
        preferStructuralSpine,
      );

      if (score > bestScore) {
        bestScore = score;
        bestPath = path;
      }
    });
  });

  return bestPath;
}

function scoreMainPath(
  path: string[],
  activeKeys: Set<string>,
  currentKey?: string,
  destinationKey?: string,
  preferStructuralSpine = false,
): number {
  const activeCount = path.filter((key) => activeKeys.has(key)).length;
  const currentBonus = currentKey && path.includes(currentKey) ? 400 : 0;
  const destinationIndex = destinationKey ? path.indexOf(destinationKey) : -1;
  const destinationTerminalBonus =
    destinationIndex === 0 || destinationIndex === path.length - 1 ? 1200 : 0;
  const destinationPresenceBonus = destinationIndex >= 0 ? 500 : 0;

  if (preferStructuralSpine) {
    return (
      path.length * 90 +
      activeCount * 20 +
      currentBonus * 0.1 +
      destinationPresenceBonus * 0.15 +
      destinationTerminalBonus * 0.15
    );
  }

  return (
    path.length * 8 +
    activeCount * 120 +
    currentBonus +
    destinationPresenceBonus +
    destinationTerminalBonus
  );
}

function graphHasCycle(
  nodes: PatternGraphNode[],
  edges: PatternGraphEdge[],
): boolean {
  return (
    edges.length - nodes.length + countConnectedComponents(nodes, edges) > 0
  );
}

function countConnectedComponents(
  nodes: PatternGraphNode[],
  edges: PatternGraphEdge[],
): number {
  const adjacency = createAdjacency(edges);
  const visited = new Set<string>();
  let components = 0;

  nodes.forEach((node) => {
    if (visited.has(node.id)) {
      return;
    }

    components += 1;
    const queue = [node.id];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      Array.from(adjacency.get(current) ?? []).forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }
  });

  return components;
}

function orientPathTowardDeparture(
  path: string[],
  calls: DepartureCall[],
): void {
  const servedCalls = calls.filter((call) => call.served);
  const firstServed = servedCalls[0]
    ? createStationKey(servedCalls[0])
    : undefined;
  const lastServedCall = servedCalls[servedCalls.length - 1];
  const lastServed = lastServedCall
    ? createStationKey(lastServedCall)
    : undefined;

  if (!firstServed || !lastServed) {
    return;
  }

  const firstIndex = path.indexOf(firstServed);
  const lastIndex = path.indexOf(lastServed);

  if (firstIndex >= 0 && lastIndex >= 0 && lastIndex < firstIndex) {
    path.reverse();
  }
}

type PatternBranchLayoutHint = LineRouteBranchLayout & {
  junctionKey: string;
  terminalKey: string;
  trunkKey?: string;
  stationKeys: string[];
};

function createBranchLayoutHints(
  lineTopology: LineRouteSequence[],
): Map<string, PatternBranchLayoutHint> {
  const hints = new Map<string, PatternBranchLayoutHint>();
  const stationKeyById = new Map<string, string>();

  lineTopology.forEach((sequence) => {
    sequence.stops.forEach((stop) => {
      stationKeyById.set(stop.id, createStationKey(stop));
    });
  });

  lineTopology.forEach((sequence) => {
    if (!sequence.branchLayout || sequence.stops.length < 2) {
      return;
    }

    const junction = sequence.stops[0];
    const terminal = sequence.stops[sequence.stops.length - 1];
    const junctionKey = createStationKey(junction);
    const terminalKey = createStationKey(terminal);
    const stationKeys = sequence.stops.map(createStationKey);

    hints.set(createBranchLayoutHintKey(junctionKey, terminalKey), {
      ...sequence.branchLayout,
      junctionKey,
      terminalKey,
      trunkKey: sequence.branchLayout.trunkStationId
        ? stationKeyById.get(sequence.branchLayout.trunkStationId)
        : undefined,
      stationKeys,
    });
  });

  return hints;
}

function createBranchLayoutHintKey(
  junctionKey: string,
  terminalKey: string,
): string {
  return `${junctionKey}::${terminalKey}`;
}

function placeSameDirectionForks(
  branchLayoutHints: Map<string, PatternBranchLayoutHint>,
  positions: Map<string, { x: number; y: number }>,
  placed: Set<string>,
  visibleEdges: Set<string>,
  layout: PatternLayoutOptions,
): void {
  const hintsByJunction = new Map<string, PatternBranchLayoutHint[]>();

  branchLayoutHints.forEach((hint) => {
    if (hint.kind !== "same-direction-fork") {
      return;
    }

    const current = hintsByJunction.get(hint.junctionKey) ?? [];
    current.push(hint);
    hintsByJunction.set(hint.junctionKey, current);
  });

  hintsByJunction.forEach((hints, junctionKey) => {
    const junctionPosition = positions.get(junctionKey);
    const trunkKey = hints.find((hint) => hint.trunkKey)?.trunkKey;
    const trunkPosition = trunkKey ? positions.get(trunkKey) : undefined;

    if (!junctionPosition || !trunkPosition || hints.length < 2) {
      return;
    }

    const direction = junctionPosition.x <= trunkPosition.x ? -1 : 1;

    hints.forEach((hint) => {
      const side = hint.side === "upper" ? -1 : hint.side === "lower" ? 1 : 0;
      const y = junctionPosition.y + side * layout.sameDirectionForkGap;

      hint.stationKeys.slice(1).forEach((key, index) => {
        positions.set(key, {
          x: junctionPosition.x + direction * (index + 1) * layout.stopGap,
          y,
        });
        placed.add(key);
      });
      addPathEdges(hint.stationKeys, visibleEdges);
    });
  });
}

function findBestConnectorPath(
  nodes: PatternGraphNode[],
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
): string[] | null {
  const placedIds = nodes.map((node) => node.id).filter((id) => placed.has(id));
  let bestPath: string[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  placedIds.forEach((source) => {
    const path = findConnectorPathFrom(source, adjacency, placed);

    if (!path || path.length < 3) {
      return;
    }

    const internalCount = path
      .slice(1, -1)
      .filter((id) => !placed.has(id)).length;
    const score = internalCount * 100 + path.length;

    if (score > bestScore) {
      bestScore = score;
      bestPath = path;
    }
  });

  return bestPath;
}

function findConnectorPathFrom(
  source: string,
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
): string[] | null {
  const queue: string[][] = [[source]];
  const visited = new Set<string>([source]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    for (const neighbor of adjacency.get(current) ?? []) {
      if (neighbor === source || visited.has(neighbor)) {
        continue;
      }

      const nextPath = [...path, neighbor];

      if (placed.has(neighbor)) {
        if (nextPath.length >= 3) {
          return nextPath;
        }

        continue;
      }

      visited.add(neighbor);
      queue.push(nextPath);
    }
  }

  return null;
}

function findBestBranchPath(
  nodes: PatternGraphNode[],
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
): string[] | null {
  const unplacedTerminals = nodes
    .filter((node) => !placed.has(node.id))
    .filter((node) => (adjacency.get(node.id)?.size ?? 0) <= 1)
    .map((node) => node.id);
  const starts =
    unplacedTerminals.length > 0
      ? unplacedTerminals
      : nodes.filter((node) => !placed.has(node.id)).map((node) => node.id);
  let bestPath: string[] | null = null;

  starts.forEach((start) => {
    const path = findShortestPath(start, (key) => placed.has(key), adjacency);

    if (!path || path.length < 2) {
      return;
    }

    if (!bestPath || path.length > bestPath.length) {
      bestPath = path;
    }
  });

  return bestPath ? [...bestPath].reverse() : null;
}

function findNearestDisconnectedBranchPath(
  nodes: PatternGraphNode[],
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
  syntheticEdges: PatternGraphEdge[],
): string[] | null {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const placedNodes = nodes.filter((node) => placed.has(node.id));
  const unplacedNodes = nodes.filter((node) => !placed.has(node.id));
  let best:
    | {
        distanceKm: number;
        placedNode: PatternGraphNode;
        unplacedNode: PatternGraphNode;
      }
    | undefined;

  placedNodes.forEach((placedNode) => {
    unplacedNodes.forEach((unplacedNode) => {
      const distanceKm = getNodeDistanceKm(placedNode, unplacedNode);

      if (distanceKm === undefined || distanceKm > 7) {
        return;
      }

      if (!best || distanceKm < best.distanceKm) {
        best = { distanceKm, placedNode, unplacedNode };
      }
    });
  });

  if (!best) {
    return null;
  }

  const component = collectUnplacedComponent(
    best.unplacedNode.id,
    adjacency,
    placed,
  );
  const componentPath = findLongestComponentPathFrom(
    best.unplacedNode.id,
    component,
    adjacency,
  );
  const connectorKey = createEdgeKey(best.placedNode.id, best.unplacedNode.id);

  if (!syntheticEdges.some((edge) => edge.id === connectorKey)) {
    syntheticEdges.push({
      id: connectorKey,
      source: best.placedNode.id,
      target: best.unplacedNode.id,
      active: false,
      distanceKm: best.distanceKm,
    });
  }

  componentPath.forEach((key) => {
    const node = nodeMap.get(key);

    if (node) {
      node.degree = Math.max(node.degree, adjacency.get(key)?.size ?? 0);
    }
  });

  return [best.placedNode.id, ...componentPath];
}

function collectUnplacedComponent(
  start: string,
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
): Set<string> {
  const component = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (component.has(current) || placed.has(current)) {
      continue;
    }

    component.add(current);
    Array.from(adjacency.get(current) ?? []).forEach((neighbor) => {
      if (!component.has(neighbor) && !placed.has(neighbor)) {
        queue.push(neighbor);
      }
    });
  }

  return component;
}

function findLongestComponentPathFrom(
  start: string,
  component: Set<string>,
  adjacency: Map<string, Set<string>>,
): string[] {
  const terminals = Array.from(component).filter(
    (key) =>
      Array.from(adjacency.get(key) ?? []).filter((neighbor) =>
        component.has(neighbor),
      ).length <= 1,
  );
  let bestPath = [start];

  terminals.forEach((terminal) => {
    const path = findShortestPathRestricted(
      start,
      (key) => key === terminal,
      adjacency,
      component,
    );

    if (path && path.length > bestPath.length) {
      bestPath = path;
    }
  });

  return bestPath;
}

function findShortestPathRestricted(
  start: string,
  isTarget: (key: string) => boolean,
  adjacency: Map<string, Set<string>>,
  allowed: Set<string>,
): string[] | null {
  const queue: string[][] = [[start]];
  const visited = new Set<string>([start]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    if (isTarget(current)) {
      return path;
    }

    Array.from(adjacency.get(current) ?? [])
      .filter((neighbor) => allowed.has(neighbor) && !visited.has(neighbor))
      .forEach((neighbor) => {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      });
  }

  return null;
}

function findShortestPath(
  start: string,
  isTarget: (key: string) => boolean,
  adjacency: Map<string, Set<string>>,
): string[] | null {
  const queue: string[][] = [[start]];
  const visited = new Set<string>([start]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    if (path.length > 1 && isTarget(current)) {
      return path;
    }

    Array.from(adjacency.get(current) ?? [])
      .filter((neighbor) => !visited.has(neighbor))
      .forEach((neighbor) => {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      });
  }

  return null;
}

function placeConnectorPath(
  path: string[],
  positions: Map<string, { x: number; y: number }>,
  placed: Set<string>,
  visibleEdges: Set<string>,
  laneSteps: Generator<number, never, unknown>,
  layout: PatternLayoutOptions,
): void {
  const startKey = path[0];
  const endKey = path[path.length - 1];
  let startPosition = positions.get(startKey);
  let endPosition = positions.get(endKey);

  if (!startPosition || !endPosition) {
    return;
  }

  const requiredSpan = (path.length - 1) * layout.stopGap;
  const actualSpan = Math.abs(endPosition.x - startPosition.x);

  if (actualSpan < requiredSpan) {
    const direction = endPosition.x >= startPosition.x ? 1 : -1;

    expandConnectorSpan({
      positions,
      anchorKey: startKey,
      endKey,
      direction,
      delta: requiredSpan - actualSpan,
    });
    startPosition = positions.get(startKey);
    endPosition = positions.get(endKey);

    if (!startPosition || !endPosition) {
      return;
    }
  }

  const lane = Math.abs(laneSteps.next().value);
  const baseY = Math.max(startPosition.y, endPosition.y, 0);
  const y = baseY + lane * layout.branchGap;
  const denominator = Math.max(path.length - 1, 1);

  path.slice(1, -1).forEach((key, index) => {
    if (!positions.has(key)) {
      const ratio = (index + 1) / denominator;

      positions.set(key, {
        x: startPosition.x + (endPosition.x - startPosition.x) * ratio,
        y,
      });
    }

    placed.add(key);
  });

  addPathEdges(path, visibleEdges);
}

function expandConnectorSpan(params: {
  positions: Map<string, { x: number; y: number }>;
  anchorKey: string;
  endKey: string;
  direction: 1 | -1;
  delta: number;
}): void {
  const anchorPosition = params.positions.get(params.anchorKey);

  if (!anchorPosition || params.delta <= 0) {
    return;
  }

  params.positions.forEach((position, key) => {
    if (key === params.anchorKey) {
      return;
    }

    const isOnExpandableSide =
      key === params.endKey ||
      (params.direction > 0
        ? position.x > anchorPosition.x
        : position.x < anchorPosition.x);

    if (isOnExpandableSide) {
      position.x += params.direction * params.delta;
    }
  });
}

function placeBranchPath(
  path: string[],
  positions: Map<string, { x: number; y: number }>,
  placed: Set<string>,
  visibleEdges: Set<string>,
  laneSteps: Generator<number, never, unknown>,
  destinationKey?: string,
  branchLayoutHints?: Map<string, PatternBranchLayoutHint>,
  layout?: PatternLayoutOptions,
): void {
  const anchor = path[0];
  const terminal = path[path.length - 1];
  const anchorPosition = positions.get(anchor);

  if (!anchorPosition) {
    return;
  }

  const layoutHint = branchLayoutHints?.get(
    createBranchLayoutHintKey(anchor, terminal),
  );
  const spacing = layout ?? createPatternLayoutOptions(false);
  const lane = createBranchLane(laneSteps, layoutHint);
  const y = lane * spacing.branchGap;
  const destinationPosition = destinationKey
    ? positions.get(destinationKey)
    : undefined;
  const branchDirection = resolveBranchDirection({
    anchor,
    anchorPosition,
    path,
    destinationKey,
    destinationPosition,
    positions,
    layoutHint,
  });

  path.slice(1).forEach((key, index) => {
    if (!positions.has(key)) {
      positions.set(key, {
        x: anchorPosition.x + branchDirection * (index + 1) * spacing.stopGap,
        y,
      });
    }

    placed.add(key);
  });
  addPathEdges(path, visibleEdges);
}

function createBranchLane(
  laneSteps: Generator<number, never, unknown>,
  layoutHint?: PatternBranchLayoutHint,
): number {
  const nextLane = laneSteps.next().value;

  if (!layoutHint || layoutHint.kind !== "same-direction-fork") {
    return nextLane;
  }

  const lane = Math.abs(nextLane);

  if (layoutHint.side === "upper") {
    return -lane;
  }

  if (layoutHint.side === "lower") {
    return lane;
  }

  return lane;
}

function resolveBranchDirection(params: {
  anchor: string;
  anchorPosition: { x: number; y: number };
  path: string[];
  destinationKey?: string;
  destinationPosition?: { x: number; y: number };
  positions: Map<string, { x: number; y: number }>;
  layoutHint?: PatternBranchLayoutHint;
}): 1 | -1 {
  if (params.layoutHint?.kind === "same-direction-fork") {
    const trunkPosition = params.layoutHint.trunkKey
      ? params.positions.get(params.layoutHint.trunkKey)
      : undefined;

    if (trunkPosition) {
      return params.anchorPosition.x <= trunkPosition.x ? -1 : 1;
    }
  }

  if (
    params.destinationPosition &&
    typeof params.destinationKey === "string" &&
    params.anchor !== params.destinationKey &&
    params.path.includes(params.destinationKey)
  ) {
    return params.anchorPosition.x < params.destinationPosition.x ? 1 : -1;
  }

  return 1;
}

function placeRemainingComponents(
  nodes: PatternGraphNode[],
  adjacency: Map<string, Set<string>>,
  positions: Map<string, { x: number; y: number }>,
  placed: Set<string>,
  visibleEdges: Set<string>,
  laneSteps: Generator<number, never, unknown>,
  destinationKey?: string,
  layout: PatternLayoutOptions = createPatternLayoutOptions(false),
): void {
  const nodeIds = nodes.map((node) => node.id);
  const keepAfterDestinationClear =
    destinationKey !== undefined && positions.has(destinationKey);
  let nextBaseX = keepAfterDestinationClear
    ? getMinPositionX(positions) - layout.stopGap
    : getMaxPositionX(positions) + layout.stopGap;

  while (true) {
    const start = nodeIds.find((id) => !placed.has(id));

    if (!start) {
      break;
    }

    const component = collectUnplacedComponentIds(start, adjacency, placed);
    const mainPath = findLongestPathInComponent(component, adjacency);
    const orderedIds = mainPath.length > 0 ? mainPath : Array.from(component);
    const lane = laneSteps.next().value;
    const y = lane * layout.branchGap;

    orderedIds.forEach((id, index) => {
      positions.set(id, {
        x: keepAfterDestinationClear
          ? nextBaseX - index * layout.stopGap
          : nextBaseX + index * layout.stopGap,
        y,
      });
      placed.add(id);
    });

    placeComponentSideNodes({
      component,
      orderedIds,
      adjacency,
      positions,
      placed,
      baseY: y,
      layout,
    });

    addComponentEdges(component, adjacency, visibleEdges);

    nextBaseX +=
      (keepAfterDestinationClear ? -1 : 1) *
      (Math.max(orderedIds.length, 1) * layout.stopGap + layout.stopGap);
  }
}

function collectUnplacedComponentIds(
  start: string,
  adjacency: Map<string, Set<string>>,
  placed: Set<string>,
): Set<string> {
  const component = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (component.has(current) || placed.has(current)) {
      continue;
    }

    component.add(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      if (!component.has(neighbor) && !placed.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return component;
}

function findLongestPathInComponent(
  component: Set<string>,
  adjacency: Map<string, Set<string>>,
): string[] {
  const ids = Array.from(component);

  if (ids.length <= 1) {
    return ids;
  }

  const terminals = ids.filter((id) => {
    const componentDegree = Array.from(adjacency.get(id) ?? []).filter(
      (neighbor) => component.has(neighbor),
    ).length;

    return componentDegree <= 1;
  });
  const candidates = terminals.length >= 2 ? terminals : ids;
  let bestPath: string[] = [];

  candidates.forEach((source, sourceIndex) => {
    candidates.slice(sourceIndex + 1).forEach((target) => {
      const path = findShortestPathRestricted(
        source,
        (key) => key === target,
        adjacency,
        component,
      );

      if (path && path.length > bestPath.length) {
        bestPath = path;
      }
    });
  });

  return bestPath.length > 0 ? bestPath : ids;
}

function placeComponentSideNodes(params: {
  component: Set<string>;
  orderedIds: string[];
  adjacency: Map<string, Set<string>>;
  positions: Map<string, { x: number; y: number }>;
  placed: Set<string>;
  baseY: number;
  layout: PatternLayoutOptions;
}): void {
  const { component, orderedIds, adjacency, positions, placed, baseY, layout } =
    params;
  const orderedSet = new Set(orderedIds);

  Array.from(component).forEach((id) => {
    if (placed.has(id)) {
      return;
    }

    const anchorId = Array.from(adjacency.get(id) ?? []).find((neighbor) =>
      orderedSet.has(neighbor),
    );
    const anchorPosition = anchorId ? positions.get(anchorId) : undefined;

    positions.set(id, {
      x: anchorPosition?.x ?? getMaxPositionX(positions) + layout.stopGap,
      y: baseY + layout.branchGap,
    });
    placed.add(id);
  });
}

function addComponentEdges(
  component: Set<string>,
  adjacency: Map<string, Set<string>>,
  visibleEdges: Set<string>,
): void {
  component.forEach((source) => {
    for (const target of adjacency.get(source) ?? []) {
      if (component.has(target) && source !== target) {
        visibleEdges.add(createEdgeKey(source, target));
      }
    }
  });
}

function addPathEdges(path: string[], visibleEdges: Set<string>): void {
  path.slice(0, -1).forEach((source, index) => {
    const target = path[index + 1];

    if (source !== target) {
      visibleEdges.add(createEdgeKey(source, target));
    }
  });
}

function addGraphEdges(
  edges: PatternGraphEdge[],
  visibleEdges: Set<string>,
): void {
  edges.forEach((edge) => {
    visibleEdges.add(createEdgeKey(edge.source, edge.target));
  });
}

function createDegreesFromEdgeKeys(edgeKeys: Set<string>): Map<string, number> {
  const degrees = new Map<string, number>();

  edgeKeys.forEach((edgeKey) => {
    const [source, target] = edgeKey.split("--");

    degrees.set(source, (degrees.get(source) ?? 0) + 1);
    degrees.set(target, (degrees.get(target) ?? 0) + 1);
  });

  return degrees;
}

function createDegreesFromEdges(
  edges: PatternGraphEdge[],
): Map<string, number> {
  const degrees = new Map<string, number>();

  edges.forEach((edge) => {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  });

  return degrees;
}

function scoreSequence(
  sequence: string[],
  servedKeys: Set<string>,
  currentKey?: string,
): number {
  const overlap = sequence.filter((key) => servedKeys.has(key)).length;
  const currentBonus = currentKey && sequence.includes(currentKey) ? 1000 : 0;

  return overlap * 120 + currentBonus + sequence.length;
}

function getMaxPositionX(
  positions: Map<string, { x: number; y: number }>,
): number {
  return Math.max(
    0,
    ...Array.from(positions.values()).map((position) => position.x),
  );
}

function getMinPositionX(
  positions: Map<string, { x: number; y: number }>,
): number {
  return Math.min(
    0,
    ...Array.from(positions.values()).map((position) => position.x),
  );
}

function* createLaneSteps(): Generator<number, never, unknown> {
  let magnitude = 1;

  while (true) {
    yield magnitude;
    yield -magnitude;
    magnitude += 1;
  }
}

function createDagreLayout(
  graph: {
    nodes: PatternGraphNode[];
    edges: PatternGraphEdge[];
  },
  layout: PatternLayoutOptions,
): Map<string, { x: number; y: number }> {
  const layoutGraph = new dagre.graphlib.Graph();

  layoutGraph.setDefaultEdgeLabel(() => ({}));
  layoutGraph.setGraph({
    rankdir: "LR",
    align: "UL",
    ranksep: layout.rankSeparator,
    nodesep: layout.nodeSeparator,
    edgesep: 24,
    marginx: 34,
    marginy: 28,
  });

  graph.nodes.forEach((node) => {
    layoutGraph.setNode(node.id, {
      width: layout.nodeWidth,
      height: layout.nodeHeight,
    });
  });
  graph.edges.forEach((edge) => {
    layoutGraph.setEdge(edge.source, edge.target, {
      weight: edge.active ? 3 : 1,
      minlen: 1,
    });
  });

  dagre.layout(layoutGraph);

  return new Map(
    graph.nodes.map((node) => {
      const layoutNode = layoutGraph.node(node.id);

      return [
        node.id,
        {
          x: layoutNode?.x ?? 0,
          y: layoutNode?.y ?? 0,
        },
      ];
    }),
  );
}

function buildPatternGraph(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
  fullLine = false,
): {
  nodes: PatternGraphNode[];
  edges: PatternGraphEdge[];
} {
  const callMap = new Map<string, DepartureCall>();

  calls.forEach((call) => {
    callMap.set(createStationKey(call), call);
  });

  const nodeMap = new Map<string, PatternGraphNode>();
  const edgeMap = new Map<string, PatternGraphEdge>();

  lineTopology.forEach((sequence) => {
    const stops = dedupeRouteStops(sequence.stops);
    const coordinatePriority = getTopologyCoordinatePriority(
      sequence.topologySource,
    );

    stops.forEach((stop) => {
      const call = findCallForStop(callMap, stop);
      const key = createStationKey(stop);
      const existing = nodeMap.get(key);
      const stopCoordinates = resolveTransitLonLat(stop);
      const shouldUseStopCoordinates =
        stopCoordinates !== undefined &&
        (existing?.lat === undefined ||
          existing?.lon === undefined ||
          coordinatePriority > existing.coordinatePriority);

      nodeMap.set(key, {
        id: key,
        label: existing?.label ?? call?.label ?? stop.label,
        city: existing?.city ?? call?.city ?? stop.city,
        lon: shouldUseStopCoordinates
          ? stopCoordinates.lon
          : existing?.lon,
        lat: shouldUseStopCoordinates
          ? stopCoordinates.lat
          : existing?.lat,
        coordinatePriority: shouldUseStopCoordinates
          ? coordinatePriority
          : (existing?.coordinatePriority ?? -1),
        current: fullLine ? false : Boolean(existing?.current || call?.current),
        served: fullLine ? true : Boolean(existing?.served || call?.served),
        time: fullLine ? undefined : (existing?.time ?? call?.time),
        transfers: mergeTransfers(
          existing?.transfers,
          stop.transferLines,
          call?.transferLines,
        ),
        degree: existing?.degree ?? 0,
      });
    });

    stops.slice(0, -1).forEach((sourceStop, index) => {
      const targetStop = stops[index + 1];
      const source = createStationKey(sourceStop);
      const target = createStationKey(targetStop);
      const edgeKey = createEdgeKey(source, target);
      const distanceKm = getStopDistanceKm(sourceStop, targetStop);
      const existingEdge = edgeMap.get(edgeKey);

      if (source === target) {
        return;
      }

      if (existingEdge) {
        if (
          distanceKm !== undefined &&
          (existingEdge.distanceKm === undefined ||
            sequence.topologySource === "server")
        ) {
          existingEdge.distanceKm = distanceKm;
        }
        return;
      }

      edgeMap.set(edgeKey, {
        id: edgeKey,
        source,
        target,
        active: false,
        distanceKm,
      });
    });
  });

  if (nodeMap.size === 0) {
    calls.forEach((call) => {
      const key = createStationKey(call);

      nodeMap.set(key, {
        id: key,
        label: call.label,
        city: call.city,
        coordinatePriority: -1,
        current: fullLine ? false : call.current,
        served: fullLine ? true : call.served,
        time: fullLine ? undefined : call.time,
        transfers: call.transferLines ?? [],
        degree: 0,
      });
    });
    calls.slice(0, -1).forEach((call, index) => {
      const source = createStationKey(call);
      const target = createStationKey(calls[index + 1]);

      if (source !== target) {
        edgeMap.set(createEdgeKey(source, target), {
          id: createEdgeKey(source, target),
          source,
          target,
          active: false,
        });
      }
    });
  }

  const servedEdges = fullLine
    ? new Set<string>()
    : createServedEdgeKeys(calls);
  const corridorEdges = fullLine
    ? new Set<string>()
    : createActiveCorridorEdgeKeys(calls, lineTopology);
  if (lineTopology.length === 0) {
    pruneImplausibleEdges(edgeMap, servedEdges, corridorEdges);
  }

  edgeMap.forEach((edge) => {
    const edgeKey = createEdgeKey(edge.source, edge.target);

    edge.active =
      fullLine || servedEdges.has(edgeKey) || corridorEdges.has(edgeKey);
    nodeMap.get(edge.source)!.degree += 1;
    nodeMap.get(edge.target)!.degree += 1;
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

function pruneImplausibleEdges(
  edgeMap: Map<string, PatternGraphEdge>,
  protectedEdges: Set<string>,
  activeCorridorEdges: Set<string>,
): void {
  const distances = Array.from(edgeMap.values())
    .map((edge) => edge.distanceKm)
    .filter(
      (distance): distance is number =>
        typeof distance === "number" &&
        Number.isFinite(distance) &&
        distance > 0,
    )
    .sort((left, right) => left - right);

  if (distances.length < 8) {
    return;
  }

  const medianDistance = distances[Math.floor(distances.length / 2)];
  const threshold = Math.min(8, Math.max(3.2, medianDistance * 3.2));

  edgeMap.forEach((edge, edgeKey) => {
    if (
      protectedEdges.has(edgeKey) ||
      activeCorridorEdges.has(edgeKey) ||
      edge.distanceKm === undefined
    ) {
      return;
    }

    if (edge.distanceKm > threshold) {
      edgeMap.delete(edgeKey);
    }
  });
}

function createServedEdgeKeys(calls: DepartureCall[]): Set<string> {
  return new Set(createServedEdgeKeyList(calls));
}

function createServedEdgeKeyList(calls: DepartureCall[]): string[] {
  const servedCalls = calls.filter((call) => call.served);
  const edgeKeys: string[] = [];

  servedCalls.slice(0, -1).forEach((call, index) => {
    const source = createStationKey(call);
    const target = createStationKey(servedCalls[index + 1]);

    if (source !== target) {
      edgeKeys.push(createEdgeKey(source, target));
    }
  });

  return edgeKeys;
}

function getServedDestinationKey(calls: DepartureCall[]): string | undefined {
  const servedCalls = calls.filter((call) => call.served);
  const destinationCall = servedCalls[servedCalls.length - 1];

  return destinationCall ? createStationKey(destinationCall) : undefined;
}

function createActiveCorridorEdgeKeys(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
): Set<string> {
  return new Set(createActiveRouteEdgeKeyList(calls, lineTopology));
}

function createActiveRouteEdgeOrder(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
): Map<string, number> {
  return new Map(
    createActiveRouteEdgeKeyList(calls, lineTopology).map((key, index) => [
      key,
      index,
    ]),
  );
}

function createActiveRouteEdgeDirections(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
): Map<string, { source: string; target: string }> {
  return new Map(
    createActiveRouteDirectedEdges(calls, lineTopology).map((edge) => [
      createEdgeKey(edge.source, edge.target),
      edge,
    ]),
  );
}

function createActiveRouteEdgeKeyList(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
): string[] {
  return createActiveRouteDirectedEdges(calls, lineTopology).map((edge) =>
    createEdgeKey(edge.source, edge.target),
  );
}

function createActiveRouteDirectedEdges(
  calls: DepartureCall[],
  lineTopology: LineRouteSequence[],
): Array<{ source: string; target: string }> {
  const servedCallKeys = calls
    .filter((call) => call.served)
    .map(createStationKey);
  const servedKeys = new Set(servedCallKeys);
  const currentKey = calls.find((call) => call.current)
    ? createStationKey(calls.find((call) => call.current)!)
    : undefined;
  const sequences = lineTopology
    .map((sequence) => dedupeRouteStops(sequence.stops).map(createStationKey))
    .filter((sequence) => sequence.length > 1);
  const sequence = [...sequences].sort(
    (left, right) =>
      scoreSequence(right, servedKeys, currentKey) -
      scoreSequence(left, servedKeys, currentKey),
  )[0];

  if (!sequence) {
    return createServedDirectedEdges(calls);
  }

  const orientedSequence = orientSequenceTowardCalls(sequence, servedCallKeys);
  const firstServedKey = servedCallKeys.find((key) =>
    orientedSequence.includes(key),
  );
  const lastServedKey = [...servedCallKeys]
    .reverse()
    .find((key) => orientedSequence.includes(key));
  const servedIndexes = orientedSequence
    .map((key, index) => (servedKeys.has(key) ? index : -1))
    .filter((index) => index >= 0);

  if (servedIndexes.length < 2) {
    return createServedDirectedEdges(calls);
  }

  const firstIndex =
    firstServedKey !== undefined
      ? orientedSequence.indexOf(firstServedKey)
      : -1;
  const lastIndex =
    lastServedKey !== undefined ? orientedSequence.indexOf(lastServedKey) : -1;
  const startIndex =
    firstIndex >= 0 && lastIndex >= 0
      ? Math.min(firstIndex, lastIndex)
      : Math.min(...servedIndexes);
  const endIndex =
    firstIndex >= 0 && lastIndex >= 0
      ? Math.max(firstIndex, lastIndex)
      : Math.max(...servedIndexes);
  const directedEdges: Array<{ source: string; target: string }> = [];

  orientedSequence.slice(startIndex, endIndex).forEach((source, index) => {
    const target = orientedSequence[startIndex + index + 1];

    if (source !== target) {
      directedEdges.push({ source, target });
    }
  });

  return directedEdges;
}

function createServedDirectedEdges(
  calls: DepartureCall[],
): Array<{ source: string; target: string }> {
  const servedCalls = calls.filter((call) => call.served);
  const edges: Array<{ source: string; target: string }> = [];

  servedCalls.slice(0, -1).forEach((call, index) => {
    const source = createStationKey(call);
    const target = createStationKey(servedCalls[index + 1]);

    if (source !== target) {
      edges.push({ source, target });
    }
  });

  return edges;
}

function orientSequenceTowardCalls(
  sequence: string[],
  servedCallKeys: string[],
): string[] {
  const firstServedKey = servedCallKeys.find((key) => sequence.includes(key));
  const lastServedKey = [...servedCallKeys]
    .reverse()
    .find((key) => sequence.includes(key));

  if (!firstServedKey || !lastServedKey) {
    return sequence;
  }

  const firstIndex = sequence.indexOf(firstServedKey);
  const lastIndex = sequence.indexOf(lastServedKey);

  return lastIndex < firstIndex ? [...sequence].reverse() : sequence;
}

function getActiveTerminalIds(graph: {
  nodes: PatternGraphNode[];
  edges: PatternGraphEdge[];
}): Set<string> {
  const activeDegree = new Map<string, number>();

  graph.edges
    .filter((edge) => edge.active)
    .forEach((edge) => {
      activeDegree.set(edge.source, (activeDegree.get(edge.source) ?? 0) + 1);
      activeDegree.set(edge.target, (activeDegree.get(edge.target) ?? 0) + 1);
    });

  return new Set(
    graph.nodes
      .filter((node) => node.served && (activeDegree.get(node.id) ?? 0) <= 1)
      .map((node) => node.id),
  );
}

function getBranchChip(
  node: PatternGraphNode,
  activeTerminalIds: Set<string>,
  departureTimeLabel: string,
): string | undefined {
  if (activeTerminalIds.has(node.id) && departureTimeLabel) {
    return node.current ? "Départ" : departureTimeLabel;
  }

  return undefined;
}

function dedupeRouteStops(stops: LineRouteStop[]): LineRouteStop[] {
  const seen = new Set<string>();

  return stops.filter((stop) => {
    const key = createStationKey(stop);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function findCallForStop(
  callMap: Map<string, DepartureCall>,
  stop: LineRouteStop,
): DepartureCall | undefined {
  const stopKey = createStationKey(stop);
  const exactMatch = callMap.get(stopKey);

  if (exactMatch) {
    return exactMatch;
  }

  return Array.from(callMap.values()).find((call) =>
    stationKeysAreCompatible(stopKey, createStationKey(call)),
  );
}

function mergeTransfers(
  ...transferGroups: Array<TransferLineOption[] | undefined>
): TransferLineOption[] {
  const transfers = new Map<string, TransferLineOption>();

  transferGroups
    .flatMap((group) => group ?? [])
    .forEach((transfer) => {
      const key = `${transfer.family ?? ""}:${transfer.id}:${transfer.label}`;

      if (!transfers.has(key)) {
        transfers.set(key, transfer);
      }
    });

  return Array.from(transfers.values()).slice(0, 40);
}

function isBusTransfer(transfer: TransferLineOption): boolean {
  return isBusLikeTransfer(transfer);
}

function showStationTooltip(stationKey: string): void {
  if (stationTooltipHideTimer !== undefined) {
    window.clearTimeout(stationTooltipHideTimer);
    stationTooltipHideTimer = undefined;
  }

  activeStationTooltipKey.value = stationKey;
}

function scheduleHideStationTooltip(stationKey: string): void {
  if (stationTooltipHideTimer !== undefined) {
    window.clearTimeout(stationTooltipHideTimer);
  }

  stationTooltipHideTimer = window.setTimeout(() => {
    if (activeStationTooltipKey.value === stationKey) {
      activeStationTooltipKey.value = undefined;
    }

    stationTooltipHideTimer = undefined;
  }, 500);
}

function getNodeDistanceKm(
  sourceNode: PatternGraphNode,
  targetNode: PatternGraphNode,
): number | undefined {
  if (
    sourceNode.lat === undefined ||
    sourceNode.lon === undefined ||
    targetNode.lat === undefined ||
    targetNode.lon === undefined
  ) {
    return undefined;
  }

  return getCoordinatesDistanceKm(
    sourceNode.lat,
    sourceNode.lon,
    targetNode.lat,
    targetNode.lon,
  );
}

function getStopDistanceKm(
  sourceStop: LineRouteStop,
  targetStop: LineRouteStop,
): number | undefined {
  const sourceCoordinates = resolveTransitLonLat(sourceStop);
  const targetCoordinates = resolveTransitLonLat(targetStop);

  if (!sourceCoordinates || !targetCoordinates) {
    return undefined;
  }

  return getCoordinatesDistanceKm(
    sourceCoordinates.lat,
    sourceCoordinates.lon,
    targetCoordinates.lat,
    targetCoordinates.lon,
  );
}

function getTopologyCoordinatePriority(
  source: LineRouteSequence["topologySource"],
): number {
  if (source === "server") {
    return 2;
  }

  if (source === "navitia") {
    return 1;
  }

  return 0;
}

function createEdgeKey(source: string, target: string): string {
  return [source, target].sort().join("--");
}

function togglePatternFlowFullscreen(event: MouseEvent): void {
  const button =
    event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : undefined;

  const shell = button?.closest(".pattern-flow-shell");

  if (!(shell instanceof HTMLElement)) {
    return;
  }

  if (document.fullscreenElement === shell) {
    void document.exitFullscreen();
    return;
  }

  void shell.requestFullscreen().then(() => {
    isPatternFlowFullscreen.value = true;
  });
}

function syncPatternFlowFullscreenState(): void {
  isPatternFlowFullscreen.value =
    document.fullscreenElement?.classList.contains("pattern-flow-shell") ??
    false;
  void nextTick();
}

onMounted(() => {
  document.addEventListener("fullscreenchange", syncPatternFlowFullscreenState);
});

onBeforeUnmount(() => {
  transferHydrationRequest += 1;
  clearPatternDistanceLabelHideTimer();
  resetTransferHydrationStallState();
  clearTransferHydrationRateLimitTimer();
  if (stationTooltipHideTimer !== undefined) {
    window.clearTimeout(stationTooltipHideTimer);
  }

  document.removeEventListener(
    "fullscreenchange",
    syncPatternFlowFullscreenState,
  );
});
</script>

<template>
  <Teleport to="body" :disabled="embedded">
    <Transition name="modal-scale">
      <div
        v-if="open"
        :class="embedded ? 'pattern-page-embed' : 'modal-backdrop'"
        @click.self="!embedded && emit('close')"
      >
        <section
          :class="
            embedded
              ? 'pattern-page-embed__panel pattern-modal'
              : 'modal-panel modal-panel--wide pattern-modal'
          "
          aria-modal="true"
          role="dialog"
        >
          <header v-if="!embedded" class="modal-panel__header">
            <div class="pattern-modal__title">
              <LineIconBadge
                v-if="board"
                class="pattern-modal__line"
                :line="board.line"
              />
              <div>
                <p class="eyebrow">{{ serviceLabel }}</p>
                <h2>
                  {{
                    departure?.destination ? "Desserte du passage" : "Desserte"
                  }}
                </h2>
                <span v-if="board">
                  {{ board.title }}
                  <template v-if="departure?.platform">
                    · Quai {{ departure.platform }}</template
                  >
                </span>
              </div>
            </div>
            <button
              class="icon-button"
              type="button"
              aria-label="Fermer"
              @click="emit('close')"
            >
              ×
            </button>
          </header>

          <div class="pattern-modal__body">
            <div v-if="loading" class="pattern-modal__state">
              <span aria-hidden="true" class="loader-dot"></span>
              Chargement de la desserte
            </div>

            <div
              v-else-if="error || pattern?.error"
              class="pattern-modal__state pattern-modal__state--error"
            >
              {{
                error || pattern?.error || "Impossible de charger la desserte."
              }}
            </div>

            <div
              v-else-if="displayPattern && displayPattern.calls.length > 0"
              class="pattern-board"
              :style="{ '--line-color': board?.line.color ?? '#0064ff' }"
            >
              <aside class="pattern-board__summary">
                <div class="pattern-board__line">
                  <span
                    v-if="board"
                    class="pattern-board__mode-icon"
                    :class="`pattern-board__mode-icon--${transportModeIcon.key}`"
                    :aria-label="transportModeIcon.title"
                    :title="transportModeIcon.title"
                  >
                    <span aria-hidden="true">{{ transportModeIcon.label }}</span>
                  </span>
                  <LineIconBadge v-if="board" :line="board.line" />
                  <span v-else>{{ departure?.lineRef ?? "" }}</span>
                </div>
                <p>{{ serviceLabel }}</p>
                <strong>{{ destinationLabel }}</strong>
                <small v-if="board">
                  {{ board.title }}
                  <template v-if="departure?.platform">
                    · Quai {{ departure.platform }}</template
                  >
                </small>
              </aside>

              <div class="pattern-board__display">
                <div class="pattern-board__top-strip">
                  <div>
                    <span>Direction</span>
                    <label
                      v-if="hasDirectionPicker"
                      class="pattern-board__direction-picker"
                    >
                      <MaterialCombobox
                        :model-value="selectedDirectionId ?? ''"
                        :options="directionOptions ?? []"
                        aria-label="Changer de direction"
                        @update:model-value="emit('directionChange', $event)"
                      />
                    </label>
                    <strong v-else>{{ destinationLabel }}</strong>
                  </div>
                  <div class="pattern-board__meta">
                    <span>{{ servedStopsLabel }}</span>
                    <strong>{{ departureClock || "--:--" }}</strong>
                  </div>
                </div>

                <div
                  ref="patternFlowShell"
                  class="pattern-flow-shell"
                  :class="{
                    'pattern-flow-shell--compact': isCompactPatternFlow,
                    'pattern-flow-shell--reduce-motion': reduceMotion,
                  }"
                  @click="closeMobileFlowActions"
                >
                  <div
                    v-if="embedded && transferHydrationLoading"
                    class="pattern-flow-transfer-loader"
                    :class="{
                      'pattern-flow-transfer-loader--rate-limited':
                        transferHydrationRateLimited,
                    }"
                    role="status"
                    aria-live="polite"
                  >
                    <span aria-hidden="true"></span>
                    <div class="pattern-flow-transfer-loader__content">
                      <div class="pattern-flow-transfer-loader__label">
                        <strong>{{ transferHydrationStatusLabel }}</strong>
                        <small>{{ transferHydrationDetailLabel }}</small>
                      </div>
                      <div
                        v-if="!transferHydrationRateLimited"
                        class="pattern-flow-transfer-loader__track"
                        aria-hidden="true"
                      >
                        <i
                          :style="{
                            width: `${transferHydrationProgressPercent}%`,
                          }"
                        ></i>
                      </div>
                      <button
                        v-if="transferHydrationRetryVisible"
                        class="pattern-flow-transfer-loader__retry"
                        type="button"
                        @click.stop="retryTransferHydrationFromScratch"
                      >
                        Réessayer
                      </button>
                    </div>
                  </div>
                  <div class="pattern-flow-actions pattern-flow-actions--desktop">
                    <slot name="flow-actions-prefix"></slot>
                    <DistanceToggle
                      v-model="showPatternDistances"
                      class="pattern-flow-action-button"
                      :reduce-motion="reduceMotion"
                    />
                    <button
                      class="pattern-flow-action-button"
                      type="button"
                      :aria-pressed="isCompactPatternFlow"
                      aria-label="Basculer la vue compacte"
                      @click.stop="isCompactPatternFlow = !isCompactPatternFlow"
                    >
                      <SlidersHorizontal aria-hidden="true" />
                      <span>
                        {{
                          isCompactPatternFlow ? "Vue compacte" : "Vue confort"
                        }}
                      </span>
                    </button>
                    <button
                      class="pattern-flow-action-button"
                      type="button"
                      :aria-label="
                        isPatternFlowFullscreen
                          ? 'Quitter le plein écran'
                          : 'Afficher la carte en plein écran'
                      "
                      @click.stop="togglePatternFlowFullscreen"
                    >
                      <Minimize2
                        v-if="isPatternFlowFullscreen"
                        aria-hidden="true"
                      />
                      <Expand v-else aria-hidden="true" />
                      <span>
                        {{
                          isPatternFlowFullscreen ? "Réduire" : "Plein écran"
                        }}
                      </span>
                    </button>
                  </div>
                  <div
                    class="pattern-flow-mobile-actions"
                    :class="{
                      'pattern-flow-mobile-actions--open':
                        mobileFlowActionsOpen,
                    }"
                    @click.stop
                    @keydown.esc.stop="closeMobileFlowActions"
                  >
                    <button
                      class="pattern-flow-mobile-actions__trigger"
                      type="button"
                      :aria-expanded="mobileFlowActionsOpen"
                      aria-controls="pattern-flow-mobile-actions-menu"
                      aria-label="Options du plan"
                      @click.stop="toggleMobileFlowActions"
                    >
                      <EllipsisVertical aria-hidden="true" />
                    </button>
                    <Transition name="pattern-flow-mobile-actions-menu">
                      <div
                        v-if="mobileFlowActionsOpen"
                        id="pattern-flow-mobile-actions-menu"
                        class="pattern-flow-mobile-actions__menu"
                      >
                        <slot name="flow-actions-prefix"></slot>
                        <DistanceToggle
                          v-model="showPatternDistances"
                          class="pattern-flow-action-button"
                          :reduce-motion="reduceMotion"
                          @click="closeMobileFlowActions"
                        />
                        <button
                          class="pattern-flow-action-button"
                          type="button"
                          :aria-pressed="isCompactPatternFlow"
                          aria-label="Basculer la vue compacte"
                          @click.stop="
                            isCompactPatternFlow = !isCompactPatternFlow;
                            closeMobileFlowActions();
                          "
                        >
                          <SlidersHorizontal aria-hidden="true" />
                          <span>
                            {{
                              isCompactPatternFlow
                                ? "Vue compacte"
                                : "Vue confort"
                            }}
                          </span>
                        </button>
                        <button
                          class="pattern-flow-action-button"
                          type="button"
                          :aria-label="
                            isPatternFlowFullscreen
                              ? 'Quitter le plein écran'
                              : 'Afficher la carte en plein écran'
                          "
                          @click.stop="
                            togglePatternFlowFullscreen($event);
                            closeMobileFlowActions();
                          "
                        >
                          <Minimize2
                            v-if="isPatternFlowFullscreen"
                            aria-hidden="true"
                          />
                          <Expand v-else aria-hidden="true" />
                          <span>
                            {{
                              isPatternFlowFullscreen
                                ? "Réduire"
                                : "Plein écran"
                            }}
                          </span>
                        </button>
                      </div>
                    </Transition>
                  </div>
                  <VueFlow
                    pan-on-drag
                    :key="patternFlowKey"
                    class="pattern-flow"
                    :nodes="flowModel.nodes"
                    :edges="flowModel.edges"
                    :default-viewport="initialViewport"
                    :fit-view-on-init="isFullLineMode"
                    :min-zoom="0.34"
                    :max-zoom="1.7"
                    :nodes-draggable="false"
                    :nodes-connectable="false"
                    :elements-selectable="false"
                    :zoom-on-scroll="shouldZoomOnWheel"
                    :zoom-on-pinch="true"
                    :pan-on-scroll="false"
                    :prevent-scrolling="shouldZoomOnWheel"
                    @pane-ready="handlePatternFlowReady"
                    @viewport-change="handlePatternFlowViewportChange"
                  >
                    <Controls :show-interactive="false" />
                    <template #node-city-zone="{ data }">
                      <div
                        class="pattern-flow-city-zone"
                        :style="{
                          '--city-zone-width': `${data.width}px`,
                        }"
                        aria-hidden="true"
                      >
                        <span>{{ data.city }}</span>
                      </div>
                    </template>
                    <template #node-station="{ data }">
                      <div
                        class="pattern-flow-station"
                        :data-station-key="data.key"
                        :data-station-label="data.label"
                        :data-served="data.served ? 'true' : 'false'"
                        :data-current="data.current ? 'true' : 'false'"
                        :class="{
                          'pattern-flow-station--current': data.current,
                          'pattern-flow-station--skipped': !data.served,
                          'pattern-flow-station--terminal': data.branchEnd,
                          'pattern-flow-station--tooltip-open':
                            activeStationTooltipKey === data.key,
                        }"
                        :title="
                          data.served
                            ? undefined
                            : 'Non desservi pour ce trajet'
                        "
                        @focusin="showStationTooltip(data.key)"
                        @focusout="scheduleHideStationTooltip(data.key)"
                        @mouseenter="showStationTooltip(data.key)"
                        @mouseleave="scheduleHideStationTooltip(data.key)"
                      >
                        <Handle
                          id="station-target"
                          class="pattern-flow-station__handle pattern-flow-station__handle--target"
                          type="target"
                          :position="Position.Left"
                        />
                        <Handle
                          id="station-source"
                          class="pattern-flow-station__handle pattern-flow-station__handle--source"
                          type="source"
                          :position="Position.Right"
                        />
                        <span
                          class="pattern-flow-station__dot"
                          aria-hidden="true"
                        ></span>
                        <strong>{{ data.label }}</strong>
                        <span
                          v-if="data.nonBusTransfers.length > 0"
                          class="pattern-flow-station__transfers pattern-flow-station__transfers--inline"
                          aria-label="Correspondances principales"
                        >
                          <LineIconBadge
                            v-for="transfer in data.nonBusTransfers"
                            :key="`${data.key}-non-bus-${transfer.id}-${transfer.label}`"
                            class="pattern-flow-station__transfer"
                            :line="transfer"
                            compact
                          />
                        </span>
                        <small v-if="data.time">{{
                          formatClock(data.time)
                        }}</small>
                        <small v-else-if="!data.served && data.branchEnd">
                          Non desservi
                        </small>
                        <em v-if="data.branchChip">{{ data.branchChip }}</em>
                        <Transition name="pattern-flow-tooltip-open" appear>
                          <article
                            v-if="
                              data.transfers.length > 0 &&
                              activeStationTooltipKey === data.key
                            "
                            class="pattern-flow-station__transfer-tooltip"
                            role="tooltip"
                          >
                            <StationTransferDetails
                              :station-label="data.label"
                              :city="data.city"
                              :transfers="data.transfers"
                              :rich-details="richTransferTooltips"
                              :line-color="board?.line.color ?? '#0064ff'"
                            />
                          </article>
                        </Transition>
                      </div>
                    </template>
                  </VueFlow>
                  <PatternFlowMiniMap
                    v-if="showMiniMap"
                    :nodes="flowModel.stationNodes"
                    :edges="flowModel.edges"
                    :node-width="currentLayoutOptions.nodeWidth"
                    :node-height="currentLayoutOptions.nodeHeight"
                    :viewport="patternFlowViewport"
                    :viewport-size="patternFlowViewportSize"
                    :line-color="board?.line.color ?? '#0064ff'"
                    @focus="focusPatternFlowOn"
                  />
                </div>
              </div>
            </div>

            <div v-else class="pattern-modal__state">
              Desserte indisponible pour ce passage.
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
