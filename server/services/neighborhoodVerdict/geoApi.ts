interface GeoCommuneApiRecord {
  code: string;
  nom: string;
  codeDepartement?: string;
}

export interface AdministrativeLocation {
  commune: { code: string; name: string };
  departmentCode: string;
}

const cache = new Map<string, { expiresAt: number; value: AdministrativeLocation }>();

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
