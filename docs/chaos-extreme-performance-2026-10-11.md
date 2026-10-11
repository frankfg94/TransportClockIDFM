# Chaos Zoom extrême — mesures du 11 octobre 2026

Le scénario termine correctement, mais il n'est pas encore suffisamment fluide
dans les grands changements de zoom avec tout le réseau. Les petits passages
autour des niveaux 14 et 17 sont nettement mieux maîtrisés.

## Protocole

Deux passages depuis le vrai bouton **Chaos Zoom extrême** sur
`http://localhost:3000/map`, chacun après un rafraîchissement complet de l'onglet.
Profil `extreme`, version 2, seed `1592598566`, 47/47 opérations accomplies dans
les deux cas. Aucune modification de code entre les passages, ni test/typecheck
en concurrence. Les corrections du chargement à froid sont actives.

Même navigateur, viewport 844 × 956 CSS px, DPR 1,25. Tous les modes actifs,
Bus et Noctilien inclus, aucune ligne sélectionnée pendant le scénario.
Anticrénelage actif, immobilier et trafic désactivés. Les captures sont restées
visibles : `foregroundComparable: true`, `hiddenDurationMs: 0`, aucune limitation
RAF détectée. Les caches HTTP et pilote ne sont pas purgés par le reload.

## Résultats

| Mesure | Passage 1 | Passage 2 |
|---|---:|---:|
| Durée mesurée | 66,84 s | 66,17 s |
| FPS moyens | 117,95 | 119,38 |
| Intervalle médian | 6,1 ms | 6,1 ms |
| p95 | 18,2 ms | 18,2 ms |
| p99 | 54,5 ms | 54,6 ms |
| Maximum | 369,6 ms | 260,5 ms |
| Intervalles > 50 ms | 121 | 123 |
| Intervalles > 100 ms | 5 | 8 |
| Intervalles > 500 ms | 0 | 0 |
| Commits manqués | 0 | 0 |
| Retour à l'état stabilisé | 305,3 ms | 308,6 ms |
| Erreurs Deck / MapLibre | 0 / 0 | 0 / 0 |

La moyenne élevée masque environ 1,8 pause de plus de 50 ms par seconde.
`status: completed` indique la fin du scénario, pas une acceptation de fluidité.

| Phase | Pic passage 1 / 2 | Pauses > 50 ms passage 1 / 2 |
|---|---:|---:|
| Activation de tout le réseau | 369,6 / 260,5 ms | 2 / 2 |
| Allers-retours autour du zoom 11 | 133,1 / 133,2 ms | 5 / 5 |
| Paris dense | 84,8 / 103,1 ms | 4 / 2 |
| Allers-retours autour du zoom 14 | 18,2 / 18,2 ms | 0 / 0 |
| Allers-retours autour du zoom 17 | 18,3 / 18,3 ms | 0 / 0 |
| Déplacement du centre + zoom | 133,4 / 205,9 ms | 58 / 49 |
| Grands changements combinés | 72,8 / 121,1 ms | 52 / 65 |

## Coûts réellement observés

- La construction du modèle de rendu bloque pendant **132,0 / 100,2 ms** à
  l'activation. `render_model_build`, `scene_rebuild` et
  `station_visibility_rebuild` couvrent largement le même travail : ne pas
  additionner ces durées. Point de départ :
  `src/features/transport-map/render/deckgl/deckGlRenderer.ts`, appel
  `this.modelBuilder.build(camera, scene)`.
- À l'action 31 du deuxième passage, `worker_post_message` dure **122,1 ms**
  sur le thread principal, avec 2 235 104 octets transférés. Le pic RAF est
  205,9 ms, dont 167,3 ms couverts par les spans CPU instrumentés. La trace
  encadre `worker.postMessage(...)` dans
  `src/features/transport-map/workers/workerPool.ts`. Elle ne permet pas de
  séparer précisément sérialisation, allocation, collecte mémoire et coût
  interne du navigateur pendant cet appel.
- Le deuxième passage termine avec 626 constructions de paquets de base,
  611 évictions et environ **2,03 Go cumulés** de paquets compilés, pour
  environ 66 Mo présents dans le cache à cet instant. Ce sont des compteurs
  depuis le montage, incluant les quelques paquets initiaux, et non 2 Go
  simultanément retenus. La reconstruction et le renouvellement des paquets
  constituent une piste prioritaire avant une nouvelle optimisation des shaders.
- Certaines pauses restent non attribuées, notamment environ 133 ms autour
  du zoom 11. Les tags `BINARY_REBUILD`, `BASEMAP_LOADING`, etc. incluent des
  corrélations temporelles : ils ne prouvent pas à eux seuls une causalité.

## Limites du rapport à conserver pour la suite

- L'agrégat `binary_compile` est marqué `main-thread-span` par le classificateur
  global alors que les événements observés ont `metadata.execution: worker`.
  Ses ~26 s cumulées sont du temps écoulé de tâches asynchrones, pas 26 s de
  CPU principal. L'attribution des pics tient déjà compte du champ `execution`.
  Il faudra corriger ce libellé agrégé avant de l'utiliser automatiquement.
- `expectedFrameCount` / `deliveredFrameRatio` utilisent 60 Hz. La médiane
  observée de 6,1 ms correspond à environ 164 Hz ; un ratio égal à 1 ne prouve
  donc pas que toutes les images attendues ont été livrées sur cet écran.
- 1 432 / 1 659 événements détaillés ont été évincés du buffer borné.
  Les statistiques globales restent conservées. Les JSON exportés font
  environ 63 / 53 Mo ; le coût du diagnostic mérite lui aussi une mesure.
- Le tas JS atteint environ 1,40 / 1,36 Go pendant ces captures. Données,
  caches et instrumentation contribuent à cette valeur ; ce test seul ne
  démontre pas une fuite mémoire.
- La caméra `restoredCamera` vaut 10,6 alors que `initialCamera` vaut 8,83 :
  le scénario restaure son point de départ après recentrage, pas exactement
  la caméra antérieure au clic. Les six réseaux initiaux sont bien rétablis.
- MapLibre n'expose ici aucune mesure de couverture des pixels : les champs
  d'absence de trou visuel ne constituent pas une preuve par capture.

## Artefacts locaux

- `reports/performance/chaos-extreme-2026-10-11-01.json`
- `reports/performance/chaos-extreme-2026-10-11-02.json`
- `reports/performance/chaos-extreme-2026-10-11-proof.jpg`

Le répertoire de rapports est ignoré par Git et conservé localement. Cette
première session établit le diagnostic. La reprise suivante modifie le moteur
et documente tous les essais 03–09 dans
[le bilan de reprise](map-render-performance-followup-2026-10-11.md).
Les pauses diminuent, mais le cold refresh conserve un micro-lag de 42,4 ms;
la fluidité complète n'est pas validée.
