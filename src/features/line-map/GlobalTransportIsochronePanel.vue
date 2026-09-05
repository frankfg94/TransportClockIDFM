<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AlertTriangle, Footprints, LoaderCircle, Radar, X } from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import { useI18n } from "../../i18n";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import {
  GLOBAL_ISOCHRONE_MINUTES,
  isGlobalIsochroneMinutes,
  type GlobalIsochroneCoverage,
  type GlobalIsochroneMinutes,
  type GlobalIsochroneSettings,
  type GlobalIsochroneStatus,
} from "../transport-map/isochrones/contracts";
import GlobalTransportPlanModeIcon from "./GlobalTransportPlanModeIcon.vue";

const props = defineProps<{
  open: boolean;
  modalOpen: boolean;
  enabled: boolean;
  settings: GlobalIsochroneSettings;
  modes: readonly GlobalMapMode[];
  eligibleModes: readonly GlobalMapMode[];
  focusMode?: GlobalMapMode;
  status: GlobalIsochroneStatus;
  coverage: GlobalIsochroneCoverage;
  suspended: boolean;
  scopeLabel: string;
  attribution: string;
  buildCommand: string;
  modeLabel: (mode: GlobalMapMode) => string;
}>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:enabled": [value: boolean];
  "update:mode": [mode: GlobalMapMode, setting: { enabled: boolean; minutes: GlobalIsochroneMinutes }];
  "open-modal": [];
  "close-modal": [];
  retry: [];
}>();
const { t } = useI18n();
const panel = ref<HTMLElement>();
const modalBody = ref<HTMLElement>();
let panelReturnFocus: HTMLElement | undefined;
let modalReturnFocus: HTMLElement | undefined;

const statusLabel = computed(() => {
  if (props.suspended && props.enabled) return t("globalMap.radar.suspended");
  if (!props.enabled) return t("globalMap.radar.off");
  if (props.status === "ready") return t("globalMap.radar.ready", { count: props.coverage.available });
  if (props.status === "partial") return t("globalMap.radar.partial", { available: props.coverage.available, total: props.coverage.total });
  if (props.status === "loading") return t("globalMap.radar.loading");
  if (props.status === "idle") return t("globalMap.radar.noModes");
  return t("globalMap.radar.unavailable");
});
const needsAttention = computed(() => ["partial", "missing", "incompatible", "error"].includes(props.status));
const noticeTitle = computed(() => props.status === "partial" ? t("globalMap.radar.partialTitle") : t("globalMap.radar.unavailableTitle"));
const noticeBody = computed(() => {
  if (props.status === "partial") return t("globalMap.radar.partialBody", { available: props.coverage.available, total: props.coverage.total, missing: props.coverage.missing });
  if (props.status === "missing") return t("globalMap.radar.missingBody");
  if (props.status === "incompatible") return t("globalMap.radar.incompatibleBody");
  return t("globalMap.radar.errorBody");
});

function changeMinutes(mode: GlobalMapMode, event: Event): void {
  const minutes = Number((event.target as HTMLSelectElement).value);
  if (isGlobalIsochroneMinutes(minutes)) emit("update:mode", mode, { ...props.settings[mode], minutes });
}

function showStatus(): void {
  if (needsAttention.value) emit("open-modal");
  else emit("update:open", true);
}

watch(() => [props.open, props.focusMode] as const, async ([open], [wasOpen]) => {
  if (open && !wasOpen) panelReturnFocus = document.activeElement as HTMLElement;
  await nextTick();
  if (open) {
    const target = props.focusMode ? panel.value?.querySelector<HTMLElement>(`[data-radar-mode="${props.focusMode}"] input`) : undefined;
    (target ?? panel.value?.querySelector<HTMLElement>("[data-radar-master]"))?.focus();
  } else if (wasOpen && !props.modalOpen && panelReturnFocus?.isConnected) panelReturnFocus.focus();
}, { flush: "pre" });

watch(() => props.modalOpen, async (open) => {
  if (open) modalReturnFocus = document.activeElement as HTMLElement;
  await nextTick();
  if (open) modalBody.value?.closest("[role=dialog]")?.querySelector<HTMLElement>("button")?.focus();
  else if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
});

