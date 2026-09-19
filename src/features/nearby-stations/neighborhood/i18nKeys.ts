import type { TranslationKey } from "../../../i18n";
import type { NeighborhoodCategoryId, NeighborhoodFactKind } from "./contracts";

export const CATEGORY_KEYS: Record<NeighborhoodCategoryId, TranslationKey> = {
  transport: "nearbyStations.neighborhoodScore.categories.transport",
  "daily-life": "nearbyStations.neighborhoodScore.categories.dailyLife",
  "nature-leisure": "nearbyStations.neighborhoodScore.categories.natureLeisure",
  health: "nearbyStations.neighborhoodScore.categories.health",
  education: "nearbyStations.neighborhoodScore.categories.education",
  "living-environment": "nearbyStations.neighborhoodScore.categories.livingEnvironment",
  security: "nearbyStations.neighborhoodScore.categories.security",
};

export const FACT_KEYS: Record<NeighborhoodFactKind, { label: TranslationKey; tooltip: TranslationKey }> = {
  external: {
    label: "nearbyStations.neighborhoodScore.external.label",
    tooltip: "nearbyStations.neighborhoodScore.external.tooltip",
  },
  structuringTransportNearby: {
    label: "nearbyStations.neighborhoodScore.facts.structuringTransportNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.structuringTransportNearby.tooltip",
  },
  structuringTransportDistance: {
    label: "nearbyStations.neighborhoodScore.facts.structuringTransportDistance.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.structuringTransportDistance.tooltip",
  },
  transportLineNearby: {
    label: "nearbyStations.neighborhoodScore.facts.transportLineNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLineNearby.tooltip",
  },
  transportLineAtAddress: {
    label: "nearbyStations.neighborhoodScore.facts.transportLineAtAddress.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLineAtAddress.tooltip",
  },
  transportLineAtFoot: {
    label: "nearbyStations.neighborhoodScore.facts.transportLineAtFoot.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLineAtFoot.tooltip",
  },
  transportLineDistance: {
    label: "nearbyStations.neighborhoodScore.facts.transportLineDistance.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLineDistance.tooltip",
  },
  transportOffer: {
    label: "nearbyStations.neighborhoodScore.facts.transportOffer.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportOffer.tooltip",
  },
  transportLimited: {
    label: "nearbyStations.neighborhoodScore.facts.transportLimited.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLimited.tooltip",
  },
  transportHub: {
    label: "nearbyStations.neighborhoodScore.facts.transportHub.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportHub.tooltip",
  },
  transportServiceQuality: {
    label: "nearbyStations.neighborhoodScore.facts.transportServiceQuality.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportServiceQuality.tooltip",
  },
  majorStationUnder40: {
    label: "nearbyStations.neighborhoodScore.facts.majorStationUnder40.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.majorStationUnder40.tooltip",
  },
  noctilienAtNight: {
    label: "nearbyStations.neighborhoodScore.facts.noctilienAtNight.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.noctilienAtNight.tooltip",
  },
  greenSpaceTransitNearby: {
    label: "nearbyStations.neighborhoodScore.facts.greenSpaceTransitNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.greenSpaceTransitNearby.tooltip",
  },
  greenSpaceExceptional: {
    label: "nearbyStations.neighborhoodScore.facts.greenSpaceExceptional.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.greenSpaceExceptional.tooltip",
  },
  chateletUnder30: {
    label: "nearbyStations.neighborhoodScore.facts.chateletUnder30.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.chateletUnder30.tooltip",
  },
  chateletUnder45: {
    label: "nearbyStations.neighborhoodScore.facts.chateletUnder45.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.chateletUnder45.tooltip",
  },
  chateletDirect: {
    label: "nearbyStations.neighborhoodScore.facts.chateletDirect.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.chateletDirect.tooltip",
  },
  chateletOver60: {
    label: "nearbyStations.neighborhoodScore.facts.chateletOver60.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.chateletOver60.tooltip",
  },
  frequencyVeryGood: {
    label: "nearbyStations.neighborhoodScore.facts.frequencyVeryGood.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.frequencyVeryGood.tooltip",
  },
  frequencyLow: {
    label: "nearbyStations.neighborhoodScore.facts.frequencyLow.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.frequencyLow.tooltip",
  },
  frequencyContext: {
    label: "nearbyStations.neighborhoodScore.facts.frequencyContext.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.frequencyContext.tooltip",
  },
  frequencyRemote: {
    label: "nearbyStations.neighborhoodScore.facts.frequencyRemote.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.frequencyRemote.tooltip",
  },
  lastServiceEarly: {
    label: "nearbyStations.neighborhoodScore.facts.lastServiceEarly.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.lastServiceEarly.tooltip",
  },
  supermarketNearby: {
    label: "nearbyStations.neighborhoodScore.facts.supermarketNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.supermarketNearby.tooltip",
  },
  supermarketNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.supermarketNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.supermarketNearbyApprox.tooltip",
  },
  supermarketsNearby: {
    label: "nearbyStations.neighborhoodScore.facts.supermarketsNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.supermarketsNearby.tooltip",
  },
  dailyStores: {
    label: "nearbyStations.neighborhoodScore.facts.dailyStores.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.dailyStores.tooltip",
  },
  dailyStoresApprox: {
    label: "nearbyStations.neighborhoodScore.facts.dailyStoresApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.dailyStoresApprox.tooltip",
  },
  richCommercialStreet: {
    label: "nearbyStations.neighborhoodScore.facts.richCommercialStreet.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.richCommercialStreet.tooltip",
  },
  richCommercialStreetApprox: {
    label: "nearbyStations.neighborhoodScore.facts.richCommercialStreetApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.richCommercialStreetApprox.tooltip",
  },
  restaurantsNearby: {
    label: "nearbyStations.neighborhoodScore.facts.restaurantsNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.restaurantsNearby.tooltip",
  },
  restaurantsNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.restaurantsNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.restaurantsNearbyApprox.tooltip",
  },
  leisurePlaceNearby: {
    label: "nearbyStations.neighborhoodScore.facts.leisurePlaceNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.leisurePlaceNearby.tooltip",
  },
  leisurePlaceNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.leisurePlaceNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.leisurePlaceNearbyApprox.tooltip",
  },
  educationPlaceNearby: {
    label: "nearbyStations.neighborhoodScore.facts.educationPlaceNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationPlaceNearby.tooltip",
  },
  educationPlaceNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.educationPlaceNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationPlaceNearbyApprox.tooltip",
  },
  educationElementaryNearby: {
    label: "nearbyStations.neighborhoodScore.facts.educationElementaryNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationElementaryNearby.tooltip",
  },
  educationElementaryApprox: {
    label: "nearbyStations.neighborhoodScore.facts.educationElementaryApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationElementaryApprox.tooltip",
  },
  educationMaternelleNearby: {
    label: "nearbyStations.neighborhoodScore.facts.educationMaternelleNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationMaternelleNearby.tooltip",
  },
  educationMaternelleApprox: {
    label: "nearbyStations.neighborhoodScore.facts.educationMaternelleApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationMaternelleApprox.tooltip",
  },
  educationNurseriesNearby: {
    label: "nearbyStations.neighborhoodScore.facts.educationNurseriesNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationNurseriesNearby.tooltip",
  },
  educationNurseriesApprox: {
    label: "nearbyStations.neighborhoodScore.facts.educationNurseriesApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationNurseriesApprox.tooltip",
  },
  educationCollegesNearby: {
    label: "nearbyStations.neighborhoodScore.facts.educationCollegesNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationCollegesNearby.tooltip",
  },
  educationCollegesApprox: {
    label: "nearbyStations.neighborhoodScore.facts.educationCollegesApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationCollegesApprox.tooltip",
  },
  educationHighSchoolsNearby: {
    label: "nearbyStations.neighborhoodScore.facts.educationHighSchoolsNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationHighSchoolsNearby.tooltip",
  },
  educationHighSchoolsApprox: {
    label: "nearbyStations.neighborhoodScore.facts.educationHighSchoolsApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationHighSchoolsApprox.tooltip",
  },
  educationOtherNearby: {
    label: "nearbyStations.neighborhoodScore.facts.educationOtherNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationOtherNearby.tooltip",
  },
  educationOtherApprox: {
    label: "nearbyStations.neighborhoodScore.facts.educationOtherApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.educationOtherApprox.tooltip",
  },
  sportsFacilitiesNearby: {
    label: "nearbyStations.neighborhoodScore.facts.sportsFacilitiesNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.sportsFacilitiesNearby.tooltip",
  },
  tennisCourtNearby: {
    label: "nearbyStations.neighborhoodScore.facts.tennisCourtNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.tennisCourtNearby.tooltip",
  },
  tennisCourtsStack: {
    label: "nearbyStations.neighborhoodScore.facts.tennisCourtsStack.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.tennisCourtsStack.tooltip",
  },
  pharmacyNearby: {
    label: "nearbyStations.neighborhoodScore.facts.pharmacyNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.pharmacyNearby.tooltip",
  },
  pharmacyNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.pharmacyNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.pharmacyNearbyApprox.tooltip",
  },
  hospitalNearby: {
    label: "nearbyStations.neighborhoodScore.facts.hospitalNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.hospitalNearby.tooltip",
  },
  hospitalNearbyWalking: {
    label: "nearbyStations.neighborhoodScore.facts.hospitalNearbyWalking.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.hospitalNearbyWalking.tooltip",
  },
  hospitalNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.hospitalNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.hospitalNearbyApprox.tooltip",
  },
  noSupermarket: {
    label: "nearbyStations.neighborhoodScore.facts.noSupermarket.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.noSupermarket.tooltip",
  },
  noPharmacy: {
    label: "nearbyStations.neighborhoodScore.facts.noPharmacy.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.noPharmacy.tooltip",
  },
};

