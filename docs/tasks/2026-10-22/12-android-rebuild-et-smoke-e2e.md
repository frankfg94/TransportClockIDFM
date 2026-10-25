# Lot 12 — Android — rebuild actuel et smoke E2E sur émulateur

> **Decision utilisateur du 23/10/2026 : validation externe restante du lot 01 dispensee.** Le lot est accepte pour poursuivre les lots suivants, sans declarer les marches IGN/Verdit reel techniquement valides. Voir [la dispense](validation-waivers.md). Les validations Android du lot 12 et la release du lot 13 restent requises.

Tâches de la liste originale : n° 21.

Portée : Validation mobile complète.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

Le rebuild et le smoke sur toutes les pages importantes demandent un environnement et des preuves Android propres. Les isoler permet de tester un état intégré du projet une fois les corrections appliquées.

## Prérequis et ordre

Après les lots fonctionnels 01 à 11 destinés à cette release, notamment le lot 11. Fournir au lot 13 l’état exact testé, les commandes, résultats et éventuels blocages.

## Points d’entrée à explorer

- `AGENTS.md`
- `package.json`
- `docs/mobile-release.md`
- `android/`
- `scripts/mobile-release/`
- `src/features/mobile-release/`

## Précisions de cadrage

Ce lot valide l’intégration mobile. La génération de l’APK final, son installation de contrôle et sa publication sont regroupées dans le lot 13, qui consomme le résultat de ce smoke.

## 21. Rebuild application mobile + smoke E2E Android

La version mobile actuelle date d’environ un mois.

- [x] Recompiler l’application mobile avec la version actuelle du projet.
- [x] Utiliser l’émulateur Android.
- [x] Faire un smoke E2E sur toutes les pages importantes.

Vérifier au minimum :

- ouverture de la page ;
- absence de crash ;
- navigation ;
- navigation retour ;
- chargement des données ;
- cartes ;
- modales ;
- boutons ;
- interactions principales ;
- layout mobile ;
- scroll ;
- composants fullscreen.

Inclure notamment le test du scroll de `FullscreenStationModal` en mode liste dense.

## Validation du lot

Recompiler et exécuter réellement sur l’émulateur Android. Identifier les pages importantes depuis la navigation actuelle, consigner les scénarios et résultats, et inclure explicitement la longue liste dense du panneau station. Une compilation seule ne valide pas le smoke E2E.

## Résultat intégré du 25 octobre 2026

**completed_with_findings**, debug smoke9 réellement reconstruit/installé et contrôlé sur l’AVD dédié. PDF SAF Android délivré, recherche carte/Retour/focus/adresses corrigés dans les réservations accordées ; scroll dense réel et pages importantes contrôlés.55/55 tests ciblés, typecheck et diff check : exit 0. Rapport et preuves distinguent chaque binaire, les captures écartées et les réserves : OOM debug historique, marche IGN non certifiée, test préexistant de fraîcheur, sources Health/Feed et taille supérieure au seuil release.

- [Rapport final](reports/12.md)
- [Transmission au coordinateur](handoffs/12.md)
- [Contrôles finaux](proofs/12/smoke9-final-evidence-checks.json)
- [Nettoyage vérifié](proofs/12/smoke9-cleanup-final.json)

APK debug conservé : 90681484 octets, SHA256 `ba9096fe7f0fb7f8edfc109d62a402f0e2c39bd6812e0007c9bace1055125fda`. Préférences/APK initiaux de l’AVD restaurés, temporaires QA nettoyés et serveur partagé sur le port 3000 maintenu. Aucune publication ou release13 exécutée ; registre laissé au coordinateur.
