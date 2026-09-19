<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeftRight, Eye, EyeOff, Info, Pencil, X } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import NearbyCityCityPicker from "./NearbyCityCityPicker.vue";
import NearbyCityComparisonMetricRow from "./NearbyCityComparisonMetricRow.vue";
import type {
  NearbyCityComparisonCity,
  NearbyCityComparisonCityOption,
  NearbyCityComparisonMetric,
} from "./nearbyCityComparison";

const props = defineProps<{
  open: boolean;
  current: NearbyCityComparisonCity;
  target: NearbyCityComparisonCity;
  rows: readonly NearbyCityComparisonMetric[];
  loading?: boolean;
  /** True while the compared city data is still being fetched. */
  targetLoading?: boolean;
  /** True while the reference city data is still being fetched. */
  currentLoading?: boolean;
  cityOptions?: readonly NearbyCityComparisonCityOption[];
}>();

const emit = defineEmits<{
  close: [];
  selectBaseCity: [cityCode: string];
  selectTargetCity: [cityCode: string];
  swapCities: [];
}>();

const { t } = useI18n();
const dialog = ref<HTMLElement>();
const pickerTarget = ref<"base" | "target">();
const expandedMetricIds = ref<readonly string[]>([]);
/**
 * The target side can be hidden to read the current city statistics alone.
 * It is a pure view switch: both sides keep their state, so restoring the
 * comparison brings back exactly the same view.
 */
const showTarget = ref(true);
let previouslyFocused: HTMLElement | undefined;

const cityOptions = computed<readonly NearbyCityComparisonCityOption[]>(() => props.cityOptions ?? []);
const pickerTitle = computed(() => t(
  pickerTarget.value === "base"
    ? "nearbyStations.cityComparison.pickCurrentCity"
    : "nearbyStations.cityComparison.pickTargetCity",
));
// Changing a city retargets the comparison only: the searched address, the map
// and the scanned stations are left untouched.
const pickerDescription = computed(() => t(
  pickerTarget.value === "base"
    ? "nearbyStations.cityComparison.pickCurrentCityDescription"
    : "nearbyStations.cityComparison.pickTargetCityDescription",
));
const pickerOptions = computed(() => {
  if (!showTarget.value) return cityOptions.value;
  const excluded = pickerTarget.value === "base" ? props.target.code : props.current.code;
  return cityOptions.value.filter((option) => option.code !== excluded);
});
const swapLabel = computed(() => t("nearbyStations.cityComparison.swapCities", {
  current: props.current.name,
  target: props.target.name,
}));
const targetToggleLabel = computed(() => t(
  showTarget.value
    ? "nearbyStations.cityComparison.hideTargetCity"
    : "nearbyStations.cityComparison.showTargetCity",
  { city: props.target.name },
));
/** Rows keep their reveal order when the modal opens or a city changes. */
const rowDelayMs = 36;

function isExpanded(metricId: string): boolean {
  return expandedMetricIds.value.includes(metricId);
}

function toggleMetric(metricId: string): void {
  expandedMetricIds.value = isExpanded(metricId)
    ? expandedMetricIds.value.filter((id) => id !== metricId)
    : [...expandedMetricIds.value, metricId];
}

function close(): void {
  pickerTarget.value = undefined;
  emit("close");
}

function closePicker(): void {
  pickerTarget.value = undefined;
  focusDialog();
}

function openPicker(kind: "base" | "target"): void {
  pickerTarget.value = pickerTarget.value === kind ? undefined : kind;
}

function selectPickerCity(cityCode: string): void {
  const kind = pickerTarget.value;
  pickerTarget.value = undefined;
  if (kind === "base") emit("selectBaseCity", cityCode);
  else if (kind === "target") emit("selectTargetCity", cityCode);
  focusDialog();
}

function swapCities(): void {
  pickerTarget.value = undefined;
  emit("swapCities");
  focusDialog();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  if (pickerTarget.value) {
    pickerTarget.value = undefined;
    return;
  }
  close();
}

function focusDialog(): void {
  void nextTick(() => dialog.value?.focus());
}

