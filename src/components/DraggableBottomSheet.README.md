# DraggableBottomSheet

Conteneur de contenu arbitraire, sans dépendance aux cartes, aux transports ou à un breakpoint. Par défaut, il reste une bottom sheet sur tous les viewports. Les fiches qui doivent devenir latérales sur ordinateur utilisent `ResponsiveSidePanel.vue`, qui délègue leur présentation mobile à ce composant, ou désactivent explicitement sa présentation avec `enabled`.

Un simple slot suffit. La feuille s'ouvre par défaut et ses commandes la ferment sans gestionnaire externe :

```vue
<DraggableBottomSheet>
  <MonContenu />
</DraggableBottomSheet>
```

Pour piloter son ouverture et sa taille depuis le parent :

```vue
<DraggableBottomSheet v-model:open="open" v-model:stage="stage" title="Titre traduit">
  <template #header><MonEntete /></template>
  <MonContenu />
  <template #footer><MesActions /></template>
</DraggableBottomSheet>
```

- Modèles : `open` (défaut `true`), `stage` (`peek`, `mid`, `full`, défaut `mid`). Sans binding, leur état est géré dans la feuille.
- Slots : contenu par défaut ; `header` et `footer` facultatifs. Le header personnalisé cohabite avec le bouton de fermeture. `:show-close-button="false"` permet de fournir son propre contrôle.
- Props facultatives : `title`, `closeLabel`, `resizeLabel`, `busy`, `showCloseButton`, `backdrop`. Les libellés génériques par défaut passent par i18n. Attributs et classes CSS sont transmis au panneau.
- Événement `close` : fermeture demandée par la croix, Escape, la poignée ou le backdrop facultatif. Fermer le modèle depuis le parent ne déclenche pas cet événement utilisateur.
- Poignée : clic pour alterner mid/full ; glissement pour parcourir les paliers, puis fermer depuis peek. Le contenu possède son propre scroll. Un changement de palier conserve les nœuds du slot et leur état.
- La feuille est non modale : pas de verrouillage implicite du body ni de confinement du focus. Le focus est placé sans scroll à l'ouverture et restitué à la fermeture. Les raccourcis clavier restent dans le panneau. Le backdrop facultatif permet la fermeture au clic extérieur.
- Le composant ne téléporte pas son contenu : le parent choisit la destination, notamment pour conserver une feuille dans un élément en plein écran natif.

`ResponsiveSidePanel` conserve la présentation latérale et son overlay modal sur les écrans intermédiaires. Avec `mobile-sheet`, il utilise la feuille générique à `(max-width: 720px), (pointer: coarse)`. Son état métier et les valeurs de formulaire doivent être détenus par le parent, comme dans les consommateurs existants.

Les panneaux de carte à contenu déjà structuré utilisent aussi le même composant :

- `enabled` permet de désactiver la présentation sheet sur ordinateur, sans remonter le slot.
- `unwrappedContent` laisse le slot gérer son en-tête et son scroll (`display: contents`), avec `showCloseButton=false` si le contenu porte déjà une fermeture.
- `snapHeights(viewportHeight)` fournit les hauteurs `peek/mid/full` en pixels. Dans ce mode, le glissement redimensionne continuellement la feuille, puis choisit le palier le plus proche. La politique de hauteur reste chez le parent ; les gestes restent dans le composant générique.
- `cycleStages` fait parcourir les trois paliers au clic. `dismissOnSwipe=false` garde une feuille repliée ouverte ; les hauteurs personnalisées restent également bornées au palier replié.
- `handleAttrs` transmet les attributs accessibles ou les identifiants de la poignée. `inactiveTransition` conserve la transition d'un panneau lorsque la présentation sheet est désactivée.
- `resize(height, dragging)` signale le redimensionnement continu et sa fin, notamment pour ajuster une carte à l'espace réellement visible. `element` expose le nœud du panneau pour sa mesure.