function onKeydown(event: KeyboardEvent): void {
  const dialog = props.modalOpen ? modalBody.value?.closest<HTMLElement>("[role=dialog]") : undefined;
  if (event.key === "Escape" && (dialog || (props.open && panel.value?.contains(event.target as Node)))) {
    event.preventDefault();
    event.stopPropagation();
    if (dialog) emit("close-modal");
    else emit("update:open", false);
  } else if (event.key === "Tab" && dialog) {
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex='0']"));
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    if (current < 0 || (event.shiftKey ? current === 0 : current === focusable.length - 1)) {
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
    }
  }
}
onMounted(() => document.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <aside
    v-if="open"
    id="global-map-radar-panel"
    ref="panel"
    class="walking-radar"
    :aria-label="t('globalMap.radar.title')"
    data-global-map-radar-panel
    @keydown.stop
    @wheel.stop
    @pointerdown.stop
  >
    <header class="walking-radar__header">
      <span class="walking-radar__icon"><Radar :size="22" aria-hidden="true" /></span>
      <h2>{{ t("globalMap.radar.title") }}</h2>
      <button type="button" class="walking-radar__close" :aria-label="t('common.actions.close')" @click="emit('update:open', false)">
        <X :size="19" aria-hidden="true" />
      </button>
    </header>
    <p class="walking-radar__description">{{ t("globalMap.radar.description") }}</p>
    <label class="walking-radar__master">
      <span><Footprints :size="18" aria-hidden="true" />{{ t("globalMap.radar.enable") }}</span>
      <input
        type="checkbox"
        role="switch"
        data-radar-master
        :checked="enabled"
        @change="emit('update:enabled', ($event.target as HTMLInputElement).checked)"
      />
    </label>
    <p class="walking-radar__scope">{{ scopeLabel }}</p>
    <div class="walking-radar__modes" role="group" :aria-label="t('globalMap.radar.modesAria')">
      <div v-for="mode in modes" :key="mode" class="walking-radar__mode" :class="{ 'walking-radar__mode--outside': !eligibleModes.includes(mode) }" :data-radar-mode="mode">
        <label class="walking-radar__mode-label">
          <input
            type="checkbox"
            :checked="settings[mode].enabled"
            :aria-label="t('globalMap.radar.enableMode', { mode: modeLabel(mode) })"
            @change="emit('update:mode', mode, { ...settings[mode], enabled: ($event.target as HTMLInputElement).checked })"
          />
          <GlobalTransportPlanModeIcon :mode="mode" :size="18" aria-hidden="true" />
          <span>{{ modeLabel(mode) }}<small v-if="!eligibleModes.includes(mode)">{{ t("globalMap.radar.outsideSelection") }}</small></span>
        </label>
        <select :value="settings[mode].minutes" :aria-label="t('globalMap.radar.durationMode', { mode: modeLabel(mode) })" @change="changeMinutes(mode, $event)">
          <option v-for="minutes in GLOBAL_ISOCHRONE_MINUTES" :key="minutes" :value="minutes">{{ t("globalMap.radar.minutes", { count: minutes }) }}</option>
        </select>
      </div>
    </div>
    <p class="walking-radar__hint">{{ t("globalMap.radar.independentFilters") }}</p>
    <div class="walking-radar__status" :class="{ 'walking-radar__status--warning': needsAttention }" role="status" aria-live="polite">
      <LoaderCircle v-if="status === 'loading'" class="walking-radar__spinner" :size="16" aria-hidden="true" />
      <AlertTriangle v-else-if="needsAttention" :size="16" aria-hidden="true" />
      <span>{{ statusLabel }}</span>
      <button v-if="needsAttention && enabled && !suspended" type="button" @click="emit('open-modal')">{{ t("globalMap.radar.details") }}</button>
    </div>
    <p v-if="enabled && coverage.available" class="walking-radar__attribution">{{ attribution }}</p>
  </aside>

  <button
    v-if="enabled && !open && !suspended"
    type="button"
    class="walking-radar-badge"
    :class="{ 'walking-radar-badge--warning': needsAttention }"
    data-global-map-radar-status
    :aria-label="`${t('globalMap.radar.title')} · ${statusLabel}`"
    @click="showStatus"
  >
    <AlertTriangle v-if="needsAttention" :size="17" aria-hidden="true" />
    <Radar v-else :size="17" aria-hidden="true" />
    <span role="status" aria-live="polite">{{ statusLabel }}<small v-if="coverage.available">{{ attribution }}</small></span>
  </button>

  <AppModal :open="modalOpen" :title="noticeTitle" :eyebrow="t('globalMap.radar.title')" panel-class="walking-radar-modal" @close="emit('close-modal')">
    <div ref="modalBody" class="walking-radar-notice" data-global-map-radar-notice>
      <p>{{ noticeBody }}</p>
      <p>{{ t("globalMap.radar.generateHelp") }}</p>
      <code>{{ buildCommand }}</code>
      <p class="walking-radar__hint">{{ t("globalMap.radar.noApproximation") }}</p>
    </div>
    <template #footer>
      <button type="button" class="walking-radar-notice__button" @click="emit('close-modal')">{{ status === "partial" ? t("globalMap.radar.keepAvailable") : t("common.actions.close") }}</button>
      <button type="button" class="walking-radar-notice__button walking-radar-notice__button--primary" data-radar-retry @click="emit('retry')">{{ t("globalMap.radar.retry") }}</button>
    </template>
  </AppModal>
</template>

<style scoped>
.walking-radar {
  position: absolute;
  z-index: 24;
  top: 14px;
  right: 14px;
  width: min(365px, calc(100% - 28px));
  max-height: calc(100% - 28px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px;
  box-sizing: border-box;
  border: 1px solid #dbe5f1;
  border-radius: 18px;
  background: var(--map-panel, rgba(255, 255, 255, 0.97));
  color: #24334c;
  box-shadow: 0 16px 48px #0f172a26;
  backdrop-filter: blur(15px);
  font-size: 0.8rem;
}
.walking-radar__header, .walking-radar__master, .walking-radar__master > span, .walking-radar__mode, .walking-radar__mode-label, .walking-radar__status { display: flex; align-items: center; gap: 10px; }
.walking-radar__header h2 { margin: 0; font-size: 1.02rem; letter-spacing: -0.02em; }
.walking-radar__icon { display: grid; place-items: center; padding: 8px; border-radius: 12px; background: #eff6ff; color: #2563eb; }
.walking-radar__close { margin-left: auto; display: grid; place-items: center; padding: 8px; border: 0; border-radius: 8px; background: transparent; color: #64748b; cursor: pointer; }
.walking-radar__close:hover { background: #f1f5f9; }
.walking-radar__description { margin: 12px 0 16px; line-height: 1.5; color: #64748b; }
.walking-radar__master { justify-content: space-between; padding: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 11px; font-weight: 750; cursor: pointer; }
.walking-radar input { width: 17px; height: 17px; flex-shrink: 0; accent-color: #2563eb; cursor: pointer; }
.walking-radar__scope { margin: 13px 0; color: #47658e; font-size: 0.73rem; line-height: 1.5; }
.walking-radar__modes { display: grid; gap: 3px; }
.walking-radar__mode { min-height: 44px; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f5f9; }
.walking-radar__mode-label { flex: 1; min-width: 0; cursor: pointer; font-weight: 650; }
.walking-radar__mode-label small { display: block; margin-top: 3px; font-size: 0.62rem; font-weight: 500; color: #64748b; }
.walking-radar__mode--outside { color: #64748b; }
.walking-radar select { padding: 7px 8px; border: 1px solid #d7e0ed; border-radius: 8px; background: #fff; color: #334155; font: inherit; cursor: pointer; }
.walking-radar__hint { margin: 13px 0 0; color: #64748b; font-size: 0.7rem; line-height: 1.5; }
.walking-radar__status { position: sticky; bottom: 0; z-index: 1; margin-top: 15px; padding: 10px; border-radius: 8px; background: #f1f5f9; font-size: 0.73rem; line-height: 1.4; }
.walking-radar__status svg { flex-shrink: 0; }
.walking-radar__status button { margin-left: auto; padding: 2px; border: 0; background: transparent; color: inherit; text-decoration: underline; font: inherit; cursor: pointer; }
.walking-radar__status--warning, .walking-radar-badge--warning { background: #fffbeb; color: #92400e; }
.walking-radar__attribution { margin: 9px 0 0; font-size: 0.61rem; color: #64748b; }
.walking-radar-badge { position: absolute; z-index: 16; left: 50%; bottom: 88px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; max-width: calc(100% - 28px); padding: 9px 13px; border: 1px solid #d7e0ed; border-radius: 12px; background: #fff; color: #315b91; box-shadow: 0 3px 15px #0f172a19; font: inherit; font-size: 0.75rem; cursor: pointer; }
.walking-radar-badge--warning { border-color: #fcd34d; background: #fffbeb; color: #92400e; }
.walking-radar-badge small { display: block; margin-top: 3px; font-size: 0.56rem; }
.walking-radar-notice p { margin: 0 0 14px; line-height: 1.6; }
.walking-radar-notice code { display: block; padding: 13px; margin: 16px 0; overflow-wrap: anywhere; border-radius: 9px; background: #0f172a; color: #dbeafe; font-size: 0.78rem; }
.walking-radar-notice__button { padding: 9px 14px; border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; color: #334155; font: inherit; cursor: pointer; }
.walking-radar-notice__button--primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.walking-radar :is(button, input, select):focus-visible, .walking-radar-badge:focus-visible, .walking-radar-notice__button:focus-visible { outline: 3px solid #60a5fa; outline-offset: 2px; }
.walking-radar__spinner { animation: walking-radar-spin 1s linear infinite; }
@keyframes walking-radar-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .walking-radar__spinner { animation: none; } }
@media (max-width: 700px) { .walking-radar { top: 10px; right: 10px; width: calc(100% - 20px); max-height: calc(100% - 20px); padding: 15px; } .walking-radar-badge { bottom: 92px; } }
</style>
