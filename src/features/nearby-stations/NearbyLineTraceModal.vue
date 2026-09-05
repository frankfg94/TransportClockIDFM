<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { X } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { GlobalMapLine } from "../transport-map/contracts/manifest";
import CitiesLinePattern from "../line-map/CitiesLinePattern.vue";
import type { CitiesLinePatternCity } from "../line-map/citiesLinePattern";

const props = withDefaults(defineProps<{
  open: boolean;
  line?: GlobalMapLine;
  direction?: string;
  currentCity?: string;
  cities: readonly CitiesLinePatternCity[];
}>(), {
  line: undefined,
  direction: "",
  currentCity: "",
});

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

let scrollLocked = false;
let previousHtmlOverflow = "";
let previousBodyOverflow = "";

function lockDocumentScroll(): void {
  if (scrollLocked || typeof document === "undefined") return;
  previousHtmlOverflow = document.documentElement.style.overflow;
  previousBodyOverflow = document.body.style.overflow;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  scrollLocked = true;
}

function restoreDocumentScroll(): void {
  if (!scrollLocked || typeof document === "undefined") return;
  document.documentElement.style.overflow = previousHtmlOverflow;
  document.body.style.overflow = previousBodyOverflow;
  scrollLocked = false;
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
}

watch(() => props.open, (open) => {
  if (typeof window === "undefined") return;
  if (open) {
    lockDocumentScroll();
    window.addEventListener("keydown", handleKeydown);
  } else {
    window.removeEventListener("keydown", handleKeydown);
    restoreDocumentScroll();
  }
}, { immediate: true });

onBeforeUnmount(() => {
  if (typeof window === "undefined") return;
  window.removeEventListener("keydown", handleKeydown);
  restoreDocumentScroll();
});

function lineLabel(): string {
  return props.line?.label?.trim() || props.line?.code?.trim() || "—";
}
</script>

<template>
  <div
    v-if="open"
    class="nearby-line-trace-modal"
    role="presentation"
    @click.self="emit('close')"
    @keydown="handleKeydown"
  >
    <section
      class="nearby-line-trace-modal__panel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('nearbyStations.lineTraceTitle', { line: lineLabel() })"
    >
      <header class="nearby-line-trace-modal__header">
        <div class="nearby-line-trace-modal__heading">
          <span
            class="nearby-line-trace-modal__line-badge"
            :style="{
              backgroundColor: line?.color || '#5146ff',
              color: line?.textColor || '#fff',
            }"
          >{{ lineLabel() }}</span>
          <div>
            <p class="nearby-line-trace-modal__eyebrow">{{ t("nearbyStations.lineTraceEyebrow") }}</p>
            <h2>{{ t("nearbyStations.lineTraceTitle", { line: lineLabel() }) }}</h2>
            <p v-if="direction" class="nearby-line-trace-modal__direction">
              {{ t("nearbyStations.lineTraceDirection", { direction }) }}
              <span v-if="currentCity"> · {{ t("nearbyStations.lineTraceCurrent", { city: currentCity }) }}</span>
            </p>
          </div>
        </div>
        <button
          class="nearby-line-trace-modal__close"
          type="button"
          :aria-label="t('common.actions.close')"
          :title="t('common.actions.close')"
          @click="emit('close')"
        >
          <X :size="20" aria-hidden="true" />
        </button>
      </header>

      <div class="nearby-line-trace-modal__body">
        <CitiesLinePattern
          v-if="line"
          :cities="cities"
          :line-color="line.color"
          :line-mode="line.mode"
          :active-from-city="currentCity"
          :empty-label="t('nearbyStations.lineTraceEmpty')"
        />
        <p v-else class="nearby-line-trace-modal__empty">{{ t("nearbyStations.lineTraceEmpty") }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
 .nearby-line-trace-modal { background: rgba(16, 25, 58, .86); display: flex; inset: 0; position: fixed; z-index: 12000; }
 .nearby-line-trace-modal__panel { background: #fff; display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; overflow: hidden; width: 100%; }
.nearby-line-trace-modal__header { align-items: flex-start; border-bottom: 1px solid rgba(16,35,63,.1); display: flex; gap: 16px; justify-content: space-between; padding: 22px 24px; }
.nearby-line-trace-modal__heading { align-items: center; display: flex; gap: 14px; min-width: 0; }
.nearby-line-trace-modal__line-badge { align-items: center; border-radius: 10px; display: inline-flex; flex: 0 0 auto; font-size: 1.05rem; font-weight: 950; justify-content: center; min-height: 42px; min-width: 52px; padding: 0 10px; }
.nearby-line-trace-modal__eyebrow { color: #5146ff; font-size: .68rem; font-weight: 900; letter-spacing: .1em; margin: 0 0 4px; text-transform: uppercase; }
.nearby-line-trace-modal h2 { color: #18233f; font-size: clamp(1.15rem, 2.2vw, 1.55rem); margin: 0; }
.nearby-line-trace-modal__direction { color: #64708d; font-size: .78rem; font-weight: 760; margin: 5px 0 0; }
.nearby-line-trace-modal__close { align-items: center; background: #f3f1ff; border: 1px solid rgba(81,70,255,.16); border-radius: 10px; color: #4034df; display: inline-flex; flex: 0 0 auto; height: 38px; justify-content: center; padding: 0; width: 38px; }
.nearby-line-trace-modal__close:hover, .nearby-line-trace-modal__close:focus-visible { background: #4034df; color: #fff; outline: 0; }
 .nearby-line-trace-modal__body { overflow: auto; padding: clamp(24px, 5vw, 56px); }
 .nearby-line-trace-modal__body :deep(.cities-line-pattern) { margin: 0 auto; max-width: 820px; }
.nearby-line-trace-modal__body :deep(.cities-line-pattern__item) { min-height: 64px; }
.nearby-line-trace-modal__body :deep(.cities-line-pattern__content strong) { font-size: .92rem; }
.nearby-line-trace-modal__body :deep(.cities-line-pattern__content small) { font-size: .7rem; }
.nearby-line-trace-modal__empty { color: #8491a9; margin: 0; }
@media (max-width: 680px) {
  .nearby-line-trace-modal__header { padding: max(16px, env(safe-area-inset-top)) 16px 16px; }
  .nearby-line-trace-modal__body { padding: 18px 16px max(18px, env(safe-area-inset-bottom)); }
}
</style>
