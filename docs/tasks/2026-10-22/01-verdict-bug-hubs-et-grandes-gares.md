# Lot 01 — Verdict — réparer les trajets vers les hubs et grandes gares

> **Decision utilisateur du 23/10/2026 : validation externe restante du lot 01 dispensee.** Le lot est accepte pour poursuivre les lots suivants, sans declarer les marches IGN/Verdit reel techniquement valides. Voir [la dispense](validation-waivers.md). Les validations Android du lot 12 et la release du lot 13 restent requises.

Tâches de la liste originale : n° 20.

Portée : Gros diagnostic isolé.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

Ce diagnostic traverse le calcul d’itinéraire, les données et le scoring. Le traiter seul évite de mêler une régression existante à de nouvelles fonctionnalités.

## Prérequis et ordre

Aucun prérequis entre les lots. À traiter de préférence avant le lot 03, qui réutilisera le calcul des trajets du Verdict.

## Points d’entrée à explorer

- `pages/nearby-neighborhood-score.vue`
- `src/features/nearby-stations/useNearbyNeighborhoodScore.ts`
- `src/features/nearby-stations/neighborhood/verdict-transport-facts/benchmarkDestinations.ts`
- `src/features/nearby-stations/neighborhood/verdict-transport-facts/employmentHubs.ts`
- `src/features/nearby-stations/neighborhood/verdict-transport-facts/largeStations.ts`

## 20. BUG Verdict — hubs d’emplois et grandes gares indisponibles

URL de reproduction :

`nearby-neighborhood-score?lat=48.793710645211405&lon=2.28830452778152&address=48.79371,+2.28830&city=Fontenay-aux-Roses`

Problème :

- [x] Symptôme initial des hubs contrôlé : les cinq hubs affichent une durée sur l’URL exacte ; ils n’indiquent plus tous `Temps vers X indisponible`.
- [x] Même contrôle réalisé pour les quatre grandes gares : durées présentes.

Analyser si le problème vient :

- du calcul d’itinéraire ;
- du parsing lat/lon ;
- de l’adresse source ;
- d’une API ;
- d’un rate limit ;
- d’un filtrage de modes ;
- d’un composable partagé ;
- de données calculées mais non propagées à l’UI.

À vérifier :

- [x] Inspecter les données brutes.
- [x] Savoir si aucun trajet n’est calculé, s’il est rejeté, ou si la durée est simplement perdue : benchmarks calculés et transmis ; correctif de reprise du catalogue déjà présent.
- [x] Tester au minimum :
  - un hub d’emploi proche ;
  - un hub plus éloigné ;
  - une grande gare parisienne.
- [x] Après correction, vérifier que ces temps sont bien utilisés dans :
  - les facts ;
  - le scoring Transports ;
  - `État des critères et des données`.
- [x] Ajouter un test de non-régression avec cette URL précise.

Les hubs et grandes gares sont des repères descriptifs du contrat existant ; leurs durées figurent dans les facts et les motifs Transports, sans nouveau bonus numérique. Châtelet contribue à la note. Cette vérification ne change pas la pondération.

## Validation du lot

Reproduire l’URL exacte ci-dessous, distinguer absence de calcul, rejet et perte de durée, puis vérifier les trois destinations demandées jusque dans les facts, le score et les états de données. Conserver les preuves et le test de non-régression.

### Revalidation externe du 22/10/2026 à 23:17–23:22, Europe/Paris

- [x] Serveur partagé `http://localhost:3000/` vérifié HTTP 200, réutilisé et conservé.
- [x] Fournisseur réel contrôlé : politique `gtfs-access`, proxy `/api/walking/matrix`, IGN BD TOPO ; sonde unique HTTP 200 non estimée, version 2026-10-20.
- [x] Rejeu réel à froid dans un onglet dédié : dix benchmarks calculés ; Vélizy 39 min, La Défense 52 min, Montparnasse 32 min. Segments de rue retenus documentés par IGN ; première matrice des benchmarks sans estimation.
- [x] Propagation actuelle vers facts/motifs/état inspectée ; score Transports observé à 9/10, non certifié final pendant les accès lourds.
- [ ] Obtenir un calcul requis entièrement stabilisé et sans marche estimée/dégradation d’accès transports. Des matrices ultérieures deviennent `unavailable` et les accès lourds restent en cours lors de la collecte.
- [x] Preuves horodatées et limites actualisées dans [reports/01.md](reports/01.md) ; fichiers exacts du diagnostic à arbitrer dans [handoffs/01.md](handoffs/01.md). Onglet dédié fermé, aucune adresse/rôle/préférence modifié.

