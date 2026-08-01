import { describe, expect, it, vi } from "vitest";
import {
  fetchTransitFamilyOptions,
  searchTransitLines,
} from "../src/services/idfm";
import type { TransitFamilyOption } from "../src/types/transit";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
}

describe("IDFM line search", () => {
  it("keeps every commercial mode associated with a family", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        commercial_modes: [
          { id: "commercial_mode:CableWay", name: "CableWay" },
          { id: "commercial_mode:Funicular", name: "Funiculaire" },
        ],
      }),
    );

    const families = await fetchTransitFamilyOptions({
      apiBase: "https://idfm.test/v2/navitia",
      fetcher: fetcher as typeof fetch,
    });

    expect(families).toEqual([
      {
        id: "commercial_mode:CableWay",
        label: "Cable",
        family: "CABLE",
        commercialModeIds: [
          "commercial_mode:CableWay",
          "commercial_mode:Funicular",
        ],
      },
    ]);
  });

  it("merges cableway and funicular lines instead of dropping one mode", async () => {
    const network: TransitFamilyOption = {
      id: "commercial_mode:CableWay",
      label: "Cable",
      family: "CABLE",
      commercialModeIds: [
        "commercial_mode:CableWay",
        "commercial_mode:Funicular",
      ],
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = decodeURIComponent(new URL(input.toString()).pathname);

      if (path.endsWith("/commercial_mode:CableWay/lines")) {
        return jsonResponse({
          pagination: {
            start_page: 0,
            items_per_page: 100,
            items_on_page: 1,
            total_result: 1,
          },
          lines: [
            {
              id: "line:IDFM:C02666",
              name: "C1",
              code: "C1",
              commercial_mode: {
                id: "commercial_mode:CableWay",
                name: "CableWay",
              },
            },
          ],
        });
      }

      expect(path.endsWith("/commercial_mode:Funicular/lines")).toBe(true);

      return jsonResponse({
        pagination: {
          start_page: 0,
          items_per_page: 100,
          items_on_page: 1,
          total_result: 1,
        },
        lines: [
          {
            id: "line:IDFM:C01385",
            name: "FUNICULAIRE",
            code: "FUN",
            commercial_mode: {
              id: "commercial_mode:Funicular",
              name: "Funiculaire",
            },
          },
        ],
      });
    });

    const lines = await searchTransitLines(network, "", {
      apiBase: "https://idfm.test/v2/navitia",
      fetcher: fetcher as typeof fetch,
    });

    expect(lines.map((line) => line.label)).toEqual(["C1", "FUN"]);
    expect(lines.map((line) => line.commercialModeId)).toEqual([
      "commercial_mode:CableWay",
      "commercial_mode:Funicular",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
