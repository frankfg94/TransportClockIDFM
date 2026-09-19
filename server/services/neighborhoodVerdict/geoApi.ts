interface GeoCommuneApiRecord {
  code: string;
  nom: string;
  codeDepartement?: string;
}

interface GeoDepartmentApiRecord {
  code: string;
  nom: string;
}

export interface AdministrativeLocation {
  commune: { code: string; name: string };
  departmentCode: string;
}

const cache = new Map<string, { expiresAt: number; value: AdministrativeLocation }>();
const departmentNamesCache = new Map<string, { expiresAt: number; value: Readonly<Record<string, string>> }>();

export async function resolveAdministrativeLocation(
  lat: number,
  lon: number,
): Promise<AdministrativeLocation> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const url = new URL("https://geo.api.gouv.fr/communes");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("fields", "nom,code,codeDepartement");
  url.searchParams.set("format", "json");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API Géo returned HTTP ${response.status}`);
  const records = await response.json() as GeoCommuneApiRecord[];
  const commune = records[0];
  if (!commune?.code || !commune.nom) {
    throw new Error("API Géo did not resolve the supplied coordinates.");
  }
  const value: AdministrativeLocation = {
    commune: { code: commune.code, name: commune.nom },
    departmentCode: commune.codeDepartement ?? commune.code.slice(0, 2),
  };
  cache.set(key, { expiresAt: Date.now() + 30 * 86_400_000, value });
  return value;
}

/** Resolve the display names for the department codes present in IRIS. */
export async function resolveDepartmentNames(
  departmentCodes: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const codes = [...new Set(departmentCodes.map((code) => code.trim()).filter(Boolean))].sort();
  if (codes.length === 0) return {};
  const key = codes.join(",");
  const hit = departmentNamesCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const url = new URL("https://geo.api.gouv.fr/departements");
  for (const code of codes) url.searchParams.append("code", code);
  url.searchParams.set("fields", "nom,code");
  url.searchParams.set("format", "json");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API Géo returned HTTP ${response.status}`);
  const records = await response.json() as unknown;
  const value = Array.isArray(records)
    ? Object.fromEntries(records.flatMap((record): [string, string][] => {
        if (!record || typeof record !== "object") return [];
        const item = record as Partial<GeoDepartmentApiRecord>;
        return typeof item.code === "string" && typeof item.nom === "string" && item.nom.trim()
          ? [[item.code, item.nom.trim()]]
          : [];
      }))
    : {};
  departmentNamesCache.set(key, { expiresAt: Date.now() + 7 * 86_400_000, value });
  return value;
}
