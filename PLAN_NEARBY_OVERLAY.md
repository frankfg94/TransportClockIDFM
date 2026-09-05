# PLAN_NEARBY_OVERLAY.md — Annuaire « quartier commercial à ciel ouvert »

> Statut : implémentation et validation du périmètre réalisées le 2026-08-22. Suite ciblée : 58/58 ; typecheck : réussi ; captures responsive : produites.

## 1. Résultat attendu

Créer depuis `MyNearbyStationsPage.vue` un annuaire plein écran des commerces et lieux d’intérêt déjà chargés autour de l’adresse sélectionnée.

- Ajouter sur `NearbyStationsMap.vue` un bouton Lucide `Store`, toujours visible dans les contrôles de carte et placé avant le bouton de fond de carte lorsqu’il est affiché.
- Ouvrir un overlay applicatif fixe `100dvh × 100vw`, indépendant du plein écran natif.
- Donner la priorité au langage visuel IDFM existant : violet du produit, typographie actuelle, surfaces claires, rayons et ombres modérés, forte densité d’information et aucune décoration sans fonction.
- Donner la majorité de l’espace à l’annuaire, avec une largeur maximale voisine de `800 px` pour sa zone de contenu.
- Transformer la carte en aperçu piloté par la sélection : aucun transport, station lourde, horaire, tracé ghost ou outil d’itinéraire.
- N’effectuer aucun appel réseau depuis l’overlay. Les lieux, l’origine, le statut de chargement et le fond de carte viennent exclusivement des props.
- Utiliser des icônes Lucide par type plutôt que des logos de marques distants.

## 2. Architecture et contrats

### 2.1 État et chargement dans le parent

Dans `MyNearbyStationsPage.vue` :

- conserver `nearbyDirectoryOpen` et un rayon commercial séparé, initialisé à `15` minutes et persistant entre deux ouvertures ;
- précharger les lieux à `1 200 m` dès que l’origine existe, même si la couche POI de la carte principale est masquée ;
- réserver `showNearbyPlaces` au rendu de la carte principale et ne pas l’utiliser pour activer `useNearbyPlaces` ;
- filtrer les lieux passés à la carte principale par `distanceMeters <= nearby.radius.value` ;
- transmettre tous les lieux préchargés à l’overlay ;
- conserver le rayon transport indépendant des paliers commerciaux 5/10/15 minutes ;
- autoriser l’ouverture pendant le chargement ou après erreur et traiter `retry` dans le parent.

Contrat de `NearbyPlacesDirectoryOverlay.vue` :

```ts
type NearbyWalkingMinutes = 5 | 10 | 15;

props: {
  open: boolean;
  origin: { lon: number; lat: number; label?: string };
  places: readonly NearbyPlace[];
  walkingMinutes: NearbyWalkingMinutes;
  loading?: boolean;
  error?: string;
  basemapStyle?: TransportMapBasemapStyle;
}

emits: {
  close: [];
  retry: [];
  "update:walkingMinutes": [value: NearbyWalkingMinutes];
}
```

La recherche, la sélection et les accordéons sont des états d’interface locaux réinitialisés à la fermeture. Seul le palier de marche appartient au parent.

### 2.2 Réutilisation de la carte

Étendre `NearbyStationsMap.vue` avec :

```ts
props: {
  variant?: "transit" | "places-preview";
  selectedPlaceId?: string;
}

emits: {
  openPlacesDirectory: [];
  selectPlace: [placeId?: string];
}
```

La variante `places-preview` doit :

- rendre uniquement le fond de carte, l’origine, le cercle actif, les lieux filtrés et l’attribution OpenStreetMap ;
- exclure stations normales et lourdes, ghost flows, marche d’itinéraire, sidebar, splitter, états de chargement transport et contrôles transport ;
- désactiver pan, pinch, molette et zoom manuel, tout en conservant les marqueurs cliquables ;
- employer une grille `map-only` ;
- représenter tous les lieux fournis, sans la limite visuelle historique de 120 marqueurs, jusqu’à la limite serveur de 160 ;
- ne changer aucun comportement de la variante `transit` par défaut.

Les contrôles supérieurs sont regroupés :

- transit normal : annuaire et plein écran ;
- transit plein écran : annuaire, fond de carte, affichage et sortie plein écran ;
- aperçu des lieux : aucun de ces contrôles.

Si le lanceur est utilisé pendant le plein écran natif, la carte sort d’abord de ce plein écran, attend la synchronisation DOM, puis émet `openPlacesDirectory` afin que l’overlay téléporté dans `body` reste visible.

### 2.3 Présentation partagée

Le module pur `nearbyPlacePresentation.ts` centralise :

