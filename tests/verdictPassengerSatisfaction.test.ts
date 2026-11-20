import { describe, expect, it } from "vitest";
import { parsePassengerSatisfactionExport, type PassengerSatisfactionObservation } from "../shared/passengerSatisfaction";
import { assessPassengerSatisfaction } from "../src/features/nearby-stations/neighborhood/verdict-transport-facts/passengerSatisfaction";
import { calculateTransportScoreDetails } from "../src/features/nearby-stations/neighborhood/verdict-transport-facts/scoring";
import { buildTransportFactsContext } from "../src/features/nearby-stations/neighborhood/verdict-transport-facts/context";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";

const now = Date.UTC(2026, 10, 19);
const metro = { id: "line:IDFM:C01383", code: "13", label: "Métro 13", mode: "METRO", color: "", textColor: "", aliases: [] } as const;
const tram = { ...metro, id: "line:IDFM:C01794", mode: "TRAM", code: "T6", label: "Tramway T6" } as const;
const row = (overrides: Partial<PassengerSatisfactionObservation> = {}): PassengerSatisfactionObservation => ({
  lineId: "C01383", label: "Métro 13", mode: "METRO", operator: "RATP", contract: null, year: 2025, percent: 81.2573, ...overrides,
});
const line = <L extends Omit<typeof metro, "id" | "mode" | "code" | "label"> & Pick<GlobalMapLine, "id" | "mode" | "code" | "label">>(entry: L) => ({ ...entry, aliases: [...entry.aliases] });

describe("annual IDFM passenger satisfaction", () => {
  it("ignores aggregates, mosaics of IDs and other metrics at the source boundary", () => {
    const raw = { indicateur: "Indicateur Global de Perception", id_line: "C01383", ligne: "Métro 13", mode: "Métro", operateur: "RATP", annee: "2025", resultat: "81.2573" };
    expect(parsePassengerSatisfactionExport([raw, { ...raw, id_line: null }, { ...raw, id_line: "C01373;C01386" },
      { ...raw, groupe_de_lignes: "Paris" }, { ...raw, indicateur: "Ponctualité" }, { ...raw, resultat: "" }])).toEqual([row()]);
  });

  it.each([[90, "bonus", 10], [89.99, "neutral", 5], [80, "neutral", 5], [79.99, "penalty", 0]] as const)(
    "qualifies a complete cohort at %s%%", (percent, kind, score) => {
      const other = line({ ...metro, id: "C01384", code: "14" });
      const result = assessPassengerSatisfaction([line(metro), other], [row({ percent: percent + 1 }), row({ lineId: "C01384", label: "Métro 14", percent: percent - 1 })], undefined, now);
      expect(result).toMatchObject({ coverage: "complete", total: 2, covered: 2, percent, qualification: { kind }, score });
    },
  );

  it("retains factual rows through partial coverage, differing scopes and old records", () => {
    const lines = [line(metro), line(tram)];
    const tramObservation = row({ lineId: "C01794", label: "Tramway T6", mode: "TRAM", percent: 91.4191 });
    expect(assessPassengerSatisfaction(lines, [row()], undefined, now)).toMatchObject({ covered: 1, total: 2, coverage: "partial", qualification: { kind: "not-evaluated" } });
    expect(assessPassengerSatisfaction(lines, [row(), tramObservation], undefined, now)).toMatchObject({ covered: 2, coverage: "incomparable", qualification: { kind: "not-evaluated" } });
    expect(assessPassengerSatisfaction([line(metro)], [row({ year: 2023 })], undefined, now)).toMatchObject({ covered: 0, coverage: "stale", rows: [{ observations: [{ year: 2023 }] }] });
    expect(assessPassengerSatisfaction(lines, [], undefined, now)).toMatchObject({ covered: 0, coverage: "missing", qualification: { kind: "not-evaluated" } });
    expect(assessPassengerSatisfaction(lines, undefined, "error", now).coverage).toBe("error");
  });

  it("checks mode and commercial naming independently of official identity and preserves separate operators", () => {
    const rer = line({ ...metro, id: "C01743", code: "B", label: "RER B", mode: "RER" });
    const b = row({ lineId: "C01743", label: "RER B", mode: "RER" });
    const observed = assessPassengerSatisfaction([rer], [b, { ...b, operator: "SNCF", percent: 76.4042 }], undefined, now);
    expect(observed).toMatchObject({ coverage: "incomparable", covered: 1, rows: [{ observations: [{ operator: "RATP" }, { operator: "SNCF" }] }] });
    expect(assessPassengerSatisfaction([rer], [b], undefined, now).coverage).toBe("incomparable");
    for (const candidates of [[row({ mode: "TRAM" })], [row({ label: "Métro 12" })], [row({ lineId: "C01384" })], [row(), row()]]) {
      expect(assessPassengerSatisfaction([line(metro)], candidates, undefined, now).coverage).toBe("missing");
    }
    expect(assessPassengerSatisfaction([{ ...line(metro), sourceLineId: "C01384" }], [row()], undefined, now).coverage).toBe("missing");
    expect(assessPassengerSatisfaction([line(metro), line({ ...metro, id: "C01383" })], [row()], undefined, now).coverage).toBe("missing");
    expect(assessPassengerSatisfaction([line(metro), line({ ...tram, code: "13" })], [row()], undefined, now).covered).toBe(1);
    expect(assessPassengerSatisfaction([line({ ...metro, code: "C01383", label: "13" })], [row()], undefined, now).covered).toBe(1);
  });

  it("uses the same quality share as regularity and keeps the fallback when the survey is ineligible", () => {
    const base = buildTransportFactsContext({ stations: [], stationsLoaded: true, places: [], placesLoaded: false });
    const serviceQuality = { lines: [], score: 86, trendDelta: 0, yearsUsed: [2025] };
    const assess = (observations: PassengerSatisfactionObservation[]) => assessPassengerSatisfaction([line(metro)], observations, undefined, now);
    const score = (observations: PassengerSatisfactionObservation[]) => calculateTransportScoreDetails({ ...base, serviceQuality, passengerSatisfaction: assess(observations) });
    expect(score([row({ percent: 78 })]).score).toBe(0);
    expect(score([row({ percent: 78 })]).group.rows.find(r => r.labelKey.endsWith(".transportQuality"))?.value).toBeUndefined();
    expect(score([]).score).toBeCloseTo(8.6);
    expect(score([]).group.rows.find(r => r.labelKey.endsWith(".transportSatisfaction"))?.value).toBeUndefined();
  });
});
