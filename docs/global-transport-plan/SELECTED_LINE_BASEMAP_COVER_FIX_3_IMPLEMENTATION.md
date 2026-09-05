# Correctif 3 — cover raster borné pour le mode ligne de la carte globale

> Cahier d'implémentation ultra détaillé destiné à une autre IA ou à un développeur.
>
> Statut : **spécification uniquement**. Ce document ne constitue pas une implémentation.
>
> Périmètre : `GlobalTransportPlan` lorsque `?line=<lineId>` sélectionne une ligne.

## 1. Résultat attendu

Le correctif 3 doit supprimer les zones de fond uni qui apparaissent brièvement quand l'utilisateur dézoome très vite sur la carte globale avec une ligne sélectionnée.

Le principe est de préparer, une seule fois par contexte de ligne, une mosaïque raster de secours :

- bornée à une enveloppe utile autour de la ligne et du geste de dézoom ;
- construite à **un seul zoom source XYZ** ;
- limitée par un budget de tuiles et un budget de mémoire décodée ;
- affichée sous le basemap live ;
- transformée par un seul `translate3d(...) scale(...)` pendant le geste ;
- jamais reconstruite à chaque frame, à chaque niveau de zoom visuel ou à chaque requête de viewport ;
- libérée quand la ligne, le style, le viewport ou le composant change réellement de contexte.

Le cover est un filet de sécurité visuel. Il ne remplace ni la couche live ni les améliorations transactionnelles des correctifs 1 et 2. À l'arrêt du geste, la couche live reste la source visuelle normale et la plus détaillée.

## 2. Contraintes non négociables

### 2.1 Isolation fonctionnelle

Le correctif 3 ne doit changer ni le code ni le comportement de la V1 et de Nearby.

Fichiers interdits de modification pour ce correctif :

- `pages/line/[transportType]/[lineId].vue` ;
- `src/features/line-map/DetailedLineMapPicker.vue` ;
- `src/features/nearby-stations/NearbyStationsMap.vue` ;
- `src/features/nearby-stations/NearbyStationsBasemap.vue` ;
- `src/features/transport-map/basemap/TransportMapBasemap.vue` ;
- `src/features/transport-map/basemap/tileMath.ts` ;
- `src/features/transport-map/basemap/basemapDefinition.ts`.

Les trois derniers fichiers partagés peuvent être **importés et utilisés tels quels**, mais ne doivent pas être modifiés par le correctif 3. Cette règle évite qu'un changement supposé local se propage indirectement à `NearbyStationsBasemap`, qui utilise déjà `TransportMapBasemap` avec succès.

La V1 charge `DetailedLineMapPicker.vue` depuis la page de ligne. Elle n'utilise pas `GlobalTransportPlan` ni le nouveau cover. Aucun branchement, prop ou réglage V1 ne doit être ajouté.

### 2.2 Pas de pyramide raster

Il est interdit de réactiver :

```ts
GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.preloadActiveLineTiles
```

Il est également interdit de passer les bornes de la ligne à :

```vue
<TransportMapBasemap :preload-bounds="..." />
```

Le chemin historique `preloadBounds` accumule potentiellement plusieurs niveaux XYZ visités. Pour la ligne 14 (`line:IDFM:C01384`), le rectangle de ligne mesuré précédemment représente environ :

| Zoom XYZ | Nombre de tuiles du rectangle de ligne |
|---:|---:|
| 8 | 1 |
| 9 | 1 |
| 10 | 1 |
| 11 | 2 |
| 12 | 8 |
| 13 | 21 |
| 14 | 56 |
| 15 | 216 |
| 16 | 742 |

La somme z8 à z16 atteint environ 1 048 tuiles. Une pyramide aggrave donc précisément les problèmes de DOM, de décodage, de mémoire et de cache que le correctif cherche à éviter.

### 2.3 Une seule définition stable

Pour une définition de cover donnée :

- toutes les tuiles ont le même `tile.zoom` ;
- le nombre de tuiles ne dépasse jamais le budget effectif ;
- la somme estimée des surfaces décodées ne dépasse jamais le budget mémoire ;
- le tableau des URL et son fingerprint restent strictement identiques pendant un geste ;
- une modification de `camera.zoom`, `camera.centerWorldX`, `camera.centerWorldY` ou `camera.generation` ne reconstruit pas la définition ;
- seule la transformation CSS du conteneur évolue pendant le geste.

### 2.4 Le correctif ne doit pas masquer une régression

Le test d'acceptation ne doit pas conclure à une amélioration uniquement parce que :

- la scène transport n'est plus dessinée ;
- la ligne active ou ses stations disparaissent ;
- le scénario n'a pas réellement produit de manque de tuiles live ;
- le délai de debug a été appliqué au cover au lieu de la couche live ;
- le nombre d'événements de molette a diminué ;
- le zoom parcouru est plus faible ;
- le navigateur a utilisé un cache plus chaud ;
- l'instrumentation lourde de couverture a été incluse dans la mesure de fluidité ;
- le cover est devenu le basemap permanent, plus flou, en cachant la couche live.

La section 16 définit un protocole A/B causal qui rend ces faux positifs impossibles.

## 3. État actuel utile à l'implémentation

Dans `src/features/line-map/GlobalTransportPlan.vue` :

- `TransportMapBasemap` est le premier enfant visuel du stage ;
- le canvas transport se trouve au-dessus avec `z-index: 1` ;
- `activeLineTileBounds` sait déjà réunir les bornes des stations, des paths de métadonnées et des quais de la direction Bus sélectionnée ;
- ce computed retourne actuellement `undefined` tant que `preloadActiveLineTiles` reste désactivé ;
- le scénario interne `selected-line-wheel` mesure déjà les frames, le fingerprint de scène, l'état du basemap et la couverture de la définition live committed ;
- `mapTileDebugDelayMs` permet déjà de retarder artificiellement la disponibilité de la couche live en mode couverture ;
- le correctif 2 conserve une définition live committed jusqu'à ce que la suivante soit décodée.

Le trou persiste malgré la transaction committed/pending lorsque l'ancienne mosaïque, reprojetée pendant un fort dézoom, devient géométriquement plus petite que le viewport courant. Il n'existe simplement aucun pixel raster hors de son ancienne emprise. Un cover volontairement généré sur une emprise plus grande est donc nécessaire.

## 4. Architecture cible

```text
GlobalTransportPlan.stage
└── global-transport-plan__basemap-stack     z-index 0, clip, fond et opacité communs
    ├── SelectedLineBasemapCover             z-index 0, définition fixe et large
    └── TransportMapBasemap                  z-index 1, couche live existante

GlobalTransportPlan.canvas                   z-index 1 au-dessus du stack
```

