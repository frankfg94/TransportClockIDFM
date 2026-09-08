import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchServiceQuality } from "../src/features/nearby-stations/serviceQualityApi";

afterEach(() => vi.unstubAllGlobals());

describe("service quality API", () => {
  it("accepts the versioned compiled dataset", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: "1.2",
      generatedAt: "2026-09-01T00:00:00.000Z",
      availableYears: [2023, 2024, 2025],
      lines: [],
      sources: [],
      warnings: [],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(fetchServiceQuality()).resolves.toMatchObject({ schemaVersion: "1.2", availableYears: [2023, 2024, 2025] });
  });

  it("rejects an unsupported contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ schemaVersion: "0.9", lines: [], sources: [], warnings: [] }), { status: 200 })));

    await expect(fetchServiceQuality()).rejects.toThrow("Unsupported service-quality contract");
  });
});
