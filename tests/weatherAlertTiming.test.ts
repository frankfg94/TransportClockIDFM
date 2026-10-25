import { describe, expect, it } from "vitest";
import { advanceWeatherAlert } from "../src/features/weather/alertTiming";
import type { WeatherAlert } from "../src/features/weather/types";

const rain: WeatherAlert = {
  kind: "rain", label: "rain", intensity: 2,
  startsAt: "2026-10-22T09:38:00Z", startsInMinutes: 18,
  endsInMinutes: 57,
};

describe("weather alert timing", () => {
  it("keeps a future event above zero until its start, then advances to ongoing", () => {
    expect(advanceWeatherAlert(rain, 18 * 60_000 - 1)?.startsInMinutes).toBe(1);
    expect(advanceWeatherAlert(rain, 18 * 60_000)?.startsInMinutes).toBe(0);
    expect(advanceWeatherAlert(rain, 19 * 60_000)).toMatchObject({ startsInMinutes: 0, intensity: 2, endsInMinutes: 38 });
  });
  it("expires an ended event and tolerates an unknown end", () => {
    expect(advanceWeatherAlert(rain, 57 * 60_000)).toBeUndefined();
    expect(advanceWeatherAlert({ ...rain, endsInMinutes: undefined }, 60 * 60_000)?.startsInMinutes).toBe(0);
    expect(advanceWeatherAlert(undefined, 0)).toBeUndefined();
  });
});
