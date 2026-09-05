# Import GTFS

Ce dossier contient l’importeur hors ligne qui transforme l’archive GTFS complète
d’Île-de-France Mobilités en petits index JSON lisibles par Nuxt.

## Utilisation

Depuis la racine du projet :

```powershell
npm.cmd run gtfs:update
```

La commande :

1. vérifie le délai minimal de 12 heures et les validateurs HTTP déjà installés ;
2. télécharge l’archive seulement si nécessaire, puis calcule son SHA-256 ;
3. valide le ZIP et extrait uniquement les fichiers GTFS requis ;
4. lit les CSV en flux et construit les formes, directions, séquences d’arrêts,
   projections monotones et sorties de station par ligne ;
5. construit les horaires par ligne avec leurs calendriers, exceptions et
   fichiers de courses bornés en taille ;
6. installe les artefacts complets dans leurs chemins immuables, publie tous les
   fichiers dans R2 si configuré, puis remplace `current.json` en dernier.

Une réponse HTTP `304` ou un SHA-256 identique arrête normalement le traitement
sans réindexer. Si le manifeste ne contient pas d’horaires ou contient une autre
version de leur schéma, la migration ignore automatiquement le délai de 12 heures,
les validateurs HTTP et le contrôle de SHA identique. Elle télécharge donc le ZIP
complet pour construire le nouvel index, même si la source n’a pas changé.
Les phases `checking`, `downloading`, `validating`, `indexing`, `publishing`,
`completed`, `unchanged` et `failed` sont écrites dans les logs.

## Commandes de maintenance

```powershell
npm.cmd run gtfs:reset
npm.cmd run gtfs:update -- --force
npm.cmd run gtfs:update -- --local --keep-source
npm.cmd run gtfs:update -- --local --reindex --keep-source
npm.cmd run gtfs:reset -- --local
```

Le reset incrémente seulement la génération des caches dérivés et conserve le
descripteur des horaires.

- `--force` ignore le délai de 12 heures, mais conserve les contrôles HTTP et SHA.
- `--reindex` ignore aussi les validateurs HTTP et le SHA identique. Il reconstruit
  les horaires dans un nouveau dossier, même si leur schéma est déjà à jour. Les
  géométries déjà présentes pour ce SHA sont réutilisées sans être modifiées.
- `--local` lit exclusivement le manifeste local et interdit toute lecture ou
  écriture R2, même lorsque les identifiants R2 sont configurés. Il ne lance aucun
  déploiement. Ce drapeau ne force pas une reconstruction : utiliser `--reindex`
  pour régénérer un index déjà à jour.
- `--keep-source` conserve le dossier temporaire créé par cette exécution, avec
  `idfm-gtfs.zip` et `extracted/`, après succès comme après échec. Le journal affiche
  son chemin absolu pour permettre une inspection ou une réindexation ad hoc sans
  retéléchargement. Un téléchargement interrompu peut laisser un ZIP incomplet.
  Sans ce drapeau, le dossier source est supprimé. Les fichiers intermédiaires
  de construction sont toujours nettoyés ; aucun dossier source n’est créé si le
  délai de 12 heures arrête la commande.

Aucun de ces drapeaux ne contourne les validations de sécurité du ZIP ou des index.

### Audit des horaires et fréquences

Après un import avec `--keep-source`, `verifyFrequency.ts` permet de vérifier une
ligne sans navigateur, uniquement avec les fichiers locaux et les API du backend.
Le backend doit être démarré et servir le jeu de données audité ; le script
vérifie que sa `datasetVersion` correspond au manifeste local.

```powershell
npx.cmd tsx scripts/gtfs/verifyFrequency.ts LINE_ID
npx.cmd tsx scripts/gtfs/verifyFrequency.ts LINE_ID "C:\chemin\transport-clock-gtfs-...\extracted"
```

Remplacer `LINE_ID` par l’identifiant GTFS de la ligne. Le second argument est
facultatif : il doit désigner le sous-dossier `extracted` du chemin absolu affiché
par `--keep-source`, issu du même ZIP que les horaires installés.

- Avec ce dossier source, l’audit compare toutes les courses de la ligne et leurs
  métadonnées importées (service, direction, destination), puis tous les passages
  et leurs arrêts, séquences, heures et restrictions de montée/descente aux CSV
  `trips.txt` et `stop_times.txt`, avec contrôle des nombres de courses/passages.