Le `basemap-stack` crée son propre contexte d'empilement. Le `z-index: 1` interne de la couche live ne peut donc pas passer au-dessus du canvas externe.

Le fond et l'opacité doivent être appliqués **une seule fois au stack**. Dans ce stack et uniquement dans `GlobalTransportPlan`, la racine du `TransportMapBasemap` existant reçoit :

```css
background: transparent;
opacity: 1;
```

Le cover est alors réellement visible sous les zones que la définition live ne couvre pas. Là où une tuile live opaque existe, elle recouvre complètement la tuile du cover. Il n'y a ni double opacité ni mélange de deux couches de libellés.

Cette adaptation se fait avec une classe transmise par `GlobalTransportPlan` et une règle CSS locale `:deep(...)`. Elle ne nécessite aucune modification de `TransportMapBasemap.vue` et n'affecte donc pas Nearby.

## 5. Fichiers à créer et à modifier

### 5.1 Fichiers à créer

1. `src/features/transport-map/basemap/selectedLineBasemapCover.ts`

   Fonctions pures de calcul des bornes, du budget, de la définition et des fingerprints.

2. `src/features/transport-map/basemap/SelectedLineBasemapCover.vue`

   Cycle de vie des images, décodage atomique, transformation CSS et métriques de debug.

3. `tests/selectedLineBasemapCover.test.ts`

   Tests unitaires des fonctions pures.

4. `tests/selectedLineBasemapCover.dom.test.ts`

   Tests DOM du composant et de son cycle de vie.

5. Facultatif mais recommandé : `scripts/transport-map/selected-line-cover-live.md` ou une section ajoutée à la documentation de performance existante, contenant uniquement les commandes reproductibles. Ne pas ajouter une nouvelle dépendance de navigateur.

### 5.2 Fichiers autorisés à modification

1. `src/features/line-map/GlobalTransportPlan.vue`

   Intégration du stack, préparation de la caméra d'ancrage, activation du cover et extension du scénario live.

2. `src/features/transport-map/config/globalTransportPlanConfig.ts`

   Ajout d'une configuration `lineMap.basemapCover` exclusivement lue par `GlobalTransportPlan` et le nouveau composant.

3. `tests/globalTransportPlan.dom.test.ts`

   Vérification du montage global-only, de la désactivation hors mode ligne et des métriques A/B.

4. `tests/globalTransportPlanConfig.test.ts`

   Vérification explicite des budgets.

5. `scripts/transport-map/run-tests.mjs`

   Ajouter les deux nouveaux tests aux groupes adaptés si nécessaire.

### 5.3 Fichiers hors périmètre

Tout autre fichier doit être considéré hors périmètre. Si l'implémentation semble exiger de modifier un fichier partagé ou Nearby, arrêter l'implémentation et revoir l'architecture décrite ici.

## 6. Configuration recommandée

Ajouter sous `GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap` :

```ts
basemapCover: {
  enabled: true,
  coveredZoomOutLevels: 4.5,
  detailLeadLevels: 2,
  maxSourceZoom: 14,
  maxTiles: 64,
  maxEstimatedDecodedBytes: 32 * 1024 * 1024,
  boundsPaddingRatio: 0.05,
  retryCount: 1,
  retryDelayMs: 500,
},
```

Justification des valeurs :

- le scénario de référence envoie 10 événements `deltaY=167` avec un facteur `0.0024`, soit environ 4,008 niveaux de zoom ; `4.5` fournit une marge mesurable sans couvrir toute l'Île-de-France ou le monde ;
- `detailLeadLevels: 2` demande une source jusqu'à deux niveaux plus détaillée que la caméra d'ancrage, si le budget l'autorise ;
- `maxSourceZoom: 14` empêche de commencer une recherche absurde à z20 ;
- `maxTiles: 64` permet typiquement le rectangle de la ligne 14 à z14, mais fait automatiquement descendre le zoom pour une ligne ou une enveloppe plus grande ;
- `32 MiB` limite la mémoire décodée déterministe ;
- `5 %` protège les arrondis, petites variations de centre et transitions de viewport ;
- une seule tentative supplémentaire évite une boucle réseau.

Ne pas supprimer ou activer `preloadActiveLineTiles` dans ce correctif. Laisser sa valeur à `false` jusqu'à un nettoyage séparé.

## 7. Contrats TypeScript recommandés

Dans `selectedLineBasemapCover.ts` :

```ts
export interface SelectedLineBasemapCoverOptions {
  coveredZoomOutLevels: number;
  detailLeadLevels: number;
  maxSourceZoom: number;
  maxTiles: number;
  maxEstimatedDecodedBytes: number;
  boundsPaddingRatio: number;
  retinaPixelRatio: number;
  showCityAndStreetLabels: boolean;
}

export interface SelectedLineBasemapCoverDefinition {
  key: string;
  lineId: string;
  anchorCamera: CameraState;
  coverageBounds: GlobalMapBounds;
  floorZoom: number;
  requestedSourceZoom: number;
  sourceZoom: number;
  density: 1 | 2;
  bytesPerDecodedTile: number;
  estimatedDecodedBytes: number;
  effectiveMaxTiles: number;
  tiles: TransportMapBasemapTile[];
  signature: string;
}

export interface SelectedLineBasemapCoverDebugMetrics {
  enabled: boolean;
  mounted: boolean;
  ready: boolean;
  lineId?: string;
  definitionKey?: string;
  definitionSignature?: string;
  floorZoom?: number;
  requestedSourceZoom?: number;
  sourceZoom?: number;
  tileCount: number;
  loadedTiles: number;
  failedTiles: number;
  density: 1 | 2;
  estimatedDecodedBytes: number;
  rebuilds: number;
  rebuildsDuringInteraction: number;
  lateCallbacksIgnored: number;
  retries: number;
  terminalFailures: number;
}
```

Dans `SelectedLineBasemapCover.vue`, props recommandées :

```ts
defineProps<{
  enabled: boolean;
  lineId?: string;
  camera: CameraState;
  anchorCamera?: CameraState;
  lineBounds?: GlobalMapBounds;
  layer: TransportMapBasemapLayer;
  basemapStyle: TransportMapBasemapStyle;
  contrast: number;
  interactionActive: boolean;
}>();
```

API exposée au parent :

```ts
defineExpose({
  getDebugMetrics,
  resetDebugMetrics,
  isReady,
});
```

`getDebugMetrics()` doit retourner une copie, jamais l'objet mutable interne.

## 8. Calcul fiable de l'enveloppe de couverture

### 8.1 Renommer le computed existant

