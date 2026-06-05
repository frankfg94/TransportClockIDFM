# `idfmOpenDataTransfers.ts`

Ce fichier resout les correspondances affichees sous les stations du schema de ligne a partir du dataset Open Data IDFM `arrets-lignes`.

L'objectif est de remplacer les recherches geographiques approximatives par une resolution plus stricte: une station recoit les lignes qui desservent son arret, ou les arrets officiellement connectes a elle. Le code ne contient pas de regle du type `si la station est X alors ajouter Y`.

## Flux de donnees

1. La page ligne envoie une liste de stations a `/api/transfer-bundles`.
2. Le backend Nuxt utilise maintenant uniquement la resolution nearby optimisee.
3. Le cache actif vit cote serveur Nuxt: stop areas de ligne, nearby par rayon, lignes par stop area.
4. `fetchStationTransfersFromArretsLignes()` reste un ancien utilitaire de reference/test, mais il n'est plus branche dans les bundles de correspondances.

## Pourquoi ne pas chercher simplement par coordonnees ?

Les recherches par rayon sont rapides a ecrire mais pas assez fiables pour un plan de ligne:

- `Liege` peut recuperer des correspondances de `Saint-Lazare`, trop proche geographiquement.
- `Maisons-Laffitte` peut etre confondu avec `Maisons-Alfort - Alfortville` si on cherche trop largement sur les tokens.
- Les poles complexes comme `Auber`, `Chatelet - Les Halles`, `La Defense` ou `Nanterre Prefecture` ont besoin d'un contexte officiel de correspondance, pas d'une supposition spatiale.

La regle du service est donc: exact d'abord, noms compatibles officiels ensuite, fallback limite seulement quand il n'y a pas de correspondance trouvee.

## Plans de requetes

Pour une station `X`, le service construit plusieurs requetes possibles:

- `stop_name = "X"`: le cas ideal, exact et sans ambiguite.
- Pour les stations composees avec ` - ` ou ` / `: requete exacte sur chaque morceau, par exemple `Chatelet` et `Les Halles`.
- `compatibleStopNames`: noms fournis par le backend depuis les connexions officielles Navitia. Exemple: `Auber` peut recevoir `Opera`, `Havre-Caumartin`, `Haussmann Saint-Lazare`, `Saint-Lazare`.
- Fallback `search(stop_name, "...")`: utilise seulement des alias coherents, pas une fusion large de tokens.

Le fallback reste volontairement prudent. Il accepte par exemple `Chateau de Vincennes` pour `Vincennes`, mais il ne doit pas accepter `Porte de Vincennes` ou `Mairie de Vincennes` comme correspondance structurelle de la gare RER.

Les noms compatibles ont aussi une petite expansion generique avant requete:

- `Gare Saint-Lazare` cherche aussi `Saint-Lazare`, parce que `Gare` est ici un prefixe descriptif non geographique.
- `Havre - Caumartin` cherche aussi `Havre-Caumartin`, car OpenData et Navitia ne gardent pas toujours le meme espacement autour du tiret.
- `Gare Saint-Lazare - Havre` peut produire `Gare Saint-Lazare` puis `Saint-Lazare`, mais seulement parce que ces morceaux gardent assez de tokens distinctifs.
- `Gare de Lyon` ne cherche pas `Lyon`: les prefixes `Gare de`, `Gare du`, `Gare des` et `Gare d'` sont conserves pour eviter des faux positifs massifs.

Cote backend, `/api/transfer-bundles` complete ces noms avec les `stop_area` proches uniquement quand ils restent coherents avec les connexions officielles Navitia. La coherence est verifiee par cles normalisees et, pour les grands poles, par partage d'au moins deux tokens distinctifs. C'est ce qui permet `Haussmann Saint-Lazare` -> `Saint-Lazare` sans accepter une station simplement proche comme `Madeleine`.