watch(() => props.open, (open) => {
  if (typeof document === "undefined") return;
  if (open) {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    pickerTarget.value = undefined;
    expandedMetricIds.value = [];
    focusDialog();
  } else {
    previouslyFocused?.focus();
    previouslyFocused = undefined;
  }
});

onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
  if (props.open) {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    focusDialog();
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown);
  previouslyFocused?.focus();
});
</script>

<template>
  <div
    v-if="open"
    class="nearby-city-comparison-modal"
    data-testid="nearby-city-comparison-modal"
    role="presentation"
    @click.self="close"
    @click.stop
    @pointerdown.stop
    @pointerup.stop
    @pointermove.stop
    @pointercancel.stop
    @wheel.stop
    @contextmenu.stop
  >
    <section
      ref="dialog"
      class="nearby-city-comparison-modal__dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nearby-city-comparison-title"
      aria-describedby="nearby-city-comparison-description"
      tabindex="-1"
    >
      <header class="nearby-city-comparison-modal__header">
        <div class="nearby-city-comparison-modal__heading">
          <p class="nearby-city-comparison-modal__eyebrow">{{ t("nearbyStations.cityComparison.eyebrow") }}</p>
          <h2 id="nearby-city-comparison-title">{{ t("nearbyStations.cityComparison.title") }}</h2>
          <p id="nearby-city-comparison-description" class="nearby-city-comparison-modal__description">
            {{ t("nearbyStations.cityComparison.description", { current: current.name, target: target.name }) }}
          </p>
        </div>
        <div class="nearby-city-comparison-modal__header-actions">
          <button
            type="button"
            class="nearby-city-comparison-modal__target-toggle"
            :class="{ 'nearby-city-comparison-modal__target-toggle--active': showTarget }"
            data-testid="nearby-city-comparison-target-toggle"
            :aria-pressed="showTarget"
            :aria-label="targetToggleLabel"
            :title="targetToggleLabel"
            @click="showTarget = !showTarget"
          >
            <Eye v-if="showTarget" :size="16" :stroke-width="2.2" aria-hidden="true" />
            <EyeOff v-else :size="16" :stroke-width="2.2" aria-hidden="true" />
            <span>{{ t("nearbyStations.cityComparison.targetCityShort") }}</span>
          </button>
          <button
            type="button"
            class="nearby-city-comparison-modal__close"
            :aria-label="t('nearbyStations.cityComparison.close')"
            :title="t('nearbyStations.cityComparison.close')"
            data-testid="nearby-city-comparison-close"
            @click="close"
          >
            <X :size="18" :stroke-width="2.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <NearbyCityCityPicker
        v-if="pickerTarget"
        :title="pickerTitle"
        :description="pickerDescription"
        :search-label="t('nearbyStations.cityComparison.pickCitySearch')"
        :search-placeholder="t('nearbyStations.cityComparison.pickCitySearchPlaceholder')"
        :empty-label="t('nearbyStations.cityComparison.pickCityEmpty')"
        :options="pickerOptions"
        :selected-code="pickerTarget === 'base' ? current.code : target.code"
        @select="selectPickerCity"
        @close="closePicker"
      />

      <div v-else class="nearby-city-comparison-modal__scroll">
        <div
          class="nearby-city-comparison-modal__selectors"
          :class="{ 'nearby-city-comparison-modal__selectors--single': !showTarget }"
        >
          <button
            type="button"
            class="nearby-city-comparison-modal__city nearby-city-comparison-modal__city--current"
            data-testid="nearby-city-comparison-current-city"
            :aria-label="t('nearbyStations.cityComparison.changeCityAria', { city: current.name })"
            :title="t('nearbyStations.cityComparison.changeCityAria', { city: current.name })"
            @click="openPicker('base')"
          >
            <span class="nearby-city-comparison-modal__dot nearby-city-comparison-modal__dot--current" aria-hidden="true" />
            <span class="nearby-city-comparison-modal__city-text">
              <small>{{ t("nearbyStations.cityComparison.currentCity") }}</small>
              <strong>{{ current.name }}</strong>
            </span>
            <Pencil class="nearby-city-comparison-modal__city-edit" :size="15" :stroke-width="2.2" aria-hidden="true" />
          </button>

          <button
            v-if="showTarget"
            type="button"
            class="nearby-city-comparison-modal__swap"
            data-testid="nearby-city-comparison-swap"
            :aria-label="swapLabel"
            :title="swapLabel"
            @click="swapCities"
          >
            <ArrowLeftRight :size="18" :stroke-width="2.4" aria-hidden="true" />
          </button>

          <button
            v-if="showTarget"
            type="button"
            class="nearby-city-comparison-modal__city nearby-city-comparison-modal__city--target"
            data-testid="nearby-city-comparison-target-city"
            :aria-label="t('nearbyStations.cityComparison.changeCityAria', { city: target.name })"
            :title="t('nearbyStations.cityComparison.changeCityAria', { city: target.name })"
            @click="openPicker('target')"
          >
            <span class="nearby-city-comparison-modal__dot nearby-city-comparison-modal__dot--target" aria-hidden="true" />
            <span class="nearby-city-comparison-modal__city-text">
              <small>{{ t("nearbyStations.cityComparison.targetCity") }}</small>
              <strong>{{ target.name }}</strong>
            </span>
            <Pencil class="nearby-city-comparison-modal__city-edit" :size="15" :stroke-width="2.2" aria-hidden="true" />
          </button>
        </div>

        <div class="nearby-city-comparison-modal__metrics">
          <NearbyCityComparisonMetricRow
            v-for="(row, index) in rows"
            :key="row.id"
            :metric="row"
            :current-name="current.name"
            :target-name="target.name"
            :expanded="isExpanded(row.id)"
            :show-target="showTarget"
            :delay-ms="index * rowDelayMs"
            @toggle="toggleMetric"
          />
        </div>

        <footer class="nearby-city-comparison-modal__footer">
          <div v-if="showTarget" class="nearby-city-comparison-modal__legend">
            <span class="nearby-city-comparison-modal__legend-entry">
              <span class="nearby-city-comparison-modal__legend-item nearby-city-comparison-modal__legend-item--better" />
              {{ t("nearbyStations.cityComparison.superiorLegend", { city: target.name }) }}
            </span>
            <span class="nearby-city-comparison-modal__legend-entry">
              <span class="nearby-city-comparison-modal__legend-item nearby-city-comparison-modal__legend-item--worse" />
              {{ t("nearbyStations.cityComparison.inferiorLegend", { city: target.name }) }}
            </span>
            <span class="nearby-city-comparison-modal__legend-entry">
              <span class="nearby-city-comparison-modal__legend-item nearby-city-comparison-modal__legend-item--equal" />
              {{ t("nearbyStations.cityComparison.equalLegend") }}
            </span>
          </div>
          <p v-else class="nearby-city-comparison-modal__legend">
            {{ t("nearbyStations.cityComparison.singleCityLegend", { city: current.name }) }}
          </p>
          <p class="nearby-city-comparison-modal__note">
            <Info :size="13" aria-hidden="true" />
            {{ t("nearbyStations.cityComparison.perCapitaNote") }}
          </p>
        </footer>
      </div>
    </section>
  </div>
