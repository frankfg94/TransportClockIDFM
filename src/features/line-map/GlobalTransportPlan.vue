<template>
  <main
    ref="rootElement"
    class="global-transport-plan"
    :data-map-experience="mapExperience.kind"
    :data-transport-renderer="mapExperience.rendererKind"
    :data-map-basemap="mapExperience.basemap"
    :style="{ '--global-map-basemap-background': GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.background }"
    tabindex="0"
    :aria-label="t('globalMap.page.aria')"
    @keydown="onKeydown"
  >
    <GlobalTransportPlanToolbar
      :status-label="statusLabel"
      :renderer-metrics="rendererMetrics"
      :display-zoom="displayZoom"
      :has-network="Boolean(network)"
      :loading="loading"
      :chaos-zoom-running="chaosZoomRunning"
      :chaos-zoom-progress="chaosZoomProgress"
      :chaos-zoom-total="chaosZoomTotal"
      :chaos-zoom-active-profile="chaosZoomActiveProfile"
      :chaos-zoom-report-available="Boolean(chaosZoomReport)"
      :traffic-calendar-open="trafficCalendarOpen"
      :traffic-calendar-event-count="trafficCalendarEventCount"
      :traffic-calendar-next-delay-label="trafficCalendarNextDelayLabel"
      :reduce-motion="appSettings.reduceMotion"
      :traffic-enabled="traffic.enabled.value"
      :traffic-loading="traffic.status.value === 'loading'"
      :traffic-state="traffic.status.value"
      :traffic-status-label="trafficStatusLabel"
      :basemap-layer="basemapLayer"
      :legacy-basemap="mapExperience.kind === 'legacy'"
      :share-feedback="shareFeedback"
      :radar-enabled="globalMapIsochrones.enabled.value"
      :radar-panel-open="globalMapIsochrones.panelOpen.value"
      @open-radar="openGlobalRadar()"
      @run-chaos="void runChaosZoom()"
      @run-chaos-extreme="void runChaosZoomExtreme()"
      @download-chaos-report="downloadChaosZoomReport"
      @reset="resetView"
      @share="void shareViewport()"
      @toggle-traffic-calendar="toggleGlobalTrafficCalendar"
      @toggle-traffic="toggleTraffic"
      @clear="clearSelection"
      @update:basemap-layer="basemapLayer = $event"
    />

    <section
      ref="stageElement"
      class="global-transport-plan__stage"
      :aria-label="t('globalMap.page.stageAria')"
    >
      <GlobalTransportPlanLegacyBasemap
        ref="legacyBasemapRef"
        v-if="mapExperience.kind === 'legacy'"
        :cover-enabled="selectedLineCoverEnabled && !routePreviewActive"
        :interacting="interactionActive"
        :stack-style="basemapStackStyle"
        :line-id="activeLine?.id"
        :broad-cover-camera="selectedLineBroadCoverCamera"
        :cover-anchor-camera="selectedLineCoverAnchorCamera"
        :line-bounds="selectedLineCoverGeometryBounds"
        :layer="basemapLayer"
        :basemap-style="props.basemapStyle"
        :contrast="props.basemapContrast"
        :broad-cover-style="selectedLineBroadCoverStyle"
        :bridges="selectedLineBridgeCoverSnapshots"
        :bridge-camera="selectedLineBridgeCamera"
        :bridge-style="selectedLineBridgeCoverStyle"
        :basemap-camera="basemapRenderCamera"
        :live-interaction-active="liveBasemapInteractionActive"
        :tile-refresh-camera="basemapTileRefreshCamera"
        :debug-ready-delay-ms="selectedLineWheelCoverageDelayMs"
        :live-raster-style="selectedLineLiveRasterStyle"
      />
      <TransportMapNextSurface
        v-else
        :key="`transport-map-antialias-${appSettings.deckAntialiasing ? 'on' : 'off'}`"
        class="global-transport-plan__next-surface"
        :renderer="renderer"
        :camera="camera"
        :style-url="props.nextMapStyle"
        :interleaved="GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.deckInterleaved"
        :antialias="appSettings.deckAntialiasing"
        :performance-trace="performanceTrace"
        @ready="nextRendererReady = true"
      />
      <GlobalTransportPlanSearch
        v-model:open="searchOpen"
        :lines="network?.lines ?? []"
        :stations="network?.stations ?? []"
        :entrances="network?.entrances ?? []"
        :markers="globalMapMarkers.markers.value"
        :catalog-ready="searchCatalogReady"
        :catalog-loading="searchCatalogLoading"
        :search-places="searchGlobalPlaces"
        @request-catalog="void ensureSearchCatalog()"
        @select-station="void selectStationFromSearch($event)"
        @select-line="selectLineFromSearchResult"
        @select-place="selectPlaceFromSearch($event)"
        @select-marker="selectMarkerFromSearch($event)"
      />
      <canvas
        ref="canvasElement"
        class="global-transport-plan__canvas"
        :class="{
          'global-transport-plan__canvas--station-hover': hoveredFeature?.type === 'station',
          'global-transport-plan__canvas--next': mapExperience.kind === 'next',
          'global-transport-plan__canvas--distance-measuring': globalMapDistanceMeasurementMode === 'measuring',
        }"
        role="img"
        :aria-label="t('globalMap.page.canvasAria')"
        @contextmenu.prevent="onContextMenu"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerleave="onCanvasPointerLeave"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @lostpointercapture="onLostPointerCapture"
        @wheel="onWheel"
      />

      <GlobalTransportItineraryOverlay
        :route="globalSelectedTravelRoute"
        :origin="globalItinerary.origin.value"
        :destination="globalItinerary.travelRoutes.destination.value"
        :segments="globalItinerarySegments"
        :camera="camera"
        :get-section-exits="getGlobalSectionExits"
      />

      <GlobalMapDistanceMeasurementOverlay
        v-if="!routePreviewActive"
        :start="globalMapDistanceMeasurement?.start"
        :end="globalMapDistanceMeasurement?.end"
        :distance-label="globalMapDistanceLabel"
        :active="globalMapDistanceMeasurementMode === 'measuring'"
        :camera="camera"
      />

      <GlobalMapMarkersOverlay
        v-if="!routePreviewActive"
        :markers="globalMapMarkers.markers.value"
        :selected-place="selectedSearchPlace"
        :camera="camera"
        :reduce-motion="appSettings.reduceMotion"
        @marker-context-menu="openMarkerContextMenu"
        @place-context-menu="openPlaceContextMenu"
        @wheel="onWheel"
      />

      <TransportMapUserLocationOverlay
        v-if="!routePreviewActive"
        :request-visible="locationRequestVisible"
        :loading="userGeolocation.isLoading.value"
        :marker-visible="userLocationMarkerVisible"
        :stale="userGeolocation.isStale.value"
        :marker-style="userLocationMarkerStyle"
        @request="void userGeolocation.askGeolocation()"
      />

      <TransportMapStationPulseOverlay
        v-if="!routePreviewActive"
        :stations="selectedStationPulseStations"
        :camera="camera"
        :active-line-id="activeLine?.id"
        :active-line-color="activeLine?.color"
        :lines-by-id="network?.linesById"
      />

      <Transition name="global-map-itinerary-slide">
        <div v-if="globalItinerary.open.value" class="global-transport-plan__itinerary-panel">
          <LeftNearbySidebar @close="globalItinerary.close">
            <template #actions>
              <button
                type="button"
                :aria-label="t('globalMap.itinerary.openAddressBook')"
                :title="t('globalMap.itinerary.openAddressBook')"
                @click="openAddressBook()"
              >
                <BookOpen :size="17" aria-hidden="true" />
              </button>
            </template>
            <LeftNearbySidebarBodyTravel
              :origin="globalItinerary.origin.value"
              editable-origin
              :show-line-icons="appSettings.showTravelRouteLineIcons"
              :origin-search="globalItinerary.travelRoutes.searchDestinations"
              :origin-saved-suggestions="savedOriginSuggestions"
              show-origin-save
              :destination="globalItinerary.travelRoutes.destination.value"
              :destination-search="globalItinerary.travelRoutes.searchDestinations"
              autocomplete-places
              :departure-date-time="globalItinerary.travelRoutes.departureDateTime.value"
              :available-modes="availableModes"
              :allowed-modes="globalTravelAllowedModes"
              :mode-label="modeLabel"
              :routes="globalVisibleTravelRoutes"
              :selected-route-id="globalItinerary.travelRoutes.selectedRouteId.value"
              :loading="globalItinerary.travelRoutes.isLoading.value"
              :error="globalItinerary.travelRoutes.error.value"
              :get-section-exits="getGlobalSectionExits"
              :show-route-alarms="false"
              :current-location-available="userGeolocation.isAuthorized.value && Boolean(userGeolocation.coordinates.value)"
              :current-location-label="t('globalMap.itinerary.useMyPosition')"
              @origin="void setGlobalItineraryOrigin($event)"
              @save-origin="saveItineraryOrigin"
              @destination="void globalItinerary.travelRoutes.setDestination($event)"
              @update:departure-date-time="void globalItinerary.travelRoutes.setDepartureDateTime($event)"
              @update:allowed-modes="setGlobalTravelAllowedModes"
              @select-route="selectGlobalTravelRoute"
              @refresh="void globalItinerary.travelRoutes.refresh()"
              @use-current-location="void useCurrentLocationAsItineraryOrigin()"
            />
          </LeftNearbySidebar>
        </div>
      </Transition>

      <ContextMenu
        :open="globalContextMenuOpen"
        :point="globalContextMenuPoint"
        :aria-label="t('globalMap.contextMenu.aria')"
        @update:open="globalContextMenuOpen = $event"
        @close="closeGlobalContextMenu"
      >
        <div class="global-transport-plan__context-menu">
          <button v-if="contextMarker" type="button" @click="editContextMarker">
            <Pencil :size="16" aria-hidden="true" />
            {{ t("globalMap.contextMenu.editMarker") }}
          </button>
          <button v-else type="button" @click="addContextMarker">
            <MapPinPlus :size="16" aria-hidden="true" />
            {{ t("globalMap.contextMenu.addMarker") }}
          </button>
          <button v-if="contextMarker" class="global-transport-plan__context-danger" type="button" @click="deleteContextMarker">
            <Trash2 :size="16" aria-hidden="true" />
            {{ t("globalMap.contextMenu.deleteMarker") }}
          </button>
          <button v-if="contextMarker" type="button" @click="hideContextMarker">
            <EyeOff :size="16" aria-hidden="true" />
            {{ t("globalMap.contextMenu.hideMarker") }}
          </button>
          <button type="button" @click="openAddressBookFromContext">
            <BookOpen :size="16" aria-hidden="true" />
            {{ t("globalMap.contextMenu.openAddressBook") }}
          </button>
          <button type="button" @click="openContextNeighborhoodPlan">
            <MapIcon :size="16" aria-hidden="true" />
            {{ t("globalMap.contextMenu.neighborhoodPlan") }}
          </button>
          <button type="button" @click="openContextItinerary">
            <Route :size="16" aria-hidden="true" />
            {{ t("globalMap.contextMenu.itineraryHere") }}
          </button>
          <button type="button" @click="startContextDistanceMeasurement">
            <Ruler :size="16" aria-hidden="true" />
            {{ t("globalMap.contextMenu.measureDistance") }}
          </button>
          <button type="button" @click="void copyContextAddress()">
            <Copy :size="16" aria-hidden="true" />
            {{ t("globalMap.contextMenu.copyAddress") }}
          </button>
        </div>
      </ContextMenu>

      <div
        v-if="!routePreviewActive && globalMapDistanceMeasurementMode !== 'idle'"
        class="global-transport-plan__distance-control"
        role="status"
        aria-live="polite"
      >
        <span>
          {{ globalMapDistanceMeasurementMode === 'measuring'
            ? t("globalMap.measurement.clickToFinish")
            : t("globalMap.measurement.distance", { value: globalMapDistanceLabel }) }}
        </span>
        <button type="button" @click="clearGlobalMapDistanceMeasurement">
          {{ t("globalMap.measurement.clear") }}
        </button>
      </div>

      <div v-if="globalMapContextFeedback" class="global-transport-plan__context-feedback" role="status" aria-live="polite">
        {{ globalMapContextFeedback }}
      </div>

      <GlobalMapMarkerModal
        :open="markerModalOpen"
        :initial="markerModalInitial"
        :editing="Boolean(markerModalInitial?.id)"
        @close="closeMarkerModal"
        @save="saveMarker"
        @remove="removeMarker"
      />

      <AdressBook
        :open="addressBookOpen"
        :initial="addressBookInitial"
        @close="closeAddressBook"
        @view-location="viewAddressBookLocation"
        @view-neighborhood="viewAddressBookNeighborhood"
      />

      <AppModal
        :open="bikeInstallModalOpen"
        panel-class="global-transport-plan__bike-install-modal"
        :eyebrow="t('globalMap.page.bikeNetworkInstallEyebrow')"
        :title="t('globalMap.page.bikeNetworkInstallTitle')"
        @close="bikeInstallModalOpen = false"
      >
        <p>{{ t("globalMap.page.bikeNetworkInstallBody") }}</p>
        <code class="global-transport-plan__bike-install-command">{{ t("globalMap.page.bikeNetworkInstallCommand") }}</code>
        <template #footer>
          <button type="button" class="global-transport-plan__bike-install-close" @click="bikeInstallModalOpen = false">
            {{ t("globalMap.page.bikeNetworkInstallClose") }}
          </button>
        </template>
      </AppModal>

      <GlobalTransportIsochronePanel
        :open="globalMapIsochrones.panelOpen.value"
        :modal-open="globalMapIsochrones.modalOpen.value"
        :enabled="globalMapIsochrones.enabled.value"
        :settings="globalMapIsochrones.settings.value"
        :modes="customizationModes"
        :eligible-modes="globalMapIsochrones.eligibleModes.value"
        :focus-mode="globalRadarFocusMode"
        :status="globalMapIsochrones.status.value"
        :coverage="globalMapIsochrones.coverage.value"
        :suspended="routePreviewActive"
        :scope-label="globalRadarScopeLabel"
        :attribution="globalMapIsochrones.attribution.value"
        :build-command="globalRadarBuildCommand"
        :mode-label="modeLabel"
        @update:open="globalMapIsochrones.panelOpen.value = $event"
        @update:enabled="globalMapIsochrones.enabled.value = $event"
        @update:mode="setGlobalRadarMode"
        @open-modal="globalMapIsochrones.modalOpen.value = true"
        @close-modal="globalMapIsochrones.closeModal"
        @retry="void globalMapIsochrones.retry()"
      />

      <div v-if="errorMessage" class="map-notice map-notice--error" role="alert">
        {{ errorMessage }}
        <button type="button" class="map-link" @click="retry">
          {{ t("globalMap.page.retry") }}
        </button>
      </div>
      <div v-else-if="loading" class="map-notice" role="status" aria-live="polite">
        {{ t("globalMap.page.loading") }}
      </div>

      <div class="global-transport-plan__left-controls">
        <Transition :name="leftControlsTransitionName" mode="out-in">
          <div
            v-if="leftControlsView === 'presets'"
            key="presets"
            class="global-transport-plan__left-controls-view"
          >
            <GlobalTransportPlanModeFilter
              embedded
              :primary-modes="primaryModes"
              :available-modes="availableModes"
              :active-preset="activePreset"
              :custom-summary="customSummary"
              :mode-label="modeLabel"
              :mode-color="modeColor"
              :radar-enabled-modes="globalRadarEnabledModes"
              @open-radar="openGlobalRadar"
              @select-preset="selectPreset"
              @request-preset-install="requestPresetInstall"
              @open-customization="openCustomization"
              @open-line-panel="openLinePanel"
            />
          </div>

          <div
            v-else-if="leftControlsView === 'customization'"
            key="customization"
            class="global-transport-plan__left-controls-view"
          >
            <GlobalTransportPlanModeCustomization
              :modes="customizationModes"
              :selected-modes="filters.selectedModes.value"
              :mode-label="modeLabel"
              :mode-color="modeColor"
              @update:selected-modes="setGlobalSelectedModes"
              @back="returnToModeList"
              @finish="finishCustomization"
            />
          </div>

          <div v-else key="line-list" class="global-transport-plan__left-controls-view">
            <GlobalTransportPlanLinePanel
              data-global-map-line-panel-host
              embedded
              :mode="linePanelMode!"
              :lines="linePanelLines"
              :selected-line-id="activeLine?.id"
              @close="returnToModeList"
              @select-line="selectLineFromPanel"
            />
          </div>
        </Transition>
      </div>

      <Transition name="global-map-picker-sidebar-slide" appear>
        <GlobalMapPickerSideBar
          v-if="!routePreviewActive && (activeStationView || activeLine || selectedStations.length)"
          :station="activeStationView"
          :line="activeLineView"
          :direction-options="busDirectionSelection?.options ?? []"
          :direction-variants="directionMergeEnabled ? [] : (busDirectionSelection?.variants ?? [])"
          :direction-loading="busDirectionLoading"
          :selected-direction-id="busDirectionSelection?.selectedDirectionId"
          :selected-main-direction-id="selectedDirectionButtonId"
          :merge-directions="directionMergeEnabled"
          :lines="activeStationLines"
          :all-lines="network?.lines ?? []"
          :stations="network?.stations ?? []"
          :city-pattern-stations="sidebarCityPatternStations"
          :paths="lineMetadataPaths"
          :preview-line="sidebarPreviewLine"
          :preview-paths="sidebarPreviewPaths"
          :entrances="activeStationEntrances"
          :focused-entrance-id="focusedEntranceId"
          :selected-station-count="selectedStations.length"
          :dashboard-places="dashboardPlaces"
          :dashboard-place-id="dashboardPlaceId"
          :dashboard-busy="dashboardBusy"
          :dashboard-message="dashboardMessage"
          :last-dashboard-undo="dashboardHasUndo"
          :hovered-line-id="hoveredFeature?.type === 'line' ? hoveredFeature.id : undefined"
          :traffic-disruption="activeTrafficDisruption"
          :traffic-calendar="globalTrafficCalendar"
          @close="clearSelection"
          @select-line="selectLineById"
          @change-line="openLineSelector"
          @view-line-schema="viewActiveLineSchema"
          @change-direction="changeBusDirection"
          @change-direction-variant="changeBusDirection"
          @toggle-merge-directions="toggleMergedDirections"
          @focus-entrance="focusEntrance"
          @add-active-station="void addActiveStationToDashboard()"
          @add-selection="void addSelectionToDashboard()"
          @undo-dashboard="undoDashboardAdd"
          @update:dashboard-place-id="dashboardPlaceId = $event"
          @hover-line="setHoveredLine"
          @traffic-calendar-close-expanded="closeExpandedTrafficCalendar"
          @traffic-calendar-previous="selectPreviousTrafficCalendarMonth"
          @traffic-calendar-next="selectNextTrafficCalendarMonth"
          @traffic-calendar-reset-today="resetGlobalTrafficCalendarToday"
          @traffic-calendar-select="selectGlobalTrafficCalendarDay"
          @traffic-calendar-expand="expandTrafficCalendar"
          @traffic-calendar-focus-disruption="focusGlobalTrafficDisruption"
        />
      </Transition>

      <StationBoardModal
        v-if="lineSelectorOpen && activeLineSearchOption && activeLineFamily"
        :open="lineSelectorOpen"
        line-only
        :initial-line="activeLineSearchOption"
        :initial-family="activeLineFamily"
        @select-line="void selectLineFromModal($event)"
        @close="lineSelectorOpen = false"
      />

      <!-- The former inline V2 panel is intentionally removed from the render tree.
           GlobalMapPickerSideBar owns the IDFM presentation now. -->

      <TransportMapTooltip
        v-if="!routePreviewActive && hoveredFeature && hoveredFeature.type !== 'isochrone'"
        :station-label="hoveredFeature.type === 'station' ? hoveredFeatureLabel : undefined"
        :lines="hoveredTooltipLines"
        :active-line-id="hoveredFeature.type === 'line' ? hoveredFeature.id : undefined"
        :style="tooltipStyle"
        @hover-line="setHoveredTooltipLine"
        @leave-line="restoreHoveredTooltipLine"
        @leave-tooltip="handleTooltipLeave"
        @select-line="selectTooltipLine"
      />

      <div
        v-else-if="!routePreviewActive && hoveredFeature?.type === 'isochrone'"
        class="global-transport-plan__tooltip global-transport-plan__tooltip--isochrone"
        role="status"
        :aria-label="hoveredIsochroneAriaLabel"
        :style="tooltipStyle"
      >
        <span
          v-for="surface in hoveredFeature.surfaces"
          :key="surface.id"
          class="global-transport-plan__tooltip-isochrone-row"
        >
          <strong>{{ modeLabel(surface.mode) }}</strong>
          <span>{{ t("globalMap.page.tooltip.walkingMax", { minutes: surface.minutes }) }}</span>
        </span>
      </div>

      <footer class="global-transport-plan__legend">
        <span><i class="legend-dot legend-dot--hub" /> {{ t("globalMap.page.hub") }}</span>
        <span
          ><i class="legend-dot legend-dot--entrance" /> {{ t("globalMap.page.entrance") }}</span
        >
        <span v-if="visibleSelectedBusDirectionQuays.length"
          ><i class="legend-dot legend-dot--quay" /> {{ t("globalMap.page.quay") }}</span
        >
        <span v-if="viewport.chunkIds.length"
          >{{ t("globalMap.page.zones", { count: viewport.chunkIds.length }) }} -
          {{ formatBytes(viewport.bytes) }}</span
        >
        <span>{{ t("globalMap.page.zoom", { value: displayZoom.toFixed(1) }) }}</span>
        <span v-if="basemapLayer === 'satellite'">{{
          t("globalMap.page.satelliteAttribution")
        }}</span>
      </footer>

      <GlobalTransportDebugPanel
        v-if="debugPerformanceEnabled"
        :running="debugProbeRunning"
        :report="debugReport"
        :report-json="debugReportJson"
        :loading-stage="loadingStage"
        @start="startDebugPerformance"
        @stop="stopDebugPerformance"
        @export="exportDebugReport"
      />

      <div
        v-if="selectedLineWheelScenarioEnabled"
        hidden
        :data-selected-line-zoom-status="selectedLineZoomStatus"
        :data-selected-line-zoom-phase="selectedLineZoomPhase"
        :data-selected-line-zoom-ghost-lines="ghostLineIds.length"
        :data-selected-line-zoom-renderable-ghost-lines="renderableGhostLineIds.length"
        :data-selected-line-zoom-rendered-ghost-lines="renderedGhostLineCount"
        :data-selected-line-zoom-missing-ghost-lines="missingRenderedGhostLineIds.join(',')"
        :data-selected-line-zoom-unavailable-ghost-geometries="unavailableGhostGeometryLineIds.join(',')"
      />
      <pre
        v-if="selectedLineWheelScenarioEnabled"
        hidden
        data-selected-line-zoom-report
      >{{ selectedLineZoomReportJson }}</pre>
      <pre
        v-if="chaosZoomRunning || chaosZoomReport"
        hidden
        data-global-map-chaos-zoom-report
      >{{ chaosZoomReportJson }}</pre>

      <details v-if="debugLineQuery" class="global-map-line-debug" data-global-map-line-debug open>
        <summary>
          {{ t("globalMap.page.lineDebug.title", { line: debugLine?.label ?? debugLineQuery }) }}
        </summary>
        <p v-if="!debugLine" class="global-map-line-debug__notice">
          {{ t("globalMap.page.lineDebug.notFound", { line: debugLineQuery }) }}
        </p>
        <template v-else>
          <p class="global-map-line-debug__notice">
            {{
              t("globalMap.page.lineDebug.summary", {
                count: debugLineAngles.length,
                inconsistent: inconsistentDebugStationCount,
              })
            }}
          </p>
          <table class="global-map-line-debug__table">
            <thead>
              <tr>
                <th scope="col">{{ t("globalMap.page.lineDebug.station") }}</th>
                <th scope="col">{{ t("globalMap.page.lineDebug.angle") }}</th>
                <th scope="col">{{ t("globalMap.page.lineDebug.legs") }}</th>
                <th scope="col">{{ t("globalMap.page.lineDebug.status") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="station in debugLineAngles"
                :key="station.stationId"
                :class="{ 'global-map-line-debug__row--inconsistent': station.inconsistent }"
              >
                <td>{{ station.stationName }}</td>
                <td>{{ formatDebugAngle(station.angleDegrees) }}</td>
                <td>{{ formatDebugLegs(station.incomingMeters, station.outgoingMeters) }}</td>
                <td>
                  {{
                    station.inconsistent
                      ? t("globalMap.page.lineDebug.inconsistent")
                      : t("globalMap.page.lineDebug.ok")
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </details>
    </section>
  </main>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  triggerRef,
  watch,
} from "vue";
import {
  BookOpen,
  Copy,
  EyeOff,
  Map as MapIcon,
  MapPinPlus,
  Pencil,
  Ruler,
  Route,
  Trash2,
} from "lucide-vue-next";
import { useRoute, useRouter } from "nuxt/app";
import type { LineRouteSequence, LineSearchOption, TransitFamily } from "../../types/transit";
import GlobalTransportPlanModeCustomization from "./GlobalTransportPlanModeCustomization.vue";
import GlobalTransportPlanModeFilter from "./GlobalTransportPlanModeFilter.vue";
import GlobalTransportPlanToolbar from "./GlobalTransportPlanToolbar.vue";
import GlobalTransportIsochronePanel from "./GlobalTransportIsochronePanel.vue";
import { useGlobalMapIsochrones } from "./useGlobalMapIsochrones";
import type { GlobalIsochroneSettings } from "../transport-map/isochrones/contracts";
import { useGlobalTransportHover } from "./useGlobalTransportHover";
import { hitTestGlobalIsochrones } from "../transport-map/isochrones/hitTest";
import type {
  GlobalMapEntrance,
  GlobalMapLine,
  GlobalMapMode,
  GlobalMapPath,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";
import { GLOBAL_MAP_MODE_ORDER } from "../transport-map/contracts/manifest";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import { buildStationCorrespondenceContext } from "../transport-map/spatial/stationCorrespondences";
import type { TransportMapViewportResult } from "../transport-map/contracts/network";
import { TransportMapDataSource } from "../transport-map/data/createTransportMapDataSource";
import {
  selectPreferredLinePaths,
} from "../transport-map/data/pathPrecedence";
import {
  clampCameraToBounds,
  createCamera,
  fitCameraToBounds,
  resizeCamera,
  updateCamera,
  type CameraState,
} from "../transport-map/geo/camera";
import {
  lonLatToWorld,
  screenToLonLat,
  screenToWorld,
  visibleWorldBounds,
  worldToScreen,
} from "../transport-map/geo/coordinateKernel";
import type { LonLatPoint } from "../transport-map/geo/coordinateKernel";
import {
  encodeSharedViewport,
  SHARED_VIEWPORT_QUERY_KEY,
} from "../transport-map/geo/sharedViewport";
import * as transportMapRendererFactory from "../transport-map/render/createRenderer";
import type { TransportMapExperienceKind } from "../transport-map/contracts/experience";
import type { NextMapStyle } from "../transport-map/next/nextMapConfig";
import GlobalTransportPlanLegacyBasemap from "./GlobalTransportPlanLegacyBasemap.vue";
import type {
  TransportMapBasemapLayer,
  TransportMapBasemapStyle,
} from "../transport-map/basemap/tileMath";
import type { SelectedLineBasemapCoverDebugMetrics } from "../transport-map/basemap/selectedLineBasemapCover";
import GlobalTransportPlanSearch from "../transport-map/search/GlobalTransportPlanSearch.vue";
import {
  modeRank,
  type GlobalMapStationSearchGroup,
} from "../transport-map/search/globalMapSearch";
import GlobalMapPickerSideBar from "./GlobalMapPickerSideBar.vue";
import GlobalTransportDebugPanel from "./GlobalTransportDebugPanel.vue";
import GlobalTransportPlanLinePanel from "./GlobalTransportPlanLinePanel.vue";
import TransportMapStationPulseOverlay from "./TransportMapStationPulseOverlay.vue";
import TransportMapUserLocationOverlay from "./TransportMapUserLocationOverlay.vue";
import TransportMapTooltip from "../transport-map/overlays/TransportMapTooltip.vue";
import { useAppSettings } from "../app-settings/appSettings";
import {
  queryTransportMapCandidates,
  type TransportMapHitCandidates,
} from "../transport-map/spatial/hitTest";
import { useTransportMapFilters } from "../transport-map/state/useTransportMapFilters";
import { useTransportMapSelection } from "../transport-map/state/useTransportMapSelection";
import { useGlobalTransportTraffic } from "./useGlobalTransportTraffic";
import { useUserGeolocation } from "../../composables/useUserGeolocation";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type {
  TransportMapRenderScene,
  TransportMapRenderer,
  TransportMapRendererMetrics,
  TransportMapTrafficPathSpan,
} from "../transport-map/contracts/renderer";
import type { TrafficDisruption } from "../traffic/types";
import type { TrafficLineReport } from "../traffic/types";
import { useGlobalTransportDashboard } from "./useGlobalTransportDashboard";
import { useGlobalTransportLegacyBasemap } from "./useGlobalTransportLegacyBasemap";
import { useGlobalTransportPerformance } from "./useGlobalTransportPerformance";
import {
  deriveGlobalTransportPlanPreset,
  GLOBAL_TRANSPORT_PLAN_PANEL_MODES,
  type GlobalTransportPlanPreset,
} from "./globalTransportPlanModes";
import {
  useGlobalTransportPerformanceScenarioConfig,
  useGlobalTransportPerformanceScenarios,
} from "./useGlobalTransportPerformanceScenarios";
import { measureLineStationAngles, resolveDebugLine } from "../transport-map/debug/stationAngles";
import { useI18n } from "../../i18n";
import {
  getGlobalBusDirectionOrderedStopIds,
} from "./globalBusDirections";
import {
  defaultGlobalDirectionMerge,
  type BusMapDirectionSelection,
} from "./lineMapData";
import {
  supportsGlobalLineDirections,
  useGlobalLineDirections,
} from "./useGlobalLineDirections";
import { useGlobalTransportRouteState } from "./useGlobalTransportRouteState";
import {
  useGlobalTransportScene,
  type GlobalTransportSceneTrafficState,
} from "./useGlobalTransportScene";
import { useGlobalTransportViewport } from "./useGlobalTransportViewport";
import { createTransportMapPerformanceTrace } from "../transport-map/performance/transportMapPerformanceTrace";
import type {
  TransportMapTraceEventType,
  TransportMapTraceMetadata,
} from "../transport-map/performance/transportMapPerformanceTrace";
import { useGlobalTransportMapInteraction } from "./useGlobalTransportMapInteraction";
import ContextMenu from "../../components/ContextMenu.vue";
import AppModal from "../../components/AppModal.vue";
import LeftNearbySidebar from "../nearby-stations/LeftNearbySidebar.vue";
import LeftNearbySidebarBodyTravel from "../nearby-stations/LeftNearbySidebarBodyTravel.vue";
import AdressBook, { type AddressBookInitialEntry } from "../address-book/AdressBook.vue";
import {
  toAddressBookPoint,
  useAddressBook,
  type AddressBookEntry,
} from "../address-book/addressBook";
import type { NearbyJourneyPoint, NearbyJourneySection, RouteExit } from "../nearby-stations/nearbyHeavyTransports";
import {
  createRouteExitsForStation,
  MAX_RELIABLE_BOUNDARY_DISTANCE_METERS,
  resolveTravelBoundaryStation,
  selectFastestRouteExit,
} from "../nearby-stations/travelBoundary";
import { queryStationsWithinRadius } from "../transport-map/spatial/radiusQuery";
import GlobalMapMarkerModal from "./GlobalMapMarkerModal.vue";
import GlobalMapMarkersOverlay from "./GlobalMapMarkersOverlay.vue";
import GlobalTransportItineraryOverlay from "./GlobalTransportItineraryOverlay.vue";
import GlobalMapDistanceMeasurementOverlay from "./GlobalMapDistanceMeasurementOverlay.vue";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import { createIgnTransportMapGeocoder } from "../../services/geocoding/ign";
import { useGlobalTransportItinerary } from "./useGlobalTransportItinerary";
import type { TravelRoute } from "../nearby-stations/useTravelRoutes";
import { useGlobalMapMarkers, type GlobalMapMarker } from "./globalMapMarkers";
import { createGlobalMapDistanceMeasurement } from "./globalMapDistanceMeasurement";
import {
  createGlobalTransportItinerarySegments,
  clipGlobalTransportItineraryLine,
  resolveGlobalTransportItineraryLine,
  getGlobalTransportItineraryBounds,
  type GlobalTransportItinerarySegment,
} from "./globalTransportItineraryGeometry";
import type {
  TransportMapBasemapDebugMetrics,
} from "./selectedLineZoomScenario";
import { resolveTransitLonLat } from "../network-ghost/geoProjection";
import {
  createTransportLineSearchOption,
  globalMapLineFamily,
} from "../transport-map/overlays/ghostLineDirections";
import { useDeparturePatternTraffic } from "../service-pattern/useDeparturePatternTraffic";
import { usePatternTrafficCalendar } from "../service-pattern/usePatternTrafficCalendar";
import type {
  PatternTrafficEdge,
  PatternTrafficStation,
} from "../service-pattern/trafficImpactAnalysis";
import type { PatternTrafficCalendarDay } from "../service-pattern/trafficCalendar";
import type { PatternTrafficSummaryEntry } from "../service-pattern/trafficCalendarSummary";
import { createGlobalMapTrafficGraph } from "./globalMapTrafficGraph";
import type { GlobalMapSidebarTrafficCalendarState } from "./globalMapSidebarBodyTypes";

const StationBoardModal = defineAsyncComponent(
  () => import("../../components/StationBoardModal.vue"),
);
const TransportMapNextSurface = defineAsyncComponent(
  () => import("../transport-map/next/TransportMapNextSurface.vue"),
);

const props = withDefaults(
  defineProps<{
    basemapContrast?: number;
    basemapStyle?: TransportMapBasemapStyle;
    experience?: TransportMapExperienceKind;
    nextMapStyle?: NextMapStyle;
  }>(),
  {
    basemapContrast: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.contrast.default,
    basemapStyle: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.style.default,
    experience: "legacy" as TransportMapExperienceKind,
  },
);

// Keep the legacy facade compatible with existing renderer test doubles that
// predate the experience factory. Production always takes the centralized
// factory branch; the fallback only adapts an older mock to the same shape.
let experienceFactory: typeof transportMapRendererFactory.createTransportMapExperience | undefined;
try {
  // Vitest's historical renderer mocks expose only createTransportMapRenderer;
  // Reflect.get lets those doubles remain valid without weakening production's
  // centralized factory decision.
  experienceFactory = Reflect.get(
    transportMapRendererFactory,
    "createTransportMapExperience",
  ) as typeof experienceFactory;
} catch {
  experienceFactory = undefined;
}
const mapExperience = typeof experienceFactory === "function"
  ? experienceFactory(props.experience)
  : {
      kind: "legacy" as const,
      basemap: "legacy-raster" as const,
      rendererKind: "canvas2d-main-thread" as const,
      createRenderer: () => transportMapRendererFactory.createTransportMapRenderer(),
    };
// The causal recorder is only allocated for the Deck/MapLibre experience
// that owns the extreme benchmark. Legacy Canvas2D stays completely
// uninstrumented in normal operation.
const performanceTrace = mapExperience.kind === "next"
  ? createTransportMapPerformanceTrace()
  : undefined;
const renderer = mapExperience.createRenderer();
renderer.setPerformanceTrace?.(performanceTrace);
const nextRendererReady = ref(mapExperience.kind === "legacy");

const BUS_ONLY_GLOBAL_MAP_MODES = new Set<GlobalMapMode>(["BUS", "NOCTILIEN"]);
const HEAVY_QUAY_MODES = new Set<GlobalMapMode>([
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
]);
const EMPTY_TRAFFIC_IDS: string[] = [];
const EMPTY_TRAFFIC_PATH_SPANS: TransportMapTrafficPathSpan[] = [];

function isBusOnlyOverviewStation(station: GlobalMapStation): boolean {
  const lines = station.lineIds
    .map((lineId) => network.value?.linesById.get(lineId))
    .filter((line): line is GlobalMapLine => Boolean(line));

  // Keep unknown/incomplete line metadata visible. Hiding a station is only
  // safe when every known serving line is explicitly a bus family.
  return (
    lines.length === station.lineIds.length &&
    lines.length > 0 &&
    lines.every((line) => BUS_ONLY_GLOBAL_MAP_MODES.has(line.mode))
  );
}

const rootElement = ref<HTMLElement>();
const stageElement = ref<HTMLElement>();
const canvasElement = ref<HTMLCanvasElement>();
const legacyBasemapRef = ref<{
  getStackElement: () => HTMLElement | undefined;
  getBasemapDebugMetrics: () => TransportMapBasemapDebugMetrics | undefined;
  resetBasemapDebugMetrics: () => void;
  getSelectedLineCoverDebugMetrics: () => SelectedLineBasemapCoverDebugMetrics | undefined;
  resetSelectedLineCoverDebugMetrics: () => void;
  isSelectedLineCoverReady: () => boolean;
}>();
const camera = shallowRef<CameraState>(createCamera());
const selectedLineInteractionScene = shallowRef<TransportMapRenderScene>();
const basemapLayer = ref<TransportMapBasemapLayer>("plan");
// Camera changes are intentionally kept out of the Vue render tree while a
// gesture is active. The canvas needs every camera sample; the legend does
// not, and patching it for every pointer event can consume a frame on WebView.
const displayZoom = ref(camera.value.zoom);
const viewport = shallowRef<TransportMapViewportResult>({
  generation: 0,
  chunkIds: [],
  paths: [],
  stations: [],
  bytes: 0,
  fromCache: true,
});
// A focused line can be decoded before the camera reaches its final bounds.
// Keep this separate from the published viewport so an off-screen warm-up
// never replaces the scene that is currently visible.
const preloadedLinePaths = shallowRef<GlobalMapPath[]>([]);
const network = shallowRef<ReturnType<TransportMapDataSource["getNetwork"]>>();
const availableModes = ref<GlobalMapMode[]>([]);
const loading = ref(true);
type GlobalTransportLoadingStage =
  | "viewport"
  | "applying-data"
  | "building-scene"
  | "binary"
  | "presenting"
  | "ready";
const loadingStage = ref<GlobalTransportLoadingStage>("ready");
const errorMessage = ref("");
const shareFeedback = ref("");
const searchCatalogReady = ref(false);
const searchCatalogLoading = ref(false);
const sidebarPreviewLineId = ref<string>();
const focusedEntranceId = ref<string>();
const rendererMetrics = ref<TransportMapRendererMetrics>();
const interactionActive = ref(false);
const wheelScrolling = ref(false);

function queryGlobalMapHitCandidates(point: { x: number; y: number }): TransportMapHitCandidates {
  const candidates = network.value
    ? queryTransportMapCandidates(
        point,
        camera.value,
        renderStations.value,
        network.value.lines,
        renderPaths.value,
        hitTestStationIndex.value,
        renderedPathIndex.value,
        { modeMask: filters.visibleModeMask.value },
      )
    : { lines: [] };
  if (candidates.station || candidates.lines.length || routePreviewActive.value) return candidates;

  const surfaces = hitTestGlobalIsochrones(
    point,
    camera.value,
    globalMapIsochrones.surfaces.value,
  );
  return surfaces.length
    ? {
        ...candidates,
        isochrone: {
          type: "isochrone",
          id: surfaces[0]!.id,
          distanceCssPx: 0,
          surfaces,
        },
      }
    : candidates;
}

const globalTransportHover = useGlobalTransportHover({
  getNetwork: () => network.value,
  getCamera: () => camera.value,
  hitTest: (point) => {
    if (routePreviewActive.value) return { lines: [] };
    const startedAt = performanceTrace?.isRunning ? transportMapNowMs() : Number.NaN;
    try {
      return queryGlobalMapHitCandidates(point);
    } finally {
      if (performanceTrace?.isRunning && Number.isFinite(startedAt)) {
        performanceTrace.recordDuration(
          "hit_test_candidates_compute",
          transportMapNowMs() - startedAt,
        );
      }
    }
  },
  isWheelScrolling: () => wheelScrolling.value,
  hasActivePointers: () => interactionController?.hasActivePointers() ?? false,
  draw,
  setSidebarPreviewLineId: (lineId) => {
    sidebarPreviewLineId.value = lineId;
  },
  selectFeature,
  selectLine: (line, disruption) => selectLineFromSearch(line, disruption),
  resolveCandidateTrafficDisruption: (candidate) =>
    resolveCandidateTrafficDisruption(candidate),
  getFocusableStations: () => routePreviewActive.value ? [] : renderStations.value,
  getActiveStationId: () => selection.activeStationId.value,
  selectStation: (stationId) => selection.selectStation(stationId),
  focusTooltipChoice: () => {
    stageElement.value
      ?.querySelector<HTMLButtonElement>(".global-transport-plan__tooltip-choice")
      ?.focus();
  },
  isStationHitVisible: (stationId) => !routePreviewActive.value && hitTestStationIds.value.has(stationId),
});
const {
  hoveredFeature,
  hoveredFeatureLabel,
  hoveredTooltipLines,
  tooltipStyle,
} = globalTransportHover;
const hoveredIsochroneAriaLabel = computed(() => {
  const feature = hoveredFeature.value;
  if (!feature || feature.type !== "isochrone") return undefined;
  return feature.surfaces
    .map((surface) => `${modeLabel(surface.mode)} · ${t("globalMap.page.tooltip.walkingMax", { minutes: surface.minutes })}`)
    .join(", ");
});
const onCanvasPointerLeave = globalTransportHover.leave;
const setHoveredLine = globalTransportHover.setHoveredLine;
const setHoveredTooltipLine = globalTransportHover.setHoveredTooltipLine;
const restoreHoveredTooltipLine = globalTransportHover.restoreHoveredTooltipLine;
const handleTooltipLeave = globalTransportHover.handleTooltipLeave;
const selectTooltipLine = globalTransportHover.selectTooltipLine;
let deferredNextViewport: TransportMapViewportResult | undefined;
let globalTransportPerformanceScenarios: ReturnType<
  typeof useGlobalTransportPerformanceScenarios
> | undefined;
let sceneTrafficStateReader: () => GlobalTransportSceneTrafficState = () => ({
  interruptionLineIds: EMPTY_TRAFFIC_IDS,
  disturbanceLineIds: EMPTY_TRAFFIC_IDS,
  interruptedStationIds: EMPTY_TRAFFIC_IDS,
  disturbedStationIds: EMPTY_TRAFFIC_IDS,
  trafficPathSpans: EMPTY_TRAFFIC_PATH_SPANS,
});
let viewportTimingReader: (kind: "decode" | "worker", durationMs: number) => void = () => undefined;
const filters = useTransportMapFilters(availableModes);
const selection = useTransportMapSelection(GLOBAL_TRANSPORT_PLAN_CONFIG.dashboard.maxStations);
const activeTrafficDisruption = ref<TrafficDisruption>();
const selectedTrafficDisruptionIds = ref<string[]>([]);
const selectedTrafficTimestamp = ref<number>();
const { settings: appSettings } = useAppSettings();
const userLocationVisible = computed(() => appSettings.value.showUserLocation);
const userGeolocation = useUserGeolocation({ enabled: userLocationVisible });
const searchOpen = ref(false);
const globalMapMarkers = useGlobalMapMarkers();
const addressBook = useAddressBook();
const addressBookOpen = ref(false);
const addressBookInitial = ref<AddressBookInitialEntry>();
const selectedSearchPlace = ref<GeocoderPoint>();
type GlobalMapMarkerDraft = Pick<GlobalMapMarker, "lon" | "lat"> & Partial<Pick<GlobalMapMarker, "id" | "name" | "address" | "icon" | "color">>;
const markerModalOpen = ref(false);
const markerModalInitial = ref<GlobalMapMarkerDraft>();
const bikeInstallModalOpen = ref(false);
const globalContextMenuOpen = ref(false);
const globalContextMenuPoint = ref<{ x: number; y: number }>();
const contextPoint = ref<GeocoderPoint>();
const contextMarker = ref<GlobalMapMarker>();
const contextPlace = ref<GeocoderPoint>();
type GlobalMapDistanceMeasurementMode = "idle" | "measuring" | "complete";
const globalMapDistanceMeasurementMode = ref<GlobalMapDistanceMeasurementMode>("idle");
const globalMapDistanceStart = ref<LonLatPoint>();
const globalMapDistanceEnd = ref<LonLatPoint>();
const globalMapDistanceMeasurement = computed(() => {
  if (!globalMapDistanceStart.value || !globalMapDistanceEnd.value) return undefined;
  return createGlobalMapDistanceMeasurement(
    globalMapDistanceStart.value,
    globalMapDistanceEnd.value,
  );
});
const globalMapDistanceLabel = computed(() => {
  const distanceMeters = globalMapDistanceMeasurement.value?.distanceMeters;
  if (distanceMeters === undefined) return "";
  if (distanceMeters < 1_000) {
    return t("globalMap.measurement.meters", { value: Math.round(distanceMeters) });
  }
  return t("globalMap.measurement.kilometers", {
    value: n(distanceMeters / 1_000, { maximumFractionDigits: 1 }),
  });
});
const globalMapContextFeedback = ref("");
let globalMapContextFeedbackTimer: number | undefined;
let measurementCompletionPointerId: number | undefined;
const globalTravelAllowedModes = ref<GlobalMapMode[]>([]);
const activeStationGroup = ref<GlobalMapStationSearchGroup>();
const linePanelMode = ref<GlobalMapMode>();
const leftControlsTransitionName = ref("global-map-controls-slide-forward");
type GlobalTransportPlanPanelView = "presets" | "customization" | "lines";
const leftControlsView = ref<GlobalTransportPlanPanelView>("presets");
const lineSelectorOpen = ref(false);
const connectedStationIds = ref<string[]>([]);
const stationConnectionRequestsPending = ref(0);
const { n, t } = useI18n();
const route = useRoute();
const router = useRouter();
const globalNearbyProviders = createNearbyDataProviders();
const globalMapGeocoder = createIgnTransportMapGeocoder();
const globalItinerary = useGlobalTransportItinerary({
  placesProvider: globalNearbyProviders.places,
  travelRoutesProvider: globalNearbyProviders.travelRoutes,
  getDefaultOrigin: () => {
    const primary = addressBook.primaryAddress.value;
    return primary ? toAddressBookPoint(primary) : undefined;
  },
  searchAddresses: true,
});
const dataSource = new TransportMapDataSource({
  maxChunkConcurrency: GLOBAL_TRANSPORT_PLAN_CONFIG.data.maxChunkConcurrency,
  decodedChunkCacheMaxEntries: GLOBAL_TRANSPORT_PLAN_CONFIG.data.decodedChunkCacheMaxEntries,
  decodedChunkCacheMaxBytes: GLOBAL_TRANSPORT_PLAN_CONFIG.data.decodedChunkCacheMaxBytes,
  useRegionalOverview: mapExperience.kind === "next",
  trace: performanceTrace,
});
let interactionController: ReturnType<typeof useGlobalTransportMapInteraction> | undefined;
let resizeObserver: ResizeObserver | undefined;
let ghostLineRefreshPending = false;
let drawFrame: number | undefined;
let resizeFallback: (() => void) | undefined;
let mounted = false;
let sharedViewportSignature: string | undefined;
let searchCatalogPromise: Promise<void> | undefined;
let extremeChaosState: {
  camera: CameraState;
  modes: GlobalMapMode[];
  activeLineId?: string;
  activeStationId?: string;
  selectedStationIds: string[];
  trafficEnabled: boolean;
  directionId?: string;
  directionsMerged: boolean;
} | undefined;
const extremeChaosGuardActive = ref(false);

const debugPerformanceEnabled = computed(() => queryString(route.query.mapDebug) === "1");
const globalTransportPerformanceScenarioConfig =
  useGlobalTransportPerformanceScenarioConfig({
    getQuery: () => route.query as Record<string, unknown>,
    isDebugPerformanceEnabled: () => debugPerformanceEnabled.value,
  });
const {
  selectedLineWheelScenarioEnabled,
  selectedLineWheelCoverageDelayMs,
  selectedLineCoverOverride,
} = globalTransportPerformanceScenarioConfig;
const debugLineQuery = computed(() => queryString(route.query.debugLine));
const primaryModes = computed(() =>
  GLOBAL_TRANSPORT_PLAN_CONFIG.primaryModes.filter((mode) => GLOBAL_MAP_MODE_ORDER.includes(mode)),
);
const customizationModes = computed(() =>
  GLOBAL_TRANSPORT_PLAN_PANEL_MODES.filter((mode) => availableModes.value.includes(mode)),
);
const activePreset = computed<GlobalTransportPlanPreset | undefined>(() =>
  deriveGlobalTransportPlanPreset(availableModes.value, filters.selectedModes.value),
);
// A one-mode custom filter is not an explicit preset (especially for buses).
const globalRadarPreset = ref<GlobalMapMode>();
const globalRadarContextPreset = computed(() =>
  globalRadarPreset.value === activePreset.value ? globalRadarPreset.value : undefined,
);
const customSummary = computed(() => {
  const selectedModes = customizationModes.value.filter((mode) =>
    filters.selectedModes.value.includes(mode),
  );
  if (selectedModes.length === 0) return t("globalMap.page.customSummaryEmpty");
  if (selectedModes.length <= 3) return selectedModes.map((mode) => modeLabel(mode)).join(" + ");
  return t("globalMap.page.customSummaryCount", { count: selectedModes.length });
});

function setDefaultModes(): void {
  filters.setAll();
}

const activeStation = computed(() => {
  const id = selection.activeStationId.value;
  return id ? network.value?.stationsById.get(id) : undefined;
});
const activeStationView = computed(() => activeStationGroup.value ?? activeStation.value);
const activeLine = computed(() => {
  const id = selection.activeLineId.value;
  return id ? network.value?.linesById.get(id) : undefined;
});
const globalMapIsochrones = useGlobalMapIsochrones({
  getContext: () => ({
    activeLine: activeLine.value,
    preset: globalRadarContextPreset.value,
    selectedModes: filters.selectedModes.value,
  }),
  getMapDataVersion: () => network.value ? dataSource.getManifest().dataVersion : undefined,
  getSuspended: () => routePreviewActive.value,
});
const globalRadarFocusMode = ref<GlobalMapMode>();
const globalRadarEnabledModes = computed(() => globalMapIsochrones.enabled.value
  ? globalMapIsochrones.eligibleModes.value.filter((mode) => globalMapIsochrones.settings.value[mode].enabled)
  : []);
const globalRadarScopeLabel = computed(() => {
  if (activeLine.value) return t("globalMap.radar.scopeLine", { line: activeLine.value.code });
  if (globalRadarContextPreset.value) return t("globalMap.radar.scopeMode", { mode: modeLabel(globalRadarContextPreset.value) });
  return t("globalMap.radar.scopeGeneral");
});
const globalRadarBuildCommand = computed(() => {
  const command = "npm run map:isochrones:build";
  if (activeLine.value) return `${command} -- --line=${activeLine.value.id}`;
  if (globalRadarContextPreset.value) return `${command} -- --modes=${globalRadarContextPreset.value}`;
  return command;
});
function openGlobalRadar(mode?: GlobalMapMode): void {
  globalRadarFocusMode.value = mode;
  globalMapIsochrones.panelOpen.value = mode ? true : !globalMapIsochrones.panelOpen.value;
}
function setGlobalRadarMode(mode: GlobalMapMode, setting: GlobalIsochroneSettings[GlobalMapMode]): void {
  globalMapIsochrones.settings.value[mode] = setting;
}
const activeLineSearchOption = computed<LineSearchOption | undefined>(() => {
  const line = activeLine.value;
  return line ? createTransportLineSearchOption(line) : undefined;
});
const activeLineFamily = computed<TransitFamily | undefined>(() => {
  const line = activeLine.value;
  return line ? globalMapLineFamily(line.mode) : undefined;
});
const globalLineDirections = useGlobalLineDirections({
  getNetwork: () => network.value,
  getActiveLine: () => activeLine.value,
  getRouteQuery: (key) => route.query[key],
  getStaticLineMetadataPaths: () => staticLineMetadataPaths.value,
  clearActiveTrafficDisruption: () => {
    activeTrafficDisruption.value = undefined;
  },
  syncRoute: () => syncUrl(),
  draw,
});
const {
  busDirectionSelection,
  busDirectionSequences,
  directionMergeEnabled,
  directionFilterRequested,
  directionStateReady,
  selectedDirectionButtonId,
  busDirectionLoading,
  busDirectionGeometryPaths,
  unavailableBusDirectionGeometryKey,
  selectedBusDirectionStationIds,
  selectedBusDirectionStationSet,
  selectedBusDirectionEdgeKeys,
  selectedBusDirectionQuays,
  resetBusDirectionState,
  loadBusDirection,
  changeBusDirection,
  toggleMergedDirections,
} = globalLineDirections;
const globalTransportScene = useGlobalTransportScene({
  getNetwork: () => network.value,
  getViewport: () => viewport.value,
  getPreloadedLinePaths: () => preloadedLinePaths.value,
  getActiveLine: () => activeLine.value,
  getActiveStationView: () => activeStationView.value,
  getActiveLineId: () => selection.activeLineId.value,
  getActiveStationId: () => selection.activeStationId.value,
  getCameraZoom: () => camera.value.zoom,
  getSelectedStationIds: () => selection.selectedStationIds.value,
  getSelectedModes: () => filters.selectedModes.value,
  getVisibleModeMask: () => filters.visibleModeMask.value,
  getHoveredStationId: () =>
    hoveredFeature.value?.type === "station" ? hoveredFeature.value.id : undefined,
  getHoveredLineId: () =>
    hoveredFeature.value?.type === "line" ? hoveredFeature.value.id : undefined,
  getConnectedStationIds: () => connectedStationIds.value,
  getSelectedBusDirectionStationIds: () => selectedBusDirectionStationIds.value,
  getSelectedBusDirectionStationSet: () => selectedBusDirectionStationSet.value,
  getSelectedBusDirectionEdgeKeys: () => selectedBusDirectionEdgeKeys.value,
  getSelectedBusDirectionQuays: () => selectedBusDirectionQuays.value,
  getBusDirectionGeometryPaths: () => busDirectionGeometryPaths.value,
  getUnavailableBusDirectionGeometryKey: () => unavailableBusDirectionGeometryKey.value,
  getSelectedBusDirectionGeometryKey: () =>
    `${activeLine.value?.id}:${busDirectionSelection.value?.selectedDirectionId}`,
  getSelectedLineInteractionScene: () => selectedLineInteractionScene.value,
  getItineraryPreviewActive: () => routePreviewActive.value,
  getWalkingIsochrones: () => globalMapIsochrones.surfaces.value,
  getHoveredIsochroneIds: () => hoveredFeature.value?.type === "isochrone"
    ? hoveredFeature.value.surfaces.map((surface) => surface.id)
    : [],
  getInteractionActive: () => interactionActive.value,
  getProgrammaticCameraFlightActive: () => interactionController?.isCameraAnimationActive() ?? false,
  getTrafficState: () => sceneTrafficStateReader(),
  getSidebarPreviewLineId: () => sidebarPreviewLineId.value,
  recordTiming: (kind: TransportMapTraceEventType, durationMs: number, metadata?: TransportMapTraceMetadata) => {
    performanceTrace?.recordDuration(kind, durationMs, metadata);
  },
});

const {
  activeStationMemberIds,
  activeConnectionStationIds,
  renderStations,
  staticLineMetadataPaths,
  lineMetadataPaths,
  ghostLinePaths,
  renderPaths,
  renderedPathIndex,
  activeLineView,
  activeStationLines,
  selectedStations,
  sidebarOpen,
  stationSidebarViewActive,
  visibleSelectedBusDirectionQuays,
  activeStationEntrances,
  selectedStationPulseStations,
  ghostLineIds,
  renderedGhostLineCount,
  renderableGhostLineIds,
  selectedLineInteractionSceneHighFidelity,
  unavailableGhostGeometryLineIds,
  missingRenderedGhostLineIds,
  selectedLineGhostSceneComplete,
  liveRenderScene,
  renderScene,
  hitTestStations,
  hitTestStationIds,
  hitTestStationIndex,
  selectedLineGeometryBounds,
} = globalTransportScene;

const globalTransportLegacyBasemap = useGlobalTransportLegacyBasemap({
  camera,
  getStage: () => stageElement.value,
  getLegacyBasemap: () => legacyBasemapRef.value,
  getActiveLine: () => activeLine.value,
  getLineMetadataPaths: () => lineMetadataPaths.value,
  getVisibleSelectedBusDirectionQuays: () => visibleSelectedBusDirectionQuays.value,
  getSelectedBusDirectionStationIds: () => selectedBusDirectionStationIds.value,
  getSelectedLineGeometryBounds: () => selectedLineGeometryBounds.value,
  isLegacyExperience: () => mapExperience.kind === "legacy",
  getCoverOverride: () => selectedLineCoverOverride.value,
  getInteractionActive: () => interactionActive.value,
  hasNetwork: () => Boolean(network.value),
  getMapBounds: () => dataSource.getManifest().bounds,
  getBasemapLayer: () => basemapLayer.value,
  getBasemapStyle: () => props.basemapStyle,
  getBasemapContrast: () => props.basemapContrast,
});
const {
  selectedLineCoverAnchorCamera,
  selectedLineCoverGeometryBounds,
  selectedLineBridgeCoverSnapshots,
  basemapTileRefreshCamera,
  selectedLineCoverEnabled,
  basemapStackStyle,
  selectedLineBroadCoverStyle,
  selectedLineBroadCoverCamera,
  selectedLineLiveRasterStyle,
  liveBasemapInteractionActive,
  basemapRenderCamera,
  selectedLineCoverGeometryKey,
  selectedLineBridgeCoverStyle,
  selectedLineBridgeCamera,
  beginSelectedLineBasemapGestureSurface,
  applySelectedLineWheelCamera,
  releaseSelectedLineBasemapGestureSurface,
  setBasemapTileRefreshCamera,
  captureSelectedLineBasemapCoverSnapshot,
  selectedLineZoomBasemapReady,
  selectedLineZoomBasemapSettled,
  selectedLineZoomCoverReady,
  selectedLineZoomBridgeCoversReady,
  readSelectedLineBasemapCoverage,
  prewarmSelectedLineCoverTextures,
} = globalTransportLegacyBasemap;

const globalTrafficCalendarLine = computed(() => activeLineView.value ?? activeLine.value);
const globalTrafficCalendarGraph = computed(() =>
  createGlobalMapTrafficGraph(
    globalTrafficCalendarLine.value,
    network.value?.stations ?? [],
    lineMetadataPaths.value,
  ),
);
const trafficCalendarStations = computed<PatternTrafficStation[]>(() =>
  globalTrafficCalendarGraph.value.stations,
);
const trafficCalendarEdges = computed<PatternTrafficEdge[]>(() =>
  globalTrafficCalendarGraph.value.edges,
);
const {
  resolvedTrafficReport,
  currentTrafficDisruptions: globalTrafficDisruptions,
  trafficTimingNow,
} = useDeparturePatternTraffic({
  open: computed(() => Boolean(activeLineSearchOption.value)),
  line: activeLineSearchOption,
  smartTrafficDetection: computed(() => appSettings.value.smartTrafficDetection),
  trafficReport: computed<TrafficLineReport | undefined>(() => undefined),
  selectedTrafficDisruptionIds: computed(() => selectedTrafficDisruptionIds.value),
  trafficEvaluationTimestamp: computed(() => selectedTrafficTimestamp.value),
});
const {
  calendar: trafficCalendar,
  close: closeTrafficCalendar,
  closeExpanded: closeExpandedTrafficCalendar,
  eventCount: trafficCalendarEventCount,
  events: trafficCalendarEvents,
  expand: expandTrafficCalendar,
  expanded: trafficCalendarExpanded,
  hasNext: hasNextTrafficCalendarMonth,
  hasPrevious: hasPreviousTrafficCalendarMonth,
  loadingDateKey: trafficCalendarLoadingDateKey,
  loadingDirection: trafficCalendarLoadingDirection,
  nextDelayLabel: trafficCalendarNextDelayLabel,
  nextMonth: selectNextTrafficCalendarMonth,
  open: trafficCalendarOpen,
  previousMonth: selectPreviousTrafficCalendarMonth,
  resetSelection: resetTrafficCalendarSelection,
  resetToday: resetGlobalTrafficCalendarTodaySelection,
  selectDay: selectGlobalTrafficCalendarDaySelection,
  selectedDateKey: selectedTrafficCalendarDateKey,
  selectedDay: selectedTrafficCalendarDay,
  selectedDisruptions: selectedTrafficCalendarDisruptions,
  toggle: toggleTrafficCalendar,
} = usePatternTrafficCalendar({
  report: computed(() =>
    appSettings.value.smartTrafficDetection ? resolvedTrafficReport.value : undefined,
  ),
  stations: trafficCalendarStations,
  edges: trafficCalendarEdges,
  impactScope: computed(() => appSettings.value.trafficCalendarImpactScope),
  now: trafficTimingNow,
  reduceMotion: computed(() => appSettings.value.reduceMotion),
  selectedDisruptionIds: selectedTrafficDisruptionIds,
  selectedTimestamp: selectedTrafficTimestamp,
});
const globalTrafficCalendar = computed<GlobalMapSidebarTrafficCalendarState>(() => ({
  open: trafficCalendarOpen.value,
  expanded: trafficCalendarExpanded.value,
  calendar: trafficCalendar.value,
  selectedDateKey: selectedTrafficCalendarDateKey.value,
  selectedDay: selectedTrafficCalendarDay.value,
  selectedDisruptions: selectedTrafficCalendarDisruptions.value,
  hasPrevious: hasPreviousTrafficCalendarMonth.value,
  hasNext: hasNextTrafficCalendarMonth.value,
  loadingDateKey: trafficCalendarLoadingDateKey.value,
  loadingDirection: trafficCalendarLoadingDirection.value,
}));

const globalTransportTraffic = useGlobalTransportTraffic({
  activeTrafficDisruption,
  getNetwork: () => network.value,
  getActiveLine: () => activeLine.value,
  getActiveStationView: () => activeStationView.value,
  getLineMetadataPaths: () => lineMetadataPaths.value,
  getSelectedBusDirectionEdgeKeys: () => selectedBusDirectionEdgeKeys.value,
  getSelectedBusDirectionStationSet: () => selectedBusDirectionStationSet.value,
  getGhostLineIds: () => ghostLineIds.value,
  getCalendarTrafficDisruptions: () => globalTrafficDisruptions.value,
  getCalendarTrafficActive: () => trafficCalendarOpen.value,
  draw,
  performanceTrace,
});
const {
  traffic,
  trafficStatusLabel,
  sceneTrafficStateReader: readTrafficSceneState,
  enableTraffic,
  disableTraffic,
  toggleTraffic,
  refreshLineIfStale,
  resolveCandidateTrafficDisruption,
} = globalTransportTraffic;
sceneTrafficStateReader = readTrafficSceneState;

watch(
  [
    trafficCalendarOpen,
    globalTrafficDisruptions,
    selectedTrafficTimestamp,
    () => selectedTrafficDisruptionIds.value.join("\u0000"),
  ],
  () => draw(),
  { flush: "post" },
);

const {
  dashboardPlaces,
  dashboardPlaceId,
  dashboardBusy,
  dashboardMessage,
  dashboardHasUndo,
  addActiveStationToDashboard,
  addSelectionToDashboard,
  undoDashboardAdd,
} = useGlobalTransportDashboard({
  getNetwork: () => network.value,
  getActiveStation: () => activeStation.value,
  getActiveLine: () => activeLine.value,
  getSelectedStations: () => selectedStations.value,
  selectStationForDashboard,
});

const sidebarPreviewLine = computed<GlobalMapLine | undefined>(() => {
  if (!sidebarOpen.value || !sidebarPreviewLineId.value || !network.value) return undefined;

  const line = network.value.linesById.get(sidebarPreviewLineId.value);
  if (!line || line.id === activeLine.value?.id) return undefined;
  return line;
});
const sidebarCityPatternStations = computed<GlobalMapStation[]>(() => {
  const previewLine = sidebarPreviewLine.value;
  const line = previewLine ?? activeLine.value;
  const allStations = network.value?.stations ?? [];
  if (!line) return [];

  if (previewLine) {
    return previewLine.stationIds
      .map((stationId) => network.value?.stationsById.get(stationId))
      .filter((station): station is GlobalMapStation => Boolean(station));
  }

  const direction = busDirectionSelection.value;
  const directionalStationIds = direction
    ? getGlobalBusDirectionOrderedStopIds(line, direction, allStations)
    : [];
  const stationIds = directionalStationIds.length > 1
    ? directionalStationIds
    : line.stationIds;

  return stationIds
    .map((stationId) => network.value?.stationsById.get(stationId))
    .filter((station): station is GlobalMapStation => Boolean(station));
});
const sidebarPreviewPaths = computed<GlobalMapPath[]>(() => {
  const line = sidebarPreviewLine.value;
  if (!line || !network.value) return [];

  // Preview metadata is deliberately restricted to geometry that is already
  // present in the render scene or in the regional pack. Hovering must never
  // turn into a line-geometry request.
  return selectPreferredLinePaths(
    renderPaths.value.filter((path) => path.lineId === line.id),
    network.value.regionalPaths,
    line.id,
  );
});
const linePanelLines = computed(() =>
  linePanelMode.value
    ? (network.value?.lines
        .filter((line) => line.mode === linePanelMode.value)
        .sort((left, right) => left.code.localeCompare(right.code, "fr-FR", { numeric: true })) ??
      [])
    : [],
);
const locationRequestVisible = computed(
  () =>
    userLocationVisible.value &&
    userGeolocation.isSupported.value &&
    !userGeolocation.isAuthorized.value &&
    ["prompt", "prompt-with-rationale", "unknown"].includes(userGeolocation.permissionState.value),
);
const userLocationMarkerVisible = computed(
  () =>
    userLocationVisible.value &&
    userGeolocation.isEnabled.value &&
    Boolean(userGeolocation.coordinates.value),
);
const userLocationMarkerStyle = computed<Record<string, string>>(() => {
  const coordinates = userGeolocation.coordinates.value;
  if (!coordinates) return {} as Record<string, string>;

  const world = lonLatToWorld({
    lon: coordinates.longitude,
    lat: coordinates.latitude,
  });
  const screen = worldToScreen(world, camera.value);
  return {
    left: `${screen.x}px`,
    top: `${screen.y}px`,
  };
});
const debugLine = computed(() =>
  resolveDebugLine(network.value?.lines ?? [], debugLineQuery.value),
);
const debugLineAngles = computed(() =>
  debugLine.value && network.value
    ? measureLineStationAngles(debugLine.value, viewport.value.paths, network.value.stationsById)
    : [],
);
const inconsistentDebugStationCount = computed(
  () => debugLineAngles.value.filter((station) => station.inconsistent).length,
);
const statusLabel = computed(() => {
  if (errorMessage.value) return t("globalMap.page.status.unavailable");
  if (!network.value) return t("globalMap.page.status.preparing");
  const metrics = dataSource.metrics();
  const summary = t("globalMap.page.status.summary", {
    lines: network.value.lines.length.toLocaleString("fr-FR"),
    stations: network.value.stations.length.toLocaleString("fr-FR"),
  });
  const catalog = metrics.catalogLoaded
    ? t("globalMap.page.status.catalog")
    : t("globalMap.page.status.network");
  return [summary, catalog].join(" - ");
});

function lineFamilyToTransportType(family: TransitFamily): string {
  switch (family) {
    case "METRO":
      return "metro";
    case "RER":
      return "rer";
    case "TRAM":
      return "tram";
    case "BUS":
      return "bus";
    case "NOCTILIEN":
      return "noctilien";
    case "CABLE":
      return "cable";
    case "TRANSILIEN":
    default:
      return "transilien";
  }
}

const supportsLineDirections = supportsGlobalLineDirections;

function modeLabel(mode: GlobalMapMode): string {
  const keys: Record<GlobalMapMode, string> = {
    BUS: "bus",
    METRO: "metro",
    RER: "rer",
    TRAIN: "train",
    TRANSILIEN: "transilien",
    TRAM: "tram",
    CABLE: "cable",
    NOCTILIEN: "noctilien",
    BIKE: "bike",
  };
  return t(`globalMap.modes.${keys[mode]}` as never);
}

function modeColor(mode: GlobalMapMode): string {
  return network.value?.lines.find((line) => line.mode === mode)?.color ?? "transparent";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${t("globalMap.page.units.bytes")}`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(0)} ${t("globalMap.page.units.kilobytes")}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${t("globalMap.page.units.megabytes")}`;
}

function formatDebugAngle(angleDegrees: number | undefined): string {
  return angleDegrees === undefined ? "–" : `${angleDegrees.toFixed(1)}°`;
}

function formatDebugLegs(
  incomingMeters: number | undefined,
  outgoingMeters: number | undefined,
): string {
  if (incomingMeters === undefined || outgoingMeters === undefined) return "–";
  return `${incomingMeters.toFixed(0)} / ${outgoingMeters.toFixed(0)} m`;
}

function clearInvalidStationHover(): void {
  globalTransportHover.clearInvalidStationHover();
}

function drawNow(): void {
  if (!mounted || !renderer) return;
  clearInvalidStationHover();
  if (debugPerformanceEnabled.value) loadingStage.value = "building-scene";
  const scene = renderScene.value;
  if (debugPerformanceEnabled.value) loadingStage.value = "presenting";
  const renderStartedAt = performanceTrace?.isRunning ? transportMapNowMs() : Number.NaN;
  renderer.render(camera.value, scene);
  if (performanceTrace?.isRunning && Number.isFinite(renderStartedAt)) {
    performanceTrace.recordDuration("renderer_render_call", transportMapNowMs() - renderStartedAt, {
      pathCount: scene.paths.length,
      stationCount: scene.stations.length,
    });
  }
  const metrics = renderer.getMetrics();
  if (debugPerformanceEnabled.value) {
    loadingStage.value = metrics.binaryCompileInProgress ? "binary" : "ready";
  }
  globalTransportPerformanceScenarios?.recordFrame(metrics);
  if (!interactionActive.value) rendererMetrics.value = metrics;
}

function transportMapNowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function draw(): void {
  if (!mounted || !renderer) return;
  if (drawFrame !== undefined) return;
  if (typeof requestAnimationFrame === "undefined") {
    drawNow();
    return;
  }
  drawFrame = requestAnimationFrame(() => {
    drawFrame = undefined;
    drawNow();
  });
}

function setMapInteractionActive(active: boolean): void {
  if (active) {
    deferredNextViewport = undefined;
    interactionActive.value = true;
    return;
  }

  interactionActive.value = false;
  const pending = deferredNextViewport;
  deferredNextViewport = undefined;
  if (
    mapExperience.kind === "next" &&
    pending &&
    pending.generation === camera.value.generation
  ) {
    viewport.value = pending;
    draw();
  }
}

const globalTransportPerformance = useGlobalTransportPerformance({
  getMetadata: () => globalTransportPerformanceScenarios?.getPerformanceMetadata() ?? {},
  getCacheMetrics: () => dataSource.metrics().cache.cache,
  trace: performanceTrace,
});
const {
  debugReport,
  debugProbeRunning,
  debugReportJson,
  startDebugPerformance,
  stopDebugPerformance,
  exportDebugReport,
} = globalTransportPerformance;

function getDataSourceNetworkVersion(): number | undefined {
  const source = dataSource as TransportMapDataSource & {
    getNetworkVersion?: () => number;
  };
  return typeof source.getNetworkVersion === "function"
    ? source.getNetworkVersion()
    : undefined;
}

const globalTransportViewport = useGlobalTransportViewport({
  isMounted: () => mounted,
  getNetwork: () => network.value,
  getNetworkVersion: getDataSourceNetworkVersion,
  getCamera: () => camera.value,
  getVisibleModeMask: () => filters.visibleModeMask.value,
  getActiveLineId: () => selection.activeLineId.value,
  getForcedLineIds: () => ghostLineIds.value,
  queryViewport: (requestedCamera, visibleModeMask, generation, activeLineId, forcedLineIds) => {
    if (debugPerformanceEnabled.value) loadingStage.value = "viewport";
    return dataSource.queryViewport(
      requestedCamera,
      visibleModeMask,
      generation,
      activeLineId,
      forcedLineIds,
    );
  },
  getNetworkAfterQuery: () => dataSource.getNetwork(),
  publishNetwork: (nextNetwork, wasSameObject, dataChanged = false) => {
    if (debugPerformanceEnabled.value) loadingStage.value = "applying-data";
    if (!wasSameObject) network.value = nextNetwork;
    else if (dataChanged) {
      performanceTrace?.instant("network_triggered", {
        reason: "network-data-version-changed",
        sameObject: true,
        dataChanged: true,
      });
      triggerRef(network);
    }
  },
  publishViewport: (nextViewport) => {
    if (debugPerformanceEnabled.value) loadingStage.value = "applying-data";
    // A viewport request can finish while the next-map wheel gesture is still
    // moving. Keep the displayed Deck scene stable until the gesture ends;
    // otherwise successive chunk/LOD responses make paths flicker or vanish.
    if (mapExperience.kind === "next" && interactionActive.value) {
      deferredNextViewport = nextViewport;
      return;
    }
    viewport.value = nextViewport;
  },
  setLoading: (nextLoading) => {
    loading.value = nextLoading;
    if (debugPerformanceEnabled.value && nextLoading) loadingStage.value = "viewport";
  },
  clearError: () => {
    errorMessage.value = "";
  },
  setError: (message) => {
    errorMessage.value = message;
  },
  recordTiming: (kind, durationMs, metadata) => {
    if (kind === "decode" || kind === "worker") viewportTimingReader(kind, durationMs);
    else performanceTrace?.recordDuration(kind, durationMs, metadata);
  },
  afterRefresh: () => {
    if (debugPerformanceEnabled.value) loadingStage.value = "presenting";
    draw();
  },
  isAbortError,
  debounceMs: GLOBAL_TRANSPORT_PLAN_CONFIG.camera.viewportRefreshDebounceMs,
});

const refreshViewport = globalTransportViewport.refreshViewport;
const preloadLine = globalTransportViewport.preloadLine;
const cancelPreloadLine = globalTransportViewport.cancelPreloadLine;
const cancelScheduledViewportRefresh = globalTransportViewport.cancelScheduledRefresh;
const invalidatePendingViewportRequests = globalTransportViewport.invalidatePendingRequests;

function scheduleViewportRefresh(): void {
  // The itinerary preview owns the visible route layer and deliberately hides
  // the network renderer. Querying viewport chunks during every pan only
  // burns CPU/network work that cannot be shown; refresh once the preview is
  // closed so the regular map is current again.
  if (routePreviewActive.value) {
    cancelScheduledViewportRefresh();
    return;
  }
  globalTransportViewport.scheduleRefresh();
}

function clearPreloadedLineGeometry(): void {
  cancelPreloadLine();
  if (preloadedLinePaths.value.length === 0) return;
  preloadedLinePaths.value = [];
  draw();
}

function preloadLineGeometry(lineId: string): void {
  preloadedLinePaths.value = [];
  void preloadLine(lineId).then((result) => {
    if (
      !result ||
      !mounted ||
      selection.activeLineId.value !== lineId
    ) return;
    const paths = result.paths.filter((path) => path.lineId === lineId);
    if (paths.length === 0) return;
    preloadedLinePaths.value = paths;
    draw();
  });
}

function sameGlobalModeSet(left: readonly GlobalMapMode[], right: readonly GlobalMapMode[]): boolean {
  if (left.length !== right.length) return false;
  const rightModes = new Set(right);
  return left.every((mode) => rightModes.has(mode));
}

function ensureExtremeFullNetworkState(): void {
  if (!extremeChaosGuardActive.value) return;
  const hasSelection = Boolean(
    selection.activeLineId.value ||
    selection.activeStationId.value ||
    selection.selectedStationIds.value.length,
  );
  const allModesActive = sameGlobalModeSet(availableModes.value, filters.selectedModes.value);
  if (!hasSelection && allModesActive) return;

  // This guard is intentionally small and synchronous. It protects the
  // benchmark from a late click/watch callback without introducing a second
  // selection state machine.
  selection.clear();
  resetLeftControlsToPresetView();
  activeStationGroup.value = undefined;
  focusedEntranceId.value = undefined;
  connectedStationIds.value = [];
  activeTrafficDisruption.value = undefined;
  selectedLineInteractionScene.value = undefined;
  sidebarPreviewLineId.value = undefined;
  resetBusDirectionState();
  filters.selectedModes.value = [...availableModes.value];
  if (traffic.enabled.value) disableTraffic();
  syncUrl();
  draw();
  cancelScheduledViewportRefresh();
  if (mounted && network.value) void refreshViewport().catch(() => undefined);
}

async function ensureSearchCatalog(): Promise<void> {
  const ensureCatalog = (
    dataSource as TransportMapDataSource & {
      ensureCatalog?: () => Promise<unknown>;
    }
  ).ensureCatalog;
  if (typeof ensureCatalog !== "function" || dataSource.metrics().catalogLoaded) {
    searchCatalogReady.value = dataSource.metrics().catalogLoaded;
    return;
  }
  if (searchCatalogPromise) return searchCatalogPromise;

  searchCatalogLoading.value = true;
  const promise = (async () => {
    try {
      await ensureCatalog.call(dataSource);
    } catch (error) {
      if (isAbortError(error)) return;
      throw error;
    }
    if (mounted) {
      network.value = dataSource.getNetwork();
      searchCatalogReady.value = true;
      draw();
    }
  })();
  searchCatalogPromise = promise;
  try {
    await promise;
  } finally {
    if (searchCatalogPromise === promise) searchCatalogPromise = undefined;
    if (mounted) searchCatalogLoading.value = false;
  }
}

async function searchGlobalPlaces(query: string, signal?: AbortSignal): Promise<GeocoderPoint[]> {
  const points = await globalNearbyProviders.places.searchDestinations(
    query,
    {
      includeStations: false,
      includePlaces: true,
      count: 8,
    },
    signal,
  );
  return points.filter((point) => point.type === "place");
}

const globalVisibleTravelRoutes = computed(() => {
  const allowed = globalTravelAllowedModes.value.length > 0
    ? new Set(globalTravelAllowedModes.value)
    : undefined;
  return globalItinerary.travelRoutes.routes.value.filter((candidate) =>
    !allowed || candidate.transitSections.every((section) =>
      section.lineMode === undefined || allowed.has(section.lineMode),
    ),
  );
});

const globalSelectedTravelRoute = computed(() => {
  if (!globalItinerary.open.value || globalItinerary.travelRoutes.isLoading.value) return undefined;
  const selected = globalItinerary.travelRoutes.selectedRoute.value;
  return selected && globalVisibleTravelRoutes.value.some((candidate) => candidate.id === selected.id)
    ? selected
    : undefined;
});

const globalItineraryLinePaths = shallowRef(new Map<string, GlobalMapPath[]>());

watch(globalSelectedTravelRoute, async (selectedRoute, _previous, onCleanup) => {
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  if (!selectedRoute) {
    globalItineraryLinePaths.value = new Map();
    return;
  }
  try {
    await ensureSearchCatalog();
  } catch {
    return;
  }
  if (cancelled) return;
  const lineIds = new Set(selectedRoute.sections.flatMap((section) => {
    const line = resolveGlobalTransportItineraryLine(section, network.value?.lines ?? []);
    return line ? [line.id] : [];
  }));
  globalItineraryLinePaths.value = new Map(
    [...globalItineraryLinePaths.value].filter(([id]) => lineIds.has(id)),
  );
  // Reuse the normal line-selection loader: it fetches full-detail chunks,
  // including those outside the current viewport, without changing selection.
  for (const lineId of lineIds) {
    if (cancelled) return;
    if (globalItineraryLinePaths.value.has(lineId)) continue;
    const result = await preloadLine(lineId);
    if (cancelled) return;
    if (result) {
      globalItineraryLinePaths.value = new Map(globalItineraryLinePaths.value)
        .set(lineId, result.paths.filter((path) => path.lineId === lineId));
    }
  }
}, { flush: "post" });

function resolveItineraryLineGeometry(
  section: NearbyJourneySection,
  from: NearbyJourneyPoint,
  to: NearbyJourneyPoint,
) {
  const currentNetwork = network.value;
  if (!currentNetwork) return undefined;
  const line = resolveGlobalTransportItineraryLine(section, currentNetwork.lines);
  if (!line) return undefined;
  const paths = selectPreferredLinePaths(
    globalItineraryLinePaths.value.get(line.id) ?? viewport.value.paths,
    currentNetwork.regionalPaths,
    line.id,
  );
  return clipGlobalTransportItineraryLine(
    paths,
    line,
    currentNetwork.stationsById,
    section,
    from,
    to,
  );
}

// The overlay and camera fit share the same prepared route. Camera movement
// neither reloads line geometry nor changes its vertices.
const globalItinerarySegments = computed<GlobalTransportItinerarySegment[]>(() => {
  const startedAt = performanceTrace?.isRunning ? transportMapNowMs() : undefined;
  const segments = createGlobalTransportItinerarySegments(
    globalSelectedTravelRoute.value,
    globalItinerary.origin.value,
    globalItinerary.travelRoutes.destination.value,
    {
      resolveTransitGeometry: resolveItineraryLineGeometry,
      resolveTransitExitPoint: (section, target) => selectFastestRouteExit(
        getGlobalSectionExits(section),
        target,
      ),
    },
  );
  if (startedAt !== undefined) {
    const coordinateCount = segments.reduce((total, segment) => total + segment.coordinates.length, 0);
    performanceTrace?.recordCounter("itinerary.segments.calls");
    performanceTrace?.recordCounter("itinerary.segments.coordinates", coordinateCount);
    performanceTrace?.recordDuration("route_segments_prepare", transportMapNowMs() - startedAt, {
      routeId: globalSelectedTravelRoute.value?.id ?? null,
      segmentCount: segments.length,
      coordinateCount,
    });
  }
  return segments;
});

/** During a route detail preview the renderer intentionally receives no map layers. */
const routePreviewActive = computed(() => Boolean(globalSelectedTravelRoute.value));

let routeSwitchMeasurementToken = 0;
let activeRouteSwitchTraceId: string | undefined;

function selectGlobalTravelRoute(route: TravelRoute): void {
  const measurementToken = ++routeSwitchMeasurementToken;
  const startedAt = performanceTrace?.isRunning ? transportMapNowMs() : undefined;
  const previousRouteId = globalItinerary.travelRoutes.selectedRouteId.value;
  if (activeRouteSwitchTraceId) {
    performanceTrace?.end(activeRouteSwitchTraceId, { cancelled: true });
    activeRouteSwitchTraceId = undefined;
  }

  const traceId = performanceTrace?.begin("route_switch", {
    fromRouteId: previousRouteId ?? null,
    toRouteId: route.id,
    transitSections: route.transitSections.length,
  });
  activeRouteSwitchTraceId = traceId;
  const selected = globalItinerary.travelRoutes.selectRoute(route.id);
  const selectedAt = startedAt !== undefined ? transportMapNowMs() : undefined;

  if (startedAt === undefined || selected === undefined) return;

  performanceTrace?.recordCounter("itinerary.routeSwitches");
  performanceTrace?.recordCounter("itinerary.routeSwitch.transitSections", route.transitSections.length);
  performanceTrace?.recordDuration("route_switch_selected", (selectedAt ?? startedAt) - startedAt, {
    routeId: route.id,
    selectedRouteId: globalItinerary.travelRoutes.selectedRouteId.value ?? null,
  }, traceId);

  void nextTick(() => {
    if (measurementToken !== routeSwitchMeasurementToken) return;
    const nextTickAt = transportMapNowMs();
    performanceTrace?.recordDuration("route_switch_next_tick", nextTickAt - (selectedAt ?? startedAt), {
      routeId: route.id,
    }, traceId);

    const markFirstFrame = () => {
      if (measurementToken !== routeSwitchMeasurementToken) return;
      const firstFrameAt = transportMapNowMs();
      performanceTrace?.recordDuration("route_switch_first_paint", firstFrameAt - nextTickAt, {
        routeId: route.id,
        clickToFirstFrameMs: firstFrameAt - startedAt,
      }, traceId);
      performanceTrace?.end(traceId, {
        firstFrameMs: firstFrameAt - startedAt,
      });
      if (activeRouteSwitchTraceId === traceId) activeRouteSwitchTraceId = undefined;
    };

    if (typeof requestAnimationFrame === "function") requestAnimationFrame(markFirstFrame);
    else window.setTimeout(markFirstFrame, 0);
  });
}

const savedOriginSuggestions = computed(() => addressBook.entries.value
  .filter((entry) => entry.kind === "address")
  .sort((left, right) => Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary))
    || left.name.localeCompare(right.name, "fr-FR", { numeric: true }))
  .map(toAddressBookPoint));

function openAddressBook(initial?: AddressBookInitialEntry): void {
  addressBookInitial.value = initial;
  addressBookOpen.value = true;
}

function closeAddressBook(): void {
  addressBookOpen.value = false;
  addressBookInitial.value = undefined;
}

function saveItineraryOrigin(point: GeocoderPoint): void {
  const existing = point.id ? addressBook.getEntry(point.id) : undefined;
  if (existing) {
    openAddressBook(existing);
    return;
  }
  openAddressBook({
    kind: "address",
    name: point.label?.trim() || point.address?.trim(),
    address: point.address?.trim() || point.label?.trim(),
    city: point.city,
    postcode: point.postcode,
    lon: point.lon,
    lat: point.lat,
    icon: "pin",
  });
}

function viewAddressBookLocation(entry: AddressBookEntry): void {
  closeAddressBook();
  if (globalItinerary.open.value) globalItinerary.close();
  cancelCameraAnimation();
  const world = lonLatToWorld(entry);
  applyCamera(updateCamera(camera.value, {
    centerWorldX: world.x,
    centerWorldY: world.y,
    zoom: Math.max(camera.value.zoom, GLOBAL_TRANSPORT_PLAN_CONFIG.selection.stationZoom),
  }), false);
}

function viewAddressBookNeighborhood(entry: AddressBookEntry): void {
  closeAddressBook();
  if (typeof window === "undefined") return;
  const params = new URLSearchParams({
    address: entry.address || entry.name,
    lat: String(entry.lat),
    lon: String(entry.lon),
  });
  window.open(`/nearby-stations?${params.toString()}`, "_blank", "noopener,noreferrer");
}

type GlobalTransportNetwork = ReturnType<TransportMapDataSource["getNetwork"]>;
let globalSectionExitsCacheNetwork: GlobalTransportNetwork | undefined;
let globalSectionExitsCacheStations: GlobalTransportNetwork["stations"] | undefined;
let globalSectionExitsCacheEntrances: GlobalTransportNetwork["entrances"] | undefined;
let globalSectionExitsCache = new WeakMap<NearbyJourneySection, readonly RouteExit[]>();

function recordRouteSectionExitDuration(
  startedAt: number | undefined,
  metadata: Record<string, unknown>,
): void {
  if (startedAt === undefined) return;
  performanceTrace?.recordDuration("route_section_exits", transportMapNowMs() - startedAt, metadata);
}

function getGlobalSectionExits(section: NearbyJourneySection): readonly RouteExit[] {
  const startedAt = performanceTrace?.isRunning ? transportMapNowMs() : undefined;
  performanceTrace?.recordCounter("itinerary.getGlobalSectionExits.calls");
  const currentNetwork = network.value;
  if (!currentNetwork) {
    recordRouteSectionExitDuration(startedAt, {
      cacheHit: false,
      stationFound: false,
      lineCode: section.lineCode ?? null,
    });
    return [];
  }

  if (
    globalSectionExitsCacheNetwork !== currentNetwork
    || globalSectionExitsCacheStations !== currentNetwork.stations
    || globalSectionExitsCacheEntrances !== currentNetwork.entrances
  ) {
    globalSectionExitsCacheNetwork = currentNetwork;
    globalSectionExitsCacheStations = currentNetwork.stations;
    globalSectionExitsCacheEntrances = currentNetwork.entrances;
    globalSectionExitsCache = new WeakMap();
  }

  const cached = globalSectionExitsCache.get(section);
  if (cached) {
    performanceTrace?.recordCounter("itinerary.getGlobalSectionExits.cacheHits");
    recordRouteSectionExitDuration(startedAt, {
      cacheHit: true,
      stationFound: cached.length > 0,
      lineCode: section.lineCode ?? null,
    });
    return cached;
  }

  performanceTrace?.recordCounter("itinerary.resolveTravelBoundaryStation.calls");
  const stationIndex = dataSource.getStationSpatialIndex();
  const stationCandidates = stationIndex && section.toPoint
    ? queryStationsWithinRadius(
      currentNetwork.stations,
      section.toPoint,
      MAX_RELIABLE_BOUNDARY_DISTANCE_METERS,
      Number.POSITIVE_INFINITY,
      0,
      stationIndex,
    ).map((result) => result.station)
    : undefined;
  performanceTrace?.recordCounter(
    "itinerary.resolveTravelBoundaryStation.stationsInspected",
    stationCandidates?.length ?? currentNetwork.stations.length,
  );
  performanceTrace?.recordCounter(
    "itinerary.resolveTravelBoundaryStation.spatialCandidates",
    stationCandidates?.length ?? 0,
  );
  const station = resolveTravelBoundaryStation({
    network: currentNetwork,
    section,
    side: "to",
    fallback: section.toPoint,
    candidates: stationCandidates,
  });
  if (!station) {
    globalSectionExitsCache.set(section, []);
    recordRouteSectionExitDuration(startedAt, {
      cacheHit: false,
      stationFound: false,
      lineCode: section.lineCode ?? null,
    });
    return [];
  }

  performanceTrace?.recordCounter(
    "itinerary.createRouteExitsForStation.entrancesInspected",
    currentNetwork.entrances.length,
  );
  const exits = createRouteExitsForStation(currentNetwork, station.id);
  globalSectionExitsCache.set(section, exits);
  recordRouteSectionExitDuration(startedAt, {
    cacheHit: false,
    stationFound: true,
    lineCode: section.lineCode ?? null,
    exitCount: exits.length,
  });
  return exits;
}

function setGlobalTravelAllowedModes(modes: GlobalMapMode[]): void {
  const available = new Set(availableModes.value);
  globalTravelAllowedModes.value = modes.filter((mode) => available.size === 0 || available.has(mode));
}

async function setGlobalItineraryOrigin(point: GeocoderPoint): Promise<void> {
  await globalItinerary.setOrigin(point);
}

async function useCurrentLocationAsItineraryOrigin(): Promise<void> {
  if (!userGeolocation.isAuthorized.value) return;
  const coordinates = userGeolocation.coordinates.value;
  if (!coordinates) return;
  await setGlobalItineraryOrigin({
    lon: coordinates.longitude,
    lat: coordinates.latitude,
    label: t("globalMap.itinerary.myPosition"),
    provider: "device",
    type: "address",
  });
}

function applyCamera(nextCamera: CameraState, query = true, refresh = true, render = true): void {
  const previousCamera = camera.value;
  const next = network.value
    ? clampCameraToBounds(nextCamera, dataSource.getManifest().bounds)
    : nextCamera;
  if (activeItineraryFitTraceId && performanceTrace?.isRunning) {
    activeItineraryFitCameraUpdates += 1;
  }
  const cameraTraceId = performanceTrace?.isRunning
    ? performanceTrace.begin("camera_update", {
        previousZoom: previousCamera.zoom,
        newZoom: next.zoom,
        query,
        refresh,
        render,
        generation: next.generation,
      })
    : undefined;
  camera.value = next;
  if (performanceTrace?.isRunning && previousCamera.generation !== next.generation) {
      performanceTrace.instant("viewport_generation_change", {
        previousGeneration: previousCamera.generation,
        newGeneration: next.generation,
        zoom: next.zoom,
        query,
        refresh,
        render,
      });
  }
  if (!interactionActive.value) displayZoom.value = next.zoom;
  if (render) draw();
  if (refresh) scheduleViewportRefresh();
  if (query) syncUrl();
  if (performanceTrace?.isRunning) {
    performanceTrace.end(cameraTraceId, {
      zoom: next.zoom,
      generation: next.generation,
    });
  }
}

let globalItineraryFitKey: string | undefined;
let activeItineraryFitTraceId: string | undefined;
let activeItineraryFitCameraUpdates = 0;

function endItineraryFitTrace(metadata: Record<string, unknown> = {}): void {
  if (!activeItineraryFitTraceId) return;
  performanceTrace?.recordCounter(
    "itinerary.fit.cameraUpdates",
    activeItineraryFitCameraUpdates,
  );
  performanceTrace?.end(activeItineraryFitTraceId, {
    cameraUpdateCount: activeItineraryFitCameraUpdates,
    ...metadata,
  });
  activeItineraryFitTraceId = undefined;
  activeItineraryFitCameraUpdates = 0;
}

function fitGlobalItineraryToRoute(): void {
  const route = globalSelectedTravelRoute.value;
  const origin = globalItinerary.origin.value;
  const destination = globalItinerary.travelRoutes.destination.value;
  if (!route || !origin || !destination) {
    globalItineraryFitKey = undefined;
    endItineraryFitTrace({ cancelled: true });
    return;
  }

  const key = [
    route.id,
    origin.lon,
    origin.lat,
    destination.lon,
    destination.lat,
    camera.value.viewportWidthCssPx,
    camera.value.viewportHeightCssPx,
  ].join(":");
  if (key === globalItineraryFitKey) return;

  endItineraryFitTrace({ cancelled: true });
  const bounds = getGlobalTransportItineraryBounds(
    globalItinerarySegments.value,
    [origin, destination],
  );
  if (!bounds) return;

  globalItineraryFitKey = key;
  performanceTrace?.recordCounter("itinerary.fit.calls");
  const fitTraceId = performanceTrace?.begin("route_camera_fit", {
    routeId: route.id,
    segmentCount: globalItinerarySegments.value.length,
  });
  activeItineraryFitTraceId = fitTraceId;
  activeItineraryFitCameraUpdates = 0;
  const targetCamera = fitCameraToBounds(
    camera.value,
    bounds,
    Math.max(48, GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.paddingCssPx),
    GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.minZoom,
    GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.maxZoom,
  );
  if (interactionController) {
    // Keep the itinerary overlay mounted while the camera flies to the full
    // route, just like a line selection keeps the new line visible during its
    // own pan and zoom.
    interactionController.animateCameraToTarget({
      centerWorldX: targetCamera.centerWorldX,
      centerWorldY: targetCamera.centerWorldY,
      zoom: targetCamera.zoom,
    }, () => endItineraryFitTrace({ completed: true }));
    return;
  }
  applyCamera(targetCamera, false);
  endItineraryFitTrace({ completed: true });
}

function animateCameraToStation(station: Pick<GlobalMapStation, "worldX" | "worldY">): void {
  interactionController?.animateCameraToTarget({
    centerWorldX: station.worldX,
    centerWorldY: station.worldY,
    zoom: GLOBAL_TRANSPORT_PLAN_CONFIG.selection.stationZoom,
  });
}

function resizeStage(): void {
  if (!stageElement.value || !renderer) return;
  const rect = stageElement.value.getBoundingClientRect();
  const pixelRatio = Math.max(
    1,
    Math.min(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxDevicePixelRatio, window.devicePixelRatio || 1),
  );
  camera.value = resizeCamera(
    camera.value,
    Math.max(1, rect.width),
    Math.max(1, rect.height),
    pixelRatio,
  );
  captureSelectedLineBasemapCoverSnapshot();
  displayZoom.value = camera.value.zoom;
  renderer.resize(camera.value.viewportWidthCssPx, camera.value.viewportHeightCssPx, pixelRatio);
  draw();
}

function resetView(): void {
  if (!network.value) return;
  cancelCameraAnimation();
  focusedEntranceId.value = undefined;
  applyCamera(
    fitCameraToBounds(
      camera.value,
      dataSource.getManifest().bounds,
      GLOBAL_TRANSPORT_PLAN_CONFIG.initialView.paddingCssPx,
      GLOBAL_TRANSPORT_PLAN_CONFIG.initialView.minZoom,
      GLOBAL_TRANSPORT_PLAN_CONFIG.initialView.maxZoom,
    ),
  );
  captureSelectedLineBasemapCoverSnapshot();
}

async function shareViewport(): Promise<void> {
  if (typeof window === "undefined") return;

  const encodedViewport = encodeSharedViewport(camera.value);
  sharedViewportSignature = encodedViewport;
  const query = {
    ...route.query,
    [SHARED_VIEWPORT_QUERY_KEY]: encodedViewport,
  } as Record<string, string | undefined>;
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set(SHARED_VIEWPORT_QUERY_KEY, encodedViewport);
  await router.replace({ query });

  let nativeShareCompleted = false;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: t("globalMap.page.shareTitle"),
        url: shareUrl.toString(),
      });
      nativeShareCompleted = true;
    } catch (error) {
      // Closing the native share sheet is an intentional cancellation, not a
      // failed copy. Other native-share errors fall back to the clipboard.
      if (isAbortError(error)) return;
    }
  }

  if (!nativeShareCompleted) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl.toString());
    } catch {
      shareFeedback.value = t("globalMap.page.shareFailed");
      return;
    }
  }

  shareFeedback.value = t("globalMap.page.shareSuccess");
}

