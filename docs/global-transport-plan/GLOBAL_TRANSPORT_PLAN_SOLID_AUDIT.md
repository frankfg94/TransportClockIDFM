# Audit SOLID de `GlobalTransportPlan.vue`

Date de l'audit : 27 août 2026  
Périmètre : `src/features/line-map/GlobalTransportPlan.vue`, les deux expériences `/map/legacy` et `/map`, et les modules déjà présents dans `src/features/transport-map`.

Mise à jour du 30 août 2026 : `/map` est désormais la route canonique de
l’expérience MapLibre + Deck.gl/WebGL2 ; `/map/legacy` conserve l’expérience
Canvas2D/raster et `/map/next` redirige vers `/map`.

## État de référence

| Contrôle | Résultat | Portée / remarque |
| --- | --- | --- |
| Taille du composant | 4 314 lignes, 146 406 octets | État de travail avant les nouvelles extractions |
| TypeScript | PASS | `npm.cmd run tsc` |
| Lint | Non disponible | Aucun script `lint` dans `package.json` |
| Suite Vitest complète | Inexploitable comme garde unique | Plusieurs échecs DOM/infra déjà présents et exécution interrompue après blocage sur des tests réseau/serveur |
| Groupes `test:map` visibles | PASS pour les groupes ciblés affichés | Projection, caméra, zoom, rendu, basemap, cache, trafic, dashboard, data source, DOM `/map`, accessibilité et autres groupes affichés |
| Fonctionnalité observée | À préserver | `/map/legacy` reste Canvas2D/raster ; `/map` est MapLibre/deck/WebGL |

Les échecs relevés dans la suite globale de référence comprennent notamment des attentes DOM sur les dimensions d'icônes, des wrappers vides dans des tests de panneaux/recherche, des contraintes de distance dans les tests de patterns, ainsi que des timeouts et des requêtes `localhost:3000`. Ils sont consignés comme état préalable ; ce refactoring ne les corrige pas et ne doit pas les masquer.

## Répartition actuelle des responsabilités

| Responsabilité | Propriétaire actuel | API / frontière exploitable | Risque | Décision |
| --- | --- | --- | --- | --- |
| Composition de l'expérience (`legacy` / `next`) | `GlobalTransportPlan.vue` + factory | `TransportMapExperience`, renderer créé une fois | Élevé si la sélection change | Garder dans le composant racine |
| Chargement réseau, cache et viewport | `TransportMapDataSource` + `useGlobalTransportViewport` | data source, refresh/scheduling du viewport | Moyen | Garder les modules existants ; ne pas dupliquer |
| Scène render/hit-test | `useGlobalTransportScene` + renderer | `renderScene`, index spatial, chemins/stations rendus | Élevé | Garder dans le domaine carte |
| Caméra, resize, partage de viewport | `useGlobalTransportViewport` + racine | `refreshViewport`, `applyCamera`, `shareViewport` | Moyen | Garder l'orchestration dans la racine |
| Interaction pointeur, roue et sélection | `useGlobalTransportMapInteraction` + racine | callbacks d'interaction et sélection | Élevé | Extraire seulement l'état/presentation hover ; conserver le câblage |
| Raster legacy, cover et bridge covers | `useGlobalTransportLegacyBasemap` + `GlobalTransportPlanLegacyBasemap.vue` + `SelectedLineBasemapCover` | caméra de geste, snapshots, opacités, métriques | Très élevé | Extraction tardive et conservatrice en vague 3 |
| Trafic réseau | `useTransportMapTraffic` | `refresh`, `refreshLine`, `disable`, statut/snapshot | Moyen | Conserver ce composable comme source ; isoler les dérivés/polling |
| Dérivés trafic pour la scène | `useGlobalTransportTraffic` | impacts, interruptions, spans et lecteur scène | Élevé | API feature étroite, source trafic conservée |
| Dashboard | `adapters/dashboard.ts` + racine | `addGlobalMapTargetsToDashboard`, undo | Moyen | Déplacer l'état et les commandes dans un composable feature |
| Géolocalisation | `useUserGeolocation` + racine | composable déjà responsable du cycle permission/position | Faible | Ne pas déplacer la logique ; extraire seulement l'overlay visuel |
| Pulse stations / marqueur utilisateur | template/style racine | props calculées et événements simples | Faible | Extraire en composants de présentation |
| Toolbar et contrôles d'affichage | template/style racine + composants voisins | événements reset/share/traffic/layer | Moyen | Extraire après les overlays, sans changer les événements |
| Debug performance | `useGlobalTransportPerformance` + `GlobalTransportDebugPanel.vue` | probe, report JSON, métriques renderer | Moyen | Harness et présentation séparés |
| Scénarios zoom/chaos | `useSelectedLineZoomScenario`, `useChaosZoom` | contrôleurs existants et rapports | Élevé | Ne pas réimplémenter ; seulement réduire le câblage UI |
| URL, recherche et panneau ligne | racine + composables/composants existants | route state, search, line panel | Élevé | Garder dans l'orchestration tant qu'aucune frontière stable n'est prouvée |

