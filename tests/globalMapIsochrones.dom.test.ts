import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalTransportIsochronePanel from "../src/features/line-map/GlobalTransportIsochronePanel.vue";
import GlobalTransportPlanModeFilter from "../src/features/line-map/GlobalTransportPlanModeFilter.vue";
import { useGlobalMapIsochrones } from "../src/features/line-map/useGlobalMapIsochrones";
import {
  createGlobalIsochroneSettings, GLOBAL_ISOCHRONE_ATTRIBUTION, GlobalIsochroneError,
  type GlobalIsochroneResult,
} from "../src/features/transport-map/isochrones/contracts";
import type { GlobalIsochroneClient } from "../src/features/transport-map/isochrones/client";
import type { GlobalIsochroneContext } from "../src/features/transport-map/isochrones/selection";
import { walkingPolygon } from "./fixtures/walkingIsochrones";

const wrappers: VueWrapper[] = [];
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); });

function result(id = "metro", missing = 0): GlobalIsochroneResult {
  return { surfaces: [{ id, mode: "METRO", minutes: 10, geometry: walkingPolygon() }], coverage: { total: 1 + missing, available: 1, missing, missingScopes: [] }, generatedAt: "2026-08-30T12:00:00Z", attribution: GLOBAL_ISOCHRONE_ATTRIBUTION };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { resolve, promise };
}
function harness() {
  const context = ref<GlobalIsochroneContext>({ selectedModes: ["METRO"] });
  const version = ref<string | undefined>("test-v1");
  const suspended = ref(false);
  const select = vi.fn<GlobalIsochroneClient["select"]>().mockResolvedValue(result());
  const dispose = vi.fn();
  const createClient = vi.fn(() => ({ select, dispose }));
  let radar!: ReturnType<typeof useGlobalMapIsochrones>;
  const wrapper = mount(defineComponent({ setup() {
    radar = useGlobalMapIsochrones({ getContext: () => context.value, getMapDataVersion: () => version.value, getSuspended: () => suspended.value, createClient });
    return () => h("div");
  } }));
  wrappers.push(wrapper);
  return { wrapper, radar, context, version, suspended, select, dispose, createClient };
}

describe("walking radar lazy state", () => {
  it("starts off and never creates a worker or loads data while inactive", async () => {
    const state = harness();
    expect(state.radar.enabled.value).toBe(false);
    state.context.value = { preset: "RER", selectedModes: ["RER"] };
    state.radar.settings.value.RER.minutes = 25;
    state.radar.panelOpen.value = true;
    await flushPromises();
    expect(state.createClient).not.toHaveBeenCalled();
    state.radar.enabled.value = true;
    await flushPromises();
    expect(state.select).toHaveBeenCalledWith([{ key: "mode:RER", mode: "RER", minutes: 25 }], "test-v1", false);
    expect(state.radar.status.value).toBe("ready");
    state.radar.panelOpen.value = false;
    await flushPromises();
    expect(state.select).toHaveBeenCalledTimes(1);
    expect(state.radar.enabled.value).toBe(true);
  });

  it("ignores a late response after a rapid selection change", async () => {
    const state = harness();
    const first = deferred<GlobalIsochroneResult>();
    const second = deferred<GlobalIsochroneResult>();
    state.select.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    state.radar.enabled.value = true;
    await nextTick();
    state.context.value = { activeLine: { id: "line:RER:A", mode: "RER" }, selectedModes: ["METRO", "RER"] };
    await nextTick();
    expect(state.radar.status.value).toBe("loading");
    expect(state.select.mock.calls[1]?.[0]).toEqual([{ key: "line:line:RER:A", mode: "RER", minutes: 15 }]);
    second.resolve(result("latest"));
    await flushPromises();
    first.resolve(result("stale", 5));
    await flushPromises();
    expect(state.radar.surfaces.value[0]?.id).toBe("latest");
    expect(state.radar.status.value).toBe("ready");
    expect(state.radar.modalOpen.value).toBe(false);
  });

  it("suspends for an itinerary, ignores pending work when disabled, and preserves settings", async () => {
    const state = harness();
    state.radar.settings.value.METRO.minutes = 20;
    state.radar.enabled.value = true;
    await flushPromises();
    state.suspended.value = true;
    await flushPromises();
    expect(state.radar.surfaces.value).toEqual([]);
    expect(state.select).toHaveBeenCalledTimes(1);
    state.suspended.value = false;
    await flushPromises();
    expect(state.select).toHaveBeenCalledTimes(2);
    expect(state.radar.settings.value.METRO.minutes).toBe(20);
    const pending = deferred<GlobalIsochroneResult>();
    state.select.mockReturnValueOnce(pending.promise);
    state.radar.settings.value.METRO.minutes = 25;
    await nextTick();
    state.radar.enabled.value = false;
    await nextTick();
    pending.resolve(result("no-longer-visible"));
    await flushPromises();
    expect(state.radar.surfaces.value).toEqual([]);
    expect(state.radar.status.value).toBe("idle");
    expect(state.radar.settings.value.METRO.minutes).toBe(25);
  });

  it("keeps partial areas and does not reopen the notice for equivalent scopes or camera navigation", async () => {
    const state = harness();
    state.select.mockResolvedValue(result("partial", 2));
    state.radar.enabled.value = true;
    await flushPromises();
    expect(state.radar.modalOpen.value).toBe(true);
    state.radar.closeModal();
    expect(state.radar.enabled.value).toBe(true);
    expect(state.radar.surfaces.value).toHaveLength(1);
    state.context.value = { selectedModes: ["METRO", "BUS"] }; // identical effective scopes
    await flushPromises();
    expect(state.select).toHaveBeenCalledTimes(1);
    expect(state.radar.modalOpen.value).toBe(false);
    state.suspended.value = true;
    await flushPromises();
    state.suspended.value = false;
    await flushPromises();
    expect(state.radar.status.value).toBe("partial");
    expect(state.radar.modalOpen.value).toBe(false);
  });

  it.each(["missing", "incompatible", "invalid", "unavailable"] as const)("handles %s data with a retryable modal and no approximation", async (code) => {
    const state = harness();
    state.select.mockRejectedValueOnce(new GlobalIsochroneError(code));
    state.radar.enabled.value = true;
    await flushPromises();
    expect(state.radar.status.value).toBe(code === "missing" || code === "incompatible" ? code : "error");
    expect(state.radar.modalOpen.value).toBe(true);
    expect(state.radar.surfaces.value).toEqual([]);
    await state.radar.retry();
    expect(state.createClient).toHaveBeenCalledTimes(2);
    expect(state.select.mock.calls[1]?.[2]).toBe(true);
    expect(state.radar.status.value).toBe("ready");
    expect(state.radar.modalOpen.value).toBe(false);
  });

  it("can reactivate after dismissing an unavailable archive and disposes on unmount", async () => {
    const state = harness();
    state.select.mockRejectedValue(new GlobalIsochroneError("missing"));
    state.radar.enabled.value = true;
    await flushPromises();
    state.radar.closeModal();
    await flushPromises();
    expect(state.radar.enabled.value).toBe(false);
    state.radar.enabled.value = true;
    await flushPromises();
    expect(state.radar.modalOpen.value).toBe(true);
    state.select.mockResolvedValue(result());
    await state.radar.retry();
    const disposals = state.dispose.mock.calls.length;
    state.wrapper.unmount();
    expect(state.dispose).toHaveBeenCalledTimes(disposals + 1);
  });
});

