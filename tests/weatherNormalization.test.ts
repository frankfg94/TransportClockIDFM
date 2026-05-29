import { describe, expect, it } from "vitest";
import { normalizeOpenMeteoWeather } from "../src/features/weather/openMeteo";
import type { OpenMeteoForecastPayload } from "../src/features/weather/types";

const location = {
  label: "Paris",
  latitude: 48.8566,
  longitude: 2.3522,
};
const now = new Date("2026-05-28T10:00:00.000Z");

function payloadWithSeries(
  times: string[],
  values: Partial<NonNullable<OpenMeteoForecastPayload["forecast_minutely_15"]>>,
): OpenMeteoForecastPayload {
  return {
    current: {
      time: now.toISOString(),
      temperature_2m: 18,
      apparent_temperature: 18,
      weather_code: 2,
    },
    forecast_minutely_15: {
      time: times,
      temperature_2m: times.map(() => 18),
      apparent_temperature: times.map(() => 18),
      weather_code: times.map(() => 0),
      precipitation: times.map(() => 0),
      ...values,
    },
  };
}

describe("Open-Meteo weather normalization", () => {
  it("detects future rain, intensity and end time", () => {
    const response = normalizeOpenMeteoWeather(
      payloadWithSeries(
        [
          "2026-05-28T10:15:00.000Z",
          "2026-05-28T10:30:00.000Z",
          "2026-05-28T10:45:00.000Z",
          "2026-05-28T11:00:00.000Z",
        ],
        {
          precipitation: [0, 1.5, 1.6, 0],
          rain: [0, 1.5, 1.6, 0],
          weather_code: [0, 61, 61, 0],
        },
      ),
      { location, lookaheadMinutes: 120, now },
    );

    expect(response.alert).toMatchObject({
      kind: "rain",
      startsInMinutes: 30,
      endsInMinutes: 60,
      intensity: 2,
    });
    expect(response.condition.kind).toBe("rain");
  });

  it("prioritizes storms over ordinary rain", () => {
    const response = normalizeOpenMeteoWeather(
      payloadWithSeries(
        [
          "2026-05-28T10:15:00.000Z",
          "2026-05-28T10:30:00.000Z",
          "2026-05-28T10:45:00.000Z",
        ],
        {
          precipitation: [0.8, 0.8, 6],
          weather_code: [61, 61, 95],
        },
      ),
      { location, lookaheadMinutes: 120, now },
    );

    expect(response.alert?.kind).toBe("storm");
    expect(response.alert?.intensity).toBe(3);
  });

  it("detects snow and heat events", () => {
    const snowResponse = normalizeOpenMeteoWeather(
      payloadWithSeries(["2026-05-28T10:30:00.000Z"], {
        snowfall: [1.2],
        weather_code: [73],
      }),
      { location, lookaheadMinutes: 120, now },
    );
    const heatResponse = normalizeOpenMeteoWeather(
      {
        daily: {
          time: ["2026-05-28T00:00:00.000Z"],
          temperature_2m_max: [33],
          apparent_temperature_max: [36],
        },
      },
      { location, lookaheadMinutes: 480, now },
    );

    expect(snowResponse.alert?.kind).toBe("snow");
    expect(heatResponse.alert).toMatchObject({
      kind: "heat",
      intensity: 2,
    });
  });

  it("keeps normal weather when the event is outside the configured window", () => {
    const response = normalizeOpenMeteoWeather(
      payloadWithSeries(["2026-05-28T13:00:00.000Z"], {
        precipitation: [2],
        weather_code: [63],
      }),
      { location, lookaheadMinutes: 60, now },
    );

    expect(response.alert).toBeUndefined();
    expect(response.condition.kind).toBe("normal");
  });
});
