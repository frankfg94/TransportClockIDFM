<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import MaterialCombobox from "../../components/MaterialCombobox.vue";
import {
  boardTogglesPlacementOptions,
  closedDirectionSummaryOptions,
  compactLinePlanOptions,
  maxDeparturesPerDirectionOptions,
  navigationAutoHideOptions,
  parseMaxDeparturesPerDirection,
  parseTransferBundleRetentionDays,
  parseTransferBundleRequestConcurrency,
  parseTransferBundleRequestSpacingMs,
  parseWeatherLookaheadMinutes,
  transferBundleRequestConcurrencyOptions,
  transferBundleRequestSpacingOptions,
  transferBundleRetentionOptions,
  trafficInfoDefaultScopeOptions,
  trafficInfoDesignOptions,
  useAppSettings,
  wakeLockDurationOptions,
  weatherLookaheadOptions,
  weatherModeOptions,
  weatherTestModeOptions,
  type BoardTogglesPlacement,
  type ClosedDirectionSummaryMode,
  type CompactLinePlanMode,
  type NavigationAutoHide,
  type TrafficInfoDefaultScope,
  type TrafficInfoDesign,
  type TransferBundleRequestConcurrency,
  type TransferBundleRequestSpacingMs,
  type WakeLockDuration,
  type WeatherMode,
  type WeatherTestMode,
} from "./appSettings";
import {
  clearTransferBundles,
  deleteTransferBundle,
  listTransferBundles,
  type TransferBundleSummary,
} from "../service-pattern/transferBundles";
import { clearPatternTransferRuntimeCaches } from "../service-pattern/patternTransfers";
import {
  weatherLocationOptions,
  type WeatherLocationPreset,
} from "../weather/weatherLocations";

const { settings, updateSettings, resetSettings } = useAppSettings();
const bundlesModalOpen = ref(false);
const bundleSummaries = ref<TransferBundleSummary[]>([]);
const localBundleSummaries = ref<TransferBundleSummary[]>([]);
const settingsNotification = ref("");
const backendBundleCount = computed(() => bundleSummaries.value.length);
const localBundleCount = computed(() => localBundleSummaries.value.length);
const bundleCount = computed(
  () => backendBundleCount.value + localBundleCount.value,
);
let settingsNotificationTimer: ReturnType<typeof setTimeout> | undefined;

function updateClosedSummaryMode(value: string): void {
  updateSettings({
    closedDirectionSummaryMode: value as ClosedDirectionSummaryMode,
  });
}

function updateMaxDepartures(value: string): void {
  updateSettings({
    maxDeparturesPerDirection: parseMaxDeparturesPerDirection(value),
  });
}

function updateWakeLock(value: string): void {
  updateSettings({ wakeLockDuration: value as WakeLockDuration });
}

function updateAutoHide(value: string): void {
  updateSettings({ navigationAutoHide: value as NavigationAutoHide });
}

function updateBoardTogglesPlacement(value: string): void {
  updateSettings({ boardTogglesPlacement: value as BoardTogglesPlacement });
}

function updateCompactMode(value: string): void {
  updateSettings({ compactLinePlanMode: value as CompactLinePlanMode });
}

function updateTrafficInfoDesign(value: string): void {
  updateSettings({ trafficInfoDesign: value as TrafficInfoDesign });
}

function updateTrafficInfoDefaultScope(value: string): void {
  updateSettings({ trafficInfoDefaultScope: value as TrafficInfoDefaultScope });
}

function updateTransferBundleRetention(value: string): void {
  updateSettings({
    transferBundleRetentionDays: parseTransferBundleRetentionDays(value),
  });
}

function updateTransferBundleRequestConcurrency(value: string): void {
  updateSettings({
    transferBundleRequestConcurrency: parseTransferBundleRequestConcurrency(
      value,
    ) as TransferBundleRequestConcurrency,
  });
}

function updateTransferBundleRequestSpacing(value: string): void {
  updateSettings({
    transferBundleRequestSpacingMs: parseTransferBundleRequestSpacingMs(
      value,
    ) as TransferBundleRequestSpacingMs,
  });
}

