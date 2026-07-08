<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ChevronDown, Info, RefreshCw, TrafficCone } from "lucide-vue-next";
import { useRoute } from "#imports";
import LineIconBadge from "../../components/LineIconBadge.vue";
import MaterialCombobox from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import TrafficDisruptionCard from "./TrafficDisruptionCard.vue";
import {
  trafficInfoDesignOptions,
  useAppSettings,
  type TrafficInfoDesign,
} from "../app-settings";
import { getActiveTrafficLines } from "./activeTrafficLines";
import {
  fetchTransitFamilyOptions,
  searchTransitLines,
} from "../../services/idfm";
import {
  createLinePresentation,
  transitFamilyToMode,
} from "../../services/linePresentation";
import { toServerApiUrl } from "../../services/serverApi";
import {
  getCurrentTrafficDisruptions,
  getUpcomingTrafficDisruptions,
  type TrafficTimingTab,
} from "./trafficTiming";
import {
  getTrafficAlertPresentation,
  type TrafficAlertPresentation,
} from "./trafficPresentation";
import type { LineSearchOption, TransitFamily } from "../../types/transit";
import type {
  ActiveTrafficLine,
  TrafficDisruption,
  TrafficLineReport,
  TrafficLineStatus,
  TrafficResponse,
} from "./types";

type TrafficLineSymbol = TrafficAlertPresentation["symbol"] | "roadwork" | "";

const activeLines = ref<ActiveTrafficLine[]>([]);
const allTrafficLines = ref<ActiveTrafficLine[]>([]);
const reports = ref<TrafficLineReport[]>([]);
const generatedAt = ref("");
const loading = ref(false);
const loadingAllLines = ref(false);
const errorMessage = ref("");
const allLinesError = ref("");
const configured = ref(true);
const expandedLineRefs = ref(new Set<string>());
const selectedTimingTabs = ref<Record<string, TrafficTimingTab>>({});
const allLinesMode = ref(false);
const scopeBurstKey = ref(0);
const scopeBurstKind = ref<"optimized" | "all">("optimized");
const { settings, updateSettings } = useAppSettings();
const route = useRoute();
const { d, t } = useI18n();

const reportByLineRef = computed(
  () => new Map(reports.value.map((report) => [report.lineRef, report])),
);
const isRatpDesign = computed(
  () => settings.value.trafficInfoDesign === "ratp",
);
const displayedLines = computed(() =>
  allLinesMode.value ? allTrafficLines.value : activeLines.value,
);
const groupedLines = computed(() => {
  const groups = new Map<string, ActiveTrafficLine[]>();

  displayedLines.value.forEach((line) => {
    const key = getFamilyLabel(line);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  });

  return Array.from(groups.entries())
    .map(([label, lines]) => ({
      label,
      lines,
    }))
    .sort(
      (left, right) =>
        getFamilyOrder(left.label) - getFamilyOrder(right.label) ||
        left.label.localeCompare(right.label),
    );
});
const informationTime = computed(() => {
  const date = generatedAt.value ? new Date(generatedAt.value) : new Date();

  return Number.isNaN(date.getTime())
    ? "--:--"
    : d(date, {
        hour: "2-digit",
        minute: "2-digit",
      });
});
const disruptedLineCount = computed(
  () =>
    reports.value.filter((report) =>
      ["disrupted", "planned", "information"].includes(report.status),
    ).length,
);
const firstTrafficDisruption = computed(
  () => reports.value.flatMap((report) => report.disruptions)[0] ?? undefined,
);
const trafficInfoDesignLocalizedOptions = computed(() =>
  trafficInfoDesignOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "ratp"
        ? t("settings.options.trafficDesign.ratp")
        : t("settings.options.trafficDesign.cards"),
  })),
);

onMounted(() => {
  activeLines.value = getActiveTrafficLines(getRoutePlaceId());
  allLinesMode.value = settings.value.trafficInfoDefaultScope === "all";
  void initializeTrafficPage();
});

function getRoutePlaceId(): string | undefined {
  const value = route.query.place;
  const placeId = Array.isArray(value) ? value[0] : value;

  return typeof placeId === "string" ? placeId : undefined;
}

async function initializeTrafficPage(): Promise<void> {
  if (allLinesMode.value) {
    const isLoaded = await ensureAllTrafficLinesLoaded();

    if (!isLoaded) {
      return;
    }
  }

  await loadTraffic();
}

async function loadTraffic(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";

  try {
    if (displayedLines.value.length === 0) {
      reports.value = [];
      generatedAt.value = new Date().toISOString();
      return;
    }

    const params = new URLSearchParams({
      lineRefs: displayedLines.value
        .map((line) => line.navitiaLineRef)
        .join(","),
    });
    const response = await fetch(toServerApiUrl(`/api/traffic?${params}`));

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as TrafficResponse;
    reports.value = payload.lines;
    generatedAt.value = payload.generatedAt;
    configured.value = payload.configured;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : t("traffic.loadFailed");
  } finally {
    loading.value = false;
  }
}

async function toggleAllLinesMode(): Promise<void> {
  const nextMode = !allLinesMode.value;

  allLinesError.value = "";

  if (nextMode) {
    const isLoaded = await ensureAllTrafficLinesLoaded();

    if (!isLoaded) {
      return;
    }
  }

  allLinesMode.value = nextMode;
  triggerScopeBurst(nextMode);

  expandedLineRefs.value = new Set();
  selectedTimingTabs.value = {};
  void loadTraffic();
}

