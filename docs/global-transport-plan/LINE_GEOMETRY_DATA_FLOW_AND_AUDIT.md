---
title: "Flux actuel des géométries — GTFS/NeTEx → carte globale → renderers"
document_type: "current-architecture-and-data-audit"
language: "fr-FR"
status: "référence courante"
audited_on: "2026-08-30"
scope:
  backend: "../idfm-node-backend/src/transport/global-map"
  page: "src/features/line-map/GlobalTransportPlan.vue"
  legacy_route: "/map/legacy"
  next_route: "/map"
dataset:
  global_map_version: "v1-26ccc53ce8f6ef8b"
  generated_at: "2026-08-27T13:00:24.084Z"
  netex_index_generated_at: "2026-08-15T14:18:35.266Z"
  gtfs_dataset_version: "2026-08-27"
  gtfs_sha256: "5d6d1b69d47032604a94318811d5656083a4d66f4fcf47ae2edb94e35d24d4fa"
---

# Flux actuel des géométries de ligne

Ce fichier décrit le code et les données actuellement livrés. Il remplace
l'ancien audit chronologique : les anciennes sections de suivi, les chiffres
de campagnes précédentes et les propositions déjà dépassées ont été retirés.
Pour le détail de l'implémentation Factory/Strategy de la nouvelle carte, voir
MAP_NEXT_FACTORY_STRATEGY_IMPLEMENTATION.md.

## 1. Résumé opérationnel

La géométrie affichée par le plan global est précompilée hors ligne. Le
navigateur ne reconstruit pas les formes GTFS à la demande :

1. NeTEx fournit la topologie, les stations, les quais et les patterns ;
2. le contexte GTFS fournit les formes routières ou ferroviaires ;
3. le compilateur produit un pack statique sous
   public/data/global-map/v1 ;
4. le chargeur Nuxt lit le manifest, le bootstrap, le catalogue, les assets
   régionaux et les chunks nécessaires ;
5. une scène indépendante du backend de rendu est construite ;
6. la factory choisit la stratégie Canvas2D ou Deck.gl.

Les deux routes utilisent la même scène métier :

| Route | Expérience | Fond | Stratégie de rendu |
| --- | --- | --- | --- |
| /map/legacy | legacy | raster géré par TransportMapBasemap | Canvas2dRenderer |
| /map | next | MapLibre vectoriel | DeckGlRenderer sur MapboxOverlay WebGL2 |

`/map` est la route canonique et monte l’expérience `next`. `/map/legacy`
conserve l’ancienne expérience Canvas2D/raster pour la compatibilité et le
diagnostic. L’ancien chemin `/map/next` redirige vers `/map`.

La décision entre ces expériences est centralisée dans
src/features/transport-map/render/createRenderer.ts. Les fonctions de dessin
ne choisissent pas leur backend.

## 2. Architecture actuelle

~~~mermaid
flowchart LR
  subgraph OFF["Précompilation hors ligne"]
    N["NeTEx index + topologie"]
    G["GTFS index + shapes"]
    O["Traces officielles optionnelles"]
    C["compileGlobalMap.ts"]
    P["pack global-map/v1"]
    N --> C
    G --> C
    O --> C
    C --> P
  end

  subgraph APP["TransportClockGPT"]
    L["GlobalMapAssetLoader"]
    D["TransportMapDataSource"]
    S["TransportMapRenderScene"]
    M["TransportMapRenderModelBuilder"]
    F["TransportMapExperienceFactory"]
    L --> D
    D --> S
    S --> M
    M --> F
  end

  P --> L

  subgraph LEG["/map/legacy"]
    C2["Canvas2dRenderer"]
    R["basemap raster legacy"]
    F --> C2
    C2 --> R
  end

  subgraph NEXT["/map"]
    D2["DeckGlRenderer"]
    ML["MapLibre vector"]
    OVL["MapLibreDeckOverlayPresenter"]
    F --> D2
    D2 --> OVL
    OVL --> ML
  end
~~~

### 2.1 Responsabilités par couche

| Couche | Module principal | Responsabilité |
| --- | --- | --- |
| Topologie NeTEx | idfm-node-backend/src/transport/services/netex-topology.ts | ordre des nœuds, patterns, quais |
| Compilation | idfm-node-backend/src/transport/global-map/compileGlobalMap.ts | formes, LOD, subpaths, chunks, manifest |
| Contrat pack | src/features/transport-map/contracts/manifest.ts | types et invariants lus par le frontend |
| Chargement | src/features/transport-map/data/assetLoader.ts | versions, checksum et décodage |
| Sélection spatiale | src/features/transport-map/data/createTransportMapDataSource.ts | LOD, chunks, modes, lignes forcées |
| Scène | src/features/transport-map/contracts/renderer.ts | modèle métier commun aux renderers |
| Préparation | src/features/transport-map/render/transportMapRenderModel.ts | styles, géométrie mondiale, trafic, stations |
| Factory | src/features/transport-map/render/createRenderer.ts | choix unique de l'expérience |
| Legacy | src/features/transport-map/render/canvas2d/canvas2dRenderer.ts | affichage Canvas2D |
| Next | src/features/transport-map/render/deckgl/deckGlRenderer.ts | packets binaires et hand-off Deck |
| Surface GPU | src/features/transport-map/next/TransportMapNextSurface.vue | MapLibre, contexte WebGL2 et overlay |

## 3. Factory et Strategy

Le contrat public est TransportMapRenderer dans
src/features/transport-map/contracts/renderer.ts :

~~~text
mount(canvas)
resize(width, height, pixelRatio)
render(camera, scene)
getMetrics()
dispose()
~~~

La factory expose deux expériences :

| Expérience | Classe | Basemap | Renderer |
| --- | --- | --- | --- |
| legacy | LegacyCanvasMapExperience | legacy-raster | Canvas2dRenderer |
| next | MapLibreDeckMapExperience | maplibre-vector | DeckGlRenderer |

createTransportMapRenderer() reste une façade de compatibilité et utilise
Canvas2D par défaut. La route pages/map/index.vue passe explicitement
experience="next" et pages/map/legacy.vue passe explicitement
experience="legacy".

