<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ExternalLink, MapIcon, Star, X } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import StationTransferDetails from "../../components/StationTransferDetails.vue";
import type { NetworkGhostLineView } from "../network-ghost";
import type {
  LineFrequencyProfile,
  TransferLineOption,
} from "../../types/transit";
import type { LineMapStopView } from "./types";

type MobileSheetStage = "peek" | "mid" | "full";

const props = withDefaults(defineProps<{
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
  mobileStage?: MobileSheetStage;
}>(), {
  mobileStage: "mid",
});

const emit = defineEmits<{
  close: [];
  mobileStageChange: [stage: MobileSheetStage];
  addFavorite: [];
  openGoogleMaps: [];
}>();

const mobileDrag = reactive({
  active: false,
  currentY: 0,
  pointerId: -1,
  startY: 0,
});
const suppressHandleClick = ref(false);

const sidebarStyle = computed(() => ({
  "--line-map-sidebar-drag-offset": mobileDrag.active
    ? `${Math.max(-90, Math.min(220, mobileDrag.currentY - mobileDrag.startY))}px`
    : "0px",
}));

function toggleMobileSheetFromHandle(): void {
  if (suppressHandleClick.value) {
    suppressHandleClick.value = false;
    return;
  }

  emit("mobileStageChange", props.mobileStage === "full" ? "mid" : "full");
}

function startMobileSheetDrag(event: PointerEvent): void {
  if (event.button !== 0 && event.pointerType === "mouse") {
    return;
  }

  mobileDrag.active = true;
  mobileDrag.pointerId = event.pointerId;
  mobileDrag.startY = event.clientY;
  mobileDrag.currentY = event.clientY;

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
}

function moveMobileSheetDrag(event: PointerEvent): void {
  if (!mobileDrag.active || event.pointerId !== mobileDrag.pointerId) {
    return;
  }

  mobileDrag.currentY = event.clientY;
}

function finishMobileSheetDrag(event: PointerEvent): void {
  if (!mobileDrag.active || event.pointerId !== mobileDrag.pointerId) {
    return;
  }

  mobileDrag.currentY = event.clientY;
  const deltaY = mobileDrag.currentY - mobileDrag.startY;

  mobileDrag.active = false;
  mobileDrag.pointerId = -1;

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  if (Math.abs(deltaY) < 60) {
    return;
  }

  suppressHandleClick.value = true;
  window.setTimeout(() => {
    suppressHandleClick.value = false;
  }, 120);

  if (deltaY < 0) {
    emit("mobileStageChange", props.mobileStage === "peek" ? "mid" : "full");
    return;
  }

  if (props.mobileStage === "full") {
    emit("mobileStageChange", "mid");
  } else if (props.mobileStage === "mid") {
    emit("mobileStageChange", "peek");
  } else {
    emit("close");
  }
}

function cancelMobileSheetDrag(event: PointerEvent): void {
  if (!mobileDrag.active || event.pointerId !== mobileDrag.pointerId) {
    return;
  }

  mobileDrag.active = false;
  mobileDrag.pointerId = -1;
}

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
    :class="[
      `line-map-sidebar--mobile-${mobileStage}`,
      { 'line-map-sidebar--mobile-dragging': mobileDrag.active },
    ]"
    :style="sidebarStyle"
    aria-label="Détails de la station"
    data-testid="line-map-sidebar"
  >
    <button
      class="line-map-sidebar__drag-handle"
      type="button"
      aria-label="Agrandir ou réduire le panneau de station"
      data-testid="line-map-sidebar-drag-handle"
      @click="toggleMobileSheetFromHandle"
      @pointerdown.prevent="startMobileSheetDrag"
      @pointermove.prevent="moveMobileSheetDrag"
      @pointerup.prevent="finishMobileSheetDrag"
      @pointercancel.prevent="cancelMobileSheetDrag"
    >
      <span aria-hidden="true"></span>
    </button>

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

.line-map-sidebar__drag-handle {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  cursor: grab;
  display: none;
  justify-content: center;
  padding: 10px 0 6px;
  touch-action: none;
}

.line-map-sidebar__drag-handle:active {
  cursor: grabbing;
}

.line-map-sidebar__drag-handle span {
  background: rgba(100, 116, 139, 0.42);
  border-radius: 999px;
  display: block;
  height: 5px;
  width: 48px;
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
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -24px 70px rgba(15, 23, 42, 0.24);
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    height: 52dvh;
    inset: auto 0 0;
    max-height: calc(100dvh - 10px);
    min-height: 180px;
    overflow: hidden;
    position: fixed;
    transform: translateY(var(--line-map-sidebar-drag-offset, 0px));
    transition:
      height 220ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 180ms ease;
    width: 100%;
    z-index: 9100;
  }

  .line-map-sidebar--mobile-peek {
    height: 28dvh;
  }

  .line-map-sidebar--mobile-mid {
    height: 52dvh;
  }

  .line-map-sidebar--mobile-full {
    height: 92dvh;
  }

  .line-map-sidebar--mobile-dragging {
    transition: none;
  }

  .line-map-sidebar__drag-handle {
    display: flex;
  }

  .line-map-sidebar__topbar {
    min-height: 42px;
    padding: 2px 12px 10px 18px;
  }

  .line-map-sidebar__content {
    overscroll-behavior: contain;
    padding: 14px 18px 18px;
  }

  .line-map-sidebar__actions {
    bottom: 0;
    padding: 14px 18px calc(16px + env(safe-area-inset-bottom));
    position: sticky;
  }
}
</style>
