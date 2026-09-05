<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowLeft, Search, XIcon } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import {
  createLinePresentation,
  transitFamilyToMode,
} from "../../services/linePresentation";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import type { GlobalMapLine, GlobalMapMode } from "../transport-map/contracts/manifest";

const props = withDefaults(defineProps<{
  mode: GlobalMapMode;
  lines?: GlobalMapLine[];
  embedded?: boolean;
  selectedLineId?: string;
}>(), { lines: () => [] });

const emit = defineEmits<{
  close: [];
  "select-line": [lineId: string];
}>();

const { locale, t } = useI18n();
const offsetX = ref(0);
const dragStartX = ref<number>();
const dragging = ref(false);
const lineSearchOpen = ref(false);
const lineSearchQuery = ref("");

function modeLabel(mode: GlobalMapMode): string {
  const keys: Record<GlobalMapMode, string> = {
    BUS: "bus", METRO: "metro", RER: "rer", TRAIN: "train", TRANSILIEN: "transilien", TRAM: "tram", CABLE: "cable", NOCTILIEN: "noctilien", BIKE: "bike",
  };
  return t(`globalMap.modes.${keys[mode]}` as never);
}

function toFamily(mode: GlobalMapMode): "METRO" | "RER" | "BUS" | "TRAM" | "NOCTILIEN" | "TRANSILIEN" | "CABLE" | undefined {
  if (mode === "METRO" || mode === "RER" || mode === "BUS" || mode === "TRAM" || mode === "NOCTILIEN" || mode === "TRANSILIEN" || mode === "CABLE") return mode;
  if (mode === "TRAIN") return "TRANSILIEN";
  return undefined;
}

function lineCount(line: GlobalMapLine): number {
  return line.mode === "BIKE" ? line.geometryIds.length : line.stationIds.length;
}

function lineCountLabel(mode: GlobalMapMode): string {
  return mode === "BIKE"
    ? t("globalMap.sidebar.bikeSegments")
    : t("globalMap.sidebar.stations");
}

const presentedLines = computed(() =>
  props.lines.map((line) => {
    const family = toFamily(line.mode);
    const mode = family ? transitFamilyToMode(family) : undefined;
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
    const iconUrls = Array.from(
      new Set([
        ...(presentation.iconUrls ?? []),
        ...(line.pictogram ? [line.pictogram] : []),
      ]),
    );

    return {
      line,
      badge: {
        id: line.id,
        label,
        family,
        mode,
        color: presentation.color,
        textColor: presentation.textColor,
        iconUrl: presentation.iconUrl ?? line.pictogram ?? undefined,
        iconUrls,
        ref: line.sourceLineId ?? line.id,
      },
    };
  }).sort((left, right) => {
    const localeCode = locale.value === "fr" ? "fr-FR" : "en-US";
    return (left.line.label || left.line.code).localeCompare(
      right.line.label || right.line.code,
      localeCode,
      { numeric: true, sensitivity: "base" },
    ) || left.line.code.localeCompare(right.line.code, localeCode, { numeric: true });
  }),
);
const filteredPresentedLines = computed(() => {
  const query = normalizeLineSearch(lineSearchQuery.value);
  if (!query) return presentedLines.value;

  return presentedLines.value.filter(({ line }) =>
    [line.label, line.code]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeLineSearch(value).includes(query)),
  );
});

function normalizeLineSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(locale.value === "fr" ? "fr-FR" : "en-US")
    .trim();
}

function toggleLineSearch(): void {
  lineSearchOpen.value = !lineSearchOpen.value;
  if (!lineSearchOpen.value) lineSearchQuery.value = "";
}

function onPointerDown(event: PointerEvent): void {
  // Buttons and other controls must keep their native click/focus behavior.
  // Starting the drag from the aside itself would capture the pointer before
  // the close/filter actions receive their click, especially in Chromium.
  if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, label, [role='button']")) {
    return;
  }
  dragStartX.value = event.clientX - offsetX.value;
  dragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value || dragStartX.value === undefined) return;
  offsetX.value = Math.min(0, event.clientX - dragStartX.value);
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = false;
  (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  if (offsetX.value < -120) emit("close");
  offsetX.value = 0;
}

function closeWithEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  if (lineSearchOpen.value) {
    toggleLineSearch();
    return;
  }
  emit("close");
}
</script>