Le Strategy Pattern fonctionne parce que les deux stratégies reçoivent le même
TransportMapRenderScene. Elles ne connaissent pas la provenance GTFS ou NeTEx
des données et n'ont pas à dupliquer :

- la résolution des styles de ligne ;
- la visibilité des stations ;
- les plages de trafic ;
- la résolution des ancres de station ;
- la gestion des lignes fantômes ;
- la sélection et les directions métier.

Les seules conditions liées à l'expérience restent au niveau de la factory,
de la surface Vue et de la politique de chargement. Un if webgl dans
renderPaths, renderStations, renderTraffic ou renderLabels serait une
régression d'architecture.

## 4. Sources hors ligne

### 4.1 NeTEx

Le compilateur lit l'index NeTEx produit par le backend. Pour chaque offre de
ligne, il récupère :

- l'identité de la ligne et son mode ;
- les stations et les nœuds schématiques ;
- les séquences et directions de service ;
- les quais et leurs références physiques ;
- les segments schématiques utilisés en dernier recours.

NeTEx décrit la topologie. Il ne garantit pas que le segment schématique soit
une géométrie routière utilisable à l'échelle d'une rue.

### 4.2 GTFS

Le contexte GTFS est chargé depuis le cache local .data/gtfs. Le compilateur
cherche d'abord l'artefact exact de la ligne. Si l'identifiant NeTEx diverge,
selectGtfsArtifactForTopology() cherche des candidats par libellé normalisé,
puis compare leur couverture géométrique à toutes les stations NeTEx.

Un alias n'est accepté que si la distance maximale station-shape reste sous
2 000 m. L'alias retenu est écrit dans les warnings du manifest. Il n'existe
pas de table d'alias codée en dur par ligne.

Pour les lignes routières, createTopologyGtfsSegments() conserve le contexte
du parcours avant de construire les segments physiques. Si une branche GTFS
complète n'est pas disponible, le compilateur peut comparer les branches
physiques dérivées de la topologie. Il ne transforme pas silencieusement un
leg absent en droite routière.

### 4.3 Sources complémentaires

Le dossier .data/line-geometry peut fournir des traces officielles
préchargées. Elles sont utilisées hors ligne et apparaissent comme
official-open-data dans le pack.

Des raccords routiers curatés peuvent compléter une arête très précise. Ils
sont versionnés dans le backend, limités à l'arête déclarée et produisent
geometrySource=mixed. Aucun appel OSRM, OSM ou fournisseur de routage n'est
effectué pendant le rendu navigateur.

La palette de présentation officielle est facultative. Le pack actuel signale
son absence dans le manifest ; les lignes possèdent néanmoins leur couleur et
leur couleur de texte compilées. L'absence de palette n'est pas une absence de
géométrie GTFS.

## 5. Contrat de géométrie

### 5.1 Stations et lignes

Une GlobalMapStation conserve :

- son identifiant canonique ;
- les coordonnées EPSG:2154 source ;
- longitude/latitude ;
- coordonnées worldX/worldY normalisées ;
- les références brutes et les alias ;
- la liste des lignes ;
- son chunk propriétaire.

Une GlobalMapLine conserve les mêmes identités de ligne, son mode, ses
couleurs, ses pictogrammes, ses stationIds et ses geometryIds.

stationIds est une liste d'appartenance, pas un itinéraire ordonné. Le premier
ou le dernier arrêt d'un parcours doit venir d'un pattern ou d'une séquence,
jamais de l'ordre accidentel du catalogue compact.

### 5.2 Paths

Chaque GlobalMapPath contient :

- lineId ;
- geometrySource ;
- sourceVersion ;
- quality.complete ;
- quality.fallback ;
- quality.gapMeters ;
- quality.stationDistanceMaxMeters ;
- stationIds ;
- vertices ;
- éventuellement renderStationAnchors ;
- éventuellement des vertices LOD ;
- éventuellement des starts LOD ;
- ses bounds et ses chunkIds.

Les sources possibles sont :

| geometrySource | Signification |
| --- | --- |
| netex | géométrie NeTEx non marquée fallback |
| gtfs | forme GTFS validée |
| official-open-data | trace officielle précompilée |
| mixed | GTFS complété par un raccord routier curaté |
| netex-schematic-fallback | ligne schématique incomplète, non routière |

Une renderStationAnchor est une position de raccord de la forme provider. La
station commerciale garde sa position canonique ; le trait peut suivre
l'ancre routière. resolveGlobalMapVertex() applique cette règle aux modes
BUS et NOCTILIEN, sans déplacer le marqueur de station.

### 5.3 Subpaths

subpathStarts contient les indices inclusifs de fragments indépendants dans le
tableau vertices. Les LOD possèdent leurs propres indices dans
lodSubpathStarts.

Cette information est obligatoire pour les géométries découpées. Sans elle,
un renderer pourrait relier la fin d'un fragment à l'origine du suivant et
inventer une diagonale à travers une rue, un bâtiment ou un espace sans
géométrie.

Les helpers partagés sont :

- getGlobalMapPathSubpathRanges() ;
- isValidGlobalMapPathSubpathStarts() ;
- PreparedWorldPathGeometryCache ;
- breakIncompleteGtfsConnectors().

## 6. Construction du pack global

compileGlobalMap.ts suit cet ordre :

1. lire index.json et les offres NeTEx ;
2. charger le contexte GTFS, les alias et les éventuelles traces officielles ;
3. créer les stations canoniques et transformer les coordonnées ;
4. créer chaque ligne et ses segments topologiques ;
5. choisir une géométrie GTFS contextualisée quand elle existe, sinon une
   trace officielle ; n'utiliser le fallback NeTEx que lorsqu'aucune
   géométrie détaillée ne peut être compilée ;
6. enregistrer la qualité et la provenance de chaque path ;
7. simplifier séparément les subpaths en LOD ;
8. répartir stations et paths sur la grille spatiale z11 ;
9. clipper chaque path à ses chunks tout en conservant les limites de
   subpath ;
10. écrire les assets, les checksums et le rapport d'audit ;
11. exécuter la validation de structure avant la promotion du dossier final.

Le clipping mentionné ici est un découpage hors ligne des géométries de
transport. Il ne s'agit pas d'un clipping d'image du basemap MapLibre. Chaque
fragment découpé reste indépendant dans le pack et dans les renderers.

