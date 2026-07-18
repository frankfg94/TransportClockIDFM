<script setup lang="ts">
import { computed } from "vue";
import type { TransportClockLocale } from "@transport-clock/nuxt-plugin-host/types";
import { translateRealtimeMessage } from "../messages";
import {
  TRANSPORT_POSITION_PARAMETER_DEFINITIONS,
  normalizeTransportPositionParameterSettings,
  type TransportPositionParameterId,
  type TransportPositionParameterOptionDefinition,
  type TransportPositionParameterSettings,
} from "../transportPositionParameters";

type TranslationKey = string;

const props = defineProps<{
  disabled?: boolean;
  locale: TransportClockLocale;
  modelValue: unknown;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: TransportPositionParameterSettings];
}>();
const settings = computed(() =>
  normalizeTransportPositionParameterSettings(props.modelValue),
);
const t = (key: string) => translateRealtimeMessage(props.locale, key);

function updateEnabled(
  id: TransportPositionParameterId,
  event: Event,
): void {
  updateParameterValue(
    id,
    "enabled",
    (event.target as HTMLInputElement).checked,
  );
}

function updateOption(
  id: TransportPositionParameterId,
  option: TransportPositionParameterOptionDefinition,
  event: Event,
): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  const value = option.type === "checkbox"
    ? (target as HTMLInputElement).checked
    : option.type === "select"
      ? target.value
      : Number(target.value);
  updateParameterValue(id, option.id, value);
}

function updateParameterValue(
  id: TransportPositionParameterId,
  key: string,
  value: unknown,
): void {
  const current = settings.value[id] as unknown as Record<string, unknown>;
  const next = {
    ...settings.value,
    [id]: {
      ...current,
      [key]: value,
    },
  };
  emit("update:modelValue", normalizeTransportPositionParameterSettings(next));
}

function getOptionValue(
  id: TransportPositionParameterId,
  optionId: string,
): string | number | boolean | undefined {
  const parameter = settings.value[id] as unknown as Record<string, unknown>;
  const value = parameter[optionId];
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : undefined;
}

function formatOptionValue(value: unknown): string {
  return typeof value === "number" ? String(Math.round(value * 100) / 100) : "";
}

function translateChoice(choice: string): string {
  return t(
    `settings.experimental.choices.${choice}` as TranslationKey,
  );
}
</script>

<template>
  <div
    class="transport-parameters"
    :class="{ 'transport-parameters--disabled': disabled }"
  >
    <article
      v-for="parameter in TRANSPORT_POSITION_PARAMETER_DEFINITIONS"
      :key="parameter.id"
      class="transport-parameter"
      :class="{
        'transport-parameter--disabled': !settings[parameter.id].enabled,
        'transport-parameter--future': parameter.availability === 'future',
      }"
      :data-testid="`transport-parameter-${parameter.id}`"
    >
      <header>
        <div class="transport-parameter__heading">
          <strong>{{ t(parameter.titleKey) }}</strong>
          <small>{{ t(parameter.descriptionKey) }}</small>
        </div>
        <div class="transport-parameter__header-actions">
          <em v-if="parameter.availability === 'future'">
            {{ t("settings.experimental.parameterUnavailable") }}
          </em>
          <em v-else>
            {{ t("settings.experimental.parameterAvailable") }}
          </em>
          <label class="transport-switch">
            <input
              class="transport-switch__input"
              type="checkbox"
              :aria-label="t(parameter.titleKey)"
              :checked="settings[parameter.id].enabled"
              @change="updateEnabled(parameter.id, $event)"
            />
            <span class="transport-switch__track" aria-hidden="true"></span>
          </label>
        </div>
      </header>

      <div
        v-if="settings[parameter.id].enabled && parameter.options.length"
        class="transport-parameter__options"
      >
        <label
          v-for="option in parameter.options"
          :key="option.id"
          class="transport-parameter__option"
        >
          <span>
            <strong>{{ t(option.titleKey) }}</strong>
            <small>{{ t(option.descriptionKey) }}</small>
          </span>

          <select
            v-if="option.type === 'select'"
            :value="getOptionValue(parameter.id, option.id)"
            @change="updateOption(parameter.id, option, $event)"
          >
            <option
              v-for="choice in option.choices"
              :key="choice"
              :value="choice"
            >
              {{ translateChoice(choice) }}
            </option>
          </select>

          <span
            v-else-if="option.type === 'checkbox'"
            class="transport-switch transport-switch--option"
          >
            <input
              class="transport-switch__input"
              type="checkbox"
              :checked="Boolean(getOptionValue(parameter.id, option.id))"
              @change="updateOption(parameter.id, option, $event)"
            />
            <span class="transport-switch__track" aria-hidden="true"></span>
          </span>

          <span v-else class="transport-parameter__numeric">
            <input
              :type="option.type === 'slider' ? 'range' : 'number'"
              :min="option.min"
              :max="option.max"
              :step="option.step"
              :value="getOptionValue(parameter.id, option.id)"
              @input="updateOption(parameter.id, option, $event)"
            />
            <output>
              {{ formatOptionValue(getOptionValue(parameter.id, option.id)) }}
            </output>
          </span>
        </label>
      </div>
    </article>
  </div>
