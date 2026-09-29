<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Activity, Euro, Info } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import { getDvfDataProvider, liquidityBand, type DvfCityDescriptor, type DvfMarketScope, type DvfNeighborhoodMetric } from "../../services/real-estate/compiledRealEstate";
import { fetchIrisDataset, type IrisNeighborhood } from "../transport-map/iris/irisApi";
import { pointInIrisGeometry } from "../transport-map/iris/irisGeometry";
import { calculateDvfPriceChanges, formatDvfPriceChange, type DvfPriceTrendChange } from "../../services/real-estate/priceTrends";

const props = withDefaults(defineProps<{
  origin?: { lon: number; lat: number };
  communeCode?: string;
  radiusMeters?: number;
}>(), { radiusMeters: 500 });

const { n, t } = useI18n();
const provider = getDvfDataProvider();
const loading = ref(false);
const unavailable = ref(false);
const city = ref<DvfCityDescriptor>();
const neighborhood = ref<DvfNeighborhoodMetric>();
const localPrice = ref<number>();
const remainderPrice = ref<number>();
const rentPerSquareMeter = ref<number>();
const rentalReferencePeriod = ref<string>();
const scope = ref<DvfMarketScope>("idf");
const frequency = ref<ReturnType<typeof liquidityBand>>();
const cityFrequency = ref<ReturnType<typeof liquidityBand>>();
const frequencyScopeLabel = ref("");
const threeYearPriceChange = computed<DvfPriceTrendChange | undefined>(() =>
  calculateDvfPriceChanges(neighborhood.value?.yearlyPrices).find((change) => change.period === 3));
const threeYearTrendKey = computed(() => {
  const change = threeYearPriceChange.value;
  if (!change || Math.abs(change.percent) < .05) return "nearbyStations.realEstate.scoreTrendStable";
  return change.percent > 0
    ? "nearbyStations.realEstate.scoreTrendUp"
    : "nearbyStations.realEstate.scoreTrendDown";
});
let requestId = 0;

const showLocalComparison = computed(() =>
  typeof localPrice.value === "number" && typeof remainderPrice.value === "number",
);
const referencePurchasePrice = computed(() => [
  localPrice.value,
  neighborhood.value?.medianPriceM2,
  city.value?.medianPriceM2,
].find(isPositiveFinite));
const grossRentalYield = computed(() => {
  const rent = rentPerSquareMeter.value;
  const price = referencePurchasePrice.value;
  return isPositiveFinite(rent) && isPositiveFinite(price) ? rent * 12 / price * 100 : undefined;
});
const cityName = computed(() => city.value?.name);
const neighborhoodName = ref("");

watch(
  () => [props.origin?.lon, props.origin?.lat, props.communeCode] as const,
  () => { void loadMarketFacts(); },
  { immediate: true },
);

onBeforeUnmount(() => { requestId += 1; });

