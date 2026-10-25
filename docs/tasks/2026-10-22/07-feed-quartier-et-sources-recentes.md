# Lot 07 — Feed quartier — renommage et actualités récentes

Tâches de la liste originale : n° 6.

Portée : Recherche et collecte isolées.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

Le feed possède ses propres sources, collecteurs et caches. La recherche Internet et la vérification des articles récents nécessitent un contexte distinct des cartes et du routage.

## Prérequis et ordre

Aucun prérequis entre les lots.

## Points d’entrée à explorer

- `pages/feed.vue`
- `src/features/transport-news/TransportNewsPage.vue`
- `src/features/transport-news/sources.ts`
- `server/services/transportNews/collector.ts`
- `server/services/transportNews/parser.ts`
- `docs/transport-news.md`
- `scripts/check-transport-news.ts`

## 6. Feed transports → Feed quartier

- [x] Renommer partout `Feed transports` en `Feed quartier`.
- [x] Ajouter/améliorer les sources RSS.
- [x] Cas particulier : prolongement du métro 4 vers Châtenay-Malabry.
- [x] Rechercher les articles récents sur Internet.
- [x] Identifier de nouvelles sources pertinentes.
- [x] Vérifier ensuite que les articles récents apparaissent bien dans l’application.
- [x] Éviter que le feed soit dominé par des articles anciens.

## Validation du lot

Rechercher les articles au moment de l’exécution, noter leurs dates et URL, vérifier les sources et leur collecte, puis constater les articles récents dans l’application après prise en compte des caches. Vérifier dans les sources l’intitulé et l’état du projet de métro 4 mentionné dans la todo.

Preuves du 22 octobre : [rapport 07](reports/07.md), [captures et audits](proofs/07/). Fonctionnel, **30 tests ciblés**, navigateur FR/EN et **TypeScript partagé code 0** vérifiés. Statut **complete**, avec refus de collecte IDFM HTTP 403 explicitement documenté. Aucun APK, déploiement, commit ou push effectué.