</template>

<style scoped>
.transport-parameters {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.transport-parameters--disabled {
  opacity: 0.55;
  pointer-events: none;
}

.transport-parameter {
  background: #f7f9fe;
  border: 1px solid rgba(16, 35, 63, 0.09);
  border-radius: 10px;
  padding: 14px;
}

.transport-parameter--disabled {
  opacity: 0.72;
}

.transport-parameter--future {
  border-style: dashed;
}

.transport-parameter header {
  align-items: center;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) auto;
}

.transport-parameter__heading {
  min-width: 0;
}

.transport-parameter__header-actions {
  align-items: center;
  display: inline-flex;
  gap: 10px;
}

.transport-switch {
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  position: relative;
}

.transport-switch__input {
  height: 1px;
  opacity: 0;
  position: absolute;
  width: 1px;
}

.transport-switch__track {
  background: #cbd5e1;
  border: 1px solid rgba(16, 35, 63, 0.12);
  border-radius: 999px;
  display: block;
  height: 26px;
  position: relative;
  transition: background 160ms ease, box-shadow 160ms ease;
  width: 46px;
}

.transport-switch__track::after {
  background: #fff;
  border-radius: 999px;
  box-shadow: 0 2px 5px rgba(16, 35, 63, 0.25);
  content: "";
  height: 20px;
  left: 2px;
  position: absolute;
  top: 2px;
  transition: transform 160ms ease;
  width: 20px;
}

.transport-switch__input:checked + .transport-switch__track {
  background: var(--idfm-blue);
}

.transport-switch__input:checked + .transport-switch__track::after {
  transform: translateX(20px);
}

.transport-switch__input:focus-visible + .transport-switch__track {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--idfm-blue) 25%, transparent);
}

.transport-parameter strong,
.transport-parameter small {
  display: block;
}

.transport-parameter small {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  margin-top: 3px;
}

.transport-parameter em {
  background: rgba(0, 100, 255, 0.08);
  border-radius: 999px;
  color: var(--idfm-blue);
  font-size: 0.66rem;
  font-style: normal;
  font-weight: 900;
  padding: 5px 8px;
  white-space: nowrap;
}

.transport-parameter--future em {
  background: rgba(245, 158, 11, 0.12);
  color: #9a5b00;
}

.transport-parameter__options {
  border-top: 1px solid rgba(16, 35, 63, 0.08);
  display: grid;
  gap: 12px;
  margin-top: 13px;
  padding-top: 13px;
}

.transport-parameter__option {
  align-items: center;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) minmax(130px, 220px);
}

.transport-parameter__option select,
.transport-parameter__option input[type="number"] {
  background: #fff;
  border: 1px solid rgba(16, 35, 63, 0.16);
  border-radius: 7px;
  min-height: 38px;
  padding: 6px 9px;
  width: 100%;
}

.transport-switch--option {
  justify-self: end;
}

.transport-parameter__numeric {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) 44px;
}

.transport-parameter__numeric input[type="range"] {
  accent-color: var(--idfm-blue);
  width: 100%;
}

.transport-parameter__numeric output {
  font-size: 0.75rem;
  font-weight: 900;
  text-align: right;
}

@media (max-width: 680px) {
  .transport-parameter header,
  .transport-parameter__option {
    align-items: stretch;
    grid-template-columns: 1fr;
  }

  .transport-parameter header {
    display: grid;
  }

  .transport-parameter__header-actions {
    justify-content: space-between;
  }
}
</style>
