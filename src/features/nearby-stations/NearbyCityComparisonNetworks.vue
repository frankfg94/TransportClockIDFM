<script setup lang="ts">
import { computed } from "vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import Spinner from "../../components/Spinner.vue";
import { useI18n, type TranslationKey } from "../../i18n";
import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type { TransitFamily } from "../../types/transit";
import {
  type NearbyCityComparisonDetail,
  type NearbyCityComparisonLineIcon,
  type NearbyCityComparisonNetworkLines,
} from "./nearbyCityComparison";

const props = defineProps<{
  detail: NearbyCityComparisonDetail;
  currentName: string;
  targetName: string;
  open: boolean;
  /** False when the target city is hidden: its column is dropped. */
  showTarget?: boolean;
}>();

const { t } = useI18n();
const showTarget = computed(() => props.showTarget !== false);

/** Resolve the transit family the shared line badge needs for official icons. */
function comparisonLineFamily(mode: string): TransitFamily | undefined {
  if (mode === "METRO" || mode === "RER" || mode === "BUS" || mode === "TRAM"
    || mode === "NOCTILIEN" || mode === "TRANSILIEN" || mode === "CABLE") {
    return mode;
  }
  if (mode === "TRAIN") return "TRANSILIEN";
  return undefined;
}

function modeLabel(mode: string): string {
  const key = `nearbyStations.modes.${mode.toLocaleLowerCase("fr-FR")}` as TranslationKey;
  const label = t(key);
  return label === key ? mode : label;
}

/** Reuse the map presentation pipeline so badges match the station markers. */
function comparisonLineBadge(line: NearbyCityComparisonLineIcon, fallbackLabel: string) {
  const label = line.label?.trim() || line.code?.trim() || fallbackLabel;
  const family = comparisonLineFamily(line.mode);
  const presentation = createLinePresentation({
    code: line.code,
    color: line.color,
    family,
    id: line.id,
    longName: line.label,
    mode: family ? transitFamilyToMode(family) : undefined,
    ref: line.id,
    shortName: label,
    textColor: line.textColor,
  });
  return {
    id: line.id,
    label,
    family,
    mode: family ? transitFamilyToMode(family) : undefined,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: line.pictogram ?? presentation.iconUrl,
    iconUrls: Array.from(new Set([
      ...(line.pictogram ? [line.pictogram] : []),
      ...(presentation.iconUrls ?? []),
    ])),
    ref: line.id,
  };
}

const networks = computed(() => props.detail.networks);
const loading = computed(() => Boolean(props.detail.current.loading || props.detail.target.loading));

function badgeLabel(lines: NearbyCityComparisonNetworkLines, index: number): string {
  return lines.labels[index] ?? lines.lines[index]?.id ?? "";
}

/** Badges are rebuilt only when the networks themselves change. */
const badgesByZone = computed(() => {
  const build = (zone: NearbyCityComparisonNetworkLines) =>
    zone.lines.map((line, index) => ({
      badge: comparisonLineBadge(line, badgeLabel(zone, index)),
      label: badgeLabel(zone, index),
    }));
  const map = new Map<string, ReturnType<typeof build>>();
  for (const row of networks.value) {
    map.set(`${row.mode}:current`, build(row.current));
    map.set(`${row.mode}:target`, build(row.target));
  }
  return map;
});

function badges(mode: string, side: "current" | "target") {
  return badgesByZone.value.get(`${mode}:${side}`) ?? [];
}

function networkAria(mode: string, side: "current" | "target"): string {
  const row = networks.value.find((candidate) => candidate.mode === mode);
  const zone = side === "current" ? row?.current : row?.target;
  const city = side === "current" ? props.currentName : props.targetName;
  if (!zone || zone.count === 0) return `${modeLabel(mode)}, ${city}: ${t("nearbyStations.cityComparison.noLines")}`;
  return `${modeLabel(mode)}, ${city}: ${zone.count === 1
    ? t("nearbyStations.cityComparison.lineCountOne")
    : t("nearbyStations.cityComparison.lineCount", { count: zone.count })}`;
}
</script>