Dans `GlobalTransportPlan.vue`, remplacer le rôle de `activeLineTileBounds` par un computed nommé par exemple :

```ts
selectedLineGeometryBounds
```

Ce computed :

- ne dépend plus de `preloadActiveLineTiles` ;
- retourne `undefined` s'il n'existe pas de ligne active ;
- réunit les stations de la ligne ou de la direction Bus sélectionnée ;
- réunit `lineMetadataPaths` ;
- réunit `selectedBusDirectionQuays` ;
- ignore toute coordonnée non finie ;
- rejette un rectangle inversé ou vide après normalisation.

Il ne doit plus être passé à `TransportMapBasemap.preloadBounds`.

### 8.2 Pourquoi les seules bornes de ligne sont insuffisantes

Au dézoom, la ligne peut occuper une bande verticale étroite tandis que le viewport s'étend fortement à gauche et à droite. Tiler uniquement le rectangle géométrique de la ligne recréerait des zones de fond uni autour de cette bande.

Le cover doit donc inclure l'ensemble des viewports atteignables par le geste de dézoom supporté.

### 8.3 Caméra d'ancrage

La caméra d'ancrage est une photographie immuable de la caméra une fois la ligne sélectionnée et son cadrage appliqué.

Elle ne doit pas être remplacée pendant une molette, une animation de zoom ou un pan léger.

Créer dans `GlobalTransportPlan.vue` :

```ts
const selectedLineCoverAnchorCamera = shallowRef<CameraState>();
const selectedLineCoverGeometryBounds = shallowRef<GlobalMapBounds>();
```

La caméra **et une copie des bornes** doivent être capturées dans la même transaction. Le composant ne reçoit pas directement le computed réactif `selectedLineGeometryBounds` : les paths du viewport peuvent encore se stabiliser ou être remplacés pendant un chargement, ce qui provoquerait une reconstruction au milieu du geste. `selectedLineGeometryBounds` sert à préparer le snapshot ; `selectedLineCoverGeometryBounds` est l'entrée immuable de la définition.

Mettre à jour cette référence uniquement lorsque :

- l'identifiant de ligne active change ;
- la direction Bus sélectionnée change et modifie réellement la géométrie ;
- le viewport est redimensionné ;
- le DPR effectif change ;
- le cadrage initial de la ligne vient d'être appliqué ;
- une restauration explicite de viewport remplace le cadrage de ligne.

À la désélection, effacer ensemble la caméra et les bornes capturées. Lors d'un changement de direction Bus, attendre que la nouvelle géométrie soit stable, puis remplacer les deux snapshots ensemble.

Ne jamais inclure `camera.generation` seul dans la clé de reconstruction.

Le chemin le plus sûr consiste à centraliser la capture juste après le `applyCamera(fittedCamera)` qui cadre la ligne. Prévoir aussi un fallback après stabilisation de la scène pour les restaurations URL qui ne passent pas par le même chemin.

### 8.4 Échantillonnage des dézooms centrés et hors centre

Un dézoom autour du centre ne couvre pas le cas où le pointeur se trouve près d'un bord. Pour garantir l'enveloppe sans suivre chaque événement live :

1. Calculer :

   ```ts
   floorZoom = max(
     GLOBAL_TRANSPORT_PLAN_CONFIG.camera.minZoom,
     anchorCamera.zoom - coveredZoomOutLevels,
   );
   ```

2. Construire cinq points écran immuables :

   ```ts
   const anchors = [
     { x: width / 2, y: height / 2 },
     { x: 0, y: 0 },
     { x: width, y: 0 },
     { x: 0, y: height },
     { x: width, y: height },
   ];
   ```

3. Pour chacun, appeler la fonction existante :

   ```ts
   zoomCameraAroundScreenPoint(anchorCamera, floorZoom, screenPoint)
   ```

4. Appeler `visibleWorldBounds(...)` sur les cinq caméras obtenues.

5. Réunir :

   - les cinq rectangles ;
   - le viewport visible de la caméra d'ancrage ;
   - les bornes géométriques de la ligne.

6. Agrandir l'union avec `expandBounds(union, boundsPaddingRatio)`.

7. Pour ce jeu de données IDFM, borner finalement X et Y à `[0, 1]` et vérifier que les quatre valeurs restent finies et ordonnées.

Ce calcul couvre les trajectoires extrêmes d'un zoom autour du centre ou d'un coin sans recalculer le cover pendant le geste. Il ne promet pas de couvrir un pan arbitraire de plusieurs écrans : ce n'est pas le défaut traité ici.

### 8.5 Tests obligatoires des bornes

Les tests unitaires doivent prouver que :

- le viewport de départ est inclus ;
- chacun des cinq viewports à `floorZoom` est inclus ;
- les bornes de ligne sont incluses ;
- les résultats sont finis et compris dans `[0, 1]` ;
- un changement de `camera.generation` sans changement géométrique ne change pas la définition ;
- un dézoom plus important que `coveredZoomOutLevels` est explicitement hors garantie ;
- une ligne très étroite ou réduite à un point produit quand même une enveloppe non vide grâce au viewport.

## 9. Choix du zoom source et budgets

### 9.1 Densité raster

Le plan Carto utilise `@2x` lorsque :

```ts
layer === "plan" && pixelRatio >= retinaPixelRatio
```

La densité vaut alors 2, sinon 1. Le satellite reste à densité 1 avec l'implémentation actuelle.

Estimation déterministe :

```ts
bytesPerDecodedTile = (256 * density) ** 2 * 4;
```

Donc :

- 1x : 262 144 octets, environ 0,25 MiB par tuile ;
- 2x : 1 048 576 octets, environ 1 MiB par tuile.

### 9.2 Budget effectif

```ts
const memoryTileBudget = Math.floor(
  maxEstimatedDecodedBytes / bytesPerDecodedTile,
);

const effectiveMaxTiles = Math.max(
  1,
  Math.min(maxTiles, memoryTileBudget),
);
```

Avec les valeurs recommandées :

- 1x : maximum effectif 64 tuiles, environ 16 MiB décodés ;
- 2x : maximum effectif 32 tuiles, maximum 32 MiB décodés.

Cette distinction est obligatoire. Un simple budget de 64 tuiles autoriserait environ 64 MiB sur un écran Retina.

### 9.3 Zoom préféré

```ts
requestedSourceZoom = min(
  maxSourceZoom,
  ceil(anchorCamera.zoom) + detailLeadLevels,
);
```

Créer une caméra source égale à la caméra d'ancrage, mais avec `zoom = requestedSourceZoom`.

Appeler ensuite `createTransportMapBasemapTiles` avec :

