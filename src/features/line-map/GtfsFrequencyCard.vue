<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronDown, Clock3, Search } from "lucide-vue-next";
import { useI18n, type TranslationKey } from "../../i18n";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import AppModal from "../../components/AppModal.vue";
import type { LineFrequencyStationCoordinate } from "./lineFrequencyCompass";
import GtfsFrequencyBlock from "./GtfsFrequencyBlock.vue";
import LineFrequencyTimetableModal from "./LineFrequencyTimetableModal.vue";

const props = defineProps<{
  profile?: GtfsLineFrequencyResponse;
  lineColor?: string;
  stationCoordinates?: readonly LineFrequencyStationCoordinate[];
  loading?: boolean;
  unavailable?: boolean;
  preview?: boolean;
}>();
const { t, d } = useI18n();
const frequencyExpanded = ref(false);
const sourceDetailsOpen = ref(false);
const timetableOpen = ref(false);
const emit = defineEmits<{
  "modal-open": [open: boolean];
}>();
watch(
  [sourceDetailsOpen, timetableOpen],
  ([sourceOpen, timetableIsOpen]) => emit("modal-open", sourceOpen || timetableIsOpen),
  { immediate: true },
);
watch(
  [() => props.profile, () => props.loading, () => props.preview],
  ([profile, loading, preview]) => {
    frequencyExpanded.value = false;
    if (!profile || loading || preview) {
      sourceDetailsOpen.value = false;
      timetableOpen.value = false;
    }
  },
);
const statusKeys: Record<GtfsLineFrequencyResponse["status"], TranslationKey> = {
  ready: "globalMap.sidebar.gtfsFrequency.ready",
  disabled: "globalMap.sidebar.gtfsFrequency.disabled",
  missing: "globalMap.sidebar.gtfsFrequency.missing",
  "out-of-coverage": "globalMap.sidebar.gtfsFrequency.outOfCoverage",
  "line-missing": "globalMap.sidebar.gtfsFrequency.lineMissing",
  insufficient: "globalMap.sidebar.gtfsFrequency.insufficient",
};
const sections = computed(() =>
  props.profile?.topologyAvailable && props.profile.branched
    ? [...props.profile.sections].sort(
        (a, b) => Number(b.kind === "central") - Number(a.kind === "central"),
      )
    : [],
);
const centralSection = computed(() => sections.value.find((section) => section.kind === "central"));
const showCompactAverageFallback = computed(() => {
  const profile = props.profile;
  return Boolean(profile?.status === "ready" && (!profile.branched || !profile.topologyAvailable));
});
function formatServiceDate(value: string): string {
  if (!/^\d{8}$/u.test(value)) return t("globalMap.sidebar.gtfsFrequency.unknownDate");
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return t("globalMap.sidebar.gtfsFrequency.unknownDate");
  }
  return d(date, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}