### 6.1 LOD publiés

| Niveau | Zoom | Erreur maximale déclarée | Usage |
| ---: | ---: | ---: | --- |
| 0 | 0–11 | 1 000 m | aperçu régional |
| 1 | 11–14 | 250 m | transition/intermédiaire |
| 2 | 14–17 | 25 m | détail |
| 3 | 17–24 | 0,25 m | très haute précision |

Les paths stockent actuellement le détail complet ainsi que les LOD 1 et 2.
Le niveau 3 reste le niveau de référence de la politique de précision, sans
être dupliqué dans chaque chunk.

Le plancher de LOD par mode évite qu'un long corridor ferroviaire ou routier
soit réduit à une corde trop grossière dès que le détail est disponible. Les
modes BUS, NOCTILIEN, TRAIN et TRANSILIEN sont notamment promus au niveau 2
dans le chemin chunké.

### 6.2 Chunks

La grille spatiale est z11. Le compilateur écrit deux familles de fichiers :

- core pour les modes hors BUS et NOCTILIEN ;
- bus pour BUS et NOCTILIEN.

Chaque descripteur contient ses bounds, son asset, ses modes, sa taille et
son checksum. Les chunks bus ne mélangent pas de mode lourd.

Le découpage sert à limiter la quantité de géométrie décodée. Il ne change
pas la sémantique du path et ne doit jamais supprimer un start de subpath.

## 7. Format des assets livrés

~~~text
public/data/global-map/v1/
  manifest.json
  bootstrap.json
  catalog.json
  regional.json
  regional-bus.json
  line-palette.json                 (facultatif)
  indexes/stations.json
  indexes/paths.json
  chunks/z11-...-core.json
  chunks/z11-...-bus.json
  reports/data-audit.json
  reports/data-audit.md
~~~

### 7.1 Bootstrap et catalogue

bootstrap.json est la première réponse compacte. Il contient les lignes, les
stations régionales et les extrémités compactes des paths. Il ne contient pas
les polylignes détaillées.

Le bootstrap ne publie volontairement que les stations à forte connectivité.
catalog.json rétablit ensuite la liste complète des stations, des
appartenances de lignes et des entrées.

GlobalMapAssetLoader vérifie le schemaVersion, le dataVersion,
transformVersion et les encodages rows-v1/rows-v2. Les tailles et checksums
des assets sont vérifiés par validate-global-map lors de la génération et de
la validation du pack.

### 7.2 Regional et regional-bus

Les deux assets régionaux utilisent rows-v2. Chaque ligne contient :

~~~text
[pathIndex, geometrySource, stationIds, vertices,
 renderStationAnchors|null, metadata]
~~~

metadata contient exactement :

~~~text
{
  subpathStarts,
  quality: [complete, fallback, gapMeters, stationDistanceMaxMeters],
  sourceVersion
}
~~~

Le metadata décrit le même tableau de vertices que la ligne régionale. Il ne
doit pas être réutilisé pour un autre LOD.

Codes compacts de geometrySource :

| Code | Source |
| ---: | --- |
| 0 | netex |
| 1 | gtfs |
| 2 | official-open-data |
| 3 | netex-schematic-fallback |
| 4 | mixed |

La validation exige que chaque path du pack apparaisse une seule fois dans
l'union de regional.json et regional-bus.json, avec la bonne famille de mode.

### 7.3 Chunks détaillés

Un chunk contient :

- son propre descripteur d'appartenance ;
- les pathIds, stationIds et lineIds qu'il contient ;
- les paths découpés dans ses bounds ;
- les vertices complets disponibles ;
- les LOD et subpathStarts associés ;
- les ancres de station.

Les checksums, la version de données, les bounds, l'appartenance des stations
et les ancres sont validés en mode full-data.

## 8. Chargement runtime

### 8.1 Initialisation

TransportMapDataSource.initialize() :

1. charge manifest.json ;
2. charge bootstrap.json et la palette en parallèle ;
3. décode le réseau initial ;
4. construit l'index spatial des stations ;
5. crée TransportMapChunkScheduler ;
6. crée le pool de workers lorsqu'il est disponible.

ensureCatalog() charge le catalogue complet à la demande, reconstruit le
réseau dense et conserve les paths régionaux déjà décodés.

ensureRegionalLayer("core"|"bus") charge une seule fois la couche régionale
correspondante et la synchronise dans le réseau.

### 8.2 queryViewport()

Pour chaque caméra, queryViewport() :

1. annule les demandes de génération devenue obsolète ;
2. choisit le LOD depuis la caméra ;
3. calcule les bounds visibles ;
4. ajoute temporairement les modes nécessaires aux lignes forcées ;
5. choisit régional ou chunks ;
6. charge les descripteurs intersectant les bounds ;
7. déduplique les paths ;
8. applique le LOD du mode ;
9. filtre les lignes, les bounds et les sources ;
10. retourne paths, stations, chunks et métriques.

Avec useRegionalOverview=true, option utilisée par /map :

- au LOD 0, aucune ligne n'étant focalisée, la couche régionale complète est
  utilisée ;
- dès que le LOD détaillé est nécessaire, les chunks spatiaux prennent le
  relais ;
- une ligne focalisée ne reste pas figée sur sa polyligne régionale : ses
  bounds détaillés sont chargés ;
- les lignes de correspondance forcées peuvent être chargées avec leur
  géométrie détaillée ;
- le fallback régional ne doit pas être présenté comme une forme routière
  détaillée.

Le chemin legacy conserve son comportement historique lorsque
useRegionalOverview n'est pas activé.

### 8.3 Scheduler et cache de données

TransportMapChunkScheduler :

- limite le nombre de chargements simultanés ;
- donne priorité aux chunks visibles ;
- annule les demandes non pertinentes ;
- conserve un cache LRU borné ;
- évince les familles de mode désactivées ;
- distingue les demandes visibles, overscan et prefetch.

La configuration de la page utilise 96 entrées et 96 MiB pour le cache de
chunks. Le prefetch applicatif de /map est désactivé :
GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.prefetch.enabled=false.

Les helpers de prédiction restent disponibles pour les tests unitaires, mais
aucun échauffement de chunks hors écran n'est branché sur /map.

