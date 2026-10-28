import { afterEach, describe, expect, it, vi } from "vitest";

const geometry = { type: "Polygon", coordinates: [[[2, 49], [3, 49], [3, 50], [2, 50], [2, 49]]] };
const official = { type: "FeatureCollection", features: [{ type: "Feature",
  properties: { code: "60176", nom: "Crépy-en-Valois" }, geometry }] };

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("official commune boundary service", () => {
  it("requests official contours by station coordinates, caches them and computes an interior label", async () => {
    const fetcher = vi.fn(async (..._args: unknown[]) => ({ ok: true, json: async () => official }));
    vi.stubGlobal("fetch", fetcher);
    const { resolveCityBoundary } = await import("../server/services/geography/cityBoundary");
    const values = await Promise.all([resolveCityBoundary(49.2, 2.8), resolveCityBoundary(49.2, 2.8)]);
    expect(values[0]).toMatchObject({ code: "60176", name: "Crépy-en-Valois", geometry, centroid: [2.5, 49.2] });
    await resolveCityBoundary(49.2, 2.8);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.hostname).toBe("geo.api.gouv.fr");
    expect(url.searchParams.get("geometry")).toBe("contour");
    expect(url.searchParams.get("lat")).toBe("49.2");
  });

  it("retries upstream errors and rejects missing or ambiguous geography", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [...official.features, ...official.features] }) })
      .mockResolvedValue({ ok: true, json: async () => official });
    vi.stubGlobal("fetch", fetcher);
    const { resolveCityBoundary } = await import("../server/services/geography/cityBoundary");
    await expect(resolveCityBoundary(49.2, 2.8)).rejects.toThrow("503");
    await expect(resolveCityBoundary(49.2, 2.8)).rejects.toThrow("absent or ambiguous");
    await expect(resolveCityBoundary(49.2, 2.8)).rejects.toThrow("absent or ambiguous");
    await expect(resolveCityBoundary(49.2, 2.8)).resolves.toMatchObject({ code: "60176" });
  });
});
