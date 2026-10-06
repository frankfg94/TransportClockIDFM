# Chaos sélection de lignes

Sur `/map` (et `/map/legacy`), ouvrir **Avancé → Chaos sélection de lignes**. Le bouton est à côté des deux Chaos Zoom. **Arrêter le benchmark** annule l'attente en cours. Le rapport JSON est téléchargeable à la fin, y compris après annulation ou échec.

Le scénario réutilise le catalogue, la sauvegarde/restauration de Chaos extrême, `ChaosZoomDiagnostics`, le résumé des frames de Chaos Zoom et le traceur causal du rendu Deck/MapLibre. Il tire 30 lignes du catalogue chargé avec une graine versionnée, sans répétition consécutive. Le parcours réel `selectLineFromSearch` est appelé avec animation ; son callback caméra déclenche immédiatement `clearSelection`. Une seule RAF laisse appliquer cette désélection avant de sélectionner la suivante. Il n'attend pas les téléchargements de géométrie, le trafic ou les tuiles entre deux actions : leurs retards font partie de la charge testée.

La préparation charge le catalogue et active les modes disponibles. Elle est exclue de la mesure. La vue initiale (caméra, filtres, ligne/station, sélection, trafic et direction) est restaurée en sortie. Les autres scénarios Chaos sont désactivés pendant le run.

## Lecture du rapport

- `profile` : graine, version et cycles pour rejouer le même tirage sur le même catalogue.
- `calibration` : 60 intervalles RAF avant les actions ; le p20 estime la cadence de référence, sans imposer 60 Hz. Les échantillons et leur dispersion permettent de juger cette estimation.
- `frames` : intervalles bruts, offsets, index d'action, ligne et phase au terme de l'intervalle. Un intervalle peut chevaucher plusieurs phases ; utiliser les timestamps des `actions` pour l'attribution temporelle précise.
- `actions` : début, retour de sélection, callback de fin d'animation, début/retour de désélection, premier frame après désélection, métriques de chaque cycle. `deselectionDelayMs` mesure le délai réel entre callback et désélection.
- `byPhase` : les mêmes métriques de micro-saccades par phase.
- `frameMetrics` : p95/p99/max, nombre de micro-saccades (budget + max(2 ms, 15 %)), temps excédentaire, série consécutive la plus longue et estimation des vsyncs manquées.
- `diagnostics` : groupes par phase/action/zoom, timings des appels de rendu, métriques Deck, environnement et validité au premier plan.
- `trace` : événements de préparation/rendu/chunks/cache, tâches longues et Long Animation Frames avec attribution de scripts lorsque le navigateur les expose. Disponible avec le traceur Deck/MapLibre ; pas de trace causale sur le moteur legacy.

Les mesures utilisent `performance.now()` et les timestamps RAF, conservés sans arrondir les intervalles bruts. La RAF mesure la cadence d'ordonnancement du navigateur : elle ne prouve pas la présentation GPU, et un blocage plus court qu'une frame peut rester invisible. Les timings synchrones des appels et le traceur complètent ce signal. Un onglet masqué ou une calibration fortement perturbée rendent la comparaison non fiable ; consulter `measurement.foregroundComparable` et `calibration.cadenceReliable`. Ce dernier est faux si le budget estimé dépasse 50 ms ou si le ratio p90/p20 dépasse 1,5. Les estimations de vsyncs/saccades ne doivent alors pas être comparées comme des mesures de fluidité ; les timings bruts et tâches longues restent disponibles. Les métriques GPU Deck sont des fenêtres glissantes et ne doivent pas être attribuées à une seule frame.

Il n'y a ni capture d'image, ni tri de percentiles par action, ni sérialisation du rapport complet pendant les actions. Les résumés sont calculés après l'arrêt des horloges. Les actions interrompues restent dans le rapport avec leur statut. Les diagnostics ne collectent qu'au cours du run et les timers/RAF/listeners sont nettoyés en sortie. La restauration et l'export JSON sont hors mesure.

Validation ciblée : `npm.cmd test -- tests/chaosLineSelection.test.ts tests/chaosLineSelection.dom.test.ts tests/globalTransportPerformanceScenarios.test.ts tests/globalTransportPerformanceScenarios.dom.test.ts` puis `npm.cmd run tsc`.
