# Mission

> Mise à jour du 30 août 2026 : ce cahier a été rédigé avant le renommage des
> routes. La nouvelle expérience est désormais canonique sur `/map`, l’ancien
> moteur reste accessible sur `/map/legacy`, et `/map/next` redirige vers
> `/map`. Les mentions de `/map/legacy` et `/map` ci-dessous ont été
> réinterprétées selon cette cartographie actuelle.

Tu travailles sur une application Vue 3 / Nuxt 3 contenant un moteur cartographique custom avancé pour le réseau de transports d’Île-de-France.

Tu as accès au repository complet.

La route actuelle :

```text
/map/legacy
```

doit rester **strictement fonctionnelle et conserver son architecture actuelle** :

```text
/map/legacy
→ basemap raster actuel
→ Canvas2dRenderer
```

Nous voulons ajouter en parallèle :

```text
/map
```

avec une nouvelle architecture :

```text
/map
→ MapLibre GL JS
→ basemap 100 % vectoriel
→ deck.gl
→ rendu transport GPU WebGL2
```

La nouvelle route ne remplace pas l’ancienne.

Les deux implémentations doivent pouvoir coexister durablement.

---

# Règle fondamentale

## `/map/legacy` est intouchable fonctionnellement

La route historique doit rester :

```text
/map/legacy
→ legacy
→ Canvas2D
```

Conserver notamment :

- `Canvas2dRenderer`
- basemap actuel
- caches Canvas
- `Path2D`
- raster interaction cache
- selected-line basemap covers
- tests historiques
- benchmarks historiques
- UX actuelle

Ne jamais :

- rediriger `/map/legacy` vers `/map`
- supprimer Canvas2D
- transformer `/map/legacy` en MapLibre
- remplacer silencieusement Canvas2D
- faire de deck.gl le renderer par défaut de `/map/legacy`

---

# Nouvelle route

Créer :

```text
/map
```

qui doit fournir :

```text
MapLibre vectoriel
+
deck.gl
+
WebGL2
```

avec la même logique métier que `/map/legacy`.

La route `/map` doit conserver toutes les fonctionnalités de `/map/legacy`.

---

# Architecture générale cible

Nous voulons explicitement utiliser :

## Factory Pattern

pour choisir l’expérience cartographique.

## Strategy Pattern

pour encapsuler les différentes stratégies de rendu.

Architecture conceptuelle :

```text
                       GlobalTransportPlan
                               |
                               v
                     TransportMapRenderScene
                               |
                               v
                   TransportMapExperience
                               ^
                               |
                  +------------+-------------+
                  |                          |
          LegacyMapExperience       NextMapExperience
                  |                          |
          Raster basemap               MapLibre
                  +                          +
          Canvas2dRenderer            DeckGlRenderer
                                             |
                                           deck.gl
                                             |
                                           WebGL2
```

---

# Point essentiel : Factory centralisée

Le choix entre legacy et next doit être centralisé.

Exemple conceptuel :

```ts
type TransportMapExperienceKind =
  | "legacy"
  | "next";
```

Puis :

```ts
function createTransportMapExperience(
  kind: TransportMapExperienceKind,
): TransportMapExperience {
  switch (kind) {
    case "next":
      return new MapLibreDeckMapExperience();

    case "legacy":
    default:
      return new LegacyCanvasMapExperience();
  }
}
```

La structure exacte doit être adaptée au repository existant.

Mais la règle est :

> le choix du backend ne doit apparaître qu’à quelques frontières clairement identifiées.

---

# INTERDICTION : if/else dispersés

Ne jamais transformer le code en :

```ts
if (isNext) {
  // deck
} else {
  // canvas
}
```

répété dans :

```text
renderPaths()
renderStations()
renderTraffic()
renderLabels()
hover
selection
directions
viewport
```

Mauvaise architecture :

```text
GlobalTransportPlan
 |
 +-- if deck ...
 +-- if canvas ...
 +-- if deck ...
 +-- if canvas ...
```

Architecture voulue :

```text
GlobalTransportPlan
       |
       v
TransportMapRenderScene
       |
       v
Factory
       |
 +-----+------+
 |            |
Canvas      Deck
```

---

# Deck.gl est ici notre backend WebGL2

Ne pas écrire un renderer WebGL2 natif custom dans cette tâche.

Ne pas implémenter :

```text
raw WebGL shaders
manual VAO
manual gl.bufferData
manual line tessellation engine
manual GPU picking
```

si deck.gl sait déjà fournir le comportement nécessaire.

Le backend GPU principal est :

```text
DeckGlRenderer
```

qui utilise les couches deck.gl.

Deck.gl fournit notamment :

```text
PathLayer
ScatterplotLayer
TextLayer
IconLayer
```

et des extensions si nécessaire.

---

# MapLibre + deck.gl interleaved

Utiliser préférentiellement :

```ts
MapboxOverlay({
  interleaved: true
})
```

de :

```text
@deck.gl/mapbox
```

malgré le nom du package, il est compatible avec MapLibre.

Le mode interleaved permet :

```text
MapLibre
     |
     +-- polygons / roads
     |
     +-- deck transport paths
     |
     +-- MapLibre road/place labels
     |
     +-- deck stations
```

et utilise le **même WebGL2RenderingContext**.

C’est le mode cible.

Ne pas utiliser un deuxième canvas deck.gl sauf limitation démontrée.

---

# Contraintes WebGL2

`/map` exige WebGL2.

Si WebGL2 n’est pas disponible :

ne pas basculer silencieusement vers Canvas2D.

Afficher quelque chose comme :

```text
Cette version de la carte nécessite WebGL2.
Utiliser la carte classique.
```

avec lien vers :

```text
/map/legacy
```

Cela est important car `/map` sert également de référence de benchmark GPU.

---

# Basemap obligatoirement vectoriel

La carte de `/map` doit être une **vraie carte vectorielle**.

Pas :

```text
MapLibre
→ raster XYZ PNG/JPEG
```

Nous voulons :

```text
MapLibre
→ vector tiles
→ WebGL
```

Les routes, bâtiments, eau, parcs, etc. doivent provenir d’un style vectoriel.

---

# Provider du basemap

Créer une configuration injectable.

