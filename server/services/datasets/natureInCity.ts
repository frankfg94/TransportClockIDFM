import type { DatasetInfo } from "../../../src/features/health/types";
import { NATURE_IN_CITY_ID, NATURE_IN_CITY_URL } from "../../../shared/natureInCity";
import { freshnessFromDate } from "../../../shared/datasets/freshness";
import { natureDatasetSource, readNatureManifest, readNatureStatus } from "../neighborhoodVerdict/natureInCity";
import type { NetexRuntimeEnv } from "../topology/netexCache";

export async function getNatureDatasetInfo(env: NetexRuntimeEnv): Promise<DatasetInfo> {
  const source = natureDatasetSource(env);
  const [manifest, lastCheck] = await Promise.all([
    readNatureManifest(env).catch(() => undefined),
    readNatureStatus(env).catch(() => undefined),
  ]);
  return {
    id: NATURE_IN_CITY_ID,
    title: "IGN Nature en ville",
    description: "Couverture arborée par adresse, commune et IRIS pour le Verdict.",
    state: manifest ? manifest.sources.length === 8 ? "available" : "partial" : lastCheck?.result === "error" ? "error" : "missing",
    storage: source.startsWith("r2:") ? "cloudflare-r2" : source.startsWith("http") ? "http" : "local",
    format: "GeoPackage → JSON",
    sourceUrl: NATURE_IN_CITY_URL,
    license: { label: "Licence Ouverte 2.0", url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/" },
    referencePeriod: manifest?.period,
    generatedAt: manifest?.generatedAt,
    freshness: freshnessFromDate(lastCheck?.result !== "error" ? lastCheck?.checkedAt : undefined, 14, 30),
    coveredCommunes: manifest && Object.keys(manifest.communes).length,
    lastCheck,
    metrics: manifest ? [
      { label: "Communes couvertes", value: String(Object.keys(manifest.communes).length) },
      { label: "Communes contrôlées avec les indicateurs IGN", value: String(manifest.verifiedCommunes) },
      { label: "Départements traités", value: manifest.sources.map(source => source.department).join(", ") },
    ] : undefined,
    details: lastCheck && `${lastCheck.result} · ${lastCheck.checkedAt}`,
  };
}
