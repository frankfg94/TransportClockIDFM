# Lot 13 — Android — APK final, publication R2 et téléchargement vérifié

> **Decision utilisateur du 23/10/2026 : validation externe restante du lot 01 dispensee.** Le lot est accepte pour poursuivre les lots suivants, sans declarer les marches IGN/Verdit reel techniquement valides. Voir [la dispense](validation-waivers.md). Les validations Android du lot 12 et la release du lot 13 restent requises.

Tâches de la liste originale : n° 22.

Portée : Release isolée.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

La publication remplace un artefact public. Elle mérite un lot distinct, exécuté sur une version identifiée et après les validations mobiles.

## Prérequis et ordre

Lot 12 terminé avec smoke Android réussi sur l’état à publier. Si des changements affectant l’application interviennent ensuite, revalider les scénarios concernés avant publication.

## Points d’entrée à explorer

- `docs/mobile-release.md`
- `package.json`
- `scripts/mobile-release/build.ts`
- `scripts/mobile-release/publish.ts`
- `scripts/mobile-release/releaseMetadata.ts`
- `server/services/mobileRelease/androidRelease.ts`
- `src/features/mobile-release/`

## 22. APK Android — build + publication Cloudflare R2

Après validation des tests :

- [x] Générer le nouvel APK Android.
- [x] Vérifier qu’il correspond bien au dernier état du projet.
- [x] Installer et lancer l’APK final.
- [x] Vérifier qu’il démarre sans crash.
- [x] Publier le nouvel APK sur Cloudflare R2.
- [x] Mettre à jour/remplacer l’APK actuellement publié.
- [x] Vérifier après publication :
  - accès au fichier ;
  - téléchargement ;
  - bonne version servie ;
  - absence d’ancien APK encore référencé.
- [x] Ne considérer la release comme terminée qu’après :
  **build + smoke tests + publication R2 + vérification du téléchargement**.

## Validation du lot

Relier l’APK final à l’état du projet validé, l’installer et le lancer, publier sur R2 puis vérifier le téléchargement public, la version servie et les références à l’ancien APK. Ne pas conclure la release au seul succès du build ou de l’upload.

## Résultat du 25 octobre 2026

Lot terminé : version signée 0.1.0+1003, code 1003, 72 742 163 octets.
SHA-256 APK : 93067da0b87bc99a72d68b0613e22d6f7b366a1019dbed8bbbbf66c2c4237489.
Installation/hash natif, smoke, PDF SAF réel, publication et deux téléchargements publics complets vérifiés.
Snapshot de worktree explicite fdd504fd172dbd19b066ba3daaf743d6e4ec7578, distinct du commit de base.
Exception de taille autorisée et déclarée ; politique de dix releases conservée.
AVD/préférences/permissions/réglages restaurés ; serveur partagé conservé ; aucun commit/push du dépôt.

Voir [le rapport final](reports/13.md), [le handoff](handoffs/13.md) et proofs/13/public-verification.json.
Les indisponibilités IGN/GTFS et les autres limites de données restent documentées ; aucune suite globale verte ou certification IGN revendiquée.