function focusEntrance(entrance: GlobalMapEntrance): void {
  if (!Number.isFinite(entrance.worldX) || !Number.isFinite(entrance.worldY)) return;
  cancelCameraAnimation();
  focusedEntranceId.value = entrance.id;
  applyCamera(
    updateCamera(camera.value, {
      centerWorldX: entrance.worldX,
      centerWorldY: entrance.worldY,
      zoom: Math.max(GLOBAL_TRANSPORT_PLAN_CONFIG.selection.entranceZoom, camera.value.zoom),
    }),
    false,
  );
}

function zoomToLine(lineId: string, animate = false): void {
  const line = network.value?.linesById.get(lineId);
  const points =
    line?.stationIds
      .map((id) => network.value?.stationsById.get(id))
      .filter((station): station is GlobalMapStation => Boolean(station)) ?? [];
  if (!points.length) return;
  const bounds = {
    minX: Math.min(...points.map((point) => point.worldX)),
    minY: Math.min(...points.map((point) => point.worldY)),
    maxX: Math.max(...points.map((point) => point.worldX)),
    maxY: Math.max(...points.map((point) => point.worldY)),
  };

  const targetCamera = fitCameraToBounds(
    camera.value,
    bounds,
    GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.paddingCssPx,
    GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.minZoom,
    GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.maxZoom,
  );
  if (animate && interactionController) {
    cancelCameraAnimation();
    captureSelectedLineBasemapCoverSnapshot();
    interactionController.animateCameraToTarget(
      {
        centerWorldX: targetCamera.centerWorldX,
        centerWorldY: targetCamera.centerWorldY,
        zoom: targetCamera.zoom,
      },
      () => captureSelectedLineBasemapCoverSnapshot(),
    );
    return;
  }

  cancelCameraAnimation();
  applyCamera(targetCamera);
  captureSelectedLineBasemapCoverSnapshot();
}

