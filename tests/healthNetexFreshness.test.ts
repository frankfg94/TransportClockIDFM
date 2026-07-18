import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNetexDatasetFreshness,
  parsePrimGlobalRequestAvailability,
} from "../server/api/health.get";
import { checkIdfmLineTraces } from "../packages/realtime-vehicles/src/runtime/server/healthCheck";

afterEach(() => {
  vi.unstubAllGlobals();
});

const now = new Date("2026-06-18T12:00:00.000Z");

describe("getNetexDatasetFreshness", () => {
  it("keeps fresh NeTEx datasets quiet", () => {
    expect(
      getNetexDatasetFreshness("2026-01-18T12:00:00.000Z", now),
    ).toBeUndefined();
  });

  it("recommends an update after six months", () => {
    expect(
      getNetexDatasetFreshness("2025-12-17T12:00:00.000Z", now),
    ).toEqual({
      status: "warning",
      message: "update recommended",
      detail: "NeTEx dataset is over six months old; updating it is recommended.",
    });
  });

  it("marks datasets older than one year as outdated", () => {
    expect(
      getNetexDatasetFreshness("2025-06-17T12:00:00.000Z", now),
    ).toEqual({
      status: "error",
      message: "dataset outdated",
      detail: "NeTEx dataset is over one year old and must be regenerated.",
    });
  });

  it("ignores invalid generation dates", () => {
    expect(getNetexDatasetFreshness("not-a-date", now)).toBeUndefined();
  });
});

describe("parsePrimGlobalRequestAvailability", () => {
  it("extracts the current global-request availability from the official section", () => {
    expect(
      parsePrimGlobalRequestAvailability(`
        <section>
          <h2>Prochains passages – requête arrêt</h2>
          <p>Disponibilité actuelle 83 %</p>
        </section>
        <section>
          <h2>Prochains passages – requête globale</h2>
          <p>Disponibilité actuelle&nbsp;99,87 %</p>
        </section>
      `),
    ).toBe(99.87);
  });

  it("returns undefined when the official page structure cannot be identified", () => {
    expect(
      parsePrimGlobalRequestAvailability(
        "<h2>Service inconnu</h2><p>Disponibilité actuelle 100 %</p>",
      ),
    ).toBeUndefined();
  });
});

describe("checkIdfmLineTraces", () => {
  it("reports the public GTFS geometry API without requiring a key", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify({ results: [{ route_id: "IDFM:C01383" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkIdfmLineTraces()).resolves.toMatchObject({
      id: "idfm-line-traces",
      category: "Realtime",
      required: false,
      status: "ok",
      message: "The public IDFM line trace API is reachable.",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "select=route_id",
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("apikey");
  });
});
