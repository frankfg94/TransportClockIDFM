# API GTFS publique

Ce dossier expose uniquement les informations GTFS nécessaires au préchargement
du client. Il ne permet ni de télécharger une archive ni de modifier
l’installation.

## `GET /api/gtfs/status`

Retourne un état public assaini : activation, disponibilité, version, hash
tronqué, dates, âge, obsolescence après 20 jours, nombre de lignes, génération de
cache et type de stockage.

## `POST /api/gtfs/preload`

Vérifie et précharge côté serveur les artefacts correspondant aux lignes affichées
par une station.

```json
{
  "lineIds": ["line:IDFM:C01742", "line:IDFM:C01371"]
}
```

La requête doit contenir entre 1 et 24 identifiants uniques, chacun limité à
180 caractères. Le corps ne peut pas dépasser 12 000 octets. La réponse indique
les identifiants disponibles et manquants, sans envoyer les artefacts complets :

```json
{
  "enabled": true,
  "datasetVersion": "2026-07-20",
  "availableLineIds": ["line:IDFM:C01742"],
  "missingLineIds": ["line:IDFM:C01371"]
}
```

Le chargement effectif et les fallbacks restent centralisés dans le pipeline de
géométrie. Voir
[la documentation de géométrie GTFS](../../../docs/gtfs-line-geometry.md).
