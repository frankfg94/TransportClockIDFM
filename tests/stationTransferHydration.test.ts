import { describe, expect, it, vi } from "vitest";
import { fetchStationTransfers } from "../src/services/idfm";
import type { StationSearchOption, TransferLineOption } from "../src/types/transit";
import expectedTransferHydration from "./fixtures/idfm/expected-transfer-hydration.json";

interface ExpectedTransferHydrationCase {
  name: string;
  currentLineId: string;
  station: StationSearchOption;
  expectedTransfers: Array<{
    label: string;
    mode: string;
  }>;
}

const liveCases = expectedTransferHydration as ExpectedTransferHydrationCase[];

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
});

describe.runIf(process.env.LIVE_IDFM_TRANSFER_TESTS === "1")(
  "live IDFM station transfer hydration",
  () => {
    it.each(liveCases)(
      "hydrates expected transfers for $name",
      async ({ currentLineId, station, expectedTransfers }) => {
        const transfers = await fetchStationTransfers(station, currentLineId, {
          apiBase:
            process.env.IDFM_TEST_NAVITIA_BASE ??
            "http://localhost:3000/api/idfm/v2/navitia",
        });

        expectTransferLabels(transfers, expectedTransfers);
      },
      30_000,
    );
  },
);

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
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 200,
  });
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