</template>

<style scoped>
.nearby-city-comparison-modal {
  align-items: center;
  background: rgba(15, 23, 42, .52);
  cursor: default;
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 18px;
  pointer-events: auto;
  position: absolute;
  touch-action: auto;
  user-select: text;
  z-index: 40;
}

.nearby-city-comparison-modal__dialog {
  background: #fff;
  border: 1px solid rgba(81, 70, 255, .14);
  border-radius: 22px;
  box-shadow: 0 28px 70px rgba(15, 23, 42, .26);
  box-sizing: border-box;
  cursor: default;
  display: flex;
  flex-direction: column;
  max-height: min(92%, 780px);
  max-width: 880px;
  outline: none;
  overflow: hidden;
  padding: 24px 24px 0;
  width: min(100%, 880px);
}

.nearby-city-comparison-modal__header {
  align-items: start;
  display: flex;
  gap: 18px;
  justify-content: space-between;
}

.nearby-city-comparison-modal__header-actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.nearby-city-comparison-modal__target-toggle {
  align-items: center;
  appearance: none;
  background: #f7f8fc;
  border: 1px solid rgba(100, 116, 139, .18);
  border-radius: 12px;
  color: #5b6b80;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: .72rem;
  font-weight: 800;
  gap: 7px;
  min-height: 38px;
  padding: 0 12px;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
  white-space: nowrap;
}

