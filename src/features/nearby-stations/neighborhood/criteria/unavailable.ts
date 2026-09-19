import type { TranslationKey } from "../../../../i18n";
import type { NeighborhoodCategoryId, NeighborhoodCategoryResult } from "../contracts";
import { category } from "../facts";

export function buildUnavailableCategory(
  id: NeighborhoodCategoryId,
  unavailableReasonKey: TranslationKey,
): NeighborhoodCategoryResult {
  return {
    ...category(id),
    available: false,
    unavailableReasonKey,
    positiveFacts: [],
    negativeFacts: [],
  };
}
