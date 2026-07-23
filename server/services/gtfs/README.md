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
2. le stockage Nitro nommé `gtfs`, configuré localement sur `.data/gtfs`.

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