.nearby-city-comparison-modal__target-toggle:hover,
.nearby-city-comparison-modal__target-toggle:focus-visible {
  background: #f0efff;
  border-color: rgba(81, 70, 255, .4);
  color: #5146ff;
  outline: 0;
}

.nearby-city-comparison-modal__target-toggle--active {
  background: #eefbfd;
  border-color: rgba(12, 124, 138, .35);
  color: #0c7c8a;
}

.nearby-city-comparison-modal__target-toggle svg { flex: 0 0 auto; }

.nearby-city-comparison-modal__eyebrow {
  color: #7c74e0;
  font-size: .67rem;
  font-weight: 900;
  letter-spacing: .13em;
  margin: 0 0 5px;
  text-transform: uppercase;
}

.nearby-city-comparison-modal h2 {
  color: #131c33;
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: -.01em;
  margin: 0;
}

.nearby-city-comparison-modal__description {
  color: #7c8798;
  font-size: .76rem;
  line-height: 1.45;
  margin: 6px 0 0;
}

.nearby-city-comparison-modal__close {
  align-items: center;
  appearance: none;
  background: #f7f8fc;
  border: 1px solid rgba(100, 116, 139, .18);
  border-radius: 12px;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  min-height: 38px;
  min-width: 38px;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.nearby-city-comparison-modal__close:hover,
.nearby-city-comparison-modal__close:focus-visible {
  background: #f0efff;
  border-color: rgba(81, 70, 255, .4);
  color: #5146ff;
  outline: 0;
}

.nearby-city-comparison-modal__scroll {
  display: grid;
  margin-right: -8px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 8px;
  scrollbar-color: rgba(100, 116, 139, .45) transparent;
  scrollbar-width: thin;
}

.nearby-city-comparison-modal__scroll::-webkit-scrollbar { width: 10px; }
.nearby-city-comparison-modal__scroll::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, .38);
  background-clip: content-box;
  border: 3px solid transparent;
  border-radius: 999px;
}

.nearby-city-comparison-modal__selectors {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  margin-top: 20px;
}

/* Single city: the current city takes the whole row, centred and wider. */
.nearby-city-comparison-modal__selectors--single {
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
}

.nearby-city-comparison-modal__selectors--single .nearby-city-comparison-modal__city {
  max-width: 420px;
  width: 100%;
}

.nearby-city-comparison-modal__city {
  align-items: center;
  appearance: none;
  background: #fbfcfe;
  border: 1px solid rgba(100, 116, 139, .16);
  border-radius: 16px;
  color: #131c33;
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: 12px;
  min-height: 64px;
  min-width: 0;
  padding: 12px 14px;
  text-align: left;
  transition: background 170ms ease, border-color 170ms ease, box-shadow 170ms ease;
}

.nearby-city-comparison-modal__city:hover,
.nearby-city-comparison-modal__city:focus-visible { outline: 0; }
.nearby-city-comparison-modal__city--current:hover,
.nearby-city-comparison-modal__city--current:focus-visible {
  background: #faf9ff;
  border-color: rgba(81, 70, 255, .4);
  box-shadow: 0 6px 18px rgba(81, 70, 255, .1);
}
.nearby-city-comparison-modal__city--target:hover,
.nearby-city-comparison-modal__city--target:focus-visible {
  background: #f7fdfc;
  border-color: rgba(12, 124, 138, .4);
  box-shadow: 0 6px 18px rgba(12, 124, 138, .1);
}

.nearby-city-comparison-modal__city-text {
  display: grid;
  flex: 1 1 auto;
  gap: 2px;
  min-width: 0;
}

.nearby-city-comparison-modal__city-text small {
  color: #8b97a8;
  font-size: .6rem;
  font-weight: 900;
  letter-spacing: .09em;
  text-transform: uppercase;
}

