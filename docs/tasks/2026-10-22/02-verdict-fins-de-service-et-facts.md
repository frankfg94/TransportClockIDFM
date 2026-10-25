# Lot 02 — Verdict — fins de service et détail des lignes structurantes

Tâches de la liste originale : n° 1, n° 14.

Portée : Deux améliorations ciblées.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Pourquoi ce regroupement

Ces deux tâches concernent les facts Transports existants du Verdict : contenu affiché, données théoriques et détail des lignes. Elles partagent le contexte des facts sans nécessiter la fonctionnalité de trajets personnalisés.

## Prérequis et ordre

Aucun prérequis strict. Si le lot 01 a changé le pipeline Transports, travailler sur son résultat actuel.

## Points d’entrée à explorer

- `src/features/nearby-stations/NearbyNeighborhoodScoreFact.vue`
- `src/features/nearby-stations/useNearbyNeighborhoodScore.ts`
- `src/features/nearby-stations/neighborhood/verdict-transport-facts/lastServices.ts`
- `src/features/line-map/useLineFrequencyTimetable.ts`
- `src/features/nearby-stations/neighborhood/contracts.ts`

## 1. Verdict — horaires de fin de service

- [x] Vérifier que les horaires de fin de service des transports lourds et moyens sont bien affichés dans la page Verdict.
- [x] Vérifier que ces horaires utilisent correctement les données théoriques disponibles.
- [x] Gérer proprement les cas où les données sont absentes ou incomplètes.

## 14. Facts transports — détailler les lignes structurantes

Quand un fact affiche par exemple :

`4 lignes structurantes à proximité`

- [x] Ajouter dans le tooltip le détail des lignes.
- [x] Regrouper / distinguer les types de transport :
  - métro ;
  - RER ;
  - Transilien ;
  - tram ;
  - autres transports structurants pertinents.
- [x] Afficher pour chaque ligne son composant `LineIcon.vue`.
- [x] Réutiliser les composants existants.
- [x] Permettre de comprendre précisément quelles lignes ont généré le fact.

## Validation du lot

Vérifier les fins de service avec données complètes, partielles et absentes, puis la cohérence du nombre de lignes avec le détail du tooltip et les icônes. Réutiliser le composant de ligne réellement présent.