export const SOURCE_KEYS = {
  stations: "nearbyStations.neighborhoodScore.sources.stations",
  places: "nearbyStations.neighborhoodScore.sources.places",
  placesAndWalking: "nearbyStations.neighborhoodScore.sources.placesAndWalking",
  journeys: "nearbyStations.neighborhoodScore.sources.journeys",
  heavyRoutes: "nearbyStations.neighborhoodScore.sources.heavyRoutes",
  frequency: "nearbyStations.neighborhoodScore.sources.frequency",
  serviceQuality: "nearbyStations.neighborhoodScore.sources.serviceQuality",
} as const satisfies Record<string, TranslationKey>;

export const RULE_KEYS = {
  transportProximity: "nearbyStations.neighborhoodScore.rules.transportProximity",
  transportDistance: "nearbyStations.neighborhoodScore.rules.transportDistance",
  transportDiversity: "nearbyStations.neighborhoodScore.rules.transportDiversity",
  transportHub: "nearbyStations.neighborhoodScore.rules.transportHub",
  chateletUnder30: "nearbyStations.neighborhoodScore.rules.chateletUnder30",
  chateletUnder45: "nearbyStations.neighborhoodScore.rules.chateletUnder45",
  chateletDirect: "nearbyStations.neighborhoodScore.rules.chateletDirect",
  chateletOver60: "nearbyStations.neighborhoodScore.rules.chateletOver60",
  majorStationUnder40: "nearbyStations.neighborhoodScore.rules.majorStationUnder40",
  noctilienAtNight: "nearbyStations.neighborhoodScore.rules.noctilienAtNight",
  frequencyHigh: "nearbyStations.neighborhoodScore.rules.frequencyHigh",
  frequencyLow: "nearbyStations.neighborhoodScore.rules.frequencyLow",
  frequencyLowTransilien: "nearbyStations.neighborhoodScore.rules.frequencyLowTransilien",
  frequencyContext: "nearbyStations.neighborhoodScore.rules.frequencyContext",
  frequencyReference: "nearbyStations.neighborhoodScore.rules.frequencyReference",
  placePresence: "nearbyStations.neighborhoodScore.rules.placePresence",
  placeSaturation: "nearbyStations.neighborhoodScore.rules.placeSaturation",
  commercialCluster: "nearbyStations.neighborhoodScore.rules.commercialCluster",
  pharmacyPresence: "nearbyStations.neighborhoodScore.rules.pharmacyPresence",
  hospitalPresence: "nearbyStations.neighborhoodScore.rules.hospitalPresence",
  lastService: "nearbyStations.neighborhoodScore.rules.lastService",
  leisurePresence: "nearbyStations.neighborhoodScore.rules.leisurePresence",
  educationPresence: "nearbyStations.neighborhoodScore.rules.educationPresence",
  greenSpaceExceptional: "nearbyStations.neighborhoodScore.rules.greenSpaceExceptional",
  greenSpaceTransit: "nearbyStations.neighborhoodScore.rules.greenSpaceTransit",
  sportsFacilities: "nearbyStations.neighborhoodScore.rules.sportsFacilities",
  tennisPresence: "nearbyStations.neighborhoodScore.rules.tennisPresence",
  tennisStack: "nearbyStations.neighborhoodScore.rules.tennisStack",
  serviceQuality: "nearbyStations.neighborhoodScore.rules.serviceQuality",
} as const satisfies Record<string, TranslationKey>;