**Statut de la reprise externe du 22/10 : partial, retour idle.** Les 137 tests et le typecheck précédemment acceptés n’avaient pas été relancés ; sources, tests, catalogues et configuration laissés en lecture seule pendant cette reprise. La disponibilité constatée d’IGN pour un segment n’est pas utilisée pour certifier les autres segments dégradés. Le quota ORS des lieux reste un diagnostic supplémentaire distinct.

### Reprise source autorisée du 23/10/2026

- [x] Conserver HTTP/timeout/réseau/réponse invalide, phase, source et date d’observation, sans message brut/URL/token.
- [x] Distinguer les usages cumulés, paires distinctes et requêtes proxy réellement émises ; ne pas assimiler les réponses IGN en cache à de nouveaux appels.
- [x] Distinguer résolution initiale et rafraîchissements manuel, visibilité et 5 minutes, en laissant les vrais chargements visibles.
- [x] Reproduire puis corriger la duplication des requêtes encore en cours au-delà de 1024 entrées, dans les caches navigateur et d’accès final, sans retirer de parcours.
- [x] Exécuter 137 tests liés sur 9 fichiers (`--maxWorkers=1`, TEMP/TMP locaux), typecheck et contrôle du diff. Les chemins des tests ont été inscrits au handoff avant édition.
- [x] Vérifier le serveur avant démarrage : connexion refusée constatée, puis redémarrage unique localhost:3000 ; serveur conservé. Hash générique du lot 11 inchangé.
- [x] Sonder une seule fois le fournisseur après redémarrage : proxy HTTP 200 avec estimation, **amont IGN HTTP 404** à 20:03:49 Europe/Paris. Découverte HTTP 200 à 20:04:31, opération `/route?`, ressource `bdtopo-osrm` absente. Aucun ancien quota déduit ni autre ressource choisie.
- [ ] Rejouer le Verdict réel complet après ces corrections, lorsque le contrat requis est disponible, et vérifier la fin du calcul initial, les trois destinations et leurs marches sans dégradation requise. Rejeu non lancé dans l’état 404 actuel pour ne pas multiplier les échecs.

**Statut à l'issue de cette reprise source : partial ; code et tests terminés, contrat effectif et validation navigateur restants.** Rapports, preuves et handoff actualisés. Aucune source du lot 11 ni autre contrat partagé modifié. Les six réservations étaient libérables après ce tour idle ; aucun onglet/helper de validation en attente et aucun arrêt du serveur partagé.

### Adaptation du contrat IGN du 23/10/2026, à partir de 20:59 Europe/Paris

- [x] Réserver avant édition seulement `server/services/walking/ignWalkingMatrix.ts` et `tests/ignWalkingMatrix.test.ts` ; autres sources stables en lecture seule.
- [x] Établir l'équivalence des options piétonnes BD TOPO de `bdtopo-valhalla`, ressource publiée, et conserver fastest, unités, géométrie, intermédiaires, sens et marges. Inclure l'identité du contrat dans les clés serveur ; aucune version inventée ni cache navigateur purgé.
- [x] Exécuter 35 tests ciblés sur 2 fichiers ; résultats typecheck/diff et empreintes conservés dans `reports/evidence/01/contract-validation.json`.
- [x] Effectuer une seule sonde de calcul réel : proxy HTTP 200 mais `/navigation/route` + Valhalla amont HTTP 404 à 21:00:23. L'inférence du chemin public depuis les capacités a ensuite été corrigée : le code final conserve `/navigation/itineraire` publié par IGN et utilise `bdtopo-valhalla`.
- [x] Sonder en réel **la combinaison finale `/itineraire` + Valhalla**, lors de la reprise immédiate autorisée à 21:08:27 : serveur partagé HTTP 200, contrat final chargé dans Nitro, proxy HTTP 200 mais amont IGN **HTTP 404**, `straight-line`, estimation explicite, deux coordonnées et version absente. Ce résultat final est distinct du 404 de `/route`.
- [ ] Obtenir une marche réseau IGN non estimée pour ce contrat final avant le grand Verdict ; aucune répétition du même contrat après le 404 final et aucun quota ancien déduit.
- [ ] Lancer ensuite un seul Verdict froid si marche non estimée, terminer le calcul initial et vérifier Vélizy/La Défense/Montparnasse, facts/score/états et provenance/version de toutes les marches requises, sans dégradation.

