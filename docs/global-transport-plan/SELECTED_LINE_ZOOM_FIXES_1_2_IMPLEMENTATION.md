# Plan d'implémentation — fluidité du zoom d'une ligne sélectionnée

## Statut et destinataire

Ce document est un cahier d'implémentation destiné à une autre IA, notamment un modèle moins coûteux comme Luna Max. Il doit être suivi dans l'ordre. Les deux changements visés sont volontairement étroits :

1. supprimer la capture inutile du cache plein-canvas pendant le redraw live d'une ligne sélectionnée ;
2. remplacer le renouvellement incrémental des tuiles par une transaction de définition atomique, avec une seule définition future en attente et la dernière requête gagnante.

Le document demande également une instrumentation temporaire et un protocole live reproductible. Cette instrumentation est obligatoire : il est interdit de conclure à une amélioration en se fondant uniquement sur une impression visuelle, une moyenne, une seule exécution ou un p95 obtenu avec moins de frames réellement présentées.

## Résultat attendu

À la fin du travail :

- une ligne sélectionnée continue d'être redessinée exactement dans l'espace écran pendant le zoom ;
- aucune copie du canvas principal vers le canvas de cache n'est faite pendant ces frames de zoom focalisé ;
- une frame stable après le geste reconstruit bien le cache ;
- une nouvelle définition de tuiles n'est jamais rendue partiellement ;
- une définition remplacée ou obsolète ne peut jamais être commitée tardivement ;
- la couche de tuiles affichée reste une définition cohérente et unique ;
- les tuiles de la définition suivante sont chargées et décodées hors affichage, puis permutées en une seule mise à jour ;
- les tests DOM prouvent les transitions d'état, y compris échec, supersession et changement de caméra ;
- le protocole live prouve séparément la correction visuelle et la performance ;
- aucun gain n'est revendiqué si le scénario, le nombre de frames, la ligne active, la caméra finale ou la qualité visuelle diffèrent entre baseline et candidat.

## Fichiers directement concernés

Les fichiers principaux sont :

- `src/features/transport-map/render/canvas2d/canvas2dRenderer.ts`
- `src/features/transport-map/contracts/renderer.ts`
- `src/features/transport-map/basemap/TransportMapBasemap.vue`
- `src/features/line-map/GlobalTransportPlan.vue`
- `src/features/transport-map/performance/transportMapPerformance.ts`
- `tests/transportMapRendererCache.test.ts`
- `tests/transportMapBasemap.dom.test.ts`
- `tests/transportMapPerformance.test.ts`
- `tests/globalTransportPlan.dom.test.ts`

Fichiers de référence à lire, mais à ne pas recopier aveuglément :

- `src/features/line-map/DetailedLineMapPicker.vue`, surtout `scheduleMapTileReplacement()` et `preloadMapTile()` ;
- `src/features/nearby-stations/NearbyStationsBasemap.vue`, pour la notion de définition décodée avant exposition ;
- `src/features/transport-map/basemap/tileMath.ts`, qui reste la source unique des identités, URL, niveaux et positions de tuiles ;
- `src/features/transport-map/config/globalTransportPlanConfig.ts`, qui contient les budgets existants.

## Non-objectifs et interdictions

Ne pas profiter de ce travail pour :

- activer `preloadActiveLineTiles` ; son implémentation actuelle est non bornée par niveau et explicitement marquée `buggy, tofix` ;
- ajouter un préchargement de toute la pyramide de la ligne ;
- modifier la géométrie GTFS/NeTEx, les chunks, les workers ou le scheduler ;
- désactiver les labels, les stations, le trafic ou le redraw exact afin d'obtenir artificiellement un meilleur score ;
- changer `zoomSmoothingMs`, `wheelZoomFactor`, les niveaux XYZ ou les budgets de tuiles avant d'avoir mesuré les deux correctifs isolément ;
- réduire le nombre de frames produites pour faire baisser le temps CPU total ;
- élargir les seuils de performance existants ;
- ajouter une dépendance de benchmark ou un framework E2E sans nécessité ;
- corriger le panneau debug masqué par le panneau d'affichage dans le même lot ; le scénario automatique ne doit pas dépendre de boutons cliquables ;
- réécrire `TransportMapBasemap.vue` au-delà de la machine d'état nécessaire ;
- toucher aux changements non liés déjà présents dans le worktree.

## Constat technique de départ

### Chemin Canvas actuel

Dans `Canvas2dRenderer.render()` :

1. `redrawFocusedLineDuringZoom` devient vrai lorsque `interactionActive`, `activeLineId` et `resizeStrokesDuringZoom` sont vrais ;
2. `useCachedPaths` devient donc faux ;
3. `renderPaths()` redessine la ligne focalisée ;
4. `capturePathCache()` est quand même appelée ;
5. `capturePathCache()` fait un `drawImage(sourceCanvas, ...)` plein-canvas vers le canvas hors écran ;
6. à la frame suivante, le cache n'est toujours pas utilisé puisque la ligne focalisée est encore redessinée.

Le test existant vérifie que le `drawImage` du contexte principal n'est pas appelé pendant le zoom focalisé. Il ne vérifie pas le `drawImage` du contexte de cache. Il peut donc passer alors que la copie inutile existe toujours.

### Chemin des tuiles actuel

`TransportMapBasemap.vue` mélange dans un seul tableau :

- la définition désirée en cours de chargement ;
- les anciennes entrées chargées marquées `stale` ;
- les états `loading`, `loaded` et `error`.

Les tuiles désirées sont immédiatement montées dans le DOM avec une opacité nulle. Les anciennes sont reprojetées vers `tileCamera`. Elles sont supprimées lorsque toutes les tuiles désirées sont chargées.