Exemple conceptuel :

```ts
nextMap: {
  styleUrl: "...",
}
```

ou utilisation du runtime config Nuxt.

Si le projet n’a pas déjà un provider vectoriel :

utiliser par défaut un style OpenFreeMap / OpenMapTiles compatible MapLibre.

Mais ne hardcoder le provider que dans une couche de configuration.

Le renderer transport ne doit absolument pas connaître OpenFreeMap.

---

# Vérification obligatoire du style

Ajouter une validation/debug en développement permettant de vérifier que le style de production contient réellement :

```text
source.type = "vector"
```

pour les données cartographiques principales.

Ne pas considérer une carte MapLibre utilisant uniquement des raster tiles comme satisfaisant cette tâche.

---

# Code splitting

Très important.

Une visite de :

```text
/map/legacy
```

ne doit idéalement PAS télécharger :

```text
maplibre-gl
@deck.gl/core
@deck.gl/layers
@deck.gl/mapbox
@deck.gl/extensions
```

La nouvelle stack GPU doit être chargée uniquement pour :

```text
/map
```

Utiliser si nécessaire :

```text
dynamic import()
defineAsyncComponent()
route-level code splitting
```

selon l’architecture Nuxt réellement observée.

Ne pas faire d’import statique de deck.gl dans un module partagé chargé par `/map/legacy`.

---

# Audit initial obligatoire

Avant toute modification :

inspecter précisément :

```text
features/line-map/
features/transport-map/
```

et toutes les routes/pages Nuxt.

Examiner notamment :

```text
GlobalTransportPlan.vue

useGlobalTransportScene.ts
useGlobalTransportMapInteraction.ts
useGlobalTransportViewport.ts
useGlobalLineDirections.ts
useGlobalTransportRouteState.ts
useSelectedLineZoomScenario.ts
useChaosZoom.ts
```

ainsi que :

```text
transport-map/contracts/
transport-map/render/
transport-map/data/
transport-map/geo/
transport-map/interaction/
transport-map/spatial/
transport-map/performance/
transport-map/workers/
```

---

# Réutiliser les abstractions existantes

Le récent refactoring a déjà créé :

```text
TransportMapRenderScene
TransportMapRenderSceneIndex
PreparedWorldPathGeometryCache
resolveTransportMapPathStyle
TransportMapTrafficRangeIndex
station visibility
spatial hit testing
TransportMapDataSource
```

Ne pas dupliquer ces concepts.

`DeckGlRenderer` doit consommer la même scène que `Canvas2dRenderer`.

---

# Objectif principal de partage

Nous voulons :

```text
              même état métier
                    |
                    v
           TransportMapRenderScene
                    |
          +---------+---------+
          |                   |
    Canvas renderer      Deck renderer
```

Pas :

```text
Legacy business logic

ET

Next business logic copiée
```

---

# Ne pas dupliquer GlobalTransportPlan

Ne jamais créer :

```text
GlobalTransportPlanNext.vue
```

comme copie de plusieurs milliers de lignes de `GlobalTransportPlan.vue`.

Ce serait un échec.

Réutiliser :

- sidebar
- recherche
- filtres
- directions
- trafic
- dashboard
- route state
- sélection
- viewport
- caméra
- interactions
- scène
- hit testing

---

# Une architecture Vue acceptable

Exemple conceptuel :

```vue
<GlobalTransportPlan experience="legacy" />
```

pour :

```text
/map/legacy
```

et :

```vue
<GlobalTransportPlan experience="next" />
```

pour :

```text
/map
```

Mais cette API n’est pas imposée.

Une autre possibilité propre serait :

```text
GlobalTransportPlanShell
   |
   +-- LegacyMapSurface
   |
   +-- NextMapSurface
```

Le repository réel doit déterminer le meilleur choix.

---

# Préférence : séparer la surface de carte

Idéalement, extraire conceptuellement :

```text
GlobalTransportPlan
 |
 +-- UI commune
 |
 +-- TransportMapSurface
```

Puis :

```text
TransportMapSurface
        ^
        |
 +------+------+
 |             |
Legacy        Next
Surface       Surface
```

`LegacyMapSurface` conserve :

```text
basemap actuel
canvas actuel
selected-line covers
```

`NextMapSurface` possède :

```text
MapLibre
DeckGlRenderer
```

---

# Factory au niveau "experience"

Le factory le plus important doit probablement être au-dessus du simple renderer.

Pourquoi ?

Parce que :

```text
legacy
=
raster basemap + Canvas2D
```

alors que :

```text
next
=
MapLibre + deck.gl
```

Le host/lifecycle n’est donc pas exactement identique.

Éviter de déformer une interface Canvas-centric uniquement pour y faire rentrer MapLibre.

---

# Interface conceptuelle

Une interface possible :

```ts
interface TransportMapExperience {
  mount(host: HTMLElement): Promise<void>;

  present(
    camera: CameraState,
    scene: TransportMapRenderScene,
  ): void;

  resize(
    width: number,
    height: number,
    pixelRatio: number,
  ): void;

  getMetrics(): TransportMapRendererMetrics;

  dispose(): void;
}
```

Puis :

```text
LegacyCanvasMapExperience
MapLibreDeckMapExperience
```

Cette interface n’est pas imposée mot pour mot.

Adapter au repository.

---

# Renderer Strategy interne

Même dans la Next Experience, isoler deck.gl :

```text
MapLibreDeckMapExperience
       |
       +-- MapLibreVectorBasemap
       |
       +-- DeckGlRenderer
```

`DeckGlRenderer` est une Strategy de rendu transport.

---

# DeckGlRenderer

Créer une classe/service dédié.

Conceptuellement :

```ts
class DeckGlRenderer {
  setScene(
    camera: CameraState,
    scene: TransportMapRenderScene,
  ): void;

  createLayers(): Layer[];

  getMetrics(): ...
  dispose(): void;
}
```

Tout import de :

```text
PathLayer
ScatterplotLayer
TextLayer
IconLayer
MapboxOverlay
PathStyleExtension
```

doit rester enfermé dans l’implémentation next/deck.

---

# Pas de dépendance deck dans le métier

Ces fichiers ne doivent pas connaître deck.gl :

