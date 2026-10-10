# Itinéraires théoriques du verdict de quartier

La page `/nearby-neighborhood-score` injecte son propre `TravelRoutesProvider` GTFS. Elle n’utilise pas PRIM pour calculer ses trajets ou ses accès piétons. Les autres consommateurs gardent leur fournisseur et leur politique piétonne par défaut. L’annexe trafic est la seule fonction du verdict qui puisse utiliser PRIM, après un clic, via le cache partagé `/api/traffic`.

## Artefacts et publication

`npm run gtfs:update` construit les géométries, les horaires et le nouvel index de routage à partir du même ZIP officiel. L’index utilise les courses complètes du timetable, les calendriers et exceptions, les identifiants officiels des arrêts, `transfers.txt` et `pathways.txt` lorsqu’ils existent.

Le descripteur `current.json.routing` expose le schéma, le chemin immuable, les dates de couverture, le nombre de connexions, de fichiers et d’octets. Son chemin est `routing/v1/<sha256>/<generation>`. `index.json` contient les arrêts, services, lignes, correspondances et la liste des tranches horaires. Les fichiers `<heure>-<partie>.json` contiennent au plus 65 536 segments, triés par départ, en entiers 32 bits compressés avec gzip. Les références des courses sont conservées.

La publication envoie tous les artefacts avant de remplacer `current.json`, aussi bien en local que sur R2. Un échec de publication du routage conserve les anciens manifestes. `npm run gtfs:stage-pages-assets`, inclus dans `npm run build`, copie uniquement les générations actives dans les assets Cloudflare Pages. Le lecteur serveur réutilise le lecteur GTFS partagé : stockage local, R2 ou binding `ASSETS` de Cloudflare.

## Calcul serveur

`POST /api/neighborhood-journeys` accepte une origine, une date civile `YYYYMMDDTHHMMSS` dans `Europe/Paris`, de 1 à 64 destinations et les modes autorisés. Une destination peut fournir `destinationRef` pour identifier officiellement une station. Avec `arrivalAtPlatform=true` et une référence reconnue, le trajet s'arrête au dernier débarquement dans cette station ; aucune marche de sortie vers son centre géographique n'est ajoutée. Les identifiants monomodaux restent distincts des identifiants de quais. Les caches du fournisseur distinguent cette politique d'arrivée.