Cette stratégie évite certains flashes, mais elle ne représente pas une vraie transaction :

- la caméra servant à demander la prochaine définition devient également l'ancre de la couche ;
- les anciennes tuiles peuvent ne plus couvrir le viewport agrandi lors d'un dézoom rapide ;
- plusieurs changements de définition peuvent être demandés pendant un seul geste ;
- une définition partiellement chargée existe déjà dans le DOM visible de la couche ;
- les erreurs ne possèdent pas de politique transactionnelle explicite ;
- il n'existe pas de notion formelle de définition commitée et de définition candidate.

## Invariants non négociables

Les invariants suivants doivent être traduits en tests :

### Invariants du renderer

- Une frame stable dessine les chemins exactement puis capture un cache valide.
- Un zoom du réseau global peut continuer à blitter son cache valide.
- Un zoom avec ligne focalisée redessine les chemins exactement à chaque frame.
- Un zoom avec ligne focalisée ne capture jamais le plein-canvas pendant l'interaction.
- La première frame stable suivant l'interaction capture exactement une fois le nouvel état.
- Les stations et labels restent dessinés dans l'espace CSS exact à chaque frame.
- Les métriques ne doivent pas confondre un blit sur le contexte principal et une capture vers le contexte de cache.

### Invariants du basemap

- Au maximum une définition est affichée et une définition est en attente.
- La définition en attente est totalement invisible.
- Une définition en attente n'est commitée que lorsque toutes ses tuiles `visible` ont réussi leur chargement et leur décodage.
- Les tuiles `overscan` peuvent continuer à se charger après le commit ; elles ne doivent pas bloquer indéfiniment le viewport visible.
- Un échec d'une tuile `visible` interdit le commit de cette définition.
- Un échec ne supprime jamais la dernière définition commitée valide.
- Une définition supersédée ne peut plus modifier l'état, même si ses callbacks arrivent tardivement.
- Deux requêtes possédant la même signature raster ne rechargent pas les mêmes URL ; elles ne font que réancrer/reprojeter les positions.
- La transformation live est calculée depuis la caméra d'ancrage de la définition commitée, jamais depuis la caméra de la définition en attente.
- La fin du geste aboutit à une définition dont la signature et le niveau source correspondent à `createTransportMapBasemapTiles(cameraFinale, options)`.
- Aucun mode de test ne peut masquer la ligne, réduire les tuiles ou ignorer des frames afin d'obtenir un score favorable.

---

# Phase 0 — instrumentation et baseline avant toute optimisation

Cette phase doit être implémentée et exécutée avant les correctifs. Elle ne doit changer aucun comportement visuel ou décision de rendu.

## 0.1 Préserver le worktree

Avant toute édition :

1. lancer `git status --short` ;
2. noter les fichiers déjà modifiés ;
3. ne jamais faire `git reset`, `git checkout --`, nettoyage récursif ou remplacement massif ;
4. limiter les patches aux fichiers listés dans ce document ;
5. enregistrer les rapports de baseline sous `reports/global-map-performance/selected-line-zoom/` ;
6. ne pas ajouter les rapports générés au commit final sauf demande explicite.

## 0.2 Étendre les métriques par frame du renderer

Ajouter des champs additifs à `TransportMapRendererMetrics`. Les noms peuvent varier légèrement, mais le sens doit rester exactement celui-ci :

```ts
interface TransportMapRendererMetrics {
  // champs existants...
  focusedLineLiveRedraw: boolean;
  pathCacheCaptureCount: 0 | 1;
  pathCacheCaptureMs: number;
  pathCacheCapturedBytes: number;
}
```

Règles :

- réinitialiser ces quatre valeurs au début de chaque appel à `render()` ;
- `focusedLineLiveRedraw` doit refléter `redrawFocusedLineDuringZoom` ;
- `pathCacheCaptureCount` vaut `1` uniquement si `capturePathCache()` a réellement exécuté la copie ;
- `pathCacheCaptureMs` mesure seulement `clearRect + drawImage` du cache, pas tout le rendu ;
- `pathCacheCapturedBytes` vaut `cacheCanvas.width * cacheCanvas.height * 4` uniquement pour une capture réelle ;
- ne pas compter l'allocation théorique permanente du canvas comme octets copiés ;
- si le contexte ou le canvas manque et que la copie n'a pas lieu, le compteur reste à zéro.

La mesure doit être réalisée au plus près de `cacheContext.drawImage()`. Elle ne doit pas inclure de log console par frame.

## 0.3 Agréger les métriques dans le probe

`TransportMapPerformanceReport` doit conserver les métriques existantes et ajouter une section agrégée, par exemple :

```ts
rendererAggregate: {
  frames: number;
  totalRenderMs: number;
  medianRenderMs: number;
  p95RenderMs: number;
  focusedLineLiveRedrawFrames: number;
  pathCacheCaptureCount: number;
  pathCacheCaptureMs: number;
  pathCacheCapturedBytes: number;
}
```

Implémentation attendue :

- `recordRendererMetrics()` copie toujours `lastRenderer`, comme aujourd'hui ;
- il ajoute `renderMs` à un tableau de samples ;
- il additionne les compteurs de capture ;
- il compte les frames `focusedLineLiveRedraw` ;
- `start()` remet tous ces agrégats à zéro ;
- `snapshot()` et `stop()` calculent médiane et p95 avec la même fonction de percentile que les temps RAF ;
- `dispose()` vide les samples ;
- les tests du probe utilisent une horloge synthétique et des métriques déterministes.

Ces métriques sont la preuve causale du correctif 1. Un meilleur p95 sans disparition du travail inutile n'est pas suffisant.

## 0.4 Ajouter des métriques de définition de tuiles

