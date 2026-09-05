<template>
  <section
    class="global-transport-plan__customization"
    id="global-map-customization"
    data-global-map-customization
    :aria-label="t('globalMap.page.customizationAria')"
  >
    <header class="global-transport-plan__customization-heading">
      <button
        type="button"
        class="global-transport-plan__customization-back"
        data-global-map-customization-back
        :aria-label="t('globalMap.page.backToPresets')"
        @click="emit('back')"
      >
        <ArrowLeft :size="19" :stroke-width="2.2" aria-hidden="true" />
      </button>
      <div class="global-transport-plan__customization-heading-copy">
        <h2>{{ t("globalMap.page.customizeMap") }}</h2>
        <p>{{ t("globalMap.page.customizeMapSubtitle") }}</p>
      </div>
    </header>

    <div class="global-transport-plan__customization-actions" role="group">
      <button
        type="button"
        class="global-transport-plan__customization-action"
        data-global-map-customization-select-all
        @click="selectAll"
      >
        <Eye :size="15" :stroke-width="2.1" aria-hidden="true" />
        {{ t("globalMap.page.selectAllModes") }}
      </button>
      <button
        type="button"
        class="global-transport-plan__customization-action"
        data-global-map-customization-select-none
        @click="selectNone"
      >
        <EyeOff :size="15" :stroke-width="2.1" aria-hidden="true" />
        {{ t("globalMap.page.selectNoModes") }}
      </button>
    </div>

    <div
      class="global-transport-plan__customization-list"
      role="group"
      :aria-label="t('globalMap.page.customizationModesAria')"
    >
      <label
        v-for="mode in modes"
        :key="mode"
        class="global-transport-plan__customization-row"
        :class="{ 'global-transport-plan__customization-row--active': isSelected(mode) }"
        :style="{ '--mode-color': modeColor(mode) }"
      >
        <span class="global-transport-plan__customization-icon" aria-hidden="true">
          <GlobalTransportPlanModeIcon :mode="mode" :size="18" />
        </span>
        <span class="global-transport-plan__customization-label">{{ modeLabel(mode) }}</span>
        <span class="global-transport-plan__customization-toggle">
          <input
            type="checkbox"
            :checked="isSelected(mode)"
            :aria-label="t('globalMap.page.toggleMode', { mode: modeLabel(mode) })"
            @change="toggleMode(mode, $event)"
          />
          <span class="global-transport-plan__customization-toggle-track" aria-hidden="true">
            <span />
          </span>
        </span>
      </label>
    </div>

    <button
      type="button"
      class="global-transport-plan__customization-finish"
      data-global-map-customization-finish
      @click="emit('finish')"
    >
      <Check :size="17" :stroke-width="2.35" aria-hidden="true" />
      {{ t("globalMap.page.finishCustomization") }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ArrowLeft, Check, Eye, EyeOff } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import GlobalTransportPlanModeIcon from "./GlobalTransportPlanModeIcon.vue";

const props = defineProps<{
  modes: GlobalMapMode[];
  selectedModes: GlobalMapMode[];
  modeLabel: (mode: GlobalMapMode) => string;
  modeColor: (mode: GlobalMapMode) => string;
}>();

const emit = defineEmits<{
  "update:selected-modes": [modes: GlobalMapMode[]];
  back: [];
  finish: [];
}>();

const { t } = useI18n();
const selectedModeSet = computed(() => new Set(props.selectedModes));

function isSelected(mode: GlobalMapMode): boolean {
  return selectedModeSet.value.has(mode);
}

function toggleMode(mode: GlobalMapMode, event: Event): void {
  const selected = new Set(selectedModeSet.value);
  if ((event.target as HTMLInputElement).checked) selected.add(mode);
  else selected.delete(mode);

  emit(
    "update:selected-modes",
    props.modes.filter((candidate) => selected.has(candidate)),
  );
}

function selectAll(): void {
  emit("update:selected-modes", [...props.modes]);
}

function selectNone(): void {
  emit("update:selected-modes", []);
}
</script>