## Principes de découpage retenus

- `GlobalTransportPlan.vue` reste la composition root : il assemble l'expérience, les composables domaine, les callbacks et le renderer.
- Un module extrait doit avoir un propriétaire clair, une API courte et des dépendances explicites. Aucun singleton, registre global ou interface générique artificielle.
- Les composants de vague 1 sont présentiels : ils reçoivent des données déjà calculées et émettent des événements ; ils ne déplacent ni le chargement réseau, ni la caméra, ni la sélection.
- Les composables de vagues 2 et 3 ne seront créés que si leurs dépendances peuvent être groupées par cohésion. Une extraction qui ne ferait que déplacer une callback soup est refusée.
- Les classes, attributs `data-*`, événements, textes traduits, ordre DOM et comportements de focus restent inchangés autant que possible.

## Plan d'exécution et stop-gates

### Vague 1 — UI à faible risque

1. Extraire l'overlay de géolocalisation.
2. Extraire les pulses de stations.
3. Extraire le panneau debug de présentation.
4. Extraire l'état/les commandes dashboard si la frontière avec `adapters/dashboard.ts` reste nette.
5. Envisager toolbar et contrôles d'affichage après validation des trois premières extractions.

Stop-gate : TypeScript, tests DOM carte concernés, inspection du diff et vérification que les deux expériences montent avec les mêmes attributs/événements.

### Vague 2 — Interaction, trafic et performance

Extraire des unités cohésives pour l'état hover, les dérivés/polling trafic et le harness de performance seulement après avoir mesuré leurs APIs. Le hit-test, la sélection et l'injection renderer restent dans la racine si l'extraction imposerait plus de dépendances qu'elle n'en retire.

Stop-gate : tests hover/tooltip, trafic, performance, DOM carte, TypeScript et absence de changement de métriques ou de seuils.

### Vague 3 — Basemap legacy

Traiter séparément l'état des covers raster, les snapshots d'ancrage et la surface de geste. `TransportMapBasemap`, `SelectedLineBasemapCover` et les bridges existants restent les propriétaires du rendu ; la racine ne doit conserver que la composition nécessaire aux expériences.

Stop-gate : tests basemap/cover/renderer, tests de zoom et de wheel, vérification explicite de `/map/legacy` Canvas2D/raster et de `/map` MapLibre/deck/WebGL.

## Définition de terminé

- Chaque extraction a un propriétaire et une API documentés dans le code ou ce rapport.
- Aucun changement volontaire de comportement fonctionnel, de contrat public, de renderer, de basemap ou de route.
- `npm.cmd run tsc` passe après chaque vague.
- Les tests ciblés des deux expériences et des modules touchés passent ; les échecs préexistants de la suite globale restent signalés précisément.
- Le rapport final indique la taille avant/après, les modules extraits, les dépendances, les watchers conservés/déplacés, les risques résiduels et les contrôles exécutés.

## Résultat de l'exécution

### Découpage livré

Le composant racine est passé de 4 314 lignes / 146 406 octets à 2 697 lignes / 91 702 octets, soit 1 617 lignes et 54 704 octets retirés de l'orchestrateur, sans modifier les contrats de route ou de renderer.

Les frontières livrées sont les suivantes :