Avant la réécriture transactionnelle, exposer des compteurs de debug depuis `TransportMapBasemap.vue` avec `defineExpose()`. Ils doivent être réinitialisables et lisibles par `GlobalTransportPlan.vue` uniquement lorsque `mapDebug=1` ou qu'un scénario automatisé est actif.

Minimum demandé :

```ts
interface TransportMapBasemapDebugMetrics {
  desiredDefinitionChanges: number;
  committedDefinitionChanges: number;
  supersededDefinitions: number;
  commitsBeforeReady: number;
  visibleTileErrors: number;
  maxMountedTiles: number;
  committedSignature?: string;
  pendingSignature?: string;
  committedSourceZoom?: number;
  pendingRequiredTiles: number;
  pendingDecodedRequiredTiles: number;
}
```

Dans la baseline, certains champs transactionnels peuvent rester à zéro ou être dérivés du mécanisme existant. Après le correctif 2, leur sémantique doit devenir stricte.

Ajouter des attributs DOM de diagnostic, sans texte visible :

- `data-definition-role="committed|pending"` sur les sous-couches ;
- `data-definition-signature` ;
- `data-definition-source-zoom` ;
- `data-tile-id`, `data-tile-priority` et `data-tile-state` sur les images.

Ces attributs sont autorisés en production car ils sont passifs, mais les calculs coûteux d'audit doivent rester derrière les paramètres debug.

## 0.5 Scénario live automatique

Le test ne doit pas dépendre du clic sur le panneau debug, actuellement susceptible d'être recouvert. Ajouter un scénario de développement déclenché par :

```text
/map?line=line:IDFM:C01384&mergeDirections=0&mapDebug=1&mapPerfScenario=selected-line-wheel
```

Le scénario doit :

1. attendre que la ligne active corresponde exactement à `line:IDFM:C01384` ;
2. attendre que la scène contienne au moins un path et une station ;
3. attendre une définition de tuiles visible prête ou un timeout explicite ;
4. attendre `document.fonts.ready` lorsqu'il est disponible ;
5. attendre deux `requestAnimationFrame` supplémentaires ;
6. mémoriser la caméra initiale et un fingerprint de scène ;
7. utiliser le centre exact du canvas comme ancre ;
8. envoyer dix événements `wheel` de `deltaY = 167`, espacés de 16 ms ;
9. attendre la fin réelle de l'interaction et le settle de la caméra ;
10. envoyer dix événements `wheel` de `deltaY = -167`, espacés de 16 ms ;
11. attendre de nouveau le settle ;
12. répéter plusieurs cycles selon le mode de test ;
13. publier le rapport dans `window.__transportMapSelectedLineZoomReport` et dans un élément caché `[data-selected-line-zoom-report]` contenant du JSON ;
14. publier un état `running|passed|failed` dans `data-selected-line-zoom-status` ;
15. échouer avec un message explicite si une précondition n'est pas satisfaite.

Le scénario doit passer par le vrai listener DOM `wheel`. Ne pas appeler directement une fonction de zoom simplifiée qui contournerait `onWheel()`, `stepWheelZoom()`, `drawNow()` ou `refreshBasemapDuringWheelZoom()`.

Le rapport doit contenir un fingerprint empêchant les comparaisons invalides :

```ts
scenario: {
  name: "selected-line-wheel";
  lineId: string;
  inputEvents: number;
  cycles: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  initialCamera: CameraState;
  finalCamera: CameraState;
  minObservedZoom: number;
  maxObservedZoom: number;
  activeLineFrames: number;
  interactivePresentedFrames: number;
  scenePathCountMin: number;
  sceneStationCountMin: number;
  sceneFingerprint: string;
}
```

Le fingerprint peut être un JSON stable ou un hash simple construit à partir de :

- `activeLineId` ;
- IDs triés des paths ;
- IDs triés des stations ;
- viewport CSS ;
- pixel ratio ;
- zoom initial et final arrondis à `1e-4`.

## 0.6 Séparer les modes d'audit

Le scénario doit accepter un paramètre :

```text
mapPerfMode=performance|coverage
```

### Mode `performance`

- aucun `getBoundingClientRect()` de toutes les tuiles à chaque frame ;
- aucun screenshot pendant la mesure ;
- aucun log console par frame ;
- aucun délai artificiel ;
- deux cycles de chauffe non mesurés ;
- six cycles mesurés ;
- le probe démarre au moins 1 100 ms avant le premier cycle mesuré afin de dépasser son warmup de 1 000 ms.

### Mode `coverage`

- trois cycles suffisent ;
- les performances numériques ne sont pas interprétées ;
- l'audit géométrique de couverture peut scanner le DOM ;
- un délai debug déterministe de 150 ms peut être ajouté entre décodage et état `ready`, uniquement dans ce mode ;
- ce délai doit s'appliquer de façon identique à la baseline et au candidat ;
- le rapport doit indiquer `artificialReadinessDelayMs: 150`.

Ne jamais mélanger les résultats des deux modes. L'audit de couverture force des layouts et rendrait le benchmark de performance invalide.

## 0.7 Audit géométrique de couverture

Créer une petite fonction pure, idéalement sous `src/features/transport-map/performance/basemapCoverage.ts`, testée séparément.

Entrées :

- rectangle du viewport ;
- rectangles `getBoundingClientRect()` des seules images chargées appartenant à la définition commitée ;
- tolérance maximale de 1 pixel CSS pour les erreurs d'arrondi.

Algorithme recommandé : sweep-line exacte sur des rectangles axis-aligned.