async function openBundlesModal(): Promise<void> {
  await refreshBundleSummaries();
  bundlesModalOpen.value = true;
}

async function refreshBundleSummaries(): Promise<void> {
  // Backend bundles can disappear on Cloudflare Pages, while local bundles are
  // tied to the current browser. Showing both makes cache debugging clearer.
  const backendSummaries = await listTransferBundles();

  bundleSummaries.value = backendSummaries;
  localBundleSummaries.value =
    typeof window === "undefined"
      ? []
      : listTransferBundles(window.localStorage);
}

async function clearBundles(): Promise<void> {
  // Clear both cache layers. The backend request is allowed to fail because the
  // local cache cleanup should still happen in offline/serverless edge cases.
  const backendClear = clearTransferBundles().catch(() => undefined);

  if (typeof window !== "undefined") {
    clearTransferBundles(window.localStorage);
  }

  clearPatternTransferRuntimeCaches();
  showSettingsNotification(
    "Bundles supprimés côté navigateur et backend. Le prochain plan rechargera les correspondances.",
  );
  await backendClear;
  await refreshBundleSummaries();
}

async function deleteBundle(id: string): Promise<void> {
  const backendDelete = deleteTransferBundle(id).catch(() => undefined);

  if (typeof window !== "undefined") {
    deleteTransferBundle(id, window.localStorage);
  }

  clearPatternTransferRuntimeCaches();
  await backendDelete;
  await refreshBundleSummaries();
}

function formatBundleDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function formatTransferResolverMode(
  _value: TransferBundleSummary["transferResolverMode"],
): string {
  return "Nearby";
}