function triggerScopeBurst(nextMode: boolean): void {
  scopeBurstKind.value = nextMode ? "all" : "optimized";
  scopeBurstKey.value += 1;
}

async function ensureAllTrafficLinesLoaded(): Promise<boolean> {
  if (allTrafficLines.value.length > 0) {
    return true;
  }

  loadingAllLines.value = true;

  try {
    allTrafficLines.value = await loadAllTrafficLines();
    return true;
  } catch (error) {
    allLinesError.value =
      error instanceof Error
        ? error.message
        : t("traffic.allLinesLoadFailed");
    return false;
  } finally {
    loadingAllLines.value = false;
  }
}

async function loadAllTrafficLines(): Promise<ActiveTrafficLine[]> {
  const families = await fetchTransitFamilyOptions();
  const railwayFamilies = families.filter((family) =>
    isTrafficFamilySupported(family.family),
  );
  const linesByRef = new Map<string, ActiveTrafficLine>();

  const groups = await Promise.all(
    railwayFamilies.map(async (family) => {
      const lines = await searchTransitLines(family, "");

      return lines.map((line) => createActiveLineFromSearchOption(line));
    }),
  );

  groups.flat().forEach((line) => {
    linesByRef.set(line.navitiaLineRef, line);
  });

  return Array.from(linesByRef.values()).sort(compareTrafficLines);
}

function createActiveLineFromSearchOption(
  line: LineSearchOption,
): ActiveTrafficLine {
  const mode = transitFamilyToMode(line.family);
  const presentation = createLinePresentation({
    family: line.family,
    id: line.navitiaId,
    mode,
    ref: line.ref,
    shortName: line.label,
  });

  return {
    boardIds: [],
    boardTitles: [],
    family: line.family,
    line: {
      ref: line.ref || line.navitiaId,
      shortName: line.label,
      longName:
        line.displayName ??
        `${formatFamilyDisplayName(line.family)} ${line.label}`,
      mode,
      color: line.color ?? presentation.color,
      textColor: line.textColor ?? presentation.textColor,
      iconUrl: line.iconUrl ?? presentation.iconUrl,
      iconUrls: line.iconUrls ?? presentation.iconUrls,
    },
    navitiaLineRef: line.navitiaId,
  };
}

function getLineReport(line: ActiveTrafficLine): TrafficLineReport {
  return (
    reportByLineRef.value.get(line.navitiaLineRef) ?? {
      lineRef: line.navitiaLineRef,
      status: loading.value ? "unknown" : "normal",
      disruptions: [],
    }
  );
}

function toggleLine(lineRef: string): void {
  if (expandedLineRefs.value.has(lineRef)) {
    expandedLineRefs.value = new Set();
    return;
  }

  expandedLineRefs.value = new Set([lineRef]);
}

function selectTimingTab(lineRef: string, tab: TrafficTimingTab): void {
  selectedTimingTabs.value = {
    ...selectedTimingTabs.value,
    [lineRef]: tab,
  };
}

function getSelectedTimingTab(lineRef: string): TrafficTimingTab {
  return selectedTimingTabs.value[lineRef] ?? "current";
}

function getVisibleDisruptions(report: TrafficLineReport): TrafficDisruption[] {
  return getSelectedTimingTab(report.lineRef) === "upcoming"
    ? getUpcomingDisruptions(report)
    : getCurrentDisruptions(report);
}

function getCurrentDisruptions(report: TrafficLineReport): TrafficDisruption[] {
  return getCurrentTrafficDisruptions(report.disruptions);
}

function getUpcomingDisruptions(
  report: TrafficLineReport,
): TrafficDisruption[] {
  return getUpcomingTrafficDisruptions(report.disruptions);
}

function updateTrafficInfoDesign(value: string): void {
  updateSettings({ trafficInfoDesign: value as TrafficInfoDesign });
}

function getFamilyLabel(line: ActiveTrafficLine): string {
  if (line.family === "RER") return "RER";
  if (line.family === "TRAM") return t("traffic.family.tram");
  if (line.family === "TRANSILIEN") return t("traffic.family.train");
  if (line.family === "METRO") return t("traffic.family.metro");

  return t("traffic.family.other");
}

function getFamilyOrder(label: string): number {
  const order: Record<string, number> = {
    [t("traffic.family.rer")]: 0,
    [t("traffic.family.metro")]: 1,
    [t("traffic.family.tram")]: 2,
    [t("traffic.family.train")]: 3,
    [t("traffic.family.other")]: 4,
  };

  return order[label] ?? 99;
}

function isTrafficFamilySupported(family: TransitFamily): boolean {
  return ["METRO", "RER", "TRANSILIEN", "TRAM", "CABLE"].includes(family);
}

function formatFamilyDisplayName(family: TransitFamily): string {
  if (family === "METRO") return t("traffic.family.metro");
  if (family === "TRAM") return t("traffic.family.tram");
  if (family === "RER") return t("traffic.family.rer");
  if (family === "CABLE") return t("traffic.family.cable");

  return t("traffic.family.train");
}

function formatGroupLineCount(count: number): string {
  return count === 1
    ? t("traffic.groupLineOne", { count })
    : t("traffic.groupLineOther", { count });
}

function compareTrafficLines(
  left: ActiveTrafficLine,
  right: ActiveTrafficLine,
): number {
  const familyDelta =
    getFamilyOrder(getFamilyLabel(left)) -
    getFamilyOrder(getFamilyLabel(right));

  if (familyDelta !== 0) {
    return familyDelta;
  }

  return compareLineLabels(left.line.shortName, right.line.shortName);
}