1. clipper chaque rectangle au viewport ;
2. construire les bornes X uniques : gauche/droite du viewport et gauche/droite de chaque rectangle clippé ;
3. pour chaque intervalle X non vide, prendre son milieu ;
4. retenir les rectangles couvrant ce milieu ;
5. fusionner leurs intervalles Y ;
6. calculer la hauteur Y couverte ;
7. additionner `largeurIntervalle * hauteurCouverte` ;
8. renvoyer surface couverte, ratio et présence d'un gap supérieur à la tolérance.

Tests purs obligatoires :

- un rectangle couvrant exactement le viewport donne `1` ;
- quatre tuiles jointives donnent `1` ;
- un overlap de 1 pixel reste `1` ;
- un trou de 2 pixels échoue ;
- un rectangle totalement extérieur n'augmente pas la couverture ;
- des tuiles couvrant 75 % donnent environ `0.75` ;
- l'ordre des rectangles n'influence pas le résultat.

À chaque frame interactive du mode `coverage`, enregistrer :

- `coverageSamples` ;
- `coverageGapFrames` ;
- `minimumCoverageRatio` ;
- le premier zoom et la première signature associés à un gap.

## 0.8 Capturer la baseline

Avant le correctif 1 :

1. lancer les tests existants ;
2. lancer le scénario `performance` au moins six fois ;
3. lancer le scénario `coverage` trois fois ;
4. conserver tous les rapports bruts, pas seulement une moyenne ;
5. capturer une image stable à la caméra initiale et une image stable à la caméra finale ;
6. noter la version, le viewport, le DPR, le navigateur et l'état du cache ;
7. lancer le probe V1 avant et après la série comme contrôle de bruit machine.

Si le p95 V1 varie de plus de 10 % entre le début et la fin, invalider la session comparative et la recommencer. Ne pas sélectionner les meilleurs runs.

---

# Correctif 1 — supprimer la capture plein-canvas pendant le redraw focalisé

## 1.1 Modification minimale attendue

Dans `Canvas2dRenderer.render()`, séparer explicitement trois décisions :

```ts
const redrawFocusedLineDuringZoom = /* condition existante */;
const useCachedPaths = /* condition existante */;
const shouldCapturePaths = !redrawFocusedLineDuringZoom;
```

Le flux cible est :

```ts
if (useCachedPaths) {
  clearCanvas();
  blitPathCache();
} else {
  renderPaths();
  if (shouldCapturePaths) capturePathCache();
}
```

Il ne faut pas déplacer le rendu des stations ou des labels dans le cache. Il ne faut pas modifier `renderPaths()` dans ce lot.

## 1.2 Matrice de comportement à respecter

| État | Chemins | Capture cache | Stations/labels |
|---|---|---|---|
| frame stable, ligne ou réseau | redraw exact | oui | exacts |
| interaction réseau global, cache valide | blit cache | non | exacts |
| interaction réseau global, cache invalide | redraw exact | oui, pour permettre les frames suivantes | exacts |
| interaction avec ligne active | redraw exact | non | exacts |
| première frame stable après ligne active | redraw exact | oui, exactement une fois | exacts |

Le cas « réseau global, cache invalide » est important : ne pas appliquer une règle générale « pas de capture pendant toute interaction ». Elle dégraderait le chemin global.

## 1.3 Gestion de la validité du cache

Pendant un zoom focalisé :

- conserver le cache précédent en mémoire ;
- ne pas l'utiliser ;
- ne pas le recopier ;
- ne pas l'invalider à chaque frame ;
- laisser la frame stable suivante écraser caméra, références de scène et contenu du cache.

L'invalidation existante sur resize, dispose ou changement structurel reste inchangée.

## 1.4 Tests unitaires obligatoires

Modifier le test focalisé existant dans `tests/transportMapRendererCache.test.ts` :

1. utiliser un `mainContext` et un `cacheContext` distincts ;
2. effectuer une frame stable et constater une capture dans `cacheContext.drawImage` ;
3. mémoriser le nombre d'appels de `cacheContext.drawImage` ;
4. effectuer une frame `interactionActive: true` avec `activeLineId` ;
5. vérifier que `mainContext.stroke` augmente ;
6. vérifier que `mainContext.drawImage` n'augmente pas ;
7. surtout vérifier que `cacheContext.drawImage` n'augmente pas ;
8. vérifier `focusedLineLiveRedraw === true` ;
9. vérifier `pathCacheCaptureCount === 0` et `pathCacheCapturedBytes === 0` ;
10. effectuer une frame stable à la nouvelle caméra ;
11. vérifier que `cacheContext.drawImage` augmente exactement de un ;
12. vérifier `pathCacheCaptureCount === 1` et un nombre d'octets strictement positif.

Ajouter ou conserver un test séparé prouvant que le réseau global utilise toujours le blit pendant l'interaction et qu'un cache invalide peut être reconstruit.

## 1.5 Critères d'acceptation causaux

Dans le rapport live candidat :

- `focusedLineLiveRedrawFrames > 0` ;
- au moins 95 % des frames interactives ont gardé la ligne active ;
- `pathCacheCaptureCount` pendant les frames focalisées interactives vaut exactement `0` ;
- `pathCacheCapturedBytes` pendant ces frames vaut exactement `0` ;
- au moins une capture a lieu après le settle ;
- le nombre de paths et stations reste égal au fingerprint baseline ;
- la capture stable avant/après ne révèle aucune différence de ligne ou label hors tolérance d'antialiasing.

## 1.6 Interprétation performance

Le correctif est fonctionnellement prouvé par les compteurs même si la machine desktop est trop rapide pour produire un grand écart de p95.

On ne peut écrire « performance perceptible améliorée » que si, sur les six runs mesurés :