### 8.4 Fallbacks détaillés

Un fallback netex-schematic-fallback peut être utile dans la vue régionale
pour montrer la couverture du réseau. À un zoom détaillé, les fallbacks des
modes BUS et NOCTILIEN sont masqués. Une portion sans géométrie routière
validée devient une lacune visible ; elle n'est pas remplacée par une droite.

Quand un path GTFS incomplet porte des connecteurs entre stations,
breakIncompleteGtfsConnectors() crée des subpaths à partir des frontières
fiables. Le renderer laisse alors le gap au lieu de dessiner le connecteur
non audité.

## 9. Scène commune et modèle de rendu

TransportMapRenderScene contient les éléments métier :

- lines et paths ;
- stations, quays et entrances ;
- ligne et station actives ;
- ligne et station survolées ;
- lignes fantômes ;
- modes visibles ;
- impacts de trafic ;
- plages de trafic indexées par path ;
- état d'interaction de la caméra.

TransportMapRenderSceneIndex transforme les tableaux source en maps et sets
réutilisables. Il calcule notamment les lignes visibles, les stations de la
ligne active, les stations fantômes et le contexte de visibilité des nœuds.

TransportMapRenderModelBuilder produit un
TransportMapPreparedRenderModel backend-agnostic :

- basePaths ;
- trafficPaths ;
- highlightPaths ;
- stations ;
- quays ;
- entrances ;
- labels.

La projection écran ne fait pas partie de ce modèle. Chaque stratégie reçoit
les mêmes positions mondiales et résout sa propre présentation.

Les paths sont convertis en tableaux Float64Array de couples longitude,
latitude. Les géométries et les styles inchangés sont réutilisés par identité.
Les plages de trafic sont groupées puis découpées par subpath dans
TransportMapTrafficRangeIndex.

## 10. Stratégie Canvas2D

`Canvas2dRenderer` reste une stratégie de production active pour `/map/legacy`.
Le fait que `/map` utilise Deck.gl ne rend donc pas obsolètes les mécanismes
Canvas2D : ils restent nécessaires à la carte legacy et doivent être maintenus
séparément du pipeline MapLibre.

Le renderer reçoit le même `TransportMapRenderScene` que la stratégie Deck.gl,
mais conserve ses propres structures écran et ses propres caches :

- contexte `CanvasRenderingContext2D` principal ;
- préparation de géométrie mondiale et tableaux de points écran ;
- cache de paths dans un canvas hors écran ;
- `Path2D` pour les tracés monde des lignes fantômes ;
- arrondis et décimation écran des polylignes ;
- atlas et placement anti-collision des labels ;
- dessin des stations, quais, entrées et impacts de trafic ;
- métriques de rendu et de capture du cache.

Cette section décrit donc le comportement Canvas2D encore livré. Les anciennes
sections historiques, expériences de raster abandonnées ou propositions non
implémentées ont été retirées ; elles ne doivent pas être confondues avec ces
éléments toujours actifs.

### 10.1 Intégration dans `GlobalTransportPlan.vue`

`GlobalTransportPlan.vue` garde une orchestration commune pour les deux
expériences : caméra, `TransportMapRenderScene`, modes visibles, sélection,
ligne active, lignes fantômes, directions de bus, trafic, hover et événements
pointer/wheel.

La séparation du fond reste explicite :

| Expérience | Fond réellement monté | Canvas d'événements | Renderer |
| --- | --- | --- | --- |
| `/map/legacy` legacy | `TransportMapBasemap` et, si nécessaire, `SelectedLineBasemapCover` | canvas de rendu Canvas2D | `Canvas2dRenderer` |
| `/map` next | `TransportMapNextSurface` (MapLibre) | canvas transparent pour les interactions | `DeckGlRenderer` |

La factory décide de la stratégie. La branche `legacy` de la surface Vue ne
doit donc pas être supprimée sous prétexte que la branche `next` existe. Le
renderer est monté une fois, redimensionné avec le viewport, puis appelé par
`drawNow()` via `renderer.render(camera, renderScene)` dans la boucle de rendu.
`Canvas2dRenderer` accepte aussi le kind `canvas2d-worker` pour la parité et les
tests de compatibilité ; la factory de production sélectionne actuellement
`canvas2d-main-thread` pour `/map/legacy`.

`resize()` sépare les dimensions CSS du backing store physique : le canvas est
redimensionné avec `ceil(widthCssPx * pixelRatio)` et
`ceil(heightCssPx * pixelRatio)`, tandis que les coordonnées de la scène restent
en CSS pixels. `setCssTransform()` rétablit cette transformation avant le
dessin des éléments écran. Les tests de parité vérifient ainsi que la position
monde-écran ne change pas lorsque le pixel ratio passe de 1 à 3.

### 10.2 Préparation de la scène et de la géométrie

À chaque changement d'identité des tableaux de scène,
`Canvas2dRenderer.updateSceneIndexes()` met à jour
`TransportMapRenderSceneIndex`. Les maps et sets réutilisés par les frames
contiennent notamment :

- lignes et paths par ligne ;
- lignes effectivement visibles et lignes fantômes ;
- stations par identifiant ;
- stations de la ligne active et stations fantômes au hover ;
- stations sélectionnées, interrompues ou perturbées ;
- lignes concernées par le trafic et plages de trafic par path ;
- contexte partagé de visibilité des nœuds.

`PreparedWorldPathGeometryCache` reste backend-agnostic. Il transforme les
vertices compacts en points monde, résout les ancres de station selon
`resolveGlobalMapVertex()` et conserve les limites de chaque subpath. Le
renderer Canvas ajoute ensuite ses tableaux `screenPoints`, ses scratch de
polyligne et ses vues de plages trafic ; ces objets spécifiques ne sont pas
partagés avec Deck.gl.

Pour `BUS` et `NOCTILIEN`, une entrée de `renderStationAnchors` provider est
utilisée quand elle existe afin que le trait suive le point de raccord sur la
route. Le marqueur station reste à la coordonnée commerciale canonique. À défaut de cette
ancre, un vertex portant `stationId` est ramené à la station canonique disponible
afin d'éviter un marqueur orphelin. Cette résolution est faite avant la
projection Canvas et ne doit pas être remplacée par une heuristique dans
`renderPaths()`.