function compareLineLabels(left: string, right: string): number {
  const leftParts = splitLineLabel(left);
  const rightParts = splitLineLabel(right);
  const prefixDelta = leftParts.prefix.localeCompare(rightParts.prefix);

  if (prefixDelta !== 0) {
    return prefixDelta;
  }

  if (leftParts.number !== rightParts.number) {
    return leftParts.number - rightParts.number;
  }

  return left.localeCompare(right, "fr", { numeric: true });
}

function splitLineLabel(label: string): { prefix: string; number: number } {
  const match = label.match(/^([A-Za-z]*)(\d+)/u);

  return {
    prefix: match?.[1] ?? label,
    number: match ? Number.parseInt(match[2], 10) : Number.MAX_SAFE_INTEGER,
  };
}

function getStatusLabel(status: TrafficLineStatus): string {
  return {
    normal: t("traffic.normal"),
    information: t("traffic.information"),
    planned: t("traffic.planned"),
    disrupted: t("traffic.disrupted"),
    unknown: t("traffic.unknown"),
    error: t("traffic.error"),
  }[status];
}

function getLineStatusLabel(report: TrafficLineReport): string {
  return hasOnlyUpcomingDisruptions(report)
    ? t("traffic.upcomingRoadwork")
    : getStatusLabel(report.status);
}

function getLineDisplayStatus(report: TrafficLineReport): TrafficLineStatus {
  return hasOnlyUpcomingDisruptions(report) ? "normal" : report.status;
}

function getLineStatusSymbol(report: TrafficLineReport): TrafficLineSymbol {
  const currentAlert = getCurrentTrafficAlert(report);

  if (currentAlert) {
    return currentAlert.symbol;
  }

  if (hasOnlyUpcomingDisruptions(report)) {
    return "roadwork";
  }

  const status = report.status;

  if (status === "disrupted" || status === "error") {
    return "x";
  }

  if (status === "planned" || status === "information") {
    return "!";
  }

  return "";
}

function hasOnlyUpcomingDisruptions(report: TrafficLineReport): boolean {
  return (
    getCurrentDisruptions(report).length === 0 &&
    getUpcomingDisruptions(report).length > 0
  );
}

function getExpandedLines(lines: ActiveTrafficLine[]): ActiveTrafficLine[] {
  return lines.filter((line) =>
    expandedLineRefs.value.has(line.navitiaLineRef),
  );
}

function getCurrentTrafficAlert(
  report: TrafficLineReport,
): TrafficAlertPresentation | undefined {
  return getTrafficAlertPresentation(getCurrentDisruptions(report));
}

function getLineToneClass(
  report: TrafficLineReport,
  classPrefix: "traffic-ratp-line" | "traffic-line-card",
): string | undefined {
  const currentAlert = getCurrentTrafficAlert(report);

  return currentAlert
    ? `${classPrefix}--tone-${currentAlert.tone}`
    : undefined;
}

</script>