- au moins cinq runs candidat sur six ont un `rendererAggregate.p95RenderMs` inférieur à la médiane baseline ;
- la médiane candidate baisse d'au moins 10 %, ou le temps total renderer baisse d'au moins 10 % à nombre de frames comparable ;
- `presentedFrameRatio` ne diminue pas de plus de 1 point ;
- `presentedP95FrameTimeMs` ne régresse pas de plus de 1 ms ;
- le nombre de frames interactives reste dans ±5 % de la baseline.

Si seuls les octets copiés et le temps de capture baissent, conclure exactement : « travail inutile supprimé, gain UX non démontré sur cette machine ». Ne pas transformer cela en affirmation de fluidité mesurée.

---

# Correctif 2 — transaction atomique de définition de tuiles

## 2.1 Modèle d'état cible

Remplacer le tableau mixte `tileEntries + stale` par deux définitions explicites :

```ts
type TileLoadState = "loading" | "decoded" | "error";

interface TileDefinitionEntry {
  tile: TransportMapBasemapTile;
  state: TileLoadState;
}

interface TileDefinition {
  token: number;
  signature: string;
  anchorCamera: CameraState;
  entries: TileDefinitionEntry[];
  requiredKeys: Set<string>;
  createdAt: number;
}

const committedDefinition = shallowRef<TileDefinition>();
const pendingDefinition = shallowRef<TileDefinition>();
```

Une `Map` mutable profondément réactive n'est pas nécessaire. Préférer des remplacements immuables du petit tableau concerné afin que Vue observe exactement les transitions voulues.

## 2.2 Signature d'une définition

La signature raster doit dépendre :

- du `tile.id` trié ;
- de l'URL si l'identité ne la garantit pas déjà ;
- du layer et du style via l'ID existant ;
- du DPR déjà encodé par le suffixe `@2x`.

La signature ne doit pas inclure `leftCssPx`, `topCssPx`, largeur ou hauteur. Les mêmes rasters peuvent être réancrés sans téléchargement lorsqu'une caméra bouge à l'intérieur du même rectangle XYZ.

Exemple conceptuel :

```ts
tiles.map(tile => `${tile.id}:${tile.url}`).sort().join("|")
```

## 2.3 Structure DOM

Le root `.transport-map-basemap` ne doit plus porter directement la transformation dépendant de `tileCamera`.

Créer deux sous-couches absolues :

```html
<div data-definition-role="committed">...</div>
<div data-definition-role="pending">...</div>
```

Règles CSS :

- les deux sous-couches utilisent `position: absolute; inset: 0; transform-origin: 0 0` ;
- seule la sous-couche commitée a une opacité visible ;
- la pending a `opacity: 0`, aucune transition et ne reçoit aucun événement ;
- ne pas utiliser `display: none`, car les images doivent charger et décoder ;
- le changement pending → committed est atomique dans une seule mise à jour Vue ;
- ne pas faire de fondu entre définitions : cela produirait des doubles labels Carto ;
- l'opacité globale et le background restent sur le root.

## 2.4 Transformation d'une définition

Extraire le calcul actuel dans une fonction pure :

```ts
definitionTransformStyle(anchorCamera, liveCamera)
```

Elle doit reprendre exactement la formule actuelle :

```ts
anchorScale = worldScaleAtZoom(anchor.zoom)
currentScale = worldScaleAtZoom(current.zoom)
ratio = currentScale / anchorScale
translateX = (anchor.centerWorldX - current.centerWorldX) * currentScale
  + (1 - ratio) * current.viewportWidthCssPx / 2
translateY = (anchor.centerWorldY - current.centerWorldY) * currentScale
  + (1 - ratio) * current.viewportHeightCssPx / 2
```

La sous-couche commitée utilise toujours `committedDefinition.anchorCamera`. La pending peut utiliser son propre anchor pour l'audit, mais reste invisible.

Si viewport CSS ou DPR change, ne pas appliquer une transformation approximative : reconstruire/réancrer la définition comme le fait le code actuel.

## 2.5 Bootstrap initial

Ne pas introduire un écran vide plus long au premier chargement.

Comportement recommandé :

- la toute première définition devient la définition commitée de bootstrap ;
- ses images peuvent apparaître progressivement comme aujourd'hui ;
- dès qu'une définition commitée existe, toutes les substitutions suivantes deviennent transactionnelles ;
- le rapport indique si une définition est `bootstrap` ou `atomic` afin que le test ne confonde pas les deux.

Une alternative consistant à attendre toutes les tuiles initiales est acceptable uniquement si elle ne régresse pas visuellement le cold start ; elle n'est pas demandée ici.

## 2.6 Création d'une pending

Lorsqu'une nouvelle liste `desiredTiles` arrive :

1. calculer sa signature ;
2. si aucune définition commitée n'existe, appliquer le bootstrap ;
3. si la signature égale la commitée, réancrer/reprojeter les positions avec les mêmes identités, sans pending et sans nouveau chargement ;
4. si la signature égale la pending, mettre à jour son `anchorCamera` et ses positions sans réinitialiser les états décodés ;
5. sinon incrémenter un token monotone ;
6. marquer l'ancienne pending comme supersédée dans les métriques ;
7. créer la nouvelle pending ;
8. définir `requiredKeys` avec les tuiles `priority === "visible"` ;
9. monter ses images dans la sous-couche invisible ;
10. conserver la commitée sans modification visible.

Il ne doit jamais exister plus d'une pending dans l'état Vue.

## 2.7 Chargement et décodage

Le simple événement `load` n'est pas une preuve de décodage. Pour chaque image pending :

1. recevoir le `token` et le `tile.id` dans le handler ;
2. vérifier que `pendingDefinition.token === token` ;
3. appeler `image.decode()` lorsqu'il existe ;
4. si `decode()` réussit, passer l'entrée à `decoded` ;
5. si `decode()` n'existe pas, considérer le `load` comme prêt ;
6. si `decode()` rejette ou si `error` arrive, passer à `error` ;
7. après chaque transition, revérifier le token avant toute écriture ;
8. ne jamais réutiliser un callback d'une définition supersédée.