La sélection `full`/LOD est faite en amont par `TransportMapDataSource` et
`queryViewport()`. Canvas2D ne reconstruit pas un LOD différent : il prend les
vertices présents dans le path de la scène, les projette dans l'espace écran,
puis applique seulement sa préparation de trait. Il faut conserver cette
distinction lors d'un diagnostic : un sommet absent du path vient du chargement
ou du LOD des données ; un sommet présent mais non émis dans la polyligne vient
de la simplification/arrondi Canvas.

### 10.3 Paths, styles, subpaths et arrondis

`renderPaths()` applique le cycle suivant :

1. calculer les bounds monde visibles et ignorer les paths hors viewport ;
2. filtrer les lignes par mode, sélection et lignes fantômes ;
3. résoudre le style avec `resolveTransportMapPathStyle()` ;
4. projeter chaque point monde en coordonnées CSS écran ;
5. découper les plages trafic déjà indexées sur le subpath ;
6. appeler `appendRoundedPolylineToPathDirect()` ;
7. dessiner les paths ordinaires, puis les paths survolés en dernier.

Le style partagé fournit l'opacité, la largeur, la couleur native, l'état
active/ghost/hovered et le type de trafic. Le renderer Canvas peut regrouper
les traits ayant exactement le même style, mais `flushPathBatch()` est appelé
à chaque frontière de subpath. Ainsi un path qui sort puis rentre dans une
tuile ou un fragment sans arête validée ne crée jamais une ligne artificielle
entre deux morceaux.

Les `protectedPointIndices` correspondent aux vertices portant une station.
Ils sont transmis à la routine d'arrondi pour que la simplification écran ne
supprime pas une ancre métier. Les règles actuellement actives sont :

- distance minimale ordinaire de `0.35` px CSS ;
- distance minimale de la ligne active de `0.1` px CSS ;
- rayon de coin maximal de `10` px et ratio de coin `0.3` ;
- suppression d'un micro-segment seulement s'il est disproportionné et non
  ancré (`microSegmentLengthMultiplier = 5`, ratio maximal `0.12`) ;
- micro-segments conservés pour la ligne active et pour `TRAIN`/
  `TRANSILIEN` (`activeLineMicroSegmentLengthMultiplier = 0` et
  `railMicroSegmentLengthMultiplier = 0`).

Le LOD des données et cette décimation Canvas sont donc deux étapes
différentes. La règle rail est notamment ce qui préserve les courbes GTFS
courtes au lieu de les transformer en corde diagonale à fort zoom.

Pendant une interaction avec une ligne active, `prepareWorldLinePaths()` garde
également des `Path2D` monde par ligne fantôme. `renderInteractionWorldGhostPaths()`
peut alors les redessiner avec la transformation monde de la caméra, tandis que
la ligne active est préparée et tracée en espace écran. Ce chemin ne change ni
la scène ni les données ; c'est une présentation Canvas2D spécifique aux
interactions.

### 10.4 Cache de paths pendant les interactions

Le cache Canvas2D est toujours utilisé pour le réseau pendant les gestes de
pan/zoom lorsqu'il est valide. `ensurePathCacheCanvas()` crée un canvas hors
écran ; `capturePathCache()` y copie le rendu des paths ; `blitPathCache()` le
réutilise ensuite avec une translation et une échelle calculées à partir de la
caméra précédente. Le ratio du cache est plafonné par
`renderer.pathCacheMaxPixelRatio`, actuellement `1.5`.

Le cache n'est pas une source géométrique durable. Il est invalidé dès qu'un
tableau de scène, un mode visible, un état de trafic, une ligne active/
fantôme/survolée ou la taille/densité du canvas change. Une caméra dont le
centre ou le zoom change pendant le geste peut en revanche être présentée par
transformation du cache ; cela évite de redessiner tout le réseau à chaque
échantillon de molette.

La ligne focalisée suit un chemin particulier lorsque
`lineMap.svg.resizeStrokesDuringZoom` est actif : elle est redessinée en espace
écran à chaque frame d'interaction afin que sa largeur et ses arrondis restent
exacts au zoom courant. Le reste du réseau peut rester dans le cache. Les
stations et les entrées sont toujours redessinées après le cache avec la
transformation CSS exacte ; elles n'héritent donc pas des arrondis de DPR du
canvas hors écran.

Les compteurs Canvas associés sont réellement exposés dans
`TransportMapRendererMetrics` :

- `focusedLineLiveRedraw` ;
- `pathCacheCaptureCount` ;
- `pathCacheCaptureMs` ;
- `pathCacheCapturedBytes` ;
- `cacheBytes`, `drawCalls`, `visiblePathCount`, `visibleStationCount` et
  `renderMs`.

### 10.5 Stations, quais, entrées et labels

La visibilité des stations passe par `isStationNodeVisible()`, la même règle
utilisée par la préparation et le hit-test. Une station reste visible si elle
est sélectionnée, appartient à la ligne active ou au contexte fantôme survolé,
est un pôle majeur de la vue d'ensemble, ou si le zoom détaillé est atteint
(zoom `14`). Cette règle est indépendante de la stratégie de rendu.

Canvas2D applique ensuite la présentation propre à la carte legacy :

- rayon de station sélectionnée `12` px ;
- rayon de pôle `4` px ;
- rayon au hover `9` px ;
- rayon détaillé `6.5` px ;
- quais affichés à partir du zoom `12` ;
- entrées affichées à partir du zoom `14`, dans le contexte de la station
  sélectionnée, avec leur libellé à partir du zoom `15`.

Les labels de stations de la ligne active sont préparés dans l'ordre de la
ligne, avec une priorité aux terminus, à la station active, aux stations
sélectionnées et aux pôles. `renderStationLabels()` essaie plusieurs offsets,
rejette les rectangles qui se chevauchent, puis dessine les labels prioritaires
même si aucun offset sans collision n'est disponible. `ensureStationLabelAtlas()`
construit un atlas Canvas à la densité du device ; l'atlas est invalidé lorsque
la ligne, les stations ou le pixel ratio changent. Le seuil normal est
`renderer.stationLabelZoom = 10.5`, sauf si la configuration de la vue active
demande de garder les labels pendant le zoom.