```text
TransportMapDataSource
useGlobalLineDirections
useGlobalTransportViewport
selection
traffic
route state
dashboard
```

Ils parlent uniquement avec les structures internes actuelles.

---

# Caméra : conserver le moteur actuel

Pour V1, ne remplace pas la caméra actuelle par celle de MapLibre.

La source de vérité continue d’être :

```text
CameraState
```

et :

```text
useGlobalTransportMapInteraction
```

Conserver :

- wheel smoothing
- zoom autour du pointeur
- pinch
- inertia
- progressive station navigation
- reset
- keyboard
- deep links
- partage viewport

---

# MapLibre initialement non interactif

Initialiser MapLibre avec ses handlers de navigation désactivés.

Conceptuellement :

```ts
new Map({
  ...,
  interactive: false,
  pitch: 0,
  bearing: 0,
});
```

Les événements continuent d’être gérés par ton moteur existant.

---

# Pourquoi

Cela permet de transformer uniquement :

```text
renderer
+
basemap
```

sans changer simultanément :

```text
gestures
camera semantics
routing
selection
```

Ce découplage est critique pour atteindre la parité fonctionnelle.

---

# Surface d’événements

Sur `/map`, le canvas MapLibre peut devenir le target des événements :

```text
pointerdown
pointermove
pointerup
wheel
```

mais ils doivent être traités par les handlers existants.

MapLibre ne doit pas traiter la même wheel event en parallèle.

---

# Synchronisation CameraState -> MapLibre

Créer un adapter explicite :

```ts
syncCameraToMapLibre(camera);
```

Ne pas disperser :

```ts
map.jumpTo(...)
```

dans plusieurs composables.

---

# Projection

Le moteur actuel utilise du Web Mercator normalisé pour ses `worldX/worldY`.

Cependant :

ne pas supposer que ces coordonnées peuvent être passées directement à deck.gl sans adaptation.

Créer une abstraction claire de conversion.

---

# Stratégie de coordonnées Deck V1

Pour la première implémentation fiable :

utiliser de préférence des coordonnées deck.gl géographiques :

```text
COORDINATE_SYSTEM.LNGLAT
```

et convertir la géométrie WebMercator actuelle vers :

```text
longitude / latitude
```

UNE SEULE FOIS lors de la préparation des données.

Ne jamais effectuer cette conversion à chaque frame.

---

# Conversion géométrique

Le pipeline initial peut être :

```text
PreparedWorldPathGeometry
        |
        v
worker / preparation
        |
        v
Float64Array longitude/latitude
        |
        v
deck.gl PathLayer binary data
```

---

# Pourquoi Float64Array initialement

Pour préserver la précision aux très gros zooms.

Deck.gl possède sa propre gestion de précision de projection.

Ne jamais choisir Float32 uniquement pour économiser de la mémoire avant d’avoir validé le contrat de précision.

---

# Optimisation CARTESIAN possible plus tard

Deck.gl supporte également des systèmes de coordonnées pré-projetés.

Une future optimisation peut étudier :

```text
COORDINATE_SYSTEM.CARTESIAN
```

avec les coordonnées Mercator déjà disponibles.

Mais uniquement si :

1. le mapping exact est compris ;
2. des tests de projection passent ;
3. le gain CPU/mémoire est mesurable ;
4. aucune précision n’est perdue.

Ne pas faire cette optimisation dans la première passe uniquement pour être "plus bas niveau".

---

# Tests de projection obligatoires

Comparer :

```text
legacy worldToScreen()
```

et :

```text
MapLibre project()
```

sur :

- centre
- coins viewport
- Paris
- banlieue
- zoom 10
- zoom 12
- zoom 14
- zoom 16
- zoom 18
- zoom 20+
- zoom max supporté

Budget d’erreur conforme à :

```text
precisionContract.ts
```

---

# MapLibre devient la caméra GPU observée

Même si `CameraState` reste la source de vérité :

```text
CameraState
     |
     v
MapLibre camera
     |
     v
Deck MapView
```

`MapboxOverlay` synchronise deck.gl avec la caméra MapLibre.

Ne pas maintenir une seconde `viewState` deck indépendante.

---

# Pas de double animation loop

Attention :

le moteur actuel possède parfois ses propres RAF :

```text
wheel
inertia
camera flight
```

MapLibre possède aussi son propre render cycle.

Sur `/map` :

les RAF existants mettent à jour :

```text
CameraState
```

puis synchronisent MapLibre et demandent un repaint.

Ne pas lancer une boucle deck permanente indépendante.

---

# Deck overlay

Créer :

```ts
const overlay = new MapboxOverlay({
  interleaved: true,
  layers: [...]
});
```

Puis :

```ts
map.addControl(overlay);
```

ou l’intégration officielle appropriée à la version installée.

---

# Ordre MapLibre / deck.gl

Utiliser le mode interleaved pour obtenir :

```text
MapLibre background
MapLibre land
MapLibre water
MapLibre roads

Deck transport paths

MapLibre road labels
MapLibre city labels

Deck stations
Deck transport labels
```

si possible.

---

# beforeId dynamique

Ne pas hardcoder arbitrairement :

```text
road-label
place-label
```

car les IDs dépendent du style.

Créer un helper qui cherche :

```text
premier layer MapLibre de type "symbol"
```

ou une stratégie configurable.

Les paths transport peuvent être insérés avant ce layer.

---

# Layers deck recommandés

Première architecture :

```text
DeckGlRenderer
 |
 +-- BaseTransportPathLayer
 |
 +-- TrafficPathLayer
 |
 +-- HighlightPathLayer
 |
 +-- StationLayer
 |
 +-- QuayLayer
 |
 +-- EntranceLayer
 |
 +-- TransportLabelLayer
```

---

# PathLayer

Utiliser :

```text
PathLayer
```

pour les lignes transport.

Configurer :

```text
widthUnits: "pixels"
```

afin de préserver les largeurs CSS actuelles.

---

# Qualité des lignes

Utiliser :

```text
jointRounded: true
capRounded: true
```

si cela correspond au Canvas actuel.

Comparer visuellement.

---

# Dashes

Si le renderer Canvas utilise des lignes en pointillés :

