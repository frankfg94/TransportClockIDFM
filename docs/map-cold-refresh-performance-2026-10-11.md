# /map — diagnostic de chargement après rafraîchissement complet

## État après reprise du 11 octobre, après-midi

La correction active combine maintenant :

- Préprojection Mercator en Float64 au niveau des adaptateurs Deck, avec cache
  faible par géométrie. Les données géographiques et le hit-test restent dans
  leur format d'origine ; seuls les attributs transmis au GPU changent de repère.
- `FlatMapPathLayer` / `FlatMapScatterplotLayer` gardent les shaders Deck mais
  spécialisent leur projection pour la carte plane, sans matrice de modèle ni
  billboard. Les calculs géographiques/globe inutiles disparaissent à la
  compilation. Les offsets haute précision aux forts zooms restent actifs.
- La préparation asynchrone des programmes est désormais activée par défaut.
  Elle attend réellement la fin de liaison avant toute introspection luma.
  Les variantes connues sont réutilisées sans réassemblage à chaque sélection.
- MSAA reste conforme au réglage de l'utilisateur. Son retrait temporaire
  semblait favorable, mais le contrôle avec MSAA rétabli était aussi rapide :
  le cache expliquait cette différence, pas une preuve contre l'anticrénelage.

La pause de plusieurs centaines de millisecondes est fortement réduite, mais
**zéro micro-lag n'est pas acquis**. Le test renforcé à source GLSL renouvelée
mesure 309 ms avec les anciens shaders et 36,3 ms avec la dernière variante.
Les fences correspondantes sont 306,5 et 50,5 ms. Les compilations MapLibre et
le montage initial Vue restent visibles avant les lignes.

Le mode renforcé s'arme par `requestColdRefresh({ isolateShaderCache: true })`.
Il renomme une variable GLSL interne par document sans changer les calculs,
attributs ou bindings. Il évite la réutilisation de la même source compilée ;
il ne prétend pas purger tous les caches internes du pilote. Le bouton normal
garde ce mode désactivé. Tous les essais utilisent un document et un contexte
WebGL neufs, au premier plan, sans tests/typecheck en concurrence.

### Nouvelles mesures conservées

| Essai | Configuration | RAF max global | Fence GPU |
|---|---|---:|---:|
| 09 | Témoin original standard | 412,0 ms | 297,3 ms |
| 10 | Contrôle sans MSAA | 84,8 ms | 15,3 ms |
| 11 | Répétition sans MSAA | 72,6 ms | 54,6 ms |
| 12 | MSAA rétabli | 72,7 ms | 25,6 ms |
| 13 | Spécialisation LNGLAT plane | 169,6 ms | mesure prématurée, voir limite ci-dessous |
| 14 | Préprojection, liaison standard | 127,1 ms | 61,0 ms |
| 15 | Préprojection + liaison asynchrone | 72,7 ms | 14,8 ms |
| 16 | Même variante, source GLSL renouvelée | 78,8 ms | 69,4 ms |
| 17 | Anciens shaders, async + source renouvelée | 309,0 ms | 306,5 ms |
| 18 | Préprojection, matrice identité/unités fixes, async + source renouvelée | 84,8 ms | 50,5 ms |
| 19 | Version finale, bouton normal | 96,8 ms | 54,4 ms |
| 20 | Version finale, répétition normale | 54,5 ms | 15,2 ms |
| 21 | Version finale, troisième répétition normale | 84,8 ms | 54,6 ms |

Après le premier dessin, le maximum mesuré est 54,4 ms dans 16 et 36,3 ms dans
18. Le pic 309 ms de 17 traverse l'instant du premier dessin ; environ 306,7 ms
de cet intervalle se situent après celui-ci. Le rapport conserve cet intervalle
partiel et les intervalles complets, pour ne pas faire disparaître le pire pic
par un découpage de phases.

### Trois rafraîchissements finaux sans modification entre les captures

| Essai | RAF max après premier dessin | Micro-saccades après dessin | Erreurs |
|---|---:|---:|---:|
| 19 | 42,4 ms | 2 | 0 |
| 20 | 12,2 ms | 2 | 0 |
| 21 | 42,4 ms | 4 | 0 |

Ces trois documents sont de vrais reloads, visibles au premier plan, avec
préparation asynchrone active et isolation de source désactivée. Le seuil de
micro-saccade est 9,15 ms pour une cadence médiane de 6,1 ms sur cet écran.
Les pics de 42,4 ms sont corrélés à la fence GPU, sans travail principal mesuré
et avec des timers réactifs. Les autres intervalles de 12,1–12,2 ms restent
non attribués ; le rapport ne leur invente pas une cause.