| Module | Responsabilité et API |
| --- | --- |
| `TransportMapUserLocationOverlay.vue` | Présentation du bouton/marker de localisation ; props d'état, événement `request` ; le cycle de permission reste dans `useUserGeolocation`. |
| `TransportMapStationPulseOverlay.vue` | Présentation des pulses et conversion caméra-écran ; reçoit uniquement stations/caméra/contexte de ligne. |
| `GlobalTransportDebugPanel.vue` | Présentation du panneau debug ; événements `start`, `stop`, `export`. |
| `GlobalTransportPlanToolbar.vue` | Présentation toolbar, layer switch, trafic et actions ; événements correspondant aux actions historiques. |
| `GlobalTransportPlanModeFilter.vue` / `GlobalTransportPlanDisplayPanel.vue` | Présentation des filtres de modes et des contrôles d'affichage. |
| `useGlobalTransportDashboard.ts` | État, rafraîchissement, ajout de sélection et undo ; délègue la persistance à `adapters/dashboard.ts`. |
| `useGlobalTransportHover.ts` | État hover, candidats, tooltip et position écran ; le hit-test et la sélection restent dans la racine. |
| `useGlobalTransportTraffic.ts` | Source trafic, dérivés scène, polling, rafraîchissement ciblé et résolution d'une disruption candidate. |
| `useGlobalTransportPerformance.ts` | Probe, métriques, rapport JSON, export et sampling du cache. |
| `useGlobalTransportLegacyBasemap.ts` | Snapshots covers/bridges, ancrage, opacités, surface de geste, readiness, préchauffage et mesure de couverture. |
| `GlobalTransportPlanLegacyBasemap.vue` | Composition visuelle du raster live, cover large et bridges ; expose uniquement stack, readiness et métriques au parent. |

Les watchers d'orchestration conservés dans la racine restent ceux des modes, des lignes fantômes, de la ligne active, du contexte géométrique/dimensions du cover et du scénario de performance. Le watcher du snapshot trafic et le nettoyage du polling sont dans le composable trafic ; la logique de surface raster et ses références DOM sont dans le composable basemap. Aucun singleton, registre global ou interface générique n'a été ajouté.

### Validations finales

| Contrôle | Résultat |
| --- | --- |
| `npm.cmd run tsc` | PASS |
| `npm.cmd run build` | PASS ; avertissements PostCSS/chunks/Cloudflare déjà indépendants du refactoring |
| `npm.cmd run test:map` | PASS ; tous les groupes exécutés, dont projection/caméra/zoom/wheel, renderer/cache, trafic/performance, DOM `/map`, basemap et covers |
| Probe factory `legacy` / `next` | PASS ; `legacy-raster` + Canvas2D d'un côté, `maplibre-vector` + Deck/WebGL2 de l'autre |
| `npm.cmd run test -- --reporter=dot` | Bloqué au démarrage Vitest par `Cannot read directory "../../..": Access is denied` lors de la résolution de `vitest.config.ts` dans ce sandbox ; aucun test global n'a donc été exécuté lors de cette tentative |
| Lint | Non disponible : aucun script `lint` dans `package.json` |

La suite globale avait déjà révélé dans le baseline des échecs DOM/infra et des timeouts réseau détaillés plus haut ; ils ne sont ni corrigés ni masqués par ce refactoring. Les branches restent explicites : `/map/legacy` conserve le renderer Canvas2D et le basemap raster legacy, `/map` conserve l'expérience MapLibre/deck/WebGL.

## Mission — extractions HOVER et PERFORMANCE SCENARIO (27 août 2026)

1. **Taille avant/après.** Cette vague part de `GlobalTransportPlan.vue` à 2 697 lignes / 91 702 octets et arrive à 2 380 lignes / 81 778 octets : 317 lignes et 9 924 octets retirés de la racine.

2. **Fonctions HOVER déplacées.** `useGlobalTransportHover.ts` possède désormais le changement de feature, le regroupement des candidats, l'ouverture/fermeture du choix de ligne, le focus clavier, les transitions canvas/tooltip, la sortie, la sélection tooltip et l'update hit-test.