.nearby-city-comparison-modal__city-text strong {
  font-size: .98rem;
  font-weight: 900;
  letter-spacing: -.005em;
  overflow-wrap: anywhere;
}

/* Edit affordance: only revealed when the card is hovered or focused. */
.nearby-city-comparison-modal__city-edit {
  color: #94a3b8;
  flex: 0 0 auto;
  opacity: 0;
  transition: opacity 160ms ease, color 160ms ease;
}

.nearby-city-comparison-modal__city:hover .nearby-city-comparison-modal__city-edit,
.nearby-city-comparison-modal__city:focus-visible .nearby-city-comparison-modal__city-edit {
  opacity: 1;
}

.nearby-city-comparison-modal__city--current:hover .nearby-city-comparison-modal__city-edit { color: #5146ff; }
.nearby-city-comparison-modal__city--target:hover .nearby-city-comparison-modal__city-edit { color: #0c7c8a; }

.nearby-city-comparison-modal__dot {
  border-radius: 50%;
  flex: 0 0 auto;
  height: 12px;
  width: 12px;
}

.nearby-city-comparison-modal__dot--current { background: #5146ff; }
.nearby-city-comparison-modal__dot--target { background: #0c7c8a; }

.nearby-city-comparison-modal__swap {
  align-items: center;
  appearance: none;
  background: #fff;
  border: 1px solid rgba(100, 116, 139, .22);
  border-radius: 999px;
  color: #5b6b80;
  cursor: pointer;
  display: inline-flex;
  height: 42px;
  justify-content: center;
  transition: transform 220ms cubic-bezier(.2, .8, .2, 1), border-color 160ms ease, color 160ms ease, background 160ms ease;
  width: 42px;
}

/* A lucide glyph is a flex item: without this it shrinks to a sliver. */
.nearby-city-comparison-modal__swap svg,
.nearby-city-comparison-modal__close svg,
.nearby-city-comparison-modal__note svg {
  flex: 0 0 auto;
}

.nearby-city-comparison-modal__swap:hover,
.nearby-city-comparison-modal__swap:focus-visible {
  background: #f7f8ff;
  border-color: rgba(81, 70, 255, .45);
  color: #3f35d6;
  outline: 0;
  transform: rotate(180deg);
}

.nearby-city-comparison-modal__metrics { padding: 14px 0 2px; }

.nearby-city-comparison-modal__footer {
  align-items: center;
  border-top: 1px solid rgba(100, 116, 139, .12);
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  justify-content: space-between;
  margin-top: 6px;
  padding: 14px 0 18px;
}

.nearby-city-comparison-modal__legend {
  align-items: center;
  color: #7c8798;
  display: flex;
  flex-wrap: wrap;
  font-size: .69rem;
  gap: 6px 16px;
}

.nearby-city-comparison-modal__legend-entry {
  align-items: center;
  display: inline-flex;
  gap: 7px;
}

.nearby-city-comparison-modal__legend-item {
  border-radius: 50%;
  display: inline-block;
  height: 9px;
  flex: 0 0 auto;
  width: 9px;
}

.nearby-city-comparison-modal__legend-item--better { background: #6ee7a8; }
.nearby-city-comparison-modal__legend-item--worse { background: #fca5a5; }
.nearby-city-comparison-modal__legend-item--equal { background: #cbd5e1; }

.nearby-city-comparison-modal__note {
  align-items: center;
  color: #7c8798;
  display: flex;
  font-size: .69rem;
  gap: 6px;
  margin: 0;
}

@media (max-width: 700px) {
  .nearby-city-comparison-modal { padding: 10px; }
  .nearby-city-comparison-modal__dialog { padding: 16px 16px 0; }
  .nearby-city-comparison-modal__selectors { gap: 8px; }
  .nearby-city-comparison-modal__swap { height: 44px; transform: rotate(90deg); width: 44px; }
  .nearby-city-comparison-modal__swap:hover,
  .nearby-city-comparison-modal__swap:focus-visible { transform: rotate(270deg); }
  .nearby-city-comparison-modal__footer { align-items: start; flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  .nearby-city-comparison-modal__city,
  .nearby-city-comparison-modal__swap { transition: none; }
}
</style>