```ts
{
  layer,
  style: basemapStyle,
  pixelRatio: anchorCamera.pixelRatio,
  maxTiles: effectiveMaxTiles,
  highZoomMaxTiles: effectiveMaxTiles,
  overscanTiles: 0,
  minZoom: 0,
  maxZoom: requestedSourceZoom,
  retinaPixelRatio,
  showCityAndStreetLabels,
  worldBounds: coverageBounds,
}
```

La fonction existante descend déjà progressivement le zoom XYZ tant que le nombre de tuiles dépasse le budget. Il ne faut pas dupliquer cette boucle ailleurs.

Après génération :

- vérifier que le tableau est non vide ;
- vérifier que tous les `tile.zoom` sont égaux ;
- définir `sourceZoom = tiles[0].zoom` ;
- vérifier `tiles.length <= effectiveMaxTiles` ;
- calculer `estimatedDecodedBytes = tiles.length * bytesPerDecodedTile` ;
- vérifier le budget mémoire ;
- reprojecter chaque tuile une seule fois vers la caméra d'ancrage avec `reprojectTransportMapBasemapTile` ;
- calculer une signature stable avec `tileDefinitionSignature`.

Si une invariance échoue, retourner `undefined` en production et lever une erreur descriptive dans les tests. Ne jamais tronquer arbitrairement le tableau de tuiles : cela recréerait des trous.

### 9.4 Interdictions explicites

Ne pas :

- construire z12 + z13 + z14 ;
- conserver l'ancienne ligne dans un cache global ;
- faire croître un `Map` à chaque zoom visité ;
- utiliser `Number.MAX_SAFE_INTEGER` comme budget final ;
- garder des tuiles de plusieurs styles ou couches ;
- couper la mosaïque à 64 éléments après génération ;
- ajouter une table spéciale pour la ligne 14.

## 10. Clé de définition

La clé doit inclure uniquement les entrées qui changent le contenu raster ou son ancrage :

```ts
[
  lineId,
  anchorCamera.centerWorldX,
  anchorCamera.centerWorldY,
  anchorCamera.zoom,
  anchorCamera.viewportWidthCssPx,
  anchorCamera.viewportHeightCssPx,
  anchorCamera.pixelRatio,
  lineBounds.minX,
  lineBounds.minY,
  lineBounds.maxX,
  lineBounds.maxY,
  layer,
  basemapStyle,
  coveredZoomOutLevels,
  detailLeadLevels,
  maxSourceZoom,
  maxTiles,
  maxEstimatedDecodedBytes,
  boundsPaddingRatio,
].join(":")
```

Arrondir les coordonnées à une précision stable, par exemple 12 décimales pour les coordonnées monde et 4 pour le zoom, avant de construire la clé.

Ne pas inclure :

- `camera.generation` ;
- la caméra live ;
- `interactionActive` ;
- le timestamp ;
- la requête de viewport ;
- le nombre de frames ;
- l'état loaded/pending du basemap live.

## 11. Cycle de vie du composant

### 11.1 Reconstruction

Un `watch(definitionInputKey, rebuildDefinition, { immediate: true })` est suffisant.

Chaque reconstruction doit :

1. incrémenter un token numérique monotone ;
2. annuler le timer de retry précédent ;
3. cacher immédiatement une définition incompatible avec le nouveau contexte ;
4. remplacer les `Set` loaded/failed par de nouvelles instances ;
5. construire la nouvelle définition pure ;
6. publier les images avec des clés contenant le token ;
7. incrémenter `rebuilds` ;
8. incrémenter `rebuildsDuringInteraction` si `interactionActive` vaut vrai — cette métrique doit rester à zéro dans le scénario accepté.

Une ancienne ligne ou un ancien style ne doit jamais rester visible pendant la préparation du nouveau contexte.

### 11.2 Chargement et décodage atomiques

Chaque `<img>` doit utiliser au minimum :

```html
alt=""
loading="eager"
decoding="async"
draggable="false"
referrerpolicy="no-referrer"
```

Le cover entier reste invisible tant que toutes les tuiles de la définition courante ne sont pas décodées.

Sur `load` :

1. récupérer le token capturé dans l'entrée rendue ;
2. appeler `HTMLImageElement.decode()` si disponible ;
3. considérer la tuile prête seulement après résolution de `decode()` ;
4. si le token ne correspond plus au token courant, incrémenter `lateCallbacksIgnored` et ne rien modifier ;
5. ne déclencher qu'une seule mise à jour Vue lorsque toutes les tuiles sont prêtes.

Attention : il ne faut pas passer `coverGeneration` lu au moment de l'événement. Le token doit appartenir à la définition et être capturé dans le VDOM :

```vue
@load="onTileLoad($event, definition.token, entry.key)"
```

Sinon un callback tardif d'une ancienne image pourrait être attribué à la nouvelle génération.

Sur `error` ou échec de `decode()` :

- enregistrer la clé en échec ;
- garder le cover entier invisible ;
- effectuer au maximum `retryCount` reconstruction(s), après `retryDelayMs` ;
- ne pas ajouter de cache-buster aléatoire à l'URL ;
- après l'échec terminal, incrémenter `terminalFailures` et laisser la couche live fonctionner seule.

Le cover est une amélioration opportuniste : son échec ne doit jamais bloquer la carte, la ligne ou les interactions.

### 11.3 Transformation live

Le conteneur de définition utilise :

```ts
definitionTransformStyle(definition.anchorCamera, props.camera)
```

Cette fonction partagée est utilisée sans modification.

Points CSS critiques :

```css
.selected-line-basemap-cover {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.selected-line-basemap-cover__definition {
  position: absolute;
  inset: 0;
  overflow: visible;
  transform-origin: 0 0;
  will-change: transform;
}
```

`overflow: visible` est essentiel. Les tuiles préparées hors du viewport d'ancrage ont des positions négatives ou supérieures à sa largeur. Les couper à la taille du viewport d'origine reproduirait exactement le trou observé au dézoom. Le `basemap-stack` parent, lui, conserve `overflow: hidden` et coupe la mosaïque au viewport courant.

Ne jamais recalculer les styles `left/top/width/height` de chaque tuile à chaque frame. Une seule transformation du conteneur est autorisée.

### 11.4 Destruction

Dans `onBeforeUnmount` :

- incrémenter le token ;
- annuler le retry ;
- vider loaded/failed ;
- supprimer la définition ;
- mettre `ready` à `false` ;
- ne laisser aucun listener `online/offline` ni `requestAnimationFrame` ;
- si un listener est ajouté, conserver sa référence exacte et le retirer.

Le composant ne doit pas créer de `watchEffect` imbriqué, de watcher manuel non arrêté, de `setInterval` ou de cache module-level.

