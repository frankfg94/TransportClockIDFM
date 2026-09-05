# `/map` — Factory + Strategy implementation

Ce document décrit l’implémentation de l’expérience cartographique désormais
canonique, issue de `map next.md`. La route `/map` monte l’expérience MapLibre
vectorielle + Deck.gl/WebGL2. La route `/map/legacy` conserve l’expérience
historique avec son basemap raster et son renderer Canvas2D. L’ancien chemin
`/map/next` redirige vers `/map`.

## Frontière d’architecture

Le choix du backend est fait une seule fois au niveau de l’expérience :

```text
GlobalTransportPlan
        |
        +-- TransportMapExperienceFactory
              |
              +-- legacy
              |     basemap: legacy-raster
              |     strategy: Canvas2dRenderer
              |
              +-- next
                    basemap: maplibre-vector
                    strategy: DeckGlRenderer
                    host: MapLibreDeckOverlayPresenter
```

La factory est `src/features/transport-map/render/createRenderer.ts` :

- `createTransportMapExperience("legacy")` retourne `LegacyCanvasMapExperience` ;
- `createTransportMapExperience("next")` retourne `MapLibreDeckMapExperience` ;
- `createTransportMapRenderer()` conserve la façade historique et retourne par
  défaut Canvas2D.

`GlobalTransportPlan.vue` consomme `TransportMapExperience` et ne choisit pas
un backend dans ses fonctions de dessin. La surface MapLibre est chargée par
`defineAsyncComponent` uniquement lorsque l’expérience `next` est montée.

## Strategy commune

Les deux stratégies implémentent `TransportMapRenderer` dans
`src/features/transport-map/contracts/renderer.ts` :

```text
mount(canvas)
resize(width, height, pixelRatio)
render(camera, scene)
getMetrics()
dispose()
```

La stratégie Canvas2D conserve son contexte et ses caches raster existants.
`DeckGlRenderer` ne crée aucun contexte WebGL et ne contient aucun shader,
VAO, buffer ou appel WebGL natif. Il prépare un frame backend-agnostic puis le
présente à `MapLibreDeckOverlayPresenter`, qui possède l’overlay officiel
`MapboxOverlay` interleaved.

## Données partagées

`TransportMapRenderScene` reste la source de vérité métier pour les deux
backends. `TransportMapRenderModelBuilder` convertit cette scène en un modèle
stable comprenant :

- les chemins de base, de trafic et de highlight ;
- les stations, quays, entrances et labels transport ;
- les styles de chemin résolus depuis la configuration commune ;
- les seuils de visibilité des stations ;
- les ranges de trafic découpés par sous-chemin.

Le builder réutilise `RenderSceneIndex`,
`PreparedWorldPathGeometryCache`, `TransportMapTrafficRangeIndex`,
`resolveTransportMapPathStyle` et `isStationNodeVisible`. Les changements de
caméra seuls conservent donc les références du modèle et de ses tableaux.

La surface d’événements reste le canvas transparent contrôlé par le moteur
d’interaction existant. Le hit testing CPU existant continue d’être la source
de vérité : Deck.gl n’est pas utilisé pour le picking V1.

## Composition MapLibre + Deck.gl

`src/features/transport-map/next/TransportMapNextSurface.vue` monte MapLibre
avec ses options de navigation et de rendu par défaut. La seule contrainte
explicite est le contexte `webgl2`, requis par la stratégie Deck.gl GPU.
Après `load`, elle installe :

```text
MapLibre map
  +-- MapboxOverlay({ interleaved: true })
        +-- PathLayer transport-base
        +-- PathLayer transport-traffic
        +-- PathLayer transport-highlight
        +-- ScatterplotLayer transport-stations
        +-- ScatterplotLayer transport-quays
        +-- ScatterplotLayer transport-entrances
        +-- TextLayer transport-labels
```

Les IDs Deck sont stables. Les transports passent avant le premier layer
MapLibre de type `symbol`, afin de conserver les labels du basemap au-dessus
des lignes lorsque le style en fournit.

Les packages `maplibre-gl`, `@deck.gl/core`, `@deck.gl/layers`,
`@deck.gl/extensions` et `@deck.gl/mapbox` ne sont importés que dans la surface
et les modules de l’expérience `next`. Aucun import Deck runtime n’est ajouté
au renderer partagé chargé par `/map/legacy`.

## Caméra et coordonnées

La caméra applicative existante reste la référence pour les interactions et les
URLs partagées. MapLibre reçoit :

- le centre converti de `worldX/worldY` vers longitude/latitude ;
- un zoom `cameraZoom - 1`, car le monde vectoriel MapLibre utilise une tuile
  logique de 512 px contre 256 px pour la caméra historique ;
- `bearing: 0` et `pitch: 0` pour la V1.

Les chemins préparés sont convertis une seule fois en tableaux
`Float64Array [longitude, latitude, ...]`. La projection écran et le changement
de viewport restent la responsabilité de Deck.gl/MapLibre.

## Pipeline binaire et workers

`deckPathPacket.ts` compile chaque groupe de chemins dans un packet borné :

