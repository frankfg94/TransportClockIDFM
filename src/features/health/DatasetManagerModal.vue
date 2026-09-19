<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  FileText,
  HardDrive,
  Info,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  Scale,
  XCircle,
} from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import { toServerApiUrl } from "../../services/serverApi";
import { useI18n } from "../../i18n";
import type {
  DatasetFreshnessStatus,
  DatasetInfo,
  DatasetManagerResponse,
  DatasetSizeScope,
  DatasetState,
  DatasetStorage,
} from "./types";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { d, n, t } = useI18n();
const datasets = ref<DatasetInfo[]>([]);
const generatedAt = ref("");
const warningIds = ref<string[]>([]);
const loading = ref(false);
const errorMessage = ref("");
let requestSequence = 0;
let requestController: AbortController | undefined;

const availableCount = computed(() => datasets.value.filter((dataset) => dataset.state === "available").length);
const warningCount = computed(() => datasets.value.filter((dataset) =>
  dataset.state !== "available" || hasFreshnessWarning(dataset.freshness.status),
).length);
const unavailableCount = computed(() => datasets.value.filter((dataset) => dataset.state !== "available").length);

watch(
  () => props.open,
  (open) => {
    if (open) void loadDatasets();
    else requestController?.abort();
  },
  { immediate: true },
);

onBeforeUnmount(() => requestController?.abort());

