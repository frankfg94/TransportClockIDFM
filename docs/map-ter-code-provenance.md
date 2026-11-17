# Codes publics TER sur la carte : état de la provenance

Vérification du 15 novembre 2026. Aucun code commercial SNCF n'est attribué
aux lignes IDFM de la carte sur la seule base des gares ou du nom d'une région.

## Parcours actuel des données

Le manifeste `public/data/global-map/v1/manifest.json` décrit un pack construit le
30 septembre 2026 à partir de `NETEX_IBOO` et du GTFS IDFM de même date (SHA-256
`59a9eacc281de2788efb8f6c3ad7b28824a2ead22792b33ab11a9fe2e12f5e72`). Le
compilateur est dans le dépôt voisin `idfm-node-backend`, fichier
`src/transport/global-map/compileGlobalMap.ts`. Il part de l'index NeTEx, résout
un artefact GTFS par identifiant ou alias, et écrit les lignes dans
`bootstrap.json`. Le catalogue contient les stations ; il ne fournit pas un
second jeu d'identités de lignes. `assetLoader.ts` décode les lignes du
bootstrap, dont `code` provient du code NeTEx ou de la palette, et non d'un
champ attestant un code commercial TER. Les alias et l'identifiant NeTEx source
ne sont pas conservés dans les lignes compactes.

Dans les artefacts GTFS locaux correspondant au pack :

| Identifiant | Noms GTFS (`route_short_name`, `route_long_name`) | Mode GTFS |
| --- | --- | --- |
| `IDFM:C01748` | `TER`, `TER Normandie` | 2 |
| `IDFM:C02370` | `TER`, `TER Normandie` | 2 |
| `IDFM:C02375` | `TER`, `TER Normandie` | 2 |
| `IDFM:C01863` | `TER`, `TER Hauts-de-France` | 2 |
| `IDFM:C01738` | `K`, `K` | 2, Transilien |

