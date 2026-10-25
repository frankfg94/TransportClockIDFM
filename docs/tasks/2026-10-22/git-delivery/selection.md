# Livraison Git des lots TransportClock

Les lots01-13 sont réalisés et acceptés ; la validation externe IGN01 reste dispensée explicitement. APK publié1003 : snapshot fdd504fd172dbd19b066ba3daaf743d6e4ec7578, distinct du commit Git.

## Sélection

Les dépendances PDF préexistantes ci-dessous sont nécessaires au correctif natif12 : générateur, modèle, export-state immobilier/trafic et clés FR/EN. Elles sont incluses comme prérequis directs justifiés par les tests et exports Android12/13, sans réécrire le modèle documentaire.

- src/features/nearby-stations/neighborhoodScorePdf.ts
- src/features/nearby-stations/NearbyNeighborhoodScorePage.vue
- src/features/nearby-stations/NearbyRealEstateVerdict.vue
- src/features/nearby-stations/NeighborhoodTrafficAnnex.vue
- src/i18n/messages/en.ts
- src/i18n/messages/fr.ts

Les correctifs humains séparés GPE/Pont Cardinet/normalisation des fins de service sont exclus par sélection des hunks dans l’index. Les fichiers locaux restent intacts. Caches .data/traffic, temporaires, APK/PDF/PNG/logs/preuves brutes, .env et keystores exclus. Rapports, handoffs et registre conservés.

## Publication automatique

Le commit de livraison porte [skip actions] pour ce push uniquement : conserver l’APK1003 installé/testé/publié et éviter une reconstruction automatique sur un arbre Git différent du snapshot validé. Le workflow permanent reste inchangé. Référence : https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs .

## Sources sélectionnées

