# Lot 08 — Combobox — harmonisation avec le composant générique existant

Tâches de la liste originale : n° 7.

Portée : Audit transversal ciblé.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

L’harmonisation nécessite un inventaire de composants sur plusieurs pages, mais suit une seule règle de réutilisation. Elle reste isolée pour ne pas faire charger tout le site aux lots fonctionnels.

## Prérequis et ordre

Aucun prérequis strict. Peut être traité après les ajouts d’interface des autres lots pour inclure leurs nouveaux sélecteurs dans la vérification.

## Points d’entrée à explorer

- `pages/nearby-stations.vue`
- `src/components/MaterialCombobox.vue`
- `src/components/StationCombobox.vue`
- `src/components/LineCombobox.vue`
- `src/components/FamilyCombobox.vue`
- `src/features/address-book/`
- `tests/stationCombobox.dom.test.ts`

## Précisions de cadrage

MaterialDesignCombobox est le nom employé dans la demande. Confirmer le composant générique réel, dont MaterialCombobox.vue est un point d’entrée possible ; ne pas créer un doublon uniquement pour faire correspondre le nom.

## 7. MaterialDesignCombobox — harmonisation globale

- [x] Réutiliser le composant générique déjà créé pour `Adresse de départ`.
- [x] Dans la page `nearby-stations`, remplacer le combobox par défaut par `MaterialDesignCombobox`.
- [x] Vérifier l’ensemble du site.
- [x] Remplacer les combobox équivalents restants par le composant générique lorsque pertinent.

## Validation du lot

Identifier le composant utilisé par Adresse de départ, inventorier les combobox équivalents, puis vérifier les remplacements pertinents : saisie, sélection, clavier, focus et usage mobile.


Résultat du 23/10/2026 : lot réalisé. Inventaire, exceptions et validations détaillés dans [reports/08.md](reports/08.md). Vérification transversale du code et parcours navigateur représentatifs, dont fixture annoncée pour les données annuelles indisponibles ; ne signifie pas que toute la suite globale ou Android est certifiée.
