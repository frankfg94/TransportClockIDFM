# Micro lag des arrondis au changement de zoom — 11 octobre 2026

Une optimisation CPU mesurable est conservée : les arrondis des lignes utilisent désormais le tracé direct, sans construire les tableaux de commandes et de diagnostics qui étaient ensuite jetés. Le temps médian de ce calcul baisse de 45,9 à 49,9 % dans trois comparaisons sur les mêmes données. Le chemin de recalcul au changement de quart de zoom respecte aussi le découpage coopératif.

Une seconde correction retire les notifications de resize sans changement réel : elles relançaient le renderer et pouvaient faire rejeter les données initiales. Les 120 fps stables ne sont pas atteints. La pause après le premier tracé existe encore dans la capture exploitable de chargement à froid. Les résultats CPU ci-dessous ne constituent pas une preuve de gain global de FPS.

## Pic ciblé et cause

Dans `reports/performance/chaos-extreme-2026-10-11-17-final-native-repeat.json`, un événement conservé `render_model_build` dure 9,9 ms, dont 9,7 ms pour 47 arrondis. Il s'agit de `zoomOnlyRefresh`, sans parcours de tous les chemins (`pathsVisited: 0`), sans résolution de couleurs et sans création de nouveaux enregistrements de base. La compilation binaire dans les workers n'est donc pas le travail qui bloque pendant ce pic : la préparation des courbes reste effectuée sur le thread principal.

Deux chemins contournaient le découpage :

- Le renderer comparait les entrées géométriques et le seuil de largeur, mais ignorait le changement de quart de zoom des courbes. Il pouvait lancer directement une construction synchrone.
- La branche rapide `zoomOnlyRefresh` recalculait toutes les courbes dans un `map`, sans rendre la main même lorsqu'elle était appelée par le générateur coopératif.

## Correction conservée

- `src/features/transport-map/render/pathRounding.ts` : appel à `appendRoundedPolylineToPathDirect`, déjà utilisé pour le tracé Canvas, avec réutilisation des tableaux temporaires d'indices. Les coordonnées et la sortie restent propres à chaque appel.
- `src/features/transport-map/render/deckgl/deckGlRenderer.ts` : un nouveau quart de zoom passe par la préparation coopérative lorsque le modèle contient des chemins arrondis. Les modèles ne contenant que des chemins stables évitent ce travail supplémentaire.
- `src/features/transport-map/render/transportMapRenderModel.ts` : la branche de changement de zoom rend la main entre courbes une fois le budget CPU consommé. La publication reste atomique et une caméra plus récente remplace une préparation devenue obsolète.

La géométrie, les huit échantillons par courbe, l'ordre des chemins et les extrémités sont conservés. Le rendu continu des rails reste activé ; le rendu progressif des Bus et Noctilien reste désactivé.

## Comparaison CPU avant/après

Microbenchmark Node, sur les mêmes 29 sous-chemins de métro et leurs 858 sommets provenant du pack réel. 60 essais par exécution, après échauffement, ordre avant/après et après/avant alterné. Vérification exacte de 45 824 coordonnées sur quatre niveaux de zoom.

| Exécution | Médiane avant | Médiane après | Réduction | P95 avant | P95 après | Maximum avant / après |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2,351 ms | 1,233 ms | 47,6 % | 6,340 ms | 4,921 ms | 14,135 / 8,777 ms |
| 2 | 2,525 ms | 1,367 ms | 45,9 % | 6,929 ms | 4,889 ms | 12,155 / 8,876 ms |
| 3 | 3,167 ms | 1,585 ms | 49,9 % | 13,080 ms | 7,812 ms | 84,553 / 37,148 ms |

Les valeurs extrêmes sont conservées. Leur origine n'a pas été isolée entre GC et ordonnancement système. Ce benchmark mesure le calcul CPU des arrondis, pas le rendu à l'écran, et son jeu de chemins diffère des 47 arrondis du pic navigateur.

Fichiers complets :

- `reports/performance/bench_micro_curves.ts`
- `reports/performance/micro-curves-2026-10-11-quiet-1.json`
- `reports/performance/micro-curves-2026-10-11-quiet-2.json`
- `reports/performance/micro-curves-2026-10-11-quiet-3.json`

