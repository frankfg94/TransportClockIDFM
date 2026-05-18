# Transport Clock GPT

Application Nuxt 3 + Vue 3 + TypeScript affichant les prochains passages IDFM PRIM et les schémas de desserte.

## Lancer le projet

```powershell
npm.cmd install
npm.cmd run dev
```

Puis ouvrir `http://127.0.0.1:3000` ou l'URL affichée par Nuxt.

La clé PRIM est lue depuis `.env.local` via `IDFM_API_KEY`. Les appels `"/api/idfm"` passent par la route Nitro `server/api/idfm/[...path].ts`, ce qui évite d'exposer la clé au navigateur.

## Build et déploiement Cloudflare Pages

```powershell
npm.cmd run build
```

Nuxt/Nitro génère une sortie Cloudflare Pages dans `dist`.

Configuration conseillée :

- Build command : `npm run build`
- Build output directory : `dist`
- Environment variable : `IDFM_API_KEY`

## Topologies hors-ligne

Le backend expose `GET /api/lines/:lineId/topology`.

Les topologies de test sont construites depuis des fixtures JSON versionnées :

- `tests/fixtures/idfm/raw/transilien-j.json`
- `tests/fixtures/idfm/raw/rer-b.json`
- `tests/fixtures/idfm/raw/rer-d.json`

Les attendus métier sont dans `tests/fixtures/topology/expected`.

Lancer les tests :

```powershell
npm.cmd run test
```

Le script manuel suivant télécharge des snapshots PRIM bruts dans `tests/fixtures/idfm/downloaded`. Il ne remplace pas automatiquement les fixtures validées :

```powershell
npm.cmd run download-idfm-fixtures
```

## Ajouter une ligne ou un arrêt

Les tableaux par défaut sont dans `src/config/transitBoards.ts`.

Pour la modal d'ajout, `src/services/boardBuilder.ts` transforme une sélection ligne + station en `TransitBoardConfig`, puis les préférences sont persistées via `src/storage/transitPreferences.ts`.