const datasetDate = computed(() => {
  const value = props.profile?.sourceUpdatedAt;
  const date = value ? new Date(value) : undefined;
  return date && Number.isFinite(date.getTime())
    ? d(date, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Paris" })
    : undefined;
});
</script>

<template>
  <section class="gtfs-frequency-card" data-testid="gtfs-frequency-card">
    <div class="gtfs-frequency-card__title">
      <button
        class="gtfs-frequency-card__accordion-trigger"
        type="button"
        id="gtfs-frequency-card-toggle"
        data-testid="gtfs-frequency-toggle"
        aria-controls="gtfs-frequency-card-content"
        :aria-expanded="frequencyExpanded"
        :disabled="preview || loading || !profile"
        @click="frequencyExpanded = !frequencyExpanded"
      >
        <span
          ><Clock3 :size="16" aria-hidden="true" />{{ t("globalMap.sidebar.lineFrequency") }}</span
        >
        <ChevronDown :size="16" aria-hidden="true" />
      </button>
      <button
        class="gtfs-frequency-card__source-trigger"
        data-testid="gtfs-frequency-source"
        type="button"
        :disabled="preview || loading || !profile"
        :aria-expanded="sourceDetailsOpen"
        aria-haspopup="dialog"
        @click="sourceDetailsOpen = true"
      >
        {{ t("globalMap.sidebar.gtfsFrequency.source") }}
      </button>
    </div>
    <template v-if="!frequencyExpanded">
      <p v-if="preview" role="status">
        {{ t("globalMap.sidebar.linePreviewFrequencyUnavailable") }}
      </p>
      <p v-else-if="loading" role="status">{{ t("globalMap.sidebar.lineLoading") }}</p>
      <p
        v-else-if="profile && profile.status !== 'ready'"
        role="status"
        :data-frequency-status="profile.status"
      >
        {{ t(statusKeys[profile.status]) }}
      </p>
      <template v-else-if="profile">
        <GtfsFrequencyBlock
          v-if="centralSection || showCompactAverageFallback"
          :key="profile.lineId + profile.serviceDate + '-compact'"
          data-testid="frequency-compact"
          compact
          :title="centralSection ? t('globalMap.sidebar.gtfsFrequency.central') : undefined"
          :endpoints="
            centralSection
              ? t('globalMap.sidebar.gtfsFrequency.fromTo', {
                  from: centralSection.from.name,
                  to: centralSection.to.name,
                })
              : undefined
          "
          :average="centralSection?.average ?? profile.average"
          :directions="centralSection?.directions ?? (profile.branched ? [] : profile.directions)"
        />
        <p v-if="!profile.topologyAvailable" role="status">
          {{ t("globalMap.sidebar.gtfsFrequency.topologyMissing") }}
        </p>
        <p v-else-if="profile.branched && !centralSection && !sections.length" role="status">
          {{ t("globalMap.sidebar.gtfsFrequency.sectionsMissing") }}
        </p>
      </template>
      <p v-else role="status">
        {{
          t(
            unavailable
              ? "globalMap.sidebar.lineFrequencyUnavailable"
              : "globalMap.sidebar.lineLoading",
          )
        }}
      </p>
    </template>
    <div
      v-else
      id="gtfs-frequency-card-content"
      class="gtfs-frequency-card__content"
      role="region"
      aria-labelledby="gtfs-frequency-card-toggle"
      data-testid="gtfs-frequency-card-content"
    >
      <p class="gtfs-frequency-card__hint">{{ t("globalMap.sidebar.gtfsFrequency.hint") }}</p>
      <p v-if="preview" role="status">
        {{ t("globalMap.sidebar.linePreviewFrequencyUnavailable") }}
      </p>
      <p v-else-if="loading" role="status">{{ t("globalMap.sidebar.lineLoading") }}</p>
      <template v-else-if="profile">
        <p v-if="profile.status !== 'ready'" role="status" :data-frequency-status="profile.status">
          {{ t(statusKeys[profile.status]) }}
        </p>
        <template v-else>
          <GtfsFrequencyBlock
            :key="profile.lineId + profile.serviceDate"
            data-testid="frequency-average"
            :title="profile.branched ? t('globalMap.sidebar.gtfsFrequency.average') : undefined"
            :average="profile.average"
            :directions="profile.branched ? [] : profile.directions"
          />
          <button
            class="gtfs-frequency-card__timetable-trigger"
            data-testid="gtfs-frequency-timetable"
            type="button"
            aria-haspopup="dialog"
            :aria-expanded="timetableOpen"
            @click="timetableOpen = true"
          >
            <Search :size="14" aria-hidden="true" />
            {{ t("globalMap.sidebar.gtfsFrequency.timetableLink") }}
          </button>
          <p v-if="!profile.topologyAvailable" role="status">
            {{ t("globalMap.sidebar.gtfsFrequency.topologyMissing") }}
          </p>
          <p v-else-if="profile.branched && !sections.length" role="status">
            {{ t("globalMap.sidebar.gtfsFrequency.sectionsMissing") }}
          </p>
          <GtfsFrequencyBlock
            v-for="section in sections"
            :key="profile.lineId + profile.serviceDate + section.id"
            class="gtfs-frequency-card__section"
            :data-frequency-section="section.id"
            :title="
              section.kind === 'central' ? t('globalMap.sidebar.gtfsFrequency.central') : undefined
            "
            :endpoints="
              t('globalMap.sidebar.gtfsFrequency.fromTo', {
                from: section.from.name,
                to: section.to.name,
              })
            "
            :average="section.average"
            :directions="section.directions"
          />
        </template>
      </template>
      <p v-else role="status">
        {{
          t(
            unavailable
              ? "globalMap.sidebar.lineFrequencyUnavailable"
              : "globalMap.sidebar.lineLoading",
          )
        }}
      </p>
    </div>
    <AppModal
      :open="sourceDetailsOpen"
      :title="t('globalMap.sidebar.gtfsFrequency.sourceDetails')"
      panel-class="gtfs-frequency-source-modal"
      @close="sourceDetailsOpen = false"
    >
      <div
        v-if="profile"
        class="gtfs-frequency-card__source-details"
        data-testid="gtfs-frequency-source-details"
      >
        <p v-if="profile.status === 'ready'">{{ t(statusKeys[profile.status]) }}</p>
        <p>
          {{
            t("globalMap.sidebar.gtfsFrequency.serviceDate", {
              date: formatServiceDate(profile.serviceDate),
            })
          }}
        </p>
        <p v-if="datasetDate">
          {{ t("globalMap.sidebar.gtfsFrequency.datasetDate", { date: datasetDate }) }}
        </p>
        <p v-else-if="profile.datasetVersion">
          {{
            t("globalMap.sidebar.gtfsFrequency.datasetVersion", {
              version: profile.datasetVersion,
            })
          }}
        </p>
        <p v-else>
          {{
            t("globalMap.sidebar.gtfsFrequency.datasetDate", {
              date: t("globalMap.sidebar.gtfsFrequency.unknownDate"),
            })
          }}
        </p>
        <p v-if="profile.coverage">
          {{
            t("globalMap.sidebar.gtfsFrequency.coverage", {
              from: formatServiceDate(profile.coverage.startDate),
              to: formatServiceDate(profile.coverage.endDate),
            })
          }}
        </p>
      </div>
    </AppModal>
    <LineFrequencyTimetableModal
      :open="timetableOpen"
      :profile="profile"
      :line-color="lineColor"
      :station-coordinates="stationCoordinates"
      @close="timetableOpen = false"
    />
  </section>
</template>

<style scoped>
.gtfs-frequency-card {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--sidebar-border, var(--border));
  border-radius: 16px;
  background: var(--surface);
  color: var(--ink);
}
.gtfs-frequency-card__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.gtfs-frequency-card__accordion-trigger {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-2);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
}
.gtfs-frequency-card__accordion-trigger > span {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-2);
}
.gtfs-frequency-card__accordion-trigger > span > svg {
  flex: 0 0 auto;
}
.gtfs-frequency-card__accordion-trigger > svg {
  flex: 0 0 auto;
  transition: transform 160ms ease;
}
.gtfs-frequency-card__accordion-trigger[aria-expanded="true"] > svg {
  transform: rotate(180deg);
}
.gtfs-frequency-card__accordion-trigger:hover:not(:disabled),
.gtfs-frequency-card__accordion-trigger:focus-visible {
  color: var(--idfm-blue);
  outline: none;
}
.gtfs-frequency-card__accordion-trigger:focus-visible {
  border-radius: 3px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--idfm-blue), transparent 72%);
}
.gtfs-frequency-card__accordion-trigger:disabled {
  cursor: default;
}
.gtfs-frequency-card__content {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
h3 {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: 0.78rem;
}
.gtfs-frequency-card__source-trigger {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 0.64rem;
  cursor: pointer;
}
.gtfs-frequency-card__source-trigger:hover:not(:disabled) {
  color: var(--ink);
}
.gtfs-frequency-card__source-trigger:focus-visible {
  outline: 2px solid var(--idfm-blue);
  outline-offset: 3px;
  border-radius: 2px;
}
.gtfs-frequency-card__source-trigger:disabled {
  cursor: default;
}
.gtfs-frequency-card__source-details {
  display: grid;
  gap: var(--space-2);
}
.gtfs-frequency-card__timetable-trigger {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: var(--space-1);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--idfm-blue);
  font: inherit;
  font-size: 0.68rem;
  cursor: pointer;
}
.gtfs-frequency-card__timetable-trigger:hover {
  color: var(--ink);
  text-decoration: underline;
}
.gtfs-frequency-card__timetable-trigger:focus-visible {
  outline: 2px solid var(--idfm-blue);
  outline-offset: 3px;
  border-radius: 2px;
}
p {
  margin: 0;
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.4;
}
.gtfs-frequency-card__hint {
  font-size: 0.66rem;
}
.gtfs-frequency-card__section {
  border-top: 1px solid var(--border);
  padding-top: var(--space-3);
}
@media (prefers-reduced-motion: reduce) {
  .gtfs-frequency-card__accordion-trigger > svg {
    transition: none;
  }
}
</style>