Les pics précédant les lignes restent entre 54,5 et 96,8 ms. L'évaluation
globale conserve donc `accepted: false`. Après environ 45 minutes et 13 nouveaux
rafraîchissements complets, les modifications et les 21 rapports sont conservés
pour la suite. La réduction est mesurée ; l'absence totale de micro-lag ne l'est
pas. Capture finale du bouton et du téléchargement :
`reports/performance/cold-refresh-final-proof.jpg`.

### Fiabilité du rapport et validation

Depuis 14, le signal de premier rendu attend une **vraie commande GL de dessin**
d'un programme Path/Scatterplot. `onAfterRender` seul peut être appelé par Deck
sans dessiner les nouvelles couches : notamment la fence de 13 était prématurée.
Le schéma v3 fournit le GPU/contexte, les empreintes des sources, les phases
traversées, le temps CPU mesuré sans additionner les spans emboîtés, les timers,
la fence et la fenêtre `afterTransportDraw`. Les pauses sans preuve restent
non attribuées. La durée du premier intervalle est conservée même s'il traverse
la frontière avant/après dessin.

37 tests ciblés passent (préparation, publication, précision aux zooms 4–20,
alternance object/binary et datasource). La suite des paquets a 18 succès et
2 échecs déjà reproduits avec `deckMapLayers.ts` de HEAD : fixture de label SDF
et publication après mouvement. Ils n'ont pas été masqués. Typecheck et
`git diff --check` passent. Vérification navigateur : sélection de la ligne 1,
chargement de ses 25 stations, zoom jusqu'à 17,3 sans décalage apparent ; capture
`reports/performance/cold-refresh-detail-proof.jpg`.

Les classes spécialisées et le hook luma doivent être revérifiés lors d'une
mise à jour Deck/luma. Un changement des props qui influent sur la variante
recrée le modèle. Les unités, extensions de pointillés, couleurs et géométries
restent pilotées par les données existantes.

## Historique de la première session

## Reprendre le travail

Ouvrir `http://localhost:3000/map`, ouvrir **Avancé** en haut à droite et cliquer
**Test chargement à froid**. Le bouton arme un diagnostic dans sessionStorage,
puis appelle `location.reload()`. Il ne simule aucune interaction. Le rapport
JSON apparaît et devient téléchargeable après 15 secondes de capture.

Vérifier `navigation.fullDocumentReload`, `diagnostics.measurement`,
`assessment.accepted`, `origins.stutters`, `origins.webgl`,
`origins.longAnimationFrames`, `origins.gpuCompletion` et `trace.eventAggregates`.
`status: completed` signifie capture terminée, pas absence de lag.

Ne pas mesurer une mise à jour HMR. Ne pas lancer Vitest ou typecheck pendant une
capture. Conserver l'onglet visible. Le bouton réinitialise le document, Vue,
les workers et le contexte WebGL. Il ne purge pas les caches HTTP et du pilote.

## Causes observées

- Capture initiale : tâche principale de **531 ms** dans Deck ; attente
  `LINK_STATUS` de **377 ms** pour PathLayer puis **100,7 ms** pour ScatterplotLayer.
  L'extension KHR est disponible mais luma désactive sa fonction asynchrone par
  défaut. Activer cette fonction seule déplace l'attente vers l'introspection
  immédiate `ACTIVE_ATTRIBUTES` ; ce n'est pas une correction.
- Une pause RAF distincte reste après le premier rendu. Dans les essais 03/06,
  les timers 16 ms continuent normalement pendant cette pause, sans tâche longue
  JavaScript. Une fence WebGL dans le contexte partagé mesure **387,3 / 379,6 ms**
  avant achèvement des commandes GPU. Cela associe la pause à la chaîne de rendu
  sans isoler le coût du pilote, la compilation interne ou le dessin lui-même.
- MapLibre compile aussi ses propres shaders de manière synchrone : plusieurs
  attentes de 15–30 ms peuvent se cumuler dans une tâche de 85–114 ms.
- Le décodage initial a un coût CPU distinct. `decodeLineRow` appelait
  `createLinePresentation` pour chaque ligne : les couleurs étaient déjà
  officielles et les icônes produites étaient jetées. Ce travail a été supprimé.
  La normalisation française/anglaise utilise maintenant la même casse Unicode
  par défaut sans opération Intl répétée. Les géométries sont inchangées.
- Des tâches de chargement/évaluation des modules Nuxt/Vue précèdent la création
  du composant ; les entrées buffered les rapportent même si le RAF n'a pas
  encore démarré. Certaines n'ont pas d'attribution script fournie par Chromium.

## Ancienne expérience : désactivée à la fin de la première session

