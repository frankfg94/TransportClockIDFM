# Radar piéton global — IDFM → Nuxt → carte

Le radar de `/map` (Deck.gl) et `/map/legacy` (Canvas2D) est désactivé au
démarrage. Il conserve ses réglages pendant la navigation, sans persistance
globale. Les contrôles du radar ne changent jamais les filtres du réseau.

## Responsabilités

- **IDFM** : ORS Docker, catalogue complet, checkpoints, calculs et unions,
  production d'un seul fichier `walking-isochrones.zip`.
- **Nuxt** : lecteur indexé du fichier local ou distant/R2, validation et cache.
  Aucun appel ORS ni union géométrique au runtime.
- **Frontend** : demande uniquement les modes/lignes et durées sélectionnés via
  `GET /api/map/isochrones`. Le ZIP global n'est jamais envoyé au navigateur.

La priorité est : ligne entière (tous sens/branches, correspondances exclues),
puis preset explicitement sélectionné (Bus/Noctilien inclus), puis modes visibles
du plan général/personnalisé, hors Bus/Noctilien. L'aperçu d'itinéraire suspend le
radar. Durées : 5/10/15/20/25/30 minutes. Défauts : métro/tram/câble 10, RER 15,
train/Transilien 20, bus/vélo 5, Noctilien 10.

## Installer ORS Docker

Depuis **idfm-node-backend**, avec Docker Desktop démarré :

