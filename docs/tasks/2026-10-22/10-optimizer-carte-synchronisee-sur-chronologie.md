# Lot 10 — Optimizer — carte itinéraire alimentée par la chronologie

Tâches de la liste originale : n° 11.

Portée : Grosse intégration de données et de carte.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

Cette intégration traverse l’optimizer et le rendu de la carte globale. Un fichier dédié permet de se concentrer sur le contrat des données et l’absence de recalcul divergent.

## Prérequis et ordre

Lot 09 terminé : utiliser ses étapes marche/attente. Il suffit d’inspecter le modèle actuel et son résultat de validation, sans relire les autres lots.

## Points d’entrée à explorer

- `src/features/line-optimizer/LineOptimizerPage.vue`
- `src/features/line-optimizer/useLineOptimizer.ts`
- `src/features/line-optimizer/lineOptimizer.ts`
- `src/features/line-map/GlobalTransportPlan.vue`
- `docs/global-transport-plan/`

## Précisions de cadrage

GlobalTransportPlanTravel est le nom demandé dans la todo. Retrouver le mode itinéraire et les contrats de carte réellement présents avant de décider de l’adaptation. La chronologie de gauche reste la source de vérité.

## 11. `/optimizer/line` — GlobalTransportPlanTravel synchronisé

À droite de la chronologie verticale :

- [x] Afficher un `GlobalTransportPlanTravel` en mode itinéraire.
- [x] Celui-ci doit charger directement un `GlobalTransportPlan`.
- [x] Utiliser les deux adresses du trajet.
- [x] La partie droite doit utiliser 100 % des données déjà calculées à gauche.
- [x] La partie gauche est la source of truth absolue.

Ne pas recalculer indépendamment à droite :

- transports ;
- marche ;
- attente ;
- horaires ;
- correspondances ;
- arrêts ;
- durées.

Objectif : aucune incohérence possible entre la chronologie et la carte.

- [x] Ajouter également un divider entre :
  - la chronologie à gauche ;
  - la map / GlobalTransportPlanTravel à droite.

## Validation du lot

Comparer chronologie et carte sur le même trajet et après changement d’adresse : transports, marche, attente, horaires, correspondances, arrêts et durées doivent provenir des mêmes données calculées. Vérifier aussi le chargement direct et le divider.
