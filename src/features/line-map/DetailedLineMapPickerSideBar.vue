<script setup lang="ts">
import { ExternalLink, MapIcon, MapPinned, Star, X } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import StationTransferDetails from "../../components/StationTransferDetails.vue";
import type { NetworkGhostLineView } from "../network-ghost";
import type {
  LineFrequencyProfile,
  TransferLineOption,
} from "../../types/transit";
import type { LineMapStopView } from "./types";

defineProps<{
  stop: LineMapStopView;
  transfers: TransferLineOption[];
  transfersLoading: boolean;
  transfersError?: string;
  lineColor?: string;
  showActions?: boolean;
  favoriteLoading?: boolean;
  favoriteError?: string;
  activeGhostLine?: NetworkGhostLineView;
  ghostDirections?: string[];
  ghostDirectionsLoading?: boolean;
  ghostDirectionsError?: boolean;
  ghostFrequency?: LineFrequencyProfile;
  ghostFrequencyLoading?: boolean;
  ghostFrequencyError?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  addFavorite: [];
  openGoogleMaps: [];
}>();

function isNoctilienLine(line: NetworkGhostLineView): boolean {
  return (
    line.family === "NOCTILIEN" ||
    line.mode.toLowerCase().includes("noctilien") ||
    /^n[\s_-]*\d{1,3}[a-z]?$/iu.test(line.label.trim())
  );
}

function hasDayFrequency(profile?: LineFrequencyProfile): boolean {
  return Boolean(profile?.peakMinutes || profile?.offPeakMinutes);
}

function formatFrequency(minutes?: number): string {
  return minutes ? `≈ ${minutes} min` : "Indisponible";
}
</script>

<template>
  <aside
    class="line-map-sidebar"
    aria-label="Détails de la station"
    data-testid="line-map-sidebar"
  >
    <header class="line-map-sidebar__topbar">
      <span>Détails de la station</span>
      <button
        class="icon-button line-map-sidebar__close"
        type="button"
        aria-label="Fermer les détails de la station"
        @click="emit('close')"
      >
        <X aria-hidden="true" />
      </button>
    </header>

    <div class="line-map-sidebar__content">
      <section
        v-if="activeGhostLine"
        class="line-map-sidebar__ghost-detail"
        data-testid="line-map-sidebar-ghost-detail"
      >
        <header>
          <LineIconBadge :line="activeGhostLine" compact />
          <div>
            <small>Ligne survolée</small>
            <strong>{{ activeGhostLine.label }}</strong>
            <span>{{ activeGhostLine.mode }}</span>
          </div>
        </header>

        <div class="line-map-sidebar__ghost-directions">
          <small>Directions de la ligne</small>
          <span
            v-if="ghostDirectionsLoading"
            class="line-map-sidebar__ghost-muted"
          >
            Chargement...
          </span>
          <div v-else-if="ghostDirections?.length">
            <span
              v-for="direction in ghostDirections"
              :key="`${activeGhostLine.id}-${direction}`"
            >
              {{ direction }}
            </span>
          </div>
          <span v-else class="line-map-sidebar__ghost-muted">
            {{
              ghostDirectionsError
                ? "Directions indisponibles"
                : "Aucune direction renseignée"
            }}
          </span>
        </div>

        <div class="line-map-sidebar__ghost-frequency">
          <small>Fréquence théorique à cette station</small>
          <span
            v-if="ghostFrequencyLoading"
            class="line-map-sidebar__ghost-muted"
          >
            Calcul en cours...
          </span>
          <div
            v-else-if="
              ghostFrequency &&
              (hasDayFrequency(ghostFrequency) ||
                ghostFrequency.nightMinutes)
            "
            class="line-map-sidebar__ghost-frequency-grid"
          >
            <template v-if="isNoctilienLine(activeGhostLine)">
              <div class="line-map-sidebar__ghost-frequency-card">
                <span>Nuit</span>
                <strong>
                  {{ formatFrequency(ghostFrequency.nightMinutes) }}
                </strong>
                <small>23h30–5h</small>
              </div>
            </template>
            <template v-else>
              <div class="line-map-sidebar__ghost-frequency-card">
                <span>Heures de pointe</span>
                <strong>
                  {{ formatFrequency(ghostFrequency.peakMinutes) }}
                </strong>
                <small>7h–9h30 · 17h30–19h</small>
              </div>
              <div class="line-map-sidebar__ghost-frequency-card">
                <span>Heures creuses</span>
                <strong>
                  {{ formatFrequency(ghostFrequency.offPeakMinutes) }}
                </strong>
                <small>Hors pointe, de 5h à 23h30</small>
              </div>
            </template>
          </div>
          <span v-else class="line-map-sidebar__ghost-muted">
            {{
              ghostFrequencyError
                ? "Fréquence indisponible"
                : "Pas assez d’horaires pour calculer la fréquence"
            }}
          </span>
        </div>
      </section>

      <StationTransferDetails
        :station-label="stop.label"
        :city="stop.city"
        :transfers="transfers"
        :loading="transfersLoading"
        :error="transfersError"
        :line-color="lineColor"
      />
    </div>

    <footer v-if="showActions" class="line-map-sidebar__actions">
      <p v-if="favoriteError" class="line-map-sidebar__error" role="alert">
        {{ favoriteError }}
      </p>
      <button
        class="line-map-sidebar__favorite"
        type="button"
        :disabled="favoriteLoading"
        @click="emit('addFavorite')"
      >
        <Star aria-hidden="true" />
        {{ favoriteLoading ? "Ajout en cours..." : "Ajouter aux favoris" }}
      </button>
      <button
        class="button-secondary line-map-sidebar__maps"
        type="button"
        @click="emit('openGoogleMaps')"
      >
        <MapIcon aria-hidden="true" />
        Voir sur Google Maps
        <ExternalLink aria-hidden="true" />
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.line-map-sidebar {
  background: var(--surface);
  box-shadow: -18px 0 46px rgba(16, 35, 63, 0.2);
  color: var(--ink);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
  width: clamp(320px, 30vw, 400px);
  z-index: 8;
}

