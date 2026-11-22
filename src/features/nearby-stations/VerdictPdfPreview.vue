<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { translate } from "../../i18n";
import { pdfLabel, pdfNumber, type PdfLabel, type VerdictPdfGroup, type VerdictPdfPage, type VerdictPdfReport } from "./verdictPdfReport";

const props = defineProps<{ report: VerdictPdfReport; preview?: boolean }>();
const root = ref<HTMLElement>();
const scale = ref(1);
const limits = ref<Record<string, number[]>>({});
const layoutError = ref(false);
const locale = computed(() => props.report.locale);
const p = (key: PdfLabel, values?: Parameters<typeof pdfLabel>[2]) => pdfLabel(locale.value, key, values);
const noValue = computed(() => translate(locale.value, "nearbyStations.neighborhoodScore.pdfScoreUnavailable"));
let observer: ResizeObserver | undefined;
let fitVersion = 0;

function groups(page: VerdictPdfPage): VerdictPdfGroup[] {
  return "groups" in page ? page.groups : [];
}

function visibleCount(page: VerdictPdfPage, group: VerdictPdfGroup, index: number): number {
  const maximum = page.kind === "overview" ? 4 : page.kind === "category" ? (group.tone === "neutral" ? 6 : 7) : 18;
  return limits.value[page.id]?.[index] ?? Math.min(group.items.length, maximum);
}

function omitted(page: VerdictPdfPage): number {
  return groups(page).reduce((count, group, index) => count + group.items.length - visibleCount(page, group, index), 0);
}

function metricValue(value?: number, unit?: string): string {
  if (value === undefined || !Number.isFinite(value)) return noValue.value;
  return `${pdfNumber(locale.value, value)}${unit ? ` ${unit}` : ""}`;
}

async function fitPages(): Promise<HTMLElement | undefined> {
  const version = ++fitVersion;
  limits.value = {};
  await nextTick();
  await document.fonts?.ready;
  if (!root.value || version !== fitVersion) return;
  const sheets = Array.from(root.value.querySelectorAll<HTMLElement>("[data-verdict-pdf-sheet]"));
  for (const [index, sheet] of sheets.entries()) {
    const page = props.report.pages[index]!;
    const body = sheet.querySelector<HTMLElement>("[data-pdf-body]")!;
    const flow = body.firstElementChild as HTMLElement;
    while (flow.offsetHeight > body.clientHeight + 1) {
      const pageGroups = groups(page);
      const counts = pageGroups.map((group, position) => visibleCount(page, group, position));
      // Keep the limitations ahead of the source list and the lead facts in each category.
      const position = page.kind === "sources" && counts[1]! > 1 ? 1
        : counts.reduce((largest, count, current) => count >= (counts[largest] ?? 0) ? current : largest, -1);
      if (position < 0 || !counts[position]) throw new Error(`Verdict PDF page overflows: ${page.id}`);
      counts[position] = counts[position]! - 1;
      limits.value = { ...limits.value, [page.id]: counts };
      await nextTick();
      if (version !== fitVersion) return;
    }
  }
  return root.value;
}

function updateScale(): void {
  const sheet = root.value?.querySelector<HTMLElement>("[data-verdict-pdf-sheet]");
  if (root.value && sheet?.offsetWidth) scale.value = Math.max(.1, Math.min(1, (root.value.clientWidth - 24) / sheet.offsetWidth));
}

function fitPreview(): void {
  layoutError.value = false;
  void fitPages().then(updateScale).catch(() => { layoutError.value = true; });
}

onMounted(() => {
  if (!props.preview || !root.value) return;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(updateScale);
    observer.observe(root.value);
  }
  fitPreview();
});
watch(() => props.report, () => { if (props.preview) fitPreview(); });
onBeforeUnmount(() => { fitVersion++; observer?.disconnect(); });
defineExpose({ fitPages });
</script>