utiliser :

```text
PathStyleExtension
```

avec :

```text
dash: true
```

plutôt que réimplémenter des shaders.

Ne pas activer les extensions deck inutilement si elles ont un coût.

---

# PathLayer binary mode

Pour les gros datasets et notamment les bus :

viser le format binary de `PathLayer`.

Le résultat doit ressembler conceptuellement à :

```ts
{
  length,
  startIndices,
  attributes: {
    getPath: {
      value: positions,
      size: 2
    },
    getColor: {
      value: colors,
      size: 4
    },
    getWidth: {
      value: widths,
      size: 1
    }
  }
}
```

Deck.gl supporte explicitement l’alimentation binaire de PathLayer avec `startIndices`.

---

# `_pathType: "open"`

Lorsque les données ont été validées/préparées :

utiliser si compatible :

```ts
_pathType: "open"
```

afin que PathLayer puisse éviter sa normalisation de géométrie.

C’est un chemin d’optimisation explicitement prévu pour les données statiques/prétraitées.

---

# Ne pas commencer directement en binary mode

Pour limiter le risque :

## Phase correctness

Commencer si nécessaire par :

```text
PathLayer
data = simple arrays
```

afin de valider la parité.

Puis :

## Phase performance

passer à :

```text
binary PathLayer
```

avec worker.

Ne pas mélanger tous les problèmes au premier commit.

---

# Subpaths

Respecter :

```text
GlobalMapPath.subpathStarts
```

Un path peut contenir plusieurs fragments.

Transformer chaque fragment en path deck distinct ou utiliser correctement `startIndices`.

Jamais :

```text
fin fragment A
→ segment parasite
→ début fragment B
```

---

# Styles partagés

Réutiliser :

```text
resolveTransportMapPathStyle()
```

pour obtenir :

- couleur
- alpha
- largeur
- visible
- priorité
- ghost
- active
- hovered
- traffic semantics

Ne pas créer :

```text
deckPathStyleResolver
```

concurrent.

---

# Couleurs binaires

Convertir les styles vers :

```text
Uint8Array RGBA
```

lors de la compilation des packets.

Ne pas parser des couleurs hex dans la frame loop.

---

# Largeurs

Préparer :

```text
Float32Array
```

ou format adapté pour :

```text
getWidth
```

en CSS pixels.

---

# Ordre de rendu

Respecter :

```text
style.order
```

du renderer partagé.

Si nécessaire, créer quelques PathLayers distincts :

```text
base
ghost
active
hover
traffic
```

plutôt qu’un layer par ligne.

---

# INTERDICTION : un PathLayer par ligne

Ne pas créer :

```text
1500 lignes bus
→ 1500 PathLayer
```

Cela serait une mauvaise architecture.

Préférer :

```text
quelques layers
+
attributs binaires
```

---

# Base path layer

Le gros dataset principal doit idéalement être dessiné par un nombre très faible de PathLayers.

Exemple :

```text
all-normal-paths
ghost-paths
traffic-overlay
selection-overlay
```

---

# Highlight / hover

Un hover ne doit pas provoquer :

```text
rebuild all bus binary data
```

Le base layer reste inchangé.

Créer un petit overlay layer contenant uniquement :

```text
hovered / selected geometry
```

référencée depuis le cache.

---

# Traffic

Même principe.

Le réseau normal reste stable.

Dessiner les portions :

```text
disturbance
interruption
```

dans un ou plusieurs overlay PathLayers.

Réutiliser :

```text
TransportMapTrafficRangeIndex
```

pour construire les sous-ranges.

---

# Traffic update

Un refresh trafic ne doit pas invalider les positions de tout le réseau.

Cible :

```text
base positions
→ identiques

traffic overlay
→ mise à jour
```

---

# Stations

Utiliser :

```text
ScatterplotLayer
```

pour les stations simples.

C’est précisément le genre de primitive GPU instanciée efficace pour des milliers de points.

---

# stationVisibility

Conserver exactement :

```text
stationVisibility
```

et ses règles.

Le Deck renderer ne doit pas réinventer les seuils d’apparition.

---

# État station

Préserver :

- selected
- hovered
- active
- traffic affected
- station major
- line focus

---

# Quays

Utiliser :

```text
ScatterplotLayer
```

ou `IconLayer` selon l’aspect actuel.

Ne modifier aucune sémantique.

---

# Entrances

Utiliser également :

```text
ScatterplotLayer
```

ou :

```text
IconLayer
```

selon le visuel.

Conserver :

```text
focusedEntranceId
```

---

# Labels

Utiliser :

```text
TextLayer
```

pour les labels transport.

Éviter de continuer à dessiner les labels dans Canvas2D sur `/map`.

---

# TextLayer

Préserver autant que possible :

- font
- size
- color
- outline
- anchor
- offset
- text
- visible states

---

# Labels MapLibre vs labels transport

MapLibre gère :

```text
rues
quartiers
communes
POI du basemap
```

Deck gère :

```text
stations transport
labels spécifiques au réseau
```

Ne duplique pas les noms de rues.

---

# Picking

Pour V1 :

ne pas utiliser le picking deck.gl comme nouvelle source de vérité.

Conserver le hit testing CPU existant.

Pourquoi :

nous voulons conserver exactement :

```text
hover
station priority
multiple overlapping lines
distance to segment
tooltip candidates
```

---

# Hit testing existant

Continuer à utiliser :

```text
queryTransportMapCandidates()
```

et :

```text
path spatial index
station spatial index
```

Le GPU dessine seulement.

---

# Picking deck facultatif plus tard

Une fois la parité atteinte :

benchmark possible entre :

```text
CPU spatial hit test
```

et :

```text
deck picking
```

mais pas dans cette mission initiale.

---

# Point 1 des optimisations : GPU via deck.gl

Le premier objectif des cinq points est désormais :

```text
DeckGlRenderer
```

et non :

```text
NativeWebGL2Renderer
```

Deck doit conserver les GPU resources lorsqu’un layer/data n’a pas changé.

---

# Stabilité de data identity

Deck.gl optimise ses attributs lorsque le `data` prop reste identique par comparaison superficielle.

Donc :

ne pas faire dans un computed exécuté fréquemment :

