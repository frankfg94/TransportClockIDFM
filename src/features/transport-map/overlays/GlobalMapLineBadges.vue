<script setup lang="ts">
import { computed } from "vue";
import LineIconBadge from "../../../components/LineIconBadge.vue";
import type { TransitFamily } from "../../../types/transit";
import type { GlobalMapLine } from "../contracts/manifest";
import { useI18n } from "../../../i18n";

const props = defineProps<{
  line: GlobalMapLine;
  compact?: boolean;
  fallback: {
    id?: string; label?: string; mode?: string; family?: TransitFamily;
    color?: string; textColor?: string; iconUrl?: string; iconUrls?: string[]; ref?: string;
  };
}>();
const { t } = useI18n();
const routes = computed(() => {
  const grouped = new Map<string, { code: string; names: string[]; colors: Set<string>; textColors: Set<string> }>();
  if (props.line.mode !== "TRAIN") return [];
  for (const route of props.line.commercialRoutes ?? []) {
    const code = route.code.trim();
    if (!code) continue;
    const group = grouped.get(code) ?? { code, names: [], colors: new Set(), textColors: new Set() };
    if (route.name && !group.names.includes(route.name)) group.names.push(route.name);
    group.colors.add(route.color.toLowerCase());
    group.textColors.add(route.textColor.toLowerCase());
    grouped.set(code, group);
  }
  return [...grouped.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })).map((route) => {
    const color = route.colors.size === 1 ? [...route.colors][0]! : "";
    const fg = route.textColors.size === 1 ? [...route.textColors][0]! : "";
    return { ...route, ...readableColors(color, fg) };
  });
});

function luminance(hex: string): number {
  const components = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * components[0]! + 0.7152 * components[1]! + 0.0722 * components[2]!;
}
function readableColors(background: string, foreground: string): { background: string; foreground: string } {
  const bg = /^[0-9a-f]{6}$/iu.test(background) ? background : "374151";
  const proposed = /^[0-9a-f]{6}$/iu.test(foreground) ? foreground : "ffffff";
  const light = luminance(bg);
  const text = luminance(proposed);
  const ratio = (Math.max(light, text) + 0.05) / (Math.min(light, text) + 0.05);
  const fg = ratio >= 4.5 ? proposed : (light > 0.179 ? "000000" : "ffffff");
  return { background: `#${bg}`, foreground: `#${fg}` };
}
</script>

<template>
  <span v-if="routes.length" class="global-map-commercial-badges" role="group" :aria-label="t('globalMap.sidebar.observedTerLines')" :title="t('globalMap.sidebar.observedTerLines')">
    <span
      v-for="route in routes"
      :key="route.code"
      class="global-map-commercial-badges__code"
      :style="{ background: route.background, color: route.foreground }"
      :title="route.names.join(' · ')"
    >{{ route.code }}</span>
  </span>
  <LineIconBadge v-else :line="fallback" :compact="compact" />
</template>

<style scoped>
.global-map-commercial-badges {
  display: inline-flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  max-width: 136px;
}
.global-map-commercial-badges__code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 35px;
  height: 28px;
  padding: 0 6px;
  border-radius: 5px;
  font-size: 0.82rem;
  font-weight: 900;
  line-height: 1;
}
</style>