### Dernier contrôle ciblé du 23/10/2026 à 21:53 Europe/Paris

- [x] Relire capacités, diagnostics et exemple officiel ; vérifier HTTP 200 du serveur partagé sans redémarrage.
- [x] Effectuer au maximum deux contrôles publics distincts : point à point piéton start/end distincts, sans intermédiaire, puis forme réelle aller/retour de la matrice Fontenay. Les deux renvoient HTTP 404, `application/json; charset=utf-8`, 21 octets et le seul message public nettoyé `error: Not found`.
- [x] Distinguer la portée : ce n'est pas une page HTML de proxy ; l'échec n'est pas propre à start=end ou aux intermédiaires. Le message générique ne précise pas chemin/ressource/routage et ne prouve pas une panne globale IGN ou une équivalence opérationnelle réussie.
- [x] Conserver les deux diagnostics nettoyés et leur synthèse dans `reports/evidence/01/ign-contract-shape-*.json`. Aucun jeton/cookie/header sensible/message brut indiscriminé enregistré.
- [ ] Obtenir une réponse réseau IGN exploitable, puis effectuer la validation complète du Verdict demandée plus haut. Aucun défaut applicatif précis à corriger établi par ces deux contrôles ; aucune autre tentative, source modifiée ou solution de contournement par moteur/fournisseur/domaine.

**Statut à l'issue de ces contrôles de forme : partial.** Contrat public non résolu ; cause non localisée par le 404 JSON générique. Les constats suivants apportent une nouvelle preuve externe.

### Reprise POST JSON et client officiel du 23/10/2026 à 22:30–22:33 Europe/Paris

- [x] Relire AGENTS.md et MD01 ; interroger le graphe Graphify existant sans update/rebuild/installation. Aucun nœud de l'adaptateur dans le graphe ; vérification ciblée poursuivie.
- [x] Vérifier localhost:3000 HTTP 200 et le réutiliser sans démarrage ni arrêt.
- [x] Tester une requête distincte officiellement documentée : POST JSON piéton `/navigation/itineraire` + `bdtopo-valhalla`, start/end distincts, sans intermédiaire. À 22:30:26 : HTTP 404, JSON de 21 octets, seul message public nettoyé `error: Not found`. Aucun GET répété.
- [x] Observer le client officiel IGN : avis d'indisponibilité temporaire du calcul d'itinéraire/isochrone ; observer la page de statut officielle liée par IGN : calculs d'itinéraire OSRM, PGR et Valhalla hors ligne, d'autres services opérationnels. Captures et textes accessibles conservés ; aucune date de début/rétablissement de l'incident établie, aucune panne de tous les services inférée.
- [x] Conserver ces nouvelles preuves dans `reports/evidence/01/ign-contract-method-*.json`, `ign-official-unavailability*` et `ign-official-status-routing*`. Aucune réponse réussie ni défaut applicatif précis établi : aucune source/test modifié, aucun changement arbitraire de méthode/moteur/fournisseur/domaine.
- [ ] Après rétablissement public et marche non estimée sur le code final, effectuer le rejeu froid Fontenay complet requis plus haut. L'adaptation reste non certifiée en réel ; aucun grand Verdict lancé pendant l'incident, aucune version inventée.

**Statut global actuel : partial, retour idle.** Indisponibilité publique du calcul d'itinéraire annoncée par IGN et états hors ligne observés, au-delà du seul statut 404. Les 35 tests/typecheck précédents restent applicables à des sources inchangées ; diff/empreintes contrôlés, aucun gain UI/performance revendiqué. Deux réservations et créneau global libérables ; serveur partagé conservé, générique du lot 11 intact, onglet dédié fermé, aucun helper ni écriture en attente. Détails dans [reports/01.md](reports/01.md) et [handoffs/01.md](handoffs/01.md) ; `execution.json` laissé au coordinateur.