<template>
  <main class="traffic-page" :class="{ 'traffic-page--ratp': isRatpDesign }">
    <template v-if="isRatpDesign">
      <section class="traffic-ratp-panel">
        <header class="traffic-ratp-heading">
          <div class="traffic-ratp-heading__title">
            <button
              class="traffic-ratp-refresh"
              type="button"
              @click="loadTraffic"
            >
              <RefreshCw
                :class="{ 'traffic-refresh__icon--spinning': loading }"
              />
              <span class="sr-only">{{ t("traffic.refreshSr") }}</span>
            </button>
            <h1>{{ t("traffic.headingAt", { time: informationTime }) }}</h1>
          </div>

          <div class="traffic-toolbar-controls">
            <button
              class="traffic-scope-toggle"
              type="button"
              :aria-pressed="allLinesMode"
              :disabled="loadingAllLines"
              @click="toggleAllLinesMode"
            >
              <span>{{ t("traffic.mode") }}</span>
              <strong>{{
                loadingAllLines
                  ? t("traffic.loading")
                  : allLinesMode
                    ? t("traffic.allLines")
                    : t("traffic.optimized")
              }}</strong>

              <Transition name="traffic-scope-burst">
                <span
                  v-if="scopeBurstKey > 0"
                  :key="scopeBurstKey"
                  class="traffic-scope-toggle__burst"
                  aria-hidden="true"
                >
                  {{ scopeBurstKind === "all" ? "＋" : "✓" }}
                </span>
              </Transition>
            </button>

            <div class="traffic-style-control">
              <span>{{ t("traffic.style") }}</span>
              <MaterialCombobox
                :model-value="settings.trafficInfoDesign"
                :options="trafficInfoDesignLocalizedOptions"
                :aria-label="t('traffic.styleAria')"
                @update:model-value="updateTrafficInfoDesign"
              />
            </div>
          </div>
        </header>

        <section v-if="errorMessage" class="traffic-state traffic-state--error">
          {{ errorMessage }}
        </section>

        <section
          v-else-if="allLinesError"
          class="traffic-state traffic-state--error"
        >
          {{ allLinesError }}
        </section>

        <section v-else-if="displayedLines.length === 0" class="traffic-state">
          {{ t("traffic.noActiveRail") }}
        </section>

        <section
          v-else
          class="traffic-ratp-groups"
          :aria-label="t('traffic.compactAria')"
        >
          <article
            v-for="group in groupedLines"
            :key="group.label"
            class="traffic-ratp-row"
          >
            <div class="traffic-ratp-family" aria-hidden="true">
              <span>{{ group.label }}</span>
            </div>

            <TransitionGroup
              name="traffic-line-pop"
              tag="div"
              class="traffic-ratp-lines"
            >
              <button
                v-for="line in group.lines"
                :key="line.navitiaLineRef"
                class="traffic-ratp-line"
                :class="[
                  `traffic-ratp-line--${getLineDisplayStatus(getLineReport(line))}`,
                  getLineToneClass(getLineReport(line), 'traffic-ratp-line'),
                ]"
                type="button"
                :aria-label="`${line.line.longName}: ${getLineStatusLabel(getLineReport(line))}`"
                @click="toggleLine(line.navitiaLineRef)"
              >
                <LineIconBadge :line="line.line" compact />
                <span
                  v-if="getLineStatusSymbol(getLineReport(line))"
                  class="traffic-ratp-line__status"
                  :class="{
                    'traffic-ratp-line__status--roadwork':
                      getLineStatusSymbol(getLineReport(line)) === 'roadwork',
                  }"
                >
                  <TrafficCone
                    :size="18"
                    v-if="
                      getLineStatusSymbol(getLineReport(line)) === 'roadwork'
                    "
                    fill="white"
                    aria-hidden="true"
                  />
                  <template v-else>
                    {{ getLineStatusSymbol(getLineReport(line)) }}
                  </template>
                </span>
              </button>
            </TransitionGroup>

            <div class="traffic-ratp-row-details">
              <article
                v-for="line in getExpandedLines(group.lines)"
                :key="line.navitiaLineRef"
                class="traffic-ratp-detail"
              >
                <header>
                  <LineIconBadge :line="line.line" compact />
                  <div>
                    <strong>{{ line.line.longName }}</strong>
                    <span>{{ getLineStatusLabel(getLineReport(line)) }}</span>
                  </div>
                </header>
                <p
                  v-if="getLineReport(line).error"
                  class="traffic-details__error"
                >
                  {{ getLineReport(line).error }}
                </p>
                <p
                  v-else-if="getLineReport(line).disruptions.length === 0"
                  class="traffic-details__normal"
                >
                  {{ t("traffic.noDisruption") }}
                </p>
                <template v-else>
                  <div class="traffic-timing-tabs" role="tablist">
                    <button
                      type="button"
                      :class="{
                        'traffic-timing-tabs__button--active':
                          getSelectedTimingTab(line.navitiaLineRef) ===
                          'current',
                      }"
                      @click="selectTimingTab(line.navitiaLineRef, 'current')"
                    >
                      {{ t("traffic.current") }}
                      <span>{{
                        getCurrentDisruptions(getLineReport(line)).length
                      }}</span>
                    </button>
                    <button
                      type="button"
                      :class="{
                        'traffic-timing-tabs__button--active':
                          getSelectedTimingTab(line.navitiaLineRef) ===
                          'upcoming',
                      }"
                      @click="selectTimingTab(line.navitiaLineRef, 'upcoming')"
                    >
                      {{ t("traffic.upcoming") }}
                      <span>{{
                        getUpcomingDisruptions(getLineReport(line)).length
                      }}</span>
                    </button>
                  </div>
                  <p
                    v-if="
                      getVisibleDisruptions(getLineReport(line)).length === 0
                    "
                    class="traffic-details__normal"
                  >
                    {{ t("traffic.emptyCategory") }}
                  </p>
                  <TrafficDisruptionCard
                    v-for="disruption in getVisibleDisruptions(
                      getLineReport(line),
                    )"
                    :key="disruption.id"
                    :disruption="disruption"
                    compact
                    :show-header="false"
                  />
                </template>
              </article>
            </div>
          </article>

          <div class="traffic-ratp-row traffic-ratp-row--bus">
            <div class="traffic-ratp-family" aria-hidden="true">
              <span>BUS</span>
            </div>
            <p>{{ t("traffic.noBus") }}</p>
          </div>
        </section>
      </section>
    </template>

    <template v-else>
      <header class="traffic-hero">
        <div>
          <p class="eyebrow">{{ t("traffic.cardsEyebrow") }}</p>
          <h1>{{ t("traffic.cardsHeadingAt", { time: informationTime }) }}</h1>
          <p>{{ t("traffic.cardsBody") }}</p>
        </div>

        <div class="traffic-hero__actions">
          <button
            class="traffic-scope-toggle traffic-scope-toggle--cards"
            type="button"
            :aria-pressed="allLinesMode"
            :disabled="loadingAllLines"
            @click="toggleAllLinesMode"
          >
            <span>{{ t("traffic.mode") }}</span>
            <strong>{{
              loadingAllLines
                ? t("traffic.loading")
                : allLinesMode
                  ? t("traffic.allLines")
                  : t("traffic.optimized")
            }}</strong>

            <Transition name="traffic-scope-burst">
              <span
                v-if="scopeBurstKey > 0"
                :key="scopeBurstKey"
                class="traffic-scope-toggle__burst"
                aria-hidden="true"
              >
                {{ scopeBurstKind === "all" ? "＋" : "✓" }}
              </span>
            </Transition>
          </button>

          <div class="traffic-style-control traffic-style-control--cards">
            <span>{{ t("traffic.style") }}</span>
            <MaterialCombobox
              :model-value="settings.trafficInfoDesign"
              :options="trafficInfoDesignLocalizedOptions"
              :aria-label="t('traffic.styleAria')"
              @update:model-value="updateTrafficInfoDesign"
            />
          </div>

          <button class="traffic-refresh" type="button" @click="loadTraffic">
            <RefreshCw
              :class="{ 'traffic-refresh__icon--spinning': loading }"
            />
            <span>{{ t("common.actions.refresh") }}</span>
          </button>
        </div>
      </header>

      <section class="traffic-summary" aria-live="polite">
        <strong>{{ disruptedLineCount }}</strong>
        <span>
          {{
            disruptedLineCount > 1
              ? t("traffic.summaryOther", { count: disruptedLineCount })
              : t("traffic.summaryOne", { count: disruptedLineCount })
          }}
        </span>
        <small v-if="!configured">{{ t("traffic.missingServerKey") }}</small>
        <small v-else>{{ t("traffic.source") }}</small>
      </section>

      <section v-if="errorMessage" class="traffic-state traffic-state--error">
        {{ errorMessage }}
      </section>

      <section
        v-else-if="allLinesError"
        class="traffic-state traffic-state--error"
      >
        {{ allLinesError }}
      </section>

      <section v-else-if="displayedLines.length === 0" class="traffic-state">
        {{ t("traffic.noActiveRail") }}
      </section>

      <section
        v-else
        class="traffic-groups"
        :aria-label="t('traffic.cardsAria')"
      >
        <article
          v-for="group in groupedLines"
          :key="group.label"
          class="traffic-group"
        >
          <header>
            <h2>{{ group.label }}</h2>
            <span>{{ formatGroupLineCount(group.lines.length) }}</span>
          </header>

          <TransitionGroup
            name="traffic-card-pop"
            tag="div"
            class="traffic-line-grid"
          >
            <article
              v-for="line in group.lines"
              :key="line.navitiaLineRef"
              class="traffic-line-card"
              :class="[
                `traffic-line-card--${getLineDisplayStatus(getLineReport(line))}`,
                getLineToneClass(getLineReport(line), 'traffic-line-card'),
              ]"
            >
              <button type="button" @click="toggleLine(line.navitiaLineRef)">
                <LineIconBadge :line="line.line" compact />
                <span class="traffic-line-card__text">
                  <strong>{{ line.line.longName }}</strong>
                  <small>{{ line.boardTitles.join(", ") }}</small>
                </span>
                <span class="traffic-line-card__status">
                  {{ getLineStatusLabel(getLineReport(line)) }}
                </span>
              </button>

              <Transition name="traffic-expand">
                <div
                  v-if="expandedLineRefs.has(line.navitiaLineRef)"
                  class="traffic-details"
                >
                  <p
                    v-if="getLineReport(line).error"
                    class="traffic-details__error"
                  >
                    {{ getLineReport(line).error }}
                  </p>
                  <p
                    v-else-if="getLineReport(line).disruptions.length === 0"
                    class="traffic-details__normal"
                  >
                    {{ t("traffic.noDisruption") }}
                  </p>
                  <template v-else>
                    <div class="traffic-timing-tabs" role="tablist">
                      <button
                        type="button"
                        :class="{
                          'traffic-timing-tabs__button--active':
                            getSelectedTimingTab(line.navitiaLineRef) ===
                            'current',
                        }"
                        @click="selectTimingTab(line.navitiaLineRef, 'current')"
                      >
                        {{ t("traffic.current") }}
                        <span>{{
                          getCurrentDisruptions(getLineReport(line)).length
                        }}</span>
                      </button>
                      <button
                        type="button"
                        :class="{
                          'traffic-timing-tabs__button--active':
                            getSelectedTimingTab(line.navitiaLineRef) ===
                            'upcoming',
                        }"
                        @click="
                          selectTimingTab(line.navitiaLineRef, 'upcoming')
                        "
                      >
                        {{ t("traffic.upcoming") }}
                        <span>{{
                          getUpcomingDisruptions(getLineReport(line)).length
                        }}</span>
                      </button>
                    </div>
                    <p
                      v-if="
                        getVisibleDisruptions(getLineReport(line)).length === 0
                      "
                      class="traffic-details__normal"
                    >
                      {{ t("traffic.emptyCategory") }}
                    </p>
                    <TrafficDisruptionCard
                      v-for="disruption in getVisibleDisruptions(
                        getLineReport(line),
                      )"
                      :key="disruption.id"
                      :disruption="disruption"
                      :status-label="getStatusLabel(getLineReport(line).status)"
                    />
                  </template>
                </div>
              </Transition>
            </article>
          </TransitionGroup>
        </article>
      </section>
    </template>
  </main>