```ts
data: [...samePaths]
```

à chaque frame.

Conserver des références stables.

Deck ne recalcule normalement pas les accessors tant que `data` n’a pas changé ou qu’un update trigger ne l’exige.

---

# Scene generation

Créer une notion claire de :

```text
geometryGeneration
styleGeneration
selectionGeneration
trafficGeneration
```

si utile.

Ne pas reconstruire un binary packet parce que seule la caméra a changé.

---

# Critère absolu pan/zoom

Pendant :

```text
pan
wheel
pinch
inertia
```

si la scène géométrique ne change pas :

```text
PathLayer data identity
```

doit rester stable.

---

# Point 2 : MapLibre vectoriel

MapLibre devient responsable uniquement du basemap.

Il gère :

```text
vector tile fetching
vector tile parsing
basemap GPU rendering
basemap tile cache
labels basemap
```

Ne pas recréer ces mécanismes.

---

# Basemap cache

Ne pas implémenter toi-même :

```text
MapLibreVectorTileCache
```

MapLibre possède déjà son système de tiles.

Le cache transport reste distinct.

---

# Point 3 : worker -> TypedArrays -> Deck

Le repository possède déjà :

```text
TransportMapWorkerPool
workers/protocol.ts
transportMap.worker.ts
```

Étendre cette infrastructure.

Ne pas créer immédiatement un second worker pool.

---

# Worker compiler

Ajouter une opération conceptuelle :

```text
compile-deck-paths
```

ou une responsabilité équivalente.

Entrée :

```text
prepared path geometry
styles
subpaths
```

Sortie :

```text
DeckPathBinaryPacket
```

---

# Packet binaire conceptuel

Exemple :

```ts
interface DeckPathBinaryPacket {
  key: string;

  pathCount: number;

  positions: Float64Array;
  startIndices: Uint32Array;

  colors: Uint8Array;
  widths: Float32Array;

  pathIds: string[];
  lineIds: string[];

  bytes: number;
}
```

Adapter précisément aux besoins de deck.

---

# Worker transfer

Utiliser :

```ts
postMessage(result, transferList)
```

pour transférer les buffers.

Ne pas structured-clone inutilement :

```text
50 MB TypedArray
```

---

# Ownership

Documenter :

```text
worker owns ArrayBuffer
        |
postMessage transfer
        |
main thread owns ArrayBuffer
```

Après transfert, le worker ne doit plus utiliser le buffer détaché.

---

# Pas de `.slice()` inutile

Si le code actuel contient une fonction `transferableBuffers()` qui copie les buffers avec :

```ts
buffer.slice()
```

analyser si la copie est réellement nécessaire.

Si non :

transférer directement l’ArrayBuffer original.

---

# Phase worker correctness

Au début :

il est acceptable de compiler :

```text
scene.paths
→ worker
```

même si le structured clone initial n’est pas idéal.

Puis mesurer.

---

# Phase worker optimisation

Ensuite, si les profils montrent que le clone est coûteux :

rapprocher la compilation binary du moment où les chunks sont déjà décodés dans le worker.

Ne pas réécrire simultanément tout le DataSource.

---

# Point 4 : cache GPU / Deck cache

Avec deck.gl :

ne pas implémenter un cache brut de :

```text
WebGLBuffer
VAO
Texture
```

en utilisant des APIs internes deck/luma non documentées.

Deck gère lui-même ses GPU resources.

---

# Notre responsabilité cache

Créer un cache de :

```text
compiled binary geometry
stable deck data objects
chunk/LOD geometry packets
```

qui permette à deck de réutiliser ses attributs.

Conceptuellement :

```text
DeckGeometryCache
```

---

# Cache key

Une clé doit différencier :

```text
path/source version
LOD
subpath structure
geometry generation
```

Ne pas utiliser uniquement :

```text
path.id
```

car la même ligne peut avoir plusieurs LOD.

---

# LRU

Le cache binary CPU doit être borné.

Par exemple :

```text
maxBytes
```

et pas uniquement :

```text
maxEntries
```

---

# Retour viewport A -> B -> A

Cible :

```text
A
→ packet binary compilé

B
→ packet B

retour A
→ binary cache hit
```

Deck peut ensuite réutiliser/recréer ses buffers sans refaire toute la compilation.

---

# Persistance GPU réelle

Mesurer comment deck réagit lorsque :

```text
Layer A
```

disparaît puis revient.

Ne pas supposer que le GPU buffer survit à la finalisation d’un layer.

---

# Si nécessaire : pool de layers cachés

Seulement si les benchmarks démontrent un bénéfice :

conserver un nombre borné de datasets/layers de chunks récents dans le tree deck avec :

```text
visible: false
```

afin de préserver l’état GPU.

Mais :

ne pas créer des centaines de layers simplement pour cacher le GPU.

Mesurer :

```text
draw calls
layer count
VRAM
```

---

# Ne pas utiliser des APIs privées deck.gl

Ne pas accéder directement à :

```text
layer.internalState
attributeManager private fields
luma internal GPU handles
```

pour fabriquer un cache GPU.

Rester sur les APIs publiques.

---

# Métriques cache

Ajouter :

```text
binaryCacheBytes
binaryCacheEntries
binaryCacheHits
binaryCacheMisses
binaryCacheEvictions

binaryCompileMs
binaryCompileBytes

deckLayerRebuilds
geometryPacketReuses
```

---

# Upload GPU indirect

Si deck/luma expose des metrics publiques suffisamment fiables :

les utiliser.

Sinon :

ne pas inventer de fausses mesures `gpuUploadMs`.

Mesurer ce que nous contrôlons précisément.

---

# Point 5 : predictive prefetch

Le scheduler possède déjà :

```text
critical
visible
overscan
prefetch
```

Auditer son utilisation.

---

# Préfetch transport uniquement

MapLibre gère son propre basemap tile pipeline.

Notre predictive prefetch concerne principalement :

```text
transport chunks
binary preparation
```

---

# Inputs prédictifs

Utiliser :

```text
drag velocity
inertia velocity
wheelTargetZoom
camera flight target
current camera
```

---

# Drag prefetch

Pendant un pan :

prédire :

```text
future center
```