## 12. DOM et attributs de debug

Racine recommandée :

```html
<div
  data-selected-line-basemap-cover
  data-cover-enabled="true|false"
  data-cover-ready="true|false"
  data-cover-line-id="line:IDFM:..."
  data-cover-source-zoom="12"
  data-cover-tile-count="42"
  data-cover-estimated-decoded-bytes="11010048"
  aria-hidden="true"
></div>
```

Définition :

```html
<div
  data-selected-line-cover-definition
  data-cover-definition-key="..."
  data-cover-definition-signature="..."
></div>
```

Tuiles :

```html
<img
  data-selected-line-cover-tile
  data-cover-tile-id="..."
  data-cover-tile-state="loading|decoded|error"
>
```

Ne pas employer `data-definition-role="committed"` ou `pending` dans le cover. Ces attributs appartiennent au basemap live et sont déjà utilisés par le scénario de couverture.

## 13. Intégration exacte dans `GlobalTransportPlan.vue`

### 13.1 Template

Remplacer le `TransportMapBasemap` isolé par un stack global-only :

```vue
<div
  class="global-transport-plan__basemap-stack"
  :style="basemapStackStyle"
  aria-hidden="true"
>
  <SelectedLineBasemapCover
    ref="selectedLineCoverRef"
    :enabled="selectedLineCoverEnabled"
    :line-id="activeLine?.id"
    :camera="camera"
    :anchor-camera="selectedLineCoverAnchorCamera"
    :line-bounds="selectedLineCoverGeometryBounds"
    :layer="basemapLayer"
    :basemap-style="props.basemapStyle"
    :contrast="props.basemapContrast"
    :interaction-active="interactionActive"
  />

  <TransportMapBasemap
    ref="basemapRef"
    class="global-transport-plan__live-basemap"
    :camera="camera"
    :layer="basemapLayer"
    :basemap-style="props.basemapStyle"
    :contrast="props.basemapContrast"
    :interaction-active="interactionActive"
    :tile-refresh-camera="basemapTileRefreshCamera"
    :debug-ready-delay-ms="selectedLineWheelCoverageDelayMs"
  />
</div>
```

Différence volontaire : `:preload-bounds="activeLineTileBounds"` disparaît.

Le cover est placé avant le live dans le DOM. Le live est donc au-dessus dans le contexte interne.

### 13.2 Activation

```ts
const selectedLineCoverEnabled = computed(() =>
  GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.enabled &&
  Boolean(
    activeLine.value &&
    selectedLineCoverAnchorCamera.value &&
    selectedLineCoverGeometryBounds.value
  ),
);
```

Ajouter un override de debug strictement limité à `mapDebug=1` :

- `mapLineCover=0` force le cover à off ;
- `mapLineCover=1` force le cover à on ;
- sans valeur, utiliser la configuration de production.

Cet override est nécessaire au test A/B causal dans le même build. Il ne doit pas être persisté en settings ou en `localStorage`.

### 13.3 Style du stack

```ts
const basemapStackStyle = computed<Record<string, string>>(() => ({
  "--global-selected-line-basemap-background": basemapLayer.value === "satellite"
    ? "#1b2430"
    : GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.background,
  "--global-selected-line-basemap-opacity": basemapLayer.value === "satellite"
    ? "0.92"
    : props.basemapStyle === "voyager"
      ? "1"
      : "0.94",
}));
```

```css
.global-transport-plan__basemap-stack {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  isolation: isolate;
  contain: paint;
  pointer-events: none;
  background: var(--global-selected-line-basemap-background);
  opacity: var(--global-selected-line-basemap-opacity);
}

.global-transport-plan__basemap-stack :deep(.global-transport-plan__live-basemap) {
  z-index: 1;
  background: transparent;
  opacity: 1;
}
```

Le canvas reste inchangé à `z-index: 1` hors du stack.

Le style appliqué aux images du cover doit reproduire exactement `tileStyle` du basemap live pour `plan/light`, `plan/voyager` et `satellite`. Copier les formules dans le nouveau composant sans modifier le fichier partagé. Ajouter des tests d'égalité des chaînes de filtre pour éviter une différence visuelle.

### 13.4 Caméra d'ancrage et resize

Lors d'un resize :

1. laisser `resizeCamera` et le renderer fonctionner comme aujourd'hui ;
2. après la nouvelle taille connue, capturer une nouvelle caméra d'ancrage stable ;
3. reconstruire une fois le cover ;
4. ne pas reconstruire à chaque callback identique de `ResizeObserver` ; comparer largeur, hauteur et DPR.

Pendant un geste :

- la caméra live continue de changer ;
- la caméra d'ancrage reste inchangée ;
- la liste d'URL reste inchangée ;
- seul le style de transformation change.

## 14. Interaction avec les correctifs 1 et 2

Le correctif 3 suppose que :

- la géométrie transport focalisée n'est pas recapturée en bitmap à chaque frame ;
- la définition raster live pending n'est pas rendue visible avant son décodage complet ;
- une ancienne définition live committed peut rester visible pendant le chargement de la suivante ;
- les rafraîchissements anticipés de la molette restent bornés.

Ne pas supprimer ces mécanismes sous prétexte que le cover existe.

Le cover traite uniquement l'espace que l'ancienne définition live n'a jamais couvert. La transaction live traite la qualité et l'atomicité de la définition courante. Les deux mécanismes sont complémentaires.

## 15. Tests automatisés obligatoires

### 15.1 Tests purs de définition

Dans `tests/selectedLineBasemapCover.test.ts` :

1. la même entrée produit la même clé et la même signature ;
2. changer uniquement `camera.generation` ne change rien ;
3. changer la caméra live ne change rien ;
4. changer `lineId`, le style, la couche, le DPR, le viewport ou les bornes change la clé ;
5. toutes les tuiles ont le même zoom ;
6. le zoom retenu est le plus élevé respectant le budget ;
7. une enveloppe trop grande fait baisser le zoom au lieu de tronquer les tuiles ;
8. `tileCount <= maxTiles` ;
9. `estimatedDecodedBytes <= maxEstimatedDecodedBytes` ;
10. à DPR 2, le budget effectif passe à 32 avec les valeurs recommandées ;
11. le satellite conserve la densité 1 ;
12. les cinq viewports extrêmes sont inclus dans `coverageBounds` ;
13. des NaN ou bornes invalides désactivent proprement le cover ;
14. la définition de la ligne 14 reste bornée et mono-zoom ;
15. aucun test ne repose sur une exception codée en dur pour `C01384`.

### 15.2 Tests DOM du composant

Dans `tests/selectedLineBasemapCover.dom.test.ts` :

