# Lot 04 — Home — prochain passage immédiat et wording de la pluie

Tâches de la liste originale : n° 2, n° 4.

Portée : Deux petites tâches sur la Home.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

Deux changements d’expérience sur la même page : ouverture directe du prochain départ et formulation de la météo. Leur portée reste limitée ; le gros algorithme de classification RER est isolé dans le lot 05.

## Prérequis et ordre

Aucun prérequis. Si les lots 04 et 05 sont exécutés successivement, conserver les changements déjà présents autour des départs.

## Points d’entrée à explorer

- `pages/index.vue`
- `src/App.vue`
- `src/features/service-pattern/DeparturePatternModal.vue`
- `src/features/weather/WeatherExperience.vue`
- `src/features/weather/useWeatherExperience.ts`
- `tests/weatherNormalization.test.ts`
- `tests/departurePatternWorkflow.test.ts`

## 2. Home — DeparturePatternModal / prochain passage

- [x] Sur la Home, quand on clique sur le bouton `lucide-route-icon lucide-route`, afficher directement l’heure du prochain passage dans `DeparturePatternModal`.
- [x] Ajouter la classe CSS `travel-details`.
- [x] Éviter une interaction supplémentaire pour afficher le prochain départ.

## 4. Home — météo pluie

Améliorer le wording actuel.

Actuellement, un cas peut afficher :

`Pluie prévue dans 0 min`

avec :

`Prends un parapluie si tu pars après 09:18 · 12 °C · ressenti 11 °C · fin dans 57 min`

Quand la pluie commence immédiatement ou est déjà en cours :

- [x] Remplacer par :
  - `Pluie légère en cours`
  - `Pluie moyenne en cours`
  - `Pluie forte en cours`
- [x] Sous-titre :
  - `Prends un parapluie · 12 °C · ressenti 11 °C · fin dans 57 min`
- [x] Ne plus afficher `si tu pars après XX:XX` lorsque la pluie est déjà là.
- [x] Déduire automatiquement l’intensité à partir des données météo.
- [x] Ne pas hardcoder les seuils météo directement dans le composant UI.
- [x] Éviter les états absurdes ou instables autour de `0 min`.

Pour une pluie réellement future, conserver une logique du type :

`Pluie prévue dans 18 min`

`Prends un parapluie si tu pars après 09:38 · 12 °C · ressenti 11 °C · début dans 18 min`

## Validation du lot

Contrôler dans le navigateur qu’un clic suffit à afficher l’heure du prochain départ et que la classe demandée est présente. Vérifier la pluie en cours, son intensité et la pluie future, notamment la transition autour de zéro minute.

## Résultat du 22/10/2026

Exigences réalisées et vérifiées. Voir [rapport du lot 04](reports/04.md), avec preuves navigateur, tests météo et comparaison des cinq échecs DOM antérieurs à l’ajout.