</template>

<style scoped>
.traffic-page {
  color: var(--ink);
  margin: 0 auto;
  max-width: 1180px;
  min-height: 100vh;
  padding: 42px 22px 112px;
}

.traffic-page--ratp {
  max-width: 1580px;
  padding-top: 32px;
}

.traffic-ratp-alert {
  align-items: flex-start;
  background: #e6eefc;
  border-radius: 5px;
  color: #333333;
  display: flex;
  gap: 14px;
  margin-bottom: 64px;
  padding: 20px;
}

.traffic-ratp-alert > svg {
  color: #332f9f;
  flex: 0 0 auto;
  height: 28px;
  width: 28px;
}

.traffic-ratp-alert strong {
  display: block;
  font-size: 1.18rem;
  font-weight: 900;
  letter-spacing: 0;
}

.traffic-ratp-alert button {
  align-items: center;
  background: transparent;
  color: #332f9f;
  display: inline-flex;
  font-size: 1.16rem;
  font-weight: 920;
  gap: 6px;
  margin-top: 18px;
  padding: 0;
}

.traffic-ratp-alert button:hover {
  transform: none;
}

.traffic-ratp-alert button svg {
  height: 21px;
  width: 21px;
}

.traffic-ratp-panel {
  padding: 20px;
  border-radius: 20px;
  background: #ffffff;
  color: #333333;
}