sur un horizon court configurable.

Construire un viewport légèrement en avant.

Scheduler :

```text
priority = prefetch
```

---

# Wheel prefetch

Tu connais déjà :

```text
wheelTargetZoom
```

Utiliser ce target pour précharger :

```text
chunks du futur viewport
+
LOD correspondant
```

avant settle.

---

# Camera flight

Pour :

```text
animateCameraToStation
zoomToLine
```

la destination est connue.

Prefetch la destination.

---

# Précompiler les packets deck

Une optimisation forte :

après récupération d’un chunk en prefetch :

ne pas seulement le mettre dans le cache decoded.

On peut également, si le CPU worker est libre :

```text
compile DeckPathBinaryPacket
```

avant que le chunk soit visible.

Donc :

```text
visible arrive
↓
packet déjà prêt
↓
deck layer update
```

---

# Priority

Visible doit toujours gagner sur prefetch.

Ordre :

```text
critical
visible
overscan
prefetch
```

---

# Préemption

Si tous les worker/fetch slots sont utilisés par prefetch :

une requête visible doit pouvoir passer rapidement.

Annuler ou déprioriser un prefetch lorsque nécessaire.

---

# Prefetch generations

Ne pas annuler tous les prefetch utiles à chaque :

```text
camera.generation++
```

Créer si nécessaire :

```text
prefetch epoch
TTL
predicted viewport key
```

---

# Prefetch budget

Borner :

```text
maximum chunks
maximum bytes
prediction horizon
frequency
zoom delta
```

---

# Prefetch métriques

Ajouter :

```text
prefetchRequests
prefetchHits
prefetchUsefulHits
prefetchCancelled
prefetchBytes
prefetchCompileMs
```

---

# Les cinq évolutions résumées

La cible devient :

```text
1. DeckGlRenderer
   → WebGL2 via deck.gl

2. MapLibre vectoriel
   → basemap vector tiles GPU

3. Workers
   → binary TypedArrays
   → PathLayer binary

4. DeckGeometryCache
   → stable packets / stable identities
   → deck GPU resource reuse

5. Predictive prefetch
   → data + binary packets prêts avant visibilité
```

---

# Fonctionnalités à préserver

Construire une checklist complète avant modification.

Inclure au minimum :

## Modes

```text
Bus
Noctilien
Metro
RER
Train
Transilien
Tram
Cable
Bike si présent
```

## Sélection

```text
ligne
station
multi-station
station + active line
```

## Directions

```text
direction selection
merge directions
geometry fallback
```

## Correspondances

```text
ghost lines
connected stations
exact detailed geometry
```

## Traffic

```text
enable
disable
refresh
disturbance
interruption
traffic path spans
affected stations
disruption selection
```

## Search

```text
station search
line search
catalog lazy load
selection depuis résultat
```

## Camera

```text
pan
wheel
pinch
inertia
keyboard
reset
zoom to line
animate to station
resize
```

## Routing

```text
station query
line query
direction query
mergeDirections
shared viewport
debug queries
```

## UI

```text
sidebar
tooltip
multi-line chooser
hover
line preview
dashboard
undo
entrance
quays
labels
```

## Benchmarks

```text
chaos zoom
selected-line-wheel
```

---

# Tests : `/map/legacy` reste la baseline

Avant toute modification :

lancer :

```text
TypeScript
lint
unit tests
integration tests
E2E
benchmarks disponibles
```

Enregistrer les résultats.

---

# Legacy gate

Après chaque phase :

relancer tous les tests `/map/legacy`.

Si un test legacy casse :

STOP.

Corriger avant de poursuivre.

---

# Shared functional tests

Créer autant que possible une matrice :

```ts
describe.each([
  {
    route: "/map/legacy",
    experience: "legacy",
    renderer: "canvas2d-main-thread",
  },
  {
    route: "/map",
    experience: "next",
    renderer: "deckgl-webgl2",
  },
])(...)
```

Les mêmes scénarios métier doivent être exécutés.

---

# data attributes debug

Ajouter des marqueurs non visibles :

Pour `/map/legacy` :

```html
data-map-experience="legacy"
data-transport-renderer="canvas2d-main-thread"
data-map-basemap="legacy-raster"
```

Pour `/map` :

```html
data-map-experience="next"
data-transport-renderer="deckgl-webgl2"
data-map-basemap="maplibre-vector"
```

---

# Tests de basemap vectoriel

Ajouter un test qui vérifie que `/map` instancie effectivement :

```text
MapLibre
```

et :

```text
DeckGlRenderer
```

et PAS :

```text
Canvas2dRenderer
```

---

# Tests sans réseau public

Les tests automatisés ne doivent pas dépendre d’OpenFreeMap ou d’un serveur externe.

Le style MapLibre doit être injectable.

Pour tests :

utiliser un style local minimal.

---

# Smoke test vector style

Ajouter séparément un test/config validation du style de production vérifiant qu’il utilise bien des sources vectorielles.

---

# Semantic parity avant pixel parity

Les tests principaux vérifient :

```text
selectedStationId
activeLineId
visible modes
direction
ghost line IDs
traffic state
path count
station count
URL
tooltip candidates
```

---

# Visual regression

Ajouter quelques scènes :

```text
1. overview
2. all buses
3. selected Metro
4. selected RER
5. selected bus
6. bus direction
7. correspondence
8. traffic disruption
9. Paris centre dense
10. high zoom station
```

Comparer :

```text
/map/legacy
/map
```

---

# Antialiasing

Ne pas demander pixel-perfect entre Canvas2D et deck.gl.

Tolérer :

```text
antialiasing
font rasterization
subpixel differences
```

Ne pas tolérer :

```text
missing paths
wrong geometry
wrong line color
wrong width visible
wrong station
wrong state
wrong label
```

---

# Performance tests

Réutiliser les mêmes scénarios.

Mesurer :

```text
median
p95
p99
frames > 16.7ms
frames > 20ms
frames > 50ms
```

---

# All Bus benchmark

Créer ou adapter un scénario dédié :

```text
all BUS visible
```

Mesurer :

```text
path count
vertices
binary bytes
binary compile time
layer update time
frame time
cache hit rate
```

---

# Critère pan/zoom

