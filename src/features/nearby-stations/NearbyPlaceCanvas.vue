<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import PlaceTooltip from "../../components/PlaceTooltip.vue";
import { useI18n } from "../../i18n";
import type { CameraState } from "../transport-map/geo/camera";
import { screenToWorld, worldScaleAtZoom, worldToScreen } from "../transport-map/geo/coordinateKernel";
import type { NearbyPlace } from "./nearbyPlaces";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";
import { nearbyPlaceWalkingDistanceMeters, nearbyPlaceWalkingMinutes, nearbyPlaceWheelchairAccess } from "./nearbyPlacePresentation";
import { PLACE_ICON_COMPONENTS, useNearbyPlacePresenter } from "./useNearbyPlacePresenter";
import { indexNearbyPlaceViewport, queryNearbyPlaceViewport } from "./nearbyPlaceViewport";
import { nearbyPlacePop, NEARBY_PLACE_POP_MS } from "./nearbyPlacePop";
import { beginDevPerformance, endDevPerformance } from "../../services/devPerformance";

const props = defineProps<{
  places: readonly NearbyPlace[];
  camera: CameraState;
  radius: number;
  city: boolean;
  preview: boolean;
  showNames: boolean;
  showAccessibility?: boolean;
  reducedMotion: boolean;
  interactionActive?: boolean;
  canvasHitTesting?: boolean;
  pixelRatioOverride?: number;
  selectedPlaceId?: string;
  walkingRoutes?: Readonly<Record<string, NearbyWalkingRoute | undefined>>;
}>();
const emit = defineEmits<{
  selectPlace: [id?: string];
  placeContextMenu: [id: string, event: MouseEvent];
  visibilityChange: [visible: boolean];
}>();
const { t, locale } = useI18n();
const { presentPlace } = useNearbyPlacePresenter();
type Point = ReturnType<typeof queryNearbyPlaceViewport>[number];
type Entry = Point & {
  presentation: ReturnType<typeof presentPlace>;
  ariaLabel: string;
  outside: boolean;
  ink: string;
  sprite?: HTMLCanvasElement;
  name?: string;
  label?: HTMLCanvasElement;
  targetWidth: number;
  inViewport: boolean;
  target?: HTMLButtonElement;
  enterAt: number;
  leaveAt?: number;
};
const canvas = ref<HTMLCanvasElement>();
const targets = ref<HTMLElement>();
const iconDefinitions = ref<SVGSVGElement>();
const entries = shallowRef<Entry[]>([]);
const hoveredId = ref<string>();
const index = computed(() => indexNearbyPlaceViewport(props.places));
const entryById = computed(() => new Map(entries.value.map(entry => [entry.place.id, entry])));
const activeEntries = computed(() => {
  const hovered = hoveredId.value ? entryById.value.get(hoveredId.value) : undefined;
  const selected = props.selectedPlaceId ? entryById.value.get(props.selectedPlaceId) : undefined;
  // Keep the hover overlay and its tooltip mounted when moving between places.
  return [
    ...(selected && selected !== hovered ? [{ key: "selected", entry: selected, tooltip: false }] : []),
    ...(hovered ? [{ key: "hovered", entry: hovered, tooltip: true }] : []),
  ];
});
let reference = props.camera;
let frame: number | undefined;
let fullPaintPending = true;
const dirtyPlaces = new Set<string>();
let disposed = false;
let context: CanvasRenderingContext2D | null = null;
let ratio = 1;
let fontSize = 9.28;
let fontFamily = "sans-serif";
let lastTargetTransform = "";
let lastInverseScale = "";
const padding = 128;
const leaving = new Map<string, Entry>();
const sprites = new Map<string, HTMLCanvasElement>();
const pendingSprites = new Set<string>();
const markup = new Map<string, string>();