La première exécution `micro-curves-2026-10-11.json` avait été lancée pendant une vérification TypeScript. Elle n'est pas utilisée comme preuve principale.

## Vérification navigateur après correction

`reports/performance/chaos-extreme-2026-10-11-18-curves-after.json` : Chaos Zoom extrême v2, seed `1592598566`, 47/47 actions, réseau complet, aucune ligne active ou détaillée, aucun mode retiré, aucune erreur Deck ou MapLibre. Le test utilise le document rechargé pour la capture à froid 32 ; il commence plusieurs minutes après ce rechargement, après les vérifications et l'export du rapport, sans autre scénario Chaos intermédiaire.

Mesure au premier plan, sans cadence proche d'une seconde : viewport **452 × 768 CSS**, DPR **1,25**. Ce format diffère du viewport 844 × 956 des captures natives précédentes. Aucune comparaison de FPS avec ces anciennes captures n'est présentée comme un A/B contrôlé.

| Mesure | Après correction |
| --- | ---: |
| FPS RAF moyens | 139,689 |
| Médiane / P95 / P99 des intervalles RAF | 6,1 / 12,2 / 18,1 ms |
| Intervalle RAF maximum | 157,4 ms |
| Intervalles dépassant 8,333 ms | 1 335 / 8 591, soit 15,5 % |
| Intervalles dépassant 50 ms | 2 |
| P99 de la cadence des présentations | 42,2 ms |
| Maximum de `render_model_build` | 4,0 ms |
| Maximum d'une tranche `render_model_prepare_slice` | 6,6 ms |

Le plus gros `render_model_build` de cette capture est une récupération du cache, avec zéro arrondi recalculé. Le bloc synchrone d'environ 9 ms des anciens changements de zoom n'apparaît plus dans cette exécution. Cela vérifie le chemin modifié, sans démontrer à lui seul une amélioration globale de FPS. Les agrégats couvrent toute l'exécution ; 25 419 événements détaillés anciens ont été évincés de la trace bornée.

La tentative A/B navigateur sans la correction a produit les fichiers `cold-refresh-33-curves-before.json` et `chaos-extreme-2026-10-11-19-curves-before-throttled.json`. Le navigateur intégré s'était masqué : 14 puis 71 intervalles proches d'une seconde. Ces captures sont exclues de la comparaison de FPS. La tentative de réaffichage est restée en attente parce que cette conversation n'était plus affichée au premier plan. Les trois corrections ont été rétablies après cette tentative, puis les 57 tests ciblés ont été relancés avec succès.

Le rechargement après rétablissement des arrondis est conservé dans `cold-refresh-34-curves-final-throttled.json`. Il est lui aussi limité à environ 1 Hz et le diagnostic se termine avec `status: failed`, sans premier tracé observé dans sa fenêtre de 15 secondes et sans erreur JavaScript capturée. Ce résultat ne valide pas la fluidité : il est exclu, et non transformé en succès. Son absence de lignes a toutefois permis d'identifier la course ci-dessous.

## Notification de resize qui invalide le chargement initial

Dans la capture 34, les deux requêtes initiales renvoient chacune 176 chemins et huit stations pour la génération 3. Leurs deux applications sont marquées `stale: true`, tandis que la caméra finale est passée à la génération 4 avec les mêmes dimensions. Aucune nouvelle requête ne suit. Le renderer reste avec zéro chemin et aucune préparation binaire : il ne s'agit pas d'un premier dessin GPU lent.

`resizeStage()` appelait `resizeCamera()` sur chaque notification `ResizeObserver`. Même une notification initiale pour une taille identique créait une nouvelle génération, sans programmer de requête de viewport. Elle invalidait donc une requête déjà en cours. Elle appelait aussi inutilement `renderer.resize()` et `draw()`.

Correction dans `src/features/transport-map/geo/camera.ts` et `src/features/line-map/GlobalTransportPlan.vue` :

- Pour les mêmes largeur, hauteur et DPR, `resizeCamera` conserve la caméra et sa génération ; `resizeStage` évite le resize du renderer, la capture de surface et le nouveau dessin.
- Pour un vrai changement, les dimensions et la génération changent encore, et une requête de viewport est programmée si le réseau est initialisé.