.traffic-ratp-heading {
  align-items: center;
  display: flex;
  gap: 24px;
  justify-content: space-between;
  margin-bottom: 18px;
}

.traffic-ratp-heading__title {
  align-items: center;
  display: flex;
  gap: 24px;
  min-width: 0;
}

.traffic-ratp-heading h1 {
  color: #333333;
  font-size: clamp(1.65rem, 3vw, 2.15rem);
  font-weight: 920;
  letter-spacing: 0;
  margin: 0;
}

.traffic-toolbar-controls {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
}

.traffic-scope-toggle {
  align-items: center;
  background: #ffffff;
  border: 1px solid #e3e5ec;
  border-radius: 999px;
  color: var(--ink);
  display: inline-flex;
  flex: 0 0 auto;
  gap: 9px;
  min-height: 40px;
  overflow: visible;
  padding: 0 13px;
  position: relative;
}

.traffic-scope-toggle .traffic-scope-toggle__burst {
  align-items: center;
  background: rgba(17, 24, 39, 0.92);
  border-radius: 999px;
  color: #ffffff;
  display: inline-flex;
  font-size: 1.45rem;
  font-weight: 950;
  height: 42px;
  justify-content: center;
  left: 50%;
  letter-spacing: 0;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  text-transform: none;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.35);
  width: 42px;
  z-index: 10;
}

.traffic-scope-burst-enter-active {
  animation: traffic-scope-burst 720ms ease-in forwards;
}

.traffic-scope-burst-leave-active {
  display: none;
}

.traffic-scope-toggle:hover:not(:disabled) {
  border-color: #332f9f;
  transform: none;
}

.traffic-scope-toggle[aria-pressed="true"] {
  background: #111827;
  border-color: #111827;
  color: #ffffff;
}

.traffic-scope-toggle:disabled {
  cursor: progress;
  opacity: 0.7;
}

.traffic-scope-toggle span {
  color: inherit;
  font-size: 0.72rem;
  font-weight: 950;
  letter-spacing: 0.04em;
  opacity: 0.72;
  text-transform: uppercase;
}

.traffic-scope-toggle strong {
  font-size: 0.92rem;
  font-weight: 950;
  white-space: nowrap;
}

.traffic-scope-toggle--cards {
  min-height: 46px;
}

.traffic-style-control {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
}