function rebuild(): void {
  const previous = entryById.value;
  const now = performance.now();
  reference = props.camera;
  entries.value = queryNearbyPlaceViewport(index.value, reference, padding).map((point, order) => {
    const old = previous.get(point.place.id) ?? leaving.get(point.place.id);
    leaving.delete(point.place.id);
    const presentation = presentationFor(point.place);
    const route = props.walkingRoutes?.[point.place.id];
    const name = props.showNames && !props.city ? presentation.name : undefined;
    const outside = !props.city && !props.preview && point.place.distanceMeters > props.radius;
    const ink = color(point.place.category, outside);
    const wheelchairAccess = props.showAccessibility ? nearbyPlaceWheelchairAccess(point.place) : undefined;
    const wheelchairAccessLabel = wheelchairAccess
      ? `${t("nearbyStations.wheelchairAccessLabel")}: ${t(`nearbyStations.wheelchairAccess.${wheelchairAccess}`)}`
      : undefined;
    const ariaLabel = t("nearbyStations.placeAria", { name: presentation.name, type: presentation.typeLabel,
      meters: nearbyPlaceWalkingDistanceMeters(point.place, route),
      walking: t("nearbyStations.walkingTime", { minutes: nearbyPlaceWalkingMinutes(point.place, route) }) });
    const entry: Entry = { ...point, presentation, name, outside, ink,
      sprite: old?.ink === ink && old.presentation.iconId === presentation.iconId ? old.sprite : undefined,
      label: old?.name === name ? old?.label : undefined,
      targetWidth: 24,
      inViewport: point.x >= 0 && point.y >= 0 && point.x <= reference.viewportWidthCssPx && point.y <= reference.viewportHeightCssPx,
      enterAt: old?.enterAt ?? now + 240 + Math.min(order * 20, 160),
      ariaLabel: wheelchairAccessLabel ? `${ariaLabel}. ${wheelchairAccessLabel}` : ariaLabel,
    };
    if (context && name) {
      const nameTile = label(entry);
      entry.targetWidth = Math.max(24, nameTile ? nameTile.width / ratio - 8 : 24);
    }
    return entry;
  });
  if (!props.reducedMotion) {
    for (const [id, old] of previous) {
      if (!entryById.value.has(id)) leaving.set(id, { ...old, leaveAt: now });
    }
  }
  if (hoveredId.value && !entryById.value.has(hoveredId.value)) hoveredId.value = undefined;
  emit("visibilityChange", entries.value.length > 0);
  schedule();
}
let presentations = new WeakMap<NearbyPlace, ReturnType<typeof presentPlace>>();
function presentationFor(place: NearbyPlace) {
  let value = presentations.get(place);
  if (!value) { value = presentPlace(place); presentations.set(place, value); }
  return value;
}

// Keep a padded, fixed set of hit targets while moving. Only its parent matrix
// changes; camera frames do not format places, patch N VNodes or measure N nodes.
function cameraChanged(): void {
  const current = props.camera;
  const scale = worldScaleAtZoom(reference.zoom);
  const zoomRatio = 2 ** (reference.zoom - current.zoom);
  const dx = Math.abs(current.centerWorldX - reference.centerWorldX) * scale;
  const dy = Math.abs(current.centerWorldY - reference.centerWorldY) * scale;
  if (dx + current.viewportWidthCssPx * zoomRatio / 2 > reference.viewportWidthCssPx / 2 + padding - 56
    || dy + current.viewportHeightCssPx * zoomRatio / 2 > reference.viewportHeightCssPx / 2 + padding - 32
    || Math.abs(current.zoom - reference.zoom) > .75) rebuild();
  schedule();
}
function schedule(): void {
  fullPaintPending = true;
  scheduleFrame();
}
function scheduleFrame(): void {
  if (context && frame === undefined && !disposed) frame = requestAnimationFrame(paint);
}

function color(category: NearbyPlace["category"], outside: boolean): string {
  const rgb = category === "shop" ? [37, 99, 235]
    : category === "food" ? [217, 119, 6]
      : ["culture", "attraction"].includes(category) ? [124, 58, 237] : [71, 85, 105];
  const gray = rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
  return `rgb(${rgb.map(value => Math.round(outside ? value * .4 + gray * .6 : value)).join(",")})`;
}