1. off ou ligne absente : aucune image ;
2. le cover est invisible pendant le chargement ;
3. N-1 images décodées : toujours invisible ;
4. N images décodées : visibilité atomique ;
5. une erreur : pas de cover partiel ;
6. un retry maximum puis abandon ;
7. un callback tardif d'une ancienne génération est ignoré ;
8. un changement de caméra live change le transform, pas les `src` ;
9. 100 changements de caméra live ne provoquent aucune reconstruction ;
10. un changement de ligne cache immédiatement l'ancienne mosaïque ;
11. un changement de style reconstruit une seule fois ;
12. un resize identique ne reconstruit pas ;
13. un resize réel reconstruit une fois ;
14. un unmount annule le retry et rend les callbacks inoffensifs ;
15. `rebuildsDuringInteraction === 0` pour un geste normal ;
16. le conteneur de définition a `overflow: visible` ;
17. les métriques et attributs DOM concordent.

Mocker explicitement `HTMLImageElement.decode`. Ne pas assimiler l'événement `load` à un décodage terminé.

### 15.3 Tests d'intégration global-only

Dans `tests/globalTransportPlan.dom.test.ts` :

1. sans ligne sélectionnée, cover désactivé ;
2. avec une ligne sélectionnée, cover monté ;
3. le `TransportMapBasemap` live reste monté exactement une fois ;
4. `preloadBounds` n'est plus fourni ;
5. le stack est sous le canvas ;
6. la ligne et ses stations restent dans la scène ;
7. sélectionner puis désélectionner dix fois ne laisse qu'un cover ou zéro selon l'état courant ;
8. aucune définition d'une ligne précédente ne reste dans le DOM ;
9. `mapLineCover=0` n'agit que lorsque `mapDebug=1` ;
10. le fingerprint de scène est identique cover off/on.

### 15.4 Tests de non-régression obligatoires

Exécuter au minimum :

```powershell
npm.cmd run test -- tests/selectedLineBasemapCover.test.ts
npm.cmd run test -- tests/selectedLineBasemapCover.dom.test.ts
npm.cmd run test -- tests/globalTransportPlan.dom.test.ts
npm.cmd run test -- tests/globalTransportPlanConfig.test.ts
npm.cmd run test -- tests/transportMapBasemap.test.ts
npm.cmd run test -- tests/transportMapBasemap.dom.test.ts
npm.cmd run test -- tests/nearbyStationsBasemap.dom.test.ts
npm.cmd run test -- tests/nearbyStationsMap.dom.test.ts
npm.cmd run test -- tests/detailedLineMapPicker.test.ts
npm.cmd run test -- tests/detailedLineMapPicker.dom.test.ts
npm.cmd run tsc
```

Puis :

```powershell
npm.cmd run test:map:e2e
```

Un test Nearby ou V1 qui casse n'est jamais à “adapter” au nouveau comportement. Le correctif doit être revu jusqu'à ce que ces tests restent inchangés et verts.

## 16. Protocole live anti-faux-positifs

### 16.1 Principe causal

La preuve principale compare deux variantes dans **le même build, la même session et le même navigateur** :

- A : cover forcé off ;
- B : cover forcé on.

Le délai artificiel s'applique uniquement au basemap live. Le scénario doit calculer à chaque frame :

1. `liveCoverage` : union des rectangles des images décodées dans la définition live committed ;
2. `combinedCoverage` : union des mêmes rectangles plus les images décodées du cover, uniquement si le cover est ready ;
3. `coverContribution` : vrai si le live a un trou mais pas l'union combinée.

Ajouter au report :

```ts
coverage: {
  samples: ...,
  liveCoverageGapFrames: number,
  combinedCoverageGapFrames: number,
  coverContributionFrames: number,
  minimumLiveCoverageRatio: number,
  minimumCombinedCoverageRatio: number,
  artificialReadinessDelayMs: number,
  coverReadyBeforeGesture: boolean,
}
```

Critères B obligatoires :

```text
coverReadyBeforeGesture == true
liveCoverageGapFrames > 0
combinedCoverageGapFrames == 0
coverContributionFrames > 0
minimumCombinedCoverageRatio == 1 à la tolérance existante de 1 px
```

Si `liveCoverageGapFrames == 0`, le scénario n'a pas reproduit le défaut : le run est **INVALIDE**, jamais “passed”.

Le contrôle A doit avoir :

```text
cover.enabled == false
liveCoverageGapFrames > 0
combinedCoverageGapFrames == liveCoverageGapFrames
coverContributionFrames == 0
```

Cette preuve montre simultanément que :

- le délai a réellement créé le manque de raster live ;
- le cover, et non une autre optimisation, a rempli le manque ;
- la couche live continue de suivre son cycle normal ;
- le test ne passe pas parce que le défaut n'a pas été exercé.

### 16.2 URLs de contrôle

Contrôle A à 150 ms :

```text
http://localhost:3000/map?line=line:IDFM:C01384&mergeDirections=0&mapDebug=1&mapPerfScenario=selected-line-wheel&mapPerfMode=coverage&mapTileDebugDelayMs=150&mapLineCover=0
```

Candidat B à 150 ms :

```text
http://localhost:3000/map?line=line:IDFM:C01384&mergeDirections=0&mapDebug=1&mapPerfScenario=selected-line-wheel&mapPerfMode=coverage&mapTileDebugDelayMs=150&mapLineCover=1
```

Répéter A et B avec `mapTileDebugDelayMs=300`.

Le scénario doit attendre explicitement :

- la ligne `C01384` active ;
- au moins un path et une station ;
- une scène stable ;
- les fonts ;
- le basemap live initial ready ;
- **le cover ready pour B** ;
- deux frames supplémentaires avant le premier événement.

Ne pas démarrer le chronomètre de performance pendant le préchargement initial du cover.

### 16.3 Lecture fiable du résultat

Attendre :

```js
document.querySelector('[data-selected-line-zoom-status]')
  ?.getAttribute('data-selected-line-zoom-status')
```

jusqu'à `passed` ou `failed`.

Lire ensuite :

```js
window.__transportMapSelectedLineZoomReport
```

Sauvegarder le JSON complet de chaque run. Une impression visuelle ou une seule capture d'écran ne constitue pas une preuve suffisante.

### 16.4 Mode performance séparé

La mesure de fluidité ne doit pas exécuter `getBoundingClientRect()` sur toutes les tuiles à chaque frame. Utiliser :

```text
mapPerfMode=performance
```

et supprimer `mapTileDebugDelayMs`.

URLs A/B :

```text
http://localhost:3000/map?line=line:IDFM:C01384&mergeDirections=0&mapDebug=1&mapPerfScenario=selected-line-wheel&mapPerfMode=performance&mapLineCover=0
```