.traffic-style-control > span {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 950;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.traffic-style-control :deep(.material-combobox) {
  min-width: 220px;
}

.traffic-style-control :deep(.material-combobox__trigger) {
  background: #ffffff;
  min-height: 40px;
}

.traffic-style-control :deep(.material-combobox__value) {
  font-size: 0.95rem;
}

.traffic-ratp-refresh {
  align-items: center;
  background: #ffffff;
  border: 1px solid #e3e5ec;
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(16, 35, 63, 0.04);
  color: #c7cbd5;
  display: inline-flex;
  height: 54px;
  justify-content: center;
  padding: 0;
  width: 54px;
}

.traffic-ratp-refresh:hover {
  color: #332f9f;
  transform: none;
}

.traffic-ratp-refresh svg {
  height: 27px;
  width: 27px;
}

.traffic-ratp-groups {
  display: grid;
  gap: 13px;
}

.traffic-ratp-row {
  align-items: start;
  display: grid;
  gap: 18px;
  grid-template-columns: 52px minmax(0, 1fr);
}

.traffic-ratp-family {
  align-items: center;
  color: #22008d;
  display: flex;
  font-weight: 950;
  justify-content: center;
  min-height: 46px;
  text-align: center;
}

.traffic-ratp-family span {
  border-bottom: 3px solid currentColor;
  border-top: 3px solid currentColor;
  display: inline-flex;
  line-height: 1;
  padding: 5px 0;
}

.traffic-ratp-lines {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 9px;
  min-height: 46px;
  position: relative;
}

.traffic-ratp-line {
  align-items: center;
  background: #ffffff;
  border: 2px solid #3ca70d;
  border-radius: 7px;
  display: inline-flex;
  height: 48px;
  justify-content: center;
  padding: 3px;
  position: relative;
  transform: none;
  width: 48px;
}

.traffic-ratp-line:hover,
.traffic-ratp-line:focus-visible {
  background: #ffffff !important;
  box-shadow: 0 0 0 3px rgba(51, 47, 159, 0.12);
  transform: none;
}

.traffic-ratp-line--planned,
.traffic-ratp-line--information {
  border-color: #d49400;
}

.traffic-ratp-line--disrupted,
.traffic-ratp-line--error {
  border-color: #e63214;
  &:hover {
    background: #e63214;
  }
}

.traffic-ratp-line--tone-orange {
  border-color: #f59e0b;
  &:hover {
    background: #f59e0b;
  }
}

.traffic-ratp-line--tone-red {
  border-color: #e63214;
}

.traffic-ratp-line--unknown {
  border-color: #c8ceda;
}

.traffic-ratp-line :deep(.line-icon-badge) {
  height: 36px;
  justify-content: center;
  min-width: 36px;
}

.traffic-ratp-line :deep(.line-icon-badge img) {
  max-height: 36px;
  max-width: 42px;
}

.traffic-ratp-line :deep(.line-icon-badge__fallback) {
  border: 0;
  height: 34px;
}

.traffic-ratp-line :deep(.line-icon-badge__label) {
  font-size: 1.05rem;
  min-width: 34px;
  padding: 0 6px;
}

.traffic-ratp-line__status {
  align-items: center;
  background: #e63214;
  border-radius: 999px;
  bottom: -5px;
  color: #ffffff;
  font-size: 1rem;
  font-weight: bold;
  line-height: 14px;
  height: 18px;
  text-align: center;
  justify-content: center;
  position: absolute;
  right: -5px;
  width: 18px;
}

.traffic-ratp-line__status--roadwork {
  background: transparent;
  border: 0;
  bottom: -4px;
  box-shadow: none;
  color: #8b8f99;
  height: 18px;
  right: -6px;
  width: 18px;
}

.traffic-ratp-line__status--roadwork svg {
  height: 23px;
  stroke-width: 2.5;
  width: 23px;
}

.traffic-ratp-line--planned .traffic-ratp-line__status,
.traffic-ratp-line--information .traffic-ratp-line__status {
  background: #f7b500;
  color: #ffffff;
}

.traffic-ratp-line--tone-orange .traffic-ratp-line__status {
  background: #f59e0b;
}

.traffic-ratp-line--tone-red .traffic-ratp-line__status {
  background: #e63214;
}

.traffic-ratp-row-details {
  display: grid;
  gap: 10px;
  grid-column: 2;
  margin-top: -6px;
}

.traffic-ratp-detail {
  background: #ffffff;
  border: 1px solid #e2e6ef;
  border-radius: 7px;
  box-shadow: 0 10px 28px rgba(16, 35, 63, 0.08);
  display: grid;
  gap: 10px;
  max-width: 760px;
  padding: 12px;
}

.traffic-ratp-detail > header {
  align-items: center;
  display: flex;
  gap: 10px;
}

.traffic-ratp-detail > header strong {
  color: var(--ink);
  display: block;
  font-size: 1rem;
  font-weight: 950;
}

.traffic-ratp-detail > header span {
  color: var(--muted);
  display: block;
  font-size: 0.8rem;
  font-weight: 850;
  text-transform: uppercase;
}

.traffic-disruption--compact {
  background: #f8f9fc;
  box-shadow: none;
}

.traffic-ratp-row--bus {
  align-items: center;
}

.traffic-ratp-row--bus p {
  color: #333333;
  font-size: 1.25rem;
  font-weight: 500;
  margin: 0;
}

.sr-only {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

.traffic-hero {
  align-items: flex-start;
  display: flex;
  gap: 18px;
  justify-content: space-between;
  margin-bottom: 20px;
}

.traffic-hero__actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
}

.traffic-hero h1 {
  font-size: clamp(2rem, 4vw, 3.6rem);
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
}

.traffic-hero p:last-child {
  color: var(--muted);
  font-size: 1.05rem;
  font-weight: 720;
  line-height: 1.5;
  max-width: 760px;
}

.eyebrow {
  color: #5136ff;
  font-size: 0.78rem;
  font-weight: 950;
  letter-spacing: 0.04em;
  margin: 0 0 8px;
  text-transform: uppercase;
}

.traffic-refresh {
  align-items: center;
  background: #111827;
  border: 0;
  border-radius: 999px;
  color: #ffffff;
  display: inline-flex;
  flex: 0 0 auto;
  font-weight: 950;
  gap: 9px;
  min-height: 46px;
  padding: 0 18px;
}

.traffic-refresh svg {
  height: 18px;
  width: 18px;
}

.traffic-refresh__icon--spinning {
  animation: traffic-spin 900ms linear infinite;
}

.traffic-summary {
  align-items: center;
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(16, 35, 63, 0.08);
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
  padding: 16px 18px;
}

.traffic-summary strong {
  align-items: center;
  background: #eef3fb;
  border-radius: 999px;
  display: inline-flex;
  font-size: 1.25rem;
  height: 40px;
  justify-content: center;
  width: 40px;
}

.traffic-summary span {
  font-weight: 950;
}

.traffic-summary small {
  color: var(--muted);
  font-weight: 800;
  margin-left: auto;
}

.traffic-groups {
  display: grid;
  gap: 18px;
}

.traffic-group {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(16, 35, 63, 0.08);
  padding: 18px;
}

.traffic-group > header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}

.traffic-group h2 {
  font-size: 1.35rem;
  margin: 0;
}

.traffic-group > header span {
  background: #eef3fb;
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 950;
  padding: 7px 10px;
}

.traffic-line-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  position: relative;
}

.traffic-line-card {
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-left: 6px solid #94a3b8;
  border-radius: 8px;
  overflow: hidden;
}

.traffic-line-card--normal {
  border-left-color: #15b87a;
}

.traffic-line-card--information,
.traffic-line-card--planned {
  border-left-color: #f59e0b;
}

.traffic-line-card--disrupted,
.traffic-line-card--error {
  border-left-color: #ef4444;
}

.traffic-line-card--tone-orange {
  border-left-color: #f59e0b;
}

.traffic-line-card--tone-red {
  border-left-color: #ef4444;
}

.traffic-line-card > button {
  align-items: center;
  background: #ffffff;
  border: 0;
  color: var(--ink);
  display: flex;
  gap: 12px;
  min-height: 72px;
  padding: 12px;
  text-align: left;
  width: 100%;
}

.traffic-line-card > button:hover {
  background: #f8fbff;
  transform: none;
}