La logique de `DetailedLineMapPicker.preloadMapTile()` peut inspirer le traitement des timeouts et de `image.complete`, mais le basemap transactionnel possède déjà les vrais éléments `img`. Ne pas charger chaque URL deux fois avec un `new Image()` plus un second élément DOM si la sous-couche pending peut assurer chargement et décodage elle-même.

## 2.8 Condition et moment du commit

Une pending est prête lorsque :

- chaque `requiredKey` existe encore dans la pending courante ;
- chaque entrée requise est `decoded` ;
- aucune entrée requise n'est `error` ;
- son token est toujours courant.

Quand ces conditions deviennent vraies :

1. programmer au plus un `requestAnimationFrame` de commit ;
2. dans le callback, revérifier token et readiness ;
3. affecter l'ancienne pending à `committedDefinition` ;
4. supprimer `pendingDefinition` dans la même mise à jour logique ;
5. incrémenter `committedDefinitionChanges` ;
6. enregistrer la latence préparation → commit ;
7. laisser les overscan non décodées continuer à se charger dans la nouvelle commitée ;
8. retirer l'ancienne commitée sans transition.

`commitsBeforeReady` doit rester structurellement égal à zéro. Il s'agit d'un invariant, pas d'un compteur dont une petite valeur serait tolérée.

## 2.9 Supersession et dernière cible gagnante

Les mises à jour de `tileRefreshCamera` peuvent arriver plusieurs fois pendant un geste. Le basemap doit coalescer ainsi :

- une seule pending est représentée ;
- une caméra produisant la même signature met seulement à jour l'ancre et les positions ;
- une caméra produisant une signature différente remplace la pending ;
- la définition remplacée augmente `supersededDefinitions` ;
- ses callbacks tardifs sont ignorés par comparaison de token ;
- une définition supersédée ne peut jamais être commitée, même si son dernier `decode()` se résout après la nouvelle ;
- la fin du geste force immédiatement l'évaluation de la caméra finale ;
- la définition finale gagne toujours.

Ne pas modifier `maxRefreshesPerGesture` dans le premier patch. Mesurer d'abord `desiredDefinitionChanges`, `supersededDefinitions` et les signatures. Si plusieurs refreshes successifs produisent la même signature, la réutilisation de pending suffit. Si plusieurs niveaux XYZ sont réellement demandés, l'étape suivante éventuelle pourra réduire le nombre de refreshes, mais elle doit faire l'objet d'une mesure séparée.

## 2.10 Échec, timeout, offline et retry

Pour une tuile `visible` en erreur :

- ne pas commiter la pending ;
- conserver la commitée ;
- incrémenter `visibleTileErrors` ;
- ne pas boucler en retry par frame ;
- permettre une nouvelle tentative lors d'une nouvelle définition, d'un événement `online` ou du settle final ;
- limiter tout retry automatique à une tentative par signature et par transition offline → online.

Pour une tuile `overscan` en erreur :

- ne pas bloquer le commit des tuiles visibles ;
- conserver son état d'erreur observable ;
- ne pas la rendre opaque.

À `offline` :

- annuler logiquement la pending en incrémentant le token ;
- garder la commitée déjà chargée si elle peut peindre ;
- ne pas supprimer les pixels valides uniquement parce que `navigator.onLine` devient faux.

À `online` :

- reconstruire au plus une pending correspondant à la dernière caméra demandée.

À `onBeforeUnmount` :

- invalider le token ;
- annuler le RAF de commit et tout timeout debug ;
- vider committed/pending ;
- retirer les listeners online/offline existants.

## 2.11 Budget mémoire et DOM

Ne pas laisser la transaction contourner les budgets existants.

Avec `highZoomMaxTiles = 128` :

- commitée + pending ne doivent pas dépasser 256 images dans le cas normal ;
- `maxMountedTiles` doit être reporté ;
- les définitions supersédées doivent être démontées immédiatement ;
- aucune Map globale ne doit retenir les anciennes définitions ;
- `linePreloadTileCache` ne doit pas être utilisé par ce correctif ;
- `preloadActiveLineTiles` reste faux.

## 2.12 Tests DOM obligatoires

Réécrire/compléter `tests/transportMapBasemap.dom.test.ts` avec un contrôle déterministe de `HTMLImageElement.decode`.

### Test A — pas de commit partiel

1. monter une caméra initiale ;
2. rendre la bootstrap entièrement chargée ;
3. changer vers un zoom produisant une autre signature ;
4. constater une commitée visible et une pending invisible ;
5. résoudre toutes les tuiles requises sauf une ;
6. vérifier que la signature commitée n'a pas changé ;
7. résoudre la dernière ;
8. exécuter le RAF de commit ;
9. vérifier que la signature commitée change exactement une fois ;
10. vérifier que l'ancienne sous-couche disparaît ;
11. vérifier qu'aucune frame observée n'a deux définitions visibles.

### Test B — supersession

1. créer pending A ;
2. avant sa fin, demander pending B d'une autre signature ;
3. résoudre tous les callbacks de A ;
4. vérifier qu'A ne committe pas ;
5. résoudre B ;
6. vérifier que seule B committe ;
7. vérifier `supersededDefinitions === 1` et `commitsBeforeReady === 0`.

### Test C — erreur visible

1. créer une pending ;
2. déclencher l'erreur d'une tuile requise ;
3. résoudre toutes les autres ;
4. vérifier que la commitée précédente reste visible ;
5. vérifier que la pending n'est pas commitée ;
6. vérifier le compteur d'erreur.

### Test D — erreur overscan