// Bake the original Lucide drawing, white disc, fine border and shadow once
// per icon/color/DPR. Every marker in every later frame is a single drawImage.
function sprite(entry: Entry): HTMLCanvasElement | undefined {
  if (entry.sprite) return entry.sprite;
  const ink = entry.ink;
  const key = `${entry.presentation.iconId}:${ink}:${ratio}`;
  if (!sprites.has(key) && !pendingSprites.has(key)) {
    pendingSprites.add(key);
    const image = new Image();
    const assetRatio = ratio;
    image.onload = () => {
      pendingSprites.delete(key);
      if (disposed || assetRatio !== ratio) return;
      const tile = document.createElement("canvas");
      tile.width = tile.height = Math.ceil(44 * ratio);
      const ctx = tile.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.shadowColor = "rgba(15,23,42,.18)";
      ctx.shadowBlur = 6 * ratio;
      ctx.shadowOffsetY = 2 * ratio;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(22, 22, 11.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(51,65,85,.2)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.drawImage(image, 15.5, 15.5, 13, 13);
      sprites.set(key, tile);
      schedule();
    };
    image.onerror = () => { pendingSprites.delete(key); };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${13 * ratio}" height="${13 * ratio}" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${markup.get(entry.presentation.iconId) ?? ""}</svg>`)}`;
  }
  entry.sprite = sprites.get(key);
  return entry.sprite;
}
function label(entry: Entry): HTMLCanvasElement | undefined {
  if (!entry.name || entry.label) return entry.label;
  const tile = document.createElement("canvas");
  const ctx = tile.getContext("2d");
  if (!ctx) return;
  const font = `760 ${fontSize}px ${fontFamily}`;
  ctx.font = font;
  let text = entry.name;
  if (ctx.measureText(text).width > 102) {
    let lo = 0; let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(text.slice(0, mid) + "…").width <= 102) lo = mid; else hi = mid - 1;
    }
    text = text.slice(0, lo) + "…";
  }
  const width = Math.min(110, Math.ceil(ctx.measureText(text).width + 8));
  const height = fontSize * 1.1 + 4;
  tile.width = Math.ceil((width + 8) * ratio); tile.height = Math.ceil((height + 8) * ratio);
  ctx.scale(ratio, ratio);
  ctx.shadowColor = "rgba(15,23,42,.12)"; ctx.shadowBlur = 3 * ratio; ctx.shadowOffsetY = ratio;
  ctx.fillStyle = "rgba(255,255,255,.88)";
  ctx.beginPath(); ctx.roundRect(4, 4, width, height, 4); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.fillStyle = "#334155"; ctx.font = font;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, width / 2 + 4, height / 2 + 4);
  entry.label = tile;
  return tile;
}

// At rest, only the former/new active markers change. Clip to their sprite
// bounds and redraw overlapping neighbours in source order, preserving alpha
// and shadows without visiting every hit target or repainting the whole map.
function prepareHoverRepaint(ctx: CanvasRenderingContext2D, camera: CameraState): Entry[] {
  const rectangles = [];
  const neighbours = new Map<string, Entry>();
  const byId = entryById.value;
  const overlapPadding = Math.max(60, 25 + fontSize * 1.1 / 2);
  ctx.save();
  ctx.beginPath();
  for (const id of dirtyPlaces) {
    const entry = byId.get(id);
    if (!entry) continue;
    const point = worldToScreen({ x: entry.worldX, y: entry.worldY }, camera);
    const offset = entry.name ? (fontSize * 1.1 + 6) / 2 : 0;
    const halfWidth = Math.max(22, (entry.label?.width ?? 0) / ratio / 2) + 1;
    const bottom = Math.max(22 - offset, entry.label ? 10 - offset + entry.label.height / ratio : 0) + 1;
    // Device-pixel boundaries avoid accumulating antialiased clip seams.
    const left = Math.floor((point.x - halfWidth) * ratio) / ratio;
    const top = Math.floor((point.y - 23 - offset) * ratio) / ratio;
    const width = Math.ceil((point.x + halfWidth) * ratio) / ratio - left;
    const height = Math.ceil((point.y + bottom) * ratio) / ratio - top;
    rectangles.push({ left, top, width, height });
    ctx.rect(left, top, width, height);
    const center = screenToWorld({ x: left + width / 2, y: top + height / 2 }, camera);
    const region = { ...camera, centerWorldX: center.x, centerWorldY: center.y,
      viewportWidthCssPx: width, viewportHeightCssPx: height };
    for (const point of queryNearbyPlaceViewport(index.value, region, overlapPadding)) {
      const neighbour = byId.get(point.place.id);
      if (neighbour) neighbours.set(point.place.id, neighbour);
    }
  }
  ctx.clip();
  for (const { left, top, width, height } of rectangles) ctx.clearRect(left, top, width, height);
  return [...neighbours.values()].sort((a, b) => a.order - b.order);
}

