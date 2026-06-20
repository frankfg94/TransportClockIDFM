<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Eye, Minus, Plus, Settings, X } from "lucide-vue-next";
import DistanceToggle from "../../components/DistanceToggle.vue";
import {
  loadDetailedLineMap,
  loadStationTransfers,
  loadTransferLineDirections,
  loadTransferLineFrequency,
} from "./lineMapData";
import DetailedLineMapPickerSideBar from "./DetailedLineMapPickerSideBar.vue";
import LineMapDisplayControls from "./LineMapDisplayControls.vue";
import {
  filterNetworkGhostTransfersByModes,
  TransitNetworkGhostLayer,
  useNetworkGhost,
  type GhostNetworkModeVisibility,
  type GhostNetworkScope,
  type NetworkGhostAnchor,
  type NetworkGhostLineView,
} from "../network-ghost";
import { transitBoards } from "../../config/transitBoards";
import { createBoardFromDraft } from "../../services/boardBuilder";
import { fetchDirectionGroupsForStation } from "../../services/idfm";
import { addBoardToTransitPreferences } from "../../storage/transitPreferences";
import { formatTransitDistance } from "../../services/distance";
import type {
  LineFrequencyProfile,
  LineSearchOption,
  StationSearchOption,
  TransferLineOption,
} from "../../types/transit";
import type {
  LineMapSegmentView,
  LineMapStopView,
  LineMapViewModel,
} from "./types";
import "./line-map.css";

interface TransferState {
  loading: boolean;
  lines: TransferLineOption[];
  error?: string;
}

interface GhostDirectionState {
  loading: boolean;
  directions: string[];
  error?: boolean;
}

interface GhostFrequencyState {
  loading: boolean;
  profile?: LineFrequencyProfile;
  error?: boolean;
}

interface MapDragState {
  active: boolean;
  dragging: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}

interface MapPinchState {
  active: boolean;
  distance: number;
}