**Note de reprise:** cette section décrit l'état historique 01–08. Les shaders
spécialisés/préprojetés et la préparation asynchrone sont désormais activés.
Les contrôles récents 19–23 et les limites restantes sont détaillés dans
[le bilan de reprise](map-render-performance-followup-2026-10-11.md).

`deckShaderPreparation.ts` prépare les variantes Path/Scatterplot réellement
assemblées, attend `COMPLETION_STATUS_KHR` sans bloquer, puis fournit le programme
lié à la factory luma par le hook de l'instance du device. L'introspection,
les samplers, la validation et le cache de shaders sont conservés.
Le presenter protège les publications obsolètes et la destruction du composant.

Les captures avec cet adaptateur éliminent les appels GL bloquants de plusieurs
centaines de ms sur le thread JS, mais gardent **260–448 ms** de pause RAF et une
latence GPU du même ordre. Le contrôle standard a été meilleur sur un passage.
La correction n'est donc pas validée pour l'expérience normale et reste
désactivée ; il ne faut pas annoncer que le lag d'origine a disparu.

Pour relancer l'expérience dans le code, utiliser
`requestColdRefresh({ prepareDeckShaders: true })`. Le rapport v2 indique
`profile.experimentalDeckShaderPreparation`. Le bouton normal conserve `false`.
Le hook est une API interne luma et devra être revérifié à chaque changement de
version. Ce module est un point de départ expérimental, pas une solution finale.

## Rapports conservés

Les fichiers complets sont dans `reports/performance/` (répertoire ignoré par Git,
mais conservé localement pour cette reprise).

| Essai | Configuration | Pause RAF max | Fence GPU | Décodage bootstrap |
|---|---|---:|---:|---:|
| 01 | Programmes préparés, avant allègement données | 448,3 ms | non mesurée | non instrumenté |
| 02 | Icônes inutiles supprimées | 260,4 ms | non mesurée | 51,5 ms |
| 03 | Mesure GPU et normalisation palette | 369,5 ms | 387,3 ms | 39,2 ms |
| 04 | Contrôle pipeline standard | 60,5 ms | 18,6 ms | 25,9 ms |
| 05 | Adaptateur avec samplers/validation | 272,5 ms | 279,4 ms | 37,2 ms |
| 06 | Répétition adaptateur validé | 381,6 ms | 379,6 ms | 44,0 ms |
| 07 | Réutilisation ShaderFactory | 272,6 ms | 279,1 ms | 29,9 ms |
| 08 | Version finale, adaptateur expérimental désactivé | 630,0 ms | 460,6 ms | 71,4 ms |

Le test 08 est un rafraîchissement complet, au premier plan, sans événements
perdus ni erreur Deck/MapLibre. Le seuil micro-lag a été resserré à 1,5 fois
l'intervalle RAF médian (minimum 8 ms), soit 9,15 ms sur cet écran. Il recense
58 intervalles au-dessus du seuil et `assessment.accepted: false`. La tâche
de 629 ms à 4298,6 ms est toujours présente dans le pipeline standard. Il reste
donc une correction réelle à faire ; les résultats ne permettent pas de déclarer
la page fluide. L'essai 04 favorable ne suffit pas à valider une solution.

Les caches du pilote ne sont pas purgés : ces chiffres ne constituent pas un
benchmark vierge de caches. Les essais 01–05 comportaient une inversion des
arguments dans le résumé Chaos secondaire (`diagnostics.byPhase/worstFrames`).
Elle est corrigée et testée depuis 06. Leurs intervalles RAF bruts, LongTasks,
LoAF, appels GL et fences n'étaient pas concernés. Utiliser les rapports récents
pour les résumés Chaos.

## Validation et suites à examiner

26 tests ciblés passent : préparation non bloquante/annulation/erreurs, publication
asynchrone, diagnostic des durées RAF et 19 cas du datasource réel.
`npm.cmd run tsc` passe sur l'état final ; `git diff --check` ciblé passe.
`transportMapAssets.test.ts` a 10 succès et 5 échecs sur les données générées
actuelles. Les mêmes 5 échecs ont été reproduits avec le `assetLoader.ts` de HEAD
dans une copie temporaire, ensuite supprimée : palette attendue 2011 au lieu de
2026, divergence P, catalogue, Métro 4 et alias GTFS. Les données générées et ces
assertions n'ont pas été modifiées pour faire passer la suite.

Prochaines pistes : isoler la latence du contexte partagé au premier dessin avec
des mesures GPU détaillées ; comprendre pourquoi le contrôle standard peut
réutiliser les caches plus efficacement ; répartir le décodage bootstrap et le
montage Vue si leurs tâches restent au-dessus du budget d'une image. Éviter de
déplacer simplement une pause avant l'apparition des lignes ou de masquer les
résultats non attribués.