```text
http://localhost:3000/map?line=line:IDFM:C01384&mergeDirections=0&mapDebug=1&mapPerfScenario=selected-line-wheel&mapPerfMode=performance&mapLineCover=1
```

Effectuer au moins six runs dans un ordre alterné pour limiter la dérive thermique :

```text
A, B, B, A, A, B
```

Comparer les médianes des trois A et des trois B, pas le meilleur run.

Le correctif 3 vise d'abord la continuité raster. Il ne doit pas prétendre améliorer le p95 si ce n'est pas mesuré. Critères de non-régression recommandés :

- p95 présenté B ≤ `max(p95_A × 1,05 ; p95_A + 1 ms)` ;
- ratio de frames présentées B ≥ ratio A − 0,02 ;
- même nombre d'événements ;
- même amplitude de zoom à ±0,02 ;
- même fingerprint paths/stations ;
- `cover.rebuildsDuringInteraction == 0` ;
- `cover.tileCount` constant du début à la fin ;
- `cover.definitionSignature` constante du début à la fin ;
- aucun callback tardif ne modifie la génération active ;
- nombre total de nœuds raster ≤ `live maxMountedTiles + cover tileCount` et conforme au budget annoncé.

Si B remplit les trous mais régresse au-delà de ces seuils, le résultat est “correct visuellement mais non acceptable en performance”.

### 16.5 Vérification du caractère mono-zoom et sans requête pendant le geste

Avant le premier événement, enregistrer :

```js
const before = [...document.querySelectorAll('[data-selected-line-cover-tile]')]
  .map((node) => node.getAttribute('src'))
  .sort();
```

Après chaque cycle et à la fin :

- le tableau trié doit être strictement égal ;
- le nombre de zooms distincts dans les IDs doit être 1 ;
- le nombre d'images doit être identique ;
- le compteur de rebuild ne doit pas augmenter.

Ne pas utiliser uniquement l'onglet Network comme preuve : un hit mémoire peut ne pas produire une ligne réseau évidente. La stabilité des URL DOM, de la signature et du compteur de définition est déterministe.

### 16.6 Test cold/warm distinct

Le temps de préparation du cover est mesuré séparément de la fluidité :

1. cold cache : vider le cache disque du navigateur, recharger B, mesurer sélection de ligne → `coverReady` ;
2. warm cache : recharger sans vider, mesurer à nouveau ;
3. vérifier que la ligne et le basemap live restent interactifs avant `coverReady` ;
4. vérifier qu'un cover non prêt ne bloque jamais le scénario normal hors test de couverture.

Ne pas mélanger les résultats cold et warm dans une moyenne de frame time.

Le temps cold dépend du réseau et ne doit pas devenir un seuil absolu de CI. Les invariants déterministes — budget, absence de blocage, atomicité et zéro reconstruction pendant le geste — restent les gates automatiques.

### 16.7 Test visuel contrôlé

Avec `mapTileDebugDelayMs=300` et B :

- prendre une capture au milieu du premier dézoom ;
- vérifier l'absence de rectangle beige ou sombre ;
- vérifier que la ligne, les stations et leurs libellés sont présents ;
- vérifier qu'aucun texte raster n'apparaît doublé de façon stable ;
- après settle, comparer une capture B à une capture A sans délai : la couche live doit recouvrir le cover et retrouver la même qualité.

Une légère baisse de détail transitoire du raster de secours est acceptable. Une baisse permanente ne l'est pas.

### 16.8 Test de libération des ressources

Dans le même onglet :

1. sélectionner `C01384` ;
2. attendre `coverReady` ;
3. désélectionner la ligne ;
4. répéter dix fois ;
5. après chaque désélection, vérifier zéro `[data-selected-line-cover-tile]` ;
6. après chaque sélection, vérifier exactement une définition et au plus le budget de tuiles ;
7. vérifier que `rebuilds` croît d'une quantité attendue, pas avec les frames ;
8. provoquer un changement de ligne pendant que des images chargent et vérifier `lateCallbacksIgnored > 0` sans modification de la nouvelle définition ;
9. attendre deux délais de retry et vérifier qu'aucun timer ne reconstruit une ligne désélectionnée.

Un snapshot mémoire peut compléter ce test, mais il ne remplace pas les compteurs déterministes. Le GC rend une comparaison instantanée de heap trop instable pour être un gate fiable.

## 17. Garde-fou cryptographique V1 / Nearby / shared basemap

Le worktree peut déjà contenir des changements utilisateur. `git diff --exit-code` n'est donc pas une preuve fiable. Capturer les SHA-256 avant l'implémentation.

Avant :

```powershell
$guardFiles = @(
  'pages\line\[transportType]\[lineId].vue',
  'src\features\line-map\DetailedLineMapPicker.vue',
  'src\features\nearby-stations\NearbyStationsMap.vue',
  'src\features\nearby-stations\NearbyStationsBasemap.vue',
  'src\features\transport-map\basemap\TransportMapBasemap.vue',
  'src\features\transport-map\basemap\tileMath.ts',
  'src\features\transport-map\basemap\basemapDefinition.ts'
)

$guardBaseline = $guardFiles | ForEach-Object {
  [pscustomobject]@{
    Path = $_
    Sha256 = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash
  }
}

$guardBaseline | ConvertTo-Json | Set-Content -LiteralPath '.\selected-line-cover-guard.before.json'
```

Après :

```powershell
$guardBaseline = Get-Content -LiteralPath '.\selected-line-cover-guard.before.json' | ConvertFrom-Json
$guardFailures = foreach ($entry in $guardBaseline) {
  $actual = (Get-FileHash -LiteralPath $entry.Path -Algorithm SHA256).Hash
  if ($actual -ne $entry.Sha256) {
    [pscustomobject]@{ Path = $entry.Path; Before = $entry.Sha256; After = $actual }
  }
}

if ($guardFailures) {
  $guardFailures | Format-Table -AutoSize
  throw 'Correctif 3 hors périmètre : un fichier protégé a changé.'
}
```

Supprimer ensuite uniquement le fichier de garde temporaire créé par l'implémenteur. Ne pas le committer.

Ce garde-fou doit passer en plus des tests V1/Nearby.

## 18. Critères d'acceptation complets

Le correctif est accepté uniquement si toutes les conditions suivantes sont vraies :

### Fonctionnel

- le cover n'existe que lorsqu'une ligne est active dans `GlobalTransportPlan` ;
- le dézoom rapide de `C01384` ne révèle aucun fond non couvert dans le scénario combiné ;
- la ligne et ses stations restent identiques ;
- la couche live reprend visuellement le dessus ;
- une panne du cover laisse la carte live utilisable.