Si uniquement la caméra change :

```text
binaryCompileCount
```

doit rester :

```text
0
```

---

# Critère hover

Changer de hover ne doit pas entraîner :

```text
fullBaseGeometryCompile
```

---

# Critère traffic

Actualiser seulement le trafic ne doit pas reconstruire :

```text
base path positions
```

---

# DPR

Conserver le système :

```text
maxDevicePixelRatio
```

Ne pas laisser MapLibre et le moteur métier utiliser des ratios incompatibles.

---

# Responsive

Tester :

```text
desktop
tablet
mobile
```

et resize dynamique.

---

# MapLibre resize

Le resize du stage doit appeler :

```text
map.resize()
```

au bon moment.

---

# Cleanup

Lorsque `/map` est démonté :

appeler proprement :

```text
map.removeControl(deckOverlay)
map.remove()
```

et nettoyer :

```text
timers
workers propres à next
listeners
ResizeObserver
```

---

# Style reload

Si :

```text
map.setStyle()
```

est utilisé :

s’assurer que le deck overlay/interleaving reste fonctionnel.

---

# Provider errors

Si les vector tiles du basemap échouent :

ne pas provoquer une exception fatale de toute l’application.

Afficher si possible :

```text
basemap unavailable
```

tout en gardant les overlays métier utilisables.

---

# Attribution

Conserver les attributions obligatoires du basemap.

Ne pas les masquer.

---

# Pas de deck picking V1

Réaffirmation :

le hit test CPU actuel reste la référence.

---

# Pas de custom deck layer V1

Utiliser en priorité les built-in layers :

```text
PathLayer
ScatterplotLayer
TextLayer
IconLayer
```

Une custom Layer deck n’est autorisée que si :

1. la parité fonctionnelle est impossible autrement ;
2. ou un benchmark démontre un bottleneck important ;
3. et la justification est documentée.

---

# Pas de WebGL2 natif

Ne pas ajouter :

```text
NativeWebGL2Renderer
```

dans cette tâche.

Le but est de mesurer jusqu’où :

```text
MapLibre + deck.gl
```

peut aller.

---

# Factory extensible

L’architecture doit néanmoins permettre qu’un jour on ajoute :

```text
NativeWebGL2Renderer
```

sans refactorer le métier.

Conceptuellement :

```text
TransportMapExperienceFactory
      |
 +----+------------+----------------+
 |                 |                |
Legacy          DeckNext         future
Canvas          MapLibre         native
```

Mais ne pas implémenter le troisième backend.

---

# Phases obligatoires

## PHASE 0 — Audit

- repository
- routes
- baseline tests
- baseline performance
- architecture dependency graph

---

## PHASE 1 — Factory / Strategy

Créer la frontière :

```text
legacy
next
```

sans encore changer le rendu.

`/map/legacy` doit toujours fonctionner.

---

## PHASE 2 — `/map`

Créer la nouvelle route.

Réutiliser toute l’UI métier existante.

---

## PHASE 3 — MapLibre vectoriel

Installer/intégrer MapLibre uniquement sur `/map`.

Configurer un vrai style vector tile.

Synchroniser la caméra.

Tester projection et interactions.

---

## PHASE 4 — deck.gl interleaved

Ajouter :

```text
MapboxOverlay(interleaved:true)
```

Créer `DeckGlRenderer`.

Afficher d’abord une géométrie de test.

---

## PHASE 5 — Path parity

Passer tous les `scene.paths` à `PathLayer`.

Préserver :

- modes
- couleurs
- largeur
- ghost
- order
- active
- selection

---

## PHASE 6 — Traffic / highlights

Ajouter :

- disturbance
- interruption
- hover
- selected overlays

sans reconstruire le base packet.

---

## PHASE 7 — Stations

Ajouter `ScatterplotLayer`.

---

## PHASE 8 — quays / entrances

Ajouter Scatterplot/Icon.

---

## PHASE 9 — labels

Ajouter TextLayer.

---

## PHASE 10 — Worker binary pipeline

Construire :

```text
TypedArrays
startIndices
colors
widths
```

dans workers.

---

## PHASE 11 — binary PathLayer

Remplacer le data-object mode par le mode binary.

Mesurer avant/après.

---

## PHASE 12 — cache

Ajouter `DeckGeometryCache`.

---

## PHASE 13 — predictive prefetch

Utiliser `priority=prefetch`.

---

## PHASE 14 — hardening

- tests
- performance
- mobile
- DPR
- memory
- route
- bundle

---

# Stop gate à chaque phase

Après chaque phase :

1. TypeScript
2. lint
3. tests legacy
4. tests next existants
5. rapport fichiers modifiés
6. comportement observé

Si legacy casse :

STOP.

---

# Bundle acceptance

À la fin :

vérifier que `/map/legacy` ne charge pas statiquement :

```text
maplibre-gl
deck.gl
```

si le bundler permet ce découpage.

---

# Memory

Sur navigation :

```text
/map
→ /autre-route
→ /map
```

ne pas accumuler :

```text
MapLibre maps
deck overlays
workers
listeners
```

Tester le teardown.

---

# Layer identity

Les IDs deck doivent être stables :

```text
transport-base
transport-traffic
transport-highlight
transport-stations
transport-labels
```

Éviter de générer :

```text
id = randomUUID()
```

à chaque render.

---

# Stable `data`

Ne jamais construire une nouvelle structure binaire uniquement parce que :

```text
camera.zoom
```

change.

---

# updateTriggers

Utiliser `updateTriggers` seulement pour les accessors dynamiques nécessaires.

Ne pas mettre :

```text
camera.zoom
```

dans des triggers de couleur/position sans justification.

---

# Layer reconstruction

Il est normal de recréer les objets Layer deck lors d’un `setProps`, deck réalise du diffing par `id`.

Mais :

les références `data` importantes doivent rester stables si le contenu n’a pas changé.

---

# Binary source identity

`DeckPathBinaryPacket.data` doit idéalement être construit une fois puis conservé.

---

# Debug counters

Ajouter en développement :

```text
basePacketBuilds
trafficPacketBuilds
stationPacketBuilds
deckSetPropsCount
binaryCacheHits
binaryCacheMisses
```

