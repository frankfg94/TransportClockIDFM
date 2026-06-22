# Distribution APK Android

Cette feature est isolée dans `src/features/mobile-release`, `server/services/mobileRelease` et `scripts/mobile-release`.
Par défaut, elle propose la dernière APK Android valide publiée. Elle ne dépend donc ni de `CF_PAGES_COMMIT_SHA`, ni d’un déploiement Pages effectué au même moment que le build Android.

Si `CF_PAGES_COMMIT_SHA` est disponible, l’application préfère l’APK du même commit. C’est une vérification supplémentaire optionnelle : si elle ne trouve pas cette APK, la dernière release valide reste téléchargeable.

## Stockage R2 et Cloudflare Pages

1. Créez un bucket R2, par exemple `transport-clock-mobile-releases`.
2. Le mode privé recommandé utilise un binding Pages **optionnel** nommé `MOBILE_RELEASES_BUCKET`, en lecture seule depuis les routes Nitro.
3. Déployez l'application. En mode privé, les routes suivantes seront disponibles :
   - `GET /api/mobile/android/release` retourne la dernière release valide ; `?revision=<sha>` préfère la release de ce commit lorsqu’elle existe ;
   - `GET /api/mobile/android/release/download?revision=<sha>` télécharge l'APK validée avec `Content-Disposition`.

Les objets sont écrits sous `mobile-releases/android/<commit-sha>/`, avec un manifest `mobile-releases/android/latest.json` mis à jour à chaque publication. Le serveur vérifie le schéma du manifest, la taille, les SHA-256 et le chemin attendu avant de proposer le téléchargement. Le binding Pages ne contient aucun identifiant R2 d'écriture.

### Accès public sans serveur Pages (optionnel)

Pour ne pas dépendre du serveur Pages, associez un domaine public au bucket R2 puis définissez, au build Nuxt/Capacitor :

```env
NUXT_PUBLIC_MOBILE_RELEASE_BASE_URL=https://downloads.example.com
```

L’application lira alors directement `https://downloads.example.com/mobile-releases/android/latest.json` et téléchargera l’APK depuis ce même domaine. En l’absence de cette variable, elle utilise automatiquement l’API Pages et son binding R2 privé.

## Configuration GitHub Actions

Le workflow `.github/workflows/mobile-release.yml` tourne à chaque push sur `main` et peut aussi être lancé manuellement. Il construit et publie une release versionnée par le commit du checkout, sans attendre le déploiement Pages correspondant.

Ajoutez les secrets GitHub suivants :

- `ANDROID_KEYSTORE_BASE64` : fichier `.jks` release encodé en Base64 ;
- `MOBILE_RELEASE_KEYSTORE_PASSWORD`, `MOBILE_RELEASE_KEY_ALIAS`, `MOBILE_RELEASE_KEY_PASSWORD` ;
- `MOBILE_RELEASE_R2_ACCESS_KEY_ID`, `MOBILE_RELEASE_R2_SECRET_ACCESS_KEY` : token R2 avec accès au seul bucket APK.

Ajoutez les variables GitHub non secrètes suivantes :

- `NUXT_PUBLIC_API_BASE_URL` : URL HTTPS de l'API Nuxt déployée ;
- `NUXT_PUBLIC_MOBILE_RELEASE_BASE_URL` : domaine public R2, uniquement pour le mode sans serveur Pages ;
- `MOBILE_RELEASE_R2_ENDPOINT` : `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` ;
- `MOBILE_RELEASE_R2_BUCKET` : nom du bucket privé.

Le numéro de run GitHub devient `versionCode`, donc il augmente à chaque release. L'APK est vérifiée par `apksigner` et l'empreinte de son certificat est extraite automatiquement ; le SHA-256 du fichier et sa taille sont ensuite inscrits au manifest. Au-delà de 25 Mio, la publication échoue ; seul un lancement manuel avec `approve_oversize=true` autorise l'exception. La publication conserve les dix releases R2 les plus récentes.

## Publication locale

Copiez `.env.mobile-release.example` dans `.env.mobile-release`, renseignez ses variables puis exécutez :

```powershell
npm run apk:build
npm run apk:publish
```

Les scripts chargent automatiquement `.env.mobile-release`, sans écraser une variable explicitement fournie dans le terminal ou dans GitHub Actions. `apk:build` génère `dist/mobile-release/manifest.json` et l'APK signée. `apk:publish` relit et revalide l'APK avant tout upload. Les deux commandes refusent une arborescence Git modifiée, un SHA de commit incohérent ou une APK au-dessus de 25 Mio. Pour l'exception de taille seulement :

```powershell
npm run apk:build -- --approve-oversize
npm run apk:publish -- --approve-oversize
```

La rétention de dix APK plafonne le stockage à environ 250 Mio avec la limite de 25 Mio. Configurez tout de même une alerte de budget R2 : les opérations restent facturables au-delà du quota gratuit.
