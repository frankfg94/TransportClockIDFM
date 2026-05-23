# Transport Clock GPT

Application Nuxt 3 + Vue 3 + TypeScript affichant les prochains passages IDFM PRIM et les schemas de desserte.

## Lancer le projet

```powershell
npm.cmd install
npm.cmd run dev
```

Puis ouvrir `http://127.0.0.1:3000` ou l'URL affichee par Nuxt.

La cle PRIM est lue depuis `.env.local` via `IDFM_API_KEY`. Les appels `"/api/idfm"` passent par la route Nitro `server/api/idfm/[...path].ts`, ce qui evite d'exposer la cle au navigateur.

## Build et deploiement Cloudflare Pages

```powershell
npm.cmd run build
```

Nuxt/Nitro genere une sortie Cloudflare Pages dans `dist`.

Configuration conseillee :

- Build command : `npm run build`
- Build output directory : `dist`
- Environment variable : `IDFM_API_KEY`
- Optional cache variable : `IDFM_NETEX_CACHE_DIR`

## Cache NeTEx hors-ligne

Le frontend lit le cache JSON genere par `idfm-node-backend`.
En local, il cherche automatiquement :

```txt
../idfm-node-backend/public/data/netex
```

Tu peux forcer le chemin avec :

```powershell
$env:IDFM_NETEX_CACHE_DIR="C:\Users\franc\AndroidStudioProjects\VibeIDFM\idfm-node-backend\public\data\netex"
```

L'endpoint Nuxt `GET /api/lines/:lineId/topology` adapte ces JSON au modele UI.
Le graphe visuel consomme le contrat `schematic` genere cote backend, sans appeler Navitia pour reconstruire la topologie.

Lancer les tests :

```powershell
npm.cmd run test
```

## Ajouter une ligne ou un arret

Les tableaux par defaut sont dans `src/config/transitBoards.ts`.

Pour la modal d'ajout, `src/services/boardBuilder.ts` transforme une selection ligne + station en `TransitBoardConfig`, puis les preferences sont persistees via `src/storage/transitPreferences.ts`.