function toggleGlobalTrafficCalendar(): void {
  if (trafficCalendarOpen.value) {
    closeTrafficCalendar();
    draw();
    return;
  }
  if (trafficCalendarEventCount.value === 0) return;
  toggleTrafficCalendar();
  draw();
}

async function selectGlobalTrafficCalendarDay(day: PatternTrafficCalendarDay): Promise<void> {
  await selectGlobalTrafficCalendarDaySelection(day);
  draw();
}

async function resetGlobalTrafficCalendarToday(): Promise<void> {
  await resetGlobalTrafficCalendarTodaySelection();
  draw();
}

function focusGlobalTrafficDisruption(entry: PatternTrafficSummaryEntry): void {
  const disruptionIds = new Set(entry.disruptionIds);
  const stationIds = new Set<string>();

  trafficCalendarEvents.value.forEach((event) => {
    if (!disruptionIds.has(event.disruption.id)) return;
    event.interruptedStationKeys.forEach((stationId) => stationIds.add(stationId));
    event.disturbedStationKeys.forEach((stationId) => stationIds.add(stationId));
    event.fallbackStationKeys.forEach((stationId) => stationIds.add(stationId));
    event.affectedEdgeKeys.forEach((edgeKey) => {
      edgeKey.split("--").forEach((stationId) => {
        if (stationId) stationIds.add(stationId);
      });
    });
  });

  const points = [...stationIds]
    .map((stationId) => network.value?.stationsById.get(stationId))
    .filter((station): station is GlobalMapStation => Boolean(station));
  if (points.length === 0) return;

  applyCamera(
    fitCameraToBounds(
      camera.value,
      {
        minX: Math.min(...points.map((point) => point.worldX)),
        minY: Math.min(...points.map((point) => point.worldY)),
        maxX: Math.max(...points.map((point) => point.worldX)),
        maxY: Math.max(...points.map((point) => point.worldY)),
      },
      GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.paddingCssPx,
      GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.minZoom,
      GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.maxZoom,
    ),
  );
  captureSelectedLineBasemapCoverSnapshot();
}

