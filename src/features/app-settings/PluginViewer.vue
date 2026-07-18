<script setup lang="ts">
import {
  computed,
  onMounted,
  ref,
  shallowRef,
  watch,
  type CSSProperties,
} from "vue";
import type { TransportClockClientPlugin } from "@transport-clock/nuxt-plugin-host/types";
import {
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  List,
  Puzzle,
  Search,
  SlidersHorizontal,
} from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import { useI18n } from "../../i18n";
import { toServerApiUrl } from "../../services/serverApi";
import { getTransportClockPlugins } from "../plugins/pluginRuntime";
import {
  useAppSettings,
  type AppPluginSettingsEntry,
  type PluginViewerMode,
} from "./appSettings";

type BackendPlugin = { apiVersion: number; id: string; version: string };
type Compatibility =
  | "checking"
  | "compatible"
  | "missing"
  | "incompatible"
  | "unavailable";
type PaginationItem = number | "ellipsis-left" | "ellipsis-right";

const PAGE_SIZE = 10;
const plugins = getTransportClockPlugins();
const { settings, updateSettings } = useAppSettings();
const { locale, t } = useI18n();
const query = ref("");
const currentPage = ref(1);
const selectedPlugin = shallowRef<TransportClockClientPlugin>();
const backendPlugins = ref<BackendPlugin[]>();
const backendUnavailable = ref(false);

const emit = defineEmits<{
  notify: [payload: { message: string; tone: "success" | "info" | "error" }];
}>();

const sortedPlugins = computed(() => {
  const collator = new Intl.Collator(locale.value, {
    numeric: true,
    sensitivity: "base",
  });
  return [...plugins].sort((left, right) =>
    collator.compare(pluginName(left), pluginName(right)),
  );
});

const filteredPlugins = computed(() => {
  const normalizedQuery = normalizeSearchText(query.value);
  if (!normalizedQuery) {
    return sortedPlugins.value;
  }
  return sortedPlugins.value.filter((plugin) =>
    [
      pluginName(plugin),
      pluginDescription(plugin),
      plugin.metadata.author,
      plugin.id,
      plugin.version,
    ].some((value) => normalizeSearchText(value).includes(normalizedQuery)),
  );
});

const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredPlugins.value.length / PAGE_SIZE)),
);
const pagePlugins = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredPlugins.value.slice(start, start + PAGE_SIZE);
});
const paginationItems = computed<PaginationItem[]>(() => {
  const total = pageCount.value;
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = new Set([
    1,
    total,
    currentPage.value - 1,
    currentPage.value,
    currentPage.value + 1,
  ]);
  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((left, right) => left - right);
  const items: PaginationItem[] = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous && page - previous > 1) {
      items.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
    }
    items.push(page);
  });
  return items;
});
const selectedEntry = computed(() =>
  selectedPlugin.value ? getEntry(selectedPlugin.value) : undefined,
);

watch(query, () => {
  currentPage.value = 1;
});
watch(pageCount, (total) => {
  currentPage.value = Math.min(currentPage.value, total);
});

onMounted(async () => {
  try {
    const response = await fetch(
      toServerApiUrl("/api/_transport-clock/plugins"),
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) {
      throw new Error(String(response.status));
    }
    const payload = (await response.json()) as { plugins?: BackendPlugin[] };
    backendPlugins.value = Array.isArray(payload.plugins) ? payload.plugins : [];
  } catch {
    backendUnavailable.value = true;
  }
});

function pluginName(plugin: TransportClockClientPlugin): string {
  return plugin.metadata.name[locale.value];
}

function pluginDescription(plugin: TransportClockClientPlugin): string {
  return plugin.metadata.description[locale.value];
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(locale.value)
    .trim();
}

function getEntry(plugin: TransportClockClientPlugin): AppPluginSettingsEntry {
  return (
    settings.value.plugins[plugin.id] ?? {
      enabled: plugin.defaultEnabled,
      value: plugin.settings?.defaultValue ?? null,
      version: plugin.settings?.version ?? 1,
    }
  );
}