```text
Float64Array positions
Uint32Array startIndices
Uint8Array colors
Float32Array widths
Float32Array dashArrays
```

Le packet est compatible avec le mode binary de `PathLayer`. Le worker
`transportMap.worker.ts` accepte la tâche `compile-deck-paths` et reçoit des
copies explicites des positions. Les buffers du modèle principal ne sont donc
jamais détachés par transfert. `transferableBuffers()` renvoie les buffers
originaux sans `.slice()` inutile, tandis que le compilateur crée les copies
nécessaires avant `postMessage`.

Le premier frame peut utiliser les records structurés pendant la compilation
worker ; le packet binaire est ensuite installé et le host est repeint. Cette
transition ne bloque pas l’interaction.

## Cache et identité des layers

`DeckGeometryCache` est un LRU CPU borné par
`GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.binaryCacheMaxBytes` (64 MiB par défaut).
Il ne stocke aucune ressource privée Deck/luma : son éviction ne détruit donc
pas une ressource dont Deck est propriétaire.

Ce cache concerne uniquement la géométrie binaire de la surcouche transport.
`/map` ne monte pas de couches raster/image applicatives : il n’y a donc
pas de LOD d’image, de cache partagé entre couches d’images ou de clipping
applicatif à maintenir. Le fond vectoriel, ses tuiles, son cache et son rendu
sont entièrement laissés à MapLibre.

Les clés incluent le rôle, l’identité des records, le style et les tailles.
Les tableaux binaires sont conservés par identité de packet ; le wrapper de
données binary de `PathLayer` est lui aussi mémorisé par `WeakMap`. Ainsi, un
pan/zoom caméra-only ne reconstruit pas les packets et ne force pas une mise à
jour des accessors.

`MapLibreDeckOverlayPresenter` ne fait `setProps` que lorsque le modèle, un
packet binaire ou le `beforeId` change. Un `refresh()` force une resynchronisation
après reload de style ou restauration de contexte. Les compteurs
`basePacketBuilds`, `trafficPacketBuilds`, `stationPacketBuilds`,
`deckSetPropsCount`, `binaryCacheHits`, `binaryCacheMisses` et les octets
compilés sont exposés via `TransportMapRendererMetrics`.

## Prefetch prédictif

Le préfetch prédictif applicatif est volontairement désactivé pour `/map`.
`GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.prefetch.enabled` vaut `false`, aucun
callback de prédiction n’est branché sur la surface globale et
`TransportMapDataSource.prefetchViewport()` refuse également les appels
résiduels. Il n’y a donc pas de chauffe de tuiles/chunks hors écran ou sur les
côtés pendant un dézoom.

MapLibre reste seul responsable du chargement normal des vector tiles, de leur
cache et de leur affichage. Les helpers de prédiction restent testés comme
utilitaires isolés, mais ne participent plus au chemin d’exécution de
`/map`.

## Robustesse de la surface GPU

- Si `webgl2` n’est pas disponible, `/map` affiche un message et un lien vers
  `/map/legacy`; aucun fallback Canvas silencieux n’est installé dans la route
  canonique.
- Une erreur de style ou de vector tiles marque le basemap comme indisponible
  tout en gardant les overlays transport utilisables. Une surface de fond
  locale minimale peut être installée pour permettre à Deck de rester monté ;
  ce n’est pas un fallback raster.
- Les événements `webglcontextlost` et `webglcontextrestored` déclenchent le
  refresh de l’overlay sans recréer le modèle métier.
- Le teardown détache le host, finalise l’overlay, enlève les listeners et
  supprime la carte MapLibre.
- Le contrôle d’attribution MapLibre reste actif par défaut et n’est pas masqué.

## Parité fonctionnelle et limites V1

La route `next` réutilise les mêmes filtres, sélection, hover, directions,
ghost lines, trafic, station visibility, correspondances, quays, entrances,
labels transport, deep links et dashboard que la route historique.

Les différences acceptées sont celles du backend : antialiasing et placement
de texte peuvent varier entre Canvas2D et Deck.gl ; la parité recherchée est
d’abord sémantique, puis visuelle. Le hit testing CPU et les contrôles UI
existants restent partagés. Le picking Deck, les custom layers Deck et le
WebGL natif restent explicitement hors périmètre V1.

## Vérifications

Tests dédiés ajoutés :

- `tests/transportMapNextArchitecture.test.ts` — factory, projection caméra,
  style vectoriel, configuration MapLibre par défaut et helpers de prédiction ;
- `tests/transportMapDeckPackets.test.ts` — packets, start indices, couleurs,
  dashes, identité et eviction LRU ;
- `tests/transportMapChunkScheduler.test.ts` — priorité visible contre
  prefetch et générations ;
- `tests/transportMapWorkerProtocol.test.ts` — ownership des buffers transférés.

Vérifications de livraison :

```text
npm.cmd run tsc
npm.cmd run test
npm.cmd run build
```

La suite historique `/map/legacy` reste la baseline ; les éventuels échecs
préexistants doivent être distingués des tests de cette architecture avant de
conclure la validation.
