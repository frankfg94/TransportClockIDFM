# Services GTFS

Ce dossier est la couche d’accès aux artefacts GTFS déjà indexés. Le serveur
d’application ne télécharge, ne décompresse et ne parse jamais l’archive complète.

## Fichiers

- `types.ts` définit le manifeste public et le contrat des artefacts par ligne :
  formes, directions, branches, arrêts projetés et entrées/sorties.
- `runtime.ts` sélectionne le stockage, charge le manifeste et fournit les
  artefacts demandés au reste du pipeline de géométrie.

## Résolution du stockage

Le runtime cherche les objets dans cet ordre :

1. le binding Cloudflare R2 `GTFS_DATA_BUCKET`, sous le préfixe `gtfs/` ;
2. le stockage Nitro nommé `gtfs`, configuré localement sur `.data/gtfs` ;
3. les fichiers de `.data/gtfs` committés, copiés par Nitro dans
   `dist/_gtfs-data` pendant le build.

Le troisième niveau permet à un déploiement Cloudflare Pages sans binding R2
d'utiliser directement la version GTFS présente dans le dépôt. Il suffit donc
de mettre à jour puis de committer `.data/gtfs` avant le build. Ces fichiers
sont publiés comme assets statiques plutôt qu'inlinés dans le Worker afin de ne
pas ajouter environ 78 Mio au bundle JavaScript. Le Worker les lit directement
via le binding statique `ASSETS` fourni automatiquement par Cloudflare Pages.

Quand R2 est configuré, il reste prioritaire et aucun mélange de versions n'est
effectué avec les données locales. Le statut public expose `storage: "r2"` ou
`storage: "local"` pour indiquer la source réellement chargée.

Le manifeste `current.json` est gardé en mémoire pendant 60 secondes. Les
artefacts sont mémorisés par couple `SHA-256 + identifiant de ligne`, ce qui rend
un changement de version atomique. `clearGtfsRuntimeCaches()` invalide ces caches
en mémoire sans supprimer la dernière version installée.

`GTFS_ENABLED=0`, `false`, `no` ou `off` désactive le fournisseur. Sans manifeste,
le runtime répond simplement que GTFS est indisponible afin que la chaîne de
fallback continue.

Les artefacts sont lus sous :

```text
versions/<sha256>/lines/<identifiant-normalisé>.json
```

La structure d’ensemble et l’ordre des fournisseurs sont détaillés dans
[la documentation de géométrie GTFS](../../../docs/gtfs-line-geometry.md).