function updateEntry(
  plugin: TransportClockClientPlugin,
  patch: Partial<AppPluginSettingsEntry>,
): void {
  updateSettings({
    plugins: {
      ...settings.value.plugins,
      [plugin.id]: {
        ...getEntry(plugin),
        ...patch,
      },
    },
  });
}

function togglePlugin(plugin: TransportClockClientPlugin, event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked;
  updateEntry(plugin, { enabled });
  emit("notify", {
    message: t(
      enabled
        ? "settings.plugins.notifications.enabled"
        : "settings.plugins.notifications.disabled",
      { name: pluginName(plugin) },
    ),
    tone: "success",
  });
}

function setViewerMode(mode: PluginViewerMode): void {
  if (settings.value.pluginViewerMode !== mode) {
    updateSettings({ pluginViewerMode: mode });
  }
}

function getCompatibility(plugin: TransportClockClientPlugin): Compatibility {
  if (backendUnavailable.value) {
    return "unavailable";
  }
  if (!backendPlugins.value) {
    return "checking";
  }
  const backend = backendPlugins.value.find((entry) => entry.id === plugin.id);
  if (!backend) {
    return "missing";
  }
  return backend.apiVersion === plugin.apiVersion && backend.version === plugin.version
    ? "compatible"
    : "incompatible";
}

function compatibilityLabel(plugin: TransportClockClientPlugin): string {
  return t(
    ("settings.plugins.compatibility." + getCompatibility(plugin)) as never,
  );
}

function cardStyle(plugin: TransportClockClientPlugin): CSSProperties {
  return {
    "--plugin-accent": plugin.presentation?.accentColor ?? "#5136ff",
  } as CSSProperties;
}

function illustrationAlt(plugin: TransportClockClientPlugin): string {
  return plugin.presentation?.imageAlt?.[locale.value] ?? pluginName(plugin);
}

function goToPage(page: number): void {
  currentPage.value = Math.min(pageCount.value, Math.max(1, page));
}
</script>

