<script setup lang="ts">
import { ExternalLink, MapIcon, MapPinned, Star, X } from "lucide-vue-next";
import StationTransferDetails from "../../components/StationTransferDetails.vue";
import type { TransferLineOption } from "../../types/transit";
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
}>();

const emit = defineEmits<{
  close: [];
  addFavorite: [];
  openGoogleMaps: [];
}>();
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
  min-height: 0;
  overflow: auto;
  padding: 20px;
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