<template>
  <aside
    class="global-map-line-panel"
    :class="{ 'global-map-line-panel--embedded': embedded }"
    data-global-map-line-panel
    :style="{
      '--global-map-line-panel-offset-x': `${offsetX}px`,
      '--global-map-line-panel-top': `${GLOBAL_TRANSPORT_PLAN_CONFIG.layout.linePanelTopCssPx}px`,
      '--global-map-line-panel-mobile-top': `${GLOBAL_TRANSPORT_PLAN_CONFIG.layout.linePanelMobileTopCssPx}px`,
    }"
    :aria-label="t('globalMap.linePanel.aria')"
    @keydown="closeWithEscape"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <header class="global-map-line-panel__header">
      <div class="global-map-line-panel__header-leading">
        <button
          v-if="embedded"
          type="button"
          class="global-map-line-panel__header-action global-map-line-panel__header-action--back"
          :aria-label="t('globalMap.linePanel.back')"
          @click.stop="emit('close')"
        >
          <ArrowLeft :size="18" :stroke-width="2.25" aria-hidden="true" />
        </button>
        <div class="global-map-line-panel__heading">
          <small>{{ t("globalMap.linePanel.eyebrow") }}</small>
          <h2>{{ modeLabel(mode) }}</h2>
        </div>
      </div>
      <div class="global-map-line-panel__header-actions">
        <button
          v-if="embedded"
          type="button"
          class="global-map-line-panel__header-action"
          :aria-label="t('globalMap.linePanel.search')"
          :aria-expanded="lineSearchOpen"
          @click.stop="toggleLineSearch"
        >
          <Search :size="17" :stroke-width="2.25" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="global-map-line-panel__header-action"
          :aria-label="t('globalMap.linePanel.close')"
          @click.stop="emit('close')"
        >
          <XIcon :size="18" :stroke-width="2.25" aria-hidden="true" />
        </button>
      </div>
    </header>
    <label v-if="embedded && lineSearchOpen" class="global-map-line-panel__search">
      <Search :size="15" :stroke-width="2.25" aria-hidden="true" />
      <input
        v-model="lineSearchQuery"
        type="search"
        :aria-label="t('globalMap.linePanel.search')"
        :placeholder="t('globalMap.linePanel.searchPlaceholder')"
      />
    </label>
    <div class="global-map-line-panel__list">
      <button
        v-for="presented in filteredPresentedLines"
        :key="presented.line.id"
        class="global-map-line-panel__line"
        :class="{ 'global-map-line-panel__line--selected': props.selectedLineId === presented.line.id }"
        :aria-pressed="props.selectedLineId === presented.line.id"
        type="button"
        @click="emit('select-line', presented.line.id)"
      >
        <LineIconBadge :line="presented.badge" compact />
        <span><strong>{{ presented.line.label || presented.line.code }}</strong><small>{{ lineCount(presented.line) }} {{ lineCountLabel(presented.line.mode) }}</small></span>
      </button>
      <p v-if="!filteredPresentedLines.length" class="global-map-line-panel__empty">
        {{ lineSearchQuery.trim() ? t("globalMap.linePanel.searchEmpty") : t("globalMap.linePanel.empty") }}
      </p>
    </div>
  </aside>
</template>

<style scoped>
.global-map-line-panel {
  position: absolute;
  z-index: 5;
  top: var(--global-map-line-panel-top);
  bottom: auto;
  left: 16px;
  display: flex;
  flex-direction: column;
  width: min(320px, calc(100% - 32px));
  max-height: min(58vh, 540px);
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 42px rgba(16, 35, 63, 0.13);
  transform: translate3d(var(--global-map-line-panel-offset-x, 0px), 0, 0);
  transition: transform 180ms ease;
  touch-action: pan-y;
}
.global-map-line-panel--embedded {
  position: relative;
  top: auto;
  bottom: auto;
  left: auto;
  width: 100%;
  max-width: none;
  max-height: none;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.global-map-line-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}
.global-map-line-panel__header-leading {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
}
.global-map-line-panel__heading {
  min-width: 0;
}
.global-map-line-panel__header small {
  color: #718096;
  font-size: 0.62rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.global-map-line-panel__header h2 {
  margin: 4px 0 0;
  color: #2f3b52;
  font-size: 1.05rem;
}
.global-map-line-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}
.global-map-line-panel__header-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 9px;
  background: rgba(248, 250, 252, 0.86);
  color: #526078;
  cursor: pointer;
}
.global-map-line-panel__header-action--back {
  background: transparent;
  color: #69778d;
}
.global-map-line-panel__header-action:hover,
.global-map-line-panel__header-action:focus-visible {
  border-color: rgba(148, 163, 184, 0.24);
  background: #f2f5f9;
  color: #334155;
  outline: none;
}
.global-map-line-panel__header-action svg {
  display: block;
  flex: 0 0 auto;
}
.global-map-line-panel__search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 10px;
  padding: 7px 9px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.72);
  color: #718096;
}
.global-map-line-panel__search:focus-within {
  border-color: #9aaed0;
  box-shadow: 0 0 0 2px rgba(68, 111, 177, 0.1);
}
.global-map-line-panel__search svg {
  flex: 0 0 auto;
}
.global-map-line-panel__search input {
  min-width: 0;
  width: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.76rem;
}
.global-map-line-panel__search input::placeholder {
  color: #8b99ae;
  opacity: 1;
}
.global-map-line-panel__list {
  display: grid;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.global-map-line-panel__line {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-height: 52px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.global-map-line-panel__line:hover,
.global-map-line-panel__line:focus-visible {
  background: #f3f6fa;
  outline: none;
}
.global-map-line-panel__line--selected {
  border-color: rgba(125, 177, 245, 0.48);
  background: #f2f7ff;
  box-shadow: inset 3px 0 0 #6ea8ff;
  color: #234b7c;
}
.global-map-line-panel__line--selected:hover,
.global-map-line-panel__line--selected:focus-visible {
  border-color: rgba(125, 177, 245, 0.62);
  background: #eaf3ff;
}
.global-map-line-panel__line span {
  display: grid;
  gap: 2px;
}
.global-map-line-panel__line small {
  color: #718096;
  font-size: 0.68rem;
}
.global-map-line-panel__empty {
  padding: 20px 10px;
  color: #718096;
  font-size: 0.78rem;
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .global-map-line-panel,
  .global-map-line-panel__line {
    transition: none;
  }
}
@media (max-width: 700px) {
  .global-map-line-panel {
    top: var(--global-map-line-panel-mobile-top);
    max-height: 44vh;
  }
  .global-map-line-panel--embedded {
    top: auto;
  }
}
</style>