3. **État HOVER déplacé.** Le composable possède `hoveredFeature`, `hoveredLineCandidates`, `hoveredPointer`, `lineChoiceOpen`, ainsi que les dérivés du label, des lignes tooltip et du style de positionnement.

4. **API HOVER finale.** L'API expose les états/VM et les commandes `update`, `clear`, `closeLineChoice`, `clearLineChoiceState`, `openLineChoice`, `selectHoveredFeature`, `focusFeature`, `focusTooltipChoice`, `leave`, `setHoveredLine`, `setHoveredTooltipLine`, `restoreHoveredTooltipLine`, `handleTooltipLeave` et `selectTooltipLine`. Le hit-test, le dessin, le preview sidebar et la sélection métier sont injectés.

5. **Fonctions de benchmark déplacées.** `useGlobalTransportPerformanceScenarios.ts` regroupe le parsing de configuration, la préparation Ligne 14, les métadonnées, le scheduling selected-line-wheel, l'orchestration Chaos/selected, l'enregistrement frame/timing et le cycle de vie.

6. **État de benchmark déplacé.** Le harness expose le statut/phase/rapport selected-line, les indicateurs/rapport Chaos et les dérivés de configuration ; `useGlobalTransportPerformance` reste le probe bas niveau de mesure.

7. **API benchmark finale.** `useGlobalTransportPerformanceScenarioConfig` fournit la configuration validée/clampée ; `useGlobalTransportPerformanceScenarios` reçoit des ports groupés préparation/runtime/caméra/basemap/métadonnées/performance et expose `runChaosZoom`, `scheduleSelectedLineZoomScenario`, `recordFrame`, `recordTiming`, `getPerformanceMetadata` et `dispose`.

8. **Ce qui reste volontairement dans la racine.** `GlobalTransportPlan.vue` conserve la composition d'expérience/renderer, le data source et viewport, l'adaptateur concret du hit-test spatial, les effets de sélection et de trafic, la caméra, le câblage interaction et les détails de basemap. Aucun renderer concret n'est importé par le harness de scénario.

9. **Tests HOVER.** `tests/globalTransportHover.dom.test.ts` couvre station/ligne, candidats, tooltip, choix de ligne, focus, clear et sortie : 2 tests passés.

10. **Tests benchmark.** `tests/globalTransportPerformanceScenarios.test.ts` couvre les defaults/clamps/parsing : 3 tests passés ; `tests/globalTransportPerformanceScenarios.dom.test.ts` couvre scheduling, délégation Chaos, frame/timing, readiness, métadonnées et dispose : 3 tests passés.

11. **Tests map.** `npm.cmd run test:map` a exécuté avec succès les groupes projection/caméra/zoom/wheel, renderer/cache, trafic/performance, DOM map, basemap/covers et parité.

12. **Tests map-next.** `npm.cmd run test:map:e2e` est passé : GlobalTransportPlan 38, accessibilité 1, HOVER 2, scénario 3, basemap 23, cover 8, anchor parity 3 et renderer parity 2.

13. **TypeScript / lint.** `npm.cmd run tsc` passe et la build production passe. `package.json` ne contient aucun script `lint` ; le check Prettier ciblé des nouveaux fichiers et du runner passe. Le composant racine conserve le mélange de fins de ligne historique sans reformatage global.

14. **Cycles.** Aucun nouveau cycle d'import n'a été introduit : la racine compose HOVER et le harness, le harness compose uniquement les contrôleurs Chaos/selected existants, et les modules extraits ne réimportent pas `GlobalTransportPlan.vue`.

15. **Impact performance.** Le chemin chaud conserve les mêmes appels de rendu, hit-test et collecte de métriques ; la délégation passe par un seul harness sans changement de seuils ni de renderer. Les tests DOM/parité et la build valident `/map/legacy` Canvas2D/raster et `/map` MapLibre/deck/WebGL2.

16. **SRP / ISP / DIP.** SRP est renforcé par la séparation hover/scénarios/probe ; ISP par les ports étroits groupés par capacité ; DIP par l'injection des accès runtime, caméra, basemap, métadonnées et sélection. La racine reste une composition root explicite, sans singleton ni god object supplémentaire.
