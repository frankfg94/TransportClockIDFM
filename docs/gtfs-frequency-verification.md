# Vérification des fréquences GTFS — 31 août 2026

## Données locales

Import officiel IDFM du 30 août 2026 à 14:24:20 UTC, couverture du
27 août au 28 septembre 2026. Journée étudiée : lundi 31 août 2026.

- 513 261 courses conservées sur 2 028 lignes, indépendamment des géométries.
- 11 772 fichiers horaires, 351 209 999 octets (334,94 Mio) au total.
- Plus grand fichier : 659 837 octets (644,37 Kio), sous le plafond de 4 Mio.
- Fichiers fractionnés par ligne et service calendaire ; dictionnaire partagé
  des arrêts et calendriers par ligne.
- Pour le RER A : 47 services, 48 fichiers, 2 862 924 octets de courses.
  Seuls deux services sont utiles au jour étudié, soit 730 837 octets de courses
  à charger, plus le dictionnaire.

La génération a été exécutée avec `--local`, puis `--local --reindex` pour
vérifier la reconstruction à ZIP inchangé. Aucun déploiement ni écriture R2.
Les versions précédentes restent présentes ; le manifeste a basculé en dernier.

## Comparaison indépendante

`scripts/gtfs/verifyFrequency.ts` a comparé les 4 110 courses du RER A et leurs
97 964 passages aux CSV extraits du ZIP : identifiants, service, sens,
destination, ordre, quai, secondes d’arrivée/départ et restrictions concordent.
Le calcul indépendant des médianes locales en pointe confirme les deux sens
du tronçon central, sans appeler le calculateur de fréquences de production.

Les sept chaînes attendues sont présentes, avec un centre unique identifié
par les couples de terminus des parcours complets, sans table propre au RER A.

| Ensemble | Pointe, minutes affichées |
| --- | ---: |
| Moyenne de ligne, stations à poids égal | 6,2 |
| Nanterre-Préfecture — Vincennes, tronçon central | 2,4 |
| Nanterre-Préfecture — Maisons-Laffitte | 5,8–6,2 |
| Nanterre-Préfecture — Saint-Germain-en-Laye | 5,2–5,7 |
| Maisons-Laffitte — Cergy-le-Haut | 11,7–12,5 |
| Maisons-Laffitte — Poissy | 11,8–12,4 |
| Vincennes — Boissy-Saint-Léger | 5,9–6,2 |
| Vincennes — Marne-la-Vallée–Chessy | 4,8–5,2 |

À Châtelet–Les Halles, la médiane locale en pointe est de 140 secondes dans
chaque sens. La valeur du tronçon est une moyenne des médianes locales,
pas une promesse d’intervalle constant ni une valeur forcée à deux minutes.
Les plages nocturnes peuvent inclure l’interruption du service : les grands
intervalles réellement présents ne sont pas transformés en zéro.

Le métro 1 renvoie une seule chaîne sans branche, avec des origines/destinations
explicites pour les deux sens. Son affichage conserve une seule grille.

## Performances observées

Sur le serveur Nuxt local déjà démarré, avec la topologie disponible :

- RER A : 401 ms au premier calcul, puis 15 ms en cache.
- Métro 1 : 418 ms, puis 7 ms en cache.

Ces mesures sont indicatives, hors démarrage/compilation Nuxt et sans garantie
de latence en production. Le premier accès ayant aussi démarré/chargé le serveur
avait pris environ 25 secondes.

## Tests et limites

`npm.cmd run tsc` passe sur l’état final. Le serveur de développement a été
arrêté pendant cette commande pour éviter les écritures concurrentes dans `.nuxt`.

185 tests ciblés passent : import, calendriers, exceptions, minuit, boucles,
services sans géométrie, sens asymétriques, poids égal des stations, trois
branches à six minutes donnant deux minutes au centre, missions partielles,
topologie manquante, caches, anciens manifestes, migrations, publication en cas
d’échec, références de station, sidebar, survol, traduction et contrat historique.
Les 58 tests supplémentaires de la carte globale et de son survol passent aussi
après ajout d’un mock du nouveau service dans leur environnement de test.

La suite complète a également été exécutée : 1 646 tests passent,
35 échouent et 3 sont ignorés. Les échecs observés concernent notamment
les imports/mocks Nuxt `#build/nuxt.config.mjs`, des tests de carte et de trafic,
des URL de pictogrammes, ainsi que des nombres d’arrêts de Lagny figés sur un
ancien jeu GTFS et désormais différents après le rafraîchissement officiel.
Ces autres fonctionnalités n’ont pas été modifiées pour faire passer la suite.

La vérification visuelle dans le navigateur intégré n’a pas pu être effectuée :
sa politique d’accès a bloqué l’URL locale. Aucun contournement n’a été tenté.
Les vérifications de composants DOM et de l’API ne remplacent pas ce contrôle
visuel manuel restant.
