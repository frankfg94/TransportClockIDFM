# DeparturePatternModal info-card debug tools

Cet utilitaire expose une vue de diagnostic de toutes les cartes
d'information de trafic rendues par `DeparturePatternModal.vue`, qu'il
s'agisse d'un bus de remplacement, d'une interruption ou d'une perturbation.
Le champ `replacementBus` permet toujours de distinguer les cartes bus. Il ne
modifie ni l'analyse métier, ni les stations, ni les arêtes du graphe.

## Utilisation par un agent IA

Ajouter `?debugInfoCards=1` à l'URL de la ligne, puis attendre que le modal et
son graphe soient chargés. Dans les DevTools du navigateur :

```js
const tools = window.__departurePatternModalInfoCardsDebugTools;
tools.getInfoCardInfos();
tools.checkDuplicateInfoCards();
```

`getInfoCardInfos()` retourne, pour chaque carte de trafic, les coordonnées de
la carte dans le graphe et, quand le DOM est mesurable, dans la fenêtre, les
coordonnées de l'ancre, du connecteur et de chaque tronçon concerné. Chaque
entrée indique aussi si le connecteur est vertical, s'il touche réellement le
segment et la carte, et si la carte chevauche une station, un titre de
station/ville, une correspondance, un temps de marche ou une autre carte. Pour
les alertes qui ciblent uniquement une station et n'ont donc aucune arête,
`intersection.segmentCheckSkipped` vaut `true` et l'absence de segment n'est
pas une collision.

`checkDuplicateInfoCards()` regroupe les cartes par texte visible, date de fin
et ensemble exact des stations concernées. Le rapport expose les critères
`sameText`, `sameEndDate` et `sameStations`. Les mêmes critères sont également
présents dans le champ `duplicate` de chaque carte. `hasDuplicates` doit rester
à `false`. Les outils retournent un état vide avant le rendu du modal ; il faut
donc les rappeler après le chargement ou après un changement de date/direction.

Quand le paramètre est actif, le JSON courant est également visible dans le
coin inférieur droit du graphe via `[data-info-cards-debug]`, sous les clés
`infoCards` et `duplicateInfoCards`.

L'ancien paramètre `debugReplacementBuses` et l'ancien global
`window.__departurePatternModalDebugTools` restent acceptés comme alias de
compatibilité, mais les nouveaux diagnostics doivent utiliser `debugInfoCards`.
