<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { LineSearchOption } from "../types/transit";

const props = defineProps<{
  line: Pick<
    LineSearchOption,
    "family" | "label" | "color" | "textColor" | "iconUrl" | "iconUrls"
  >;
  compact?: boolean;
}>();

const iconIndex = ref(0);
const iconCandidates = computed(() => {
  const candidates = props.line.iconUrls ?? [];

  if (props.line.iconUrl && !candidates.includes(props.line.iconUrl)) {
    return [props.line.iconUrl, ...candidates];
  }

  return candidates;
});
const currentIconUrl = computed(() => iconCandidates.value[iconIndex.value]);

watch(
  () => [props.line.iconUrl, props.line.iconUrls?.join("|")],
  () => {
    iconIndex.value = 0;
  },
);

function showNextIconCandidate(): void {
  iconIndex.value += 1;
}

function getLineModeLabel(line: typeof props.line): string {
  if (line.family === "TRAM") {
    return "TRAM";
  }

  if (line.family === "TRANSILIEN") {
    return "TRAIN";
  }

  return line.family;
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
      :alt="`Ligne ${line.label}`"
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
      <span class="line-icon-badge__mode">{{ getLineModeLabel(line) }}</span>
      <span class="line-icon-badge__label">{{ line.label }}</span>
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