1. Installer les dépendances : `npm install`.
2. Lancer `npm run ors:install` (ou son alias `npm run ors:up`).
   La commande sélectionne le dernier snapshot Geofabrik commun aux cinq
   extraits [Île-de-France, Haute-Normandie, Centre-Val de Loire, Picardie et
   Bourgogne](https://download.geofabrik.de/europe/france.html). Elle réutilise
   le PBF Île-de-France existant s'il correspond à ce snapshot, télécharge les
   quatre compléments manquants, vérifie MD5 et SHA-256, fusionne les sources
   avec `osmium-tool`, puis configure et démarre ORS Docker.
   Les sources et la provenance sont conservées dans `.data/ors/sources/` et
   `.data/ors/files/network.osm.pbf.json` sous l'identifiant `idf-extended-v1`.
3. L’installation attend automatiquement le statut `ready` sur
   `http://127.0.0.1:8080/ors/v2/health`. Les logs restent disponibles avec
   `npm run ors:logs`. Le calcul de l’atlas n’est pas lancé automatiquement.

Une relance réutilise le dataset étendu et le graphe si leurs hashes sont
valides. Un téléchargement est publié par renommage atomique après validation,
avec trois tentatives bornées pour le MD5, le flux et le checksum ; un échec ne
remplace pas un ancien snapshot ou PBF valide. Les `.part` temporaires sont
nettoyés à l’arrêt normal. L’installateur n’écrase aucun fichier `.env` et ne
configure aucune clé ORS.

Options explicites :

```powershell
npm run ors:install -- --refresh
npm run ors:install -- --download-only
npm run ors:install -- --keep-archives
npm run ors:install -- --timeout-minutes=60
npm run map:isochrones:build -- --keep-archives
```

`--refresh` sélectionne et installe explicitement un nouveau snapshot commun ;
`--download-only` prépare et valide le dataset fusionné sans démarrer ORS (il
faut néanmoins `osmium-tool` local ou le fallback Docker pour la fusion). Après
un graphe prêt, les PBF sources et fusionnés sont supprimés par défaut ; après
une génération complète, les checkpoints sont également supprimés. Ajouter
`--keep-archives` à `ors:install` et/ou `map:isochrones:build` pour les garder.
Le délai d’attente par défaut est 45 minutes. En cas de délai dépassé, le
conteneur continue sa préparation ; la commande peut être relancée sans nouveau
téléchargement. Un verrou empêche deux installations simultanées. Après un
arrêt brutal, vérifier les processus avant d’enlever `.data/ors/install.lock`.

Le dataset étendu couvre les cinq régions configurées, mais ne garantit pas la
complétude des chemins aux frontières ou au-delà de cette emprise. Le générateur
signale toute origine indisponible avec ses coordonnées, stations, lignes et
catégorie ; le seuil de snap reste strictement fixé à 250 m.

Le Compose fourni utilise l'image versionnée ORS v9.7.1, uniquement
`foot-walking`, sans téléchargement d'altitude, cinq origines et six intervalles.
Le port n'est exposé que sur 127.0.0.1. Graphe et logs persistent dans des volumes.
Le plafond Java de 4 GiB est un réglage initial, pas une garantie de capacité :
ajuster `ORS_JAVA_HEAP` dans `.env.local` ou l’environnement de l’installateur si nécessaire.
L'extrait OSM, les checkpoints et les volumes ne sont pas distribués.

`npm run ors:stop` arrête le service sans supprimer le graphe.
Chaque version du PBF/configuration reçoit automatiquement son propre répertoire
de graphe dans le volume persistant. Un changement entraîne une nouvelle
construction ; une relance à version identique retrouve son graphe. Aucun ancien
graphe n’est supprimé automatiquement. Les empreintes et l’état d’installation
sont enregistrés sous `.data/ors/`. Ne pas lancer directement `docker compose up`
sans `ORS_GRAPH_VERSION` : préférer l’installateur qui sélectionne le bon graphe.

Sources : [ORS Docker](https://giscience.github.io/openrouteservice/run-instance/running-with-docker),
[extraits OSM](https://download.geofabrik.de/europe/france.html).

## Génération explicite dans IDFM

```powershell
npm run map:isochrones:build -- --dry-run
npm run map:isochrones:build
npm run map:isochrones:build -- --line=line:IDFM:C01384
npm run map:isochrones:build -- --modes=BUS,NOCTILIEN
npm run map:isochrones:build -- --all
```

Une commande avec `--line` traite **toutes les stations de cette ligne**, tous
sens et branches, sans relance manuelle station par station. Les lots HTTP
internes contiennent au plus cinq origines. Les six durées sont demandées
ensemble, avec `location_type: destination` : d'où peut-on rejoindre la station ?

Le catalogue source est celui de `generate-global-map` :
`GLOBAL_MAP_OUTPUT_DIR` ou `../TransportClockGPT/public/data/global-map/v1`.
Le générateur lit les rattachements station–ligne du catalogue complet, pas les
listes de stations parfois vides du bootstrap. Les origines aux coordonnées
canoniques arrondies à cinq décimales sont dédupliquées entre lignes et modes.

La sortie est `idfm-node-backend/public/data/isochrones/walking-isochrones.zip`,
séparée du dossier remplacé par la compilation de carte.
Options : `--output`, `--map-dir`, `--cache-dir`, `--requests-per-minute`,
`--max-requests`. `--all`, `--modes` et `--line` sont exclusifs.
Le raccourci NPM homonyme du projet Nuxt délègue à IDFM ; ses chemins sont donc
résolus depuis IDFM.

Par défaut : ORS local sans clé, 60 requêtes/minute maximum, exécution séquentielle.
Pour l'API publique, configurer `ORS_API_URL=https://api.openrouteservice.org`
et `ORS_API_KEY` (ou `NUXT_ORS_API_URL` / `NUXT_ORS_API_KEY`), uniquement
dans IDFM. La cadence par défaut devient 15/minute. Utiliser `--max-requests`
pour borner le quota consommé ; les reprises HTTP comptent dans ce budget.

Les checkpoints atomiques sont dans `.data/map-isochrones/` pendant le calcul.
Ils sont supprimés après publication complète par défaut ; `--keep-archives` les
conserve pour une reprise/debug. Le cache dépend du fournisseur, des paramètres et de la révision OSM/ORS. Pour le Docker fourni,
le PBF et les configurations sont hachés automatiquement. Pour un autre serveur,
renseigner et actualiser `ORS_DATA_VERSION`. Garder le même graphe et le même PBF
permet de recalculer hors ligne, mais ne les actualise pas automatiquement.

Trois tentatives au maximum pour réseau/408/429/5xx génériques, respect de Retry-After.
L'erreur ORS HTTP 500/code 3099 est isolée par station : le lot est décomposé,
les origines valides sont conservées et la commande poursuit les stations suivantes.
Ce code n'est pas présenté comme un quota. Les erreurs de service génériques,
d'authentification ou de quota arrêtent toujours le calcul avec reprise possible.
Chaque origine rejetée est affichée avec coordonnées, noms, identifiants, lignes
et raison du rejet ; un bilan distingue origines indisponibles et non traitées.

Le `center` retourné par ORS doit être valide pour chacune des six durées et à
**250 mètres maximum** de la station canonique. Un point absent ou trop éloigné
invalide toute l'origine : un succès HTTP ne suffit pas. Cela évite notamment de
publier des surfaces ramenées à la frontière de l'extrait OSM pour une gare hors
région. Ce contrôle ne garantit pas la complétude des chemins près des frontières :
un extrait plus large reste nécessaire pour couvrir intégralement ces stations.
La politique de validation fait partie de l'empreinte de cache. Les anciens
checkpoints/unions sans cette vérification ne sont pas réutilisés ; les fichiers
de cache restent sur disque. Le premier lancement après cette correction recalcule
donc les origines demandées, les relances suivantes réutilisent celles validées.

Un arrêt/quota conserve les résultats acquis et publie une couverture partielle
**seulement si elle contient des surfaces utilisables**. Sinon la commande échoue
sans publier de ZIP vide et sans modifier un fichier existant. Une ancienne archive
vide n'est pas supprimée automatiquement ; une génération réussie la remplacera.
Relancer reprend les origines manquantes. Codes de sortie : 0 terminé,
2 partiel/interrompu, 1 erreur fatale. L'ajout de bus préserve les unions compatibles.
Les unions `polygon-clipping` conservent trous et multipolygones.
Publication par fichier temporaire puis renommage atomique ; verrou `.lock`.
Après un arrêt brutal, vérifier qu'aucun générateur n'est actif avant d'enlever
un verrou résiduel. La génération reste indépendante des builds web/Android.

## Distribution locale ou R2, côté Nuxt uniquement

En développement Node, Nuxt lit par défaut le fichier de son voisin IDFM.
Un autre chemin absolu peut être configuré :

```dotenv
IDFM_MAP_ISOCHRONES_LOCAL=C:/data/isochrones/walking-isochrones.zip
```

Sur Cloudflare Pages, configurer une source distante dans l'environnement serveur :

```dotenv
IDFM_MAP_ISOCHRONES_REMOTE=r2://idfm-backend-netex-cache/isochrones/walking-isochrones.zip
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Une URL HTTPS est aussi acceptée, si elle supporte HEAD, les requêtes Range,
un ETag fort et le contenu ZIP sans encodage HTTP supplémentaire.
La source distante est prioritaire. Les URLs et clés ne sont jamais fournies
par les paramètres du frontend. Le backend réutilise la signature R2 existante.
Voir [lectures Range R2](https://developers.cloudflare.com/r2/api/s3/api/).

Publication **facultative et explicite**, depuis IDFM, avec un remote rclone déjà
configuré :

```powershell
npm run map:isochrones:publish:r2 -- --remote mon-remote:mon-bucket/isochrones/walking-isochrones.zip --dry-run
npm run map:isochrones:publish:r2 -- --remote mon-remote:mon-bucket/isochrones/walking-isochrones.zip
```

On peut définir `MAP_ISOCHRONES_R2_REMOTE` à la place. Cette commande valide
l'archive avant envoi. Ni génération ni build ne téléversent automatiquement.
Le ZIP n'étant pas un asset Pages, sa limite de 25 MiB ne s'applique pas.
Limites du générateur : ZIP 128 MiB, chaque entrée décompressée 32 MiB.
Ne pas placer l'archive dans les assets publics Nuxt.

## Contrat et performances

ZIP standard single-disk, Deflate, sans ZIP64 ni commentaire. Index schema 1 :
version exacte du catalogue, date, attribution, paramètres, empreinte de calcul
et révision source ; couvertures station par scope. Les géométries sont sous
`zones/<scope encodé>/<minutes>.json` pour modes et lignes.

Nuxt lit le répertoire ZIP et l'index, puis seulement les entrées sélectionnées.
CRC, tailles, géométries et version sont validés. Les lectures R2 sont conditionnées
par ETag pour ne pas mélanger deux publications. Le fichier local reste ouvert
durant une requête pour conserver un instantané cohérent.
Cache : au plus deux index, cinq minutes, 24 MiB estimés de géométries par index.
La requête publique est bornée à neuf scopes uniques ; réponse maximum 64 MiB.

Le worker frontend ne décompresse plus de ZIP : il valide le JSON ciblé, annule
les requêtes obsolètes et conserve un LRU de 24 MiB estimés/24 sélections, une minute.
Pan/zoom n'invalide ni la sélection ni les projections Canvas/paquets Deck.
Les erreurs restent typées (absent/incompatible/invalide/indisponible), sans chemin
serveur exposé, avec modal Réessayer. Une couverture partielle garde les zones
disponibles et un indicateur visible ; aucune approximation circulaire.

**Capacitor** utilise `toServerApiUrl()` et `NUXT_PUBLIC_API_BASE_URL`.
Cette architecture requiert une connexion à l'API pour les zones non chargées :
elle n'embarque pas l'atlas complet et ne prétend pas fournir un pack hors ligne.
Le composable de proximité existant conserve ses seuils 5/10/15 minutes.

## English summary

The IDFM backend owns explicit generation via local ORS Docker and outputs one
versioned ZIP. A whole line is processed in one command (all directions/branches),
with internal five-origin batches and six destination walking ranges.
Nuxt reads only selected ZIP entries from local disk, HTTP Range or private R2,
checks CRC/version/geometry, and caches the index and shapes. The browser/native
app requests only selected scopes and durations through `/api/map/isochrones`;
it never downloads the global ZIP or calls ORS. Camera changes trigger no new
geometry work. Missing/partial data remains explicit and retryable.

Run the setup/generation commands above **inside idfm-node-backend**.
`npm run ors:install` selects a common Geofabrik snapshot for the five configured
extracts (Île-de-France, Haute-Normandie, Centre-Val de Loire, Picardie and
Bourgogne), reuses a matching local Île-de-France PBF, downloads the four missing
complements, verifies MD5/SHA-256, merges with local `osmium-tool` or the pinned
Docker fallback, then configures Docker and waits for readiness. Docker Desktop
must already be installed/running for ORS startup; `--download-only` only needs
the merge backend. Java and manual YAML/.env edits are not needed. Use
`--refresh` for an explicit snapshot update. Existing files/graphs are reused,
and old graph revisions are retained.
Keep `.data/map-isochrones` and Docker graph volumes for resumability.
Dataset/config fingerprints invalidate stale origin calculations. Successful
one-shot builds clean raw PBF/checkpoint archives by default; pass
`--keep-archives` to retain them. R2 publication is a separate, opt-in command;
ordinary builds neither calculate nor upload.
Configure `IDFM_MAP_ISOCHRONES_LOCAL` or server-only
`IDFM_MAP_ISOCHRONES_REMOTE`. Native clients use `NUXT_PUBLIC_API_BASE_URL`;
uncached radar coverage requires connectivity, not an embedded offline pack.

## Validation

From TransportClockGPT:

```powershell
npm run test -- tests/globalMapIsochroneGenerator.test.ts tests/globalMapIsochroneServer.test.ts tests/globalMapIsochroneWorker.test.ts tests/globalMapIsochrones.test.ts tests/globalMapIsochrones.dom.test.ts tests/globalMapIsochroneRendering.test.ts tests/nearbyIsochrones.test.ts
npm run tsc
npm run build
npm run build:capacitor
```

Generator tests deliberately import the IDFM entry point to verify compatibility
with the shared archive contract. Fixtures consume no ORS quota.
Installer tests: `npm run test:isochrones:install` inside idfm-node-backend.
