import type { PassengerSatisfactionObservation } from "../../../../../shared/passengerSatisfaction";
import type { GlobalMapLine } from "../../../transport-map/contracts/manifest";
import { normalizeScoreText } from "../primitives";
import type { NeighborhoodQualification } from "../qualification";

export const PASSENGER_SATISFACTION_RULES = { maxAnnualAge: 2, bonusAt: 90, penaltyBelow: 80, bonus: 10, neutral: 5, penalty: 0 } as const;

type SatisfactionLine = Pick<GlobalMapLine, "id" | "sourceLineId" | "code" | "label" | "mode" | "color" | "textColor" | "aliases">;
type Coverage = "loading" | "error" | "missing" | "stale" | "partial" | "incompleteAccess" | "incomparable" | "complete";
export interface PassengerSatisfaction {
  total: number;
  covered: number;
  coverage: Coverage;
  rows: { line: SatisfactionLine; observations: PassengerSatisfactionObservation[] }[];
  qualification: NeighborhoodQualification;
  percent?: number;
  score?: number;
}

// PRIM publishes separate RATP and SNCF observations for these shared lines.
const SHARED_RER_IDS = new Set(["C01742", "C01743"]);
const officialId = (value: string | null | undefined) => value?.match(/^(?:(?:line:)?IDFM:|STIF:Line::)?(C\d{5}):?$/iu)?.[1]?.toUpperCase();
const surveyCode = (value: string) => normalizeScoreText(value).trim().replace(/^(?:(?:metro|rer|train|transilien|tramway|tram|ligne)\s+)+/u, "");

export function assessPassengerSatisfaction(
  lines: readonly SatisfactionLine[],
  observations: readonly PassengerSatisfactionObservation[] | undefined,
  state: "loading" | "error" | undefined,
  now: number,
  accessIncomplete = false,
): PassengerSatisfaction {
  const currentYear = new Date(now).getUTCFullYear();
  const identities = lines.map(line => {
    const ids = new Set([officialId(line.id), officialId(line.sourceLineId)].filter(Boolean));
    return { line, id: ids.size === 1 ? [...ids][0] : undefined, mode: line.mode === "TRANSILIEN" ? "TRAIN" : line.mode };
  });
  const rows = identities.map(({ line, id, mode }) => {
    // The compact map catalogue uses the ID as its code on some lines and
    // exposes the commercial index in the label.
    const code = surveyCode(officialId(line.code) ? line.label : line.code);
    const candidates = id && identities.filter(identity => identity.id === id).length === 1
      ? (observations ?? []).filter(row => row.lineId === id && row.mode === mode && row.year < currentYear)
      : [];
    const accepted = candidates.filter(row => {
      const sameScope = candidates.filter(other => other.operator === row.operator && other.contract === row.contract);
      const latest = Math.max(...sameScope.map(other => other.year));
      // A code corroborates the official ID. It is never a lookup key.
      return row.year === latest && sameScope.filter(other => other.year === latest).length === 1
        && !!code && surveyCode(row.label) === code;
    });
    return { line, observations: accepted.sort((left, right) => left.operator.localeCompare(right.operator)) };
  });
  const recent = rows.map(row => row.observations.filter(observation => currentYear - observation.year <= PASSENGER_SATISFACTION_RULES.maxAnnualAge));
  const covered = recent.filter(values => values.length > 0).length;
  const total = lines.length;
  const base = { total, covered, rows };
  const unscored = (coverage: Coverage, reason: Extract<NeighborhoodQualification, { kind: "not-evaluated" }>["reason"]): PassengerSatisfaction =>
    ({ ...base, coverage, qualification: { kind: "not-evaluated", reason } });
  if (state === "loading" || state === "error") return unscored(state, state);
  if (accessIncomplete) return unscored("incompleteAccess", "insufficient-data");
  if (!covered) return rows.some(row => row.observations.length) ? unscored("stale", "insufficient-data") : unscored("missing", "unavailable");
  if (covered !== total) return unscored("partial", "insufficient-data");
  const first = recent[0]![0]!;
  if (!recent.every(([value, ...additional]) => value && !additional.length && !SHARED_RER_IDS.has(value.lineId)
    && value.year === first.year && value.mode === first.mode && value.operator === first.operator && value.contract === first.contract
    && value.contract === null && (value.operator === "RATP" || value.operator === "SNCF"))) {
    return unscored("incomparable", "insufficient-data");
  }
  // Equal weight per accessible line, with a common annual survey scope.
  const percent = recent.reduce((sum, values) => sum + values[0]!.percent, 0) / total;
  const rules = PASSENGER_SATISFACTION_RULES;
  const qualification = percent >= rules.bonusAt ? "bonus" : percent < rules.penaltyBelow ? "penalty" : "neutral";
  return { ...base, coverage: "complete", qualification: { kind: qualification }, percent, score: rules[qualification] };
}
