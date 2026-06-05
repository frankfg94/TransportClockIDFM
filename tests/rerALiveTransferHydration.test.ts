import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTransferBundleResponse } from "../server/api/transfer-bundles.post";
import { buildLinePatternView } from "../server/services/servicePattern/buildLinePatternView";
import {
  collectTransferBundleTargets,
  type TransferBundleTarget,
} from "../src/features/service-pattern/transferBundles";
import type { TransferLineOption } from "../src/types/transit";

interface LiveTransferExpectation {
  expected: string[];
  station: string;
}

const RER_A_LINE_ID = "line:IDFM:C01742";
const RER_A_LINE_LABEL = "RER A";
const METRO_4_LINE_ID = "line:IDFM:C01374";
const METRO_4_LINE_LABEL = "Métro 4";

const RER_A_AUBER_BATCH_EXPECTATIONS: LiveTransferExpectation[] = [
  { station: "Gare de Lyon", expected: ["1", "14", "D", "R"] },
  { station: "Châtelet - Les Halles", expected: ["4", "B", "D"] },
  { station: "Auber", expected: ["3", "7", "8", "9", "E"] },
  { station: "Charles de Gaulle - Étoile", expected: ["1", "2", "6"] },
  { station: "La Défense", expected: ["1", "E", "L", "U", "T2"] },
];

const METRO_4_CHATELET_BATCH_EXPECTATIONS: LiveTransferExpectation[] = [
  { station: "Saint-Michel", expected: ["10", "B", "C"] },
  { station: "Châtelet", expected: ["1", "7", "11", "14", "A", "B", "D"] },
  { station: "Les Halles", expected: ["A", "B", "D"] },
  { station: "Réaumur - Sébastopol", expected: ["3"] },
];

const liveApiKey = readLiveIdfmApiKey();
const describeLive =
  liveApiKey && process.env.LIVE_IDFM_TRANSFER_TESTS === "1"
    ? describe
    : describe.skip;

describeLive("RER A live transfer hydration", () => {
  it(
    "includes the expected nearby transfers in the full UI transfer bundle",
    async () => {
      await expectLiveBundleTransfers({
        currentLineCode: "A",
        anchorStation: "Auber",
        expectations: RER_A_AUBER_BATCH_EXPECTATIONS,
        fallbackLineId: RER_A_LINE_ID,
        lineId: "A",
        lineLabel: RER_A_LINE_LABEL,
        startStationCandidates: ["Le Parc de Saint-Maur"],
        transportType: "rer",
      });
    },
    600_000,
  );
});

describeLive("Métro 4 live transfer hydration", () => {
  it(
    "includes the expected nearby transfers in the full UI transfer bundle",
    async () => {
      await expectLiveBundleTransfers({
        currentLineCode: "4",
        anchorStation: "Châtelet",
        expectations: METRO_4_CHATELET_BATCH_EXPECTATIONS,
        fallbackLineId: METRO_4_LINE_ID,
        lineId: "4",
        lineLabel: METRO_4_LINE_LABEL,
        startStationCandidates: ["Bagneux - Lucie Aubrac"],
        transportType: "metro",
      });
    },
    600_000,
  );
});