async function selectStationFromSearch(station: GlobalMapStationSearchGroup): Promise<void> {
  selectedSearchPlace.value = undefined;
  await ensureSearchCatalog();
  const currentStation = network.value?.stationsById.get(station.id);
  if (!currentStation) return;
  // A search result is an explicit request to leave the current line/family
  // focus. Otherwise the previous mode mask can hide the station immediately
  // after the camera has been centered on it (notably for Bus-only results).
  filters.setAllIncludingBus();
  resetLeftControlsToPresetView();
  selectStation(currentStation.id, undefined, station, false);
  animateCameraToStation(currentStation);
  await loadStationConnections(currentStation, station);
  await refreshViewport();
}

function selectPlaceFromSearch(place: GeocoderPoint): void {
  if (
    !Number.isFinite(place.lon) ||
    !Number.isFinite(place.lat) ||
    place.lon < -180 ||
    place.lon > 180 ||
    place.lat < -90 ||
    place.lat > 90
  ) {
    return;
  }

  selectedSearchPlace.value = place;
  const world = lonLatToWorld(place);
  animateCameraToStation({ worldX: world.x, worldY: world.y });
}

function selectMarkerFromSearch(marker: GlobalMapMarker): void {
  selectedSearchPlace.value = undefined;
  if (!Number.isFinite(marker.lon) || !Number.isFinite(marker.lat)) return;
  const world = lonLatToWorld(marker);
  animateCameraToStation({ worldX: world.x, worldY: world.y });
}

