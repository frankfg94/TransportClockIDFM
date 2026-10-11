# Plan global : reprise avec un budget de 120 fps, 11 octobre 2026

**120 fps stables ne sont pas atteints.** Les grosses pauses pendant le zoom
diminuent, mais le premier rendu garde une attente corrélée à la file GPU et
des intervalles RAF dépassent encore 8,33 ms. Les résultats moins bons restent
dans les captures ; aucune qualité de tracé n'a été réduite pour obtenir un gain.

Cette reprise poursuit le [checkpoint précédent](map-render-performance-followup-2026-10-11.md).
Les fichiers complets et le résumé JSON sont conservés dans `reports/performance/`
(ignoré par Git). Aucun commit ni push n'a été effectué.

## Protocole

- `/map` sur Nuxt en développement, navigateur intégré, RTX 3060 Ti confirmée
  par le contexte WebGL ANGLE/D3D11, anti-aliasing activé.
- Un document entièrement rechargé avant chaque essai. Le bouton froid confirme
  `navigation.type: reload`. Les caches HTTP et du pilote ne sont pas purgés.
- Chaos Extrême v2, seed 1592598566, 47 opérations, huit modes actifs pendant
  le scénario, invariant réseau complet validé, aucune ligne sélectionnée.
- Ferré continu conservé, BUS/Noctilien progressifs désactivés, trafic et
  immobilier désactivés. Retour aux six réseaux initiaux après chaque scénario.
- Aucune édition, suite de tests ou compilation TypeScript pendant les mesures.
- La cible explicite du rapport est 120 Hz : budget 8,333 ms, nombre de
  dépassements, séquence consécutive la plus longue et temps excédentaire.
  Une moyenne supérieure à 120 fps n'est pas une validation de stabilité.
- Les durées RAF décrivent la cadence du navigateur, pas une preuve de
  présentation des images par le GPU.

## Corrections réalisées

1. **Paquets de lignes indépendants.** Des lots consécutifs séparent les courbes
   dépendantes du zoom et les géométries stables, en conservant l'ordre exact de
   dessin. Un quart de zoom ne recompile plus tous les bus pour quelques courbes
   de métro. Les identités des courbes restent stables après l'éviction d'un
   bundle ; un changement de source, de style ou de largeur reste invalidant.
   La publication est atomique : aucun jeu de paquets incomplet n'est affiché.
2. **Préparation coopérative du modèle.** La construction de milliers de records
   est fractionnée avec un budget de 2 ms. Pendant cette préparation, la caméra
   continue de déplacer la dernière géométrie complète. Les données devenues
   obsolètes ne sont pas publiées. Le diagnostic distingue CPU des créneaux et
   durée asynchrone globale ; le travail n'est pas déclaré disparu.
3. **Projection dans le worker.** Les mêmes coordonnées Float64 dans l'espace
   commun de Deck sont calculées hors du thread principal. Les coordonnées
   originales restent disponibles ; le cache compte désormais aussi le buffer
   projeté, auparavant alloué dans l'adaptateur. Le premier affichage attend le
   jeu binaire complet pour éviter deux initialisations des mêmes géométries.
   Le fallback objet reste disponible en cas d'échec du compilateur.
4. **Chargement des assets volumineux.** Les traces LoAF ont identifié des tâches
   de 118,8 et 150,3 ms issues de `assetLoader.ts`. Parsing, décodage du catalogue,
   index spatial et géométries régionales passent dans le worker. Les résultats
   reviennent par lots acquittés, limités à 256 records et 4 096 sommets cumulés
   lorsque plusieurs chemins sont regroupés. Un chemin individuel plus long
   reste entier. Les LOD comptent aussi dans cette limite. Les tuiles détaillées
   utilisent ensuite la même réception fractionnée. L'assemblage reste privé
   jusqu'à la réception complète ; les relations, ancres, ruptures, couleurs et
   provenance sont préservées.