<style scoped>
.global-transport-plan__customization {
  display: grid;
  gap: 0;
  width: 100%;
  min-width: 0;
  padding: 17px 14px 14px;
}
.global-transport-plan__customization-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  padding: 0 2px 15px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.19);
}
.global-transport-plan__customization-back {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-top: 1px;
  padding: 0;
  border: 1px solid rgba(110, 168, 255, 0.2);
  border-radius: 10px;
  background: #f2f7ff;
  color: #5279b3;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
}
.global-transport-plan__customization-back:hover {
  border-color: rgba(110, 168, 255, 0.48);
  background: #eaf3ff;
  transform: translateX(-1px);
}
.global-transport-plan__customization-back:focus-visible,
.global-transport-plan__customization-action:focus-visible,
.global-transport-plan__customization-finish:focus-visible {
  outline: 3px solid rgba(110, 168, 255, 0.36);
  outline-offset: 2px;
}
.global-transport-plan__customization-heading-copy {
  min-width: 0;
}
.global-transport-plan__customization-heading h2 {
  color: #172642;
  font-size: 1.04rem;
  font-weight: 820;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.global-transport-plan__customization-heading p {
  margin-top: 5px;
  color: #78869b;
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1.3;
}
.global-transport-plan__customization-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 12px 0 10px;
}
.global-transport-plan__customization-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 29px;
  padding: 5px 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: #fff;
  color: #5a6d87;
  font: inherit;
  font-size: 0.66rem;
  font-weight: 760;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}
.global-transport-plan__customization-action:hover {
  border-color: rgba(110, 168, 255, 0.42);
  background: #f7fbff;
  color: #315b91;
}
.global-transport-plan__customization-list {
  display: grid;
  gap: 4px;
}
.global-transport-plan__customization-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 43px;
  padding: 5px 8px 5px 10px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: #fff;
  color: #2f3c53;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.global-transport-plan__customization-row:hover {
  border-color: rgba(148, 163, 184, 0.2);
  background: #fbfdff;
}
.global-transport-plan__customization-row--active {
  border-color: rgba(125, 177, 245, 0.3);
  background: #f7fbff;
}
.global-transport-plan__customization-row:focus-within {
  outline: 3px solid rgba(110, 168, 255, 0.3);
  outline-offset: 1px;
}
.global-transport-plan__customization-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--mode-color, #64748b) 15%, #fff);
  border-radius: 9px;
  background: color-mix(in srgb, var(--mode-color, #64748b) 6%, #fff);
  color: color-mix(in srgb, var(--mode-color, #64748b) 72%, #2e405a);
}
.global-transport-plan__customization-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
  font-weight: 760;
}
.global-transport-plan__customization-toggle {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  width: 38px;
  height: 22px;
  margin-left: auto;
}
.global-transport-plan__customization-toggle input {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  opacity: 0;
}
.global-transport-plan__customization-toggle-track {
  position: relative;
  display: block;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: #d8e0eb;
  box-shadow: inset 0 0 0 1px rgba(51, 65, 85, 0.08);
  transition: background 140ms ease, box-shadow 140ms ease;
}
.global-transport-plan__customization-toggle-track > span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(30, 53, 82, 0.22);
  transition: transform 140ms ease;
}
.global-transport-plan__customization-toggle input:checked + .global-transport-plan__customization-toggle-track {
  background: #7db1f5;
  box-shadow: inset 0 0 0 1px rgba(77, 133, 207, 0.16);
}
.global-transport-plan__customization-toggle input:checked + .global-transport-plan__customization-toggle-track > span {
  transform: translateX(16px);
}
.global-transport-plan__customization-finish {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-height: 39px;
  margin-top: 13px;
  padding: 8px 12px;
  border: 1px solid rgba(110, 168, 255, 0.52);
  border-radius: 10px;
  background: #f2f7ff;
  color: #315b91;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 820;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
}
.global-transport-plan__customization-finish:hover {
  border-color: rgba(110, 168, 255, 0.74);
  background: #eaf3ff;
  transform: translateY(-1px);
}

@media (prefers-reduced-motion: reduce) {
  .global-transport-plan__customization-back,
  .global-transport-plan__customization-action,
  .global-transport-plan__customization-row,
  .global-transport-plan__customization-toggle-track,
  .global-transport-plan__customization-toggle-track > span,
  .global-transport-plan__customization-finish {
    transition: none;
  }
}
</style>