function paint(now: number): void {
  const performanceId = beginDevPerformance("nearby-poi-canvas-draw");
  try {
  frame = undefined;
  const node = canvas.value; const ctx = context;
  if (!node || !ctx) return;
  const camera = props.camera;
  const nextRatio = props.pixelRatioOverride ?? camera.pixelRatio ?? 1;
  if (ratio !== nextRatio) {
    ratio = nextRatio; sprites.clear(); pendingSprites.clear();
    for (const entry of [...entries.value, ...leaving.values()]) { entry.label = undefined; entry.sprite = undefined; }
  }
  const width = Math.round(camera.viewportWidthCssPx * ratio);
  const height = Math.round(camera.viewportHeightCssPx * ratio);
  const fullPaint = fullPaintPending || node.width !== width || node.height !== height;
  fullPaintPending = false;
  if (node.width !== width) node.width = width;
  if (node.height !== height) node.height = height;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const redrawEntries = fullPaint ? entries.value : prepareHoverRepaint(ctx, camera);
  dirtyPlaces.clear();
  if (fullPaint) ctx.clearRect(0, 0, camera.viewportWidthCssPx, camera.viewportHeightCssPx);
  const scale = worldScaleAtZoom(camera.zoom);
  if (targets.value) {
    const zoom = 2 ** (camera.zoom - reference.zoom);
    const x = (reference.centerWorldX - camera.centerWorldX) * scale + camera.viewportWidthCssPx / 2 - zoom * reference.viewportWidthCssPx / 2;
    const y = (reference.centerWorldY - camera.centerWorldY) * scale + camera.viewportHeightCssPx / 2 - zoom * reference.viewportHeightCssPx / 2;
    const transform = `matrix(${zoom},0,0,${zoom},${x},${y})`;
    const inverse = `${1 / zoom}`;
    if (transform !== lastTargetTransform) targets.value.style.transform = lastTargetTransform = transform;
    if (inverse !== lastInverseScale) targets.value.style.setProperty("--place-inverse-scale", lastInverseScale = inverse);
  }
  let animating = false;
  const reducedMotion = props.reducedMotion || props.interactionActive === true;
  const hovered = hoveredId.value;
  const selected = props.selectedPlaceId;
  const poses = new Map<string, ReturnType<typeof nearbyPlacePop>>();
  const draw = (entry: Entry) => {
    const isLeaving = entry.leaveAt !== undefined;
    const elapsed = now - (entry.leaveAt ?? entry.enterAt);
    if (isLeaving && (reducedMotion || elapsed >= NEARBY_PLACE_POP_MS)) {
      leaving.delete(entry.place.id); return;
    }
    const x = (entry.worldX - camera.centerWorldX) * scale + camera.viewportWidthCssPx / 2;
    const y = (entry.worldY - camera.centerWorldY) * scale + camera.viewportHeightCssPx / 2;
    const visible = x >= 0 && y >= 0 && x <= camera.viewportWidthCssPx && y <= camera.viewportHeightCssPx;
    if (!isLeaving && entry.inViewport !== visible) {
      entry.inViewport = visible;
      // Buffered offscreen targets must not take keyboard focus or scroll the map.
      if (entry.target) {
        entry.target.tabIndex = visible ? 0 : -1;
        if (visible) entry.target.removeAttribute("aria-hidden"); else entry.target.setAttribute("aria-hidden", "true");
      }
    }
    if (x < -64 || y < -48 || x > camera.viewportWidthCssPx + 64 || y > camera.viewportHeightCssPx + 48) {
      if (isLeaving) leaving.delete(entry.place.id);
      return;
    }
    const moving = !reducedMotion && elapsed < NEARBY_PLACE_POP_MS;
    animating ||= moving;
    const tile = sprite(entry);
    const name = props.interactionActive ? undefined : label(entry);
    if (!tile || (moving && elapsed < 0) || (!isLeaving && (entry.place.id === hovered || entry.place.id === selected))) return;
    let pose: ReturnType<typeof nearbyPlacePop> | undefined;
    if (moving) {
      const key = `${isLeaving}:${elapsed}`;
      pose = poses.get(key);
      if (!pose) { pose = nearbyPlacePop(elapsed, isLeaving); poses.set(key, pose); }
    }
    const size = pose?.scale ?? 1;
    const offset = entry.name ? (fontSize * 1.1 + 6) / 2 : 0;
    ctx.globalAlpha = (entry.outside ? .4 : 1) * (pose?.opacity ?? 1);
    ctx.drawImage(tile, x - 22 * size, y + (pose?.y ?? 0) - (22 + offset) * size, 44 * size, 44 * size);
    if (name) ctx.drawImage(name, x - name.width / ratio / 2 * size,
      y + (pose?.y ?? 0) + (10 - offset) * size, name.width / ratio * size, name.height / ratio * size);
  };
  if (fullPaint) for (const entry of leaving.values()) draw(entry);
  for (const entry of redrawEntries) draw(entry);
  ctx.globalAlpha = 1;
  if (!fullPaint) ctx.restore();
  if (animating) schedule();
  } finally {
    endDevPerformance(performanceId, "nearby-poi-canvas-draw");
  }
}