.traffic-line-card__text {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.traffic-line-card__text strong {
  font-size: 1rem;
  font-weight: 950;
  line-height: 1.15;
}

.traffic-line-card__text small {
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.traffic-line-card__status {
  background: #eef3fb;
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 950;
  margin-left: auto;
  padding: 7px 10px;
  white-space: nowrap;
}

.traffic-line-card--normal .traffic-line-card__status {
  background: #dcfce7;
  color: #047857;
}

.traffic-line-card--information .traffic-line-card__status,
.traffic-line-card--planned .traffic-line-card__status {
  background: #fef3c7;
  color: #92400e;
}

.traffic-line-card--disrupted .traffic-line-card__status,
.traffic-line-card--error .traffic-line-card__status {
  background: #fee2e2;
  color: #b91c1c;
}

.traffic-line-card--tone-orange .traffic-line-card__status {
  background: #ffedd5;
  color: #9a3412;
}

.traffic-line-card--tone-red .traffic-line-card__status {
  background: #fee2e2;
  color: #b91c1c;
}

.traffic-details {
  background: #f8fbff;
  border-top: 1px solid rgba(16, 35, 63, 0.08);
  display: grid;
  gap: 10px;
  padding: 12px;
}

.traffic-details__normal,
.traffic-details__error {
  color: var(--muted);
  font-weight: 850;
  margin: 0;
}

.traffic-details__error {
  color: #b91c1c;
}

.traffic-disruption {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 12px;
}

.traffic-disruption--orange {
  border-color: #f59e0b;
}

.traffic-disruption--red {
  border-color: #ef4444;
}

.traffic-timing-tabs {
  background: #eef3fb;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 10px;
  display: grid;
  gap: 4px;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
}

.traffic-timing-tabs button {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: var(--muted);
  display: flex;
  font-weight: 950;
  justify-content: space-between;
  min-height: 38px;
  padding: 0 12px;
}

.traffic-timing-tabs button:hover {
  transform: none;
}

.traffic-timing-tabs__button--active {
  background: #ffffff !important;
  color: var(--ink) !important;
  box-shadow: 0 1px 2px rgba(16, 35, 63, 0.08);
}

.traffic-timing-tabs button span {
  align-items: center;
  background: #dfe6f2;
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.78rem;
  height: 24px;
  justify-content: center;
  min-width: 24px;
  padding: 0 8px;
}

.traffic-disruption__title {
  align-items: flex-start;
  display: flex;
  gap: 10px;
}

.traffic-disruption__icon {
  align-items: center;
  border-radius: 6px;
  color: #ffffff;
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 0.86rem;
  font-weight: 950;
  height: 24px;
  justify-content: center;
  line-height: 1;
  text-transform: uppercase;
  width: 24px;
}

.traffic-disruption--orange .traffic-disruption__icon {
  background: #f59e0b;
  box-shadow: 0 0 0 2px #f59e0b;
}

.traffic-disruption--red .traffic-disruption__icon {
  background: #ef4444;
  box-shadow: 0 0 0 2px #ef4444;
}

.traffic-disruption header {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.traffic-disruption header span {
  color: #5136ff;
  font-size: 0.74rem;
  font-weight: 950;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.traffic-disruption header small,
.traffic-disruption > small {
  color: var(--muted);
  font-weight: 780;
}

.traffic-disruption h3 {
  font-size: 1rem;
  margin: 0;
}

.traffic-disruption p {
  color: #334155;
  font-weight: 720;
  line-height: 1.45;
  margin: 0;
  white-space: pre-line;
}

.traffic-state {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(16, 35, 63, 0.08);
  color: var(--muted);
  font-weight: 900;
  padding: 28px;
  text-align: center;
}

.traffic-state--error {
  color: #b91c1c;
}

@keyframes traffic-scope-burst {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.35);
  }

  18% {
    opacity: 0.85;
    transform: translate(-50%, -50%) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2.7);
  }
}

.traffic-line-pop-move,
.traffic-card-pop-move {
  transition: transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.traffic-line-pop-enter-active,
.traffic-line-pop-leave-active,
.traffic-card-pop-enter-active,
.traffic-card-pop-leave-active {
  transition:
    opacity 260ms ease,
    transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.traffic-line-pop-enter-from,
.traffic-card-pop-enter-from {
  opacity: 0;
  transform: scale(0.72);
}

.traffic-line-pop-leave-to,
.traffic-card-pop-leave-to {
  opacity: 0;
  transform: scale(1.35);
}

.traffic-line-pop-leave-active,
.traffic-card-pop-leave-active {
  position: absolute;
}

@media (prefers-reduced-motion: reduce) {
  .traffic-scope-burst-enter-active,
  .traffic-line-pop-move,
  .traffic-card-pop-move,
  .traffic-line-pop-enter-active,
  .traffic-line-pop-leave-active,
  .traffic-card-pop-enter-active,
  .traffic-card-pop-leave-active {
    animation: none;
    transition: none;
  }
}

@keyframes traffic-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .traffic-ratp-heading,
  .traffic-ratp-heading__title,
  .traffic-hero {
    display: grid;
  }

  .traffic-ratp-heading,
  .traffic-ratp-heading__title,
  .traffic-hero__actions {
    align-items: stretch;
  }

  .traffic-hero__actions {
    display: grid;
  }

  .traffic-toolbar-controls {
    align-items: stretch;
    display: grid;
  }

  .traffic-scope-toggle {
    justify-content: space-between;
  }

  .traffic-style-control {
    justify-content: space-between;
  }

  .traffic-style-control :deep(.material-combobox) {
    min-width: min(260px, 100%);
  }

  .traffic-summary {
    align-items: flex-start;
    display: grid;
  }

  .traffic-summary small {
    margin-left: 0;
  }
}
</style>