5. **Stations d'aperçu.** La classification BUS/Noctilien et le filtrage réutilisent
   leurs résultats. Des publications avec les mêmes stations conservent leur
   tableau ; une ancre réellement modifiée continue d'invalider le modèle.

Implémentation principale : `transportMapRenderModel.ts`, `deckGlRenderer.ts`,
`deckPathPacket.ts`, `deckMapLayers.ts`, `createTransportMapDataSource.ts`,
`workers/assetDecodeTasks.ts`, `workerPool.ts` et `useGlobalTransportScene.ts`.
Le graphe Graphify a été interrogé pour les dépendances ; les nouveaux détails
du pipeline ont été vérifiés directement dans les sources et les traces.

## Comparaison à résolution native identique

Les captures 09, 16 et 17 utilisent **844 × 956 CSS, DPR 1,25**,
avec le même scénario et les mêmes options de rendu.

| Mesure | 09, avant cette reprise | 16, après les corrections | 17, répétition finale |
|---|---:|---:|---:|
| P99 des intervalles RAF | 30,3 ms | 12,2 ms | 12,2 ms |
| Pic RAF | 284,7 ms | 66,6 ms | 96,9 ms |
| Frames > 50 ms | 28 | 1 | 1 |
| Dépassements de 8,333 ms | 725 / 8 137 | 786 / 8 986 | 391 / 8 933 |
| Part des frames dépassant ce budget | 8,91 % | 8,75 % | 4,38 % |
| Paquets compilés, octets cumulés | 1 931 499 708 | 141 322 272 | 180 618 520 |
| Évictions du cache binaire | 553 | 146 | 229 |

Les gros pics sont réduits ; **les petits dépassements restent variables**.
16 améliore très peu leur fréquence, 17 la divise environ par deux. Cette
variabilité ne valide pas une stabilité à 120 fps. 17 aligne aussi la cible
du sous-rapport `performance.expectedHz` de 60 à 120 ; cela ne change que les
comptages attendus, pas l'ordonnancement du rendu, et ne prouve donc pas la cause
de cette variation. Le cache n'a pas contenu simultanément les octets cumulés.
Le nouveau compteur comprend aussi les positions projetées.

Le CPU `render_model_prepare_slice` culmine à 5,8 ms dans 16 et 4,6 ms dans 17,
mais les parties restées synchrones de `render_model_build` montent encore à
11,1 et 14,8 ms. Les créneaux
représentent 892,8 ms CPU dans la trace ; la métrique cumulée depuis le montage
est 910,1 ms. L'application d'un lot reçu culmine à 1,1 ms. L'envoi d'un job
atteint encore 10,8 ms. Ce pipeline n'est donc pas intégralement sous 8,33 ms.

## Tous les passages intermédiaires conservés

10 est mobile (452 × 770,4, DPR 1,25). 11–15 utilisent un viewport temporaire
avec une surface réelle de 828,8 × 956, DPR ~1 ; ils sont comparables entre eux,
mais ne doivent pas être confondus avec la résolution native. L'override a été
réinitialisé avant 27/28 et 16.

| Capture | Modification mesurée | P99 | Pic | Frames > 50 ms | Hors budget 120 Hz |
|---|---|---:|---:|---:|---:|
| 10 | Premier fractionnement, mobile | 12,4 | 248,4 | 18 | 6,0 % |
| 11 | Identités stables et cache stations | 18,1 | 284,7 | 7 | 8,2 % |
| 12 | Préparation coopérative | 12,3 | 187,8 | 6 | 7,9 % |
| 13 | Projection dans le worker | 12,3 | 157,5 | 3 | 8,6 % |
| 14 | Assets et catalogue par lots | 12,2 | 78,8 | 2 | 6,8 % |
| 15 | Tuiles détaillées et modèle initial fractionnés | 18,1 | 78,9 | 6 | 8,6 % |
| 16 | Même code, confirmation native | 12,2 | 66,6 | 1 | 8,7 % |
| 17 | Répétition native, sous-rapport aligné à 120 Hz | 12,2 | 96,9 | 1 | 4,4 % |

