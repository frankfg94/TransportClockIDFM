export const PASSENGER_SATISFACTION_SOURCE = "https://prim.iledefrance-mobilites.fr/fr/jeux-de-donnees/indicateurs-de-perception-qs";
export const PASSENGER_SATISFACTION_EXPORT = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/indicateurs-de-perception-qs/exports/json";

export interface PassengerSatisfactionObservation {
  lineId: string;
  label: string;
  mode: "METRO" | "TRAM" | "RER" | "TRAIN";
  operator: string;
  contract: string | null;
  year: number;
  percent: number;
}

export function parsePassengerSatisfactionExport(payload: unknown): PassengerSatisfactionObservation[] {
  if (!Array.isArray(payload)) throw new Error("Invalid IDFM perception export");
  const modes = new Map<string, PassengerSatisfactionObservation["mode"]>([
    ["Métro", "METRO"], ["Tramway", "TRAM"], ["Tram-train", "TRAM"], ["Train", "TRAIN"], ["RER", "RER"],
  ]);
  return payload.flatMap(row => {
    if (!row || row.indicateur !== "Indicateur Global de Perception" || row.groupe_de_lignes
      || typeof row.id_line !== "string" || !/^C\d{5}$/u.test(row.id_line)
      || typeof row.ligne !== "string" || !row.ligne.trim() || typeof row.operateur !== "string" || !row.operateur.trim()) return [];
    const mode = modes.get(row.mode);
    const year = Number(row.annee);
    const percent = Number(row.resultat);
    if (!mode || !Number.isInteger(year) || year < 2000 || !/^[0-9]+(?:\.[0-9]+)?$/u.test(String(row.resultat))
      || !Number.isFinite(percent) || percent < 0 || percent > 100) return [];
    return [{ lineId: row.id_line, label: row.ligne, mode, operator: row.operateur,
      contract: row.dsp ? String(row.dsp) : null, year, percent }];
  });
}
