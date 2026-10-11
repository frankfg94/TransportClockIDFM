# Reprise des performances du plan global — 11 octobre 2026

> Checkpoint des captures 01–09 et cold refresh 22/23. La reprise suivante,
> ses corrections et les mesures avec un budget explicite de 120 fps sont dans
> [map-120fps-performance-2026-10-11.md](map-120fps-performance-2026-10-11.md).

Le rendu continu ferré est conservé. Les corrections diminuent fortement le
travail CPU pendant Chaos Extrême, mais **zéro micro-lag n'est pas atteint**.
Deux nouveaux rechargements complets conservent chacun une pause RAF de
42,4 ms après le premier dessin des transports. Le code et toutes les captures
restent disponibles pour poursuivre l'analyse.

## Protocole et état conservé

- Navigateur intégré, `http://localhost:3000/map`, serveur Nuxt de développement.
- Chaque essai commence par un nouveau document, pas par une navigation SPA
  ou un simple HMR. Les rapports froids 22/23 confirment `navigation.type: reload`.
- Chaos Extrême v2, seed 1592598566, 47/47 opérations, huit modes actifs pendant
  la séquence, aucune ligne sélectionnée, même viewport 844 × 956 CSS, DPR 1,25.
- `continuousRail: true`, `progressiveBus: false`, anti-aliasing activé,
  immobilier/trafic désactivés. Le témoin 04 désactive seulement le rendu ferré;
  ce réglage est ensuite rétabli et vérifié dans les captures finales.
- Le diagnostic froid confirme ANGLE/NVIDIA RTX 3060 Ti, Direct3D11 et
  `powerPreference: high-performance`.
- Aucune capture de cette reprise n'est cachée pendant la mesure. Les caches
  HTTP et du pilote restent gérés par le navigateur; le bouton ne les purge pas.
- Pas de compilation TypeScript, tests ou édition de sources pendant les runs.

## Ce qui a été retrouvé dans l'historique

Le 1er octobre, les géométries ferrées complètes et le chargement anticipé des
bus ont été séparés. Les valeurs actuelles respectent la demande initiale:
ferré continu actif, BUS/Noctilien progressifs inactifs.

Le commit `35a844f08` du 6 octobre ajoute l'arrondi de toutes les lignes de métro
et de la ligne sélectionnée, calculé par quart de zoom. Le zoom arrondi entre
alors dans la clé du paquet de base complet. Le cache de coordonnées arrondies
ne conserve qu'un seul zoom par source. Ainsi, une modification de quelques
courbes de métro invalide aussi le paquet contenant les milliers de tracés de
bus. Revenir au zoom précédent recrée des données déjà préparées.

La compilation est bien asynchrone dans le worker. En revanche, préparer le
payload et `worker.postMessage(...)` occupent le thread principal. L'ancien
payload transporte encore des objets et tableaux de couleurs par tracé, en plus
du buffer de coordonnées transféré.

Le graphe Graphify existant a été interrogé avec un budget DFS de 1 800 tokens;
il indique les contrats scène/datasource/composant, mais ne couvre pas les
nouveaux détails du préparateur Deck. Les conclusions ci-dessus sont vérifiées
dans les sources, le diff historique et les traces, pas déduites de liens absents
du graphe. Ce budget est celui de la requête, pas une consommation LLM mesurée.

## Corrections conservées

1. `transportMapRenderModel.ts`: cache borné des bundles et variantes de zoom,
   identités des paquets liées aux tableaux effectivement réutilisés, mise à
   jour des seuls indices de courbes lorsque le zoom change. Les tracés routiers
   conservent leurs objets et leur ordre. Les sources de stations restent dans
   la dépendance: les ancres peuvent changer sans invalider les paquets si le
   contenu des records reste identique après vérification.
2. Les records non arrondis restent stables. Les courbes utilisent toujours
   exactement `roundTransportMapPositions`, avec les mêmes options/samples.
   Les couleurs ne sont plus analysées avant un cache hit; les couleurs communes
   sont partagées et les caches highlight/traffic ne sont créés que si utilisés.
   Les caches de bundles et courbes ont chacun un budget estimé de 32 MiB;
   les bundles sont aussi limités à 32 entrées, les couleurs à 4 096.