function mapPointFromPointerEvent(event: Pick<PointerEvent, "clientX" | "clientY">): LonLatPoint | undefined {
  const rect = canvasElement.value?.getBoundingClientRect();
  if (!rect) return undefined;

  try {
    return screenToLonLat(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      camera.value,
    );
  } catch {
    return undefined;
  }
}

function startContextDistanceMeasurement(): void {
  const point = contextPoint.value;
  if (!point) return;

  const start = { lon: point.lon, lat: point.lat };
  globalMapDistanceStart.value = start;
  globalMapDistanceEnd.value = start;
  globalMapDistanceMeasurementMode.value = "measuring";
  measurementCompletionPointerId = undefined;
  closeGlobalContextMenu();
}

function updateGlobalMapDistanceMeasurement(event: PointerEvent): void {
  if (globalMapDistanceMeasurementMode.value !== "measuring") return;
  const point = mapPointFromPointerEvent(event);
  if (point) globalMapDistanceEnd.value = point;
}

function clearGlobalMapDistanceMeasurement(): void {
  globalMapDistanceMeasurementMode.value = "idle";
  globalMapDistanceStart.value = undefined;
  globalMapDistanceEnd.value = undefined;
  measurementCompletionPointerId = undefined;
}

function showGlobalMapContextFeedback(message: string): void {
  globalMapContextFeedback.value = message;
  if (globalMapContextFeedbackTimer !== undefined) window.clearTimeout(globalMapContextFeedbackTimer);
  globalMapContextFeedbackTimer = window.setTimeout(() => {
    globalMapContextFeedback.value = "";
    globalMapContextFeedbackTimer = undefined;
  }, 3_500);
}

