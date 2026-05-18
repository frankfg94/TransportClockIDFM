import type { ExpectedTopologyFixture, RawLineFixture } from "./types";
import rawRerA from "../../../tests/fixtures/idfm/raw/rer-a.json";
import rawRerB from "../../../tests/fixtures/idfm/raw/rer-b.json";
import rawRerD from "../../../tests/fixtures/idfm/raw/rer-d.json";
import rawTransilienJ from "../../../tests/fixtures/idfm/raw/transilien-j.json";
import rawMetro4 from "../../../tests/fixtures/idfm/raw/metro-4.json";
import expectedRerA from "../../../tests/fixtures/topology/expected/rer-a.expected.json";
import expectedRerB from "../../../tests/fixtures/topology/expected/rer-b.expected.json";
import expectedRerD from "../../../tests/fixtures/topology/expected/rer-d.expected.json";
import expectedTransilienJ from "../../../tests/fixtures/topology/expected/transilien-j.expected.json";
import expectedMetro4 from "../../../tests/fixtures/topology/expected/metro-4.expected.json";

const FIXTURE_ALIASES: Record<string, string> = {
  "line:IDFM:C01742": "rer-a",
  "line:IDFM:C01743": "rer-b",
  "line:IDFM:C01795": "transilien-j",
  "line:IDFM:C01798": "rer-d",
  "line:IDFM:metro-4": "metro-4",
  C01742: "rer-a",
  C01743: "rer-b",
  C01795: "transilien-j",
  C01798: "rer-d",
  a: "rer-a",
  A: "rer-a",
  b: "rer-b",
  B: "rer-b",
  d: "rer-d",
  D: "rer-d",
  "4": "metro-4",
  m4: "metro-4",
  M4: "metro-4",
  "metro-4": "metro-4",
  "metro/4": "metro-4",
  "rer-a": "rer-a",
  j: "transilien-j",
  J: "transilien-j",
  "rer-b": "rer-b",
  "rer-d": "rer-d",
  "transilien-j": "transilien-j",
};
const RAW_FIXTURES: Record<string, RawLineFixture> = {
  "rer-a": rawRerA,
  "rer-b": rawRerB,
  "rer-d": rawRerD,
  "metro-4": rawMetro4,
  "transilien-j": rawTransilienJ,
};
const EXPECTED_FIXTURES: Record<string, ExpectedTopologyFixture> = {
  "rer-a": expectedRerA,
  "rer-b": expectedRerB,
  "rer-d": expectedRerD,
  "metro-4": expectedMetro4,
  "transilien-j": expectedTransilienJ,
};

export function resolveFixtureSlug(lineId: string): string {
  const decoded = decodeURIComponent(lineId);
  const normalized = decoded.trim();

  return FIXTURE_ALIASES[normalized] ?? FIXTURE_ALIASES[normalized.toLowerCase()] ?? normalized;
}

export async function loadRawLineFixture(
  lineId: string,
): Promise<RawLineFixture> {
  const slug = resolveFixtureSlug(lineId);
  const fixture = RAW_FIXTURES[slug];

  if (!fixture) {
    throw new Error(`Raw line fixture not found: ${slug}`);
  }

  return structuredClone(fixture);
}

export async function loadExpectedTopologyFixture(
  lineId: string,
): Promise<ExpectedTopologyFixture> {
  const slug = resolveFixtureSlug(lineId);
  const fixture = EXPECTED_FIXTURES[slug];

  if (!fixture) {
    throw new Error(`Expected topology fixture not found: ${slug}`);
  }

  return structuredClone(fixture);
}