Attention aux parentheses: les labels `stop_area` Navitia finissent souvent par une ville, par exemple `La Defense (Puteaux)`, et cette partie peut etre nettoyee pour l'affichage. Les noms de `stop_point` issus des `connections`, eux, peuvent contenir une vraie sous-station, par exemple `La Defense (Grande Arche)`. Dans ce cas, les parentheses doivent etre conservees, sinon OpenData ne peut plus retrouver les lignes 1 et T2.

Le backend retente aussi les appels Navitia temporaires (`429` et erreurs serveur). Sans ce retry, une limite de debit ponctuelle etait traitee comme "ce stop-point n'a pas de ligne structurelle", ce qui creait des omissions aleatoires dans les bundles.

## Normalisation

Le dataset a connu plusieurs schemas. Le code accepte les deux familles de champs:

- ancien style GTFS: `route_id`, `route_short_name`, `route_long_name`, `route_type`;
- style actuel IDFM: `id`, `shortname`, `route_long_name`, `mode`.

Les familles de transport sont inferees depuis `mode`, `route_type` et `route_long_name`, sans table de noms de lignes:

- `Metro` -> `METRO`;
- `RapidTransit` ou libelle RER -> `RER`;
- `LocalTrain` / train -> `TRANSILIEN`;
- `Tramway` / tram -> `TRAM`;
- `Bus` -> `BUS`;
- cable/funiculaire -> `CABLE`.

## Dedupe et filtrage

Chaque ligne est identifiee par son id quand il existe, sinon par `famille + label`. La ligne courante est retiree avec:

- son id Navitia/IDFM, par exemple `line:IDFM:C01742`;
- son libelle, par exemple `RER A` ou `A`.

Les resultats sont ensuite tries par famille de transport puis par label pour garder un affichage stable.

## Garde-fous importants

- Ne pas reintroduire de recherche large du type "meme premier token" ou "token commun". C'est la source des faux positifs `Maisons-Laffitte` / `Maisons-Alfort`.
- Ne pas ajouter de table de correspondances dans le code de production. Si une station doit fusionner avec un autre nom, ce nom doit venir d'une source officielle ou d'un test fixture.
- Les bus peuvent etre plus ambigus que metro/RER/tram/train. Si une station porte un nom tres commun, garder une strategie plus prudente ou geographique filtree.
- Les tests peuvent contenir des attentes de regression, mais l'algorithme doit rester data-driven.

## Debug rapide

Quand une correspondance manque:

1. Regarder `/api/transfer-bundles` dans Chrome Network.
2. Verifier que le bundle annonce `transferResolverMode: "nearby"`.
3. Ouvrir les appels `/api/opendata/arrets-lignes/records`.
4. Verifier que la station exacte ou un `compatibleStopNames` renvoie bien les lignes attendues.
5. Si le navigateur affiche `403`, `400` ou CORS, l'appel ne doit pas partir directement vers `data.iledefrance.fr`; il doit passer par le proxy Nuxt `/api/opendata/arrets-lignes/records`.
6. Si une mauvaise station apparait, verifier que le fallback n'accepte pas un alias trop large.

## Tests de regression

- `idfmOpenDataTransfers.test.ts` couvre les cas unitaires sensibles: schema courant, host Open Data, filtrage de la ligne courante, `Vincennes`, `La Defense`, `Nanterre Prefecture`, faux positif `Maisons-Laffitte`.
- `rerAOpenDataTransfers.test.ts` passe toutes les stations du RER A dans le meme resolver et verifie les correspondances minimales attendues.
- `rerALiveTransferHydration.test.ts` est un test reseau reel: il recupere les stations de la ligne A via Navitia, resout les noms compatibles officiels, interroge OpenData et verifie les correspondances minimales attendues pour chaque station.

Pour ajouter une nouvelle ligne critique, creer une fixture similaire: toutes les stations de la ligne, les lignes minimum attendues, puis quelques faux positifs connus a exclure.