interface SegmentDistanceLabel {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type MobileSheetStage = "peek" | "mid" | "full";

interface TouchStopClickGuard {
  stopId: string;
  handledAt: number;
}

const props = withDefaults(
  defineProps<{
    line?: LineSearchOption;
    selectedStationId?: string;
    mode?: "picker" | "explorer";
    selectable?: boolean;
    ghostNetworkEnabled?: boolean;
    ghostNetworkScope?: GhostNetworkScope;
    reduceMotion?: boolean;
  }>(),
  {
    mode: "picker",
    selectable: true,
    ghostNetworkEnabled: false,
    ghostNetworkScope: "all",
    reduceMotion: false,
  },
);

const emit = defineEmits<{
  select: [station: StationSearchOption];
}>();

const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 620;
const SVG_PADDING_X = 78;
const SVG_PADDING_Y = 68;
const MIN_ZOOM = 0.9;
const MAX_ZOOM = 20;
const ZOOM_FACTOR = 1.24;
const GHOST_TOOLTIP_TARGET = "#line-map-network-ghost-tooltip-layer";

const lineMap = ref<LineMapViewModel>();
const loadingMap = ref(false);
const errorMessage = ref("");
const hoveredStop = ref<LineMapStopView>();
const activeStop = ref<LineMapStopView>();
const zoom = ref(1.12);
const mapCanvas = ref<HTMLDivElement>();
const suppressNextCanvasClick = ref(false);
const ghostResetKey = ref(0);
const ghostDisplayExpanded = ref(true);
const ghostDisplayEnabled = ref(true);
const activeGhostLine = ref<NetworkGhostLineView>();
const favoriteLoading = ref(false);
const favoriteError = ref("");
const favoriteConfirmationOpen = ref(false);
const showDistances = ref(false);
const mobileDisplayOpen = ref(false);
const mobileSheetStage = ref<MobileSheetStage>("mid");
const touchStopClickGuard = ref<TouchStopClickGuard>();
const mapDrag = reactive<MapDragState>({
  active: false,
  dragging: false,
  pointerId: -1,
  scrollLeft: 0,
  scrollTop: 0,
  startX: 0,
  startY: 0,
});
const mapPinch = reactive<MapPinchState>({
  active: false,
  distance: 0,
});
const transferStates = reactive<Record<string, TransferState>>({});
const ghostDirectionStates = reactive<Record<string, GhostDirectionState>>({});
const ghostFrequencyStates = reactive<Record<string, GhostFrequencyState>>({});
const ghostModeVisibility = reactive<GhostNetworkModeVisibility>({
  bus: props.ghostNetworkScope !== "structural",
  metro: true,
  tram: true,
  noctilien: props.ghostNetworkScope !== "structural",
  rer: true,
});
let latestMapRequest = 0;

const stopById = computed(() => {
  const stops = new Map<string, LineMapStopView>();

  lineMap.value?.stops.forEach((stop) => stops.set(stop.id, stop));

  return stops;
});

const selectedStop = computed(() =>
  lineMap.value?.stops.find((stop) => stop.id === props.selectedStationId),
);

const activeTransferState = computed(() =>
  activeStop.value ? transferStates[activeStop.value.id] : undefined,
);
const ghostAnchor = computed<NetworkGhostAnchor | undefined>(() => {
  const stop = activeStop.value;

  if (!stop) {
    return undefined;
  }

  return {
    id: stop.id,
    label: stop.label,
    lon: stop.lon ?? stop.station.lon,
    lat: stop.lat ?? stop.station.lat,
    projectedX: stop.projectedX,
    projectedY: stop.projectedY,
    mapX: stop.x,
    mapY: stop.y,
    quays: stop.quays,
  };
});
const ghostTransfers = computed(
  () => activeTransferState.value?.lines ?? [],
);
const visibleGhostTransfers = computed(() =>
  ghostDisplayEnabled.value
    ? filterNetworkGhostTransfersByModes(
        ghostTransfers.value,
        ghostModeVisibility,
      )
    : [],
);
const activeGhostDirectionState = computed(() =>
  activeGhostLine.value
    ? ghostDirectionStates[activeGhostLine.value.id]
    : undefined,
);
const activeGhostFrequencyState = computed(() => {
  const line = activeGhostLine.value;
  const stop = activeStop.value;

  return line && stop
    ? ghostFrequencyStates[createGhostFrequencyKey(line.id, stop)]
    : undefined;
});
const isExplorerMode = computed(() => props.mode === "explorer");
const canSelectStops = computed(() => props.selectable);
const isMapDragging = computed(() => mapDrag.dragging);
const {
  lines: ghostLines,
  progress: ghostProgress,
  quays: ghostQuays,
} = useNetworkGhost({
  anchor: ghostAnchor,
  enabled: computed(
    () =>
      props.ghostNetworkEnabled &&
      isExplorerMode.value &&
      ghostDisplayEnabled.value,
  ),
  scope: computed(() => props.ghostNetworkScope),
  transfers: visibleGhostTransfers,
  viewport: computed(() => lineMap.value?.viewport),
});

const mapStats = computed(() => {
  const stopCount = lineMap.value?.stops.length ?? 0;

  return `${stopCount} stations`;
});

const segmentDistanceLabels = computed<SegmentDistanceLabel[]>(() => {
  const map = lineMap.value;

  if (!map || !showDistances.value) {
    return [];
  }

  return map.segments.flatMap((segment) => {
    if (segment.distanceKm === undefined) {
      return [];
    }

    const label = formatTransitDistance(segment.distanceKm);
    const height = 22 / zoom.value;
    const width = Math.max(42, label.length * 6.6 + 14) / zoom.value;

    return [
      {
        id: segment.id,
        label,
        x:
          (getSegmentX(segment, "from") + getSegmentX(segment, "to")) / 2,
        y:
          (getSegmentY(segment, "from") + getSegmentY(segment, "to")) / 2,
        width,
        height,
      },
    ];
  });
});

const renderedStops = computed(() => {
  const activeStopId = activeStop.value?.id;
  const stops = (lineMap.value?.stops ?? []).map((stop, index) => ({
    index,
    stop,
  }));

  if (!activeStopId) {
    return stops;
  }

  return [
    ...stops.filter(({ stop }) => stop.id !== activeStopId),
    ...stops.filter(({ stop }) => stop.id === activeStopId),
  ];
});

const svgStyle = computed(() => ({
  height: `${VIEWBOX_HEIGHT * zoom.value}px`,
  width: `${VIEWBOX_WIDTH * zoom.value}px`,
}));

const stopRadius = computed(() => 7 / zoom.value);
const stopHaloRadius = computed(() => 16 / zoom.value);
const stopStrokeWidth = computed(() => 2 / zoom.value);

const visibleLabelIds = computed(() => {
  const map = lineMap.value;

  if (!map) {
    return new Set<string>();
  }

  if (zoom.value >= 2.15) {
    return new Set(map.stops.map((stop) => stop.id));
  }

  const requiredIds = new Set<string>(
    [
      ...getTerminalStopIds(map),
      props.selectedStationId ?? "",
      hoveredStop.value?.id ?? "",
      activeStop.value?.id ?? "",
    ].filter(Boolean),
  );
  const placedLabels: Array<{ x: number; y: number }> = [];
  const labelIds = new Set<string>();
  const minimumDistance =
    zoom.value >= 1.55 ? 62 : zoom.value >= 1.25 ? 78 : 96;
  const sortedStops = [...map.stops].sort(
    (left, right) =>
      getLabelPriority(right, requiredIds) -
      getLabelPriority(left, requiredIds),
  );

  sortedStops.forEach((stop) => {
    const x = toScreenX(stop.x);
    const y = toScreenY(stop.y);
    const required = requiredIds.has(stop.id);
    const collides = placedLabels.some(
      (label) => Math.hypot(label.x - x, label.y - y) < minimumDistance,
    );

    if (!required && collides) {
      return;
    }

    labelIds.add(stop.id);
    placedLabels.push({ x, y });
  });

  return labelIds;
});

watch(
  () => props.line?.id,
  () => {
    closeSidebar();
    clearTransferStates();
    showDistances.value = false;

    if (props.line) {
      void loadMap();
      return;
    }

    lineMap.value = undefined;
  },
  { immediate: true },
);

watch(
  () => props.ghostNetworkScope,
  (scope) => {
    if (scope === "structural") {
      ghostModeVisibility.bus = false;
      ghostModeVisibility.noctilien = false;
    }
  },
);

watch(ghostDisplayEnabled, (enabled) => {
  if (!enabled) {
    activeGhostLine.value = undefined;
    ghostResetKey.value += 1;
  }
});

async function loadMap(): Promise<void> {
  if (!props.line) {
    return;
  }

  const requestId = ++latestMapRequest;
  loadingMap.value = true;
  errorMessage.value = "";
  hoveredStop.value = undefined;
  activeStop.value = undefined;

  try {
    const map = await loadDetailedLineMap(props.line);

    if (requestId === latestMapRequest) {
      lineMap.value = map;
      zoom.value = getDefaultZoom(map);
    }
  } catch (error) {
    if (requestId === latestMapRequest) {
      lineMap.value = undefined;
      errorMessage.value =
        error instanceof Error ? error.message : "Plan indisponible";
    }
  } finally {
    if (requestId === latestMapRequest) {
      loadingMap.value = false;
    }
  }
}

function selectStop(stop: LineMapStopView): void {
  toggleStopDetails(stop);

  if (canSelectStops.value) {
    emit("select", stop.station);
  }
}

function selectStopFromPointer(stop: LineMapStopView, event: PointerEvent): void {
  if (event.pointerType !== "touch" && event.pointerType !== "pen") {
    return;
  }

  event.preventDefault();
  touchStopClickGuard.value = {
    stopId: stop.id,
    handledAt: Date.now(),
  };
  selectStop(stop);
}

function selectStopFromClick(stop: LineMapStopView, event: MouseEvent): void {
  const guard = touchStopClickGuard.value;

  if (guard?.stopId === stop.id && Date.now() - guard.handledAt < 900) {
    event.preventDefault();
    touchStopClickGuard.value = undefined;
    return;
  }

  touchStopClickGuard.value = undefined;
  selectStop(stop);
}

function showStopHover(stop: LineMapStopView): void {
  hoveredStop.value = stop;
}

function hideStopHover(stop?: LineMapStopView): void {
  if (!stop || hoveredStop.value?.id === stop.id) {
    hoveredStop.value = undefined;
  }
}

function toggleStopDetails(stop: LineMapStopView): void {
  favoriteError.value = "";

  if (activeStop.value?.id === stop.id) {
    closeSidebar();
    return;
  }

  ghostResetKey.value += 1;
  activeGhostLine.value = undefined;
  activeStop.value = stop;
  mobileSheetStage.value = "mid";
  void loadTransfers(stop);
}

function closeSidebar(): void {
  activeStop.value = undefined;
  activeGhostLine.value = undefined;
  ghostResetKey.value += 1;
  favoriteError.value = "";
  favoriteLoading.value = false;
  mobileSheetStage.value = "mid";
}

function setMobileSheetStage(stage: MobileSheetStage): void {
  mobileSheetStage.value = stage;
}

function setGhostModeVisibility(
  visibility: GhostNetworkModeVisibility,
): void {
  Object.assign(ghostModeVisibility, visibility);
}

function openMobileDisplayModal(): void {
  mobileDisplayOpen.value = true;
}

function closeMobileDisplayModal(): void {
  mobileDisplayOpen.value = false;
}

function handleGhostActiveLineChange(
  line: NetworkGhostLineView | undefined,
): void {
  activeGhostLine.value = line;

  if (line) {
    void loadGhostDirections(line);

    if (activeStop.value) {
      void loadGhostFrequency(line, activeStop.value);
    }
  }
}

async function loadGhostDirections(line: NetworkGhostLineView): Promise<void> {
  if (ghostDirectionStates[line.id]) {
    return;
  }

  ghostDirectionStates[line.id] = {
    loading: true,
    directions: [],
  };

  try {
    const result = await loadTransferLineDirections(line.id);

    ghostDirectionStates[line.id] = {
      loading: false,
      directions: result.directions,
    };
  } catch {
    ghostDirectionStates[line.id] = {
      loading: false,
      directions: [],
      error: true,
    };
  }
}

async function loadGhostFrequency(
  line: NetworkGhostLineView,
  stop: LineMapStopView,
): Promise<void> {
  const key = createGhostFrequencyKey(line.id, stop);

  if (ghostFrequencyStates[key]) {
    return;
  }

  ghostFrequencyStates[key] = {
    loading: true,
  };

  try {
    ghostFrequencyStates[key] = {
      loading: false,
      profile: await loadTransferLineFrequency(line.id, stop.station),
    };
  } catch {
    ghostFrequencyStates[key] = {
      loading: false,
      error: true,
    };
  }
}

function createGhostFrequencyKey(
  lineId: string,
  stop: LineMapStopView,
): string {
  return `${lineId}:${stop.station.scheduleStopAreaRef ?? stop.station.id}`;
}

async function loadTransfers(stop: LineMapStopView): Promise<void> {
  if (transferStates[stop.id]) {
    return;
  }

  transferStates[stop.id] = {
    loading: true,
    lines: [],
  };

  try {
    const lines = await loadStationTransfers(stop.station, props.line?.id);

    transferStates[stop.id] = {
      loading: false,
      lines,
    };
  } catch {
    transferStates[stop.id] = {
      loading: false,
      lines: [],
      error: "Correspondances indisponibles",
    };
  }
}

function clearTransferStates(): void {
  Object.keys(transferStates).forEach((key) => {
    delete transferStates[key];
  });
}

async function addActiveStopToFavorites(): Promise<void> {
  const line = props.line;
  const stop = activeStop.value;

  if (!line || !stop || favoriteLoading.value) {
    return;
  }

  favoriteLoading.value = true;
  favoriteError.value = "";

  try {
    const directionGroups = await fetchDirectionGroupsForStation(
      line,
      stop.station,
    );
    const board = createBoardFromDraft(
      {
        family: line.family,
        line,
        station: stop.station,
      },
      directionGroups,
    );

    addBoardToTransitPreferences(board, transitBoards);
    favoriteConfirmationOpen.value = true;
  } catch {
    favoriteError.value =
      "Impossible d'ajouter cette station à l'écran d'accueil.";
  } finally {
    favoriteLoading.value = false;
  }
}

function openActiveStopInGoogleMaps(): void {
  const stop = activeStop.value;

  if (!stop) {
    return;
  }

  const lon = stop.lon ?? stop.station.lon;
  const lat = stop.lat ?? stop.station.lat;
  const query =
    typeof lon === "number" && typeof lat === "number"
      ? `${lat},${lon}`
      : [stop.label, stop.city].filter(Boolean).join(", ");
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  window.open(url, "_blank", "noopener,noreferrer");
}

function getSegmentStop(
  segment: LineMapSegmentView,
  side: "from" | "to",
): LineMapStopView | undefined {
  return stopById.value.get(
    side === "from" ? segment.fromStopId : segment.toStopId,
  );
}

function getSegmentX(segment: LineMapSegmentView, side: "from" | "to"): number {
  return toSvgX(getSegmentStop(segment, side)?.x ?? 0);
}

function getSegmentY(segment: LineMapSegmentView, side: "from" | "to"): number {
  return toSvgY(getSegmentStop(segment, side)?.y ?? 0);
}

function toSvgX(value: number): number {
  return SVG_PADDING_X + value * (VIEWBOX_WIDTH - SVG_PADDING_X * 2);
}

function toSvgY(value: number): number {
  return SVG_PADDING_Y + value * (VIEWBOX_HEIGHT - SVG_PADDING_Y * 2);
}

function toScreenX(value: number): number {
  return toSvgX(value) * zoom.value;
}

function toScreenY(value: number): number {
  return toSvgY(value) * zoom.value;
}

function shouldShowLabel(stop: LineMapStopView): boolean {
  return visibleLabelIds.value.has(stop.id);
}

function getLabelAnchor(stop: LineMapStopView): "middle" | "start" | "end" {
  const offset = getLabelOffset(stop);

  if (offset.x < 0) {
    return "end";
  }

  if (Math.abs(offset.x) < 4) {
    return "middle";
  }

  return "start";
}

function getLabelX(stop: LineMapStopView, index: number): number {
  return toSvgX(stop.x) + getLabelOffset(stop, index).x / zoom.value;
}

function getLabelY(stop: LineMapStopView, index: number): number {
  return toSvgY(stop.y) + getLabelOffset(stop, index).y / zoom.value;
}

function getLabelOffset(
  stop: LineMapStopView,
  index = lineMap.value?.stops.findIndex((item) => item.id === stop.id) ?? 0,
): { x: number; y: number } {
  if (
    props.selectedStationId === stop.id ||
    hoveredStop.value?.id === stop.id ||
    activeStop.value?.id === stop.id
  ) {
    return { x: 18, y: -18 };
  }

  const offsets = [
    { x: 18, y: -16 },
    { x: -18, y: 18 },
    { x: 18, y: 22 },
    { x: -18, y: -16 },
    { x: 0, y: -24 },
    { x: 0, y: 30 },
  ];

  return offsets[index % offsets.length];
}

function getLineStyle() {
  const color = lineMap.value?.lineColor ?? props.line?.color ?? "#0064ff";

  return {
    stroke: color,
  };
}

function getStopStyle(stop: LineMapStopView) {
  const color = lineMap.value?.lineColor ?? props.line?.color ?? "#0064ff";
  const isActive = stop.id === activeStop.value?.id;
  const isSelected = stop.id === props.selectedStationId || isActive;

  return {
    fill: isSelected ? color : "#ffffff",
    stroke: isActive ? "#ffffff" : color,
    strokeWidth: `${stopStrokeWidth.value}px`,
  };
}

function getLabelStyle() {
  return {
    fontSize: `${12.5 / zoom.value}px`,
    strokeWidth: `${5 / zoom.value}px`,
  };
}

function getActiveLabelBackground(stop: LineMapStopView, index: number) {
  const paddingX = 8 / zoom.value;
  const height = 24 / zoom.value;
  const width = Math.max(42, stop.label.length * 7.2) / zoom.value + paddingX * 2;
  const labelX = getLabelX(stop, index);
  const anchor = getLabelAnchor(stop);

  return {
    x:
      anchor === "end"
        ? labelX - width
        : anchor === "middle"
          ? labelX - width / 2
          : labelX - paddingX,
    y: getLabelY(stop, index) - 17 / zoom.value,
    width,
    height,
    rx: height / 2,
  };
}

function getHitTargetStyle(stop: LineMapStopView) {
  return {
    height: "var(--line-map-hit-target-size, 34px)",
    left: `${toScreenX(stop.x)}px`,
    top: `${toScreenY(stop.y)}px`,
    width: "var(--line-map-hit-target-size, 34px)",
  };
}

function getStopActionLabel(stop: LineMapStopView): string {
  return canSelectStops.value
    ? `Sélectionner ${stop.label}`
    : `Afficher ${stop.label}`;
}

function adjustZoom(direction: number): void {
  const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;

  zoom.value = clampZoom(zoom.value * factor);
}

function zoomAtCanvasPoint(
  direction: number,
  clientX: number,
  clientY: number,
): void {
  zoomAtCanvasPointByFactor(
    direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR,
    clientX,
    clientY,
  );
}

function zoomAtCanvasPointByFactor(
  factor: number,
  clientX: number,
  clientY: number,
): void {
  const canvas = mapCanvas.value;

  if (!canvas) {
    zoom.value = clampZoom(zoom.value * factor);
    return;
  }

  const previousZoom = zoom.value;
  const nextZoom = clampZoom(previousZoom * factor);

  if (nextZoom === previousZoom) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const anchorX = clientX - rect.left + canvas.scrollLeft;
  const anchorY = clientY - rect.top + canvas.scrollTop;
  const ratio = nextZoom / previousZoom;

  zoom.value = nextZoom;

  requestAnimationFrame(() => {
    canvas.scrollLeft = anchorX * ratio - (clientX - rect.left);
    canvas.scrollTop = anchorY * ratio - (clientY - rect.top);
  });
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
}

function handleCanvasWheel(event: WheelEvent): void {
  if (!lineMap.value) {
    return;
  }

  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;

  zoomAtCanvasPoint(direction, event.clientX, event.clientY);
}

function startMapDrag(event: PointerEvent): void {
  if (
    mapPinch.active ||
    event.button !== 0 ||
    !mapCanvas.value ||
    (event.target instanceof Element &&
      event.target.closest(
        ".line-map-hit-target, .network-ghost-line__hit-target",
      ))
  ) {
    return;
  }

  mapDrag.active = true;
  mapDrag.dragging = false;
  mapDrag.pointerId = event.pointerId;
  mapDrag.scrollLeft = mapCanvas.value.scrollLeft;
  mapDrag.scrollTop = mapCanvas.value.scrollTop;
  mapDrag.startX = event.clientX;
  mapDrag.startY = event.clientY;
  mapCanvas.value.setPointerCapture(event.pointerId);
}

function moveMapDrag(event: PointerEvent): void {
  if (
    mapPinch.active ||
    !mapDrag.active ||
    event.pointerId !== mapDrag.pointerId ||
    !mapCanvas.value
  ) {
    return;
  }

  const deltaX = event.clientX - mapDrag.startX;
  const deltaY = event.clientY - mapDrag.startY;

  if (!mapDrag.dragging && Math.hypot(deltaX, deltaY) < 4) {
    return;
  }

  mapDrag.dragging = true;
  mapCanvas.value.scrollLeft = mapDrag.scrollLeft - deltaX;
  mapCanvas.value.scrollTop = mapDrag.scrollTop - deltaY;
}

function stopMapDrag(event?: PointerEvent): void {
  const wasDragging = mapDrag.dragging;
  const pointerId = event?.pointerId ?? mapDrag.pointerId;

  if (pointerId >= 0 && mapCanvas.value?.hasPointerCapture(pointerId)) {
    mapCanvas.value.releasePointerCapture(pointerId);
  }

  mapDrag.active = false;
  mapDrag.dragging = false;
  mapDrag.pointerId = -1;

  if (wasDragging) {
    suppressNextCanvasClick.value = true;
  }
}

function handleCanvasTouchStart(event: TouchEvent): void {
  if (event.touches.length !== 2) {
    return;
  }

  const distance = getTouchDistance(event.touches);
  if (!distance) {
    return;
  }

  event.preventDefault();
  stopMapDrag();
  mapPinch.active = true;
  mapPinch.distance = distance;
}

function handleCanvasTouchMove(event: TouchEvent): void {
  if (!mapPinch.active || event.touches.length !== 2) {
    return;
  }

  const distance = getTouchDistance(event.touches);
  const center = getTouchCenter(event.touches);

  if (!distance || !center || mapPinch.distance <= 0) {
    return;
  }

  event.preventDefault();
  zoomAtCanvasPointByFactor(
    distance / mapPinch.distance,
    center.x,
    center.y,
  );
  mapPinch.distance = distance;
}

function handleCanvasTouchEnd(event: TouchEvent): void {
  if (event.touches.length < 2) {
    mapPinch.active = false;
    mapPinch.distance = 0;
  }
}

function getTouchDistance(touches: TouchList): number | undefined {
  const firstTouch = touches[0];
  const secondTouch = touches[1];

  if (!firstTouch || !secondTouch) {
    return undefined;
  }

  return Math.hypot(
    secondTouch.clientX - firstTouch.clientX,
    secondTouch.clientY - firstTouch.clientY,
  );
}

function getTouchCenter(
  touches: TouchList,
): { x: number; y: number } | undefined {
  const firstTouch = touches[0];
  const secondTouch = touches[1];

  if (!firstTouch || !secondTouch) {
    return undefined;
  }

  return {
    x: (firstTouch.clientX + secondTouch.clientX) / 2,
    y: (firstTouch.clientY + secondTouch.clientY) / 2,
  };
}

function handleCanvasMouseLeave(): void {
  hideStopHover();
  stopMapDrag();
}

function handleCanvasClick(event: MouseEvent): void {
  if (
    event.target instanceof Element &&
    event.target.closest(".network-ghost-line__hit-target")
  ) {
    return;
  }

  if (!suppressNextCanvasClick.value) {
    ghostResetKey.value += 1;
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  suppressNextCanvasClick.value = false;
  ghostResetKey.value += 1;
}

function resetZoom(): void {
  if (!lineMap.value) {
    zoom.value = 1.12;
    return;
  }

  zoom.value = getDefaultZoom(lineMap.value);
}

function getDefaultZoom(map: LineMapViewModel): number {
  if (isExplorerMode.value) {
    return map.stops.length > 55 ? 1.02 : 1;
  }

  return map.stops.length > 45 ? 1.22 : 1.12;
}

function getTerminalStopIds(map: LineMapViewModel): string[] {
  const degrees = new Map<string, number>();

  map.segments.forEach((segment) => {
    degrees.set(segment.fromStopId, (degrees.get(segment.fromStopId) ?? 0) + 1);
    degrees.set(segment.toStopId, (degrees.get(segment.toStopId) ?? 0) + 1);
  });

  return map.stops
    .filter((stop) => (degrees.get(stop.id) ?? 0) <= 1)
    .map((stop) => stop.id);
}

function getLabelPriority(
  stop: LineMapStopView,
  requiredIds: Set<string>,
): number {
  if (requiredIds.has(stop.id)) {
    return 100;
  }

  return stop.routeIds.length;
}
</script>

<template>
  <div
    class="line-map-panel"
    :class="{
      'line-map-panel--explorer': isExplorerMode,
      'line-map-panel--reduce-motion': reduceMotion,
    }"
    :style="{
      '--line-color': lineMap?.lineColor ?? props.line?.color ?? '#0064ff',
    }"
  >
    <div class="line-map-panel__bar">
      <span
        class="line-map-chip"
        :style="{
          background: props.line?.color ?? '#0064ff',
          color: props.line?.textColor ?? '#ffffff',
        }"
      >
        {{ props.line?.label }}
      </span>
      <span v-if="selectedStop" class="line-map-selected-pill">
        {{ selectedStop.label }}
      </span>
      <div v-if="lineMap" class="line-map-panel__tools">
        <slot name="bar-before-stats"></slot>
        <DistanceToggle
          v-model="showDistances"
          class="pattern-flow-action-button line-map-distance-toggle"
          :reduce-motion="reduceMotion"
        />
        <button
          v-if="ghostNetworkEnabled && isExplorerMode"
          class="icon-button line-map-mobile-settings-button"
          type="button"
          aria-label="Ouvrir les options d'affichage"
          data-testid="line-map-mobile-display-button"
          @click="openMobileDisplayModal"
        >
          <Settings aria-hidden="true" />
        </button>
        <span class="line-map-stats">{{ mapStats }}</span>
        <span
          v-if="ghostNetworkEnabled && ghostProgress.total > 0"
          class="line-map-network-progress"
          role="status"
        >
          Réseau {{ ghostProgress.completed }}/{{ ghostProgress.total }}
        </span>
        <div class="line-map-zoom" aria-label="Zoom du plan">
          <button
            class="icon-button line-map-zoom__button"
            type="button"
            aria-label="Dézoomer"
            @click="adjustZoom(-1)"
          >
            −
          </button>
          <button
            class="button-secondary line-map-zoom__reset"
            type="button"
            @click="resetZoom"
          >
            {{ Math.round(zoom * 100) }}%
          </button>
          <button
            class="icon-button line-map-zoom__button"
            type="button"
            aria-label="Zoomer"
            @click="adjustZoom(1)"
          >
            +
          </button>
        </div>
      </div>
      <span v-if="loadingMap" class="field-loader">
        <span aria-hidden="true" class="loader-dot"></span>
        Chargement du plan
      </span>
    </div>

    <div v-if="loadingMap" class="line-map-state">
      <span aria-hidden="true" class="loader-dot line-map-state__loader"></span>
      <strong>Plan en cours de chargement</strong>
    </div>

    <div v-else-if="errorMessage" class="line-map-state line-map-state--error">
      <strong>{{ errorMessage }}</strong>
      <button class="button-secondary" type="button" @click="loadMap">
        Réessayer
      </button>
    </div>

    <div v-else-if="lineMap" class="line-map-panel__main">
      <div
        ref="mapCanvas"
        class="line-map-canvas"
        :class="{ 'line-map-canvas--dragging': isMapDragging }"
        @pointerdown="startMapDrag"
        @pointermove="moveMapDrag"
        @pointerup="stopMapDrag"
        @pointercancel="stopMapDrag"
        @mouseleave="handleCanvasMouseLeave"
        @wheel="handleCanvasWheel"
        @touchstart="handleCanvasTouchStart"
        @touchmove="handleCanvasTouchMove"
        @touchend="handleCanvasTouchEnd"
        @touchcancel="handleCanvasTouchEnd"
        @click.capture="handleCanvasClick"
      >
        <svg
          class="line-map-svg"
          role="img"
          :style="svgStyle"
          :viewBox="`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`"
          data-testid="line-map"
        >
          <g class="line-map-tiles" aria-hidden="true">
            <image
              v-for="tile in lineMap.tiles"
              :key="tile.id"
              class="line-map-tile"
              :href="tile.url"
              :x="tile.x"
              :y="tile.y"
              :width="tile.width"
              :height="tile.height"
              preserveAspectRatio="none"
            />
          </g>

          <g class="line-map-map-mask" aria-hidden="true">
            <rect x="0" y="0" :width="VIEWBOX_WIDTH" :height="VIEWBOX_HEIGHT" />
          </g>

          <TransitNetworkGhostLayer
            v-if="
              ghostNetworkEnabled &&
              ghostDisplayEnabled &&
              isExplorerMode &&
              activeStop &&
              lineMap.viewport
            "
            :lines="ghostLines"
            :quays="ghostQuays"
            :anchor-x="activeStop.x"
            :anchor-y="activeStop.y"
            :view-box-width="VIEWBOX_WIDTH"
            :view-box-height="VIEWBOX_HEIGHT"
            :padding-x="SVG_PADDING_X"
            :padding-y="SVG_PADDING_Y"
            :zoom="zoom"
            :tooltip-target="GHOST_TOOLTIP_TARGET"
            :reduce-motion="reduceMotion"
            :reset-key="ghostResetKey"
            @active-line-change="handleGhostActiveLineChange"
          />

          <g class="line-map-segments">
            <line
              v-for="segment in lineMap.segments"
              :key="segment.id"
              class="line-map-segment"
              :x1="getSegmentX(segment, 'from')"
              :y1="getSegmentY(segment, 'from')"
              :x2="getSegmentX(segment, 'to')"
              :y2="getSegmentY(segment, 'to')"
              :style="getLineStyle()"
            />
          </g>

          <TransitionGroup
            tag="g"
            name="line-map-distance-pop"
            class="line-map-segment-distances"
          >
            <g
              v-for="distance in segmentDistanceLabels"
              :key="`${distance.id}:distance`"
              class="line-map-segment-distance"
              :transform="`translate(${distance.x} ${distance.y})`"
            >
              <g class="line-map-segment-distance__bubble">
                <rect
                  :x="-distance.width / 2"
                  :y="-distance.height / 2"
                  :width="distance.width"
                  :height="distance.height"
                  :rx="distance.height / 2"
                />
                <text
                  text-anchor="middle"
                  dominant-baseline="central"
                  :style="{ fontSize: `${11.5 / zoom}px` }"
                >
                  {{ distance.label }}
                </text>
              </g>
            </g>
          </TransitionGroup>

          <g
            v-for="{ stop, index } in renderedStops"
            :key="stop.id"
            class="line-map-stop"
            :class="{
              'line-map-stop--selected':
                stop.id === selectedStationId || stop.id === activeStop?.id,
              'line-map-stop--active': stop.id === activeStop?.id,
              'line-map-stop--hovered': stop.id === hoveredStop?.id,
            }"
            :style="{ '--line-map-stop-color': lineMap.lineColor }"
          >
            <circle
              class="line-map-stop__ripple line-map-stop__ripple--delayed"
              :cx="toSvgX(stop.x)"
              :cy="toSvgY(stop.y)"
              :r="stopHaloRadius"
            />
            <circle
              class="line-map-stop__ripple"
              :cx="toSvgX(stop.x)"
              :cy="toSvgY(stop.y)"
              :r="stopHaloRadius"
            />
            <circle
              class="line-map-stop__halo"
              :cx="toSvgX(stop.x)"
              :cy="toSvgY(stop.y)"
              :r="stopHaloRadius"
            />
            <circle
              class="line-map-stop__dot"
              :cx="toSvgX(stop.x)"
              :cy="toSvgY(stop.y)"
              :r="stopRadius"
              :style="getStopStyle(stop)"
            />
            <rect
              v-if="shouldShowLabel(stop) && stop.id === activeStop?.id"
              class="line-map-stop__label-background"
              v-bind="getActiveLabelBackground(stop, index)"
            />
            <text
              v-if="shouldShowLabel(stop)"
              class="line-map-stop__label"
              :class="{
                'line-map-stop__label--active': stop.id === activeStop?.id,
              }"
              :x="getLabelX(stop, index)"
              :y="getLabelY(stop, index)"
              :style="getLabelStyle()"
              :text-anchor="getLabelAnchor(stop)"
            >
              {{ stop.label }}
            </text>
          </g>

          <g
            id="line-map-network-ghost-tooltip-layer"
            class="line-map-network-ghost-tooltip-layer"
            aria-hidden="true"
          ></g>
        </svg>

        <button
          v-for="stop in lineMap.stops"
          :key="`${stop.id}:hit-target`"
          class="line-map-hit-target"
          type="button"
          :aria-label="getStopActionLabel(stop)"
          :aria-pressed="stop.id === activeStop?.id"
          :style="getHitTargetStyle(stop)"
          @pointerdown.stop
          @pointerup.stop="selectStopFromPointer(stop, $event)"
          @click="selectStopFromClick(stop, $event)"
          @focus="showStopHover(stop)"
          @blur="hideStopHover(stop)"
          @mouseenter="showStopHover(stop)"
          @mouseleave="hideStopHover(stop)"
        ></button>
      </div>

      <aside
        v-if="ghostNetworkEnabled && isExplorerMode"
        class="line-map-display-panel"
        :class="{
          'line-map-display-panel--collapsed': !ghostDisplayExpanded,
        }"
        data-testid="line-map-display-panel"
        @pointerdown.stop
        @click.stop
      >
        <button
          class="line-map-display-panel__header"
          type="button"
          :aria-expanded="ghostDisplayExpanded"
          @click="ghostDisplayExpanded = !ghostDisplayExpanded"
        >
          <Eye aria-hidden="true" />
          <strong>Affichage</strong>
          <Minus v-if="ghostDisplayExpanded" aria-hidden="true" />
          <Plus v-else aria-hidden="true" />
        </button>

        <LineMapDisplayControls
          v-if="ghostDisplayExpanded"
          :model-value="ghostDisplayEnabled"
          :visibility="ghostModeVisibility"
          :ghost-network-scope="ghostNetworkScope"
          @update:model-value="ghostDisplayEnabled = $event"
          @update:visibility="setGhostModeVisibility"
        />
      </aside>
    </div>

    <Transition name="line-map-sidebar-slide">
      <DetailedLineMapPickerSideBar
        v-if="lineMap && activeStop"
        :stop="activeStop"
        :transfers="activeTransferState?.lines ?? []"
        :transfers-loading="activeTransferState?.loading ?? true"
        :transfers-error="activeTransferState?.error"
        :line-color="lineMap.lineColor"
        :show-actions="isExplorerMode"
        :favorite-loading="favoriteLoading"
        :favorite-error="favoriteError"
        :active-ghost-line="activeGhostLine"
        :ghost-directions="activeGhostDirectionState?.directions ?? []"
        :ghost-directions-loading="
          activeGhostDirectionState?.loading ?? false
        "
        :ghost-directions-error="activeGhostDirectionState?.error"
        :ghost-frequency="activeGhostFrequencyState?.profile"
        :ghost-frequency-loading="
          activeGhostFrequencyState?.loading ?? false
        "
        :ghost-frequency-error="activeGhostFrequencyState?.error"
        :mobile-stage="mobileSheetStage"
        @close="closeSidebar"
        @mobile-stage-change="setMobileSheetStage"
        @add-favorite="addActiveStopToFavorites"
        @open-google-maps="openActiveStopInGoogleMaps"
      />
    </Transition>
  </div>

  <Teleport to="body">
    <Transition name="line-map-display-modal-fade">
      <div
        v-if="ghostNetworkEnabled && isExplorerMode && mobileDisplayOpen"
        class="line-map-display-modal-backdrop"
        role="presentation"
        @click.self="closeMobileDisplayModal"
      >
        <section
          class="line-map-display-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="line-map-display-modal-title"
          data-testid="line-map-display-modal"
          tabindex="-1"
          @keydown.esc="closeMobileDisplayModal"
        >
          <header class="line-map-display-modal__header">
            <Eye aria-hidden="true" />
            <strong id="line-map-display-modal-title">Affichage</strong>
            <button
              class="icon-button line-map-display-modal__close"
              type="button"
              aria-label="Fermer les options d'affichage"
              @click="closeMobileDisplayModal"
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <LineMapDisplayControls
            :model-value="ghostDisplayEnabled"
            :visibility="ghostModeVisibility"
            :ghost-network-scope="ghostNetworkScope"
            @update:model-value="ghostDisplayEnabled = $event"
            @update:visibility="setGhostModeVisibility"
          />
        </section>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal-scale">
      <div
        v-if="favoriteConfirmationOpen"
        class="line-map-confirmation-backdrop"
        role="presentation"
      >
        <section
          class="line-map-confirmation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="line-map-confirmation-title"
        >
          <strong id="line-map-confirmation-title">
            Station ajoutée à l'écran d'accueil
          </strong>
          <button type="button" @click="favoriteConfirmationOpen = false">
            OK
          </button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
