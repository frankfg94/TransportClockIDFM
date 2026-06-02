import { describe, expect, it, vi } from "vitest";
import { fetchStationTransfers } from "../src/services/idfm";
import type { StationSearchOption, TransferLineOption } from "../src/types/transit";

describe("station transfer hydration", () => {
  it("hydrates a station from Navitia connection stop areas without station-specific rules", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A70945/connections")) {
        return jsonResponse({
          connections: [
            createConnection("Nanterre Préfecture", "Nanterre-La-Folie", 300),
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A70945/places_nearby")) {
        return jsonResponse({
          places_nearby: [
            createNearbyStopArea("stop_area:IDFM:70945", "Nanterre Préfecture", 0),
            createNearbyStopArea("stop_area:IDFM:488087", "Nanterre-La-Folie", 439),
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A70945/lines")) {
        return jsonResponse({
          lines: [createLine("line:IDFM:C01742", "A", "RER")],
        });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A488087/lines")) {
        return jsonResponse({
          lines: [createLine("line:IDFM:C01729", "E", "RER")],
        });
      }

      throw new Error(`Unexpected transfer hydration fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const transfers = await fetchStationTransfers(
        createStation("stop_area:IDFM:70945", "Nanterre Préfecture", "Nanterre"),
        "line:IDFM:C01742",
      );

      expectTransferLabels(transfers, [{ label: "E", mode: "RER" }]);
      expect(transfers.map((transfer) => transfer.label)).not.toContain("A");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("can hydrate only direct stop-area lines for dense pattern maps", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes("/connections") || url.includes("/places_nearby")) {
        throw new Error(`Direct transfer hydration should not fetch ${url}`);
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A71410/lines")) {
        return jsonResponse({
          lines: [
            createLine("line:IDFM:C01743", "B", "RER"),
            createLine("line:IDFM:C01374", "4", "MÃ©tro"),
            createLine("line:IDFM:C01728", "D", "RER"),
          ],
        });
      }

      throw new Error(`Unexpected direct transfer hydration fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const transfers = await fetchStationTransfers(
        createStation("stop_area:IDFM:71410", "Gare du Nord", "Paris"),
        "line:IDFM:C01743",
        { transferScope: "direct" },
      );

      expectTransferLabels(transfers, [
        { label: "4", mode: "MÃ©tro" },
        { label: "D", mode: "RER" },
      ]);
      expect(transfers.map((transfer) => transfer.label)).not.toContain("B");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps expanding a large same-name interchange after connection matches", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A90001/connections")) {
        return jsonResponse({
          connections: [
            createConnection("RER Central Hub", "RER Central Hall", 260),
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A90001/places_nearby")) {
        return jsonResponse({
          places_nearby: [
            createNearbyStopArea("stop_area:IDFM:90001", "Chatelet - Les Halles", 0),
            createNearbyStopArea("stop_area:IDFM:90002", "RER Central Hall", 60),
            createNearbyStopArea("stop_area:IDFM:90003", "Chatelet", 120),
            createNearbyStopArea("stop_area:IDFM:90004", "Les Halles", 140),
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A90001/lines")) {
        return jsonResponse({
          lines: [
            createLine("line:IDFM:C01743", "B", "RER"),
            createLine("line:IDFM:C01742", "A", "RER"),
            createLine("line:IDFM:C01728", "D", "RER"),
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A90002/lines")) {
        return jsonResponse({
          lines: [
            createLine("line:IDFM:C01742", "A", "RER"),
            createLine("line:IDFM:C01728", "D", "RER"),
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A90003/lines")) {
        return jsonResponse({
          lines: [
            createLine("line:IDFM:C01371", "1", "Metro"),
            createLine("line:IDFM:C01374", "4", "Metro"),
            createLine("line:IDFM:C01377", "7", "Metro"),
            createLine("line:IDFM:C01381", "11", "Metro"),
            createLine("line:IDFM:C01384", "14", "Metro"),
          ],
        });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A90004/lines")) {
        return jsonResponse({
          lines: [createLine("line:IDFM:C01374", "4", "Metro")],
        });
      }

      throw new Error(`Unexpected interchange transfer hydration fetch: ${url}`);
    });

    const transfers = await fetchStationTransfers(
      createStation("stop_area:IDFM:90001", "Chatelet - Les Halles", "Paris"),
      "line:IDFM:C01743",
      {
        apiBase: "https://unit.test/v2/navitia",
        fetcher: fetchMock as unknown as typeof fetch,
      },
    );

    expectTransferLabels(transfers, [
      { label: "1", mode: "Metro" },
      { label: "4", mode: "Metro" },
      { label: "7", mode: "Metro" },
      { label: "11", mode: "Metro" },
      { label: "14", mode: "Metro" },
      { label: "A", mode: "RER" },
      { label: "D", mode: "RER" },
    ]);
  });
});

function expectTransferLabels(
  transfers: TransferLineOption[],
  expectedTransfers: Array<{ label: string; mode: string }>,
): void {
  const normalizedTransfers = transfers.map((transfer) => ({
    label: transfer.label,
    mode: normalizeText(transfer.mode),
  }));

  expectedTransfers.forEach((expected) => {
    expect(normalizedTransfers).toContainEqual(
      expect.objectContaining({
        label: expected.label,
        mode: expect.stringContaining(normalizeText(expected.mode)),
      }),
    );
  });
}

function createStation(
  id: string,
  label: string,
  city: string,
): StationSearchOption {
  return {
    id,
    label,
    city,
    monitoringRef: "",
    scheduleStopAreaRef: id,
  };
}

function createConnection(
  originName: string,
  destinationName: string,
  displayDuration: number,
) {
  return {
    origin: {
      id: `stop_point:IDFM:${createTestId(originName)}`,
      name: originName,
      label: originName,
    },
    destination: {
      id: `stop_point:IDFM:${createTestId(destinationName)}`,
      name: destinationName,
      label: destinationName,
    },
    duration: displayDuration + 120,
    display_duration: displayDuration,
  };
}

function createNearbyStopArea(id: string, name: string, distance: number) {
  return {
    id,
    name,
    distance: String(distance),
    embedded_type: "stop_area",
    stop_area: {
      id,
      name,
      label: `${name} (Test)`,
    },
  };
}

function createLine(id: string, label: string, mode: string) {
  return {
    id,
    code: label,
    name: label,
    commercial_mode: {
      id: `commercial_mode:${createTestId(mode)}`,
      name: mode,
    },
  };
}

function jsonResponse(payload: unknown): Response {
  const responsePayload =
    typeof payload === "object" && payload !== null && !("pagination" in payload)
      ? {
          ...payload,
          pagination: createPagination(payload),
        }
      : payload;

  return new Response(JSON.stringify(responsePayload), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 200,
  });
}

function createPagination(payload: unknown) {
  const firstCollection = Object.values(payload as Record<string, unknown>).find(
    (value): value is unknown[] => Array.isArray(value),
  );
  const itemCount = firstCollection?.length ?? 0;

  return {
    start_page: 0,
    items_per_page: itemCount,
    items_on_page: itemCount,
    total_result: itemCount,
  };
}

function createTestId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