<template>
  <div ref="root" class="verdict-pdf" :class="{ 'verdict-pdf--preview': preview }" :lang="locale"
    :style="{ '--verdict-pdf-scale': scale }" :aria-hidden="preview ? undefined : true" :inert="!preview">
    <p v-if="layoutError" class="vr-layout-error" role="alert">{{ translate(locale, "nearbyStations.neighborhoodScore.exportPdfError") }}</p>
    <div v-for="(page, index) in report.pages" :key="page.id" class="vr-frame">
      <article class="vr-sheet" :class="`vr-sheet--${page.kind}`" :data-verdict-pdf-sheet="page.id">
        <header class="vr-header">
          <div class="vr-brand">TransportClock <span>·</span> Verdict</div>
          <p v-if="report.location" class="vr-address">{{ report.location }}</p>
        </header>

        <div class="vr-body" data-pdf-body>
          <div class="vr-flow">
            <template v-if="page.kind === 'contents'">
              <div class="vr-cover">
                <h1>{{ report.title }}</h1>
                <p v-if="report.location">{{ report.location }}</p>
              </div>
              <h2>{{ page.title }}</h2>
              <ol class="vr-contents">
                <li v-for="(entry, entryIndex) in report.pages.slice(1)" :key="entry.id">
                  <span>{{ entry.title }}</span><b>{{ String(entryIndex + 2).padStart(2, '0') }}</b>
                </li>
              </ol>
            </template>

            <template v-else>
              <h2>{{ page.title }}</h2>
              <div v-if="page.kind === 'overview'" class="vr-score-hero">
                <div>
                  <p>{{ translate(locale, "nearbyStations.neighborhoodScore.pdfScoreLabel") }}</p>
                  <strong>{{ page.score }}</strong>
                </div>
                <div>
                  <b v-if="page.band">{{ page.band }}</b>
                  <p>{{ page.coverage }}</p>
                </div>
              </div>
              <template v-else-if="page.kind === 'city'">
                <p v-if="page.city" class="vr-subtitle">{{ page.city }}</p>
                <dl class="vr-metrics">
                  <div v-for="metric in page.metrics" :key="metric.label" class="vr-metric">
                    <dt>{{ p(metric.label) }}</dt>
                    <dd :class="{ 'vr-metric-missing': metric.value === undefined }">{{ metricValue(metric.value, metric.unit) }}</dd>
                  </div>
                </dl>
              </template>
              <template v-else-if="page.kind === 'category'">
                <p class="vr-score">{{ page.score }}</p>
                <p v-if="page.warning" class="vr-notice">{{ page.warning }}</p>
                <p v-if="page.empty" class="vr-note">{{ page.empty }}</p>
                <p v-else-if="!page.groups.length" class="vr-note">{{ p("noFact") }}</p>
              </template>
              <p v-else-if="page.kind === 'annex' && page.subtitle" class="vr-subtitle">{{ page.subtitle }}</p>
              <template v-else-if="page.kind === 'comparison'">
                <p v-if="page.city" class="vr-subtitle">{{ page.city }}</p>
                <p v-if="page.neighborhood" class="vr-neighborhood"><span>{{ p("neighborhood") }}</span> <strong>{{ page.neighborhood }}</strong></p>
                <p v-if="page.notice" class="vr-notice">{{ translate(locale, page.notice) }}</p>
                <template v-else>
                  <table class="vr-comparison">
                    <thead><tr><td></td><th scope="col">{{ p("neighborhood") }}</th><th scope="col">{{ p("otherAreas") }}</th><th scope="col">{{ p("rank") }}</th></tr></thead>
                    <tbody>
                      <tr v-for="metric in page.metrics" :key="metric.label">
                        <th scope="row">{{ p(metric.label) }}</th>
                        <td>{{ metricValue(metric.value, metric.unit) }}</td>
                        <td>{{ metricValue(metric.median, metric.unit) }}</td>
                        <td>{{ metric.rank === undefined ? noValue : p("rankValue", { rank: metric.rank, count: metric.count }) }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p class="vr-note">{{ p("comparisonScope") }}</p>
                </template>
              </template>
              <p v-else-if="page.kind === 'closing'" class="vr-closing-lead">{{ p("closingLead") }}</p>

              <div v-if="groups(page).length" class="vr-groups" :class="{ 'vr-groups--paired': page.kind === 'overview' || page.kind === 'closing' }">
                <section v-for="(group, groupIndex) in groups(page)" :key="group.tone"
                  class="vr-group" :class="`vr-group--${group.tone}`">
                  <h3>{{ group.title }}</h3>
                  <ul v-if="visibleCount(page, group, groupIndex)">
                    <li v-for="(item, itemIndex) in group.items.slice(0, visibleCount(page, group, groupIndex))" :key="itemIndex">{{ item }}</li>
                  </ul>
                  <p v-else>{{ p("noFact") }}</p>
                </section>
              </div>
              <p v-if="omitted(page)" class="vr-note vr-omitted">{{ p(omitted(page) === 1 ? "omittedOne" : "omitted", { count: omitted(page) }) }}</p>
              <p v-if="page.kind === 'closing'" class="vr-closing-note">{{ p("closingNote") }}</p>
            </template>
          </div>
        </div>

        <footer class="vr-footer">
          <span>{{ report.updated }}</span>
          <strong>{{ translate(locale, "nearbyStations.neighborhoodScore.pdfPage", { current: index + 1, total: report.pages.length }) }}</strong>
        </footer>
      </article>
    </div>
  </div>
</template>

<style scoped>
.verdict-pdf {
  --vr-ink: #202240;
  --vr-muted: #4f5573;
  --vr-accent: #4936b8;
  --vr-rule: #e1dff0;
  position: fixed;
  inset: 0 auto auto -12000px;
  width: 210mm;
  pointer-events: none;
  color-scheme: light;
}
.verdict-pdf--preview {
  inset: 0;
  width: auto;
  z-index: 2100;
  overflow: auto;
  padding: 16px 0;
  pointer-events: auto;
  background: #eae8f4;
}
.vr-layout-error { margin: 0 auto 16px; width: min(calc(100% - 24px), 210mm); background: #fff5e5; color: #633d1c; padding: 12px; }
.vr-frame { width: 210mm; height: 297mm; }
.verdict-pdf--preview .vr-frame {
  width: calc(210mm * var(--verdict-pdf-scale));
  height: calc(297mm * var(--verdict-pdf-scale));
  margin: 0 auto 16px;
  overflow: hidden;
  box-shadow: 0 8px 28px #27204226;
}
.vr-sheet {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  box-sizing: border-box;
  width: 210mm;
  height: 297mm;
  padding: 11mm 14mm 9mm;
  border-top: 2mm solid #5a45cc;
  background: #fff;
  color: var(--vr-ink);
  font: 15px/1.45 var(--font-sans, Arial, sans-serif);
  overflow-wrap: anywhere;
  text-align: start;
}
.verdict-pdf--preview .vr-sheet { transform: scale(var(--verdict-pdf-scale)); transform-origin: top left; }
.vr-sheet :is(p, h1, h2, h3, ul, ol, dd, dl) { margin: 0; }
.vr-header, .vr-footer { display: flex; gap: 16px; justify-content: space-between; align-items: baseline; }
.vr-header { border-bottom: 1px solid var(--vr-rule); padding-bottom: 12px; }
.vr-brand { flex: none; color: var(--vr-accent); font-size: 13px; font-weight: 800; }
.vr-brand span { color: #8a7bd3; margin: 0 3px; }
.vr-address { color: var(--vr-muted); font-size: 12px; max-width: 62%; text-align: end; }
.vr-body { min-height: 0; overflow: hidden; }
.vr-flow { padding: 32px 0 14px; }
.vr-flow h1, .vr-flow h2 { font-weight: 820; letter-spacing: -.025em; line-height: 1.1; }
.vr-flow h1 { font-size: 49px; }
.vr-flow h2 { font-size: 37px; margin-bottom: 18px; }
.vr-cover { margin-bottom: 28px; border-radius: 20px; padding: 25px 28px; background: #eeeaff; }
.vr-cover p { margin-top: 10px; font-size: 17px; color: var(--vr-muted); }
.vr-contents { padding: 0; list-style: none; }
.vr-contents li { display: flex; justify-content: space-between; gap: 20px; padding: 8px 1px; border-bottom: 1px solid var(--vr-rule); font-weight: 650; }
.vr-contents b { color: var(--vr-accent); font-variant-numeric: tabular-nums; }
.vr-score-hero { display: grid; grid-template-columns: 1fr 1fr; align-items: end; gap: 24px; border-radius: 18px; padding: 24px; margin: 12px 0 25px; background: #4b36b4; color: #fff; }
.vr-score-hero strong { display: block; font-size: 46px; line-height: 1.15; font-weight: 820; }
.vr-score-hero b { display: block; font-size: 22px; margin-bottom: 4px; }
.vr-score { display: inline-block; background: #eeeaff; color: var(--vr-accent); padding: 7px 15px; border-radius: 10px; font-size: 27px; font-weight: 820; }
.vr-flow .vr-subtitle { font-weight: 750; color: var(--vr-accent); font-size: 21px; margin-bottom: 18px; }
.vr-flow .vr-neighborhood { display: grid; gap: 2px; background: #eeeaff; padding: 14px 16px; border-radius: 10px; margin-bottom: 16px; }
.vr-neighborhood span { color: var(--vr-muted); font-size: 12px; }
.vr-neighborhood strong { color: var(--vr-accent); font-size: 20px; }
.vr-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 17px; }
.vr-metric { display: flex; flex-direction: column; justify-content: center; gap: 10px; min-height: 140px; padding: 19px; border-radius: 16px; border: 1px solid #ddd6fb; background: #f4f0ff; }
.vr-metric:nth-child(3n+2) { background: #eef5fc; border-color: #d8e7f8; }
.vr-metric:nth-child(3n) { background: #edf7f3; border-color: #d3eae1; }
.vr-metric dt { order: 2; font-size: 14px; color: var(--vr-muted); font-weight: 650; }
.vr-metric dd { color: #30265d; font-size: 34px; line-height: 1.1; font-weight: 820; font-variant-numeric: tabular-nums; }
.vr-metric dd.vr-metric-missing { font-size: 17px; color: var(--vr-muted); }
.vr-comparison { border-collapse: collapse; table-layout: fixed; width: 100%; text-align: start; }
.vr-comparison :is(th, td) { border-bottom: 1px solid var(--vr-rule); padding: 12px 10px; text-align: start; }
.vr-comparison thead { color: var(--vr-muted); font-size: 12px; }
.vr-comparison :is(th, td):first-child { width: 32%; }
.vr-comparison :is(th, td):nth-child(2) { background: #f3efff; color: var(--vr-accent); font-weight: 760; }
.vr-comparison :is(th, td):last-child { width: 16%; }
.vr-flow .vr-notice { margin: 11px 0; border-left: 3px solid #c17b25; padding: 10px 13px; background: #fff5e5; color: #633d1c; font-size: 13px; }
.vr-flow .vr-note { margin-top: 12px; color: var(--vr-muted); font-size: 12px; }
.vr-groups { display: grid; gap: 12px; margin-top: 16px; }
.vr-groups--paired { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 15px; }
.vr-group { padding: 12px 15px; border: 1px solid #e5e1f1; border-radius: 12px; background: #f8f7fc; }
.vr-group--positive { border-color: #d4eade; background: #eff8f3; }
.vr-group--negative { border-color: #f0e0c7; background: #fff8ee; }
.vr-group h3 { margin-bottom: 6px; color: #362d65; font-size: 15px; font-weight: 800; }
.vr-group--positive h3 { color: #266044; }
.vr-group--negative h3 { color: #794a22; }
.vr-group ul { padding-left: 17px; }
.vr-group li + li { margin-top: 4px; }
.vr-group p { color: var(--vr-muted); font-size: 13px; }
.vr-sheet--sources .vr-group, .vr-sheet--annex .vr-group { font-size: 13px; }
.vr-flow .vr-closing-lead { color: var(--vr-accent); font-size: 21px; font-weight: 680; }
.vr-flow .vr-closing-note { margin-top: 24px; border-top: 1px solid var(--vr-rule); padding-top: 16px; color: var(--vr-muted); }
.vr-footer { border-top: 1px solid var(--vr-rule); padding-top: 10px; color: var(--vr-muted); font-size: 11px; }
.vr-footer strong { flex: none; color: var(--vr-accent); }

@media print {
  @page verdict-report { size: A4 portrait; margin: 0; }
  :global(body:has(> .verdict-pdf--preview)) { margin: 0 !important; }
  :global(body:has(> .verdict-pdf--preview) > :not(.verdict-pdf--preview)) { display: none !important; }
  .verdict-pdf--preview { position: static; overflow: visible; padding: 0; background: #fff; }
  .vr-layout-error { display: none; }
  .verdict-pdf--preview .vr-frame { width: 210mm; height: 297mm; margin: 0; box-shadow: none; page: verdict-report; break-inside: avoid; }
  .verdict-pdf--preview .vr-frame + .vr-frame { break-before: page; }
  .verdict-pdf--preview .vr-sheet { transform: none; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
</style>
