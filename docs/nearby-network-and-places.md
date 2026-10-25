# Données commerciales et appels du score de quartier

## Surfaces précompilées

`/api/places/shopping-centres` et `/api/places/supermarket-footprints` lisent
`public/data/places`. En production, les lectures passent par le binding statique
Pages `ASSETS`; en développement, par les mêmes fichiers. La sélection inclut
toutes les communes dont l'emprise intersecte le rayon (5 km pour les centres,
2 km pour les supermarchés), puis filtre les lieux par distance et identifiant OSM.
Aucune recherche Overpass n'est effectuée par ces endpoints.
Un index `commercial-places.json`, extrait des mêmes enregistrements, évite de
charger toutes les données d'une grande commune dans le Worker. Les anciennes
publications sans index restent lisibles via leurs fichiers de communes.

## Fiches et cercles de commerces

Le clic sur un lieu, sur la carte principale ou dans l’annuaire, cadre l’adresse,
le lieu et tous les sommets de la marche. L’arrivée d’un itinéraire calculé
remplace le cadrage initial ; les marges réservent les contrôles et l’échelle.
La fiche réutilise le nom traduit, la catégorie et toutes les métadonnées
compilées. Le format petite/moyenne/grande surface est indicatif, issu du type
OSM (`convenience`, `supermarket`, `hypermarket`/`department_store`/`mall`).
Une emprise mesurée est affichée séparément ; elle n’est pas une surface de vente.
Les autres formats et les contacts absents restent explicitement non renseignés.

Le cercle transmis à `/map` par `temporaryMarkerRadius` utilise
`useNearbyPlaces` et le même fournisseur compilé que les rayons 2/5 minutes des
lignes. Les communes dont la bbox intersecte l’enveloppe du rayon sont chargées,
puis la distance géographique exacte filtre les lieux. Le rayon n’est plus
silencieusement borné à 100–2 000 m. Le cercle affiche le prédicat commerce
commun, indépendamment du filtre de sorties de week-end utilisé par les lignes.
Les temps 2/5 minutes autour des lignes conservent leur sens existant affiché
dans l’interface : approximation à vol d’oiseau, 80 m/min.

Le loader des lieux commence dès la programmation du rafraîchissement, couvre
le debounce de 2,5 secondes et attend toutes les réponses et tous les fichiers
de communes. Une réponse obsolète ne peut ni publier des lieux d’un ancien
rayon, ni arrêter ce loader. La liste des villes possède un état de chargement
séparé, couvrant la direction et le chargement du jeu IRIS nécessaire aux zones.

Audit du jeu communal du 14 septembre 2026 : 537 808 lieux, 69 653 horaires,
48 458 sites web, 58 445 tags d’accessibilité et 861 emprises mesurées. Aucun
email n’y est présent. `OSM_PRESERVED_TAG_KEYS` conserve maintenant les tags
`email`, `contact:email`, `contact:website`, `phone`, `contact:phone` et
`brand:wikidata`. Le compilateur backend importe directement cette fonction
depuis ce dépôt. Cette correction vaut pour les prochaines compilations et
les réponses de repli normalisées ; elle ne restaure pas les contacts déjà
supprimés des fichiers publiés. Les données actuelles n’ont pas été régénérées.
Les preuves détaillées de cet audit sont dans le rapport du lot 06 du 22 octobre.

`areaM2` est optionnel : seuls les contours OSM fermés vérifiés produisent une
surface. Les trous sont soustraits des multipolygones. Les noms, enseignes et
points OSM ne permettent jamais d'inventer une surface.

`npm.cmd run places:compile -- <arguments du compilateur>` conserve les options
du compilateur backend, puis enrichit les surfaces avant publication.
`npm.cmd run places:enrich-surfaces` enrichit un jeu existant sans refaire les
lieux. Le serveur OSM local configuré par `PLACES_OVERPASS_URL` est privilégié
(défaut : `http://127.0.0.1:12345/api/interpreter`). `--endpoint=...` permet un
endpoint explicite. `manifest.surfaceCoverage` indique la date et les nombres de
lieux vérifiés et de surfaces connues ; les checksums et tailles sont recalculés.
Tous les appels OSM terminent avant la modification des fichiers publiés.

## Budgets et concurrence

Le réglage automatique est limité à quatre tâches dans tous les environnements.
`UNLIMITED_NETWORK=true` et le réglage utilisateur Illimités restent des overrides
explicites. Le délai de 45 secondes démarre au début d'une tâche, après son attente
dans la file, et couvre également le corps de réponse. Les fournisseurs imbriqués
réutilisent le signal et le créneau de leur source ; les orchestrations de centres
commerciaux libèrent leur créneau avant de planifier leurs trajets enfants.

Les trajets de marche sont traités par lots de six et publiés après chaque lot.
Un appel Navitia de marche ou ORS est limité à 12 secondes, corps inclus ; une
matrice PRIM complète est limitée à 30 secondes. Les destinations restantes sont
retournées comme approximations explicites, non persistées dans le cache de routes.
La page affiche une erreur partielle lorsque ces approximations sont utilisées.
Le proxy PRIM borne ses appels à 20 secondes, attente et corps inclus, et retourne
un message JSON explicite en cas de timeout ou d'échec. Sur Workers, il ne partage
que des réponses terminées entre invocations, jamais une promesse d'I/O en cours.

## Régulateur PRIM partagé sur Cloudflare

Le repli Node/instance espace les départs de 260 ms et respecte `Retry-After`,
mais seule la liaison Durable Object assure la coordination entre instances.
Le code est dans `workers/idfm-rate-gate`. L'identité de l'objet est le SHA-256 de
la clé serveur ; la clé brute ne lui est jamais envoyée. Le créneau de départ et
les cooldowns par famille API sont stockés dans une transaction. Un coordinateur
lié mais indisponible provoque une erreur bornée, sans contournement du throttle.

Activation (non effectuée automatiquement par cette modification) :

1. Déployer le Worker : `npx.cmd wrangler deploy --config workers/idfm-rate-gate/wrangler.jsonc`.
2. Dans les bindings du projet Pages, ajouter un Durable Object `IDFM_RATE_GATE`,
   classe `IdfmRateGate`, Worker `transport-clock-idfm-rate-gate`.
3. Redéployer Pages ; configurer la même liaison sur les autres déploiements qui
   utilisent cette clé. Les processus locaux non liés gardent un régulateur local.

Cloudflare Pages exige un Worker séparé pour créer et déployer un Durable Object :
[documentation officielle](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects).