function placement(entry: Entry): "above" | "below" | "left" | "right" {
  const point = worldToScreen({ x: entry.worldX, y: entry.worldY }, props.camera);
  return point.y < 92 ? "below" : point.x < 145 ? "right"
    : point.x > props.camera.viewportWidthCssPx - 145 ? "left" : "above";
}

function canvasPoint(event: MouseEvent | PointerEvent): { x: number; y: number } | undefined {
  const node = canvas.value;
  if (!node) return undefined;
  const bounds = node.getBoundingClientRect();
  const width = bounds.width || props.camera.viewportWidthCssPx;
  const height = bounds.height || props.camera.viewportHeightCssPx;
  if (width <= 0 || height <= 0) return undefined;
  return {
    x: (event.clientX - bounds.left) * props.camera.viewportWidthCssPx / width,
    y: (event.clientY - bounds.top) * props.camera.viewportHeightCssPx / height,
  };
}

function hitTest(event: MouseEvent | PointerEvent): Entry | undefined {
  if (!props.canvasHitTesting) return undefined;
  const point = canvasPoint(event);
  if (!point) return undefined;
  const camera = props.camera;
  const radiusPx = 30;
  const world = screenToWorld(point, camera);
  const candidates = queryNearbyPlaceViewport(index.value, {
    ...camera,
    centerWorldX: world.x,
    centerWorldY: world.y,
    viewportWidthCssPx: radiusPx * 2,
    viewportHeightCssPx: radiusPx * 2,
  });
  let closest: { entry: Entry; distance: number } | undefined;
  for (const candidate of candidates) {
    const entry = entryById.value.get(candidate.place.id);
    if (!entry) continue;
    const projected = worldToScreen({ x: entry.worldX, y: entry.worldY }, camera);
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (distance <= radiusPx && (!closest || distance < closest.distance)) {
      closest = { entry, distance };
    }
  }
  return closest?.entry;
}

function handleCanvasPointerMove(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  hoveredId.value = hitTest(event)?.place.id;
}

function handleCanvasPointerLeave(): void {
  clearHover();
}

function handleCanvasClick(event: MouseEvent): void {
  const entry = hitTest(event);
  if (!entry) return;
  emit("selectPlace", props.selectedPlaceId === entry.place.id ? undefined : entry.place.id);
}

function handleCanvasContextMenu(event: MouseEvent): void {
  const entry = hitTest(event);
  if (entry) emit("placeContextMenu", entry.place.id, event);
}

