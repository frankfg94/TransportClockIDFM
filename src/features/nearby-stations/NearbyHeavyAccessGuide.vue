<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Clock3, Footprints, Route } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type { Departure, LineConfig, TransitFamily } from "../../types/transit";
import type { GlobalMapLine, GlobalMapMode } from "../transport-map/contracts/manifest";
import type { NearbyHeavyTransportAccess, NearbyHeavyTransportCandidate } from "./nearbyHeavyTransports";
import { isNearbyScheduleServiceEnded, type NearbyStationScheduleItem } from "./nearbyStationSchedules";

const props = defineProps<{
  candidate?: NearbyHeavyTransportCandidate;
  items: readonly NearbyStationScheduleItem[];
  directionVisible?: (itemId: string, directionId: string) => boolean;
}>();

const MAX_FEEDER_WAIT_FOR_WALKING_ALTERNATIVE_MINUTES = 5;

const { t } = useI18n();
const now = ref(Date.now());
let timer: number | undefined;

const targetLine = computed(() => props.candidate?.lines[0]);
const access = computed<NearbyHeavyTransportAccess | undefined>(() => {
  const candidate = props.candidate;
  const line = targetLine.value;
  return candidate && line
    ? candidate.accessByLine[line.id] ?? candidate.access
    : undefined;
});
const accessAlternatives = computed<NearbyHeavyTransportAccess[]>(() => {
  const candidate = props.candidate;
  const line = targetLine.value;
  const configured = line
    ? candidate?.accessAlternativesByLine?.[line.id]
    : undefined;
  const all = configured?.length
    ? configured
    : candidate?.accessAlternatives?.length
      ? candidate.accessAlternatives
      : access.value
        ? [access.value]
        : [];
  const seen = new Set<string>();
  return [...all]
    .filter((candidateAccess) => {
      const key = candidateAccess.kind === "direct"
        ? "direct"
        : `connection:${(candidateAccess.feederLineCode ?? candidateAccess.feederLineId ?? candidateAccess.feederMode ?? "unknown").trim().toLocaleLowerCase("fr-FR")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.totalSeconds - right.totalSeconds || left.walkingSeconds - right.walkingSeconds);
});
const feederItems = computed(() => {
  const currentAccess = access.value;
  if (!currentAccess || currentAccess.kind !== "connection") return [];

  return props.items.filter((item) => {
    if (item.state === "hidden" || item.projected) return false;
    if (currentAccess.feederLineId && item.line.id === currentAccess.feederLineId) return true;
    const feederCode = currentAccess.feederLineCode && normalizeLineCode(currentAccess.feederLineCode);
    if (!feederCode) return false;
    return [item.line.code, item.line.label, ...item.line.aliases]
      .some((value) => normalizeLineCode(value) === feederCode);
  });
});
const nextFeederDeparture = computed(() => {
  const departures = feederItems.value.flatMap((item) =>
    (item.result?.directionGroups ?? [])
      .filter((group) => props.directionVisible?.(item.id, group.id) ?? true)
      .flatMap((group) => group.departures.map((departure) => ({ departure, item }))),
  );

  return departures
    .filter(({ departure }) => departureTimestamp(departure) >= now.value - 30_000)
    .sort((left, right) => departureTimestamp(left.departure) - departureTimestamp(right.departure))[0];
});
const isLoading = computed(() => props.candidate && access.value?.kind === "connection" && (
  feederItems.value.length === 0 || feederItems.value.some((item) => item.state === "loading")
));
const hasUnavailableFeeder = computed(() => props.candidate && access.value?.kind === "connection" &&
  feederItems.value.length > 0 && feederItems.value.every((item) => item.state === "unavailable"));
const hasServiceEndedFeeder = computed(() => props.candidate && access.value?.kind === "connection" &&
  feederItems.value.length > 0 && feederItems.value.every(isNearbyScheduleServiceEnded));
const targetLabel = computed(() => {
  const line = targetLine.value;
  return line ? `${modeLabel(line.mode)} ${line.label || line.code}` : "";
});
const feederLine = computed(() => feederItems.value[0]?.line);
const feederLabel = computed(() => {
  const line = feederLine.value ?? (access.value ? findFeederLine(access.value) : undefined);
  return line?.label?.trim() || line?.code?.trim() || access.value?.feederLineCode?.trim() || t("nearbyStations.heavyGuideConnection");
});
const feederRoutes = computed(() => accessAlternatives.value
  .filter((candidateAccess) => candidateAccess.kind === "connection")
  .map((candidateAccess) => {
    const line = findFeederLine(candidateAccess);
    return {
      access: candidateAccess,
      badge: line ? lineBadge(line) : feederBadge(candidateAccess),
      key: feederAccessKey(candidateAccess),
      minutes: Math.max(1, Math.ceil(candidateAccess.totalSeconds / 60)),
    };
  })
  .filter((route): route is {
    access: NearbyHeavyTransportAccess;
    badge: LineConfig;
    key: string;
    minutes: number;
  } => Boolean(route.badge)));
const correspondenceRoutes = computed(() => {
  const candidate = props.candidate;
  if (!candidate?.projected || !candidate.correspondenceLines?.length) return [];

  return candidate.correspondenceLines
    .filter((line) => !accessAlternatives.value.some((candidateAccess) =>
      candidateAccess.kind === "connection" && lineMatchesAccess(line, candidateAccess),
    ))
    .map((line) => ({
      line,
      badge: lineBadge(line),
      key: `correspondence:${line.id}`,
    }));
});
const recommendedRouteKey = computed(() => access.value ? feederAccessKey(access.value) : "");
const walkingAlternativeMinutes = computed(() => props.candidate
  ? Math.max(1, Math.ceil(props.candidate.distanceMeters / 80))
  : 0);
const nextFeederWaitMinutes = computed(() => {
  const departure = nextFeederDeparture.value?.departure;
  const timestamp = departureTimestamp(departure);
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.ceil((timestamp - now.value) / 60_000))
    : undefined;
});
const showWalkingAlternative = computed(() => access.value?.kind === "connection" &&
  nextFeederWaitMinutes.value !== undefined &&
  nextFeederWaitMinutes.value <= MAX_FEEDER_WAIT_FOR_WALKING_ALTERNATIVE_MINUTES &&
  walkingAlternativeMinutes.value > 0);
const waitLabel = computed(() => {
  const currentAccess = access.value;
  if (!currentAccess) return t("nearbyStations.heavyAccessUnavailable");
  if (currentAccess.kind === "direct") {
    return t("nearbyStations.heavyGuideWalkingTime", {
      minutes: Math.max(1, Math.ceil(currentAccess.totalSeconds / 60)),
    });
  }
  if (isLoading.value) return t("nearbyStations.scheduleLoading");
  if (hasServiceEndedFeeder.value) return t("nearbyStations.heavyGuideUnavailable");
  if (hasUnavailableFeeder.value) return t("nearbyStations.scheduleUnavailable");
  if (!nextFeederDeparture.value) return t("nearbyStations.noDepartures");
  return formatWait(nextFeederDeparture.value.departure);
});
const connectionText = computed(() => showWalkingAlternative.value
  ? t("nearbyStations.heavyGuideConnectionAlternativeText", {
    target: targetLabel.value,
    feeder: feederLabel.value,
    minutes: waitLabel.value,
    walkingMinutes: walkingAlternativeMinutes.value,
  })
  : t("nearbyStations.heavyGuideConnectionText", {
    target: targetLabel.value,
    feeder: feederLabel.value,
    minutes: waitLabel.value,
  }));
const targetBadge = computed(() => targetLine.value ? lineBadge(targetLine.value) : undefined);

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1_000);
});

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer);
});

function normalizeLineCode(value: string): string {
  return value.trim().toLocaleLowerCase("fr-FR");
}

function feederAccessKey(candidateAccess: NearbyHeavyTransportAccess): string {
  return candidateAccess.kind === "direct"
    ? "direct"
    : `connection:${(candidateAccess.feederLineCode ?? candidateAccess.feederLineId ?? candidateAccess.feederMode ?? "unknown").trim().toLocaleLowerCase("fr-FR")}`;
}

function findFeederLine(candidateAccess: NearbyHeavyTransportAccess): GlobalMapLine | undefined {
  const lineKey = candidateAccess.feederLineId?.trim() || candidateAccess.feederLineCode?.trim();
  if (!lineKey) return undefined;
  return [
    ...props.items.map((item) => item.line),
    ...(props.candidate?.correspondenceLines ?? []),
  ].find((line) => [line.id, line.code, line.label, ...line.aliases]
    .some((value) => lineReferenceVariants(value).some((variant) =>
      lineReferenceVariants(lineKey).includes(variant),
    )));
}

function lineMatchesAccess(line: GlobalMapLine, access: NearbyHeavyTransportAccess): boolean {
  const reference = access.feederLineId?.trim() || access.feederLineCode?.trim();
  if (!reference) return false;
  return [line.id, line.code, line.label, ...line.aliases]
    .some((value) => lineReferenceVariants(value).some((variant) =>
      lineReferenceVariants(reference).includes(variant),
    ));
}

function lineReferenceVariants(value: string): string[] {
  const normalized = normalizeLineCode(value);
  const variants = new Set([normalized]);
  const parenthetical = /\((?:ex(?:\.|\s+)?|anciennement\s+)?([^)]*)\)/giu;
  for (const match of normalized.matchAll(parenthetical)) {
    const alias = match[1]?.trim();
    if (alias) variants.add(alias);
  }
  return [...variants];
}

function feederBadge(candidateAccess: NearbyHeavyTransportAccess): LineConfig | undefined {
  const label = candidateAccess.feederLineCode?.trim() || candidateAccess.feederLineId?.split(":").at(-1)?.trim();
  if (!label) return undefined;
  const family = candidateAccess.feederMode ? globalLineFamily(candidateAccess.feederMode) : undefined;
  return {
    ref: candidateAccess.feederLineId ?? label,
    shortName: label,
    longName: label,
    mode: family ? transitFamilyToMode(family) : "bus",
    color: "#5146ff",
    textColor: "#ffffff",
  };
}

function departureTime(departure?: Departure): string | undefined {
  return departure?.expectedDepartureTime ?? departure?.aimedDepartureTime ?? departure?.expectedArrivalTime;
}

function departureTimestamp(departure?: Departure): number {
  const value = departureTime(departure);
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function formatWait(departure: Departure): string {
  const timestamp = departureTimestamp(departure);
  if (!Number.isFinite(timestamp)) return t("nearbyStations.noDepartures");
  const minutes = Math.max(0, Math.round((timestamp - now.value) / 60_000));
  return minutes === 0 ? t("board.imminent") : `${minutes} min`;
}

function modeLabel(mode: GlobalMapMode): string {
  switch (mode) {
    case "METRO": return t("nearbyStations.modes.metro");
    case "RER": return t("nearbyStations.modes.rer");
    case "TRAIN": return t("nearbyStations.modes.train");
    case "TRANSILIEN": return t("nearbyStations.modes.transilien");
    case "TRAM": return t("nearbyStations.modes.tram");
    case "CABLE": return t("nearbyStations.modes.cable");
    case "NOCTILIEN": return t("nearbyStations.modes.noctilien");
    default: return t("nearbyStations.modes.bus");
  }
}

function globalLineFamily(mode: GlobalMapMode): TransitFamily | undefined {
  if (["METRO", "RER", "BUS", "TRAM", "NOCTILIEN", "TRANSILIEN", "CABLE"].includes(mode)) {
    return mode as TransitFamily;
  }
  if (mode === "TRAIN") return "TRANSILIEN";
  return undefined;
}

function lineBadge(line: GlobalMapLine): LineConfig {
  const family = globalLineFamily(line.mode);
  const presentation = createLinePresentation({
    code: line.code,
    color: line.color,
    family,
    id: line.id,
    longName: line.label,
    mode: family ? transitFamilyToMode(family) : undefined,
    ref: line.sourceLineId ?? line.id,
    shortName: line.label,
    textColor: line.textColor,
  });

  return {
    ref: line.sourceLineId ?? line.id,
    shortName: line.label,
    longName: line.label,
    mode: family ? transitFamilyToMode(family) : "train",
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: line.pictogram ?? presentation.iconUrl,
    iconUrls: presentation.iconUrls,
  };
}
</script>

<template>
  <article
    v-if="candidate && targetLine && access"
    class="nearby-heavy-access-guide"
    aria-live="polite"
    :aria-label="t('nearbyStations.heavyGuideAria', { target: targetLabel })"
  >
    <div class="nearby-heavy-access-guide__topline">
      <span class="nearby-heavy-access-guide__eyebrow">
        <Route :size="14" aria-hidden="true" />
        {{ t("nearbyStations.heavyGuideEyebrow") }}
      </span>
      <LineIconBadge v-if="targetBadge" :line="targetBadge" compact />
    </div>
    <div
      v-if="feederRoutes.length > 0"
      class="nearby-heavy-access-guide__routes"
      :aria-label="t('nearbyStations.heavyGuideRoutesLabel')"
    >
      <span
        v-for="route in feederRoutes"
        :key="route.key"
        class="nearby-heavy-access-guide__route"
        :class="{ 'nearby-heavy-access-guide__route--recommended': route.key === recommendedRouteKey }"
      >
        <LineIconBadge :line="route.badge" compact />
        <span>{{ route.minutes }} min</span>
        <span v-if="route.key === recommendedRouteKey" class="nearby-heavy-access-guide__recommended">
          {{ t("nearbyStations.heavyGuideFastest") }}
        </span>
      </span>
    </div>
    <div
      v-if="correspondenceRoutes.length > 0"
      class="nearby-heavy-access-guide__correspondences"
      :aria-label="t('nearbyStations.heavyGuideCorrespondencesLabel')"
    >
      <span class="nearby-heavy-access-guide__correspondences-label">
        {{ t("nearbyStations.heavyGuideCorrespondencesLabel") }}
      </span>
      <span
        v-for="route in correspondenceRoutes"
        :key="route.key"
        class="nearby-heavy-access-guide__correspondence"
        :title="t('nearbyStations.heavyGuideCorrespondenceTitle', { line: route.line.label || route.line.code })"
      >
        <LineIconBadge :line="route.badge" compact />
      </span>
    </div>
    <p class="nearby-heavy-access-guide__title">
      <template v-if="access.kind === 'connection'">
        {{ connectionText }}
      </template>
      <template v-else>
        {{ t("nearbyStations.heavyGuideWalkingText", { target: targetLabel, time: waitLabel }) }}
      </template>
    </p>
    <p v-if="access.kind === 'connection'" class="nearby-heavy-access-guide__meta">
      <Clock3 :size="14" aria-hidden="true" />
      <span v-if="isLoading">{{ t("nearbyStations.scheduleLoading") }}</span>
      <span v-else-if="hasServiceEndedFeeder">{{ t("nearbyStations.scheduleServiceEnded") }}</span>
      <span v-else-if="hasUnavailableFeeder">{{ t("nearbyStations.scheduleUnavailable") }}</span>
      <span v-else-if="!nextFeederDeparture">{{ t("nearbyStations.noDepartures") }}</span>
      <span v-else>{{ t("nearbyStations.heavyGuideNextDeparture") }}</span>
    </p>
    <p v-else class="nearby-heavy-access-guide__meta">
      <Footprints :size="14" aria-hidden="true" />
      {{ t("nearbyStations.heavyGuideWalkingAccess") }}
    </p>
  </article>
</template>

<style scoped>
.nearby-heavy-access-guide { align-items: start; background: rgba(255, 255, 255, .97); border: 1px solid rgba(81, 70, 255, .18); border-radius: 16px; box-shadow: 0 14px 30px rgba(25, 31, 76, .2), 0 2px 5px rgba(25, 31, 76, .12); display: grid; gap: 7px; left: 16px; max-width: min(350px, calc(100% - 32px)); padding: 13px 15px 12px; pointer-events: none; position: absolute; top: 16px; width: max-content; z-index: 15; }
.nearby-heavy-access-guide__topline { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
.nearby-heavy-access-guide__eyebrow { align-items: center; color: #5146ff; display: inline-flex; font-size: .66rem; font-weight: 900; gap: 5px; letter-spacing: .08em; text-transform: uppercase; }
.nearby-heavy-access-guide__topline :deep(.line-icon-badge) { flex: 0 0 auto; }
.nearby-heavy-access-guide__topline :deep(.line-icon-badge__fallback) { border-radius: 7px; min-height: 29px; min-width: 43px; }
.nearby-heavy-access-guide__topline :deep(.line-icon-badge__label) { font-size: .88rem; padding: 0 7px; }
.nearby-heavy-access-guide__title { color: #18233f; font-size: .86rem; font-weight: 850; line-height: 1.35; margin: 0; max-width: 310px; }
.nearby-heavy-access-guide__routes { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
.nearby-heavy-access-guide__correspondences { align-items: center; display: flex; flex-wrap: wrap; gap: 5px; }
.nearby-heavy-access-guide__correspondences-label { color: #64708d; font-size: .64rem; font-weight: 850; margin-right: 2px; }
.nearby-heavy-access-guide__correspondence { align-items: center; display: inline-flex; }
.nearby-heavy-access-guide__route { align-items: center; background: rgba(81, 70, 255, .06); border: 1px solid rgba(81, 70, 255, .12); border-radius: 9px; color: #394463; display: inline-flex; font-size: .67rem; font-weight: 850; gap: 4px; padding: 2px 6px 2px 3px; }
.nearby-heavy-access-guide__route--recommended { border-color: rgba(81, 70, 255, .42); box-shadow: 0 0 0 1px rgba(81, 70, 255, .08); }
.nearby-heavy-access-guide__route :deep(.line-icon-badge) { height: 24px; min-width: 30px; }
.nearby-heavy-access-guide__route :deep(.line-icon-badge--compact) { height: 24px; }
.nearby-heavy-access-guide__route :deep(.line-icon-badge__fallback) { height: 24px; }
.nearby-heavy-access-guide__route :deep(.line-icon-badge__label) { font-size: .72rem; min-width: 28px; padding: 0 5px; }
.nearby-heavy-access-guide__recommended { color: #5146ff; font-size: .59rem; font-weight: 950; }
.nearby-heavy-access-guide__meta { align-items: center; color: #64708d; display: inline-flex; font-size: .7rem; font-weight: 750; gap: 5px; margin: 0; }
.nearby-heavy-access-guide__meta svg { color: #5146ff; flex: 0 0 auto; }
@media (max-width: 680px) { .nearby-heavy-access-guide { left: 10px; max-width: calc(100% - 20px); top: 10px; } .nearby-heavy-access-guide__title { font-size: .78rem; } }
</style>