3. `deckPathPacket.ts`: coordonnées, indices et styles numériques par tracé
   partagent un seul buffer possédé par le payload. Les sources ne sont jamais
   détachées. Le worker étend les attributs par sommet. Un test compare le résultat
   exact avec l'ancien compilateur, y compris opacité, Float32 et pointillés.
4. Le rapport expose les paramètres ferré/bus, le nombre de chemins parcourus,
   records créés, couleurs analysées, courbes calculées/réutilisées et leurs
   durées. `binary_compile_dispatch` mesure la partie synchrone de préparation/
   envoi. `binary_compile` exécuté dans le worker est désormais correctement
   classé `async-wall-time` dans les agrégats, comme il l'était déjà dans
   l'attribution individuelle des pics. Les spans imbriqués ne s'additionnent pas.

Les shaders spécialisés/préprojetés et leur préparation asynchrone issus de la
reprise précédente restent activés. Le rendu continu, les géométries source,
les couleurs, les pointillés et l'anti-aliasing ne sont pas dégradés.

## Tous les essais Chaos conservés

Les compteurs de modèle/paquets sont cumulatifs depuis le montage et incluent
quelques frames avant le début de la séquence. Le percentile et les pauses
viennent des intervalles RAF du scénario. `completed` ne signifie pas fluide.

| Capture | Version | P99 RAF | Pic RAF | Frames > 50 ms | Modèle cumulé |
|---|---|---:|---:|---:|---:|
| 01 | Référence | 54,5 ms | 369,6 ms | 121 | 9 793,0 ms |
| 02 | Référence répétée | 54,6 ms | 260,5 ms | 123 | 9 182,5 ms |
| 03 | Premier cache seul, insuffisant | 66,7 ms | 351,3 ms | 243 | 12 489,9 ms |
| 04 | Même cache, témoin ferré continu OFF | 60,5 ms | 296,8 ms | 146 | 6 808,9 ms |
| 05 | Mise à jour des courbes seule | 42,4 ms | 472,5 ms | 52 | 1 421,1 ms |
| 06 | Payload compact | 30,3 ms | 351,4 ms | 27 | 1 228,9 ms |
| 07 | Allocations/couleurs réduites | 30,3 ms | 302,9 ms | 29 | 1 177,4 ms |
| 08 | Même code, passage irrégulier conservé | 48,4 ms | 405,8 ms | 72 | 1 628,4 ms |
| 09 | Même code, outil vidé de ses gros JSON | 30,3 ms | 284,7 ms | 28 | 1 157,7 ms |

Le témoin 03/04 montre que les géométries complètes augmentent le travail dans
la version intermédiaire. Désactiver le rendu continu ne suffit pas à supprimer
les pauses. Les références 01/02 sont celles mesurées avant les corrections;
elles ne sont pas comparées directement au témoin modifié pour prétendre isoler
le coût de cette option.

Dans le dernier passage 09, le CPU cumulé de `render_model_build` dans la trace
est 1 453,9 ms contre 9 323,3 ms en 02. Le pic de `worker_post_message` passe
de 122,1 à 2,4 ms, son total de 2 960,2 à 350,5 ms. La préparation/envoi entière
mesurée par le nouvel événement culmine à 29,2 ms. Les gros pics globaux ne
disparaissent donc pas simplement parce que l'envoi au worker est allégé.

L'essai 08 garde un envoi de 61 ms et un dispatch de 167,7 ms. Après suppression
des gros rapports stockés dans l'outil, 09 revient à 28 pauses, mais cette seule
variation ne prouve pas que l'outil explique toutes les pauses de 08. Ne pas
écarter ce run ni annoncer un maximum systématique de 2,4 ms.

| Phase | Pic / frames > 50 ms, référence 02 | Pic / frames > 50 ms, final 09 |
|---|---:|---:|
| Activation complète | 260,5 / 2 | 284,7 / 3 |
| Frontière zoom 11 | 133,2 / 5 | 133,3 / 4 |
| Paris dense | 103,1 / 2 | 66,7 / 6 |
| Frontière zoom 14 | 18,2 / 0 | 18,2 / 0 |
| Frontière zoom 17 | 18,3 / 0 | 18,2 / 0 |
| Centre + zoom | 205,9 / 49 | 78,9 / 5 |
| Chaos combiné | 121,1 / 65 | 66,8 / 10 |

