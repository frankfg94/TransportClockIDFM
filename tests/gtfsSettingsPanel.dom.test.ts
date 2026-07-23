import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GtfsSettingsPanel from "../src/features/app-settings/GtfsSettingsPanel.vue";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GtfsSettingsPanel", () => {
  it("shows stale installed data, the CLI update path and emits the user toggle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => statusResponse({ stale: true, ageDays: 21 })),
    );
    const wrapper = mount(GtfsSettingsPanel, { props: { modelValue: true } });
    await flushPromises();

    expect(wrapper.text()).toContain("Precision GTFS");
    expect(wrapper.text()).toContain("Ces donnees ont environ 21 jours");
    expect(wrapper.text()).toContain("npm run gtfs:update");
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Jeton administrateur");

    await wrapper.get('input[type="checkbox"]').setValue(false);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
    expect(window.localStorage.length).toBe(0);
  });

  it("refreshes a read-only status without creating an administration request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse({ available: false, datasetVersion: undefined }))
      .mockResolvedValueOnce(statusResponse({ available: true, datasetVersion: "2026-07-23" }));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(GtfsSettingsPanel, { props: { modelValue: true } });
    await flushPromises();
    expect(wrapper.text()).toContain("Non");

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("2026-07-23");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith("/api/gtfs/status"))).toBe(
      true,
    );
  });

  it("surfaces a status error and leaves the toggle usable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const wrapper = mount(GtfsSettingsPanel, { props: { modelValue: true } });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("GTFS status HTTP 503");
    await wrapper.get('input[type="checkbox"]').setValue(false);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
  });
});

function statusResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      enabled: true,
      available: true,
      datasetVersion: "2026-07-01",
      sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
      installedAt: "2026-07-01T01:00:00.000Z",
      ageDays: 21,
      stale: false,
      lineCount: 1450,
      cacheGeneration: 2,
      storage: "r2",
      ...overrides,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
