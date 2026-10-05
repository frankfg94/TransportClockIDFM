# Nearby chaos zoom diagnostics

Le bouton discret des contrôles de zoom lance 21 opérations déterministes : pans courts et longs, zooms rapides et lents, changements de rayon, puis gestes combinés. La caméra et le rayon initiaux sont restaurés, puis le rapport JSON est téléchargé automatiquement. Un second clic interrompt le scénario et produit un rapport partiel.

## Lecture du JSON v3

| Champ                                                                             | Utilité                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`, `profile`                                                        | Version du format et du scénario. Comparer des profils identiques.                                            |
| `status`, `workload.completedOperationCount`                                      | Distinguer un passage complet, interrompu ou en erreur.                                                       |
| `environment`                                                                     | Navigateur, dimensions de carte, densité de pixels, version Vue, build de développement, visibilité et focus. |
| `workload.timing`                                                                 | Durées prévues/réelles des gestes, dépassement et fenêtres de récupération/restauration.                      |
| `workload.frameSamples`                                                           | Cadence RAF, opérations intersectées, retard du callback et instant d'observation du rayon/zoom.              |
| `workload.longTasks`                                                              | Tâches longues du thread principal, corrélées aux opérations par leur intervalle.                             |
| `diagnostics.longAnimationFrames`                                                 | Frames longues avec temps bloquant, rendu, sources de scripts et mises en page forcées.                       |
| `diagnostics.longAnimationFrameSummary.scriptsByTotalDuration`                    | Points d'entrée de scripts classés par durée cumulée, avec maximum et nombre d'occurrences.                   |
| `diagnostics.contextTimeline`                                                     | Changements des compteurs d'entrées et du chargement, observés après le flush Vue.                            |
| `diagnostics.limits`, `workload.droppedFrameSamples`, `workload.droppedLongTasks` | Limites et pertes de mesure explicites.                                                                       |
| `diagnostics.observerCallbacks`                                                   | Coût des callbacks LoAF et de collecte du contexte, sans prétendre mesurer toute l'instrumentation.           |
| `workload.measurementWarnings`, les deux tableaux `caveats`                       | Conditions qui limitent l'interprétation.                                                                     |

Les offsets et durées sont en millisecondes. Les offsets sont relatifs au début de la mesure, sur l'horloge `performance.now()`. Les valeurs absentes sont `null` ou signalées par un indicateur de support, et ne signifient pas zéro coût.

`radius.requestedChangesMeters` décrit le plan ; `radius.observedTimeline` conserve les changements observés, dont le retour au rayon initial. `map.contextAtStart` et `map.contextAtEnd` précisent aussi l'onglet de sidebar et les couches activées. `camera.restorationFrameObserved` indique si une frame de restauration a pu être observée avant le délai de secours.

`actionIndex` utilise le milieu de l'intervalle RAF. `overlappingActionIndices` conserve toutes les opérations croisées : les statistiques par opération ne sont donc pas additives. L'indice de récupération vaut `workload.recoveryActionIndex`. Une opération interrompue conserve son intervalle et son statut.

## Interprétation pour une analyse de performance

1. Vérifier statut, profil, build, compteurs initiaux, dimensions, avertissements et pertes avant de comparer des passages.
2. Examiner les durées bloquantes et les scripts des frames longues, puis les relier aux gestes et aux changements du contexte.
3. Un script LoAF est un point d'entrée avec ses microtâches : il ne fournit pas une pile CPU complète. Un callback du pilote chaos peut inclure le rendu Vue déclenché par le geste ; sa durée n'est pas le coût des sondes.
4. La cadence RAF n'est pas une mesure isolée du moteur de carte. Des intervalles proches d'une seconde peuvent aussi provenir du throttling du navigateur, y compris avec une page déclarée visible.
5. Les snapshots finaux ne garantissent pas la fin des requêtes réseau ni des animations. `leavingStationMarkers` distingue les marqueurs en cours de sortie. Le delta de heap n'établit pas une fuite mémoire.
6. Conserver données, géométrie, étiquettes et interactions lors des optimisations ; vérifier de nouveau les mêmes gestes après chaque correction.

L'attribution utilise l'[API Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames) quand elle est disponible. Les chemins des scripts sont exportés sans origine, query string ni fragment. Le rapport ne contient ni adresse, ni centre géographique, ni noms de stations.

## Instrumentation inactive

Les RAF de mesure, observateurs PerformanceObserver, watcher de contexte et écouteur de visibilité sont installés seulement pendant `run()` et retirés avant l'export, y compris après une interruption. Aucun polling ni watcher de diagnostic ne reste actif au repos. Les rapports et leurs agrégats sont calculés après l'arrêt des sondes.
