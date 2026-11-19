/** Municipal records matched to the existing OSM catalogue by stable feature ID.
 * Multiple mapped halls or sections can represent one market. */
export interface DocumentedFoodMarket {
  placeIds: readonly string[];
  name?: string;
  openingHours: string;
  traders?: number;
  areaM2?: number;
  sourceUrl: string;
  sourceName: string;
}

export const DOCUMENTED_FOOD_MARKETS: readonly DocumentedFoodMarket[] = [
  {
    // Place Patrick Devedjian, Antony. The City documents the trader count
    // and regular sessions for the whole market, including its outdoor stalls.
    placeIds: ["way:81124460", "way:1296663566", "way:1296663567", "way:1319196541", "way:25934760"],
    name: "Marché d’Antony",
    openingHours: "Tu,Th,Su 07:30-13:30",
    traders: 200,
    sourceUrl: "https://www.ville-antony.fr/marche",
    sourceName: "Ville d’Antony",
  },
];