function handleCanvasKeydown(event: KeyboardEvent): void {
  if (!props.canvasHitTesting) return;
  const visible = entries.value.filter((entry) => entry.inViewport);
  if (visible.length === 0) return;
  const currentIndex = visible.findIndex((entry) => entry.place.id === hoveredId.value);
  if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    hoveredId.value = visible[(currentIndex + direction + visible.length) % visible.length]!.place.id;
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && hoveredId.value) {
    event.preventDefault();
    emit("selectPlace", props.selectedPlaceId === hoveredId.value ? undefined : hoveredId.value);
  }
}

function activeStyle(entry: Entry) {
  const point = worldToScreen({ x: entry.worldX, y: entry.worldY }, props.camera);
  return { left: `${point.x}px`, top: `${point.y}px` };
}
function clearHover(id = hoveredId.value): void { if (hoveredId.value === id) hoveredId.value = undefined; }
defineExpose({ clearHover });
watch(index, rebuild, { immediate: true });
watch(() => props.camera, cameraChanged);
watch(() => [props.radius, props.city, props.preview, props.showNames, props.walkingRoutes], rebuild);
watch(locale, () => { presentations = new WeakMap(); rebuild(); });
watch(() => [hoveredId.value, props.selectedPlaceId], (next, previous) => {
  for (const id of [...previous, ...next]) if (id) dirtyPlaces.add(id);
  scheduleFrame();
});
watch(() => props.reducedMotion, schedule);
watch(() => [props.interactionActive, props.pixelRatioOverride], schedule);
onMounted(() => {
  for (const node of iconDefinitions.value?.querySelectorAll<SVGElement>("[data-place-icon]") ?? []) {
    markup.set(node.dataset.placeIcon!, node.innerHTML);
  }
  context = canvas.value?.getContext("2d") ?? null;
  ratio = props.camera.pixelRatio || 1;
  if (canvas.value) fontFamily = getComputedStyle(canvas.value).fontFamily;
  fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) * .58;
  rebuild();
});
onBeforeUnmount(() => {
  disposed = true;
  if (frame !== undefined) cancelAnimationFrame(frame);
  sprites.clear(); leaving.clear();
});
</script>

<template>
  <div class="nearby-map__places">
    <svg v-once ref="iconDefinitions" class="nearby-map__place-definitions" aria-hidden="true"><defs>
      <component :is="component" v-for="(component, id) in PLACE_ICON_COMPONENTS" :key="id" :data-place-icon="id" />
    </defs></svg>
    <canvas
      ref="canvas"
      class="nearby-map__place-canvas"
      :class="{ 'nearby-map__place-canvas--hit-test': canvasHitTesting }"
      data-nearby-place-canvas
      :aria-hidden="canvasHitTesting ? undefined : true"
      :role="canvasHitTesting ? 'img' : undefined"
      :aria-label="canvasHitTesting ? t('nearbyStations.mapAria') : undefined"
      :tabindex="canvasHitTesting ? 0 : undefined"
      @pointermove="handleCanvasPointerMove"
      @pointerleave="handleCanvasPointerLeave"
      @click.stop="handleCanvasClick"
      @contextmenu.stop.prevent="handleCanvasContextMenu"
      @keydown="handleCanvasKeydown"
    />
    <div v-if="!canvasHitTesting" v-memo="[entries, selectedPlaceId]" ref="targets" class="nearby-map__place-targets">
      <button v-for="entry in entries" :key="entry.place.id"
        :ref="element => { entry.target = element as HTMLButtonElement | undefined; }"
        v-memo="[entry, entry.place.id === selectedPlaceId]"
        class="nearby-map__place" :class="{ 'nearby-map__place--outside': entry.outside, 'nearby-map__place--active': entry.place.id === selectedPlaceId }"
        :style="{ left: `${entry.x}px`, top: `${entry.y}px`, width: `${entry.targetWidth}px`, height: entry.name ? `${fontSize * 1.1 + 30}px` : '24px' }"
        :data-place-id="entry.place.id" :aria-label="entry.ariaLabel" :aria-pressed="selectedPlaceId === entry.place.id"
        :tabindex="entry.inViewport ? 0 : -1" :aria-hidden="entry.inViewport ? undefined : true" type="button"
        @mouseenter="hoveredId = entry.place.id" @mouseleave="clearHover(entry.place.id)"
        @focusin="hoveredId = entry.place.id" @focusout="clearHover(entry.place.id)"
        @click.stop="emit('selectPlace', selectedPlaceId === entry.place.id ? undefined : entry.place.id)"
        @pointerdown.stop @contextmenu.stop.prevent="emit('placeContextMenu', entry.place.id, $event)">
        <span v-if="entry.name" class="nearby-map__place-name-accessible" aria-hidden="true">{{ entry.name }}</span>
      </button>
    </div>
    <div v-for="{ key, entry, tooltip } in activeEntries" :key="key" class="nearby-map__place-active"
      :class="[`nearby-map__place--${entry.place.category}`, { 'nearby-map__place--outside': entry.outside, 'nearby-map__place-active--preview': preview }]"
      :style="activeStyle(entry)">
      <span class="nearby-map__place-icon" aria-hidden="true"><component :is="entry.presentation.icon" :size="13" /></span>
      <span v-if="entry.name" class="nearby-map__place-name" aria-hidden="true">{{ entry.name }}</span>
      <PlaceTooltip v-if="tooltip" :place="entry.place" :placement="placement(entry)"
        :type-label="entry.presentation.typeLabel" :walking-minutes="nearbyPlaceWalkingMinutes(entry.place, walkingRoutes?.[entry.place.id])"
        :show-accessibility="showAccessibility" />
    </div>
  </div>
