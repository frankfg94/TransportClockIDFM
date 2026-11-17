import type { TranslationKey, TranslationParams } from "../../../i18n";
import { EDUCATION_WALKING_LIMIT_MINUTES, NEIGHBORHOOD_FREQUENCY_RELEVANCE_RULES as frequency, NEIGHBORHOOD_WALKING_LIMIT_MINUTES, type NeighborhoodCategoryId } from "./contracts";
import { DAILY_LIFE_SCORE_RULES as daily } from "./criteria/dailyLife";
import { EDUCATION_SCORE_RULES as education } from "./criteria/education";
import { HEALTH_SCORE_RULES as health } from "./criteria/health";
import { NATURE_LEISURE_SCORE_RULES as nature } from "./criteria/natureLeisure";
import { TRANSPORT_SCORE_RULES as transport } from "./verdict-transport-facts/scoring";
import { MAJOR_SHOPPING_CENTRE_ACCESS_RULES as centre } from "./shoppingCentres";
import { PERSONAL_JOURNEY_SCORES as personal } from "./personalJourneys";

export interface NeighborhoodScoreHelpRule { key: TranslationKey; values: TranslationParams }
export interface NeighborhoodScoreHelpDefinition { id: NeighborhoodCategoryId; rules: NeighborhoodScoreHelpRule[] }

/** Documentation is generated from the rule constants used by each builder. */
export function neighborhoodScoreHelpDefinitions(format: { percent(value: number): string; number(value: number): string }): NeighborhoodScoreHelpDefinition[] {
  const { percent, number } = format;
  return [
    { id: "transport", rules: [
      { key: "nearbyStations.neighborhoodScore.scoreHelp.transport", values: { access: percent(transport.accessWeight), lines: percent(transport.linesWeight), modes: percent(transport.modesWeight), journey: percent(transport.journeyWeight), frequency: percent(transport.frequencyWeight), base: percent(transport.baseShare), quality: percent(transport.qualityWeight) } },
      { key: "nearbyStations.neighborhoodScore.scoreHelp.transportRules", values: { accessMinutes: transport.accessMinutes, accessMeters: transport.accessMeters, lines: transport.linesTarget, modes: transport.modesTarget, journeyFull: transport.journeyFullMinutes, journeyZero: transport.journeyFullMinutes + transport.journeyRangeMinutes, frequencyFull: transport.frequencyFullMinutes, frequencyZero: transport.frequencyFullMinutes + transport.frequencyRangeMinutes, fallback: number(transport.noSignals), exceptionalLines: transport.exceptionalLines, floor: transport.exceptionalFloor } },
      { key: "nearbyStations.neighborhoodScore.scoreHelp.frequency", values: { m1: frequency[0].minutes, w1: percent(frequency[0].weight), m2: frequency[1].minutes, w2: percent(frequency[1].weight), m3: frequency[2].minutes, w3: percent(frequency[2].weight), m4: frequency[3].minutes, w4: percent(frequency[3].weight), m5: frequency[4].minutes, w5: percent(frequency[4].weight) } },
      { key: "nearbyStations.neighborhoodScore.scoreHelp.personal", values: { bonus: personal.bonus, neutral: personal.neutral, penalty: personal.penalty } },
    ] },
    { id: "daily-life", rules: [{ key: "nearbyStations.neighborhoodScore.scoreHelp.daily", values: { minutes: NEIGHBORHOOD_WALKING_LIMIT_MINUTES, base: daily.base, supermarkets: daily.supermarkets.target, supermarketPoints: daily.supermarkets.maximum, stores: daily.stores.target, storePoints: daily.stores.maximum, restaurants: daily.restaurants.target, restaurantPoints: daily.restaurants.maximum, centre: number(centre.scoreBonus), estimated: number(centre.scoreBonus * daily.estimatedCentreFactor), walking: centre.maximumWalkingMinutes, transit: centre.maximumTransitMinutes } }] },
    { id: "nature-leisure", rules: [{ key: "nearbyStations.neighborhoodScore.scoreHelp.nature", values: { minutes: NEIGHBORHOOD_WALKING_LIMIT_MINUTES, base: nature.base, target: nature.target, bonus: nature.maximumBonus, factsBase: nature.factsOnlyBase, max: nature.factsMaximum } }] },
    { id: "health", rules: [{ key: "nearbyStations.neighborhoodScore.scoreHelp.health", values: { minutes: NEIGHBORHOOD_WALKING_LIMIT_MINUTES, hospital: health.hospitalMinutes, missing: health.missing, base: health.base, target: health.extraTarget, bonus: health.extraMaximum } }] },
    { id: "education", rules: [{ key: "nearbyStations.neighborhoodScore.scoreHelp.education", values: { minutes: EDUCATION_WALKING_LIMIT_MINUTES, base: education.base, target: education.target, bonus: education.maximumBonus } }] },
  ];
}
