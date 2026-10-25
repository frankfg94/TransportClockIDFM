# Lot 03 — Verdict — trajets personnalisés, seuils et annuaire

Tâches de la liste originale : n° 15, n° 16, n° 17, n° 18, n° 19.

Portée : Grosse fonctionnalité cohérente.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

Ajout de destination, seuils par trajet, domicile-travail, loaders et état des données constituent un même flux. Les séparer obligerait chaque IA à reconstruire le modèle des trajets, leur cycle de chargement et leur intégration au scoring.

## Prérequis et ordre

Traiter de préférence après le lot 01 pour réutiliser un calcul de trajet fiable. Aucun besoin de lire les autres lots : retrouver les contrats dans le code actuel.

## Points d’entrée à explorer

- `src/features/nearby-stations/NearbyNeighborhoodScorePage.vue`
- `src/features/nearby-stations/NearbyRealEstateVerdict.vue`
- `src/features/nearby-stations/useNearbyNeighborhoodScore.ts`
- `src/features/nearby-stations/neighborhood/`
- `src/features/address-book/addressBook.ts`
- `src/features/app-settings/SettingsAddressBookCategory.vue`

## Précisions de cadrage

Pour avancer sans élargir le contexte, traiter successivement le contrat commun des trajets et seuils, l’ajout/suppression et le scoring, l’intégration domicile-travail, puis les loaders et états de données. Les cinq tâches font partie du même livrable.

## 15. Verdict > Transports — trajets personnalisés

Dans la section `Transports` :

- [x] Ajouter un bouton `+`.
- [x] Au clic, ouvrir l’annuaire.
- [x] Permettre de sélectionner ou ajouter une adresse personnalisée.
- [x] Calculer le temps de trajet entre l’adresse du Verdict et cette adresse.
- [x] Ajouter une nouvelle ligne dans la section Transports.
- [x] Afficher systématiquement une poubelle à droite de chaque trajet personnalisé.

## 16. Scoring configurable des trajets personnalisés

Valeurs par défaut :

- moins de 40 min → positif / vert ;
- entre 40 min et 1 h → neutre ;
- plus de 1 h → négatif.

Mais :

- [x] Au moment de l’ajout, permettre à l’utilisateur de modifier directement ces seuils.
- [x] Les seuils doivent être configurables par trajet / critère.
- [x] Ne pas hardcoder `40` et `60` dans l’UI.
- [x] Respecter ensuite les seuils personnalisés dans le scoring du Verdict.

Exemple :

Un utilisateur doit pouvoir considérer :

- 30 min comme déjà mauvais ;
- ou 1 h 15 comme encore acceptable.

## 17. Ajout automatique domicile → travail

- [x] Si l’annuaire contient une adresse domicile et une adresse travail, ajouter automatiquement le temps domicile-travail dans Transports.
- [x] Ne pas demander de recréer manuellement le trajet.
- [x] Identifier visuellement que cette donnée vient de l’annuaire.
- [x] Éviter les doublons si la même destination a déjà été ajoutée manuellement.

## 18. Loader annuaire / adresses personnalisées

Ajouter un loader visible :

`Chargement des adresses personnalisées…`

Il doit couvrir :

- [x] chargement des adresses personnalisées ;
- [x] chargement de l’annuaire ;
- [x] détection domicile / travail ;
- [x] préparation/calcul des trajets associés.

Ne pas afficher temporairement un état vide pendant le chargement.

## 19. État des critères et des données

Répertorier les nouvelles données dans `État des critères et des données`.

Afficher au minimum :

- [x] état de chargement de l’annuaire ;
- [x] état des adresses personnalisées ;
- [x] succès / erreur ;
- [x] disponibilité du trajet domicile-travail ;
- [x] disponibilité des temps de trajet personnalisés.

Une erreur ne doit pas être ignorée silencieusement.

## Validation du lot

Valider le flux complet : ajout depuis l’annuaire, seuils modifiés et appliqués au score, suppression, domicile-travail automatique, absence de doublons, chargement visible et erreurs exposées. Prévoir aussi les cas sans adresse, sans domicile/travail et sans trajet disponible.

## Revalidation réelle IGN — 22/10/2026 à 23:03–23:07 (Europe/Paris)

Statut : **completed**. Réserve de géocodage distant levée, sans relancer les
187 tests ni modifier sources, tests, catalogues ou configuration.

- [x] Création depuis le `+ Transports` et le formulaire existant d’une adresse
  publique réellement résolue par IGN : `17 Boulevard de Vaugirard 75015 Paris`.
- [x] Aucun rôle domicile/travail attribué à l’entrée temporaire.
- [x] Sélection de cette adresse nouvellement géocodée ; défauts 40/60 observés,
  seuils 25/75 enregistrés puis retrouvés dans le détail courant du trajet.
- [x] Loader puis trajet GTFS réel de 35 min affiché comme neutre, avec sa réserve
  de couverture partielle/marche estimée explicitée. La réserve 01 reste indépendante.
- [x] Suppression uniquement de l’entrée et du trajet de test ; 5 entrées avant
  et après, contenu/chips de rôles utilisateur inchangés et 0 trajet avant/après.
- [x] Preuves et sondes HTTP 200 des endpoints actuels consignées dans
  `reports/03.md`, `handoffs/03.md` et `proofs/03/ign-20261022-real-validation.json`.