async function loadMarketFacts(): Promise<void> {
  const origin = props.origin;
  if (!origin || !Number.isFinite(origin.lon) || !Number.isFinite(origin.lat) || typeof window === "undefined") return;
  const id = ++requestId;
  loading.value = true;
  unavailable.value = false;
  city.value = undefined;
  neighborhood.value = undefined;
  localPrice.value = undefined;
  remainderPrice.value = undefined;
  rentPerSquareMeter.value = undefined;
  rentalReferencePeriod.value = undefined;
  frequency.value = undefined;
  cityFrequency.value = undefined;
  neighborhoodName.value = "";

  try {
    const [manifest, iris, rentalIndicators] = await Promise.all([
      provider.loadManifest(),
      fetchIrisDataset(),
      provider.loadRentalIndicators().catch(() => undefined),
    ]);
    if (id !== requestId) return;
    const neighborhoodAtOrigin = findNeighborhoodAtOrigin(iris.neighborhoods, origin, props.communeCode);
    const communeCode = props.communeCode || neighborhoodAtOrigin?.communeCode;
    if (!communeCode || !neighborhoodAtOrigin) {
      unavailable.value = true;
      return;
    }
    const descriptor = manifest.cities.find((entry) => entry.code === communeCode);
    if (!descriptor) {
      unavailable.value = true;
      return;
    }
    const cityFile = await provider.loadCity(communeCode);
    if (id !== requestId) return;
    city.value = descriptor;
    const rentalEstimate = rentalIndicators?.cities.find((entry) => entry.code === communeCode);
    rentPerSquareMeter.value = rentalEstimate?.rentPerSquareMeter;
    rentalReferencePeriod.value = rentalIndicators?.referencePeriod;
    neighborhoodName.value = neighborhoodAtOrigin.name;
    const neighborhoodMetric = cityFile.neighborhoods.find((entry) => entry.codeIris === neighborhoodAtOrigin.codeIris);
    neighborhood.value = neighborhoodMetric;
    const maxLocalRadius = Math.max(250, Math.min(800, props.radiusMeters));
    const cellsInNeighborhood = cityFile.cells.filter((cell) => cell.codeIris === neighborhoodAtOrigin.codeIris);
    const localCells = cellsInNeighborhood.filter((cell) => distanceMeters(origin, cell) <= maxLocalRadius);
    const outsideCells = cellsInNeighborhood.filter((cell) => distanceMeters(origin, cell) > maxLocalRadius);
    localPrice.value = weightedMedian(localCells.map((cell) => ({ value: cell.medianPriceM2, weight: cell.transactionCount })));
    remainderPrice.value = weightedMedian(outsideCells.map((cell) => ({ value: cell.medianPriceM2, weight: cell.transactionCount })));

    const marketScope = scopeForDepartment(descriptor.departmentCode);
    scope.value = marketScope;
    const benchmark = manifest.marketBenchmarks[marketScope];
    if (neighborhoodMetric?.transactionCount !== undefined) {
      frequency.value = liquidityBand(neighborhoodMetric.transactionCount, benchmark.neighborhoodSalesPercentiles);
    }
    if (descriptor.transactionCount !== undefined) {
      cityFrequency.value = liquidityBand(descriptor.transactionCount, benchmark.citySalesPercentiles);
    }
    frequencyScopeLabel.value = scopeLabel(marketScope);
  } catch {
    if (id === requestId) unavailable.value = true;
  } finally {
    if (id === requestId) loading.value = false;
  }
}

function findNeighborhoodAtOrigin(
  neighborhoods: readonly IrisNeighborhood[],
  origin: { lon: number; lat: number },
  communeCode?: string,
): IrisNeighborhood | undefined {
  return neighborhoods.find((candidate) => (!communeCode || candidate.communeCode === communeCode)
    && pointInIrisGeometry(origin, candidate.geometry));
}

function scopeForDepartment(department: string): DvfMarketScope {
  if (department === "75") return "paris-intramuros";
  if (["92", "93", "94"].includes(department)) return "petite-couronne";
  return "grande-couronne";
}

function scopeLabel(value: DvfMarketScope): string {
  if (value === "paris-intramuros") return t("nearbyStations.realEstate.parisScope");
  if (value === "petite-couronne") return t("nearbyStations.realEstate.petiteCouronneScope");
  if (value === "grande-couronne") return t("nearbyStations.realEstate.grandeCouronneScope");
  return t("nearbyStations.realEstate.idfScope");
}

function frequencyCopy(value: ReturnType<typeof liquidityBand>): string | undefined {
  if (value === "very-high") return t("nearbyStations.realEstate.scoreFrequencyVeryHigh");
  if (value === "high") return t("nearbyStations.realEstate.scoreFrequencyHigh");
  if (value === "typical") return t("nearbyStations.realEstate.scoreFrequencyTypical");
  if (value === "low") return t("nearbyStations.realEstate.scoreFrequencyLow");
  return undefined;
}

function frequencyLevel(value: ReturnType<typeof liquidityBand>): string | undefined {
  if (value === "very-high") return t("nearbyStations.realEstate.scoreFrequencyVeryHighLevel");
  if (value === "high") return t("nearbyStations.realEstate.scoreFrequencyHighLevel");
  if (value === "typical") return t("nearbyStations.realEstate.scoreFrequencyTypicalLevel");
  if (value === "low") return t("nearbyStations.realEstate.scoreFrequencyLowLevel");
  return undefined;
}