Le moteur emploie un [Connection Scan Algorithm](https://arxiv.org/abs/1703.05997) d’arrivée au plus tôt. Il lit les tranches utiles et fusionne les jours de service nécessaires, au lieu de parcourir chaque ligne pour chaque destination. Les heures GTFS supérieures à 24 h et les changements d’heure utilisent l’ancre GTFS « midi local moins douze heures ». Les restrictions de montée/descente et les correspondances génériques ou spécifiques à une ligne/course sont vérifiées avant l’embarquement.

Un arbre origine/date/modes répond à toutes les destinations. Les requêtes simultanées partagent sa promesse. Le cache conserve au plus deux arbres pendant dix minutes ; son identité inclut le chemin des artefacts, la génération du manifeste et l’époque du cache GTFS. Le fournisseur de la page groupe les demandes et conserve les réponses pendant une minute, avec invalidation à réception d’une nouvelle version. L’annulation d’une adresse empêche l’application de ses anciennes réponses.

Les files d’attente par destination sont contournées seulement pour ce fournisseur. L’option `batchQueries` du résolveur de pôles lui permet de présenter toutes ses destinations au fournisseur, qui envoie des lots de 64. Les abonnés d’un même point sont dédupliqués, y compris avec annulation et lorsque l’origine porte des métadonnées différentes. Le fournisseur piéton de cette page groupe aussi les pôles par origine et par portée d’annulation avant d’appeler les matrices ORS.

Les accès et sorties utilisent les matrices ORS dirigées et les caches piétons partagés. La politique optionnelle `ors-only` est aussi transmise aux lieux, centres commerciaux, parcs et futurs pôles du verdict. Une indisponibilité ORS produit une marche explicitement estimée, sans repli PRIM et sans enregistrer cette estimation comme parcours documenté.

Un quota ORS épuisé est identifié séparément d'une erreur réseau. Les nouvelles tentatives sont suspendues pendant le délai de reprise, tandis que les parcours déjà en cache restent utilisables. Un nouvel identifiant de lieu peut réutiliser la même matrice géographique. La relance des sources peut remplacer les estimations par des parcours documentés.

## Couverture et présentation

Le verdict conserve ses repères : prochain jour ouvré à 09:00 et prochain 03:00 pour Noctilien, en heure de Paris. La note retire seulement l’attente initiale. Les détails affichent la durée totale, la marche, toutes les attentes, les correspondances, la date de référence et la version GTFS.

Les seuils d'accès aux pôles du verdict GTFS utilisent aussi cette durée après retrait de l'attente initiale. Un futur pôle peut reprendre la référence d'une station actuelle lorsqu'un unique nom officiel ou alias normalisé correspond dans le rayon de rattachement existant. Cela permet de mesurer l'accès au quai actuel sans inventer les horaires de la future ligne.

Le même rattachement s'applique aux stations de la carte qui ne possèdent qu'une référence de quai NeTEx non reconnue par le GTFS. Une référence officielle déjà présente est prioritaire ; un nom partiel, une station éloignée ou plusieurs références possibles ne permettent pas de rattachement. Cette règle reste propre aux requêtes groupées du verdict.

Les noms et alias officiels sont indexés une seule fois par résolution groupée, uniquement si une destination a besoin du rattachement. Les pôles actuels et futurs partagent cet index ; les sondes suivantes ne parcourent que les homonymes. L'index appartient au lot courant pour conserver la bonne version du catalogue.

Deux segments consécutifs sur la même ligne restent distincts lorsque leurs courses officielles diffèrent. Les détails indiquent le changement de train, la gare, l'attente et les missions disponibles. Un trajet direct peut ainsi arriver plus tard qu'une combinaison express puis omnibus, selon le départ de référence ; aucune durée de trajet ou de correspondance n'est remplacée par une valeur propre à une gare.

Une durée issue de `transfers.txt` est présentée comme un minimum de correspondance GTFS, distinct de la marche mesurée : ce minimum peut inclure une marge, conformément à la [spécification GTFS](https://gtfs.org/documentation/schedule/reference/#transferstxt). Les cheminements de `pathways.txt` conservent leur provenance dans `pathwayTransferIndices` et comptent comme marche ; une durée de cheminement plus courte ne permet pas d'embarquer avant le minimum de correspondance officiel. Aucun temps spécifique à une station n'est codé en dur.

Le calcul est borné à quatre heures, avec un rayon d’accès de 1 200 m et au plus vingt minutes par accès, sortie ou marche de correspondance. Il conserve une alternative ayant pris un transport, ainsi que les arrivées Noctilien par ligne, même lorsqu’une marche directe est plus rapide. Il ne constitue pas une recherche exhaustive de tous les itinéraires possibles.

Les statuts distinguent résultat disponible, partiel, artefacts manquants, date hors couverture et absence de trajet dans la fenêtre. Aucune de ces situations ne déclenche un fournisseur temps réel. Les services nécessitant une réservation et les changements en restant dans le véhicule (`transfer_type` 4/5) sont exclus et signalés par une couverture partielle. Les connexions de marche entre quais du même parent sans durée officielle sont estimées. Cette réserve est volontairement conservatrice à l’échelle du dataset.

## Synthèse documentaire

La première requête documentaire utilise `includeWalking=0`. Sécurité et environnement deviennent utilisables dès cette réponse, indépendamment des trajets. L’enrichissement piéton arrive ensuite et ne recalcule que les catégories concernées. Les échecs peuvent être relancés par source, et les requêtes de l’ancienne adresse sont annulées.

La commune est obtenue depuis les géométries IRIS lorsque les correspondances donnent un unique code communal. L’API Géo reste disponible seulement lorsque cette correspondance manque ou est ambiguë. La fraîcheur documentaire dépend du statut des sources officielles, et non de l’âge de 24 h du fichier compilé. Chargement, erreur, absence de couverture et obsolescence sont des états distincts.

Une catégorie documentaire vide après une réponse réussie n'est pas une source en échec. Sa ligne facultative est omise du diagnostic si d'autres sources alimentent cette catégorie. Les sources obligatoires, les chargements, les erreurs et l'obsolescence restent visibles.

## Vérification

Les tests dédiés couvrent les courses directes, correspondances et branches, permissions spécifiques, modes, restrictions, calendriers et exceptions, minuit, changement d’heure, artefacts incomplets, ORS indisponible, échec documentaire et changement d’adresse. Ils interdisent les tentatives réseau PRIM et vérifient séparément la politique partagée par défaut et l’annexe sur clic. `tests/gtfsUpdate.test.ts` vérifie notamment l’ordre de publication et les manifestes conservés après un échec de routage.

Commandes utiles sous Windows :

```powershell
npm.cmd run gtfs:update -- --local
npm.cmd run check:data
npm.cmd run tsc
npm.cmd run build
npm.cmd run test -- tests/neighborhoodGtfsRouting.test.ts tests/neighborhoodGtfsProvider.test.ts tests/neighborhoodWalkingPolicy.test.ts tests/neighborhoodTrafficAnnex.dom.test.ts tests/neighborhoodDocumentaryProgress.dom.test.ts
node --max-old-space-size=64 --expose-gc --import tsx scripts/gtfs/benchmark-neighborhood-routing.ts
```

Le benchmark local utilise une adresse publique à Châtillon et des accès estimés, sans aucun réseau. Sa date de référence doit être située dans la couverture du manifeste actif ; les mesures de heap Node ne sont pas des mesures de mémoire du Worker Cloudflare.
