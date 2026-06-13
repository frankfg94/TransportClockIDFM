import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLineFrequencyProfileCache,
  fetchLineFrequencyProfile,
} from "../src/services/idfm";

describe("line frequency profile", () => {
  beforeEach(() => {
    clearLineFrequencyProfileCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calculates weekday medians lazily and caches them by line and station", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          stop_schedules: [
            {
              display_informations: {
                direction: "Terminus",
              },
              date_times: [
                { base_date_time: "20260615T070000" },
                { base_date_time: "20260615T070600" },
                { base_date_time: "20260615T071200" },
                { base_date_time: "20260615T100000" },
                { base_date_time: "20260615T101200" },
                { base_date_time: "20260615T102400" },
                { base_date_time: "20260615T234000" },
                { base_date_time: "20260616T001000" },
              ],
            },
          ],
        }),
      ),
    );

    vi.stubGlobal("fetch", fetcher);

    const station = {
      id: "station:test",
      label: "Station test",
      monitoringRef: "stop:test",
      scheduleStopAreaRef: "stop_area:test",
    };
    const first = await fetchLineFrequencyProfile("line:test", station);
    const second = await fetchLineFrequencyProfile("line:test", station);

    expect(first).toEqual({
      lineId: "line:test",
      stationId: "station:test",
      serviceDate: "20260615",
      peakMinutes: 6,
      offPeakMinutes: 12,
      nightMinutes: 30,
    });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain(
      "/lines/line%3Atest/stop_areas/stop_area%3Atest/stop_schedules?",
    );
  });

  it("merges alternating Navitia schedules for the same direction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL) =>
        new Response(
          JSON.stringify({
            stop_schedules: [
              {
                stop_point: {
                  id: "stop_point:IDFM:486845",
                },
                display_informations: {
                  direction: "La Croix de Berny (Antony)",
                },
                date_times: [
                  { base_date_time: "20260615T173500" },
                  { base_date_time: "20260615T174700" },
                  { base_date_time: "20260615T175900" },
                ],
              },
              {
                stop_point: {
                  id: "stop_point:IDFM:486845",
                },
                display_informations: {
                  direction: "La Croix de Berny (Antony)",
                },
                date_times: [
                  { base_date_time: "20260615T174100" },
                  { base_date_time: "20260615T175300" },
                  { base_date_time: "20260615T180500" },
                ],
              },
            ],
          }),
        ),
      ),
    );

    const profile = await fetchLineFrequencyProfile("line:IDFM:C02528", {
      id: "stop_area:IDFM:69839",
      label: "La Croix de Berny",
      monitoringRef: "STIF:StopArea:SP:46007:",
      scheduleStopAreaRef: "stop_area:IDFM:69839",
    });

    expect(profile.peakMinutes).toBe(6);
  });
});