Le [référentiel ouvert IDFM](https://data.iledefrance-mobilites.fr/explore/dataset/emission-de-co2e-par-voyageur-kilometre-sur-le-reseau/table/) confirme notamment `C01748` comme `TER Normandie`.

Dans le bootstrap, ces lignes ont un code technique `C…` et, pour les quatre
TER, le libellé `TER`. Le mode `TRAIN` inclut aussi `CDG VAL` et `ORLYVAL`.
La correspondance ne peut donc pas reposer sur le mode ou sur la forme d'un
code. Le tooltip, le catalogue latéral et le panneau de ligne sélectionnée
construisent actuellement leurs badges séparément.

## Sources extérieures examinées

Le [GTFS SNCF national](https://transport.data.gouv.fr/datasets/horaires-sncf)
du 14 novembre 2026 contient notamment les lignes suivantes dans `routes.txt`.
Les codes et couleurs ci-dessous sont des champs de ligne, pas des numéros de
train. L'identifiant est celui de SNCF ; aucun lien d'identité vers une ligne
IDFM du pack n'est fourni directement dans ces champs.

| Réseau ou relation | Identifiant SNCF | Code | Type | Couleur / texte |
| --- | --- | --- | --- | --- |
| NOMAD Normandie, Paris–Deauville | `FR:Line::03A83359-7D9D-4301-9C87-92FED4666451:` | `K3+` | train | `#6E1E78` / `#FFFFFF` |
| NOMAD Normandie, Paris–Argentan–Granville | `FR:Line::6155CD5F-AB2D-4274-A052-8C7462540578:` | `K4` | train | `#BF005F` / `#FFFFFF` |
| Paris–Chartres–Le Mans | `FR:Line::9F945086-5773-42EF-92D0-CCD63F7C134E:` | `K3` | train | `#BF005F` / `#FFFFFF` |
| Caen–Granville–Rennes | `FR:Line::190D9B2F-9FBD-4F51-B6CA-42754F8E6CEF:` | `K8` | **car** | `#BF005F` / `#FFFFFF` |

Le même fichier publie aussi `K3`, `K4` et `K8` pour d'autres relations : le
code seul n'identifie donc pas une ligne nationale. La ligne `K3+` ci-dessus est
distincte des lignes `K3` du fichier ; le suffixe doit être conservé.

Le [GTFS régional normand](https://transport.data.gouv.fr/resources/81942?locale=fr)
examiné le même jour reprend le même identifiant source pour Paris–Deauville
(`ATOUMOD002:Line:FRxLinexx03A83359x7D9Dx4301x9C87x92FED4666451x:LOC`), mais
publie `TER` comme nom court. C'est un lien entre les deux sources normandes,
pas une preuve de correspondance avec un identifiant IDFM. Le flux régional
utilise `ATOUMOD002:Network:002:LOC` pour Nomad Train.

## Rapprochement par circulations observées

Une comparaison des archives officielles IDFM et SNCF publiées le 14 novembre
2026, pour le service du 16 novembre, fournit un lien vérifiable **à l'échelle
de la circulation**. L'outil `scripts/gtfs/audit-ter-cross-feed.py` effectue le
rapprochement : même date de service, numéro de train unique de chaque côté
(`trip_short_name` IDFM et `trip_headsign` SNCF dans ces flux), puis au moins
deux noms de gares distincts dans le même ordre et des heures concordantes à
une minute près. Les numéros ambigus ou les courses sans deux témoins sont
écartés. Le numéro de train sert de clé de rapprochement : le code affichable
provient de `routes.txt` SNCF.

L'audit a produit 234 circulations corroborées. Exemples :

- Archive IDFM : SHA-256 `5c9b96b5d4b011e3cec882849a6624f5e23d50b40f8d4c98084c0ae2f9a15aa1`.
- Archive SNCF : SHA-256 `bda20e58cdd5470a2efa18849e3d31b32820f566a3fb50f58f230acd429069f1`.

| Ligne IDFM | Circulation | Ligne commerciale SNCF | Témoins IDFM / SNCF |
| --- | --- | --- | --- |
| `IDFM:C02370` | `3402` | `K4`, `FR:Line::6155CD5F-AB2D-4274-A052-8C7462540578:` | Dreux 07:20 / 07:20 ; Versailles-Chantiers 08:03:30 / 08:03 |
| `IDFM:C02368` | `5901` | `K2+`, `FR:Line::76213942-0D07-48A2-9108-99253D13D093:` | Nemours–Saint-Pierre 07:59 / 07:59 ; Montargis 08:16:30 / 08:17 |
| `IDFM:C01744` | `862532` | `K3`, `FR:Line::484B5749-966E-4516-9352-C1ADD9406916:` | Chartres 20:46 / 20:46 ; Maintenon 21:02 / 21:02, entre autres |

La même ligne `C01744` a aussi des circulations rapprochées de `C3`, `P3` et
`P13`. Le lien est donc un-à-plusieurs ; une seule valeur à l'échelle de cette
ligne IDFM serait trompeuse. Un résultat observé sur un jour ne prouve ni la
couverture de tous les trains de la ligne ni la correspondance exhaustive des
parcours géographiques. `K3+` n'a pas été rapproché par cette règle ; son
existence dans la source SNCF ne démontre pas son attribution au pack IDFM.

Les résultats détaillés de cette exécution se trouvent localement dans
`.data-update-evidence/ter-cross-feed-20261116.json`, avec identifiants de
courses, arrêts et SHA-256 des archives. Pour reproduire avec des archives
locales des mêmes flux :

```powershell
python scripts/gtfs/audit-ter-cross-feed.py --idfm idfm.zip --sncf sncf.zip --date 20261116 --output observations.json
```

L'audit est une preuve empirique prudente, pas un référentiel officiel de
correspondance entre identifiants. Les noms de gares et les heures doivent être
contrôlés, et les données source des deux flux doivent se recouvrir dans le
temps. La production devra préserver les témoins, les sources, leur date et
les cas non résolus.

## Intégration dans le pack local

LEDoMATIC annonce [41 lignes TER en Île-de-France](https://ledomatic.com/produit/afficheur-metro)
et indique utiliser les [données ouvertes IDFM et d'autres réseaux](https://ledomatic.com/mentions-legales.php).
Cela montre l'intérêt d'un catalogue à l'échelle des lignes commerciales ; son
site public ne décrit pas le rapprochement utilisé. Le GTFS SNCF est une source
structurée de ces lignes, utilisable sans prétendre que son identifiant est
identique à celui d'une ligne IDFM.

Le pack local charge un petit fichier `commercial-lines-<hash>.json`, référencé
de manière optionnelle par son manifeste et lié à sa `dataVersion`. Il contient
les codes observés, les identifiants de lignes SNCF et le nombre de courses
rapprochées. Le décodeur conserve les identifiants et couleurs IDFM d'origine ;
la présentation indique qu'il s'agit d'une liste partielle datée. Le tooltip,
la liste, la recherche et le panneau sélectionné partagent ces badges. Le nombre
de lignes couvertes dans ce pack est de 10 ; aucune géométrie commerciale
distincte n'est déduite des seuls arrêts appariés.

La compilation du fichier est une étape séparée du compilateur global situé
dans le dépôt voisin. Pour l'appliquer à un nouveau pack, après avoir produit
des observations dont les dates de service couvrent les deux sources :

```powershell
python scripts/gtfs/compile-ter-map.py --observations observations.json --map-dir public/data/global-map/v1
```

La commande met à jour le manifeste et n'effectue pas de publication. Une
nouvelle génération du pack global doit être suivie de cette étape ; les anciens
packs sans fichier complémentaire restent lisibles et utilisent les badges
habituels. Une automatisation de ce rafraîchissement reste à ajouter au pipeline
du dépôt voisin si l'on veut maintenir les associations à jour sans intervention.
