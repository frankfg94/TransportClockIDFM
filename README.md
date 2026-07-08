# Transport Clock GPT

[![FR](https://img.shields.io/badge/lang-FR-blue.svg)](README.md)
[![EN](https://img.shields.io/badge/lang-EN-lightgrey.svg)](README.en.md)

Application Nuxt 3 + Vue 3 + TypeScript affichant les prochains passages IDFM PRIM et les schemas de desserte.

- Donnees PRIM IDFM pour l'affichage des prochains horaires.
- Donnees NeTEx pour la generation dynamique des plans de chaque ligne.
- Interface internationalisee en francais et en anglais.

La procedure de distribution APK Android est documentee dans [docs/mobile-release.md](docs/mobile-release.md).
Le fonctionnement i18n est documente dans [docs/i18n.md](docs/i18n.md).

## Lancer le projet

```powershell
npm.cmd install
npm.cmd run dev
```

Puis ouvrir `http://localhost:3000` ou l'URL affichee par Nuxt.

La cle PRIM est lue depuis `.env.local` via `IDFM_API_KEY`. Les appels `"/api/idfm"` passent par la route Nitro `server/api/idfm/[...path].ts`, ce qui evite d'exposer la cle au navigateur.

## Internationalisation

Tout texte visible par l'utilisateur doit passer par `src/i18n` plutot que par une chaine brute dans un composant.

```vue
<script setup lang="ts">
import { useI18n } from "../src/i18n";

const { t } = useI18n();
</script>

<template>
  <button>{{ t("common.actions.save") }}</button>
</template>
```

Quand une nouvelle chaine est ajoutee, il faut ajouter la meme cle dans `src/i18n/messages/fr.ts` et `src/i18n/messages/en.ts`. Le typage TypeScript verifie que les deux catalogues ont la meme structure. La langue se change depuis les parametres; le mode automatique utilise le francais si la timezone du navigateur est `Europe/Paris`, sinon l'anglais.

## Diagnostic Unlighthouse

Construisez puis lancez la version Cloudflare Pages dans un terminal :

```powershell
yarn.cmd build
yarn.cmd preview
```

Puis, dans un second terminal, lancez l'exploration et l'audit mobile par defaut :

```powershell
yarn.cmd unlighthouse
```

Unlighthouse explore les routes de l'application, affiche l'URL locale de son tableau de bord et ecrit son cache et ses rapports dans `.unlighthouse/`. Pour un audit desktop, ajoutez l'option :

```powershell
yarn.cmd unlighthouse --desktop
```

## Build et deploiement Cloudflare Pages

```powershell
npm.cmd run build
```

Nuxt/Nitro genere une sortie Cloudflare Pages dans `dist`.

Configuration conseillee :

- Build command : `npm run build`
- Build output directory : `dist`
- Environment variable : `IDFM_API_KEY`
- Optional remote cache variable : `IDFM_NETEX_CACHE_REMOTE`
- Optional local cache variable : `IDFM_NETEX_CACHE_LOCAL`

## Cache NeTEx hors ligne

Le frontend lit le cache JSON genere par `idfm-node-backend`. En local, il cherche automatiquement :

```txt
../idfm-node-backend/public/data/netex
```

Les donnees NeTEx ne sont pas obligatoires pour faire fonctionner l'application, mais un warning s'affichera et les plans de lignes ne pourront pas etre generes sans ce cache.

Pour mettre a jour le cache NeTEx :

```powershell
rclone copy . <Votre remote cache NeTEx formate>:idfm-backend-netex-cache/netex/current --progress --transfers 16 --checkers 32 --fast-list
```

Tu peux indiquer explicitement le cache NeTEx avec deux variables separees. `IDFM_NETEX_CACHE_REMOTE` est prioritaire et force un cache distant R2 prive ou HTTP(S). `IDFM_NETEX_CACHE_LOCAL` force un dossier local. Si aucune des deux variables n'est definie, Nuxt cherche automatiquement le cache local de developpement.

```powershell
$env:IDFM_NETEX_CACHE_LOCAL="C:\Users\franc\AndroidStudioProjects\VibeIDFM\idfm-node-backend\public\data\netex"
```

Exemple R2 prive, recommande en production :

```powershell
$env:IDFM_NETEX_CACHE_REMOTE="r2://idfm-backend-netex-cache/netex/current"
$env:R2_ACCOUNT_ID="<cloudflare-account-id>"
$env:R2_ACCESS_KEY_ID="<r2-access-key-id>"
$env:R2_SECRET_ACCESS_KEY="<r2-secret-access-key>"
```

Avec `r2://`, les fichiers JSON restent prives : le navigateur ne recoit jamais les credentials R2 et ne peut pas lire le bucket directement. Seul le backend Nitro de Nuxt signe les requetes R2 serveur a serveur.

Exemple HTTP public, utile seulement pour tester rapidement :

```powershell
$env:IDFM_NETEX_CACHE_REMOTE="https://pub-xxxxx.r2.dev/netex/current"
```

L'endpoint Nuxt `GET /api/lines/:lineId/topology` adapte ces JSON au modele UI. Le graphe visuel consomme le contrat `schematic` genere cote backend, sans appeler Navitia pour reconstruire la topologie.

Lancer les tests :

```powershell
npm.cmd run test
```

## Version mobile Capacitor

Le front Nuxt est embarque en statique; les routes Nitro `/api/*` restent sur le deploiement Cloudflare. Copier `.env.capacitor.example` vers `.env.capacitor` (il est ignore par Git) et renseigner l'URL publique du backend :

```txt
CAPACITOR_BUILD=true
NUXT_PUBLIC_API_BASE_URL=https://votre-deploiement.pages.dev
```

Puis generer et synchroniser l'application Android :

```powershell
npm.cmd run build:capacitor
npm.cmd run capacitor:sync
npm.cmd run capacitor:android
```

Deployer d'abord cette version du backend Nuxt : elle ajoute les en-tetes CORS necessaires aux appels depuis le WebView mobile.

Le meme front pourra ensuite recevoir la plateforme iOS sur un Mac via `npx cap add ios`.

## API Home Assistant

L'integration Home Assistant utilise une API serveur versionnee et stateless :

- `GET /api/ha/v1/info`
- `GET /api/ha/v1/catalog/families`
- `GET /api/ha/v1/catalog/lines?family=&q=`
- `GET /api/ha/v1/catalog/stations?family=&lineId=&q=`
- `GET /api/ha/v1/catalog/directions?family=&lineId=&stationId=`
- `POST /api/ha/v1/boards`

Le token Bearer est optionnel. Pour le rendre obligatoire :

```powershell
$env:TRANSPORT_CLOCK_HA_TOKEN="<token>"
$env:TRANSPORT_CLOCK_INSTANCE_ID="<identifiant-stable>"
```

`TRANSPORT_CLOCK_INSTANCE_ID` doit rester stable entre les deploiements afin que Home Assistant reconnaisse toujours la meme instance.

## Ajouter une ligne ou un arret

Les tableaux par defaut sont dans `src/config/transitBoards.ts`.

Pour la modal d'ajout, `src/services/boardBuilder.ts` transforme une selection ligne + station en `TransitBoardConfig`, puis les preferences sont persistees via `src/storage/transitPreferences.ts`.