.line-map-sidebar__topbar {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  font-size: 0.78rem;
  font-weight: 950;
  justify-content: space-between;
  min-height: 50px;
  padding: 8px 12px 8px 18px;
  text-transform: uppercase;
}

.line-map-sidebar__close {
  height: 36px;
  min-height: 36px;
  width: 36px;
}

.line-map-sidebar__close svg,
.line-map-sidebar__actions svg {
  height: 18px;
  width: 18px;
}

.line-map-sidebar__content {
  display: grid;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

.line-map-sidebar__ghost-detail {
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  display: grid;
  gap: 12px;
  padding: 12px;
  align-items: start;
  align-content: baseline;
}

.line-map-sidebar__ghost-detail header {
  align-items: center;
  display: flex;
  gap: 10px;
}

.line-map-sidebar__ghost-detail header div {
  display: grid;
  gap: 2px;
}

.line-map-sidebar__ghost-detail header small,
.line-map-sidebar__ghost-directions > small,
.line-map-sidebar__ghost-frequency > small {
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 950;
  text-transform: uppercase;
}

.line-map-sidebar__ghost-detail header strong {
  color: var(--ink);
  font-size: 0.92rem;
}

.line-map-sidebar__ghost-detail header span {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.line-map-sidebar__ghost-directions {
  display: grid;
  gap: 7px;
}

.line-map-sidebar__ghost-frequency {
  display: grid;
  gap: 7px;
}

.line-map-sidebar__ghost-frequency-grid {
  display: grid;
  gap: 7px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.line-map-sidebar__ghost-frequency-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 9px;
  display: grid;
  gap: 3px;
  padding: 8px;
}

.line-map-sidebar__ghost-frequency-card > span {
  color: var(--muted);
  font-size: 0.63rem;
  font-weight: 850;
}

.line-map-sidebar__ghost-frequency-card > strong {
  color: var(--ink);
  font-size: 0.84rem;
}

.line-map-sidebar__ghost-frequency-card > small {
  color: var(--muted);
  font-size: 0.58rem;
  font-weight: 700;
  line-height: 1.25;
}

.line-map-sidebar__ghost-directions > div {
  display: grid;
  gap: 5px;
}

.line-map-sidebar__ghost-directions > div span {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 7px;
  color: var(--ink);
  font-size: 0.72rem;
  font-weight: 850;
  padding: 6px 8px;
}

.line-map-sidebar__ghost-muted {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 750;
}

.line-map-sidebar__actions {
  background: #ffffff;
  border-top: 1px solid var(--border);
  display: grid;
  gap: 10px;
  padding: 16px 20px 20px;
}

.line-map-sidebar__actions button {
  width: 100%;
}

.line-map-sidebar__favorite {
  box-shadow: 0 10px 24px rgba(0, 100, 255, 0.18);
}

.line-map-sidebar__maps svg:last-child {
  height: 15px;
  margin-left: auto;
  width: 15px;
}

.line-map-sidebar__error {
  color: #b91c1c;
  font-size: 0.78rem;
  font-weight: 800;
  margin: 0;
}

@media (max-width: 1024px) {
  .line-map-sidebar {
    inset: 0 0 0 auto;
    position: absolute;
  }
}

@media (max-width: 720px) {
  .line-map-sidebar {
    inset: 0;
    width: 100%;
  }
}
</style>