- android/app/build.gradle
- android/app/src/main/java/fr/vibeidfm/transportclock/MainActivity.java
- docs/mobile-release.md
- docs/nearby-network-and-places.md
- docs/transport-news.md
- nuxt.config.ts
- pages/ridership/line/[lineId].vue
- scripts/check-transport-news.ts
- scripts/mobile-release/build.ts
- scripts/mobile-release/common.ts
- scripts/mobile-release/publish.ts
- scripts/mobile-release/releaseMetadata.ts
- server/api/idfm/[...path].ts
- server/services/servicePattern/buildLinePatternView.ts
- server/services/transportNews/parser.ts
- server/services/walking/ignWalkingMatrix.ts
- shared/gtfs/finalLineAccess.ts
- shared/gtfs/lastService.ts
- src/App.vue
- src/components/AppModal.vue
- src/components/AppRightPanel.vue
- src/components/DepartureAlarmModal.vue
- src/components/FullscreenStationPanel.vue
- src/components/MaterialCombobox.vue
- src/components/TransitBoard.vue
- src/features/address-book/AdressBook.vue
- src/features/address-book/addressBook.ts
- src/features/app-settings/appSettings.ts
- src/features/line-map/AnnualRidershipStationCard.vue
- src/features/line-map/DetailedLineMapPicker.vue
- src/features/line-map/GlobalMapNearbyPlacesOverlay.vue
- src/features/line-map/GlobalMapPickerSideBar.vue
- src/features/line-map/GlobalMapRealEstateControl.vue
- src/features/line-map/GlobalMapSidebarBodyLine.vue
- src/features/line-map/GlobalTransportItineraryOverlay.vue
- src/features/line-map/GlobalTransportPlan.vue
- src/features/line-map/GlobalTransportPlanModeFilter.vue
- src/features/line-map/LineFrequencyTimetable.vue
- src/features/line-map/LineFrequencyTimetableModal.vue
- src/features/line-map/globalMapSidebarBodyTypes.ts
- src/features/line-map/globalTransportItineraryGeometry.ts
- src/features/line-map/line-map.css
- src/features/line-optimizer/LineOptimizerPage.vue
- src/features/line-optimizer/lineOptimizer.ts
- src/features/line-optimizer/lineOptimizerProvider.ts
- src/features/nearby-stations/MyNearbyStationsPage.vue
- src/features/nearby-stations/NearbyAddressSearch.vue
- src/features/nearby-stations/NearbyNeighborhoodScoreCard.vue
- src/features/nearby-stations/NearbyNeighborhoodScoreFact.vue
- src/features/nearby-stations/NearbyNeighborhoodScorePage.vue
- src/features/nearby-stations/NearbyPlacesAnnuary.vue
- src/features/nearby-stations/NearbyRealEstateControls.vue
- src/features/nearby-stations/NearbyRealEstateVerdict.vue
- src/features/nearby-stations/NearbyStationsMap.vue
- src/features/nearby-stations/NeighborhoodTrafficAnnex.vue
- src/features/nearby-stations/neighborhood/contracts.ts
- src/features/nearby-stations/neighborhood/i18nKeys.ts
- src/features/nearby-stations/neighborhood/score.ts
- src/features/nearby-stations/neighborhood/verdict-transport-facts/README.md
- src/features/nearby-stations/neighborhood/verdict-transport-facts/context.ts
- src/features/nearby-stations/neighborhood/verdict-transport-facts/index.ts
- src/features/nearby-stations/neighborhood/verdict-transport-facts/lastServices.ts
- src/features/nearby-stations/neighborhood/verdict-transport-facts/transportDiversity.ts
- src/features/nearby-stations/useNearbyHeavyTransports.ts
- src/features/nearby-stations/useNearbyNeighborhoodScore.ts
- src/features/nearby-stations/useNearbyPlaces.ts
- src/features/nearby-stations/verdictTransportDebug.ts
- src/features/service-pattern/DeparturePatternModal.vue
- src/features/service-pattern/PatternTrafficCalendarSurface.vue
- src/features/transport-map/data/createTransportMapDataSource.ts
- src/features/transport-map/isochrones/TransportIsochronePanel.vue
- src/features/transport-map/next/TransportMapNextSurface.vue
- src/features/transport-map/next/deckNearbyPlaces.ts
- src/features/transport-map/search/GlobalTransportPlanSearch.vue
- src/features/transport-news/NewsFilters.vue
- src/features/transport-news/TransportNewsPage.vue
- src/features/transport-news/filter.ts
- src/features/transport-news/sources.ts
- src/features/transport-news/types.ts
- src/features/weather/WeatherExperience.vue
- src/features/weather/WeatherForecastModal.vue
- src/features/weather/openMeteo.ts
- src/features/weather/useWeatherExperience.ts
- src/i18n/messages/en.ts
- src/i18n/messages/fr.ts
- src/services/idfm.ts
- src/services/places/compiledPlaces.ts
- src/services/places/compiledPlacesProvider.ts
- src/services/travelRoutes/neighborhoodGtfs.worker.ts
- src/services/travelRoutes/neighborhoodGtfsWalkingMatrix.ts
- src/styles/01-tokens-base.css
- src/styles/05-transit-board.css
- src/styles/07-pattern-board.css
- src/styles/08-responsive.css
- src/types/transit.ts
- tests/appRightPanel.dom.test.ts
- tests/compiledPlacesProvider.test.ts
- tests/dashboardPresets.dom.test.ts
- tests/deckNearbyPlaces.test.ts
- tests/departureAlarmModal.dom.test.ts
- tests/departurePatternSettings.dom.test.ts
- tests/detailedLineMapPicker.dom.test.ts
- tests/finalLineAccess.test.ts
- tests/fullscreenStationPanel.dom.test.ts
- tests/globalMapIsochrones.dom.test.ts
- tests/globalMapPickerRidership.dom.test.ts
- tests/globalTransportPlan.dom.test.ts
- tests/globalTransportPlanSearch.dom.test.ts
- tests/gtfsLastService.test.ts
- tests/ignWalkingMatrix.test.ts
- tests/lineOptimizer.dom.test.ts
- tests/lineOptimizer.test.ts
- tests/mobileReleaseRuntime.test.ts
- tests/nearbyAddressSearch.dom.test.ts
- tests/nearbyNeighborhoodScorePage.dom.test.ts
- tests/nearbyStationsMap.dom.test.ts
- tests/neighborhoodGtfsPerformance.test.ts
- tests/neighborhoodScore.test.ts
- tests/transitBoardMeta.dom.test.ts
- tests/transportMapDataSource.test.ts
- tests/transportNews.test.ts
- tests/transportNewsPage.dom.test.ts
- tests/useNearbyHeavyTransports.dom.test.ts
- tests/useNearbyNeighborhoodScore.dom.test.ts
- tests/useNearbyPlaces.dom.test.ts
- tests/verdictTransportDebug.test.ts
- tests/weatherExperience.dom.test.ts
- tests/weatherForecastModal.dom.test.ts
- tests/weatherNormalization.test.ts
- android/app/src/main/java/fr/vibeidfm/transportclock/PdfExportPlugin.java
- docs/global-transport-plan/CONTROLLED_ITINERARY.md
- scripts/mobile-release/capture.ts
- scripts/mobile-release/sourceSnapshot.ts
- src/components/DraggableBottomSheet.README.md
- src/components/DraggableBottomSheet.vue
- src/components/ResponsiveSidePanel.vue
- src/components/draggableBottomSheet.ts
- src/components/usePanelFocus.ts
- src/features/line-map/GlobalTransportPlanTravel.vue
- src/features/line-map/globalTransportPlanItinerary.ts
- src/features/line-optimizer/lineOptimizerTimeline.ts
- src/features/nearby-stations/NearbyPlaceDetails.vue
- src/features/nearby-stations/VerdictPersonalJourneys.vue
- src/features/nearby-stations/nearbyOpeningHours.ts
- src/features/nearby-stations/nearbyPlaceFocus.ts
- src/features/nearby-stations/neighborhood/personalJourneyPreferences.ts
- src/features/nearby-stations/neighborhood/personalJourneys.ts
- src/features/nearby-stations/neighborhoodScorePdf.ts
- src/features/nearby-stations/useVerdictPersonalJourneys.ts
- src/features/service-pattern/serviceClassification.ts
- src/features/weather/alertTiming.ts
- src/services/pdfExport.ts
- tests/comboboxHarmonisation.dom.test.ts
- tests/departureServiceClassification.test.ts
- tests/departureServiceSection.test.ts
- tests/draggableBottomSheet.dom.test.ts
- tests/fixtures/draggable-bottom-sheet-browser.vue
- tests/fixtures/fullscreen-android-driver.mjs
- tests/fixtures/fullscreen-android-loopback.mjs
- tests/fixtures/fullscreen-station-browser.vue
- tests/fixtures/lot04-weather-browser.vue
- tests/fixtures/lot06-browser.vue
- tests/fixtures/lot08-combobox-browser.html
- tests/fixtures/lot08-combobox-browser.vue
- tests/fixtures/optimizerItinerary.ts
- tests/fixtures/verdict-fontenay-benchmarks.json
- tests/fixtures/verdict-personal-journeys-browser.vue
- tests/fixtures/verdict-personal-journeys-mobile.html
- tests/fixtures/verdict-transport-facts-browser.vue
- tests/fullscreenTimetable.dom.test.ts
- tests/globalMapCommerceLoaders.dom.test.ts
- tests/globalTransportPlanTravel.dom.test.ts
- tests/idfmProxyRealtimeSchedule.test.ts
- tests/lineOptimizerTimeline.dom.test.ts
- tests/lineOptimizerTimeline.test.ts
- tests/materialCombobox.dom.test.ts
- tests/mobileReleaseSourceSnapshot.test.ts
- tests/modalBackNavigation.dom.test.ts
- tests/nearbyOpeningHours.test.ts
- tests/nearbyPlaceDetails.dom.test.ts
- tests/nearbyPlaceFocus.test.ts
- tests/pdfExport.test.ts
- tests/responsiveSidePanel.dom.test.ts
- tests/verdictFontenayBenchmarks.dom.test.ts
- tests/verdictPdfExport.dom.test.ts
- tests/verdictPersonalJourneys.dom.test.ts
- tests/verdictPersonalJourneys.test.ts
- tests/verdictTransportFacts.dom.test.ts
- tests/weatherAlertTiming.test.ts

Le plan détaillé et les copies de sélection restent locaux dans git-delivery/ ; seul ce document est destiné au dépôt.

## Vérification de la sélection

Copie exacte de l’index : TypeScript exit0 et53/53 tests ciblés (5fichiers : fins de service, score, PDF et trajets personnels). Les fichiers du projet de travail n’ont pas été modifiés par la sélection. Aucun résultat de suite globale verte revendiqué.