Deux tests reproduisaient le défaut avant cette correction : génération 4 au lieu de 3 pour un resize identique, et réponse initiale non publiée. Ils passent après correction. Trois autres cas vérifient qu'un changement réel de largeur, hauteur ou DPR invalide toujours la caméra. Cette correction vise le travail redondant et le rejet du chargement ; aucun gain de FPS lui est attribué sans nouvelle capture comparable.

Vérification après rechargement complet dans `cold-refresh-35-curves-resize-after.json` : la dernière réponse de génération 3 est publiée avec 501 chemins et huit stations ; le premier tracé est soumis à 7 755,9 ms, et le renderer affiche ensuite 519 chemins. Une réponse plus ancienne est encore rejetée par le token de requête, ce qui est attendu. Aucune erreur capturée. Le rapport passe de `failed` à `completed`, mais la cadence reste limitée à environ 1 Hz : cela confirme la récupération du démarrage, pas un gain de temps de chargement ou de FPS. La caméra, le viewport et le DPR sont les mêmes que dans la capture 34.

## Pause restante après chargement complet

`reports/performance/cold-refresh-32-curves-after.json` conserve le JSON complet, les sources des scripts, les événements WebGL, les timers et la trace. `navigation.type: reload`, `fullDocumentReload: true`, aucun intervalle proche d'une seconde, aucune durée cachée détectée. Le rapport identifie bien la **RTX 3060 Ti**, via ANGLE/D3D11.

Le premier tracé est soumis à 13 915,4 ms. Cette capture a un démarrage lent, conservé dans le rapport ; elle ne sert pas à annoncer une amélioration du temps de chargement.

- L'intervalle qui contient le premier tracé dure **109 ms**. La Long Animation Frame associe **81,8 ms** à `_animationFrame` de Deck/luma puis **27,9 ms** à une callback MapLibre. Les événements propres au modèle et à `setProps` ne suffisent pas à expliquer ce temps : l'initialisation interne des couches et ressources Deck reste à détailler.
- L'intervalle suivant dure **96,8 ms**. Aucun long task ou span CPU instrumenté ne le couvre ; les timers répondent. Une fence du contexte WebGL partagé se termine en **130,8 ms**. Le rapport classe cette pause comme **corrélée à l'attente GPU avec thread principal réactif**. La fence ne distingue pas compilation, upload, dessin, pilote et travaux MapLibre précédents.
- 28 micro lags sont détectés sur 844 intervalles complets après soumission du premier tracé. `assessment.accepted` reste `false`.

Cette correction vise donc un pic CPU identifié pendant le zoom. Elle ne prétend pas supprimer la pause du premier dessin ni établir toutes les causes GPU. La capture 30, déjà limitée à environ 1 Hz, est aussi conservée comme `cold-refresh-30-invalid-throttled.json` et exclue des conclusions de fluidité.

## Validation et reprise

119 tests passent dans neuf fichiers : `transportMapDeckPackets`, `transportMapPathRounding`, `lineGeometry`, `deckMapPresenter`, `transportMapCamera`, `transportMapRenderShared`, `transportMapBasemap`, `transportMapBasemap.dom` et `transportMapNextArchitecture`. Les nouveaux tests comparent chaque coordonnée à l'ancien tracé pour sept modes, vérifient le découpage d'un changement de zoom, l'abandon d'une préparation obsolète et l'absence de nouvelle préparation pour des chemins routiers stables. Le test de découpage et les deux tests de resize échouaient avant leur correction respective.

`npm.cmd run tsc` et `git diff --check` passent. Les autres modifications déjà présentes dans le checkout sont conservées. Aucun commit, push ou déploiement n'a été effectué.

`reports/performance/micro-curves-summary-2026-10-11.json` rassemble les mesures, les liens des JSON complets et les limites. La prochaine mesure utile est une capture au premier plan des sous-phases de la première callback Deck (mise à jour des couches, initialisation des pipelines, buffers et premier dessin). Elle permettra de cibler les 81,8 ms sans les confondre avec le calcul des courbes ou l'attente de la fence GPU.