1. faire échouer uniquement une overscan ;
2. décoder toutes les visibles ;
3. vérifier que le commit a lieu ;
4. vérifier que l'overscan en erreur reste invisible.

### Test E — même signature, nouvelle caméra

1. créer une commitée ;
2. modifier légèrement centre/zoom sans changer les IDs XYZ ;
3. vérifier qu'aucune pending réseau n'est créée ;
4. vérifier que les positions/ancre sont mises à jour ;
5. vérifier qu'aucune URL n'est rechargée.

### Test F — transformation ancrée sur la commitée

1. commitée caméra A ;
2. live caméra B ;
3. pending caméra C ;
4. vérifier que le style visible correspond à `A → B`, pas `C → B` ;
5. commiter C ;
6. vérifier que le style correspond désormais à `C → B`.

### Test G — cleanup

1. créer une pending et un RAF de commit ;
2. démonter ;
3. résoudre les Promises restantes ;
4. vérifier qu'aucun état et aucun callback n'est appliqué après unmount.

## 2.13 Limite honnête du correctif 2

Une transaction atomique élimine les définitions partiellement visibles et le churn de commit. Elle ne peut pas garantir une carte parfaite pendant une panne réseau arbitrairement longue si l'ancienne définition, une fois fortement réduite, ne couvre plus le viewport élargi.

Le gate de couverture ci-dessous utilise un retard reproductible de 150 ms. Si `coverageGapFrames` reste supérieur à zéro après le correctif 2 :

- ne pas masquer le trou avec une couleur trompeuse ;
- ne pas déclarer le correctif réussi visuellement ;
- documenter que le correctif 3, cover borné à un niveau source fixe, est nécessaire ;
- ne pas activer le preload pyramidal existant.

Cette règle empêche de revendiquer à tort que l'atomicité seule résout toute latence réseau.

---

# Protocole de test fiable

## 3.1 Batterie statique après chaque phase

Exécuter sous Windows :

```powershell
npm.cmd run test -- tests/transportMapRendererCache.test.ts tests/transportMapBasemap.dom.test.ts tests/transportMapPerformance.test.ts tests/globalTransportPlan.dom.test.ts
npm.cmd run tsc
```

Après les deux correctifs :

```powershell
npm.cmd run test:map
npm.cmd run bench:map
npm.cmd run test
```

`bench:map` mesure surtout loader/viewport et n'est pas une preuve de fluidité du geste. Il sert uniquement à détecter une régression collatérale.

Ne pas lancer les tests live IDFM sans demande et sans variables prévues.

## 3.2 Démarrer le live

```powershell
npm.cmd run dev
```

URL performance :

```text
http://localhost:3000/map?line=line:IDFM:C01384&mergeDirections=0&mapDebug=1&mapPerfScenario=selected-line-wheel&mapPerfMode=performance
```

URL couverture :

```text
http://localhost:3000/map?line=line:IDFM:C01384&mergeDirections=0&mapDebug=1&mapPerfScenario=selected-line-wheel&mapPerfMode=coverage&mapTileDebugDelayMs=150
```

Utiliser exactement le même viewport, recommandé `1400 × 900`, et le même DPR pour baseline et candidat. Ne pas redimensionner la fenêtre entre les runs.

## 3.3 Ordre des mesures

Suivre cet ordre :

1. instrumentation seule, sans correctif : tests ;
2. instrumentation seule : six rapports performance baseline ;
3. instrumentation seule : trois rapports coverage baseline ;
4. appliquer uniquement le correctif 1 ;
5. tests renderer/probe ;
6. six rapports performance fix 1 ;
7. vérifier les compteurs causaux ;
8. appliquer uniquement le correctif 2 ;
9. tests basemap/probe ;
10. trois rapports coverage fix 2 ;
11. six rapports performance fix 1+2 ;
12. tests complets ;
13. contrôle Android si disponible.

Ne pas appliquer 1 et 2 simultanément avant d'avoir enregistré le résultat intermédiaire du 1. Sinon il devient impossible d'attribuer le gain.

## 3.4 Validité d'un run

Un run est invalide, et ne doit pas entrer dans la médiane, si l'une des conditions suivantes est vraie :

- mauvaise ligne active ;
- `activeLineFrames / interactivePresentedFrames < 0.95` ;
- aucun path ou aucune station dans une frame mesurée ;
- nombre d'événements différent du scénario ;
- différence zoom final/initial supérieure à `0.02` après l'aller-retour ;
- interaction non terminée au timeout ;
- erreur de tuile réseau en mode performance ;
- changement de viewport ou DPR ;
- onglet passé en arrière-plan ;
- DevTools ou audit coverage actif pendant le benchmark performance ;
- garbage collection forcée au milieu d'un run ;
- V1 contrôle variant de plus de 10 % dans la session ;
- rapport manquant ou JSON incomplet.

Ne pas supprimer statistiquement un run lent valide. Seuls les runs invalides par précondition objective sont exclus.

## 3.5 Gates correctness avant performance

Le candidat doit d'abord satisfaire :

- tests unitaires/DOM verts ;
- même fingerprint de scène ;
- même caméra finale ;
- même ligne, stations et paths ;
- `commitsBeforeReady === 0` ;
- aucune définition supersédée commitée ;
- une seule définition visible à chaque sample ;
- niveau source final correct ;
- `maxMountedTiles <= 256` dans le scénario ligne 14 ;
- aucune différence stable significative sur la ligne/stations/labels ;
- `coverageGapFrames === 0` dans le scénario retardé de 150 ms, ou conclusion explicite que le cover du correctif 3 est encore requis.

Une baisse du p95 avec échec de l'un de ces gates est une régression, pas une optimisation.

## 3.6 Comparaison des screenshots stables