<template>
  <div
    id="nearby-city-comparison-networks"
    class="comparison-networks"
    :class="{ 'comparison-networks--open': open, 'comparison-networks--single': !showTarget }"
    data-testid="nearby-city-comparison-detail"
    :aria-hidden="!open"
  >
    <div class="comparison-networks__clip">
      <div class="comparison-networks__body">
        <div class="comparison-networks__legend" aria-hidden="true">
          <span />
          <span class="comparison-networks__city comparison-networks__city--current">{{ currentName }}</span>
          <span v-if="showTarget" class="comparison-networks__city comparison-networks__city--target">{{ targetName }}</span>
        </div>

        <div
          v-for="row in networks"
          :key="row.mode"
          class="comparison-networks__row"
          :data-network-mode="row.mode"
        >
          <span class="comparison-networks__mode">{{ modeLabel(row.mode) }}</span>

          <span class="comparison-networks__cell" :data-city="currentName" :aria-label="networkAria(row.mode, 'current')">
            <span v-if="row.current.count === 0" class="comparison-networks__empty">—</span>
            <Spinner v-else-if="detail.current.loading && row.current.lines.length === 0" :size="13" />
            <span v-else-if="row.aggregated" class="comparison-networks__count">
              {{ t("nearbyStations.cityComparison.lineCount", { count: row.current.count }) }}
            </span>
            <span v-else class="comparison-networks__badges">
              <LineIconBadge
                v-for="entry in badges(row.mode, 'current')"
                :key="`current:${row.mode}:${entry.badge.id}`"
                :line="entry.badge"
                compact
                :title="entry.label"
              />
            </span>
          </span>

          <span v-if="showTarget" class="comparison-networks__cell" :data-city="targetName" :aria-label="networkAria(row.mode, 'target')">
            <span v-if="row.target.count === 0" class="comparison-networks__empty">—</span>
            <Spinner v-else-if="detail.target.loading && row.target.lines.length === 0" :size="13" />
            <span v-else-if="row.aggregated" class="comparison-networks__count">
              {{ t("nearbyStations.cityComparison.lineCount", { count: row.target.count }) }}
            </span>
            <span v-else class="comparison-networks__badges">
              <LineIconBadge
                v-for="entry in badges(row.mode, 'target')"
                :key="`target:${row.mode}:${entry.badge.id}`"
                :line="entry.badge"
                compact
                :title="entry.label"
              />
            </span>
          </span>
        </div>

        <p v-if="networks.length === 0" class="comparison-networks__empty-note">
          {{ loading ? t("nearbyStations.cityComparison.loadingValue") : t("nearbyStations.cityComparison.noLines") }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comparison-networks {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  overflow: hidden;
  transition:
    grid-template-rows 260ms cubic-bezier(.2, .8, .2, 1),
    opacity 180ms ease;
}

.comparison-networks--open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.comparison-networks__clip {
  min-height: 0;
  overflow: hidden;
}

.comparison-networks__body {
  border-top: 1px solid rgba(100, 116, 139, .14);
  display: grid;
  gap: 4px;
  margin-top: 10px;
  padding-top: 10px;
}

.comparison-networks__legend,
.comparison-networks__row {
  align-items: center;
  column-gap: 12px;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) minmax(0, 1fr);
}

/* Single city: one network column, no target header. */
.comparison-networks--single .comparison-networks__legend,
.comparison-networks--single .comparison-networks__row {
  grid-template-columns: 96px minmax(0, 1fr);
}

.comparison-networks__legend { padding-bottom: 2px; }

.comparison-networks__city {
  font-size: .6rem;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.comparison-networks__city--current { color: #5146ff; }
.comparison-networks__city--target { color: #0c7c8a; }

.comparison-networks__mode {
  color: #8b97a8;
  font-size: .6rem;
  font-weight: 900;
  letter-spacing: .06em;
  line-height: 1.2;
  text-transform: uppercase;
}

.comparison-networks__cell {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  min-height: 26px;
  min-width: 0;
}

.comparison-networks__badges {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  /* The shared badge keeps an intrinsic 30px box; normalize it so several
     badges align on one baseline without inflating the row height. */
  line-height: 0;
}

.comparison-networks__badges :deep(.line-icon-badge) {
  height: 26px;
  min-width: 26px;
}

.comparison-networks__badges :deep(.line-icon-badge img) {
  max-height: 24px;
  max-width: 52px;
}

.comparison-networks__badges :deep(.line-icon-badge__fallback) { height: 24px; }

.comparison-networks__badges :deep(.line-icon-badge__label) {
  font-size: .74rem;
  min-width: 24px;
  padding: 0 7px;
}

.comparison-networks__count {
  color: #334155;
  font-size: .72rem;
  font-weight: 800;
}

.comparison-networks__empty {
  color: #94a3b8;
  font-weight: 850;
}

.comparison-networks__empty-note {
  color: #64748b;
  font-size: .72rem;
  margin: 0;
}

@media (max-width: 700px) {
  .comparison-networks__legend { display: none; }
  .comparison-networks__row {
    border-bottom: 1px solid rgba(100, 116, 139, .1);
    grid-template-columns: minmax(0, 1fr);
    padding: 6px 0;
    row-gap: 4px;
  }
  .comparison-networks__row:last-of-type { border-bottom: 0; }
  .comparison-networks__cell::before {
    color: #94a3b8;
    content: attr(data-city);
    font-size: .6rem;
    font-weight: 850;
    margin-right: 6px;
    text-transform: uppercase;
  }
}

@media (prefers-reduced-motion: reduce) {
  .comparison-networks { transition: none; }
}
</style>