async function expectLiveBundleTransfers({
  currentLineCode,
  anchorStation,
  expectations,
  fallbackLineId,
  lineId,
  lineLabel,
  startStationCandidates,
  transportType,
}: {
  currentLineCode: string;
  anchorStation: string;
  expectations: LiveTransferExpectation[];
  fallbackLineId: string;
  lineId: string;
  lineLabel: string;
  startStationCandidates: string[];
  transportType: string;
}): Promise<void> {
  const patternView = await buildLinePatternView({
    lineId,
    startStationCandidates,
    transportType,
  });
  const allTargets = collectTransferBundleTargets(patternView.pattern);
  const targets = collectExpectedTargets(
    allTargets,
    [anchorStation, ...expectations.map((expectation) => expectation.station)],
  );
  const bundle = await createTransferBundleResponse(
    {
      cacheBust: new Date().toISOString(),
      lineId:
        patternView.board.schedule?.lineRef ??
        patternView.board.line.ref ??
        fallbackLineId,
      lineLabel,
      requestConcurrency: 1,
      retentionDays: 15,
      targets,
      transferResolverMode: "nearby",
    },
    {
      fetcher: createRetryingFetcher({
        apikey: liveApiKey!,
        accept: "application/json",
      }),
    },
  );
  const failures: string[] = [];

  expectations.forEach((expectation) => {
    const target = findTargetByStationName(targets, expectation.station);

    if (!target) {
      failures.push(`${expectation.station}: cible absente du pattern NeTEx`);

      return;
    }

    const labels = createTransferLabelSet(
      bundle.transfersByStopAreaRef[target.stopAreaRef] ?? [],
    );
    const missing = expectation.expected.filter((label) => !labels.has(label));

    if (labels.has(currentLineCode)) {
      failures.push(
        `${expectation.station}: contient encore la ligne courante ${currentLineCode}`,
      );
    }

    if (missing.length > 0) {
      failures.push(
        `${expectation.station}: manquantes ${missing.join(", ")} ; obtenues ${[
          ...labels,
        ].join(", ") || "aucune"}`,
      );
    }
  });

  expect(bundle.requestConcurrency).toBe(1);
  expect(bundle.transferResolverMode).toBe("nearby");
  expect(failures).toEqual([]);
}

function collectExpectedTargets(
  targets: TransferBundleTarget[],
  stationNames: string[],
): TransferBundleTarget[] {
  const selectedTargets = new Map<string, TransferBundleTarget>();

  stationNames.forEach((stationName) => {
    const target = findTargetByStationName(targets, stationName);

    if (target) {
      selectedTargets.set(target.stopAreaRef, target);
    }
  });

  return Array.from(selectedTargets.values());
}

function findTargetByStationName(
  targets: TransferBundleTarget[],
  stationName: string,
): TransferBundleTarget | undefined {
  const normalizedStationName = normalizeLiveStationLabel(stationName);
  const exact = targets.find(
    (target) => normalizeLiveStationLabel(target.label) === normalizedStationName,
  );

  if (exact) {
    return exact;
  }

  const stationTokens = createMeaningfulStationTokens(stationName);

  return targets
    .map((target) => ({
      score: scoreStationName(target.label, normalizedStationName, stationTokens),
      target,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)[0]?.target;
}

function scoreStationName(
  targetLabel: string,
  normalizedStationName: string,
  stationTokens: string[],
): number {
  const normalizedTarget = normalizeLiveStationLabel(targetLabel);

  if (
    normalizedTarget.includes(normalizedStationName) ||
    normalizedStationName.includes(normalizedTarget)
  ) {
    return 100;
  }

  const targetTokens = createMeaningfulStationTokens(targetLabel);
  const overlap = stationTokens.filter((token) => targetTokens.includes(token)).length;

  return overlap === 0 ? 0 : overlap / Math.max(1, stationTokens.length);
}

function createMeaningfulStationTokens(value: string): string[] {
  const ignored = new Set(["de", "d", "des", "du", "gare", "la", "le", "les"]);

  return normalizeLiveStationLabel(value)
    .split(/\s+/u)
    .filter((token) => token.length > 1 && !ignored.has(token));
}

function createTransferLabelSet(transfers: TransferLineOption[]): Set<string> {
  return new Set(transfers.map((transfer) => transfer.label));
}

function createRetryingFetcher(headers: Record<string, string>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const retryDelays = [240, 720, 1600, 3200];

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      const response = await fetch(input, {
        ...init,
        headers: {
          ...headers,
          ...(init?.headers as Record<string, string> | undefined),
        },
      });

      if (
        ![429, 500, 502, 503, 504].includes(response.status) ||
        attempt === retryDelays.length
      ) {
        return response;
      }

      await wait(retryDelays[attempt]);
    }

    return fetch(input, init);
  }) as typeof fetch;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, delayMs);
  });
}

function readLiveIdfmApiKey(): string | undefined {
  const fromEnv = process.env.IDFM_API_KEY?.trim();

  if (fromEnv) {
    return fromEnv;
  }

  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return undefined;
  }

  const match = readFileSync(envPath, "utf8").match(/^IDFM_API_KEY=(.+)$/mu);

  return match?.[1]?.trim() || undefined;
}

function normalizeLiveStationLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}