### 10.6 Trafic et interaction CPU

Les `trafficPathSpans` de la scène sont groupées par
`TransportMapTrafficRangeIndex`, puis converties en vues propres à chaque
subpath par `prepareTrafficRangeViews()`. Les indices de stations contenus dans
ces fragments restent protégés. Une interruption est rendue en deux passes :
un lit pâle sous le trait rouge pointillé ; une perturbation garde la couleur
de perturbation. Le même style sémantique est partagé avec Deck.gl, mais le
dessin est entièrement Canvas2D.

Les événements restent attachés au canvas de `GlobalTransportPlan.vue`.
`queryTransportMapCandidates()` reçoit les stations et paths réellement rendus,
les index spatiaux et le masque de modes ; il donne la priorité aux stations,
retourne les lignes proches et alimente le tooltip, la sidebar et le hover.
Le picking Deck n'est pas utilisé comme source de vérité pour `/map/legacy`, ni
pour `/map`.

### 10.7 Paramètres Canvas2D qui restent actifs

Les valeurs suivantes de `GLOBAL_TRANSPORT_PLAN_CONFIG.renderer` ne sont pas
des restes documentaires : elles pilotent encore `Canvas2dRenderer` ou les
règles partagées qu'il consomme.

| Famille | Paramètres actifs |
| --- | --- |
| Cache | `pathCacheMaxPixelRatio` |
| Largeurs/opacités | `modeLineWidth`, `activeLineWidth`, `modePathAlpha`, `ghostLineAlpha`, `hoveredGhostLineAlpha`, `hoveredLineAlpha`, `hoveredLineWidthBoostCssPx` |
| Vue d'ensemble | `limitHeavyLineWidthAtOverviewZoom`, `overviewHeavyLineWidthMaxZoom`, `overviewHeavyLineWidthMaxCssPx`, `showBusOnlyStationNodesInOverview`, `overviewMajorHubMinLines` |
| Stations/labels | `selectedStationRadius`, `hubStationRadius`, `hoveredStationRadius`, `detailStationRadius`, `stationLabelZoom`, `entranceRadius`, `entranceLabelZoom` |
| Géométrie écran | `pathRounding.*` |
| Trafic | `trafficInterruptionDashArray` |

Enfin, `TransportMapBasemap.vue` et `SelectedLineBasemapCover.vue` restent
actifs dans la branche legacy de `GlobalTransportPlan.vue`. Ils appartiennent
au fond raster de `/map/legacy`, pas à la géométrie Canvas2D des lignes. Ils ne
sont jamais montés par `/map` et ne doivent donc être ni supprimés de la
branche legacy, ni décrits comme une optimisation du fond vectoriel next.

## 11. Stratégie Deck.gl/WebGL2

### 11.1 Surface

TransportMapNextSurface.vue monte MapLibre avec :

- le style transmis par la prop nextMapStyle, puis la configuration runtime ;
- sinon DEFAULT_NEXT_VECTOR_STYLE_URL, actuellement
  https://tiles.openfreemap.org/styles/bright ;
- interactive=false ;
- canvasContextAttributes.contextType="webgl2".

Le canvas transparent de GlobalTransportPlan.vue conserve les événements
pointer et wheel. MapLibre reste passif pour la navigation. Cela évite deux
caméras concurrentes.

Après le load MapLibre, la surface monte MapboxOverlay avec interleaved=true
par défaut et relie le renderer au MapLibreDeckOverlayPresenter.

### 11.2 Couches Deck

Le presenter construit une petite liste stable :

~~~text
PathLayer transport-base
PathLayer transport-traffic
PathLayer transport-highlight
ScatterplotLayer transport-stations
ScatterplotLayer transport-quays
ScatterplotLayer transport-entrances
TextLayer transport-labels
~~~

Les lignes passent avant le premier layer MapLibre de type symbol afin que les
labels du fond restent lisibles au-dessus. Le presenter ne fait setProps que
lorsque le modèle, un packet binaire ou le beforeId change.

Le picking Deck n'est pas la source de vérité V1. Le hit-test CPU partagé
continue de traiter les événements du canvas transparent.

### 11.3 Packets binaires

Chaque groupe de paths est compilé par deckPathPacket.ts :

~~~text
Float64Array positions
Uint32Array startIndices
Uint8Array colors
Float32Array widths
Float32Array dashArrays
~~~

Les positions sont plates au format XY. PathLayer reçoit explicitement
positionFormat="XY", coordinateSystem=LNGLAT et _pathType="open".

Les attributs de couleur, largeur et tiret sont répétés pour chaque vertex.
Un attribut seulement par path serait mal aligné avec l'accessor binaire
consommé par Deck.gl.

Les workers reçoivent des copies des positions. Le transfert ne détache donc
jamais les buffers encore utilisés par le modèle de scène.

DeckGeometryCache est un LRU CPU limité par
nextMap.binaryCacheMaxBytes, soit 64 MiB par défaut. Il ne possède pas de
ressource interne Deck ou luma et son éviction ne détruit aucun buffer GPU.

### 11.4 Correction du clipping transitoire pendant un hover rapide

Le défaut observé pendant des survols très rapides n'était pas un clipping
géographique du basemap. C'était une transition asynchrone entre un nouveau
modèle de scène et ses packets binaires.

DeckGlRenderer sépare maintenant :

- currentFrame : le modèle le plus récent ;
- presentedFrame : le dernier frame complet réellement remis à Deck.

Lorsqu'un nouveau hover démarre une compilation :

1. les records et les packets du nouveau modèle sont préparés ;
2. si le set binaire n'est pas complet, le presenter conserve le précédent
   frame binaire complet ;
3. la caméra et la scène d'interaction peuvent continuer à suivre le geste ;
4. lorsque tous les packets sont prêts, le nouveau set est promu en une seule
   opération ;
5. si un compilateur échoue, le renderer publie un frame complet en records
   objets, sans mélanger les deux représentations.

Ainsi Deck.gl ne voit jamais un PathLayer dont les indices appartiennent à une
géométrie et les attributs à une autre. Cette publication atomique supprime
les grandes bandes verticales visibles brièvement pendant le hover.

