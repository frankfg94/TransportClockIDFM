<script setup lang="ts">
import { Capacitor } from "@capacitor/core";
import { onMounted, ref } from "vue";
import type { GtfsPublicStatus } from "../../../server/services/gtfs/types";
import { useI18n } from "../../i18n";
import { fetchGtfsStatus } from "../../services/gtfsStatus";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
const { d, t } = useI18n();
const status = ref<GtfsPublicStatus>();
const loading = ref(false);
const errorMessage = ref("");
const isNative = Capacitor.getPlatform() !== "web";

onMounted(() => void loadStatus());

async function loadStatus(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    status.value = await fetchGtfsStatus();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("settings.gtfs.statusFailed");
  } finally {
    loading.value = false;
  }
}

function formatStatusDate(value?: string): string {
  return value
    ? d(new Date(value), { dateStyle: "medium", timeStyle: "short" })
    : t("settings.gtfs.unknown");
}
</script>

<template>
  <section class="gtfs-settings">
    <header>
      <div>
        <p class="eyebrow">{{ t("settings.gtfs.eyebrow") }}</p>
        <h2>{{ t("settings.gtfs.title") }}</h2>
        <p>{{ t("settings.gtfs.description") }}</p>
      </div>
      <button class="button-secondary" type="button" :disabled="loading" @click="loadStatus">
        {{ t("common.actions.refresh") }}
      </button>
    </header>

    <label class="gtfs-settings__toggle">
      <input
        type="checkbox"
        :checked="modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <span aria-hidden="true"></span>
      <div>
        <strong>{{ t("settings.gtfs.toggle") }}</strong>
        <small>{{ t("settings.gtfs.toggleDescription") }}</small>
      </div>
    </label>

    <dl v-if="status" class="gtfs-settings__status">
      <div>
        <dt>{{ t("settings.gtfs.availability") }}</dt>
        <dd>{{ status.available ? t("common.booleans.yes") : t("common.booleans.no") }}</dd>
      </div>
      <div>
        <dt>{{ t("settings.gtfs.version") }}</dt>
        <dd>{{ status.datasetVersion || t("settings.gtfs.unknown") }}</dd>
      </div>
      <div>
        <dt>{{ t("settings.gtfs.sourceUpdatedAt") }}</dt>
        <dd>{{ formatStatusDate(status.sourceUpdatedAt || status.installedAt) }}</dd>
      </div>
      <div>
        <dt>{{ t("settings.gtfs.lines") }}</dt>
        <dd>{{ status.lineCount ?? "--" }}</dd>
      </div>
    </dl>

    <p v-if="status?.stale" class="gtfs-settings__warning" role="alert">
      {{ t("settings.gtfs.stale", { days: status.ageDays ?? 20 }) }}
    </p>
    <p v-if="!isNative" class="gtfs-settings__command-note">
      {{ t("settings.gtfs.commandManaged") }} <code>npm run gtfs:update</code>
    </p>
    <p v-if="errorMessage" class="gtfs-settings__error" role="alert">{{ errorMessage }}</p>
  </section>
</template>

<style scoped>
.gtfs-settings {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 22px;
  display: grid;
  gap: 18px;
  margin-top: 18px;
  padding: 22px;
}

.gtfs-settings > header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.gtfs-settings h2,
.gtfs-settings p {
  margin: 0;
}

.gtfs-settings__toggle {
  align-items: center;
  cursor: pointer;
  display: grid;
  gap: 12px;
  grid-template-columns: auto minmax(0, 1fr);
}

.gtfs-settings__toggle input {
  opacity: 0;
  position: absolute;
}

.gtfs-settings__toggle > span {
  background: #cbd5e1;
  border-radius: 999px;
  height: 28px;
  position: relative;
  width: 50px;
}

.gtfs-settings__toggle > span::after {
  background: #fff;
  border-radius: 50%;
  content: "";
  height: 22px;
  left: 3px;
  position: absolute;
  top: 3px;
  transition: transform 160ms ease;
  width: 22px;
}

.gtfs-settings__toggle input:checked + span {
  background: var(--idfm-blue);
}

.gtfs-settings__toggle input:checked + span::after {
  transform: translateX(22px);
}

.gtfs-settings__toggle small,
.gtfs-settings__status dt {
  color: var(--muted);
}

.gtfs-settings__toggle small {
  display: block;
}

.gtfs-settings__status {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  margin: 0;
}

.gtfs-settings__status div {
  background: var(--surface-soft);
  border-radius: 12px;
  padding: 12px;
}

.gtfs-settings__status dt {
  font-size: 0.76rem;
  font-weight: 800;
}

.gtfs-settings__status dd {
  font-weight: 900;
  margin: 5px 0 0;
}

.gtfs-settings__warning,
.gtfs-settings__error {
  font-weight: 850;
}

.gtfs-settings__warning {
  color: #9a5b00;
}

.gtfs-settings__error {
  color: #b91c1c;
}

.gtfs-settings__command-note {
  color: var(--muted);
}
</style>