<template>
  <section class="settings-panel plugin-viewer" aria-labelledby="settings-plugins-title">
    <div class="settings-panel__heading plugin-viewer__heading">
      <div>
        <p class="eyebrow">{{ t("settings.plugins.eyebrow") }}</p>
        <h2 id="settings-plugins-title">{{ t("settings.plugins.title") }}</h2>
        <p>{{ t("settings.plugins.description") }}</p>
      </div>
      <span v-if="plugins.length" class="plugin-viewer__count">
        {{ t("settings.plugins.count", { count: filteredPlugins.length }) }}
      </span>
    </div>

    <div v-if="plugins.length" class="plugin-viewer__toolbar">
      <label class="plugin-viewer__search">
        <Search :size="18" aria-hidden="true" />
        <span class="sr-only">{{ t("settings.plugins.searchLabel") }}</span>
        <input
          v-model="query"
          type="search"
          :placeholder="t('settings.plugins.searchPlaceholder')"
        />
      </label>
      <div
        class="plugin-viewer__modes"
        role="group"
        :aria-label="t('settings.plugins.viewMode')"
      >
        <button
          type="button"
          :class="{ active: settings.pluginViewerMode === 'grid' }"
          :aria-label="t('settings.plugins.gridView')"
          :aria-pressed="settings.pluginViewerMode === 'grid'"
          @click="setViewerMode('grid')"
        >
          <Grid2X2 :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          :class="{ active: settings.pluginViewerMode === 'list' }"
          :aria-label="t('settings.plugins.listView')"
          :aria-pressed="settings.pluginViewerMode === 'list'"
          @click="setViewerMode('list')"
        >
          <List :size="19" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p v-if="plugins.length === 0" class="plugin-viewer__empty">
      {{ t("settings.plugins.empty") }}
    </p>
    <div v-else-if="filteredPlugins.length === 0" class="plugin-viewer__empty-state">
      <Search :size="30" aria-hidden="true" />
      <strong>{{ t("settings.plugins.noResults") }}</strong>
      <span>{{ t("settings.plugins.noResultsHint") }}</span>
    </div>

    <div
      v-else
      class="plugin-viewer__catalog"
      :class="'plugin-viewer__catalog--' + settings.pluginViewerMode"
      data-testid="plugin-catalog"
    >
      <article
        v-for="plugin in pagePlugins"
        :key="plugin.id"
        class="plugin-card"
        :style="cardStyle(plugin)"
        :data-plugin-id="plugin.id"
      >
        <div class="plugin-card__illustration">
          <img
            v-if="plugin.presentation?.imageUrl"
            :src="plugin.presentation.imageUrl"
            :alt="illustrationAlt(plugin)"
          />
          <component
            :is="plugin.presentation?.icon"
            v-else-if="plugin.presentation?.icon"
            :size="38"
            :stroke-width="1.8"
            aria-hidden="true"
            data-testid="plugin-custom-icon"
          />
          <Puzzle
            v-else
            :size="38"
            :stroke-width="1.8"
            aria-hidden="true"
            data-testid="plugin-fallback-icon"
          />
        </div>

        <div class="plugin-card__content">
          <div class="plugin-card__title-row">
            <div>
              <h3>{{ pluginName(plugin) }}</h3>
              <p class="plugin-card__byline">
                {{ t("settings.plugins.byAuthor", { author: plugin.metadata.author }) }}
              </p>
            </div>
            <label class="plugin-switch">
              <input
                type="checkbox"
                :checked="getEntry(plugin).enabled"
                :aria-label="t('settings.plugins.toggleLabel', { name: pluginName(plugin) })"
                @change="togglePlugin(plugin, $event)"
              />
              <span aria-hidden="true"></span>
            </label>
          </div>

          <p class="plugin-card__description">{{ pluginDescription(plugin) }}</p>

          <div class="plugin-card__metadata">
            <span>v{{ plugin.version }}</span>
            <span
              class="plugin-card__compatibility"
              :class="'plugin-card__compatibility--' + getCompatibility(plugin)"
              :title="t('settings.plugins.backend')"
            >
              {{ compatibilityLabel(plugin) }}
            </span>
          </div>

          <div v-if="plugin.settings?.component" class="plugin-card__actions">
            <button
              type="button"
              class="plugin-card__customize"
              @click="selectedPlugin = plugin"
            >
              <SlidersHorizontal :size="16" aria-hidden="true" />
              {{ t("settings.plugins.customize") }}
            </button>
          </div>
        </div>
      </article>
    </div>

    <nav
      v-if="filteredPlugins.length > PAGE_SIZE"
      class="plugin-pagination"
      :aria-label="t('settings.plugins.pagination.label')"
    >
      <button
        type="button"
        :disabled="currentPage === 1"
        :aria-label="t('settings.plugins.pagination.previous')"
        @click="goToPage(currentPage - 1)"
      >
        <ChevronLeft :size="18" aria-hidden="true" />
      </button>
      <template v-for="item in paginationItems" :key="item">
        <span v-if="typeof item !== 'number'" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          :class="{ active: item === currentPage }"
          :aria-current="item === currentPage ? 'page' : undefined"
          :aria-label="t('settings.plugins.pagination.page', { page: item })"
          @click="goToPage(item)"
        >
          {{ item }}
        </button>
      </template>
      <button
        type="button"
        :disabled="currentPage === pageCount"
        :aria-label="t('settings.plugins.pagination.next')"
        @click="goToPage(currentPage + 1)"
      >
        <ChevronRight :size="18" aria-hidden="true" />
      </button>
    </nav>

    <AppModal
      :open="Boolean(selectedPlugin)"
      :eyebrow="t('settings.plugins.customizeEyebrow')"
      :title="selectedPlugin ? pluginName(selectedPlugin) : ''"
      panel-class="plugin-customizer-modal"
      @close="selectedPlugin = undefined"
    >
      <template v-if="selectedPlugin && selectedEntry">
        <p v-if="!selectedEntry.enabled" class="plugin-customizer__disabled">
          {{ t("settings.plugins.enableToCustomize") }}
        </p>
        <div :class="{ 'plugin-customizer__content--disabled': !selectedEntry.enabled }">
          <component
            :is="selectedPlugin.settings?.component"
            v-if="selectedPlugin.settings?.component"
            :disabled="!selectedEntry.enabled"
            :locale="locale"
            :model-value="selectedEntry.value"
            @update:model-value="updateEntry(selectedPlugin, { value: $event })"
          />
        </div>
      </template>
    </AppModal>
  </section>
