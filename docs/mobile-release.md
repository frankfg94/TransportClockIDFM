# Distribution APK Android

Cette feature est isolée dans `src/features/mobile-release`, `server/services/mobileRelease` et `scripts/mobile-release`.
Elle ne propose une APK que lorsque le manifest R2 est associé au SHA Git injecté par Cloudflare Pages (`CF_PAGES_COMMIT_SHA`). Entre le déploiement web et le build Android du même commit, la carte Paramètres reste volontairement désactivée.

## Stockage R2 et Cloudflare Pages

1. Créez un bucket R2 privé, par exemple `transport-clock-mobile-releases`. Ne le rendez pas public.
2. Dans **Cloudflare Pages > Settings > Bindings**, ajoutez le bucket avec le nom `MOBILE_RELEASES_BUCKET`. Le binding ne sert qu'en lecture depuis les routes Nitro.
3. Déployez l'application. Les routes suivantes seront alors disponibles :
   - `GET /api/mobile/android/release?revision=<sha>` retourne l'état et les métadonnées ;
   - `GET /api/mobile/android/release/download?revision=<sha>` télécharge l'APK validée avec `Content-Disposition`.

Les objets sont écrits sous `mobile-releases/android/<commit-sha>/`. Le serveur vérifie le schéma du manifest, la taille, les SHA-256 et le chemin attendu avant de proposer le téléchargement. Le binding Pages ne contient aucun identifiant R2 d'écriture.

## Configuration GitHub Actions

Le workflow `.github/workflows/mobile-release.yml` tourne à chaque push sur `main` et peut aussi être lancé manuellement. Il construit l'APK à partir du checkout, donc de la même révision que celle injectée à la compilation Nuxt.

Ajoutez les secrets GitHub suivants :

- `ANDROID_KEYSTORE_BASE64` : fichier `.jks` release encodé en Base64 ;
- `MOBILE_RELEASE_KEYSTORE_PASSWORD`, `MOBILE_RELEASE_KEY_ALIAS`, `MOBILE_RELEASE_KEY_PASSWORD` ;
- `MOBILE_RELEASE_R2_ACCESS_KEY_ID`, `MOBILE_RELEASE_R2_SECRET_ACCESS_KEY` : token R2 avec accès au seul bucket APK.

Ajoutez les variables GitHub non secrètes suivantes :

- `NUXT_PUBLIC_API_BASE_URL` : URL HTTPS de l'API Nuxt déployée ;
- `MOBILE_RELEASE_R2_ENDPOINT` : `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` ;
- `MOBILE_RELEASE_R2_BUCKET` : nom du bucket privé.

Le numéro de run GitHub devient `versionCode`, donc il augmente à chaque release. L'APK est vérifiée par `apksigner` et l'empreinte de son certificat est extraite automatiquement ; le SHA-256 du fichier et sa taille sont ensuite inscrits au manifest. Au-delà de 25 Mio, la publication échoue ; seul un lancement manuel avec `approve_oversize=true` autorise l'exception. La publication conserve les dix releases R2 les plus récentes.

## Publication locale

Copiez `.env.mobile-release.example` dans `.env.mobile-release`, renseignez ses variables puis exécutez :

```powershell
npm run apk:build
npm run apk:publish
```

Les scripts chargent automatiquement `.env.mobile-release`, sans écraser une variable explicitement fournie dans le terminal ou dans GitHub Actions. `apk:build` génère `dist/mobile-release/manifest.json` et l'APK signée. `apk:publish` relit et revalide l'APK avant tout upload. Les deux commandes refusent une arborescence Git modifiée, un SHA de commit incohérent, une empreinte de certificat différente ou une APK au-dessus de 25 Mio. Pour l'exception de taille seulement :

```powershell
npm run apk:build -- --approve-oversize
npm run apk:publish -- --approve-oversize
```

La rétention de dix APK plafonne le stockage à environ 250 Mio avec la limite de 25 Mio. Configurez tout de même une alerte de budget R2 : les opérations restent facturables au-delà du quota gratuit.
