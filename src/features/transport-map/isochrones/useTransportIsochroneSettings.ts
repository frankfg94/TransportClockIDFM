import { ref } from "vue";
import {
  createGlobalIsochroneSettings,
  type GlobalIsochroneModeSetting,
  type GlobalIsochroneSettings,
} from "./contracts";
import type { GlobalMapMode } from "../contracts/manifest";

/**
 * Shared UI state for the walking-radar panel.
 *
 * The map and nearby-stations loaders have different source/scoping rules,
 * but their controls intentionally share the same per-mode settings and
 * lifecycle. Keeping that state here prevents either surface from growing a
 * second, subtly different radar panel implementation.
 */
export function useTransportIsochroneSettings() {
  const enabled = ref(false);
  const settings = ref<GlobalIsochroneSettings>(createGlobalIsochroneSettings());
  const panelOpen = ref(false);
  const modalOpen = ref(false);

  function setMode(
    mode: GlobalMapMode,
    setting: GlobalIsochroneModeSetting,
  ): void {
    settings.value[mode] = { ...setting };
  }

  function closePanel(): void {
    panelOpen.value = false;
  }

  function closeModal(): void {
    modalOpen.value = false;
  }

  return {
    enabled,
    settings,
    panelOpen,
    modalOpen,
    setMode,
    closePanel,
    closeModal,
  };
}
