# Transport Clock GPT

Application Vue 3 + TypeScript + Vite affichant les prochains passages IDFM PRIM pour :

- Tram T10 à Les Peintres, avec les deux quais.
- RER B à La Croix de Berny.
- Transilien J à Gare Saint-Lazare.

## Lancer le projet

```powershell
npm.cmd install
npm.cmd run dev
```

Puis ouvrir `http://127.0.0.1:5173`.

La clé PRIM est lue depuis `.env.local` via `IDFM_API_KEY`. Vite proxyfie les appels `"/api/idfm"` vers `https://prim.iledefrance-mobilites.fr/marketplace` et ajoute l'en-tête `apikey` côté serveur de développement.

## Ajouter une ligne ou un arrêt

Modifier `src/config/transitBoards.ts` et ajouter une entrée dans `transitBoards`.

Chaque tableau contient :

- `line.ref` : identifiant SIRI de la ligne, par exemple `STIF:Line::C02528:`.
- `monitoringPoints` : un ou plusieurs arrêts/quais à interroger.
- `directionGroups` : sous-groupes d'affichage, avec les règles de correspondance par quai, destination ou point d'arrêt.
- `schedule` : références Navitia v2 utilisées pour calculer le dernier passage théorique du jour.
- `maxDepartures` : nombre de passages affichés.

Exemple :

```ts
{
  id: "nouvelle-ligne-mon-arret",
  title: "Mon arrêt",
  city: "Ma ville",
  line: {
    ref: "STIF:Line::C00000:",
    shortName: "X",
    longName: "Ligne X",
    mode: "tram",
    color: "#0064ff",
    textColor: "#ffffff",
  },
  monitoringPoints: [
    {
      ref: "STIF:StopPoint:Q:000000:",
      label: "Direction exemple",
    },
  ],
  directionGroups: [
    {
      id: "direction-exemple",
      label: "Exemple",
      match: {
        monitoringRefs: ["STIF:StopPoint:Q:000000:"],
        destinationIncludes: ["Exemple"],
      },
    },
  ],
  schedule: {
    lineRef: "line:IDFM:C00000",
    stopAreaRef: "stop_area:IDFM:00000",
  },
  maxDepartures: 8,
}
```

Pour une gare RER, un `MonitoringRef` de zone comme `STIF:StopArea:SP:46007:` permet de remonter plusieurs quais.

## Architecture préparée pour l'ajout de stations

- `src/storage/transitPreferences.ts` centralise les préférences persistées en `localStorage`.
- `visibleBoardIds` permet de masquer ou afficher un tableau sans le supprimer.
- `collapsedDirectionIds` garde l'état des accordéons par direction.
- `customBoards` est prêt pour stocker les futurs tableaux ajoutés par l'utilisateur.
- `src/services/boardBuilder.ts` contient les types et helpers pour transformer une sélection ligne + station en `TransitBoardConfig`.
- `src/components/StationBoardModal.vue` pilote le parcours complet API : réseau/mode IDFM, lignes associées, stations de la ligne, puis ajout du tableau.