</template>

<style scoped>
.plugin-viewer { overflow: hidden; }
.plugin-viewer__heading { align-items: flex-start; display: flex; gap: 18px; justify-content: space-between; }
.plugin-viewer__count { background: rgba(81, 54, 255, 0.08); border-radius: 999px; color: #5136ff; flex: 0 0 auto; font-size: .76rem; font-weight: 850; padding: 7px 10px; }
.plugin-viewer__toolbar { align-items: center; display: flex; gap: 12px; justify-content: space-between; margin: 20px 0; }
.plugin-viewer__search { align-items: center; background: #fff; border: 1px solid rgba(16,35,63,.14); border-radius: 12px; color: var(--muted); display: flex; flex: 1 1 360px; gap: 9px; max-width: 560px; padding: 0 13px; }
.plugin-viewer__search:focus-within { border-color: #6d5dfc; box-shadow: 0 0 0 3px rgba(81,54,255,.1); }
.plugin-viewer__search input { background: transparent; border: 0; color: inherit; font: inherit; min-width: 0; outline: 0; padding: 12px 0; width: 100%; }
.plugin-viewer__modes { background: rgba(16,35,63,.055); border-radius: 11px; display: flex; gap: 3px; padding: 4px; }
.plugin-viewer__modes button { align-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--muted); cursor: pointer; display: flex; justify-content: center; padding: 8px 10px; }
.plugin-viewer__modes button.active { background: #fff; box-shadow: 0 2px 8px rgba(15,23,42,.1); color: #5136ff; }
.plugin-viewer__empty { color: var(--muted); margin: 18px 0 0; }
.plugin-viewer__empty-state { align-items: center; border: 1px dashed rgba(16,35,63,.18); border-radius: 14px; color: var(--muted); display: flex; flex-direction: column; gap: 6px; padding: 38px 20px; text-align: center; }
.plugin-viewer__empty-state strong { color: var(--ink); }
.plugin-viewer__catalog { display: grid; gap: 16px; }
.plugin-viewer__catalog--grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.plugin-card { --plugin-accent: #5136ff; background: linear-gradient(145deg,#fff,rgba(248,250,252,.96)); border: 1px solid rgba(16,35,63,.1); border-radius: 16px; box-shadow: 0 8px 24px rgba(15,23,42,.06); display: flex; min-width: 0; overflow: hidden; position: relative; }
.plugin-card::before { background: var(--plugin-accent); content: ""; height: 3px; left: 0; position: absolute; right: 0; top: 0; }
.plugin-viewer__catalog--grid .plugin-card { flex-direction: column; min-height: 330px; }
.plugin-card__illustration { align-items: center; background: color-mix(in srgb,var(--plugin-accent) 10%,#f8fafc); color: var(--plugin-accent); display: flex; flex: 0 0 92px; justify-content: center; overflow: hidden; }
.plugin-viewer__catalog--grid .plugin-card__illustration { flex-basis: 104px; }
.plugin-card__illustration img { height: 100%; object-fit: cover; width: 100%; }
.plugin-card__content { display: flex; flex: 1; flex-direction: column; min-width: 0; padding: 17px; }
.plugin-card__title-row { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; }
.plugin-card h3 { color: var(--ink); font-size: 1rem; line-height: 1.25; margin: 0; }
.plugin-card__byline { color: var(--muted); font-size: .72rem; margin: 4px 0 0; }
.plugin-card__description { color: var(--muted); display: -webkit-box; font-size: .82rem; line-height: 1.5; margin: 13px 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.plugin-viewer__catalog--grid .plugin-card__description { min-height: 3.7em; }
.plugin-card__metadata { align-items: center; display: flex; flex-wrap: wrap; gap: 7px; margin-top: auto; }
.plugin-card__metadata > span { background: rgba(15,23,42,.055); border-radius: 999px; font-size: .68rem; font-weight: 800; padding: 5px 8px; }
.plugin-card__compatibility--compatible { color: #15803d; }
.plugin-card__compatibility--missing,
.plugin-card__compatibility--incompatible { color: #b45309; }
.plugin-card__compatibility--unavailable { color: #64748b; }
.plugin-card__actions { border-top: 1px solid rgba(16,35,63,.08); margin-top: 13px; padding-top: 12px; }
.plugin-card__customize { align-items: center; background: transparent; border: 0; color: var(--plugin-accent); cursor: pointer; display: inline-flex; font: inherit; font-size: .78rem; font-weight: 850; gap: 7px; padding: 2px 0; }
.plugin-switch { flex: 0 0 auto; height: 26px; position: relative; width: 46px; }
.plugin-switch input { height: 1px; opacity: 0; position: absolute; width: 1px; }
.plugin-switch span { background: #cbd5e1; border-radius: 999px; cursor: pointer; inset: 0; position: absolute; transition: background 160ms ease; }
.plugin-switch span::after { background: #fff; border-radius: 50%; box-shadow: 0 2px 6px rgba(15,23,42,.25); content: ""; height: 20px; left: 3px; position: absolute; top: 3px; transition: transform 160ms ease; width: 20px; }
.plugin-switch input:checked + span { background: var(--plugin-accent); }
.plugin-switch input:checked + span::after { transform: translateX(20px); }
.plugin-switch input:focus-visible + span { outline: 3px solid rgba(81,54,255,.25); outline-offset: 2px; }
.plugin-viewer__catalog--list .plugin-card { min-height: 132px; }
.plugin-viewer__catalog--list .plugin-card__description { -webkit-line-clamp: 2; margin-bottom: 9px; margin-top: 8px; }
.plugin-viewer__catalog--list .plugin-card__actions { border: 0; margin: 0 0 0 auto; padding: 0; }
.plugin-viewer__catalog--list .plugin-card__metadata { margin-top: 3px; }
.plugin-pagination { align-items: center; display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-top: 22px; }
.plugin-pagination button { align-items: center; background: #fff; border: 1px solid rgba(16,35,63,.12); border-radius: 8px; color: var(--ink); cursor: pointer; display: inline-flex; font: inherit; font-size: .78rem; font-weight: 800; height: 34px; justify-content: center; min-width: 34px; }
.plugin-pagination button.active { background: #5136ff; border-color: #5136ff; color: #fff; }
.plugin-pagination button:disabled { cursor: default; opacity: .38; }
.plugin-pagination span { color: var(--muted); padding: 0 3px; }
.plugin-customizer__disabled { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; color: #9a3412; font-size: .82rem; margin: 0 0 16px; padding: 11px 13px; }
.plugin-customizer__content--disabled { opacity: .62; }
.sr-only { height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; width: 1px; clip: rect(0,0,0,0); white-space: nowrap; }
@media (max-width: 760px) {
  .plugin-viewer__catalog--grid { grid-template-columns: 1fr; }
  .plugin-viewer__toolbar { align-items: stretch; flex-direction: column; }
  .plugin-viewer__search { flex-basis: auto; max-width: none; }
  .plugin-viewer__modes { align-self: flex-end; }
}
@media (max-width: 560px) {
  .plugin-viewer__heading { display: block; }
  .plugin-viewer__count { display: inline-block; margin-top: 10px; }
  .plugin-viewer__catalog--list .plugin-card { flex-direction: column; }
  .plugin-viewer__catalog--list .plugin-card__illustration { flex-basis: 78px; }
}
</style>
