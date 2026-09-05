# Services GTFS

Ce dossier est la couche d’accès aux artefacts GTFS déjà indexés. Le serveur
d’application ne télécharge, ne décompresse et ne parse jamais l’archive complète.

## Fichiers

- `types.ts` définit le manifeste public et le contrat des artefacts par ligne :
  formes, directions, branches, arrêts projetés et entrées/sorties. Le descripteur
  optionnel `timetable` n’altère pas le format des géométries existantes.
- `timetableTypes.ts` définit la version des horaires, le descripteur de couverture,
  les dictionnaires d’arrêts/services et les fichiers de courses bornés en taille.
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
timetables/v1/<sha256-source>/<identifiant-unique-exécution>/<ligne>/index.json
timetables/v1/<sha256-source>/<identifiant-unique-exécution>/<ligne>/0000.json
```

Le chemin de base des horaires vient exclusivement de `current.json.timetable.path`
et n’est pas déduit du seul SHA de l’archive. Deux réindexations du même ZIP peuvent
avoir le même SHA et des dossiers d’horaires différents. Tout cache d’horaires doit
donc distinguer ces chemins immuables. Sans descripteur compatible, les géométries
restent utilisables mais l’index horaire doit être considéré comme indisponible.

Les services horaires conservent les jours de semaine et les intervalles de
`calendar.txt`, ainsi que les ajouts et suppressions de `calendar_dates.txt`.
Les heures sont des secondes depuis le début du jour de service, y compris
au-delà de 24 heures. Ne pas réutiliser le filtrage des services de géométrie
pour décider si une course circule un jour donné : les suppressions calendaires
affectent les horaires, pas le tracé physique.

L’importeur construit les deux index avant de changer le manifeste. Il téléverse
tous les nouveaux fichiers avant `gtfs/current.json` ; une erreur de construction
ou de transfert laisse le manifeste courant en place. Les géométries actives sont
réutilisées lors d’une migration d’horaires à SHA identique, et les anciens dossiers
d’horaires restent intacts. Le remplacement local du manifeste utilise un fichier
temporaire et un renommage atomique.

Pour préparer uniquement les données locales, utiliser
`npm.cmd run gtfs:update -- --local --keep-source`. `--local` exclut toute lecture
ou écriture R2 et ne déploie rien ; le runtime déployé conserve sa priorité R2.
`--keep-source` conserve le ZIP et les CSV temporaires après succès ou échec et
journalise leur chemin absolu. Ajouter `--reindex` pour reconstruire des horaires
déjà à jour. Une absence d’horaires ou un changement de schéma déclenche cette
reconstruction automatiquement, même pendant le délai de 12 heures et pour un
ZIP identique. Voir les [options de l’importeur](../../../scripts/gtfs/README.md).

La structure d’ensemble et l’ordre des fournisseurs sont détaillés dans
[la documentation de géométrie GTFS](../../../docs/gtfs-line-geometry.md).
