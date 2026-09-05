import type { H3Event } from "h3";
import { describe, expect, it, vi } from "vitest";
import lineHandler from "../server/api/ridership/lines/[lineId].get";
import monthlyLineHandler from "../server/api/ridership/lines/[lineId]/monthly.get";
import stationHandler from "../server/api/ridership/stations/[stationId].get";

vi.mock("../server/services/ridership/ridershipCache", () => ({
  getRidershipLine: vi.fn(async () => ({ id: "line:IDFM:C01739", primary: { value: null } })),
  getRidershipMonthlyLine: vi.fn(async () => ({ id: "line:IDFM:C01739", schemaVersion: 1, series: [] })),
  getRidershipStation: vi.fn(async () => ({ id: "station:IDFM:100", primary: { value: 500 } })),
}));

describe("annual ridership endpoints", () => {
  it("does not cache a line or station response across a generated-data version change", async () => {
    const lineEvent = createEvent({ lineId: "line:IDFM:C01739" });
    const stationEvent = createEvent({ stationId: "station:IDFM:100" });

    await lineHandler(lineEvent.event);
    await stationHandler(stationEvent.event);

    expect(lineEvent.headers.get("Cache-Control")).toBe("no-store");
    expect(stationEvent.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the precompiled monthly line document without caching it", async () => {
    const monthlyEvent = createEvent({ lineId: "line:IDFM:C01739" });

    await monthlyLineHandler(monthlyEvent.event);

    expect(monthlyEvent.headers.get("Cache-Control")).toBe("no-store");
  });
});

function createEvent(params: Record<string, string>): { event: H3Event; headers: Map<string, string> } {
  const headers = new Map<string, string>();
  return {
    event: {
      context: { params },
      node: {
        req: { url: "/api/ridership" },
        res: {
          setHeader(name: string, value: string): void {
            headers.set(name, value);
          },
        },
      },
    } as unknown as H3Event,
    headers,
  };
}