function isCoordinateOnlyLabel(value?: string): boolean {
  const parts = value?.trim().split(",").map((part) => Number(part.trim()));
  return parts?.length === 2
    && parts.every((part) => Number.isFinite(part))
    && Math.abs(parts[0]!) <= 90
    && Math.abs(parts[1]!) <= 180;
}

async function resolveContextAddress(
  point: GeocoderPoint,
  marker?: GlobalMapMarker,
  place?: GeocoderPoint,
): Promise<string | undefined> {
  const markerAddress = marker?.address?.trim();
  if (markerAddress) return markerAddress;

  try {
    const reverseResult = globalMapGeocoder.reverseGeocode
      ? (await globalMapGeocoder.reverseGeocode({ lon: point.lon, lat: point.lat }))[0]
      : undefined;
    const reverseLabel = reverseResult?.label?.trim();
    if (reverseLabel && !isCoordinateOnlyLabel(reverseLabel)) return reverseLabel;
  } catch {
    // A known place label remains a useful fallback if reverse geocoding is
    // temporarily unavailable.
  }

  const fallback = place?.label?.trim() || point.label?.trim();
  return fallback && !isCoordinateOnlyLabel(fallback) ? fallback : undefined;
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.("copy") ?? false;
  textarea.remove();
  if (!copied) throw new Error("clipboard-unavailable");
}

async function copyContextAddress(): Promise<void> {
  const point = contextPoint.value;
  if (!point) return;
  const marker = contextMarker.value;
  const place = contextPlace.value;
  closeGlobalContextMenu();

  const address = await resolveContextAddress(point, marker, place);
  if (!address) {
    showGlobalMapContextFeedback(t("globalMap.contextMenu.copyAddressUnavailable"));
    return;
  }

  try {
    await copyTextToClipboard(address);
    showGlobalMapContextFeedback(t("globalMap.contextMenu.addressCopied"));
  } catch {
    showGlobalMapContextFeedback(t("globalMap.contextMenu.copyAddressFailed"));
  }
}

function openGlobalContextMenu(
  point: { x: number; y: number },
  target: GeocoderPoint,
  marker?: GlobalMapMarker,
  place?: GeocoderPoint,
): void {
  contextPoint.value = target;
  contextMarker.value = marker;
  contextPlace.value = place;
  globalContextMenuPoint.value = point;
  globalContextMenuOpen.value = true;
}

function handleMapContextMenu(point: { x: number; y: number }, event: MouseEvent): void {
  try {
    const coordinates = screenToLonLat(point, camera.value);
    // ContextMenu is fixed to the viewport. Use the native client coordinates
    // for its anchor instead of reconstructing them from the canvas rect; the
    // latter can still be stale during the first layout frame.
    openGlobalContextMenu({ x: event.clientX, y: event.clientY }, {
      lon: coordinates.lon,
      lat: coordinates.lat,
      label: `${coordinates.lat.toFixed(5)}, ${coordinates.lon.toFixed(5)}`,
      provider: "global-map",
      type: "unknown",
    });
  } catch {
    // Ignore synthetic or stale events while the map is being resized.
  }
}

function openMarkerContextMenu(marker: GlobalMapMarker, event: MouseEvent): void {
  openGlobalContextMenu(
    { x: event.clientX, y: event.clientY },
    {
      id: marker.id,
      lon: marker.lon,
      lat: marker.lat,
      label: marker.address ? `${marker.name}, ${marker.address}` : marker.name,
      provider: "global-map-marker",
      type: "place",
    },
    marker,
  );
}

function openPlaceContextMenu(place: GeocoderPoint, event: MouseEvent): void {
  openGlobalContextMenu(
    { x: event.clientX, y: event.clientY },
    place,
    undefined,
    place,
  );
}

function closeGlobalContextMenu(): void {
  globalContextMenuOpen.value = false;
  globalContextMenuPoint.value = undefined;
  contextPoint.value = undefined;
  contextMarker.value = undefined;
  contextPlace.value = undefined;
}

function openAddressBookFromContext(): void {
  closeGlobalContextMenu();
  openAddressBook();
}

function addContextMarker(): void {
  const point = contextPoint.value;
  if (!point) return;
  markerModalInitial.value = {
    lon: point.lon,
    lat: point.lat,
    name: contextPlace.value?.label ?? t("globalMap.markers.defaultName"),
    ...(contextPlace.value?.label ? { address: contextPlace.value.label } : {}),
    icon: "pin",
  };
  closeGlobalContextMenu();
  markerModalOpen.value = true;
}

function editContextMarker(): void {
  const marker = contextMarker.value;
  if (!marker) return;
  markerModalInitial.value = { ...marker };
  closeGlobalContextMenu();
  markerModalOpen.value = true;
}

function hideContextMarker(): void {
  const marker = contextMarker.value;
  if (!marker) return;
  closeGlobalContextMenu();
  globalMapMarkers.updateMarker({ ...marker, isHidden: true });
}

function deleteContextMarker(): void {
  editContextMarker();
}

function closeMarkerModal(): void {
  markerModalOpen.value = false;
  markerModalInitial.value = undefined;
}

function saveMarker(marker: GlobalMapMarker): void {
  if (marker.id) {
    globalMapMarkers.updateMarker(marker);
  } else {
    const { id: _id, ...draft } = marker;
    globalMapMarkers.addMarker(draft);
  }
  closeMarkerModal();
}

function removeMarker(id: string): void {
  globalMapMarkers.removeMarker(id);
  closeMarkerModal();
}

function openContextNeighborhoodPlan(): void {
  const point = contextPoint.value;
  if (!point || typeof window === "undefined") return;
  const address = point.label?.trim() || `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
  const params = new URLSearchParams({
    address,
    lat: String(point.lat),
    lon: String(point.lon),
  });
  closeGlobalContextMenu();
  window.open(`/nearby-stations?${params.toString()}`, "_blank", "noopener,noreferrer");
}

function openContextItinerary(): void {
  const point = contextPoint.value;
  if (!point) return;
  const destination = { ...point, label: point.label ?? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}` };
  closeGlobalContextMenu();
  void globalItinerary.openTo(destination);
}

async function selectLineFromSearch(
  line: GlobalMapLine,
  trafficDisruption?: TrafficDisruption,
  animateCamera = false,
): Promise<void> {
  if (extremeChaosGuardActive.value) return;
  cancelCameraAnimation();
  selectedLineInteractionScene.value = undefined;
  closeTrafficCalendar();
  resetTrafficCalendarSelection();
  const previousLineId = selection.activeLineId.value;
  clearPreloadedLineGeometry();
  const currentLine = network.value?.linesById.get(line.id);
  if (!currentLine) return;
  if (!filters.selectedModes.value.includes(currentLine.mode)) filters.toggle(currentLine.mode);
  resetBusDirectionState();
  activeStationGroup.value = undefined;
  focusedEntranceId.value = undefined;
  connectedStationIds.value = [];
  sidebarPreviewLineId.value = undefined;
  activeTrafficDisruption.value = trafficDisruption;
  // Publish the target before starting the optional preload. The scene can
  // render the new line immediately and accept its decoded geometry while the
  // camera flight is still running.
  selection.selectLine(currentLine.id);
  selection.activeStationId.value = undefined;
  if (animateCamera && previousLineId !== currentLine.id) {
    // Start decoding the complete target line before the camera flight. The
    // scene will pick it up as soon as the chunks are ready, even when the
    // target is still outside the current viewport.
    preloadLineGeometry(currentLine.id);
  }
  if (!traffic.enabled.value) enableTraffic();
  zoomToLine(currentLine.id, animateCamera);
  syncUrl();
  draw();
}

function selectLineFromSearchResult(line: GlobalMapLine): void {
  void selectLineFromSearch(line, undefined, true);
}

function openLineSelector(): void {
  if (!activeLineSearchOption.value || !activeLineFamily.value) return;
  lineSelectorOpen.value = true;
}

async function selectLineFromModal(line: LineSearchOption): Promise<void> {
  await ensureSearchCatalog();
  const selectedIds = new Set(
    [line.navitiaId, line.id, line.ref].filter((id): id is string => Boolean(id)),
  );
  const selectedLine = network.value?.lines.find(
    (candidate) =>
      selectedIds.has(candidate.id) ||
      (candidate.sourceLineId ? selectedIds.has(candidate.sourceLineId) : false),
  );

  if (!selectedLine) {
    // StationBoardModal emits close right after select-line. Reopen it on the
    // next turn when the static global catalogue cannot represent the choice.
    lineSelectorOpen.value = true;
    return;
  }

  lineSelectorOpen.value = false;
  await selectLineFromSearch(selectedLine);
}

function viewActiveLineSchema(): void {
  const line = activeLine.value;
  const family = line ? globalMapLineFamily(line.mode) : undefined;
  if (!line || !family) return;

  void router.push({
    path: `/line/${encodeURIComponent(lineFamilyToTransportType(family))}/${encodeURIComponent(line.id)}`,
  });
}

function selectStation(
  stationId: string,
  event?: MouseEvent,
  stationGroup?: GlobalMapStationSearchGroup,
  loadConnections = true,
  preserveActiveLine = false,
): void {
  cancelCameraAnimation();
  closeTrafficCalendar();
  resetTrafficCalendarSelection();
  activeTrafficDisruption.value = undefined;
  activeStationGroup.value = stationGroup;
  focusedEntranceId.value = undefined;
  // A station click should expose the local interchange context and Bus family.
  // Noctilien remains opt-in so selecting a station cannot enable it silently.
  // A focused line still constrains the base geometry; extra modes are
  // rendered only through exact ghost lines.
  filters.setAllIncludingBus();
  selection.selectStation(
    stationId,
    event?.metaKey || event?.ctrlKey ? "append" : event?.shiftKey ? "toggle" : "replace",
  );
  if (!preserveActiveLine) {
    resetBusDirectionState();
    selection.selectLine(undefined);
    disableTraffic();
  }
  sidebarPreviewLineId.value = undefined;
  connectedStationIds.value = [];
  syncUrl();
  draw();
  if (loadConnections) {
    const station = network.value?.stationsById.get(stationId);
    if (station) void loadStationConnections(station, stationGroup);
  }
}

async function loadStationConnections(
  station: GlobalMapStation,
  stationGroup?: GlobalMapStationSearchGroup,
  preloadAttempt = 0,
): Promise<void> {
  stationConnectionRequestsPending.value += 1;
  try {
    const results = await dataSource.queryStationsWithinRadius(
      station.lon,
      station.lat,
      GLOBAL_TRANSPORT_PLAN_CONFIG.connections.radiusMeters,
    );
    if (selection.activeStationId.value !== station.id) return;
    network.value = dataSource.getNetwork();
    const memberIds = new Set(stationGroup?.memberStationIds ?? [station.id]);
    const anchorStations = [...memberIds]
      .map((stationId) => network.value?.stationsById.get(stationId))
      .filter((candidate): candidate is GlobalMapStation => Boolean(candidate));
    if (!anchorStations.some((candidate) => candidate.id === station.id)) anchorStations.push(station);
    const correspondence = buildStationCorrespondenceContext(
      anchorStations,
      results,
      network.value?.linesById ?? new Map(),
    );
    // Do not publish the nearby station IDs until their exact correspondence
    // geometry is decoded. Publishing first makes ghostLinePaths temporarily
    // select the compact regional GTFS pack; a wheel event during that window
    // then freezes the coarse trace for the whole gesture (notably line 27
    // drawing a chord across the Seine instead of following Pont du Carrousel).
    const selectedModes = new Set(filters.selectedModes.value);
    const connectionLineIds = correspondence.lines
      .filter((line) => selectedModes.has(line.mode))
      .map((line) => line.id);
    const geometryReady = await refreshViewport(connectionLineIds);
    if (selection.activeStationId.value !== station.id) return;
    if (!geometryReady) {
      // A camera generation can supersede this request when the user starts
      // scrolling immediately. Keep the correspondence unpublished and retry
      // after the current frame instead of exposing the regional LOD, even for
      // a single paint. The decoded chunks stay cached, so retries are cheap.
      if (preloadAttempt < 5) {
        window.setTimeout(
          () => {
            if (selection.activeStationId.value === station.id) {
              void loadStationConnections(station, stationGroup, preloadAttempt + 1);
            }
          },
          interactionActive.value ? 180 : 60,
        );
      }
      return;
    }
    connectedStationIds.value = correspondence.stationIds;
    draw();
  } catch {
    // Never fall back to publishing correspondences whose only available
    // geometry may be the regional LOD. A later retry can still reveal every
    // line once its exact GTFS chunks are available.
    if (preloadAttempt < 5) {
      window.setTimeout(
        () => {
          if (selection.activeStationId.value === station.id) {
            void loadStationConnections(station, stationGroup, preloadAttempt + 1);
          }
        },
        180,
      );
    }
  } finally {
    stationConnectionRequestsPending.value = Math.max(
      0,
      stationConnectionRequestsPending.value - 1,
    );
  }
}