- `walkingMinutesToMeters(5|10|15)` → `400|800|1200` ;
- `nearbyPlaceWalkingMinutes(place)` selon la convention `80 m/min` ;
- la normalisation sans casse, accents, répétitions d’espaces ni ponctuation simple ;
- la résolution du groupe, de l’icône, de la couleur et du libellé de type ;
- le filtrage, le groupement et le tri ;
- les métadonnées d’affichage.

La carte et l’overlay doivent partager ces fonctions pour éviter toute divergence de rayon ou de taxonomie.

## 3. Ergonomie et algorithmes

### 3.1 Structure responsive

L’overlay porte `role="dialog"` et `aria-modal="true"`.

- En-tête : eyebrow « À proximité », titre « Commerces & lieux autour de moi », adresse et bouton Lucide `X`.
- Recherche immédiatement visible avec icône `Search`.
- Résumé compact du nombre de lieux et de catégories.
- Sélecteur segmenté `5 / 10 / 15 min à pied` avec `Footprints`.
- Colonne gauche : carte d’aperçu.
- Zone droite : accordéons de catégories, limitée à environ `800 px`.

Breakpoints :

- `>= 1180 px` : grille carte/annuaire, annuaire majoritaire et lignes sur deux colonnes ;
- `768–1179 px` : grille compacte proche de `36 % / 64 %`, liste sur une colonne ;
- `<= 767 px` : annuaire seul, carte dans un accordéon fermé par défaut.

### 3.2 Recherche, rayon et ordre déterministe

1. Convertir le palier en mètres.
2. Garder `distanceMeters <= rayon`.
3. Appliquer la recherche normalisée.
4. Grouper.
5. Trier chaque groupe par distance croissante, puis nom avec `localeCompare`.
6. Retirer les groupes vides.

La recherche couvre le nom, l’adresse, `kind`, le libellé de type traduit et le libellé de groupe traduit. Une recherche non vide ouvre tous les groupes avec résultats ; son effacement restaure l’état précédent. Sans recherche, le premier groupe non vide est ouvert. Une sélection éliminée par le rayon ou la recherche est annulée et la caméra revient à la vue globale.

### 3.3 Taxonomie exhaustive

Résoudre dans cet ordre :

1. **Alimentation** : `supermarket`, `convenience`, `bakery`, `butcher`, `greengrocer`, `deli`, `health_food`, `marketplace`.
2. **Restaurants & cafés** : `restaurant`, `cafe`, `bar`, `fast_food`.
3. **Beauté & santé** : `pharmacy`, `chemist`, `medical_supply`, `optician`, `hearing_aids`, `hairdresser`, `beauty`, `cosmetics`, `massage`.
4. **Mode & accessoires** : `clothes`, `shoes`, `jewelry`, `bag`, `watches`.
5. **Maison, tech & mobilité** : `furniture`, `interior_decoration`, `houseware`, `hardware`, `doityourself`, `electronics`, `computer`, `mobile_phone`, `appliance`, `laundry`, `dry_cleaning`, `car`, `car_repair`.
6. **Services du quotidien** : `bank`, `insurance`, `post_office`, puis fallback de `service`.
7. **Culture & loisirs** : `cinema`, `theatre`, `library`, `museum`, `gallery`, puis fallback de `culture`.
8. **Lieux d’intérêt** : fallback de `attraction`.
9. **Autres** : tout `kind` ou toute catégorie non reconnus.

Aucun lieu fourni par le endpoint existant ne doit être supprimé par la taxonomie.

### 3.4 Accordéons et métadonnées

Chaque en-tête utilise un vrai bouton et contient une icône colorée, le libellé, le compteur filtré et un chevron animé. L’ouverture verticale combine `grid-template-rows: 0fr → 1fr`, opacité et translation légère sur environ `220 ms ease`. `prefers-reduced-motion` supprime les animations.

Chaque ligne présente l’icône de type, le nom, le temps à pied et un état sélectionné évident. Sur desktop, type précis, adresse et distance apparaissent au survol ou au focus. Sur tactile/mobile, le type et la distance restent visibles. Les adresses longues sont ellipsées mais conservées dans `title` et le nom accessible.

### 3.5 Sélection et caméra

- Cliquer une ligne ou un marqueur sélectionne le lieu ; recliquer le désélectionne.
- Une action « Revenir à la vue d’ensemble » est affichée pendant la sélection.
- Sans sélection, la caméra ajuste l’origine et le rayon.
- Avec sélection, elle centre le lieu à `zoomReference + 1`, borné aux limites de zoom.
- L’animation dure environ `480 ms` avec un cubic ease-in-out réel ; les usages transit conservent leur ease-out historique.
- En réduction de mouvement, la caméra cible est appliquée immédiatement.
- Le marqueur actif gagne en taille et en contraste, sans animation de station lourde.

Sur mobile, sélectionner un lieu ouvre la carte, attend `nextTick` et le recalcul du `ResizeObserver`, centre le lieu et amène la carte dans le viewport (sans défilement animé en réduction de mouvement). Une action « Retour à la liste » referme la carte.