function formatPrice(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${n(Math.round(value))} €/m²`
    : t("nearbyStations.realEstate.noPrice");
}

function formatRent(value: number | undefined): string {
  return isPositiveFinite(value)
    ? `${n(value, { maximumFractionDigits: 1 })} €/m²/mois`
    : t("nearbyStations.realEstate.noRent");
}

function formatYield(value: number | undefined): string {
  return isPositiveFinite(value)
    ? `${n(value, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`
    : t("nearbyStations.realEstate.noYield");
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function formatChange(value: number): string {
  return formatDvfPriceChange(value, (amount, maximumFractionDigits) => n(amount, {
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }));
}

function priceDifference(left: number | undefined, right: number | undefined): string | undefined {
  if (typeof left !== "number" || typeof right !== "number" || right <= 0) return undefined;
  const difference = Math.round((left / right - 1) * 100);
  return `${difference > 0 ? "+" : ""}${difference} %`;
}

function weightedMedian(entries: readonly { value: number; weight: number }[]): number | undefined {
  const values = entries.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((left, right) => left.value - right.value);
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) return undefined;
  let accumulated = 0;
  for (const entry of values) {
    accumulated += entry.weight;
    if (accumulated >= totalWeight / 2) return entry.value;
  }
  return values.at(-1)?.value;
}

function distanceMeters(left: { lon: number; lat: number }, right: { lon: number; lat: number }): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (right.lat - left.lat) * radians;
  const longitudeDelta = (right.lon - left.lon) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(left.lat * radians) * Math.cos(right.lat * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
</script>

<template>
  <section
    class="nearby-real-estate-verdict"
    data-testid="nearby-real-estate-verdict"
    :aria-busy="loading"
    aria-labelledby="nearby-real-estate-verdict-title"
  >
    <header class="nearby-real-estate-verdict__header">
      <span class="nearby-real-estate-verdict__icon" aria-hidden="true"><Euro :size="19" :stroke-width="2.2" /></span>
      <div>
        <p>{{ t("nearbyStations.realEstate.scoreSubtitle") }}</p>
        <h2 id="nearby-real-estate-verdict-title">{{ t("nearbyStations.realEstate.scoreTitle") }}</h2>
      </div>
      <Info class="nearby-real-estate-verdict__info" :size="17" :aria-label="t('nearbyStations.realEstate.priceDisclaimer')" :title="t('nearbyStations.realEstate.priceDisclaimer')" />
    </header>

    <div v-if="loading" class="nearby-real-estate-verdict__status" role="status">
      <span class="nearby-real-estate-verdict__spinner" aria-hidden="true" />
      {{ t("nearbyStations.realEstate.loading") }}
    </div>
    <div v-else-if="unavailable" class="nearby-real-estate-verdict__status" role="note">
      {{ t("nearbyStations.realEstate.scoreUnavailable") }}
    </div>
    <template v-else-if="city && neighborhood">
      <div class="nearby-real-estate-verdict__area">{{ neighborhoodName }} · {{ cityName }}</div>
      <div class="nearby-real-estate-verdict__prices">
        <div v-if="showLocalComparison">
          <span>{{ t("nearbyStations.realEstate.scoreLocalPrice") }}</span>
          <strong>{{ formatPrice(localPrice) }}</strong>
        </div>
        <div v-if="showLocalComparison">
          <span>{{ t("nearbyStations.realEstate.scoreRestPrice") }}</span>
          <strong>{{ formatPrice(remainderPrice) }}</strong>
        </div>
        <div v-else>
          <span>{{ t("nearbyStations.realEstate.scoreNeighborhoodMedian") }}</span>
          <strong>{{ formatPrice(neighborhood.medianPriceM2) }}</strong>
        </div>
        <div v-if="!showLocalComparison">
          <span>{{ t("nearbyStations.realEstate.scoreCityMedian") }}</span>
          <strong>{{ formatPrice(city.medianPriceM2) }}</strong>
        </div>
        <div>
          <span>{{ t("nearbyStations.realEstate.scoreRent") }}</span>
          <strong>{{ formatRent(rentPerSquareMeter) }}</strong>
        </div>
        <div>
          <span>{{ t("nearbyStations.realEstate.scoreYield") }}</span>
          <strong>{{ formatYield(grossRentalYield) }}</strong>
        </div>
      </div>
      <p v-if="showLocalComparison && priceDifference(localPrice, remainderPrice)" class="nearby-real-estate-verdict__difference">
        {{ t("nearbyStations.realEstate.scorePriceDifference", { difference: priceDifference(localPrice, remainderPrice) }) }}
      </p>
      <p v-else-if="!showLocalComparison && priceDifference(neighborhood.medianPriceM2, city.medianPriceM2)" class="nearby-real-estate-verdict__difference">
        {{ t("nearbyStations.realEstate.scoreVsCity", { difference: priceDifference(neighborhood.medianPriceM2, city.medianPriceM2) }) }}
      </p>
      <p
        v-if="threeYearPriceChange"
        class="nearby-real-estate-verdict__trend"
        :data-trend-direction="threeYearPriceChange.percent > .05 ? 'up' : threeYearPriceChange.percent < -.05 ? 'down' : 'stable'"
        :title="t('nearbyStations.realEstate.trendIntervalTitle', { from: threeYearPriceChange.fromYear, to: threeYearPriceChange.toYear })"
      >
        <Activity :size="15" :stroke-width="2.2" aria-hidden="true" />
        {{ t(threeYearTrendKey, { change: formatChange(threeYearPriceChange.percent) }) }}
      </p>
      <div v-if="neighborhood.transactionCount !== undefined" class="nearby-real-estate-verdict__frequency" :data-frequency="frequency">
        <strong>{{ frequencyCopy(frequency) }}</strong>
        <span v-if="frequencyLevel(frequency)" :title="t('nearbyStations.realEstate.scoreFrequencyScope', { level: frequencyLevel(frequency), scope: frequencyScopeLabel })">{{ t("nearbyStations.realEstate.scoreFrequencyScope", { level: frequencyLevel(frequency), scope: frequencyScopeLabel }) }}</span>
        <small>{{ t("nearbyStations.realEstate.transactionCount") }} · {{ n(neighborhood.transactionCount) }}</small>
      </div>
      <div v-if="city.transactionCount !== undefined && cityFrequency && cityFrequency !== 'low'" class="nearby-real-estate-verdict__city-frequency">
        {{ t(cityFrequency === "high" || cityFrequency === "very-high"
          ? "nearbyStations.realEstate.scoreFrequencyCityHigh"
          : "nearbyStations.realEstate.scoreFrequencyCityTypical") }}
        <span>{{ t("nearbyStations.realEstate.scoreFrequencyScope", { level: frequencyLevel(cityFrequency), scope: frequencyScopeLabel }) }}</span>
      </div>
      <p v-if="!neighborhood.hasEnoughSales" class="nearby-real-estate-verdict__sample-note">
        {{ t("nearbyStations.realEstate.noNeighborhoodData") }}
      </p>
    </template>
    <template v-else-if="city">
      <div class="nearby-real-estate-verdict__area">{{ city.name }}</div>
      <div class="nearby-real-estate-verdict__prices">
        <div>
          <span>{{ t("nearbyStations.realEstate.scoreCityMedian") }}</span>
          <strong>{{ formatPrice(city.medianPriceM2) }}</strong>
        </div>
        <div>
          <span>{{ t("nearbyStations.realEstate.mean") }}</span>
          <strong>{{ formatPrice(city.meanPriceM2) }}</strong>
        </div>
        <div>
          <span>{{ t("nearbyStations.realEstate.scoreRent") }}</span>
          <strong>{{ formatRent(rentPerSquareMeter) }}</strong>
        </div>
        <div>
          <span>{{ t("nearbyStations.realEstate.scoreYield") }}</span>
          <strong>{{ formatYield(grossRentalYield) }}</strong>
        </div>
      </div>
      <div v-if="city.transactionCount !== undefined" class="nearby-real-estate-verdict__city-frequency">
        {{ t(cityFrequency === "high" || cityFrequency === "very-high"
          ? "nearbyStations.realEstate.scoreFrequencyCityHigh"
          : cityFrequency === "low" ? "nearbyStations.realEstate.scoreFrequencyCityLow" : "nearbyStations.realEstate.scoreFrequencyCityTypical") }}
        <span v-if="frequencyLevel(cityFrequency)" :title="t('nearbyStations.realEstate.scoreFrequencyScope', { level: frequencyLevel(cityFrequency), scope: frequencyScopeLabel })">{{ t("nearbyStations.realEstate.scoreFrequencyScope", { level: frequencyLevel(cityFrequency), scope: frequencyScopeLabel }) }}</span>
      </div>
      <p class="nearby-real-estate-verdict__sample-note">{{ t("nearbyStations.realEstate.noNeighborhoodData") }}</p>
    </template>
    <p class="nearby-real-estate-verdict__footnote">
      {{ t("nearbyStations.realEstate.priceDisclaimer") }} {{ t("nearbyStations.realEstate.scoreLimit") }}
      <template v-if="rentPerSquareMeter && rentalReferencePeriod">
        {{ t("nearbyStations.realEstate.rentalEstimateNote", { period: rentalReferencePeriod }) }}
      </template>
    </p>
  </section>
</template>

<style scoped>
.nearby-real-estate-verdict {
  background: linear-gradient(135deg, #fffdfa 0%, #fff 54%, #fff8f5 100%);
  border: 1px solid rgba(190, 24, 47, .14);
  border-radius: 18px;
  box-shadow: 0 12px 34px rgba(65, 25, 35, .06);
  color: #243047;
  padding: clamp(16px, 2vw, 22px);
}
.nearby-real-estate-verdict__header { align-items: center; display: flex; gap: 12px; }
.nearby-real-estate-verdict__icon { align-items: center; background: #fff0c2; border: 1px solid #f4d885; border-radius: 12px; color: #9a6412; display: inline-flex; flex: 0 0 40px; height: 40px; justify-content: center; }
.nearby-real-estate-verdict__header p { color: #7b8495; font-size: .74rem; font-weight: 720; margin: 0 0 2px; }
.nearby-real-estate-verdict__header h2 { color: #18243a; font-size: 1rem; letter-spacing: -.015em; margin: 0; }
.nearby-real-estate-verdict__info { color: #8b93a2; margin-left: auto; flex: 0 0 auto; }
.nearby-real-estate-verdict__status { align-items: center; color: #667085; display: flex; gap: 8px; margin-top: 16px; }
.nearby-real-estate-verdict__spinner { animation: dvf-spin 1s linear infinite; border: 2px solid #f5d4cf; border-right-color: #bf3344; border-radius: 50%; height: 15px; width: 15px; }
.nearby-real-estate-verdict__area { color: #596579; font-size: .8rem; font-weight: 760; margin-top: 15px; }
.nearby-real-estate-verdict__prices { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 10px; }
.nearby-real-estate-verdict__prices > div { background: rgba(255,255,255,.82); border: 1px solid rgba(190, 24, 47, .11); border-radius: 12px; display: grid; gap: 5px; min-width: 0; padding: 11px 12px; }
.nearby-real-estate-verdict__prices span { color: #707b8e; font-size: .72rem; font-weight: 700; }
.nearby-real-estate-verdict__prices strong { color: #263247; font-size: clamp(.94rem, 2.4vw, 1.16rem); font-variant-numeric: tabular-nums; letter-spacing: -.025em; }
.nearby-real-estate-verdict__difference { color: #525f73; font-size: .77rem; margin: 9px 2px 0; }
.nearby-real-estate-verdict__trend { align-items: center; background: #f4f5f8; border: 1px solid rgba(100, 116, 139, .14); border-radius: 9px; color: #536176; display: flex; font-size: .75rem; font-weight: 720; gap: 7px; line-height: 1.4; margin: 10px 0 0; padding: 8px 10px; }
.nearby-real-estate-verdict__trend svg { color: #8b4254; flex: 0 0 auto; }
.nearby-real-estate-verdict__frequency { background: #f1f8f3; border: 1px solid rgba(42, 120, 71, .14); border-radius: 12px; color: #315d42; display: grid; gap: 4px; margin-top: 12px; padding: 11px 12px; }
.nearby-real-estate-verdict__frequency[data-frequency="low"], .nearby-real-estate-verdict__frequency[data-frequency="typical"] { background: #f6f7f9; border-color: rgba(100,116,139,.16); color: #596579; }
.nearby-real-estate-verdict__frequency strong { font-size: .8rem; }
.nearby-real-estate-verdict__frequency span, .nearby-real-estate-verdict__frequency small, .nearby-real-estate-verdict__city-frequency span { color: #687589; font-size: .7rem; }
.nearby-real-estate-verdict__city-frequency { color: #315d42; display: grid; font-size: .77rem; font-weight: 740; gap: 3px; margin-top: 9px; }
.nearby-real-estate-verdict__sample-note { color: #687589; font-size: .75rem; margin: 8px 2px 0; }
.nearby-real-estate-verdict__footnote { border-top: 1px solid rgba(100,116,139,.12); color: #788397; font-size: .68rem; line-height: 1.45; margin: 13px 0 0; padding-top: 10px; }
@keyframes dvf-spin { to { transform: rotate(360deg); } }
@media (max-width: 440px) { .nearby-real-estate-verdict__prices { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .nearby-real-estate-verdict__spinner { animation: none; } }
</style>