function selectStationForDashboard(stationId: string): void {
  selection.selectStation(stationId, "append");
  syncUrl();
  draw();
}

function clearSelection(): void {
  cancelCameraAnimation();
  clearPreloadedLineGeometry();
  invalidatePendingViewportRequests();
  closeTrafficCalendar();
  resetTrafficCalendarSelection();
  disableTraffic();
  resetBusDirectionState();
  selection.clear();
  activeStationGroup.value = undefined;
  focusedEntranceId.value = undefined;
  resetLeftControlsToPresetView();
  sidebarPreviewLineId.value = undefined;
  connectedStationIds.value = [];
  selectedLineInteractionScene.value = undefined;
  syncUrl();
  draw();
  if (mounted && network.value) void refreshViewport().catch(() => undefined);
}

function selectFeature(feature: TransportMapHitCandidates, event?: MouseEvent): void {
  if (extremeChaosGuardActive.value) return;
  if (feature.station) {
    globalTransportHover.clearLineChoiceState();
    selectStation(feature.station.id, event, undefined, true, true);
    return;
  }

  if (feature.lines.length === 1) {
    globalTransportHover.clearLineChoiceState();
    const candidate = feature.lines[0]!;
    const line = network.value?.linesById.get(candidate.id);
    if (!line) return;
    const disruption = resolveCandidateTrafficDisruption(candidate);
    if (line.id === activeLine.value?.id) {
      activeTrafficDisruption.value = disruption;
      draw();
      return;
    }
    void selectLineFromSearch(line, disruption);
    return;
  }

  if (feature.lines.length > 1) {
    activeTrafficDisruption.value = undefined;
    globalTransportHover.openLineChoice(feature.lines, event);
  }
}

function selectPreset(preset: GlobalTransportPlanPreset): void {
  if (preset === "ALL") {
    globalRadarPreset.value = undefined;
    filters.setAllVisible();
    return;
  }
  if (!availableModes.value.includes(preset)) return;
  globalRadarPreset.value = preset;
  filters.selectedModes.value = [preset];
}

function requestPresetInstall(mode: GlobalMapMode): void {
  if (mode === "BIKE") bikeInstallModalOpen.value = true;
}

function openCustomization(): void {
  leftControlsTransitionName.value = "global-map-controls-slide-forward";
  leftControlsView.value = "customization";
  linePanelMode.value = undefined;
}

function openLinePanel(mode: GlobalMapMode): void {
  if (!availableModes.value.includes(mode)) return;
  leftControlsTransitionName.value = "global-map-controls-slide-forward";
  linePanelMode.value = mode;
  leftControlsView.value = "lines";
}

function resetLeftControlsToPresetView(): void {
  leftControlsView.value = "presets";
  linePanelMode.value = undefined;
}

function returnToModeList(): void {
  leftControlsTransitionName.value = "global-map-controls-slide-back";
  resetLeftControlsToPresetView();
}

function finishCustomization(): void {
  returnToModeList();
}

function setGlobalSelectedModes(modes: GlobalMapMode[]): void {
  globalRadarPreset.value = undefined;
  const available = new Set(availableModes.value);
  const selected = new Set(modes);
  filters.selectedModes.value = GLOBAL_MAP_MODE_ORDER.filter(
    (mode) => available.has(mode) && selected.has(mode),
  );
  if (linePanelMode.value && !filters.selectedModes.value.includes(linePanelMode.value)) {
    returnToModeList();
  }
}

function selectLineFromPanel(lineId: string): void {
  const line = network.value?.linesById.get(lineId);
  if (!line) return;
  void selectLineFromSearch(line, undefined, true);
}

function selectLineById(lineId: string): void {
  const line = network.value?.linesById.get(lineId);
  if (!line) return;
  void selectLineFromSearch(line);
}

function captureSelectedLineInteractionSceneIfReady(): boolean {
  if (
    routePreviewActive.value ||
    !activeLine.value ||
    selectedLineInteractionScene.value ||
    !selectedLineInteractionSceneHighFidelity.value
  ) {
    return false;
  }
  selectedLineInteractionScene.value = {
    ...liveRenderScene.value,
    interactionActive: true,
  };
  return true;
}

function clampZoom(zoom: number): number {
  return Math.max(
    GLOBAL_TRANSPORT_PLAN_CONFIG.camera.minZoom,
    Math.min(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom, zoom),
  );
}

interactionController = useGlobalTransportMapInteraction({
  isMounted: () => mounted,
  getCanvas: () => canvasElement.value,
  getCamera: () => camera.value,
  applyCamera,
  draw,
  drawNow,
  cancelQueuedDraw: () => {
    if (drawFrame === undefined) return;
    cancelAnimationFrame(drawFrame);
    drawFrame = undefined;
  },
  setInteractionActive: (active) => {
    setMapInteractionActive(active);
  },
  isInteractionActive: () => interactionActive.value,
  setDisplayZoom: (zoom) => {
    displayZoom.value = zoom;
  },
  setWheelScrolling: (scrolling) => {
    wheelScrolling.value = scrolling;
  },
  isLineChoiceOpen: () => globalTransportHover.lineChoiceOpen.value,
  shouldClearHoverOnWheel: globalTransportHover.shouldClearOnWheel,
  closeLineChoice: globalTransportHover.closeLineChoice,
  clearHover: globalTransportHover.clear,
  updateHovered: globalTransportHover.update,
  hitAt: globalTransportHover.hitTest,
  selectFeature,
  scheduleViewportRefresh,
  cancelScheduledViewportRefresh,
  captureSelectedLineInteractionSceneIfReady,
  isSelectedLineCoverEnabled: () => selectedLineCoverEnabled.value,
  beginSelectedLineBasemapGestureSurface,
  applySelectedLineWheelCamera,
  releaseSelectedLineBasemapGestureSurface,
  clearSelectedLineInteractionScene: () => {
    selectedLineInteractionScene.value = undefined;
  },
  setBasemapTileRefreshCamera,
  captureSelectedLineBasemapCoverSnapshot,
  getGhostLineRefreshPending: () => ghostLineRefreshPending,
  setGhostLineRefreshPending: (pending) => {
    ghostLineRefreshPending = pending;
  },
  getActiveLineId: () => activeLine.value?.id,
  onReset: resetView,
  onSelect: globalTransportHover.selectHoveredFeature,
  onEscape: () => {
    // Escape closes an open candidate picker without touching the pinned
    // station/line. Outside of that transient state, preserve map Escape.
    if (globalTransportHover.lineChoiceOpen.value) {
      globalTransportHover.clear();
      return;
    }
    clearSelection();
    globalTransportHover.clear();
  },
  onFocusNext: globalTransportHover.focusFeature,
  onContextMenu: handleMapContextMenu,
  getReduceMotion: () =>
    appSettings.value.reduceMotion ||
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
});

const mapOnPointerDown = interactionController.onPointerDown;
const mapOnPointerMove = interactionController.onPointerMove;
const mapOnPointerUp = interactionController.onPointerUp;
const mapOnPointerCancel = interactionController.onPointerCancel;
const onLostPointerCapture = interactionController.onLostPointerCapture;
const onWheel = interactionController.onWheel;
const onContextMenu = interactionController.onContextMenu;
const onKeydown = interactionController.onKeydown;
const cancelInertia = interactionController.cancelInertia;
const cancelWheelZoom = interactionController.cancelWheelZoom;
const cancelCameraAnimationImpl = interactionController.cancelCameraAnimation;
const isMapInteractionScrolling = interactionController.isScrolling;

function cancelCameraAnimation(): void {
  cancelCameraAnimationImpl();
  endItineraryFitTrace({ cancelled: true });
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.button === undefined || event.button === 0;
}

function onPointerDown(event: PointerEvent): void {
  if (globalMapDistanceMeasurementMode.value === "measuring" && isPrimaryPointer(event)) {
    const point = mapPointFromPointerEvent(event);
    if (point) {
      globalMapDistanceEnd.value = point;
      globalMapDistanceMeasurementMode.value = "complete";
      measurementCompletionPointerId = event.pointerId;
      event.preventDefault();
      return;
    }
  }
  mapOnPointerDown(event);
}

function onPointerMove(event: PointerEvent): void {
  if (globalMapDistanceMeasurementMode.value === "measuring") {
    updateGlobalMapDistanceMeasurement(event);
    return;
  }
  mapOnPointerMove(event);
}

function onPointerUp(event: PointerEvent): void {
  if (measurementCompletionPointerId === event.pointerId) {
    measurementCompletionPointerId = undefined;
    event.preventDefault();
    return;
  }
  if (globalMapDistanceMeasurementMode.value === "measuring") {
    event.preventDefault();
    return;
  }
  mapOnPointerUp(event);
}

function onPointerCancel(event: PointerEvent): void {
  if (measurementCompletionPointerId === event.pointerId) {
    measurementCompletionPointerId = undefined;
    event.preventDefault();
    return;
  }
  if (globalMapDistanceMeasurementMode.value === "measuring") {
    event.preventDefault();
    return;
  }
  mapOnPointerCancel(event);
}

const globalTransportRouteState = useGlobalTransportRouteState({
  getQuery: () => route.query,
  router,
  isMounted: () => mounted,
  getCamera: () => camera.value,
  applyCamera,
  captureSelectedLineBasemapCoverSnapshot: () => captureSelectedLineBasemapCoverSnapshot(),
  getSharedViewportSignature: () => sharedViewportSignature,
  setSharedViewportSignature: (signature) => {
    sharedViewportSignature = signature;
  },
  getSelection: () => ({
    activeStationId: selection.activeStationId.value,
    activeLineId: selection.activeLineId.value,
  }),
  getActiveLine: () => activeLine.value,
  getDirectionState: () => ({
    filterRequested: directionFilterRequested.value,
    selectedDirectionId: busDirectionSelection.value?.selectedDirectionId,
    mergeEnabled: directionMergeEnabled.value,
    ready: directionStateReady.value,
  }),
  getNetwork: () => network.value,
  supportsLineDirections,
  defaultDirectionMerge: (mode) => defaultGlobalDirectionMerge(mode),
  ensureSearchCatalog,
  selectLineFromSearch,
  getStation: (stationId) => dataSource.getStation(stationId),
  refreshNetwork: () => {
    network.value = dataSource.getNetwork();
  },
  selectStation,
  loadStationConnections: (station) => loadStationConnections(station),
  refreshViewport,
  resolveDebugLine: (lines, query) => resolveDebugLine(lines, query),
  getDebugLineQuery: () => debugLineQuery.value,
  ensureModeVisible: (mode) => {
    if (!filters.selectedModes.value.includes(mode)) filters.toggle(mode);
  },
  resetDirections: resetBusDirectionState,
  selectLine: (lineId) => selection.selectLine(lineId),
  clearActiveStation: () => {
    selection.activeStationId.value = undefined;
  },
  clearActiveStationGroup: () => {
    activeStationGroup.value = undefined;
  },
  clearConnectedStations: () => {
    connectedStationIds.value = [];
  },
  getStationById: (stationId) => network.value?.stationsById.get(stationId),
  zoomToLine,
  hasDebugWithZoom: () => hasQueryFlag(route.query.debugWithZoom),
});

function syncUrl(): void {
  globalTransportRouteState.syncUrl();
}

function restoreSharedViewportFromUrl(): boolean {
  return globalTransportRouteState.restoreSharedViewportFromUrl();
}

async function restoreSelectionFromUrl(): Promise<void> {
  await globalTransportRouteState.restoreSelectionFromUrl();
}

async function restoreDebugLineFromUrl(): Promise<void> {
  await globalTransportRouteState.restoreDebugLineFromUrl();
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
    : Array.isArray(value) && typeof value[0] === "string"
      ? value[0]
      : undefined;
}

function hasQueryFlag(value: unknown): boolean {
  const normalized = queryString(value)?.trim().toLowerCase();
  return normalized === "" || normalized === "1" || normalized === "true";
}