---

# Test caméra-only

Créer un test / instrumentation :

```text
initial scene
10 wheel frames
```

Attendu :

```text
basePacketBuilds === 0 pendant gesture
```

une fois la scène initiale compilée.

---

# Test all-bus

Tester réellement la contrainte principale :

```text
toutes les lignes Bus simultanément
```

et pas uniquement Metro 14 sélectionné.

---

# Main thread

Profiler :

```text
long tasks
GC
PathLayer normalization
binary compilation
Vue recomputations
hit testing
MapLibre frame
```

---

# Si les performances ne sont pas bonnes

Ne pas immédiatement écrire du WebGL custom.

Identifier d’abord le bottleneck.

Possibilités :

```text
data identity instability
too many layer rebuilds
CPU conversion lnglat
too many PathLayers
binary compile on main thread
traffic fragmentation
labels
MapLibre style trop lourd
```

Corriger l’architecture avant de descendre de niveau.

---

# Critères de réussite performance

`/map` doit au minimum montrer :

- interaction soutenue sans gros spikes de settle Canvas
- base geometry non recompilée pendant zoom
- meilleur p95 sur scène Bus lourde
- basemap restant net pendant fractional zoom
- absence de blank raster cover

---

# Basemap style performance

Un style MapLibre extrêmement lourd peut fausser le benchmark.

Choisir un style vectoriel raisonnable.

Benchmark éventuellement :

```text
simple vector style
production vector style
```

afin de distinguer :

```text
transport renderer cost
basemap cost
```

---

# Fonction de configuration

Prévoir quelque chose comme :

```ts
nextMap: {
  enabled: true,
  vectorStyleUrl: ...,
  deckInterleaved: true,
}
```

mais pas de feature flag qui modifie `/map/legacy`.

---

# Naming

Noms recommandés :

```text
LegacyCanvasMapExperience
MapLibreDeckMapExperience

Canvas2dRenderer
DeckGlRenderer

TransportMapExperienceFactory
```

Adapter aux conventions existantes.

---

# Eviter ces noms

Ne pas créer des abstractions vagues :

```text
MapManager
MapEngineManager
MapUtils
RendererUtils
GraphicsManager
```

---

# Documentation

Ajouter un document court :

```text
transport-map/rendering-architecture.md
```

ou emplacement équivalent si le repo possède déjà une documentation architecture.

Expliquer :

```text
/map/legacy
/map

Factory
Strategy

Canvas legacy
MapLibre + Deck next

shared scene
```

---

# Diagramme demandé

Inclure :

```text
                         Shared business logic
                                 |
                         RenderScene / Camera
                                 |
                   TransportMapExperienceFactory
                           /              \
                          /                \
                         v                  v
                 Legacy experience     Next experience
                        |                    |
                  raster basemap         MapLibre
                        |                vector tiles
                   Canvas2D                  |
                                             |
                                           deck.gl
                                             |
                                           WebGL2
```

---

# Rapport final

À la fin fournir :

## Architecture

- factory créée
- strategies
- route wiring

## Legacy

- fichiers legacy modifiés
- justification
- preuve tests

## Next

- MapLibre integration
- vector style
- deck overlay
- layers

## Data

- binary packets
- workers
- transferable ownership

## Cache

- cache design
- memory budget
- hit rates

## Prefetch

- prediction logic
- prioritization
- metrics

## Tests

Tableau :

```text
Feature | /map/legacy | /map | Test
```

## Performance

Tableau :

```text
Metric | Canvas | Deck | delta
```

sur :

```text
overview
all bus
selected line wheel
chaos zoom
```

---

# Définition de DONE

Le travail n’est terminé que si :

```text
/map/legacy
```

est toujours Canvas2D et fonctionne comme avant.

ET :

```text
/map
```

existe.

ET :

le basemap de `/map` est réellement vectoriel.

ET :

MapLibre rend le basemap via WebGL.

ET :

deck.gl rend les transports.

ET :

deck.gl fonctionne en WebGL2.

ET :

le mode interleaved est utilisé sauf impossibilité démontrée.

ET :

Canvas2dRenderer n’est pas utilisé pour dessiner le réseau de `/map`.

ET :

les mêmes règles métier alimentent les deux renderers.

ET :

les mêmes interactions sont disponibles.

ET :

les mêmes filtres sont disponibles.

ET :

la sélection fonctionne.

ET :

les directions fonctionnent.

ET :

les ghost lines fonctionnent.

ET :

le trafic fonctionne.

ET :

les stations fonctionnent.

ET :

les quays fonctionnent.

ET :

les entrances fonctionnent.

ET :

les labels transport sont présents.

ET :

les deep links fonctionnent.

ET :

le dashboard fonctionne.

ET :

les tests legacy passent.

ET :

les tests next passent.

ET :

les gros paths passent progressivement par un pipeline binaire worker.

ET :

la base geometry n’est pas recompilée pendant un simple pan/zoom.

ET :

les packets géométriques sont mis en cache.

ET :

le predictive prefetch est réellement utilisé.

ET :

les performances sont mesurées et comparées.

---

# Instruction finale de méthode

Avant d’écrire le moindre code :

1. inspecte le repository réel ;
2. identifie exactement comment `/map/legacy` est routé ;
3. identifie les composants réellement partagés ;
4. identifie les interfaces renderer existantes ;
5. identifie les tests ;
6. identifie les workers ;
7. identifie le chunk scheduler ;
8. identifie les hooks de performance ;
9. propose un plan phase par phase basé uniquement sur ce que tu as réellement observé.

Ne crée pas d’architecture parallèle inutile.

Ne commence pas par modifier 30 fichiers.

Commence par établir une frontière Factory + Strategy propre.

Principe directeur :

> KEEP `/map/legacy` BORING, STABLE AND CANVAS2D.
>
> BUILD `/map` AS A PARALLEL VECTOR-GPU EXPERIENCE.
>
> MAPLIBRE OWNS THE VECTOR BASEMAP.
>
> DECK.GL OWNS THE TRANSPORT GPU RENDERING.
>
> THE EXISTING ENGINE OWNS THE BUSINESS LOGIC, CAMERA, DATA AND INTERACTIONS.