Les métriques binaryLayerFrames, objectFallbackFrames et
binaryPromotionDeferredDuringInteraction rendent cette transition observable.

## 12. Basemap de /map : distinction importante

/map ne monte ni TransportMapBasemap ni SelectedLineBasemapCover. Ces
composants appartiennent à la branche legacy.

Pour le basemap next :

- le style est vectoriel ;
- les tuiles, leur cache interne, leur culling et leur clipping interne
  restent ceux de MapLibre ;
- aucune couche image applicative n'est ajoutée ;
- aucun LOD d'image applicatif n'est calculé ;
- aucun cache partagé entre plusieurs couches d'images n'est nécessaire ;
- aucun cover raster ou préchargement raster ne participe au zoom ;
- le prefetch applicatif de chunks est désactivé.

Autrement dit, l'application ne remplace pas le pipeline de tuiles vectorielles
MapLibre par une mosaïque d'images. Les seuls chunks et clips encore présents
sont ceux des géométries de transport statiques, précompilés pour limiter la
quantité de données décodée.

Si le style principal échoue, la surface peut installer un style local
background-only afin de laisser Deck monté. Ce style ne contient aucune source
raster et n'est pas un fallback Canvas silencieux. Une absence de WebGL2
affiche un message et un lien vers /map.

## 13. Topologie runtime, directions et trafic

Le endpoint de topologie de ligne fournit surtout des patterns, directions,
quais et références de monitoring. Il ne fournit pas les polylignes statiques
dessinées par le plan global.

Pour un bus :

- les patterns sont regroupés par direction NeTEx normalisée ;
- un terminus sert de repli si la direction est absente ;
- un sous-parcours peut être rattaché à l'axe contenant sa séquence ;
- les arêtes de direction restent orientées au niveau du service ;
- le filtre de paths ne réaffiche pas toutes les branches lorsque le mapping
  directionnel est vide.

Les correspondances et les lignes fantômes sont chargées comme lignes forcées
pour la requête de données, mais restent filtrées séparément pour le rendu.
Cela permet de préparer leur géométrie sans rendre tout le mode correspondant.

Le trafic est projeté sur les paths déjà chargés. Les interruptions et
perturbations créent des ranges de vertices ; elles ne reconstruisent pas la
géométrie source. Une interruption est rendue par une base de gap et un
sur-trait pointillé dans les deux stratégies.

## 14. État du pack audité

Le pack présent dans public/data/global-map/v1 est :

| Élément | Valeur |
| --- | ---: |
| dataVersion | v1-26ccc53ce8f6ef8b |
| lignes | 2 011 |
| stations | 31 778 |
| paths | 14 426 |
| vertices | 1 042 408 |
| chunks | 204 |
| entrées | 2 516 |
| vélos | 0 |

Sources de géométrie :

| Source | Paths |
| --- | ---: |
| gtfs | 14 106 |
| official-open-data | 67 |
| mixed | 9 |
| netex-schematic-fallback | 244 |

Les assets régionaux rows-v2 contiennent :

| Asset | Paths |
| --- | ---: |
| regional.json | 177 |
| regional-bus.json | 14 249 |

Warnings importants du manifest :

| Code | Nombre | Interprétation |
| --- | ---: | --- |
| gtfs-station-coordinate-corrected | 6 062 | correction d'une ancre station validée par le contexte GTFS |
| gtfs-topology-edge-missing | 8 | arête sans géométrie provider complète ; elle peut rester absente |
| gtfs-line-alias | 6 | identité NeTEx résolue vers un artefact GTFS couvert |
| line-color-palette-missing | 2 011 | palette officielle facultative non fournie |
| fallback-geometry | 244 | paths schématiques incomplets, filtrés au détail pour bus/Noctilien |
| optional-source-unavailable | 1 | source BIKE absente |

Ces warnings sont des informations de provenance. Ils ne doivent pas être
remplacés par une valeur optimiste dans le frontend.

## 15. Invariants de validation

Le backend validate-global-map vérifie notamment :

- schemaVersion et transformVersion ;
- checksums et tailles du manifest, bootstrap, catalogue, regionaux et chunks ;
- bootstrap sous 2 MiB et manifest sous 250 KiB ;
- cohérence dataVersion de tous les assets ;
- présence de paths pour chaque ligne multi-station ;
- encodage rows-v2 et métadonnées quality/sourceVersion ;
- présence de chaque path une seule fois dans les deux assets régionaux ;
- indices de stations régionaux valides ;
- subpathStarts valides et propres à leur tableau de vertices ;
- ancres station connues et suffisamment proches ;
- appartenance path/chunk et bounds ;
- correspondance entre les modes du descripteur et ceux du payload ;
- isolation des chunks bus ;
- existence des LOD référencés par lodSubpathStarts ;
- conservation des ancres dans chaque LOD.

Le frontend répète les contrôles nécessaires dans assetLoader.ts avant de
mettre un payload à disposition du renderer.

## 16. Diagnostic rapide

| Symptôme | Vérifier d'abord |
| --- | --- |
| Fond flou ou image dans /map | data-map-basemap, diagnoseVectorStyle(), nombre d'éléments img, style MapLibre |
| Fond vide au démarrage | erreur MapLibre, contexte WebGL2, événement load, style fallback vectoriel |
| Ligne absente | manifest, geometryIds, sourceVersion, qualité, regional puis chunks |
| Ligne bus droite à travers la ville | source netex-schematic-fallback, niveau de zoom, LOD, pathPrecedence |
| Trait coupé sans grande bande | subpathStarts, lodSubpathStarts, qualité complete et arêtes manquantes |
| Grandes bandes verticales pendant hover | packets, startIndices, positionFormat XY, currentFrame/presentedFrame |
| Mauvaise direction de bus | pattern NeTEx, getGlobalBusDirectionOrderedStopIds(), filtre directionnel |
| Station sans trait | stationId du vertex, renderStationAnchors, résolution de source et coverage du chunk |
| Tout un mode disparaît | mode mask, modes du chunk, evictInvisibleModes() |
| Trop de requêtes hors écran dans next | nextMap.prefetch.enabled, appels à prefetchViewport(), scheduler |

Pour un bug de trait, conserver toujours :