Le passage 15 est moins régulier que 14 malgré la correction de la réception
de tuile de 44 ms. Il reste dans le bilan. On ne peut pas promettre le P99 de
12,2 ms à chaque passage.

## Cold refresh : pause encore présente

| Capture | Viewport | Premier tracé depuis navigation | Pic après tracé | Micro-lags après tracé |
|---|---|---:|---:|---:|
| 25 | Temporaire, DPR ~1 | 2 416,9 ms | 54,4 ms | 39 |
| 26 | Temporaire, DPR ~1 | 2 538,5 ms | 36,4 ms | 37 |
| 27 | Natif, DPR 1,25 | 9 039,0 ms | 36,2 ms | 3 |
| 28 | Natif répété, DPR 1,25 | 2 421,5 ms | 42,4 ms | 6 |

La capture 27 garde aussi son démarrage lent : le diagnostic ne démarre qu'à
6 388,7 ms. La répétition 28 revient à 2,42 s pour les lignes. Ce passage lent
n'est pas supprimé du bilan et la période avant le diagnostic ne permet pas
d'attribuer tout ce délai aux corrections.

La préparation initiale de 501 chemins occupe des créneaux de **2,5–2,6 ms**
maximum dans 26–28, contre une tâche synchrone de 20,6 ms dans 25. Son travail
CPU total reste environ 20–22 ms. La pause post-affichage n'est donc pas résolue
en prétendant que ce travail aurait disparu.

Les pauses de 36,2/42,4 ms restent classées
`gpu-queue-delay-correlated-main-thread-responsive` : timers réactifs, aucun
LongTask ni span CPU instrumenté qui les recouvre, fence encore en attente.
La fence partagée prend 72,5 ms dans 28. Elle couvre MapLibre, Deck, le pilote
et le délai de polling ; elle n'isole ni compilation GPU ni temps de dessin.
Cela ne démontre pas un manque de puissance de la RTX 3060 Ti.

`assessment.accepted` reste faux. Le résumé expose séparément le budget 120 Hz
des intervalles complets après tracé ; l'intervalle traversant le premier dessin
reste documenté dans le JSON original. Les petites irrégularités sans preuve de
CPU ou GPU gardent une attribution inconnue.

## Validation et limites de la reprise

- **128 tests ciblés passent** sur 14 fichiers, puis deux tests supplémentaires
  du probe de performance passent avec les six tests Chaos déjà comptés.
  Soit 130 tests distincts sur les zones concernées.
- `npm.cmd run tsc` passe. Diff ciblé sans erreur d'espacement.
- La suite supplémentaire `transportMapAssets.test.ts` conserve cinq échecs sur
  le pack local : palette attendue à 2 011 entrées contre 2 026, provenance/alias
  attendus absents, anciens IDs Châtillon/Cité introuvables. Les données générées
  et ces assertions n'ont pas été modifiées pour rendre les tests verts.
- Zéro erreur Deck/MapLibre dans les nouveaux scénarios, invariant réseau complet
  validé. 16/17 ont évincé 2 262/4 008 événements détaillés : les agrégats restent complets,
  mais toutes les petites pauses n'ont pas une timeline détaillée conservée.
- Une tâche principale de 63/76 ms persiste lors de l'activation de 16/17 ; sa cause
  exacte reste non attribuée. Les pauses CPU des assets corrigées ne suffisent
  pas à expliquer cette tâche ni l'attente GPU du premier rendu.

Sources de preuve : `chaos-extreme-2026-10-11-10…17*.json`,
`cold-refresh-24…28*.json`, `comparison-2026-10-11.json`,
`summarize_map_performance.py` et `map-120fps-native-proof.png` dans
`reports/performance/`. La capture visuelle confirme la carte restaurée avec ses
six réseaux. Elle n'est pas une preuve de cadence.
