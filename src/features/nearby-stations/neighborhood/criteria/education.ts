import type { EducationFactGroupId, NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodScoreInput } from "../contracts";
import { EDUCATION_FACT_GROUPS, EDUCATION_WALKING_LIMIT_MINUTES } from "../contracts";
import { category, makeFact, withFacts } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import type { ScoredPlace } from "../places";
import { classifyEducationPlace, formatEducationPlaceLabel, isEducationPlace, scorePlaces } from "../places";
import { clamp, saturatingNeighborhoodBonus } from "../primitives";

export function buildEducationCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("education");
  if (!input.placesLoaded) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.places",
      positiveFacts: [],
      negativeFacts: [],
    };
  }

  // The place source currently exposes schools and other educational
  // establishments as ordinary nearby POIs. Keep the category on that
  // canonical collection and use the same calculated walking metrics as the
  // directory, with a small margin for a genuine school around 15 minutes.
  const establishments = scorePlaces(input, isEducationPlace, EDUCATION_WALKING_LIMIT_MINUTES);
  if (establishments.length === 0) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.education",
      positiveFacts: [],
      negativeFacts: [],
    };
  }

  return withFacts({
    ...base,
    available: true,
    score: clamp(4 + saturatingNeighborhoodBonus(establishments.length, 3, 6)),
    positiveFacts: buildEducationGroupFacts(establishments),
    negativeFacts: [],
  });
}

function buildEducationGroupFacts(establishments: readonly ScoredPlace[]): NeighborhoodFact[] {
  const grouped = new Map<EducationFactGroupId, ScoredPlace[]>();
  for (const establishment of establishments) {
    const groupId = classifyEducationPlace(establishment.place);
    const group = grouped.get(groupId) ?? [];
    group.push(establishment);
    grouped.set(groupId, group);
  }

  return EDUCATION_FACT_GROUPS.flatMap((definition) => {
    const group = grouped.get(definition.id);
    if (!group || group.length === 0) return [];
    const allRoutesAvailable = group.every((establishment) => establishment.routed);
    return [makeFact({
      id: `education-${definition.id}`,
      kind: allRoutesAvailable ? definition.exactKind : definition.approximateKind,
      category: "education",
      polarity: "positive",
      family: `education:${definition.id}`,
      priority: definition.priority,
      values: {
        establishments: group.map(formatEducationPlaceLabel).join(" · "),
        count: group.length,
        minutes: EDUCATION_WALKING_LIMIT_MINUTES,
      },
      sourceKey: allRoutesAvailable ? SOURCE_KEYS.placesAndWalking : SOURCE_KEYS.places,
      proof: allRoutesAvailable ? "direct" : "derived",
      ruleKey: RULE_KEYS.educationPresence,
      ruleValues: { threshold: EDUCATION_WALKING_LIMIT_MINUTES },
    })];
  });
}
