import type { GlobalMapLine, GlobalMapMode } from "../contracts/manifest";
import {
  globalIsochronePresetMinutes,
  globalIsochroneScopeKey,
  type GlobalIsochroneRequest,
  type GlobalIsochroneSettings,
} from "./contracts";

export interface GlobalIsochroneContext {
  activeLine?: Pick<GlobalMapLine, "id" | "mode">;
  preset?: "ALL" | GlobalMapMode;
  selectedModes: readonly GlobalMapMode[];
}

export function globalIsochroneEligibleModes(context: GlobalIsochroneContext): GlobalMapMode[] {
  if (context.activeLine) return [context.activeLine.mode];
  if (context.preset && context.preset !== "ALL") return [context.preset];
  return [...new Set(context.selectedModes)];
}

export function selectGlobalIsochroneScopes(
  context: GlobalIsochroneContext,
  settings: GlobalIsochroneSettings,
): GlobalIsochroneRequest[] {
  return globalIsochroneEligibleModes(context)
    .filter((mode) => settings[mode].enabled)
    .flatMap((mode) => {
      const key = context.activeLine
        ? globalIsochroneScopeKey("line", context.activeLine.id)
        : globalIsochroneScopeKey("mode", mode);
      return globalIsochronePresetMinutes(settings[mode].preset).map((minutes) => ({ key, mode, minutes }));
    });
}