### 3.6 Accessibilité

- Verrouiller le scroll de `html` et `body`, puis restaurer exactement leurs styles.
- Placer le focus initial dans la recherche.
- Fermer avec `Escape` ou `X`.
- Piéger Tab/Shift+Tab dans le dialogue.
- Restaurer le focus sur le lanceur `Store`.
- Employer de vrais boutons avec `aria-expanded`, `aria-controls`, `aria-current` ou `aria-pressed` selon le cas.
- Ne pas fermer sur un clic dans la surface ; un backdrop peut fermer sur desktop seulement.
- Libeller le lanceur « Explorer les commerces et lieux autour de cette adresse ».

## 4. Internationalisation et documentation

- Ajouter toutes les chaînes dans `src/i18n/messages/fr.ts` et `src/i18n/messages/en.ts`, sous `nearbyStations.directory` : titre, eyebrow, recherche, résumé, rayons, groupes, carte, vue globale, chargement, erreur, retry et libellés accessibles.
- Compléter `docs/global-transport-plan/LINE_GEOMETRY_DATA_FLOW_AND_AUDIT.md` avec le flux de données, l’indépendance des rayons, la variante `places-preview`, les règles de caméra, le fallback « Autres » et la limite réelle de 160 lieux.
- N’ajouter les balises `TEST-CONFIRMED` et `VISUAL-CONFIRMED` qu’après exécution réelle des validations correspondantes.

## 5. Tests et critères d’acceptation

### 5.1 Module pur

- conversion exacte 5/10/15 minutes ;
- recherche insensible à la casse et aux accents ;
- filtrage par nom, adresse, type et groupe ;
- tri distance puis nom ;
- présence de chaque `NearbyPlace` exactement une fois ;
- inconnus dans « Autres » ;
- exclusion des lieux hors rayon ;
- aucune troncature des 160 lieux fournis.

### 5.2 Overlay DOM

- rendu exclusivement depuis les props, sans `fetch` ;
- recherche, compteurs, accordéons et classes d’animation ;
- émission du palier sans toucher au rayon transports ;
- sélection, désélection et disparition d’une sélection filtrée ;
- métadonnées hover/focus et comportement mobile ;
- fermeture par bouton/Escape, scroll lock et retour du focus ;
- loading, error, retry, vide et réduction de mouvement.

### 5.3 Carte et parent

- bouton `Store` permanent, placé avant le fond de carte ;
- sortie du plein écran natif avant l’ouverture ;
- aperçu sans transport, sidebar, ghost, zoom ni navigation ;
- marqueurs cliquables et émission de `selectPlace` ;
- animation vers un lieu puis retour à `fitView` ;
- aucune régression transit ;
- préchargement parent à `1 200 m` ;
- carte normale bornée au rayon transports ;
- couche POI indépendante du préchargement.

Commandes de validation :

```text
npm.cmd run test -- tests/nearbyPlaces.test.ts tests/useNearbyPlaces.dom.test.ts tests/nearbyPlacesDirectory.test.ts tests/nearbyPlacesDirectory.dom.test.ts tests/nearbyStationsMap.dom.test.ts tests/myNearbyStationsPage.dom.test.ts tests/i18n.test.ts
npm.cmd run tsc
npm.cmd run test
```

Les deux défauts de référence antérieurs — zoom attendu à `200 %` mais mesuré à `271 %`, et test de page dépassant cinq secondes — doivent être corrigés à la source, sans augmentation arbitraire du timeout.

### 5.4 Vérification visuelle

Créer un nouveau rapport et capturer `/nearby-stations` aux tailles :

- `1440 × 900` ;
- `1280 × 800` ;
- `390 × 844`.

Contrôler la hiérarchie IDFM, les deux colonnes lorsque disponibles, les accordéons, recherche vide/non vide, les trois paliers, sélection/vue globale, absence de transports, ouverture automatique de la carte mobile et absence de débordement ou contrôle inaccessible.

## 6. Hypothèses verrouillées

- Rayon commercial séparé du rayon transports.
- Paliers à `80 m/min` : `400`, `800`, `1 200 m`.
- `15 min` par défaut et persistant entre ouvertures.
- Lanceur toujours visible sur la carte.
- Overlay applicatif fixe, pas un second plein écran natif.
- Aucune nouvelle API ni extension de la requête Overpass.
- Tous les résultats existants sont affichables ; inconnus dans « Autres ».
- Aucun chargement de logos de marques.
- Recherche, accordéons et sélection réinitialisés à la fermeture.
- CSS spécifique dans les composants scoped et réutilisation des tokens globaux existants.
- Les modifications préexistantes du worktree appartiennent à l’utilisateur et doivent être préservées.
