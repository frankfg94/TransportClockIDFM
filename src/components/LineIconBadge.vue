<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { createRatpLineIconUrls } from "../services/lineIcons";
import type { TransitFamily, TransitMode } from "../types/transit";

type LineIconLike = {
  color?: string;
  family?: TransitFamily;
  iconUrl?: string;
  iconUrls?: string[];
  label?: string;
  longName?: string;
  mode?: TransitMode;
  ref?: string;
  shortName?: string;
  textColor?: string;
};

const props = defineProps<{
  line: LineIconLike;
  compact?: boolean;
}>();

const iconIndex = ref(0);
const displayLabel = computed(
  () => props.line.label ?? props.line.shortName ?? "?",
);
const resolvedFamily = computed(
  () => props.line.family ?? transitModeToFamily(props.line.mode),
);
const generatedIconUrls = computed(() =>
  createRatpLineIconUrls({
    code: displayLabel.value,
    family: resolvedFamily.value,
    mode: props.line.mode,
    ref: props.line.ref,
  }),
);
const iconCandidates = computed(() => {
  const candidates = Array.from(
    new Set([...(props.line.iconUrls ?? []), ...generatedIconUrls.value]),
  );

  if (props.line.iconUrl && !candidates.includes(props.line.iconUrl)) {
    return [props.line.iconUrl, ...candidates];
  }

  return candidates;
});
const currentIconUrl = computed(() => iconCandidates.value[iconIndex.value]);

watch(
  () => [
    props.line.iconUrl,
    props.line.iconUrls?.join("|"),
    displayLabel.value,
    resolvedFamily.value,
    props.line.ref,
  ],
  () => {
    iconIndex.value = 0;
  },
);

function showNextIconCandidate(): void {
  iconIndex.value += 1;
}

function getLineModeLabel(line: typeof props.line): string {
  const family = line.family ?? transitModeToFamily(line.mode);

  if (family === "TRAM") {
    return "TRAM";
  }

  if (family === "TRANSILIEN") {
    return "TRAIN";
  }

  return family ?? "";
}

function transitModeToFamily(mode?: TransitMode): TransitFamily | undefined {
  if (mode === "metro") {
    return "METRO";
  }

  if (mode === "rer") {
    return "RER";
  }

  if (mode === "tram") {
    return "TRAM";
  }

  if (mode === "bus") {
    return "BUS";
  }

  if (mode === "train") {
    return "TRANSILIEN";
  }

  return undefined;
}
</script>

<template>
  <span
    class="line-icon-badge"
    :class="{ 'line-icon-badge--compact': compact }"
  >
    <img
      v-if="currentIconUrl"
      :src="currentIconUrl"
      :alt="`Ligne ${displayLabel}`"
      loading="lazy"
      @error="showNextIconCandidate"
    />
    <span
      v-else
      class="line-icon-badge__fallback"
      :style="{
        '--line-bg': line.color ?? '#0064ff',
        '--line-fg': line.textColor ?? '#ffffff',
      }"
    >
      <span class="line-icon-badge__label">{{ displayLabel }}</span>
    </span>
  </span>
</template>

<style scoped>
.line-icon-badge {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  height: 36px;
  min-width: 42px;
}

.line-icon-badge img {
  display: block;
  max-height: 36px;
  max-width: 68px;
  object-fit: contain;
}

.line-icon-badge--compact {
  height: 30px;
}

.line-icon-badge--compact img {
  max-height: 30px;
  max-width: 58px;
}

.line-icon-badge.board-line-icon {
  height: 72px;
  min-width: 76px;
}

.line-icon-badge.board-line-icon img {
  max-height: 72px;
  max-width: 92px;
}

.line-icon-badge.board-line-icon .line-icon-badge__fallback {
  height: 72px;
}

.line-icon-badge.board-line-icon .line-icon-badge__label {
  font-size: 1.55rem;
  min-width: 72px;
}

.line-icon-badge.alarm-summary__line,
.line-icon-badge.pattern-modal__line {
  height: 54px;
  min-width: 58px;
}

.line-icon-badge.alarm-summary__line img,
.line-icon-badge.pattern-modal__line img {
  max-height: 54px;
  max-width: 78px;
}

.line-icon-badge__fallback {
  align-items: stretch;
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.12);
  border-radius: 6px;
  color: var(--ink);
  display: inline-flex;
  height: 34px;
  overflow: hidden;
}

.line-icon-badge__mode {
  align-items: center;
  color: var(--line-bg);
  display: inline-flex;
  font-size: 0.58rem;
  font-weight: 950;
  justify-content: center;
  padding: 0 6px;
}

.line-icon-badge__label {
  align-items: center;
  background: var(--line-bg);
  color: var(--line-fg);
  display: inline-flex;
  font-size: 1rem;
  font-weight: 950;
  justify-content: center;
  min-width: 38px;
  padding: 0 8px;
}
</style>