### Architecture

- aucun fichier V1, Nearby ou basemap partagé protégé n'a changé ;
- aucune utilisation de `preloadBounds` pour la ligne ;
- `preloadActiveLineTiles` reste `false` ;
- une seule définition mono-zoom ;
- aucun cache module-level ;
- aucune table spécifique à une ligne ;
- aucun watcher ou timer non libéré.

### Ressources

- maximum 64 tuiles à 1x ;
- maximum 32 tuiles à 2x avec un budget de 32 MiB ;
- mémoire décodée estimée sous le budget ;
- zéro reconstruction pendant le geste ;
- signature et URL stables pendant le geste ;
- suppression complète au changement de contexte ou unmount.

### Preuve live

- A/150 ms reproduit des trous live ;
- B/150 ms a des trous live mais zéro trou combiné ;
- A/300 ms reproduit des trous live ;
- B/300 ms a des trous live mais zéro trou combiné ;
- `coverContributionFrames > 0` pour les deux B ;
- les runs performance alternés respectent les seuils de non-régression ;
- les fingerprints de scène et amplitudes de zoom correspondent.

### Régressions

- nouveaux tests verts ;
- tests GlobalTransportPlan verts ;
- tests TransportMapBasemap existants verts ;
- tests Nearby verts sans adaptation ;
- tests V1 verts sans adaptation ;
- `npm.cmd run tsc` vert ;
- garde SHA-256 verte.

## 19. Ordre d'implémentation recommandé

1. Capturer les hashes des fichiers protégés.
2. Écrire les fonctions pures et leurs tests.
3. Vérifier les budgets 1x/2x et les cinq viewports extrêmes.
4. Écrire le composant cover sans l'intégrer.
5. Tester atomicité, tokens tardifs, retry et unmount.
6. Ajouter la configuration global-only.
7. Renommer/calculer `selectedLineGeometryBounds` et retirer `preloadBounds` du template global.
8. Ajouter le stack, son fond/opacité uniques et le cover sous le live.
9. Capturer la caméra d'ancrage aux transitions explicites.
10. Étendre les métriques du scénario en live-only/combined/contribution.
11. Ajouter l'override debug `mapLineCover`.
12. Exécuter les tests ciblés.
13. Exécuter le garde SHA-256.
14. Exécuter A/B à 150 ms puis 300 ms.
15. Exécuter les six runs de performance alternés.
16. Exécuter les tests de sélection/désélection et callbacks tardifs.
17. Exécuter `test:map:e2e` et `tsc`.
18. Ne déclarer la tâche terminée qu'avec les JSON des runs et le tableau final des gates.

## 20. Erreurs d'implémentation probables à rechercher en review

- Le cover est enfant d'un conteneur `overflow: hidden` de la taille de la caméra d'ancrage.
- Le cover est placé derrière le fond opaque du `TransportMapBasemap` live.
- L'opacité est appliquée au cover et au live séparément, ce qui double les libellés.
- La caméra live figure dans la clé et reconstruit les images à chaque frame.
- `camera.generation` figure dans la clé.
- Toutes les tuiles sont rendues visibles dès leur événement `load`.
- `decode()` n'est pas attendu.
- Un callback tardif reçoit le token courant au lieu du token capturé.
- Le budget compte les tuiles, mais ignore le `@2x`.
- Le tableau est tronqué après génération.
- Plusieurs zooms sont conservés “pour plus de qualité”.
- Les bornes couvrent la ligne mais pas le viewport atteint au dézoom.
- Le test mesure uniquement la couche combinée et ne prouve pas que le live avait un trou.
- Le délai debug ralentit aussi le cover.
- Le mode couverture, coûteux, est utilisé pour annoncer un gain de frame time.
- La couche transport ou les stations ont été cachées pendant le benchmark.
- Les tests Nearby ont été modifiés pour accepter un nouveau comportement.
- Un changement est glissé dans `TransportMapBasemap.vue` alors qu'une règle CSS locale suffisait.

## 21. Prompt prêt à transmettre à une IA d'implémentation

```text
Implémente strictement le correctif 3 décrit dans
docs/global-transport-plan/SELECTED_LINE_BASEMAP_COVER_FIX_3_IMPLEMENTATION.md.

Lis le document en entier avant d'éditer. Commence par capturer les hashes SHA-256 des
fichiers protégés. Ne modifie aucun fichier V1, Nearby, TransportMapBasemap, tileMath ou
basemapDefinition. Ne réactive pas preloadActiveLineTiles et n'utilise pas preloadBounds.

L'objectif est un cover raster global-only, borné, mono-zoom, atomique, sous la couche live,
avec budgets de 64 tuiles et 32 MiB décodés, et aucune reconstruction pendant un geste.

Implémente d'abord les fonctions pures et les tests, puis le composant, puis l'intégration.
Utilise le stack à fond/opacité uniques décrit dans le document afin que le cover soit visible
sous les trous sans double opacité et sans modifier le basemap partagé.

Étends le scénario selected-line-wheel afin de mesurer séparément liveCoverage,
combinedCoverage et coverContribution. Ajoute l'override debug mapLineCover=0|1 seulement
quand mapDebug=1.

Ne conclus pas sur une impression visuelle. Le run candidat est valide uniquement si le live
a réellement des gaps, si l'union live+cover n'en a aucun et si coverContributionFrames > 0.
Exécute A/B à 150 ms et 300 ms, puis six runs performance A,B,B,A,A,B sans instrumentation
de couverture. Vérifie les fingerprints de scène, les amplitudes de zoom, les budgets, la
stabilité des URL/signatures et zéro rebuild pendant le geste.

Exécute tous les tests et commandes listés dans le document, puis vérifie les hashes. Si un
fichier protégé change ou si un test Nearby/V1 doit être adapté, arrête et corrige l'approche.

À la fin, fournis : fichiers modifiés, tests exécutés, hashes protégés, JSON des quatre runs
de couverture, médianes A/B des runs performance, budgets observés, et chaque critère
d'acceptation en PASS/FAIL. Ne déclare pas terminé si un gate est FAIL ou si le scénario est
INVALIDE.
```

## 22. Décision finale attendue de l'implémenteur

Le compte rendu final doit distinguer trois résultats :

- **PASS** : continuité prouvée causalement, budgets respectés, aucune régression ;
- **FAIL** : une gate déterministe échoue ;
- **INVALIDE** : le scénario n'a pas exercé le défaut live, l'environnement a changé ou les données A/B ne sont pas comparables.

“Semble plus fluide” ou “je ne vois plus le trou” n'est jamais une quatrième catégorie.
