# Lot 09 — Optimizer — distinguer marche jusqu’au quai et attente

Tâches de la liste originale : n° 10.

Portée : Correction ciblée du modèle de chronologie.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

La séparation marche/attente modifie les étapes calculées. La traiter avant la carte synchronisée donne à celle-ci un modèle de chronologie déjà cohérent.

## Prérequis et ordre

Aucun prérequis. À terminer avant le lot 10.

## Points d’entrée à explorer

- `pages/optimizer/line/[transportType]/[lineId].vue`
- `src/features/line-optimizer/lineOptimizer.ts`
- `src/features/line-optimizer/useLineOptimizer.ts`
- `src/features/line-optimizer/LineOptimizerPage.vue`
- `tests/lineOptimizer.test.ts`
- `tests/lineOptimizer.dom.test.ts`

## 10. `/optimizer/line` — séparer marche et attente

Problème actuel :

Pour le T10 vers Croix de Berny, l’étape peut mélanger marche jusqu’au quai et attente.

À corriger :

- [x] Séparer :
  - marche jusqu’au quai ;
  - attente sur le quai.
- [x] Créer une étape supplémentaire lorsque nécessaire.
- [x] Ne pas ajouter d’étape attente quand le transport est pris immédiatement.
- [x] Exemple : pas d’attente artificielle pour le tram si on l’attrape tout de suite.

Réalisation et preuves : voir `reports/09.md`. Statut global : **terminé**. Les 28 tests ciblés et les deux contrôles T10 dans Chrome sont réussis. Le typecheck partagé a réussi, code 0, par le lot 03 le 22/10/2026 à 19:05 Europe/Paris ; preuve confirmée par la coordination et correspondance des SHA256 des quatre fichiers du lot 09 vérifiée à la clôture.

## Validation du lot

Vérifier le cas T10 vers Croix de Berny avec une attente réelle puis une prise immédiate. Contrôler les étapes, leurs durées et le total du trajet sans double comptage ni attente artificielle.

- [x] Cas T10 avec attente réelle et prise immédiate contrôlés dans Chrome sur localhost:3000.
- [x] Étapes, durées et total sans double comptage vérifiés par les tests ciblés.
- [x] Typecheck partagé du lot 03/coordonation réussi et preuve vérifiée sur les fichiers inchangés du lot 09.
