import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import DatasetManagerModal from "../src/features/health/DatasetManagerModal.vue";
import type { DatasetManagerResponse } from "../src/features/health/types";

const datasetResponse: DatasetManagerResponse = {
  schemaVersion: 1,
  generatedAt: "2026-09-10T08:00:00.000Z",
  warnings: ["gtfs"],
  datasets: [{
    id: "gtfs",
    title: "Géométrie et horaires GTFS",
    description: "Artefacts GTFS indexés par ligne.",
    state: "available",
    storage: "cloudflare-r2",
    format: "JSON indexé",
    sizeBytes: 2_500_000,
    sizeScope: "component",
    sourceUrl: "https://example.test/gtfs",
    license: { label: "ODbL", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
    updatedAt: "2026-09-09T08:00:00.000Z",
    freshness: { status: "aging", ageDays: 1, warnAfterDays: 1, staleAfterDays: 20 },
    metrics: [{ label: "Lignes", value: "12" }],
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("DatasetManagerModal", () => {
  it("loads and displays provenance, freshness, size, source and licence", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => datasetResponse,
    }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", { configurable: true, value: fetchMock });

    const wrapper = mount(DatasetManagerModal, {
      props: { open: true },
      attachTo: document.body,
    });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Géométrie et horaires GTFS");
    expect(document.body.textContent).toContain("Cloudflare R2");
    expect(document.body.textContent).toContain("Vieillissante");
    expect(document.body.textContent).toContain("2,38 Mo");
    expect(document.body.textContent).toContain("ODbL");
    expect(document.body.querySelector('a[href="https://example.test/gtfs"]')).not.toBeNull();
    expect(document.body.querySelector('a[href="https://opendatacommons.org/licenses/odbl/1-0/"]')).not.toBeNull();
    expect(document.body.querySelector(".dataset-card__warning")).not.toBeNull();
    wrapper.unmount();
  });
});