describe("walking radar controls and accessibility", () => {
  function panel() {
    const wrapper = mount(GlobalTransportIsochronePanel, {
      attachTo: document.body,
      props: { open: false, modalOpen: false, enabled: false, settings: createGlobalIsochroneSettings(), modes: ["METRO", "RER", "BUS"], eligibleModes: ["METRO", "RER"], status: "idle", coverage: result().coverage, suspended: false, scopeLabel: "Scope", attribution: GLOBAL_ISOCHRONE_ATTRIBUTION, buildCommand: "npm run map:isochrones:build", modeLabel: (mode) => mode },
    });
    wrappers.push(wrapper);
    return wrapper;
  }

  it("opens at the requested mode, offers six times, and changes only radar settings", async () => {
    const wrapper = panel();
    await wrapper.setProps({ open: true, focusMode: "RER" });
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('[data-radar-mode="RER"] input').element);
    const duration = wrapper.get('[data-radar-mode="RER"] select');
    expect(duration.findAll("option").map((option) => option.attributes("value"))).toEqual(["5", "10", "15", "20", "25", "30"]);
    await duration.setValue("25");
    expect(wrapper.emitted("update:mode")).toEqual([["RER", { enabled: true, minutes: 25 }]]);
    await wrapper.get("[data-radar-master]").setValue(true);
    expect(wrapper.emitted("update:enabled")).toEqual([[true]]);
    expect(wrapper.emitted("select-preset")).toBeUndefined();
    await duration.trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
  });

  it("shows generation instructions, traps modal focus, supports Escape and retry", async () => {
    const wrapper = panel();
    await wrapper.setProps({ open: true });
    await flushPromises();
    await wrapper.setProps({ modalOpen: true, status: "missing", enabled: true });
    await flushPromises();
    const body = document.querySelector<HTMLElement>("[data-global-map-radar-notice]")!;
    expect(body.textContent).toContain("walking-isochrones.zip");
    expect(body.textContent).toContain("npm run map:isochrones:build");
    const dialog = body.closest<HTMLElement>('[role="dialog"]')!;
    const buttons = dialog.querySelectorAll<HTMLButtonElement>("button");
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    buttons[buttons.length - 1]!.click();
    expect(wrapper.emitted("retry")).toHaveLength(1);
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(wrapper.emitted("close-modal")).toHaveLength(1);
  });

  it("keeps a partial-coverage indicator after closing the panel", async () => {
    const wrapper = panel();
    await wrapper.setProps({ enabled: true, status: "partial", coverage: result("partial", 3).coverage });
    const badge = wrapper.get("[data-global-map-radar-status]");
    expect(badge.text()).toContain("1/4");
    await badge.trigger("click");
    expect(wrapper.emitted("open-modal")).toHaveLength(1);
    await wrapper.setProps({ suspended: true });
    expect(wrapper.find("[data-global-map-radar-status]").exists()).toBe(false);
  });

  it("provides per-mode radar shortcuts without selecting a preset", async () => {
    const wrapper = mount(GlobalTransportPlanModeFilter, { props: { primaryModes: ["METRO", "BUS"], availableModes: ["METRO", "BUS"], customSummary: "", modeLabel: (mode) => mode, modeColor: () => "#2563eb" } });
    wrappers.push(wrapper);
    await wrapper.get('[data-global-map-mode-radar="BUS"]').trigger("click");
    expect(wrapper.emitted("open-radar")).toEqual([["BUS"]]);
    expect(wrapper.emitted("select-preset")).toBeUndefined();
  });
});