L'amélioration se concentre sur les répétitions de zoom. La première activation
et certains changements de données restent lourds. Tous les runs finaux ont
zéro erreur Deck/MapLibre et respectent l'invariant réseau complet, sans sélection.

## Cold refresh actuel: le micro-lag restant est distinct

Les deux tests de 15 s utilisent le bouton normal, sans isolation artificielle
des sources de shaders, après les corrections CPU. Les données sont les six
réseaux ferrés initiaux, pas les huit modes imposés par Chaos.

| Capture | Pic RAF après premier dessin | Micro-lags après dessin | Fence partagée |
|---|---:|---:|---:|
| 22 | 42,4 ms | 2 | 59,3 ms |
| 23 | 42,4 ms | 2 | 61,3 ms |

Pendant la pause de 42,4 ms, les timers répondent, aucun LongTask/LoAF ni span
CPU instrumenté ne recouvre le blocage, et la fence GPU est encore en attente.
Le rapport la classe `gpu-queue-delay-correlated-main-thread-responsive`.
Cela identifie une attente corrélée à la file GPU partagée, **pas** 42 ms de
calcul GPU isolé, ni la preuve d'un manque de puissance de la RTX. Polling,
ordonnancement, travail MapLibre/Deck et finalisation du pilote peuvent participer.
La seconde petite irrégularité de 12–12,1 ms reste non attribuée.

La préparation initiale de 519 records mesurée en 22 prend 20,8 ms, dont 4,2 ms
de courbes, et intervient avant le dessin. Le dispatch dure 1,6 ms; l'envoi 0,2 ms.
Ce travail CPU ne recouvre donc pas le pic post-affichage visé par l'utilisateur.
`assessment.accepted` reste faux. Le seuil micro-lag vaut 9,15 ms sur cet écran
(RAF médian 6,1 ms). Les 19/22 micro-lags globaux incluent aussi le démarrage
avant apparition des lignes; ne pas les confondre avec les deux post-affichage.

## Limites restantes et prochaine reprise

- Le paquet de base contient toujours à la fois courbes et géométries stables.
  Le run 09 compile encore 568 paquets (~1,93 Go cumulés), pour 553 évictions.
  Ce ne sont pas 1,93 Go simultanément retenus. La prochaine correction devrait
  éviter de recompacter/transférer les bus et le ferré stable pour une courbe de
  métro: paquets séparés en conservant l'ordre exact et les commits atomiques.
- La construction initiale complète reste synchrone (99,3 ms en 09). Il faut
  isoler préparation d'ancres/géométrie, conversion et records avant de choisir
  une répartition du travail, sans déplacer simplement une pause avant les lignes.
- Le premier dessin garde une attente GPU. Une reprise doit isoler cette phase
  avec les timestamps/fences déjà présents, sans attribuer automatiquement la
  fence à la compilation, et sans désactiver l'anti-aliasing pour annoncer un gain.
- `expectedFrameCount` utilise encore 60 Hz dans Chaos, alors que la médiane RAF
  est 6,1 ms. Son ratio plafonné à 1 n'est pas une preuve de fluidité à ~164 Hz.
- Le buffer détaillé a évincé 3 361 événements dans 09; les agrégats
  complets persistent, mais le rapport n'a pas l'historique détaillé de chaque
  événement perdu. Les JSON et l'instrumentation ont un coût mémoire propre.

## Validation et artefacts

57 tests ciblés passent, 1 échec SDF préexistant demeure dans
`transportMapDeckPackets.test.ts` (recherche d'une layer `transport-labels`,
non trouvée; reproduit avant cette reprise). Les nouveaux tests d'aller-retour,
ordre routier, zoom routier et équivalence du payload passent. Les assertions
existantes n'ont pas été assouplies. `npm.cmd run tsc` passe, diff ciblé sans
erreur d'espacement. Les autres modifications du checkout sont préservées.

Les fichiers complets sont sous `reports/performance/`, ignorés par Git mais
conservés localement: Chaos 01–09, cold refresh 01–23. Le fichier
`comparison-2026-10-11.json` rassemble leurs mesures essentielles sans recopier
les grosses timelines. `summarize_map_performance.py` le régénère à partir des
captures téléchargées. L'outil vidé ne conserve ensuite que les sorties compactes.