async function loadDatasets(): Promise<void> {
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  const sequence = ++requestSequence;
  loading.value = true;
  errorMessage.value = "";

  try {
    const response = await fetch(toServerApiUrl("/api/datasets"), { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json() as DatasetManagerResponse;
    if (!Array.isArray(payload.datasets)) throw new Error("Invalid dataset response");
    if (sequence !== requestSequence) return;
    datasets.value = payload.datasets;
    generatedAt.value = payload.generatedAt;
    warningIds.value = Array.isArray(payload.warnings) ? payload.warnings : [];
  } catch (error) {
    if (controller.signal.aborted || sequence !== requestSequence) return;
    errorMessage.value = error instanceof Error ? error.message : t("health.datasets.loadFailed");
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function statusLabel(state: DatasetState): string {
  return {
    available: t("health.datasets.status.available"),
    partial: t("health.datasets.status.partial"),
    missing: t("health.datasets.status.missing"),
    disabled: t("health.datasets.status.disabled"),
    error: t("health.datasets.status.error"),
  }[state];
}

function storageLabel(storage: DatasetStorage): string {
  return {
    local: t("health.datasets.storage.local"),
    "cloudflare-r2": t("health.datasets.storage.cloudflareR2"),
    http: t("health.datasets.storage.http"),
    embedded: t("health.datasets.storage.embedded"),
    unconfigured: t("health.datasets.storage.unconfigured"),
  }[storage];
}

function freshnessLabel(status: DatasetFreshnessStatus): string {
  return {
    fresh: t("health.datasets.freshness.fresh"),
    aging: t("health.datasets.freshness.aging"),
    stale: t("health.datasets.freshness.stale"),
    unknown: t("health.datasets.freshness.unknown"),
  }[status];
}

function freshnessSummary(dataset: DatasetInfo): string {
  if (dataset.freshness.ageDays === undefined) return freshnessLabel(dataset.freshness.status);
  return `${n(dataset.freshness.ageDays)} ${t("health.datasets.freshness.days")} · ${freshnessLabel(dataset.freshness.status)}`;
}

function freshnessWarning(dataset: DatasetInfo): string {
  if (dataset.freshness.status === "stale") return t("health.datasets.freshness.staleWarning");
  if (dataset.freshness.status === "aging") return t("health.datasets.freshness.agingWarning");
  return t("health.datasets.freshness.unknownWarning");
}

function hasFreshnessWarning(status: DatasetFreshnessStatus): boolean {
  return status !== "fresh";
}

function formatDate(value: string | undefined): string {
  if (!value) return "";
  return d(new Date(value), { dateStyle: "medium", timeStyle: "short" });
}

function formatSize(bytes: number | undefined, scope: DatasetSizeScope | undefined): string {
  if (bytes === undefined && scope === "embedded") return t("health.datasets.size.embedded");
  if (bytes === undefined || !Number.isFinite(bytes)) return t("health.datasets.size.unknown");
  const units = [
    t("health.datasets.size.bytes"),
    t("health.datasets.size.kilobytes"),
    t("health.datasets.size.megabytes"),
    t("health.datasets.size.gigabytes"),
    t("health.datasets.size.terabytes"),
  ];
  if (bytes < 1024) return `${n(bytes)} ${units[0]}`;
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 2) {
    value /= 1024;
    unitIndex += 1;
  }
  const valueLabel = n(value, { maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2 });
  const scopeLabel = scope === "component"
    ? ` · ${t("health.datasets.size.component")}`
    : scope === "manifest"
      ? ` · ${t("health.datasets.size.manifest")}`
      : scope === "archive"
        ? ` · ${t("health.datasets.size.archive")}`
        : "";
  return `${valueLabel} ${units[unitIndex + 1]}${scopeLabel}`;
}

</script>

<template>
  <AppModal
    :open="open"
    :title="t('health.datasets.title')"
    :eyebrow="t('health.datasets.eyebrow')"
    panel-class="dataset-manager-modal"
    :close-label="t('common.actions.close')"
    @close="emit('close')"
  >
    <div class="dataset-manager-modal__intro">
      <p>{{ t("health.datasets.description") }}</p>
      <button
        class="dataset-manager-modal__refresh"
        type="button"
        :disabled="loading"
        @click="void loadDatasets()"
      >
        <RefreshCw :size="15" :class="{ 'dataset-manager-modal__spin': loading }" aria-hidden="true" />
        {{ t("health.datasets.refresh") }}
      </button>
    </div>

    <section v-if="loading && !datasets.length" class="dataset-manager-modal__state" role="status">
      <LoaderCircle class="dataset-manager-modal__spin" :size="22" aria-hidden="true" />
      {{ t("health.datasets.loading") }}
    </section>

    <section v-else-if="errorMessage && !datasets.length" class="dataset-manager-modal__state dataset-manager-modal__state--error" role="alert">
      <XCircle :size="20" aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </section>

    <template v-else>
      <section class="dataset-manager-modal__summary" aria-live="polite">
        <div>
          <strong>{{ t("health.datasets.summary", { available: availableCount, warnings: warningCount }) }}</strong>
          <span v-if="generatedAt">{{ t("health.datasets.generatedAt", { date: formatDate(generatedAt) }) }}</span>
        </div>
        <span v-if="unavailableCount" class="dataset-manager-modal__summary-warning">
          {{ t("health.datasets.unavailableCount", { count: unavailableCount }) }}
        </span>
      </section>

      <p v-if="errorMessage" class="dataset-manager-modal__inline-error" role="alert">{{ errorMessage }}</p>

      <div class="dataset-manager-modal__list" role="list" :aria-label="t('health.datasets.listAria')">
        <article
          v-for="dataset in datasets"
          :key="dataset.id"
          class="dataset-card"
          :class="`dataset-card--${dataset.state}`"
          role="listitem"
        >
          <header class="dataset-card__header">
            <div class="dataset-card__title">
              <span class="dataset-card__icon" aria-hidden="true">
                <Database v-if="dataset.state === 'available'" :size="18" />
                <AlertTriangle v-else-if="dataset.state === 'partial'" :size="18" />
                <XCircle v-else :size="18" />
              </span>
              <div>
                <h3>{{ dataset.title }}</h3>
                <p>{{ dataset.description }}</p>
              </div>
            </div>
            <span class="dataset-card__status">
              <CheckCircle2 v-if="dataset.state === 'available'" :size="14" aria-hidden="true" />
              <AlertTriangle v-else-if="dataset.state === 'partial'" :size="14" aria-hidden="true" />
              <XCircle v-else :size="14" aria-hidden="true" />
              {{ statusLabel(dataset.state) }}
            </span>
          </header>

          <div class="dataset-card__badges">
            <span class="dataset-card__badge">
              <Cloud v-if="dataset.storage === 'cloudflare-r2' || dataset.storage === 'http'" :size="14" aria-hidden="true" />
              <HardDrive v-else :size="14" aria-hidden="true" />
              {{ storageLabel(dataset.storage) }}
            </span>
            <span class="dataset-card__badge"><FileText :size="14" aria-hidden="true" /> {{ dataset.format }}</span>
            <span class="dataset-card__badge"><PackageOpen :size="14" aria-hidden="true" /> {{ formatSize(dataset.sizeBytes, dataset.sizeScope) }}</span>
          </div>

          <dl class="dataset-card__details">
            <div>
              <dt>{{ t("health.datasets.fields.state") }}</dt>
              <dd>{{ statusLabel(dataset.state) }}</dd>
            </div>
            <div>
              <dt>{{ t("health.datasets.fields.provenance") }}</dt>
              <dd>{{ storageLabel(dataset.storage) }}</dd>
            </div>
            <div>
              <dt>{{ t("health.datasets.fields.freshness") }}</dt>
              <dd :class="{ 'dataset-card__value--warning': hasFreshnessWarning(dataset.freshness.status) }">
                <CalendarClock :size="14" aria-hidden="true" />
                {{ freshnessSummary(dataset) }}
              </dd>
            </div>
            <div>
              <dt>{{ t("health.datasets.fields.size") }}</dt>
              <dd>{{ formatSize(dataset.sizeBytes, dataset.sizeScope) }}</dd>
            </div>
            <div>
              <dt>{{ t("health.datasets.fields.format") }}</dt>
              <dd>{{ dataset.format }}</dd>
            </div>
            <div>
              <dt>{{ t("health.datasets.fields.license") }}</dt>
              <dd>
                <a v-if="dataset.license.url" :href="dataset.license.url" target="_blank" rel="noopener noreferrer">
                  {{ dataset.license.label }} <ExternalLink :size="12" aria-hidden="true" />
                </a>
                <span v-else>{{ dataset.license.label }}</span>
              </dd>
            </div>
          </dl>

          <div v-if="dataset.metrics?.length" class="dataset-card__metrics">
            <span v-for="metric in dataset.metrics" :key="`${dataset.id}:${metric.label}`">
              <strong>{{ metric.label }}</strong> {{ metric.value }}
            </span>
          </div>

          <p v-if="hasFreshnessWarning(dataset.freshness.status)" class="dataset-card__warning" role="note">
            <AlertTriangle :size="15" aria-hidden="true" />
            {{ freshnessWarning(dataset) }}
          </p>

          <p v-if="dataset.updatedAt || dataset.generatedAt || dataset.installedAt || dataset.referencePeriod" class="dataset-card__dates">
            <span v-if="dataset.updatedAt">{{ t("health.datasets.updatedAt", { date: formatDate(dataset.updatedAt) }) }}</span>
            <span v-if="dataset.generatedAt">{{ t("health.datasets.generatedAt", { date: formatDate(dataset.generatedAt) }) }}</span>
            <span v-if="dataset.installedAt">{{ t("health.datasets.installedAt", { date: formatDate(dataset.installedAt) }) }}</span>
            <span v-if="dataset.referencePeriod">{{ t("health.datasets.referencePeriod", { period: dataset.referencePeriod }) }}</span>
          </p>

          <p v-if="dataset.details" class="dataset-card__details-note">
            <Info :size="14" aria-hidden="true" />
            {{ dataset.details }}
          </p>

          <div v-if="dataset.sourceUrl || dataset.resourceUrl" class="dataset-card__links">
            <a v-if="dataset.sourceUrl" :href="dataset.sourceUrl" target="_blank" rel="noopener noreferrer">
              <ExternalLink :size="14" aria-hidden="true" />
              {{ t("health.datasets.sourceLink") }}
            </a>
            <a v-if="dataset.resourceUrl" :href="dataset.resourceUrl" target="_blank" rel="noopener noreferrer">
              <Scale :size="14" aria-hidden="true" />
              {{ t("health.datasets.resourceLink") }}
            </a>
          </div>
        </article>
      </div>

      <p v-if="warningIds.length" class="dataset-manager-modal__footnote">
        <Info :size="14" aria-hidden="true" />
        {{ t("health.datasets.warningFootnote", { count: warningIds.length }) }}
      </p>
    </template>

    <template #footer>
      <button class="button-secondary" type="button" @click="emit('close')">
        {{ t("common.actions.close") }}
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
:global(.dataset-manager-modal) { max-width: 980px; min-width: 0; width: min(100%, 980px); }
.dataset-manager-modal__intro { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; margin-bottom: 14px; }
.dataset-manager-modal__intro p { color: #64748b; font-size: .82rem; line-height: 1.45; margin: 0; max-width: 720px; }
.dataset-manager-modal__refresh { align-items: center; background: #fff; border: 1px solid rgba(81,70,255,.2); border-radius: 8px; color: #4034df; display: inline-flex; flex: 0 0 auto; font: inherit; font-size: .72rem; font-weight: 850; gap: 6px; min-height: 34px; padding: 7px 10px; }
.dataset-manager-modal__refresh:hover:not(:disabled), .dataset-manager-modal__refresh:focus-visible { background: #efeeff; border-color: #5146ff; outline: 0; }
.dataset-manager-modal__refresh:disabled { cursor: wait; opacity: .65; }
.dataset-manager-modal__summary { align-items: center; background: #f8f8ff; border: 1px solid rgba(81,70,255,.14); border-radius: 10px; display: flex; gap: 12px; justify-content: space-between; margin-bottom: 14px; padding: 11px 13px; }
.dataset-manager-modal__summary div { display: grid; gap: 2px; }
.dataset-manager-modal__summary strong { color: #18233f; font-size: .78rem; }
.dataset-manager-modal__summary span { color: #64748b; font-size: .68rem; }
.dataset-manager-modal__summary-warning { background: #fff1d5; border-radius: 999px; color: #915b00 !important; font-weight: 850; padding: 4px 7px; white-space: nowrap; }
.dataset-manager-modal__state { align-items: center; background: #f8f8ff; border: 1px dashed rgba(81,70,255,.25); border-radius: 10px; color: #5146ff; display: flex; font-size: .8rem; font-weight: 800; gap: 8px; justify-content: center; min-height: 100px; padding: 18px; }
.dataset-manager-modal__state--error { background: #fff5f4; border-color: rgba(180,35,24,.2); color: #a5231d; }
.dataset-manager-modal__inline-error { background: #fff5f4; border-radius: 8px; color: #a5231d; font-size: .72rem; margin: 0 0 12px; padding: 8px 10px; }
.dataset-manager-modal__list { display: grid; gap: 10px; max-height: min(67vh, 680px); overflow: auto; padding: 2px; }
.dataset-card { background: #fff; border: 1px solid rgba(16,35,63,.1); border-left: 4px solid #14b87a; border-radius: 11px; display: grid; gap: 11px; min-width: 0; padding: 13px; }
.dataset-card--partial { border-left-color: #f59e0b; }
.dataset-card--missing, .dataset-card--disabled, .dataset-card--error { border-left-color: #ef4444; }
.dataset-card--disabled { border-left-color: #94a3b8; }
.dataset-card__header { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; min-width: 0; }
.dataset-card__title { align-items: flex-start; display: flex; gap: 9px; min-width: 0; }
.dataset-card__icon { align-items: center; background: #e3f5e9; border-radius: 8px; color: #087a50; display: inline-flex; flex: 0 0 34px; height: 34px; justify-content: center; width: 34px; }
.dataset-card--partial .dataset-card__icon { background: #fff7d6; color: #9a5b00; }
.dataset-card--missing .dataset-card__icon, .dataset-card--error .dataset-card__icon { background: #ffe3e3; color: #bd1f32; }
.dataset-card--disabled .dataset-card__icon { background: #eef2f7; color: #64748b; }
.dataset-card__title h3 { color: #18233f; font-size: .9rem; line-height: 1.2; margin: 0; overflow-wrap: anywhere; }
.dataset-card__title p { color: #64748b; font-size: .72rem; line-height: 1.4; margin: 3px 0 0; }
.dataset-card__status { align-items: center; background: #dffbea; border-radius: 999px; color: #087a50; display: inline-flex; flex: 0 0 auto; font-size: .66rem; font-weight: 900; gap: 4px; padding: 5px 7px; white-space: nowrap; }
.dataset-card--partial .dataset-card__status { background: #fff7d6; color: #9a5b00; }
.dataset-card--missing .dataset-card__status, .dataset-card--error .dataset-card__status { background: #ffe3e3; color: #bd1f32; }
.dataset-card--disabled .dataset-card__status { background: #eef2f7; color: #64748b; }
.dataset-card__badges { display: flex; flex-wrap: wrap; gap: 6px; }
.dataset-card__badge { align-items: center; background: #f8fafc; border: 1px solid rgba(16,35,63,.08); border-radius: 999px; color: #475569; display: inline-flex; font-size: .65rem; font-weight: 800; gap: 4px; max-width: 100%; padding: 5px 7px; }
.dataset-card__details { border-top: 1px solid rgba(16,35,63,.08); display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; padding-top: 10px; }
.dataset-card__details > div { align-items: baseline; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
.dataset-card__details dt { color: #64748b; flex: 0 0 auto; font-size: .64rem; font-weight: 900; text-transform: uppercase; }
.dataset-card__details dd { align-items: center; color: #18233f; display: inline-flex; font-size: .7rem; font-weight: 800; gap: 3px; margin: 0; min-width: 0; overflow-wrap: anywhere; text-align: right; }
.dataset-card__details dd a { align-items: center; color: #4034df; display: inline-flex; gap: 3px; text-decoration: none; }
.dataset-card__details dd a:hover, .dataset-card__details dd a:focus-visible { text-decoration: underline; }
.dataset-card__value--warning { color: #9a5b00 !important; }
.dataset-card__metrics { display: flex; flex-wrap: wrap; gap: 5px 12px; }
.dataset-card__metrics span { color: #64748b; font-size: .66rem; }
.dataset-card__metrics strong { color: #475569; font-weight: 900; }
.dataset-card__warning { align-items: flex-start; background: #fff8e8; border-radius: 8px; color: #8d5700; display: flex; font-size: .7rem; gap: 6px; line-height: 1.4; margin: 0; padding: 7px 8px; }
.dataset-card__dates { color: #64748b; display: flex; flex-wrap: wrap; font-size: .66rem; gap: 4px 11px; line-height: 1.4; margin: 0; }
.dataset-card__dates span + span::before { content: "·"; margin-right: 11px; }
.dataset-card__details-note { align-items: flex-start; color: #64748b; display: flex; font-size: .68rem; gap: 6px; line-height: 1.4; margin: 0; }
.dataset-card__links { display: flex; flex-wrap: wrap; gap: 8px 14px; }
.dataset-card__links a { align-items: center; color: #4034df; display: inline-flex; font-size: .7rem; font-weight: 850; gap: 5px; text-decoration: none; }
.dataset-card__links a:hover, .dataset-card__links a:focus-visible { text-decoration: underline; }
.dataset-manager-modal__footnote { align-items: center; color: #64748b; display: flex; font-size: .68rem; gap: 6px; line-height: 1.4; margin: 12px 2px 0; }
.dataset-manager-modal__spin { animation: dataset-manager-spin 900ms linear infinite; }
@keyframes dataset-manager-spin { to { transform: rotate(360deg); } }
@media (max-width: 680px) {
  .dataset-manager-modal__intro, .dataset-manager-modal__summary { align-items: stretch; flex-direction: column; }
  .dataset-manager-modal__refresh { justify-content: center; }
  .dataset-card__header { flex-direction: column; }
  .dataset-card__status { align-self: flex-start; }
  .dataset-card__details { grid-template-columns: 1fr; }
  .dataset-card__details > div { align-items: flex-start; }
  .dataset-card__details dd { text-align: left; }
}
</style>
