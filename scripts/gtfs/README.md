# Import GTFS

Ce dossier contient l’importeur hors ligne qui transforme l’archive GTFS complète
d’Île-de-France Mobilités en petits index JSON lisibles par Nuxt.

## Utilisation

Depuis la racine du projet :

```bash
npm run gtfs:update
```

La commande :

1. vérifie le délai minimal de 12 heures et les validateurs HTTP déjà installés ;
2. télécharge l’archive seulement si nécessaire, puis calcule son SHA-256 ;
3. valide le ZIP et extrait uniquement les fichiers GTFS requis ;
4. lit les CSV en flux et construit les formes, directions, séquences d’arrêts,
   projections monotones et sorties de station par ligne ;
5. publie la nouvelle version, puis remplace `current.json`.

Une réponse HTTP `304` ou un SHA-256 identique arrête le traitement sans réindexer.
Les phases `checking`, `downloading`, `validating`, `indexing`, `publishing`,
`completed`, `unchanged` et `failed` sont écrites dans les logs.

## Commandes de maintenance

```bash
npm run gtfs:reset
npm run gtfs:update -- --force
```

Le reset incrémente seulement la génération des caches dérivés. `--force` ignore
le délai de 12 heures et doit rester réservé à une reconstruction de secours ; il
ne contourne pas la validation de l’archive.

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
    lines/
      <identifiant-normalisé>.json
```

Les fichiers de `.data/gtfs` sont générés : il ne faut pas les modifier à la main.
Le contrat général est décrit dans
[la documentation de géométrie GTFS](../../docs/gtfs-line-geometry.md).