1. l'URL et la route ;
2. le dataVersion ;
3. le lineId et le mode ;
4. le zoom et les bounds ;
5. la source et la qualité du path ;
6. le contenu des subpathStarts ;
7. la liste des chunks ;
8. les métriques du renderer.

## 17. Tests et vérifications de livraison

Tests directement liés à cette architecture :

| Test | Couverture |
| --- | --- |
| tests/transportMapAssets.test.ts | décodage rows-v2, qualité, provenance et subpaths |
| tests/transportMapDataSource.test.ts | régional/détaillé, Saint-Sulpice, LOD et fallbacks |
| tests/transportMapRendererCache.test.ts | cache Canvas2D, invalidation, DPR et redessin live |
| tests/transportMapRendererParity.test.ts | factory Canvas2D, arrondis rail et parité main-thread/worker |
| tests/transportMapSubpaths.test.ts | projection et absence de trait entre subpaths |
| tests/transportMapSpatial.test.ts | hit-test station/ligne sur les données réellement rendues |
| tests/transportMapDeckPackets.test.ts | packets, attributs par vertex, indices et swap atomique |
| tests/transportMapNextArchitecture.test.ts | factory, style vectoriel, caméra et configuration next |
| tests/transportMapChunkScheduler.test.ts | priorités, annulation et cache de chunks |
| tests/transportMapWorkerProtocol.test.ts | ownership des buffers transférés |

Résultats de l'audit du 27 août 2026 :

- npm.cmd run tsc : succès ;
- tests map ciblés : 37/37 réussis ;
- validate-global-map --full-data : succès ;
- build de production : succès ;
- benchmark tous les bus : 13 690 paths, 73 977 vertices dans la scène,
  2 422 028 octets de packets binaires ;
- vérification navigateur : 0 image dans /map, basemap vectoriel,
  attribution MapLibre présente, ligne 70 visible ;
- dézoom réel et survols rapides répétés : aucune bande verticale et aucune
  erreur console.

La commande npm.cmd run test complète a aussi été exécutée. Elle a donné
185 fichiers réussis et 8 fichiers en échec, soit 1 381 tests réussis et
17 échecs. Ces échecs sont dans des tests DOM/legacy hors du chemin ciblé
MapLibre + Deck.gl, avec notamment des fixtures legacy et des appels localhost
indisponibles. Ils ne remplacent pas les résultats ciblés ci-dessus et doivent
être traités séparément.

## 18. Commandes de maintenance

Depuis TransportClockGPT :

~~~text
npm.cmd run update:all:netex
npm.cmd run gtfs:update
npm.cmd run update:all:map
npm.cmd run tsc
npm.cmd run test:map
npm.cmd run bench:map:all-bus
npm.cmd run build
~~~

Depuis idfm-node-backend, les deux commandes de données sont :

~~~text
npm run generate-global-map
npm run validate-global-map -- --full-data
~~~

Le pack doit être régénéré dès que NeTEx, GTFS, un connector routier, une
version de géométrie ou une règle de simplification change. Ne jamais modifier
manuellement un chunk généré pour corriger un cas de ligne.

## 19. Index des fichiers actuels

### Backend

- idfm-node-backend/src/transport/global-map/compileGlobalMap.ts
- idfm-node-backend/src/transport/global-map/contracts.ts
- idfm-node-backend/src/transport/global-map/roadConnectors.ts
- idfm-node-backend/src/transport/global-map/validateGlobalMap.ts

### Frontend data et scène

- src/features/transport-map/contracts/manifest.ts
- src/features/transport-map/contracts/renderer.ts
- src/features/transport-map/data/assetLoader.ts
- src/features/transport-map/data/chunkScheduler.ts
- src/features/transport-map/data/createTransportMapDataSource.ts
- src/features/transport-map/render/transportMapRenderModel.ts
- src/features/transport-map/render/renderSceneIndex.ts
- src/features/transport-map/render/preparedPathGeometry.ts
- src/features/transport-map/render/pathRenderStyle.ts
- src/features/transport-map/render/trafficRanges.ts

### Frontend renderers

- src/features/transport-map/render/createRenderer.ts
- src/features/transport-map/render/canvas2d/canvas2dRenderer.ts
- src/features/transport-map/render/deckgl/deckGlRenderer.ts
- src/features/transport-map/render/deckgl/deckPathPacket.ts
- src/features/transport-map/next/TransportMapNextSurface.vue
- src/features/transport-map/next/deckMapLayers.ts
- src/features/transport-map/next/deckMapPresenter.ts
- src/features/transport-map/next/nextMapConfig.ts
- src/features/line-map/GlobalTransportPlan.vue

### Validation

- tests/transportMapAssets.test.ts
- tests/transportMapDataSource.test.ts
- tests/transportMapDeckPackets.test.ts
- tests/transportMapNextArchitecture.test.ts
- scripts/transport-map/bench-all-bus.ts
- public/data/global-map/v1/reports/data-audit.json

## 20. Règle de maintenance de ce document

Ce fichier doit rester une description de l'état courant, pas un journal
d'appendices. Lorsqu'une implémentation change :

1. modifier la section qui décrit le comportement concerné ;
2. mettre à jour la version et les métriques du pack ;
3. remplacer les résultats de validation devenus obsolètes ;
4. retirer les explications qui ne correspondent plus au code ;
5. conserver uniquement les limitations encore vérifiables.

Les décisions générales de la nouvelle expérience sont documentées dans
MAP_NEXT_FACTORY_STRATEGY_IMPLEMENTATION.md. Les détails de produit qui ne
concernent ni la géométrie ni le rendu du plan global ne doivent pas être
réintroduits ici.

## Conclusion

Le flux actuel sépare clairement :

- la topologie NeTEx ;
- les formes GTFS ou officielles ;
- le pack statique versionné ;
- la scène de rendu commune ;
- la décision Factory ;
- la stratégie Canvas2D legacy ;
- la stratégie Deck.gl/WebGL2 de /map.

Le basemap de /map est laissé à MapLibre en vectoriel avec ses
comportements de tuiles par défaut. Les optimisations restantes concernent
uniquement la géométrie de transport et ses packets Deck.gl. La publication
atomique des frames empêche désormais qu'un hover rapide mélange des buffers
incompatibles.
