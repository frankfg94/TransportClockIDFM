# Optimisation ciblée de GlobalTransportPlan — consigne pour Luna Max

## Objectif

Éviter les demandes de rendu provoquées par un survol vide qui reste vide, sans supprimer aucune fonctionnalité. Conserver Deck.gl + MapLibre, les interactions, les infobulles, les correspondances, le trafic, les isochrones et le mode legacy.

Analyse statique réalisée le 8 septembre 2026. Aucun code applicatif modifié, aucun benchmark exécuté. Le gain attendu est limité au travail CPU inutile pendant les mouvements de souris sur le fond vide ; ce document ne promet pas une amélioration générale des FPS.

## Constat vérifié dans le code

- `src/features/line-map/GlobalTransportPlan.vue:3683` transmet `globalTransportHover.update` au contrôleur d’interaction.
- `src/features/line-map/useGlobalTransportMapInteraction.ts:531` : `onPointerMove` appelle directement `updateHovered(point)` pour un pointeur sans geste actif.
- `src/features/line-map/useGlobalTransportHover.ts`, fonctions `update` et `setHoveredFeature` : quand le hit-test ne trouve rien, `setHoveredFeature(undefined)` réaffecte notamment un nouveau tableau vide à `hoveredLineCandidates` et appelle systématiquement `options.draw()`, même si aucun survol n’était déjà présent.
- `src/features/line-map/GlobalTransportPlan.vue:1785` : `draw()` regroupe déjà les appels dans un `requestAnimationFrame`. Cela fusionne les demandes proches, mais ne supprime pas les demandes répétées d’une frame à l’autre.
- `drawNow`, vers la ligne 1759, passe encore par la validation du survol, la lecture de scène, `renderer.render`, les métriques et leur publication réactive hors interaction.
- `src/features/transport-map/next/deckMapPresenter.ts`, `present` : le présentateur évite déjà de reconstruire les couches lorsque le modèle et les paquets binaires restent identiques. Ne pas présenter chaque appel évitable à `draw` comme une reconstruction GPU ou un repaint MapLibre assuré.

Les numéros de ligne sont indicatifs : retrouver les fonctions par leur nom avant modification. Le graphe Graphify existant a servi à orienter la lecture ; les constats ci-dessus ont été vérifiés dans les sources actuelles.

## Modification demandée

Limiter le changement au chemin « résultat de hit-test vide et état de survol déjà entièrement vide » dans `useGlobalTransportHover.ts`.

1. Continuer à effectuer le hit-test à chaque mise à jour actuelle : il doit toujours détecter l’entrée sur une station, une ligne ou une isochrone.
2. Après un résultat vide, éviter les réaffectations réactives inutiles et `options.draw()` si `hoveredFeature` et `hoveredPointer` sont absents, `hoveredLineCandidates` est vide et `lineChoiceOpen` est faux.
3. Préserver l’effacement de `sidebarPreviewLineId`. Cet état appartient au composant parent et ne doit pas être supposé vide uniquement à partir de `hoveredFeature`. Vérifier ses chemins de mise à jour avant de placer un retour anticipé ; si nécessaire, exposer une lecture de cet état pour garantir que le cas ignoré est réellement sans effet visible. Une prévisualisation encore active doit être effacée avec le rendu nécessaire.
4. Une transition d’un survol réel vers le vide doit continuer à effacer tous les états concernés et demander le rendu de disparition.

Ne pas étendre cette optimisation à « même identifiant de ligne » : les candidats, leur ordre, le segment visé et la perturbation associée peuvent changer sur une même ligne. Ne pas ajouter de temporisation, de nouveau cache de géométrie ou de refonte des couches pour ce correctif.

## Vérification attendue

Compléter les tests existants dans `tests/globalTransportHover.dom.test.ts` avec des assertions de comportement et de nombre d’appels :

- Plusieurs mises à jour vides consécutives, depuis un état entièrement vide : les hit-tests continuent, aucune demande de rendu ni remplacement du tableau vide des candidats.
- Entrée sur une station puis sortie : le survol apparaît et disparaît normalement ; les mises à jour vides suivantes ne redemandent pas de rendu.
- Même contrôle pour une ligne avec candidats et pour une isochrone.
- Une prévisualisation latérale résiduelle ne reste pas affichée à cause du retour anticipé.
- Les tests existants de choix entre plusieurs lignes, navigation clavier et transitions d’infobulle restent valides.

Exécuter `npm.cmd run test -- tests/globalTransportHover.dom.test.ts tests/globalTransportPlanAccessibility.dom.test.ts`, puis `npm.cmd run tsc` et `git diff --check`. Ajouter les tests d’intégration pertinents si le câblage du parent est modifié.

Pour vérifier le gain, comparer avant/après un déplacement de souris sur une zone sans station, ligne ni isochrone, carte immobile et chargements terminés. Compter les demandes de rendu provenant du survol et les appels effectifs à `renderer.render`, tout en distinguant les rendus déclenchés par les autres fonctionnalités. Utiliser une instrumentation temporaire ou les outils de profilage, sans conserver de logs par mouvement en production.

## Périmètre de livraison

Un petit correctif ciblé et ses tests. Aucun changement de densité de carte, qualité graphique, fréquence des données, animation, picking ou fonctionnalité. Rapporter les vérifications réellement exécutées et ne chiffrer le gain qu’après mesure.
