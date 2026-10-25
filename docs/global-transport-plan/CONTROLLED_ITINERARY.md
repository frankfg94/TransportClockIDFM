# Itinéraire fourni par l’Optimizer

`/optimizer/line/tram/T10` affiche la chronologie et `GlobalTransportPlanTravel`
côte à côte, séparés par un divider. Sous 1 000 px, ils sont empilés et le
divider devient horizontal. `GlobalTransportPlanTravel.vue` importe directement
`GlobalTransportPlan.vue` avec `experience="next"` et la prop `itinerary`.

## Source unique

`createLineOptimizerTimeline(candidate, origin, destination)` est une projection
pure du candidat sélectionné. Les deux panneaux consomment ses mêmes étapes et
sections : préparation, marche d’accès, transports, marches de correspondance,
attentes, marche finale éventuelle. Les correspondances utilisent
`optimizerConnectionSteps` du lot 09. Les timestamps sont en millisecondes et les
durées en secondes. Les arrêts, missions, directions et sources horaires sont
ceux des courses sélectionnées ; les anciens horaires de découverte sont remplacés.

Le contrat `GlobalTransportPlanItinerary` contient les deux points géocodés par
l’Optimizer, le `TravelRoute` projeté, les étapes et l’attente totale calculée.
La carte ne possède pas de sélection de trajet ni de recherche d’adresse dans ce
mode. Changer une adresse ou un paramètre invalide le résultat existant et retire
simultanément la chronologie et la carte. Un nouveau résultat remplace les deux.

## Frontière du rendu

Quand `itinerary` est fourni, `GlobalTransportPlan` :

- utilise directement `itinerary.route`, `origin`, `destination` et `steps` ;
- n’ouvre pas son planificateur interne, ne charge pas d’autres tracés de ligne
  pour reconstruire le trajet et ne résout pas de sorties ou de marche ;
- conserve les géométries et points des sections avec `preserveSections: true` ;
- conserve les attentes comme étapes stationnaires et affiche leur durée sur
  la carte, sans les transformer en déplacements ;
- ajuste seulement sa caméra aux points et géométries fournis ;
- n’importe pas la sélection ou les paramètres de `/map` et n’écrit pas l’URL de
  l’Optimizer lors du déplacement de la carte ;
- masque les recherches, filtres réseau, réglages immobiliers et panneaux de
  calcul indépendants. Le déplacement et le zoom restent disponibles.

Les géométries détaillées sont demandées lors de l’unique recherche de trajet de
l’Optimizer (`includeGeoJson: true`). Quand elles manquent, le rendu peut relier
les extrémités connues, et un avertissement indique la couverture partielle.
Une section sans extrémités connues est omise ; aucun arrêt n’est inventé.
Les fonds de carte et le réseau statique restent des ressources de rendu et ne
calculent aucun horaire, parcours ou durée métier.

Les attributs `data-itinerary-step`, `data-step-kind`, `data-start-at`,
`data-end-at`, `data-duration-seconds`, `data-line-code`, `data-from`, `data-to` et
`data-stops` proviennent du même helper pour les deux panneaux. Ils permettent
de comparer les valeurs réellement rendues sans lire d’état interne Vue.

Sans la prop `itinerary`, `/map` et `/map/legacy` conservent leur mode interactif
et leur calcul d’itinéraire existants.