async function retry(): Promise<void> {
  errorMessage.value = "";
  if (!network.value) {
    try {
      network.value = await dataSource.initialize();
      availableModes.value = dataSource.getManifest().modes;
      globalTravelAllowedModes.value = [...availableModes.value];
      searchCatalogReady.value = dataSource.metrics().catalogLoaded;
      setDefaultModes();
    } catch (error) {
      if (isAbortError(error)) return;
      errorMessage.value = error instanceof Error ? error.message : "Erreur de chargement";
      return;
    }
  }
  await refreshViewport();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

watch(
  filters.selectedModes,
  () => {
    draw();
    scheduleViewportRefresh();
  },
  { deep: true },
);
watch(globalMapIsochrones.surfaces, (surfaces) => {
  const feature = hoveredFeature.value;
  if (feature?.type === "isochrone") {
    const surfaceIds = new Set(surfaces.map((surface) => surface.id));
    if (!feature.surfaces.every((surface) => surfaceIds.has(surface.id))) {
      globalTransportHover.clear();
      return;
    }
  }
  draw();
});
watch(
  () => ghostLineIds.value.slice().sort().join("\u0000"),
  (lineKey, previousLineKey) => {
    if (lineKey === previousLineKey) return;
    // Station correspondences hydrate progressively. The selected-line query
    // is keyed by the forced ghost-line set, so a result requested for the
    // first partial set cannot be reused once more lines are discovered.
    // Refresh immediately while idle so URL restoration cannot consume the
    // debounce slot with an older forced-line set. During a gesture, remember
    // the invalidation and publish it only after the immutable interaction
    // scene has settled.
    if (interactionActive.value) {
      ghostLineRefreshPending = true;
      return;
    }
    void refreshViewport();
  },
  { flush: "post" },
);
watch(
  () => activeLine.value?.id,
  (lineId, previousLineId) => {
    if (lineId !== previousLineId) {
      closeTrafficCalendar();
      resetTrafficCalendarSelection();
    }
    refreshLineIfStale(lineId ?? "", previousLineId);

    const line = activeLine.value;
    if (!lineId || !supportsLineDirections(line)) {
      resetBusDirectionState();
      return;
    }

    const requestedDirectionId =
      queryString(route.query.line) === lineId ? queryString(route.query.direction) : undefined;
    void loadBusDirection(lineId, requestedDirectionId);
  },
);
watch(
  [
    selection.activeLineId,
    selection.activeStationId,
    () => filters.selectedModes.value.slice().sort().join("\u0000"),
  ],
  () => ensureExtremeFullNetworkState(),
  { flush: "post" },
);
watch(
  [
    () => activeLine.value?.id,
    selectedLineCoverGeometryKey,
    () => camera.value.viewportWidthCssPx,
    () => camera.value.viewportHeightCssPx,
    () => camera.value.pixelRatio,
  ],
  () => {
    // Geometry, line identity, viewport dimensions and device density are
    // explicit cover-context changes. Center/zoom/generation are intentionally
    // absent so a wheel gesture cannot rebuild this fixed-source mosaic.
    captureSelectedLineBasemapCoverSnapshot();
  },
  { flush: "post", immediate: true },
);
watch(
  [
    () => globalItinerary.open.value,
    () => routePreviewActive.value,
    () => globalSelectedTravelRoute.value?.id,
    () => globalItinerary.origin.value?.lon,
    () => globalItinerary.origin.value?.lat,
    () => globalItinerary.travelRoutes.destination.value?.lon,
    () => globalItinerary.travelRoutes.destination.value?.lat,
    () => camera.value.viewportWidthCssPx,
    () => camera.value.viewportHeightCssPx,
  ],
  () => {
    if (!globalItinerary.open.value) {
      globalItineraryFitKey = undefined;
      draw();
      scheduleViewportRefresh();
      return;
    }
    void nextTick(() => {
      fitGlobalItineraryToRoute();
      draw();
      if (!routePreviewActive.value) scheduleViewportRefresh();
    });
  },
  { flush: "post", immediate: true },
);
const performanceScenarios = useGlobalTransportPerformanceScenarios({
  getConfig: () => globalTransportPerformanceScenarioConfig.config.value,
  performance: {
    controller: globalTransportPerformance,
    getCacheMetrics: () => dataSource.metrics().cache.cache,
  },
  preparation: {
    ensureSearchCatalog,
    resolveLine14: () => {
      const lines = network.value?.lines ?? [];
      return (
        network.value?.linesById.get("line:IDFM:C01384") ??
        lines.find(
          (line) =>
            line.mode === "METRO" &&
            (line.code?.trim() === "14" || line.label?.trim() === "14"),
        )
      );
    },
    cancelInteractions: () => {
      cancelInertia();
      cancelCameraAnimation();
      cancelWheelZoom();
      cancelScheduledViewportRefresh();
    },
    ensureModeVisible: (mode) => {
      if (!filters.selectedModes.value.includes(mode)) filters.toggle(mode);
    },
    resetTransientState: () => {
      resetLeftControlsToPresetView();
      activeStationGroup.value = undefined;
      focusedEntranceId.value = undefined;
      connectedStationIds.value = [];
      activeTrafficDisruption.value = undefined;
      resetBusDirectionState();
    },
    selectLine: (lineId) => selection.selectLine(lineId),
    clearActiveStation: () => {
      selection.activeStationId.value = undefined;
    },
    zoomToLine,
    syncUrl,
    draw,
    refreshViewport: async () => {
      await refreshViewport();
    },
    cancelScheduledViewportRefresh,
    ensureExtremeFullNetworkState,
    prepareExtremeState: async () => {
      extremeChaosState = {
        camera: { ...camera.value },
        modes: [...filters.selectedModes.value],
        activeLineId: selection.activeLineId.value,
        activeStationId: selection.activeStationId.value,
        selectedStationIds: [...selection.selectedStationIds.value],
        trafficEnabled: traffic.enabled.value,
        directionId: busDirectionSelection.value?.selectedDirectionId,
        directionsMerged: directionMergeEnabled.value,
      };
      selection.clear();
      resetLeftControlsToPresetView();
      activeStationGroup.value = undefined;
      focusedEntranceId.value = undefined;
      connectedStationIds.value = [];
      activeTrafficDisruption.value = undefined;
      selectedLineInteractionScene.value = undefined;
      sidebarPreviewLineId.value = undefined;
      resetBusDirectionState();
      filters.selectedModes.value = [...availableModes.value];
      if (traffic.enabled.value) disableTraffic();
      syncUrl();
      await refreshViewport();
      cancelScheduledViewportRefresh();
      extremeChaosGuardActive.value = true;
      return {
        availableModes: [...availableModes.value],
        activeModes: [...filters.selectedModes.value],
      };
    },
    restoreExtremeState: async () => {
      extremeChaosGuardActive.value = false;
      const snapshot = extremeChaosState;
      extremeChaosState = undefined;
      if (!snapshot) return;
      filters.selectedModes.value = [...snapshot.modes];
      selection.activeLineId.value = snapshot.activeLineId;
      selection.activeStationId.value = snapshot.activeStationId;
      selection.selectedStationIds.value = [...snapshot.selectedStationIds];
      if (snapshot.activeLineId) {
        await loadBusDirection(snapshot.activeLineId, snapshot.directionId);
        if (directionMergeEnabled.value !== snapshot.directionsMerged) toggleMergedDirections();
      }
      if (snapshot.trafficEnabled && !traffic.enabled.value) enableTraffic();
      if (!snapshot.trafficEnabled && traffic.enabled.value) disableTraffic();
      applyCamera(snapshot.camera, false, false, true);
      syncUrl();
      await refreshViewport();
      cancelScheduledViewportRefresh();
    },
  },
  runtime: {
    isMounted: () => mounted,
    getCanvas: () => canvasElement.value,
    getCamera: () => camera.value,
    getRenderScene: () => renderScene.value,
    getRendererMetrics: () => renderer?.getMetrics(),
    getRendererKind: () => renderer?.kind,
    getActiveLineId: () => activeLine.value?.id,
    getDetailLineId: () => activeLine.value?.id,
    getAvailableModes: () => availableModes.value,
    getActiveModes: () => filters.selectedModes.value,
    isScrolling: isMapInteractionScrolling,
    getSelectedLineRuntimeState: () => ({
      scene: renderScene.value,
      activeLineId: activeLine.value?.id,
      stationConnectionRequestsPending: stationConnectionRequestsPending.value,
      viewportPending: globalTransportViewport.isPending(),
      loading: loading.value,
      trafficLoading: traffic.status.value === "loading",
      ghostSceneComplete: selectedLineGhostSceneComplete.value,
    }),
    getSelectedLineGhostState: () => ({
      expected: ghostLineIds.value.length,
      renderable: renderableGhostLineIds.value.length,
      rendered: renderedGhostLineCount.value,
      missing: missingRenderedGhostLineIds.value,
    }),
    isInteractionActive: () => interactionActive.value,
    isWheelScrolling: () => interactionController?.isWheelScrolling() ?? false,
    isNetworkReady: () => Boolean(network.value) && !loading.value && !globalTransportViewport.isPending(),
    isRendererReady: () => nextRendererReady.value,
    isViewportPending: () => globalTransportViewport.isPending(),
  },
  camera: {
    applyCamera,
    draw,
    drawNow,
    refreshViewport: async () => {
      await refreshViewport();
    },
    setInteractionActive: (active) => {
      setMapInteractionActive(active);
    },
  },
  basemap: {
    beforeMeasure: prewarmSelectedLineCoverTextures,
    captureSnapshot: captureSelectedLineBasemapCoverSnapshot,
    readCoverage: readSelectedLineBasemapCoverage,
    isBasemapReady: selectedLineZoomBasemapReady,
    isBasemapSettled: selectedLineZoomBasemapSettled,
    isCoverEnabled: () => selectedLineCoverEnabled.value,
    isCoverReady: selectedLineZoomCoverReady,
    areBridgeCoversReady: selectedLineZoomBridgeCoversReady,
    resetDiagnostics: () => {
      legacyBasemapRef.value?.resetBasemapDebugMetrics();
      legacyBasemapRef.value?.resetSelectedLineCoverDebugMetrics();
    },
    getBasemapMetrics: () => legacyBasemapRef.value?.getBasemapDebugMetrics(),
    getCoverMetrics: () => legacyBasemapRef.value?.getSelectedLineCoverDebugMetrics(),
  },
  metadata: {
    getRoutePath: () => route.path,
    getExperience: () => mapExperience.kind,
    getBasemap: () => mapExperience.basemap,
    getDataVersion: () => {
      try {
        return dataSource.getManifest().dataVersion;
      } catch {
        return undefined;
      }
    },
    getRendererKind: () => renderer?.kind,
    getCamera: () => camera.value,
    getVisibleModes: () => filters.selectedModes.value,
    isTrafficEnabled: () => traffic.enabled.value,
    getChunkIds: () => viewport.value.chunkIds,
    getDataMetrics: () => {
      const metrics = dataSource.metrics();
      return {
        decodeTimeMs: metrics.decodeTimeMs,
        workerTimeMs: metrics.workerTimeMs,
        workerCount: metrics.workerCount,
        filterPathsLocal: metrics.filterPathsLocal,
        workerPool: metrics.workerPool,
      };
    },
    getFullDataMetrics: () => {
      const metrics = dataSource.metrics();
      return {
        lastGeneration: metrics.lastGeneration,
        lastChunkCount: metrics.lastChunkCount,
        bytes: metrics.bytes,
        decodeTimeMs: metrics.decodeTimeMs,
        workerTimeMs: metrics.workerTimeMs,
        workerCount: metrics.workerCount,
        filterPathsLocal: metrics.filterPathsLocal,
        workerPool: metrics.workerPool,
        cache: metrics.cache,
      };
    },
  },
  trace: performanceTrace,
});
globalTransportPerformanceScenarios = performanceScenarios;
const {
  selectedLineZoomStatus,
  selectedLineZoomPhase,
  selectedLineZoomReportJson,
  chaosZoomRunning,
  chaosZoomProgress,
  chaosZoomTotal,
  chaosZoomActiveProfile,
  chaosZoomReport,
  chaosZoomReportJson,
  downloadChaosZoomReport,
  runChaosZoom,
  runChaosZoomExtreme,
} = performanceScenarios;
viewportTimingReader = (kind, durationMs) => {
  performanceScenarios.recordTiming(kind, durationMs);
};

function restoreAddressBookFocusFromUrl(): void {
  const lat = Number(queryString(route.query.focusLat));
  const lon = Number(queryString(route.query.focusLon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  const world = lonLatToWorld({ lon, lat });
  applyCamera(updateCamera(camera.value, {
    centerWorldX: world.x,
    centerWorldY: world.y,
    zoom: Math.max(camera.value.zoom, GLOBAL_TRANSPORT_PLAN_CONFIG.selection.stationZoom),
  }), false);
  void router.replace({
    query: {
      ...route.query,
      focusLat: undefined,
      focusLon: undefined,
      focusLabel: undefined,
    } as Record<string, string | undefined>,
  });
}

defineExpose({ runChaosZoom, runChaosZoomExtreme });

onMounted(async () => {
  mounted = true;
  await nextTick();
  if (canvasElement.value) renderer.mount(canvasElement.value);
  resizeStage();
  resizeObserver =
    typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resizeStage);
  if (resizeObserver && stageElement.value) resizeObserver.observe(stageElement.value);
  else {
    resizeFallback = resizeStage;
    window.addEventListener("resize", resizeFallback);
  }
  try {
    network.value = await dataSource.initialize();
    (renderer as typeof renderer & {
      attachWorkerPool?: (workerPool: ReturnType<TransportMapDataSource["getWorkerPool"]>) => void;
    }).attachWorkerPool?.(dataSource.getWorkerPool());
    availableModes.value = dataSource.getManifest().modes;
    globalTravelAllowedModes.value = [...availableModes.value];
    searchCatalogReady.value = dataSource.metrics().catalogLoaded;
    setDefaultModes();
    applyCamera(
      fitCameraToBounds(
        camera.value,
        dataSource.getManifest().bounds,
        GLOBAL_TRANSPORT_PLAN_CONFIG.initialView.paddingCssPx,
        GLOBAL_TRANSPORT_PLAN_CONFIG.initialView.minZoom,
        GLOBAL_TRANSPORT_PLAN_CONFIG.initialView.maxZoom,
      ),
      false,
    );
    await refreshViewport();
    await restoreSelectionFromUrl();
    await restoreDebugLineFromUrl();
    if (restoreSharedViewportFromUrl()) await refreshViewport();
    restoreAddressBookFocusFromUrl();
    performanceScenarios.scheduleSelectedLineZoomScenario();
    performanceScenarios.scheduleExtremeChaosZoomScenario();
  } catch (error) {
    if (isAbortError(error)) return;
    loading.value = false;
    errorMessage.value =
      error instanceof Error ? error.message : t("globalMap.page.status.unavailable");
  }
});

onBeforeUnmount(() => {
  mounted = false;
  if (globalMapContextFeedbackTimer !== undefined) {
    window.clearTimeout(globalMapContextFeedbackTimer);
    globalMapContextFeedbackTimer = undefined;
  }
  globalTransportViewport.dispose();
  cancelInertia();
  cancelCameraAnimation();
  cancelWheelZoom();
  resizeObserver?.disconnect();
  if (resizeFallback) window.removeEventListener("resize", resizeFallback);
  renderer?.dispose();
  searchCatalogPromise = undefined;
  if (drawFrame !== undefined) cancelAnimationFrame(drawFrame);
  drawFrame = undefined;
  globalTransportPerformance.dispose();
  dataSource.dispose();
});
</script>

<style scoped>
.global-transport-plan {
  --map-ink: #0f172a;
  --map-muted: #64748b;
  --map-panel: rgba(255, 255, 255, 0.94);
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 0;
  max-height: 100dvh;
  overflow: hidden;
  background: var(--global-map-basemap-background);
  color: var(--map-ink);
  outline: none;
}

.global-transport-plan h1,
.global-transport-plan h2,
.global-transport-plan p {
  margin: 0;
}
.global-transport-plan h1 {
  font-size: clamp(1.1rem, 2vw, 1.55rem);
  letter-spacing: -0.025em;
}
.global-transport-plan h2 {
  font-size: 1.1rem;
}
.global-transport-plan__stage {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}
.global-transport-plan__itinerary-panel { position: absolute; z-index: 8; top: 16px; right: 16px; width: min(400px, calc(100% - 32px)); height: min(calc(100% - 32px), 760px); pointer-events: auto; }
.global-transport-plan__itinerary-panel > .left-nearby-sidebar { height: 100%; }
.global-transport-plan__context-menu { display: grid; gap: 3px; min-width: 250px; }
.global-transport-plan__context-menu button { align-items: center; background: transparent; border: 0; border-radius: 8px; color: inherit; display: flex; font: inherit; font-size: .8rem; gap: 8px; justify-content: flex-start; min-height: 38px; padding: 8px 10px; text-align: left; width: 100%; }
.global-transport-plan__context-menu button:hover, .global-transport-plan__context-menu button:focus-visible { background: #f1efff; color: #4034df; outline: 0; }
.global-transport-plan__context-menu .global-transport-plan__context-danger { color: #b42318; }
.global-transport-plan__context-menu .global-transport-plan__context-danger:hover, .global-transport-plan__context-menu .global-transport-plan__context-danger:focus-visible { background: #fff1f0; color: #b42318; }
.global-transport-plan__next-surface {
  position: absolute;
  z-index: 0;
  inset: 0;
}
.global-transport-plan__canvas {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
.global-transport-plan__canvas--next {
  background: transparent;
}
.global-transport-plan__canvas--station-hover {
  cursor: pointer;
}
.global-transport-plan__canvas--distance-measuring {
  cursor: crosshair;
}
.global-transport-plan__canvas:active {
  cursor: grabbing;
}
.global-transport-plan__distance-control {
  position: absolute;
  z-index: 7;
  top: 16px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(520px, calc(100% - 32px));
  padding: 9px 12px;
  border: 1px solid rgba(81, 70, 255, .2);
  border-radius: 12px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 10px 24px rgba(15, 23, 42, .14);
  color: #18233f;
  font-size: .76rem;
  font-weight: 750;
  transform: translateX(-50%);
  pointer-events: auto;
}
.global-transport-plan__distance-control span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.global-transport-plan__distance-control button {
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  background: #f1efff;
  color: #4034df;
  cursor: pointer;
  font: inherit;
  padding: 6px 8px;
}
.global-transport-plan__distance-control button:hover,
.global-transport-plan__distance-control button:focus-visible {
  background: #e4e0ff;
  outline: 2px solid rgba(81, 70, 255, .24);
  outline-offset: 1px;
}
.global-transport-plan__context-feedback {
  position: absolute;
  z-index: 7;
  right: 16px;
  bottom: 16px;
  max-width: min(360px, calc(100% - 32px));
  padding: 9px 12px;
  border: 1px solid rgba(81, 70, 255, .2);
  border-radius: 10px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 10px 24px rgba(15, 23, 42, .14);
  color: #18233f;
  font-size: .76rem;
  font-weight: 750;
}
.global-transport-plan__left-controls {
  position: absolute;
  z-index: 5;
  top: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  width: min(264px, calc(100% - 32px));
  max-width: 264px;
  max-height: calc(100% - 32px);
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow:
    0 18px 44px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
  backdrop-filter: blur(18px) saturate(1.04);
  scrollbar-color: rgba(100, 116, 139, 0.42) transparent;
  scrollbar-width: thin;
  overscroll-behavior: contain;
  pointer-events: none;
}
.global-transport-plan__left-controls-view {
  display: block;
  width: 100%;
  min-width: 0;
}
.global-transport-plan__left-controls > * {
  width: 100%;
  min-width: 0;
  pointer-events: auto;
}
.global-map-controls-slide-forward-enter-active,
.global-map-controls-slide-forward-leave-active,
.global-map-controls-slide-back-enter-active,
.global-map-controls-slide-back-leave-active {
  transition:
    transform 220ms cubic-bezier(0.22, 0.8, 0.26, 1),
    opacity 160ms ease;
}
.global-map-controls-slide-forward-enter-from {
  opacity: 0;
  transform: translateX(22px);
}
.global-map-controls-slide-forward-leave-to {
  opacity: 0;
  transform: translateX(-22px);
}
.global-map-controls-slide-back-enter-from {
  opacity: 0;
  transform: translateX(-22px);
}
.global-map-controls-slide-back-leave-to {
  opacity: 0;
  transform: translateX(22px);
}
.line-pill,
.dashboard-chip {
  border: 1px solid rgba(100, 116, 139, 0.25);
  font: inherit;
  cursor: pointer;
}
.map-notice {
  position: absolute;
  z-index: 2;
  top: 74px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 14px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 10px;
  background: var(--map-panel);
  color: #334155;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12);
}
.map-notice--error {
  color: #991b1b;
}
.map-link {
  margin-left: 8px;
  border: 0;
  background: transparent;
  color: #1d4ed8;
  cursor: pointer;
  font-weight: 700;
}
.global-transport-plan__panel {
  position: absolute;
  z-index: 2;
  top: 16px;
  right: 16px;
  width: min(360px, calc(100% - 32px));
  max-height: calc(100% - 74px);
  overflow: auto;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 16px;
  background: var(--map-panel);
  box-shadow: 0 12px 35px rgba(15, 23, 42, 0.16);
}
.selection-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.selection-panel__meta {
  margin-top: 5px !important;
  color: var(--map-muted);
  font-size: 0.78rem;
}
.close-button {
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 1.4rem;
  line-height: 1;
}
.selection-panel__lines {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 14px 0;
}
.line-pill {
  padding: 5px 9px;
  border-color: var(--line-color);
  border-radius: 999px;
  background: color-mix(in srgb, var(--line-color) 14%, white);
  color: #0f172a;
  font-size: 0.75rem;
}
.selection-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dashboard-selection {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.3);
}
.dashboard-selection__title {
  color: #475569;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}
.dashboard-selection__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.dashboard-chip {
  padding: 5px 8px;
  border-radius: 7px;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.72rem;
}
.dashboard-selection__label {
  display: block;
  margin-top: 12px;
  color: #475569;
  font-size: 0.72rem;
  font-weight: 700;
}
.dashboard-selection__select {
  width: 100%;
  margin-top: 5px;
  padding: 7px 8px;
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font: inherit;
  font-size: 0.78rem;
}
.dashboard-selection__actions {
  margin-top: 8px;
}
.dashboard-selection__message {
  margin-top: 8px !important;
  color: var(--map-muted);
  font-size: 0.74rem;
}
.entrance-list {
  padding: 0;
  margin: 14px 0 0;
  list-style: none;
}
.entrance-list li + li {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}
.entrance-list {
  color: #64748b;
  font-size: 0.74rem;
}
.global-transport-plan__legend {
  position: absolute;
  z-index: 2;
  right: 16px;
  bottom: 14px;
  left: 16px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
  color: #475569;
  font-size: 0.7rem;
  pointer-events: none;
}
.global-transport-plan__legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.8);
}
.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.legend-dot--hub {
  border: 2px solid #334155;
  background: #f8fafc;
}
.legend-dot--entrance {
  background: #f59e0b;
}
.legend-dot--quay {
  border-radius: 2px;
  background: #0f766e;
  transform: rotate(45deg);
}
.global-map-line-debug {
  position: absolute;
  z-index: 2;
  top: 16px;
  right: 16px;
  width: min(500px, calc(100% - 32px));
  max-height: min(48vh, 420px);
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid rgba(15, 118, 110, 0.38);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  color: #334155;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  font-size: 0.72rem;
}
.global-map-line-debug summary {
  cursor: pointer;
  font-weight: 800;
}
.global-map-line-debug__notice {
  margin-top: 8px !important;
  color: #475569;
}
.global-map-line-debug__table {
  width: 100%;
  margin-top: 8px;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.global-map-line-debug__table th,
.global-map-line-debug__table td {
  padding: 5px 4px;
  border-top: 1px solid rgba(148, 163, 184, 0.24);
  text-align: left;
}
.global-map-line-debug__table th {
  color: #475569;
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.global-map-line-debug__row--inconsistent {
  background: rgba(254, 242, 242, 0.92);
  color: #991b1b;
  font-weight: 700;
}

.global-transport-plan__tooltip--isochrone {
  position: absolute;
  z-index: 2;
  display: grid;
  gap: 4px;
  min-width: 150px;
  max-width: min(260px, calc(100% - 16px));
  padding: 7px 9px;
  border: 1px solid rgba(29, 78, 216, .32);
  border-radius: 10px;
  background: rgba(255, 255, 255, .96);
  color: #18233f;
  font-size: .72rem;
  box-shadow: 0 8px 24px rgba(24, 41, 76, .18), 0 2px 6px rgba(24, 41, 76, .08);
  pointer-events: none;
}
.global-transport-plan__tooltip-isochrone-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  white-space: nowrap;
}
.global-transport-plan__tooltip-isochrone-row strong {
  color: #1d4ed8;
  font-weight: 850;
}
.global-transport-plan__tooltip-isochrone-row > span {
  color: #475569;
  font-variant-numeric: tabular-nums;
}

:global(.global-transport-plan__bike-install-modal) {
  max-width: 520px;
}
:global(.global-transport-plan__bike-install-command) {
  display: block;
  margin-top: 14px;
  padding: 11px 12px;
  overflow-x: auto;
  border: 1px solid rgba(21, 128, 61, 0.22);
  border-radius: 9px;
  background: #f0fdf4;
  color: #166534;
  font-size: 0.76rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
:global(.global-transport-plan__bike-install-close) {
  min-height: 38px;
  padding: 7px 15px;
  border: 1px solid rgba(21, 128, 61, 0.25);
  border-radius: 9px;
  background: #15803d;
  color: #fff;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}

@media (max-width: 700px) {
  .global-transport-plan__left-controls {
    top: 10px;
    left: 10px;
    width: min(310px, calc(100% - 20px));
    max-width: 310px;
    max-height: min(560px, calc(100% - 78px));
  }
  .global-transport-plan__panel {
    top: auto;
    right: 10px;
    bottom: 42px;
    left: 10px;
    width: auto;
    max-height: 42%;
  }
  .global-map-line-debug {
    top: auto;
    right: 10px;
    bottom: 42px;
    left: 10px;
    width: auto;
    max-height: 42%;
  }
  .global-transport-plan__legend {
    right: 10px;
    bottom: 8px;
    left: 10px;
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .global-transport-plan__canvas {
    scroll-behavior: auto;
  }
  .global-map-controls-slide-forward-enter-active,
  .global-map-controls-slide-forward-leave-active,
  .global-map-controls-slide-back-enter-active,
  .global-map-controls-slide-back-leave-active {
    transition: none;
  }
  .global-map-controls-slide-forward-enter-from,
  .global-map-controls-slide-forward-leave-to,
  .global-map-controls-slide-back-enter-from,
  .global-map-controls-slide-back-leave-to {
    transform: none;
  }
}
</style>