function formatTransferBundleDistance(
  value: TransferBundleSummary["nearbyDistanceMeters"],
): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value} m`
    : "distance auto";
}

function updateWeatherMode(value: string): void {
  updateSettings({ weatherMode: value as WeatherMode });
}

function updateWeatherTestMode(value: string): void {
  updateSettings({ weatherTestMode: value as WeatherTestMode });
}

function updateWeatherLookahead(value: string): void {
  updateSettings({
    weatherLookaheadMinutes: parseWeatherLookaheadMinutes(value),
  });
}

function updateWeatherLocationPreset(value: string): void {
  updateSettings({ weatherLocationPreset: value as WeatherLocationPreset });
}

function updateWeatherCustomLocation(
  field: "label" | "latitude" | "longitude",
  value: string,
): void {
  updateSettings({
    weatherCustomLocation: {
      ...settings.value.weatherCustomLocation,
      [field]: field === "label" ? value : Number.parseFloat(value),
    },
  });
}

function resetSettingsWithNotification(): void {
  resetSettings();
  showSettingsNotification("Paramètres réinitialisés.");
}

function showSettingsNotification(message: string): void {
  settingsNotification.value = message;

  if (settingsNotificationTimer) {
    clearTimeout(settingsNotificationTimer);
  }

  settingsNotificationTimer = setTimeout(() => {
    settingsNotification.value = "";
    settingsNotificationTimer = undefined;
  }, 5_000);
}

onBeforeUnmount(() => {
  if (settingsNotificationTimer) {
    clearTimeout(settingsNotificationTimer);
  }
});
</script>

<template>
  <main class="settings-page">
    <header class="settings-page__hero">
      <p class="eyebrow">Paramètres</p>
      <h1>Personnalisation du dashboard</h1>
      <p>
        Ces réglages restent sur cette tablette ou ce navigateur. Les valeurs
        par défaut gardent l'apparence actuelle de l'application.
      </p>
    </header>

    <section class="settings-panel" aria-labelledby="settings-display-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">Affichage</p>
          <h2 id="settings-display-title">Tableaux et prochains passages</h2>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>Affichage des stations</strong>
          <span>
            Garde les boutons de stations visibles ou les range dans le menu
            contextuel du dashboard.
          </span>
        </div>
        <MaterialCombobox
          :model-value="settings.boardTogglesPlacement"
          :options="[...boardTogglesPlacementOptions]"
          aria-label="Emplacement des boutons de stations"
          @update:model-value="updateBoardTogglesPlacement"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>Accordion fermé</strong>
          <span>Choisit le résumé visible sans ouvrir une direction.</span>
        </div>
        <MaterialCombobox
          :model-value="settings.closedDirectionSummaryMode"
          :options="[...closedDirectionSummaryOptions]"
          aria-label="Affichage accordion fermé"
          @update:model-value="updateClosedSummaryMode"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>Prochains passages par direction</strong>
          <span
            >La valeur par défaut conserve la limite actuelle du tableau.</span
          >
        </div>
        <MaterialCombobox
          :model-value="String(settings.maxDeparturesPerDirection)"
          :options="[...maxDeparturesPerDirectionOptions]"
          aria-label="Nombre maximum de prochains passages"
          @update:model-value="updateMaxDepartures"
        />
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.terminalDirectionsOnly"
          @change="
            updateSettings({
              terminalDirectionsOnly: ($event.target as HTMLInputElement)
                .checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>Afficher uniquement les directions terminus</strong>
          <small>
            Les directions au statut inconnu restent visibles pour éviter de
            masquer des données utiles.
          </small>
        </div>
      </label>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.ghostNetworkStructuralOnly"
          @change="
            updateSettings({
              ghostNetworkStructuralOnly: (
                $event.target as HTMLInputElement
              ).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>
            Limiter les lignes fantômes aux modes structurants
          </strong>
          <small>
            Masque les bus sur la carte détaillée et conserve métro, RER,
            train, tram, câble et funiculaire.
          </small>
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>Apparence info trafic</strong>
          <span>Le style RATP compact est le mode par défaut.</span>
        </div>
        <MaterialCombobox
          :model-value="settings.trafficInfoDesign"
          :options="[...trafficInfoDesignOptions]"
          aria-label="Apparence de la page info trafic"
          @update:model-value="updateTrafficInfoDesign"
        />
      </div>
    </section>

    <section class="settings-panel" aria-labelledby="settings-traffic-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">Info trafic</p>
          <h2 id="settings-traffic-title">Page info trafic</h2>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>Mode par défaut</strong>
          <span>
            Optimisé affiche uniquement les lignes des stations ajoutées. Toutes
            les lignes affiche l'info traffic pour toutes les lignes.
          </span>
        </div>
        <MaterialCombobox
          :model-value="settings.trafficInfoDefaultScope"
          :options="[...trafficInfoDefaultScopeOptions]"
          aria-label="Mode par défaut info trafic"
          @update:model-value="updateTrafficInfoDefaultScope"
        />
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.transferBundleLocalCacheEnabled"
          @change="
            updateSettings({
              transferBundleLocalCacheEnabled: (
                $event.target as HTMLInputElement
              ).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>Activer le cache navigateur</strong>
          <small>
            Utilise localStorage avant le cache backend pour éviter de
            recalculer les correspondances après un reload sur Cloudflare Pages.
          </small>
        </div>
      </label>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.transferBundleBackendCacheEnabled"
          @change="
            updateSettings({
              transferBundleBackendCacheEnabled: (
                $event.target as HTMLInputElement
              ).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>Activer le cache backend</strong>
          <small>
            Conserve les bundles de correspondances dans le cache serveur Nuxt
            entre deux chargements.
          </small>
          <small
            v-if="!settings.transferBundleBackendCacheEnabled"
            class="settings-inline-warning"
            role="alert"
          >
            Le chargement des correspondances sera très lent tant que le cache
            backend est désactivé.
          </small>
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>Expiration des bundles</strong>
          <span>
            Les correspondances pre-calculees sont supprimees automatiquement
            apres ce delai.
          </span>
        </div>
        <MaterialCombobox
          :model-value="String(settings.transferBundleRetentionDays)"
          :options="[...transferBundleRetentionOptions]"
          aria-label="Expiration des bundles de correspondances"
          @update:model-value="updateTransferBundleRetention"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>Chargement des correspondances</strong>
          <span>
            Les bundles utilisent uniquement la recherche nearby optimisee cote
            backend.
          </span>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>Concurrence des bundles</strong>
          <span>
            1 est le mode le plus fiable. Augmente seulement pour tester un
            chargement plus rapide sur les APIs externes.
          </span>
          <small
            v-if="settings.transferBundleRequestConcurrency > 1"
            class="settings-inline-warning"
          >
            Attention : au-dessus de 1, certaines APIs peuvent répondre de façon
            partielle ou limiter le débit.
          </small>
        </div>
        <MaterialCombobox
          :model-value="String(settings.transferBundleRequestConcurrency)"
          :options="[...transferBundleRequestConcurrencyOptions]"
          aria-label="Niveau de concurrence des bundles de correspondances"
          @update:model-value="updateTransferBundleRequestConcurrency"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>Espacement des appels bundles</strong>
          <span>
            Ajoute un delai entre deux departs d'appels pour reduire le risque
            de reponses 429 quand l'API limite le debit.
          </span>
          <small
            v-if="settings.transferBundleRequestSpacingMs > 0"
            class="settings-inline-warning"
          >
            Le chargement initial sera plus lent, mais les bundles deja en cache
            restent instantanes.
          </small>
        </div>
        <MaterialCombobox
          :model-value="String(settings.transferBundleRequestSpacingMs)"
          :options="[...transferBundleRequestSpacingOptions]"
          aria-label="Espacement des appels bundles de correspondances"
          @update:model-value="updateTransferBundleRequestSpacing"
        />
      </div>

      <div class="settings-bundle-actions">
        <div>
          <strong>Bundles de correspondances</strong>
          <span>
            Consulte ou supprime le cache navigateur et backend utilise pour
            accelerer les schemas de ligne.
          </span>
        </div>
        <div class="settings-bundle-actions__buttons">
          <button
            class="button-secondary"
            type="button"
            @click="openBundlesModal"
          >
            View bundles
          </button>
          <button class="button-secondary" type="button" @click="clearBundles">
            Clear bundles
          </button>
        </div>
      </div>
    </section>

    <section class="settings-panel" aria-labelledby="settings-weather-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">Météo</p>
          <h2 id="settings-weather-title">Météo dynamique</h2>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>Météo dynamique</strong>
          <span>
            Le mode animé affiche un fond météo uniquement en cas d'intempérie.
          </span>
        </div>
        <MaterialCombobox
          :model-value="settings.weatherMode"
          :options="[...weatherModeOptions]"
          aria-label="Mode météo dynamique"
          @update:model-value="updateWeatherMode"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>Mode test</strong>
          <span>
            Force une fausse alerte météo locale pour prévisualiser le rendu.
          </span>
        </div>
        <MaterialCombobox
          :model-value="settings.weatherTestMode"
          :options="[...weatherTestModeOptions]"
          aria-label="Mode test météo"
          @update:model-value="updateWeatherTestMode"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>Prévenir à l'avance</strong>
          <span
            >Fenêtre de prévision utilisée avant d'afficher une alerte.</span
          >
        </div>
        <MaterialCombobox
          :model-value="String(settings.weatherLookaheadMinutes)"
          :options="[...weatherLookaheadOptions]"
          aria-label="Fenêtre de prévision météo"
          @update:model-value="updateWeatherLookahead"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>Lieu météo</strong>
          <span>Paris est utilisé par défaut, avec quelques presets IDF.</span>
        </div>
        <MaterialCombobox
          :model-value="settings.weatherLocationPreset"
          :options="[...weatherLocationOptions]"
          aria-label="Lieu météo"
          @update:model-value="updateWeatherLocationPreset"
        />
      </div>

      <div
        v-if="settings.weatherLocationPreset === 'custom'"
        class="settings-custom-location"
      >
        <label>
          <span>Nom</span>
          <input
            class="settings-input"
            :value="settings.weatherCustomLocation.label"
            type="text"
            @input="
              updateWeatherCustomLocation(
                'label',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
        <label>
          <span>Latitude</span>
          <input
            class="settings-input"
            :value="settings.weatherCustomLocation.latitude"
            inputmode="decimal"
            type="number"
            step="0.0001"
            @input="
              updateWeatherCustomLocation(
                'latitude',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
        <label>
          <span>Longitude</span>
          <input
            class="settings-input"
            :value="settings.weatherCustomLocation.longitude"
            inputmode="decimal"
            type="number"
            step="0.0001"
            @input="
              updateWeatherCustomLocation(
                'longitude',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
      </div>
    </section>

    <section class="settings-panel" aria-labelledby="settings-map-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">Plans</p>
          <h2 id="settings-map-title">Schémas de ligne</h2>
        </div>
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.showPatternMiniMap"
          @change="
            updateSettings({
              showPatternMiniMap: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>Afficher la minimap</strong>
          <small>Visible dans le schéma détaillé d'une ligne.</small>
        </div>
      </label>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.showPatternCityZones"
          @change="
            updateSettings({
              showPatternCityZones: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>Afficher les villes du plan</strong>
          <small
            >Regroupe les stations voisines par commune sur le schema.</small
          >
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>Vue compacte du plan</strong>
          <span
            >Automatique active la vue compacte uniquement sur les lignes
            denses.</span
          >
        </div>
        <MaterialCombobox
          :model-value="settings.compactLinePlanMode"
          :options="[...compactLinePlanOptions]"
          aria-label="Mode compact du plan"
          @update:model-value="updateCompactMode"
        />
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.richTransferTooltips"
          @change="
            updateSettings({
              richTransferTooltips: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>Tooltips riches de correspondances</strong>
          <small
            >Affiche les groupes de transport et les directions bus au
            survol.</small
          >
        </div>
      </label>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.reduceMotion"
          @change="
            updateSettings({
              reduceMotion: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>Réduire les animations</strong>
          <small
            >Conserve les interactions, mais limite les effets visuels
            secondaires.</small
          >
        </div>
      </label>
    </section>

    <section class="settings-panel" aria-labelledby="settings-device-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">Tablette</p>
          <h2 id="settings-device-title">Écran et navigation</h2>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>Wake lock</strong>
          <span
            >Demande au navigateur de garder l'écran actif pendant la durée
            choisie.</span
          >
        </div>
        <MaterialCombobox
          :model-value="settings.wakeLockDuration"
          :options="[...wakeLockDurationOptions]"
          aria-label="Durée du wake lock"
          @update:model-value="updateWakeLock"
        />
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.wakeDeviceOnAlarm"
          @change="
            updateSettings({
              wakeDeviceOnAlarm: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>Wake device on alarm</strong>
          <small>
            Réactive le wake lock ou la notification quand le navigateur le
            permet, sans promettre de réveiller un OS endormi.
          </small>
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>Masquer la navigation</strong>
          <span
            >Le menu réapparaît au toucher, au focus ou au retour sur
            l'onglet.</span
          >
        </div>
        <MaterialCombobox
          :model-value="settings.navigationAutoHide"
          :options="[...navigationAutoHideOptions]"
          aria-label="Masquage automatique de la navigation"
          @update:model-value="updateAutoHide"
        />
      </div>
    </section>

    <footer class="settings-page__footer">
      <button
        class="button-secondary"
        type="button"
        @click="resetSettingsWithNotification"
      >
        Réinitialiser
      </button>
    </footer>

    <Teleport to="body">
      <Transition name="settings-notification">
        <aside
          v-if="settingsNotification"
          class="settings-notification"
          role="status"
          aria-live="polite"
        >
          {{ settingsNotification }}
        </aside>
      </Transition>

      <div
        v-if="bundlesModalOpen"
        class="settings-bundle-modal-backdrop"
        role="presentation"
        @click.self="bundlesModalOpen = false"
      >
        <section
          class="settings-bundle-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-bundles-title"
        >
          <header>
            <div>
              <p class="eyebrow">Correspondances</p>
              <h2 id="settings-bundles-title">Bundles enregistres</h2>
            </div>
            <button
              class="button-secondary"
              type="button"
              aria-label="Fermer"
              @click="bundlesModalOpen = false"
            >
              x
            </button>
          </header>

          <p class="settings-bundle-modal__summary">
            {{ bundleCount }} bundle{{ bundleCount > 1 ? "s" : "" }} en cache :
            {{ backendBundleCount }} backend, {{ localBundleCount }} navigateur.
          </p>

          <section
            v-if="bundleSummaries.length"
            class="settings-bundle-section"
          >
            <h3>Backend</h3>
            <div class="settings-bundle-list">
              <article
                v-for="bundle in bundleSummaries"
                :key="bundle.id"
                class="settings-bundle-item"
              >
                <div>
                  <strong>{{ bundle.lineLabel }}</strong>
                  <span>
                    {{ bundle.stopAreaCount }} stations -
                    {{ bundle.transferCount }} correspondances -
                    {{
                      formatTransferResolverMode(bundle.transferResolverMode)
                    }}
                    -
                    {{
                      formatTransferBundleDistance(bundle.nearbyDistanceMeters)
                    }}
                  </span>
                  <small
                    >Expire le {{ formatBundleDate(bundle.expiresAt) }}</small
                  >
                </div>
                <button
                  class="button-secondary"
                  type="button"
                  @click="deleteBundle(bundle.id)"
                >
                  Supprimer
                </button>
              </article>
            </div>
          </section>

          <section
            v-if="localBundleSummaries.length"
            class="settings-bundle-section"
          >
            <h3>Navigateur</h3>
            <div class="settings-bundle-list">
              <article
                v-for="bundle in localBundleSummaries"
                :key="`local-${bundle.id}`"
                class="settings-bundle-item"
              >
                <div>
                  <strong>{{ bundle.lineLabel }}</strong>
                  <span>
                    {{ bundle.stopAreaCount }} stations -
                    {{ bundle.transferCount }} correspondances -
                    {{
                      formatTransferResolverMode(bundle.transferResolverMode)
                    }}
                    -
                    {{
                      formatTransferBundleDistance(bundle.nearbyDistanceMeters)
                    }}
                  </span>
                  <small
                    >Expire le {{ formatBundleDate(bundle.expiresAt) }}</small
                  >
                </div>
                <button
                  class="button-secondary"
                  type="button"
                  @click="deleteBundle(bundle.id)"
                >
                  Supprimer
                </button>
              </article>
            </div>
          </section>

          <p v-if="!bundleCount" class="settings-bundle-modal__empty">
            Aucun bundle enregistre pour l'instant.
          </p>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.settings-page {
  color: var(--ink);
  margin: 0 auto;
  max-width: 1120px;
  min-height: 100vh;
  padding: 42px 22px 110px;
}

.settings-page__hero {
  margin-bottom: 24px;
}

.settings-page__hero h1 {
  font-size: clamp(2rem, 4vw, 3.8rem);
  letter-spacing: 0;
  line-height: 0.98;
  margin: 0;
}

.settings-page__hero p:last-child {
  color: var(--muted);
  font-size: 1.05rem;
  font-weight: 720;
  line-height: 1.5;
  max-width: 760px;
}

.settings-panel {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(16, 35, 63, 0.08);
  display: grid;
  gap: 18px;
  margin-top: 18px;
  padding: 22px;
}

.settings-panel__heading {
  align-items: center;
  border-bottom: 1px solid rgba(16, 35, 63, 0.1);
  display: flex;
  justify-content: space-between;
  padding-bottom: 16px;
}

.settings-panel h2 {
  font-size: 1.55rem;
  line-height: 1.1;
  margin: 0;
}

.settings-row {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
}

.settings-row strong,
.settings-toggle strong {
  display: block;
  font-size: 1.02rem;
  font-weight: 950;
}

.settings-row span,
.settings-toggle small {
  color: var(--muted);
  display: block;
  font-weight: 720;
  line-height: 1.45;
  margin-top: 4px;
}

.settings-toggle .settings-inline-warning {
  background: #fff7ed;
  border: 1px solid rgba(234, 88, 12, 0.2);
  border-radius: 8px;
  color: #9a3412;
  display: inline-block;
  font-size: 0.82rem;
  font-weight: 850;
  line-height: 1.35;
  margin-top: 10px;
  padding: 8px 10px;
}

.settings-bundle-actions {
  align-items: center;
  background: #f7f9fe;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 8px;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 16px;
}

.settings-bundle-actions strong {
  display: block;
  font-size: 1.02rem;
  font-weight: 950;
}

.settings-bundle-actions span {
  color: var(--muted);
  display: block;
  font-weight: 720;
  line-height: 1.45;
  margin-top: 4px;
}

.settings-bundle-actions__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.settings-bundle-modal-backdrop {
  align-items: center;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 22px;
  position: fixed;
  z-index: 10000;
}

.settings-bundle-modal {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.12);
  border-radius: 10px;
  box-shadow: 0 24px 70px rgba(16, 35, 63, 0.22);
  color: var(--ink);
  display: grid;
  gap: 16px;
  max-height: min(720px, calc(100vh - 44px));
  overflow: auto;
  padding: 22px;
  width: min(720px, 100%);
}

.settings-bundle-modal header {
  align-items: center;
  border-bottom: 1px solid rgba(16, 35, 63, 0.1);
  display: flex;
  justify-content: space-between;
  padding-bottom: 14px;
}

.settings-bundle-modal h2 {
  margin: 0;
}

.settings-bundle-modal__summary,
.settings-bundle-modal__empty {
  color: var(--muted);
  font-weight: 850;
  margin: 0;
}

.settings-bundle-section {
  display: grid;
  gap: 10px;
}

.settings-bundle-section h3 {
  font-size: 0.95rem;
  font-weight: 950;
  margin: 0;
  text-transform: uppercase;
}

.settings-bundle-list {
  display: grid;
  gap: 10px;
}

.settings-bundle-item {
  align-items: center;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  display: flex;
  gap: 14px;
  justify-content: space-between;
  padding: 14px;
}

.settings-bundle-item strong,
.settings-bundle-item span,
.settings-bundle-item small {
  display: block;
}

.settings-bundle-item strong {
  font-weight: 950;
}

.settings-bundle-item span,
.settings-bundle-item small {
  color: var(--muted);
  font-weight: 780;
  margin-top: 3px;
}

.settings-custom-location {
  display: grid;
  gap: 14px;
  grid-template-columns: 1.4fr 1fr 1fr;
}

.settings-custom-location label {
  display: grid;
  gap: 7px;
}

.settings-custom-location label > span {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 950;
  text-transform: uppercase;
}

.settings-input {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.16);
  border-radius: 8px;
  color: var(--ink);
  font: inherit;
  font-weight: 850;
  min-height: 44px;
  padding: 8px 12px;
  width: 100%;
}

.settings-input:focus {
  border-color: var(--idfm-blue);
  box-shadow: 0 0 0 3px rgba(0, 100, 255, 0.12);
  outline: none;
}

.settings-toggle {
  align-items: center;
  background: #f7f9fe;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  gap: 16px;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 78px;
  padding: 16px;
}

.settings-toggle input {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

.settings-toggle > span {
  background: #dbe4f2;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(16, 35, 63, 0.08);
  display: block;
  height: 34px;
  position: relative;
  transition: background 160ms ease;
  width: 58px;
}

.settings-toggle > span::after {
  background: #ffffff;
  border-radius: 999px;
  box-shadow: 0 3px 9px rgba(16, 35, 63, 0.18);
  content: "";
  height: 26px;
  left: 4px;
  position: absolute;
  top: 4px;
  transition: transform 160ms ease;
  width: 26px;
}

.settings-toggle input:checked + span {
  background: var(--idfm-blue);
}

.settings-toggle input:checked + span::after {
  transform: translateX(24px);
}

.settings-page__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 22px;
}

.settings-notification {
  background: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  bottom: 24px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.24);
  color: #000000;
  font-weight: 900;
  max-width: min(420px, calc(100vw - 32px));
  padding: 14px 16px;
  position: fixed;
  right: 24px;
  z-index: 11000;
}

.settings-notification-enter-active,
.settings-notification-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.settings-notification-enter-from,
.settings-notification-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.eyebrow {
  color: #5136ff;
  font-size: 0.8rem;
  font-weight: 950;
  letter-spacing: 0.04em;
  margin: 0 0 7px;
  text-transform: uppercase;
}

@media (max-width: 760px) {
  .settings-row,
  .settings-custom-location {
    grid-template-columns: 1fr;
  }
}
</style>