</template>

<style scoped>
.nearby-map__places { display: contents; }
.nearby-map__place-definitions { height: 0; position: absolute; width: 0; pointer-events: none; }
.nearby-map__place-canvas { inset: 0; height: 100%; width: 100%; position: absolute; pointer-events: none; z-index: 6; }
.nearby-map__place-canvas--hit-test { pointer-events: auto; z-index: 4; }
.nearby-map__place-targets { inset: 0; position: absolute; pointer-events: none; transform-origin: 0 0; z-index: 6; }
/* Hit targets must stay fixed on hover: the global button transform/transition
   otherwise moves them under the pointer and repeatedly retriggers enter/leave. */
.nearby-map__place, .nearby-map__place:hover:not(:disabled), .nearby-map__place:focus-visible { background: transparent; border: 0; min-height: 0; padding: 0; position: absolute; pointer-events: auto; transform: translate(-50%, -50%) scale(var(--place-inverse-scale, 1)); transition: none; }
.nearby-map__place:focus-visible { outline: 0; }
.nearby-map__place-name-accessible { clip-path: inset(50%); height: 1px; width: 1px; overflow: hidden; position: absolute; }
.nearby-map__place-active { align-items: center; color: #18233f; display: flex; flex-direction: column; gap: 2px; max-width: 110px; pointer-events: none; position: absolute; transform: translate(-50%, -50%) scale(1.06); z-index: 60; }
.nearby-map__place-active :deep(.place-tooltip) { backdrop-filter: none; }
.nearby-map__place-active.nearby-map__place--outside { filter: grayscale(.6); opacity: .4; }
.nearby-map__place-icon { align-items: center; background: #fff; border: 1px solid rgba(51,65,85,.2); border-radius: 50%; box-shadow: 0 2px 6px rgba(15,23,42,.18); color: #475569; display: flex; height: 24px; justify-content: center; width: 24px; }
.nearby-map__place--shop .nearby-map__place-icon { color: #2563eb; }
.nearby-map__place--food .nearby-map__place-icon { color: #d97706; }
.nearby-map__place--culture .nearby-map__place-icon, .nearby-map__place--attraction .nearby-map__place-icon { color: #7c3aed; }
.nearby-map__place-active--preview .nearby-map__place-icon { background: #5146ff; border-color: #fff; box-shadow: 0 0 0 4px rgba(81,70,255,.2),0 6px 16px rgba(16,35,63,.2); color: #fff; transform: scale(1.2); }
.nearby-map__place-name { background: rgba(255,255,255,.88); border-radius: 4px; box-shadow: 0 1px 3px rgba(15,23,42,.12); font-size: .58rem; font-weight: 760; line-height: 1.1; max-width: 110px; overflow: hidden; padding: 2px 4px; text-overflow: ellipsis; white-space: nowrap; }
</style>
