<script setup lang="ts">
import { computed } from "vue";
import LineIconBadge from "../../../components/LineIconBadge.vue";
import type { TransitFamily } from "../../../types/transit";
import { createLinePresentation, transitFamilyToMode } from "../../../services/linePresentation";
import type { GlobalMapLine, GlobalMapMode } from "../contracts/manifest";
import { useI18n } from "../../../i18n";

const props = withDefaults(
  defineProps<{
    stationLabel?: string;
    lines?: GlobalMapLine[];
    activeLineId?: string;
  }>(),
  { lines: () => [] },
);

const emit = defineEmits<{
  "hover-line": [lineId: string];
  "leave-line": [];
  "leave-tooltip": [];
  "select-line": [lineId: string];
}>();

const { t } = useI18n();

function lineFamily(mode: GlobalMapMode): TransitFamily | undefined {
  if (
    mode === "METRO" ||
    mode === "RER" ||
    mode === "BUS" ||
    mode === "TRAM" ||
    mode === "NOCTILIEN" ||
    mode === "TRANSILIEN" ||
    mode === "CABLE"
  ) return mode;
  if (mode === "TRAIN") return "TRANSILIEN";
  return undefined;
}

const presentedLines = computed(() => props.lines.map((line) => {
  const family = lineFamily(line.mode);
  const label = line.label || line.code;
  const presentation = createLinePresentation({
    code: line.code,
    color: line.color,
    family,
    id: line.id,
    longName: line.label,
    mode: family ? transitFamilyToMode(family) : undefined,
    ref: line.sourceLineId ?? line.id,
    shortName: label,
    textColor: line.textColor,
  });
  const iconUrls = Array.from(new Set([
    ...(line.pictogram ? [line.pictogram] : []),
    ...(presentation.iconUrls ?? []),
  ]));
  return {
    line,
    label,
    badge: {
      id: line.id,
      label,
      mode: family ? transitFamilyToMode(family) : undefined,
      family,
      color: presentation.color,
      textColor: presentation.textColor,
      iconUrl: line.pictogram ?? presentation.iconUrl,
      iconUrls,
      ref: line.sourceLineId ?? line.id,
    },
  };
}));

const isInteractive = computed(() => !props.stationLabel && presentedLines.value.length > 1);
const tooltipLabel = computed(() => props.stationLabel ?? (
  isInteractive.value
    ? t("globalMap.page.tooltip.chooseLine", { count: presentedLines.value.length })
    : undefined
));
</script>

<template>
  <div
    v-if="stationLabel || presentedLines.length"
    class="global-transport-plan__tooltip"
    :class="{
      'global-transport-plan__tooltip--interactive': isInteractive,
      'global-transport-plan__tooltip--material': true,
    }"
    :role="isInteractive ? 'dialog' : 'status'"
    :aria-label="tooltipLabel"
    @pointerdown.stop
    @pointerleave="emit('leave-tooltip')"
  >
    <template v-if="stationLabel">
      <span>{{ stationLabel }}</span>
    </template>

    <template v-else-if="presentedLines.length === 1">
      <LineIconBadge :line="presentedLines[0]!.badge" compact />
      <span>{{ presentedLines[0]!.label }}</span>
    </template>

    <template v-else>
      <span class="global-transport-plan__tooltip-choice-label">
        {{ t("globalMap.page.tooltip.chooseLine", { count: presentedLines.length }) }}
      </span>
      <div class="global-transport-plan__tooltip-choice-list" role="list">
        <button
          v-for="presented in presentedLines"
          :key="presented.line.id"
          type="button"
          class="global-transport-plan__tooltip-choice"
          :class="{ 'global-transport-plan__tooltip-choice--active': presented.line.id === activeLineId }"
          :aria-current="presented.line.id === activeLineId ? 'true' : undefined"
          :aria-label="t('globalMap.page.tooltip.selectLine', { line: presented.label })"
          @mouseenter="emit('hover-line', presented.line.id)"
          @focus="emit('hover-line', presented.line.id)"
          @mouseleave="emit('leave-line')"
          @blur="emit('leave-line')"
          @click.stop="emit('select-line', presented.line.id)"
        >
          <LineIconBadge :line="presented.badge" compact />
          <span>{{ presented.label }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.global-transport-plan__tooltip {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  max-width: min(300px, calc(100% - 16px));
  padding: 5px 8px;
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #fff;
  color: #18233f;
  font-size: 0.72rem;
  white-space: nowrap;
  box-shadow: 0 8px 24px rgba(24, 41, 76, 0.18), 0 2px 6px rgba(24, 41, 76, 0.08);
}

.global-transport-plan__tooltip.global-transport-plan__tooltip--interactive {
  display: block;
  pointer-events: auto;
  padding: 7px;
  white-space: normal;
}

.global-transport-plan__tooltip-choice-label {
  display: block;
  padding: 1px 4px 5px;
  color: #64748b;
  font-size: 0.66rem;
  font-weight: 700;
}

.global-transport-plan__tooltip-choice-list {
  display: grid;
  gap: 3px;
}

.global-transport-plan__tooltip-choice {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 150px;
  padding: 3px 5px;
  border: 1px solid #e5eaf2;
  border-radius: 5px;
  background: #fff;
  color: #18233f;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.global-transport-plan__tooltip-choice:hover,
.global-transport-plan__tooltip-choice:focus-visible,
.global-transport-plan__tooltip-choice--active {
  border-color: #a9b9d0;
  background: #f1f5fb;
  box-shadow: 0 0 0 2px rgba(0, 100, 255, 0.1);
  outline: none;
}

.global-transport-plan__tooltip-choice .line-icon-badge {
  width: 38px;
  min-width: 38px;
  justify-content: center;
}
</style>
