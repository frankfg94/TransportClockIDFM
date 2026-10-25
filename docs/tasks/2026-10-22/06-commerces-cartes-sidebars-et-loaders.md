# Lot 06 — Commerces — cartes, fiche détaillée et loaders des transports

Tâches de la liste originale : n° 5, n° 8, n° 9.

Portée : Lot transversal centré sur les commerces.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

Le clic commerce, les commerces sur la carte globale et leur chargement partagent les données de lieux et les sidebars des transports. Le loader des villes traversées complète les états de chargement de ces mêmes vues.

## Prérequis et ordre

Aucun prérequis entre les lots. Réutiliser les données et le calcul de marche existants ; ne charger le code de compilation des datasets que si les métadonnées manquent réellement.

## Points d’entrée à explorer

- `src/features/nearby-stations/NearbyStationsMap.vue`
- `src/features/nearby-stations/nearbyPlaces.ts`
- `src/features/nearby-stations/nearbyPlacesExport.ts`
- `src/features/line-map/GlobalTransportPlan.vue`
- `src/features/service-pattern/DeparturePatternModal.vue`
- `docs/nearby-network-and-places.md`

## Précisions de cadrage

Le nom NearbyStationMaps.vue dans la todo désigne une responsabilité à retrouver dans le code ; un point d’entrée actuel est NearbyStationsMap.vue. Tracer aussi la compilation si des attributs de commerce ont été perdus.

## 5. NearbyStationMaps.vue — clic sur un commerce

- [x] Quand on clique sur un commerce, zoomer automatiquement pour cadrer :
  - l’appartement / adresse de départ ;
  - le commerce ;
  - le trajet piéton entre les deux.
- [x] Afficher clairement le trajet à pied.
- [x] Dans la sidebar droite, afficher toutes les données disponibles sur le commerce :
  - nom ;
  - catégorie ;
  - petite / moyenne / grande surface ;
  - horaires ;
  - email ;
  - site web ;
  - autres métadonnées conservées lors de la compilation.
- [x] Vérifier que ces informations sont bien encore présentes dans les datasets compilés.

## 8. Carte globale — commerces

- [x] Renommer `Ouvrir sur la carte globale` en `Voir sur la carte globale`.
- [x] Dans ce mode, afficher tous les commerces situés dans le rayon du cercle affiché sur la carte globale.
- [x] Réutiliser la même logique que les commerces accessibles à 2 min / 5 min à pied autour des transports.
- [x] Garder les commerces cohérents avec le rayon réellement affiché.

## 9. Loaders — commerces et villes traversées

Ajouter un loader tant que le chargement n’est pas terminé pour :

- [x] les commerces à 2 et 5 minutes de marche de chaque transport ;
- [x] les villes traversées par le transport.

Le loader doit rester visible jusqu’à la fin réelle du chargement.

## Validation du lot

Vérifier le cadrage adresse–commerce–marche, la fiche et les métadonnées réellement disponibles, puis la correspondance entre commerces et cercle affiché. Tester les loaders sur chargement lent jusqu’à la fin réelle, pour les commerces à 2/5 minutes et les villes traversées.

## Résultat vérifié du 22 octobre 2026

Voir [le rapport](reports/06.md) et `proofs/06/`. Les contacts éliminés du dataset actuel n’ont pas été restaurés : le filtre corrigé protège les futures compilations. Format OSM indicatif, emprise distincte de la surface de vente.

- [x] 84 tests ciblés et preuves navigateur/données/rayons/loaders vérifiés.
- [x] Typecheck final partagé réussi par le lot 11, sortie 0 : [journal](proofs/11/typecheck.log), [code de sortie](proofs/11/typecheck-exit-code.txt). [Comparaison des 16 fichiers inchangés](proofs/11/lot06-shared-typecheck-source-comparison.json), également revérifiés par le coordinateur contre [son relevé SHA256](proofs/06/coordinator-source-sha256.json). Succès réutilisé sans nouvelle commande.
- [x] Historique de la première tentative bloquée conservé dans le rapport et `proofs/06/typecheck-final.log`. Les quatre échecs hérités de la façade globale restent documentés séparément ; aucune suite globale entièrement verte n’est annoncée.
- [x] Lot 06 clôturé ; fichiers, catalogues FR/EN et réservations restent libérés. Clôture documentaire uniquement, sans solliciter le créneau Android du lot 11.

## Finition ultérieure — horaires plus lisibles

Nouvelle demande directe de l’utilisateur après la clôture initiale : un jour par ligne et un design simple amélioré.

- [x] Semainier localisé, jours séparés et créneaux alignés ; créneaux fractionnés sur des lignes distinctes.
- [x] Fermetures, ouverture 24 h/24 et jours fériés présentés séparément ; jours inconnus conservés comme non renseignés.
- [x] Règles OSM complexes/conditionnelles conservées en texte source lisible, sans réinterprétation.
- [x] Tests ciblés et aperçu navigateur isolé du composant réel sur les horaires compilés de Carrefour Market ; preuves dans `proofs/06/opening-hours-*`.
- [x] Parcours final dans l’annuaire réel sur ordinateur et en viewport mobile 390 × 844 : sept jours et dimanche fractionné, fermeture réelle, 24/7 d’un lieu classé Boîte à livres et règle ambiguë préservée. Défilement, métadonnées, fermeture puis réouverture via le menu de carte vérifiés ; aucun débordement horizontal du semainier mobile. Preuves `proofs/06/opening-hours-real-*`. Ancien blocage de préparation non reproduit, cause historique inconnue ; serveur partagé conservé sans relance.
- [x] Nouveau typecheck final partagé réussi par le lot 11 : [journal](proofs/11/typecheck-final.log), [sortie 0](proofs/11/typecheck-final-exit-code.txt). Les 42 empreintes [avant](proofs/11/typecheck-final-before-sources.json)/[après](proofs/11/typecheck-final-after-sources.json) sont identiques, confirmées encore actuelles par le coordinateur lors de la clôture. Quatre fichiers propres à la finition identiques au relevé initial ; catalogues plus récents couverts avec leurs trois clés horaires préservées ([audit i18n](proofs/11/shared-i18n-contract-check.json)). Les six anciennes empreintes ne sont pas déclarées identiques.

État : **clôturé**, finition horaires comprise. Exigences vérifiées, fichiers et sources libres ; reprise finale limitée au rapport, handoff et à cette checklist, sans nouvelle commande ni modification source/test/catalogue. Le succès partagé couvre l’état référencé ci-dessus ; les suites draggable sheets du 11 et le smoke intégré 12 restent à leurs lots. Aucun build global/natif ni autre chat ; contacts actuels non restaurés, quatre échecs hérités toujours distincts et aucune validation Android native propre au 06.