- Avec ou sans CSV, il appelle `/api/lines/<LINE_ID>/frequency` et
  `/api/lines/<LINE_ID>/topology`. Lorsqu’un tronçon central existe, il sélectionne
  indépendamment les services actifs selon les calendriers, exceptions et heures
  après minuit, recalcule les intervalles de pointe et les compare à l’API, sans
  appeler le calculateur de fréquence de production.
- Le rapport JSON affiche notamment les volumes de courses/services, les octets
  des fichiers de courses et des fichiers des services actifs, les observations
  du tronçon central et les durées de la première requête puis de la requête
  répétée. Une assertion échouée termine la commande en erreur.

`GTFS_OUTPUT_DIR` sélectionne les artefacts locaux (`.data/gtfs` par défaut).
`GTFS_VERIFY_API_BASE` sélectionne l’API Nuxt déjà démarrée
(`http://127.0.0.1:3000` par défaut). Cet outil de vérification ne démarre aucun
serveur et le compilateur `idfm-node-backend` reste uniquement un générateur :

```powershell
npx.cmd tsx scripts/gtfs/verifyFrequency.ts LINE_ID
```

Cet audit est en lecture seule : il ne réimporte rien, ne modifie ni les artefacts
ni le manifeste et ne publie rien. Il ne télécharge pas la source GTFS et ne
nécessite aucun identifiant d’API source ni identifiant d’écriture R2.

## Stockage et configuration

- `GTFS_OUTPUT_DIR` choisit le dossier local ; sa valeur par défaut est
  `.data/gtfs`.
- Si `R2_ENDPOINT`, `GTFS_R2_BUCKET`, `R2_ACCESS_KEY_ID` et
  `R2_SECRET_ACCESS_KEY` sont tous définis, les artefacts sont également publiés
  dans R2.
- La source GTFS est fixe dans le script et ne peut pas être fournie par un
  client.

Disposition produite :

```text
current.json
versions/
  <sha256>/
    line-index.json
    lines/
      <identifiant-normalisé>.json
timetables/
  v1/
    <sha256-source>/
      <identifiant-unique-exécution>/
        <identifiant-ligne-normalisé>/
          index.json
          0000.json
          ...
```

Le manifeste garde son format de géométrie et ajoute un descripteur optionnel
`timetable` : version du schéma, chemin relatif `timetables/v1/...`, couverture
calendaire, nombres de lignes/courses/fichiers et taille totale. R2 ajoute le
préfixe `gtfs/` à ces chemins. Une réindexation ne modifie jamais un ancien dossier
d’horaires ni une géométrie déjà installée sous `versions/<sha256>`.

Les fichiers de courses sont partitionnés par `service_id` : un fichier contient
un seul service, et un service volumineux peut occuper plusieurs fichiers. Le
runtime peut ainsi ignorer les fichiers des services inactifs avant de les charger.
La limite par défaut est de 4 Mio (4 194 304 octets) par fichier de courses ou
index de ligne. L’import vérifié après cette partition comptait 11 772 fichiers,
351 209 999 octets au total et 659 837 octets pour le plus grand fichier ; ces
mesures sont un repère pour cet import, pas des limites ni des comptes attendus
pour les prochaines versions.

Les horaires utilisent `calendar.txt` et `calendar_dates.txt` : jours de semaine,
dates de validité, ajouts (`1`) et suppressions (`2`). Les heures après minuit,
par exemple `25:10:00`, restent exprimées en secondes depuis le début du jour de
service. Les restrictions de montée/descente et les heures non renseignées sont
conservées. Le filtrage des services utilisé pour la géométrie ne s’applique pas
à cet index horaire ; une interruption peut supprimer une course sans effacer
le tracé physique de la ligne.

Une erreur d’indexation ou de transfert empêche le changement de manifeste. Des
artefacts immuables non référencés peuvent subsister après un transfert interrompu.
Le manifeste local est écrit et synchronisé dans un fichier temporaire voisin,
puis remplacé par renommage atomique. En mode R2, son remplacement local suit la
publication réussie de `gtfs/current.json` ; les deux stockages ne constituent pas
une transaction distribuée.

Les fichiers de `.data/gtfs` sont générés : il ne faut pas les modifier à la main.
Le contrat général est décrit dans
[la documentation de géométrie GTFS](../../docs/gtfs-line-geometry.md).
