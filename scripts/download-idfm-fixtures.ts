import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_BASE = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia";
const LINES = [
  { slug: "transilien-j", lineId: "line:IDFM:C01795" },
  { slug: "rer-b", lineId: "line:IDFM:C01743" },
  { slug: "rer-d", lineId: "line:IDFM:C01798" },
];

const apiKey = process.env.IDFM_API_KEY?.trim();

if (!apiKey) {
  throw new Error("IDFM_API_KEY is required to download IDFM fixtures.");
}

for (const line of LINES) {
  const payload = await fetchJson(
    `${API_BASE}/lines/${encodeURIComponent(line.lineId)}/routes?count=100&disable_disruption=true&disable_geojson=true`,
  );
  const filepath = resolve(
    "tests",
    "fixtures",
    "idfm",
    "downloaded",
    `${line.slug}.routes.json`,
  );

  await mkdir(dirname(filepath), { recursive: true });
  await writeFile(filepath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`Downloaded ${line.slug} route snapshot -> ${filepath}`);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      apikey: apiKey!,
    },
  });

  if (!response.ok) {
    throw new Error(`IDFM HTTP ${response.status} for ${url}`);
  }

  return response.json();
}