Comparer uniquement des états settled, jamais deux instants arbitraires au milieu d'une animation.

Captures requises :

- caméra initiale ligne 14 ;
- caméra dézoomée et settled ;
- caméra revenue et settled.

Masquer uniquement les éléments réellement temporels du debug dans les deux variantes. Ne pas masquer la carte, les labels ou les tuiles.

Tolérance recommandée :

- dimensions identiques ;
- moins de `0.2 %` de pixels différents au-delà d'un delta RGB de 12 ;
- aucune différence structurelle continue le long du tracé ;
- aucun rectangle de basemap vide ;
- aucune double étiquette Carto produite par deux définitions visibles.

La comparaison pixel ne remplace pas l'audit de couverture, car l'antialiasing et le réseau peuvent introduire du bruit. Les deux contrôles doivent être concordants.

## 3.7 Règles de conclusion

### Autorisé

- « La copie plein-canvas a été supprimée : 0 capture et 0 octet copié pendant les frames focalisées. »
- « Le renderer p95 a baissé de X % sur la médiane de six runs valides. »
- « Les définitions de tuiles ne sont plus exposées partiellement et aucun commit obsolète n'a été observé. »
- « Le scénario retardé n'a produit aucune frame avec trou de couverture. »

### Interdit

- « C'est plus fluide » sur la base d'un seul essai manuel ;
- comparer une baseline cold à un candidat warm ;
- comparer un run avec la ligne active à un run où elle a disparu ;
- utiliser uniquement `medianFrameTimeMs` ;
- ignorer `presentedFrameRatio`, p95, p99 et frames longues ;
- conclure à partir de `lastRenderer.renderMs` ;
- exécuter l'audit DOM de couverture dans le run performance ;
- prendre le meilleur run et jeter les autres ;
- considérer un écran beige sans tuiles comme une frame rapide valide ;
- réduire les labels ou la qualité pour franchir le gate ;
- assouplir les seuils après observation des résultats.

## 3.8 Contrôle Android/WebView

Si un appareil Android de référence est disponible, terminer par :

```powershell
npm.cmd run bench:map:android
npm.cmd run replay:map:android
npm.cmd run replay:map:android:gfxinfo
```

Le replay Android existant devra être adapté pour ouvrir l'URL ligne 14/scénario si nécessaire. Conserver séparément :

- rapport page instrumenté ;
- `dumpsys gfxinfo framestats` ;
- mémoire ;
- runs cold et warm.

Un AVD peut révéler une régression, mais ne prouve pas le gate final de l'appareil de référence. Ne pas déclarer la validation Android terminée avec un AVD uniquement.

---

# Checklist finale de l'implémenteur

## Instrumentation

- [ ] Les métriques par frame distinguent blit principal et capture du cache.
- [ ] Le probe agrège renderer p50/p95, captures, temps et octets.
- [ ] Le scénario live vérifie ligne, scène, caméra, inputs et frames.
- [ ] Performance et coverage sont deux modes séparés.
- [ ] L'audit coverage est testé comme fonction pure.
- [ ] La baseline brute a été sauvegardée avant optimisation.

## Correctif 1

- [ ] Le redraw focalisé reste exact.
- [ ] `cacheContext.drawImage` n'est jamais appelé pendant ce redraw.
- [ ] La frame stable suivante capture exactement une fois.
- [ ] Le chemin cache du réseau global n'a pas régressé.
- [ ] Les tests vérifient le contexte de cache, pas uniquement le principal.

## Correctif 2

- [ ] État `committedDefinition` séparé de `pendingDefinition`.
- [ ] Une seule pending.
- [ ] Pending invisible mais chargeable/décodable.
- [ ] Commit uniquement après décodage des tuiles visibles.
- [ ] Token de supersession vérifié dans chaque callback et dans le RAF.
- [ ] Même signature = réancrage, pas rechargement.
- [ ] Transform visible basé sur la caméra commitée.
- [ ] Erreur visible = ancien commit conservé.
- [ ] Overscan en erreur ne bloque pas les tuiles visibles.
- [ ] Cleanup invalide tokens, RAF et timers.
- [ ] DOM total borné.
- [ ] `preloadActiveLineTiles` reste faux.

## Validation

- [ ] Tests ciblés verts.
- [ ] Typecheck vert.
- [ ] `test:map` vert.
- [ ] Suite complète verte.
- [ ] Six runs baseline et six candidat, aucun cherry-picking.
- [ ] Contrôle V1 stable.
- [ ] Gates correctness satisfaits avant lecture des performances.
- [ ] Si aucun gain p95 n'est démontré, la conclusion le dit explicitement.
- [ ] Si coverage reste imparfaite, le besoin du cover borné est déclaré.

---

# Prompt condensé prêt à donner à Luna Max

Implémente strictement `docs/global-transport-plan/SELECTED_LINE_ZOOM_FIXES_1_2_IMPLEMENTATION.md` dans l'ordre. Commence par l'instrumentation comportementalement neutre et enregistre une baseline live avant de modifier le renderer. Applique ensuite uniquement le correctif 1, teste et mesure, puis uniquement le correctif 2. Ne touche pas à la géométrie, aux chunks, au scheduler, aux labels, aux paramètres de zoom ni à `preloadActiveLineTiles`. Utilise `apply_patch`, préserve tous les changements utilisateur existants et exécute les commandes Windows indiquées. Ne revendique jamais un gain si les compteurs causaux, les fingerprints de scénario, la couverture, le nombre de frames et les screenshots settled ne passent pas. Si l'atomic swap ne donne pas zéro gap sous 150 ms de retard déterministe, arrête-toi et conclus honnêtement que le cover borné du correctif 3 est requis ; n'active pas le preload pyramidal.
