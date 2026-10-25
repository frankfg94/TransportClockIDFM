# TransportClock — lots de tâches à donner séparément à l’IA

Cette liste de 22 tâches est répartie en **13 lots autonomes**, selon les modules à explorer et les dépendances fonctionnelles. Les petites tâches proches sont regroupées ; les sujets lourds disposent de leur propre fichier. Les exigences originales sont conservées dans leur lot avec leurs numéros d’origine.

Ce dossier prépare les demandes d’implémentation. La création de ces fichiers n’applique aucune des modifications décrites.

## Mode d’emploi

Donner un seul fichier de lot à la fois à l’IA, dans le workspace du projet. Chaque lot contient son périmètre, ses prérequis, des points d’entrée et l’intégralité des tâches correspondantes : il ne nécessite pas de charger cet index ni les autres lots.

Exemple de demande :

> Applique intégralement le lot contenu dans `docs/tasks/2026-10-22/04-home-prochain-passage-et-pluie.md`. Respecte ses prérequis et valide le résultat dans les environnements demandés. Signale clairement les validations impossibles à réaliser.

Les fichiers sont des lots de contexte, pas des estimations de durée. Le lot 03 reste volontairement conséquent : les trajets, les seuils, l’annuaire et leurs états forment une seule fonctionnalité à livrer de bout en bout.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Lots

| Lot | Fichier | Tâches originales | Portée | Prérequis / conseil |
| --- | --- | --- | --- | --- |
| 01 | [Verdict — réparer les trajets vers les hubs et grandes gares](01-verdict-bug-hubs-et-grandes-gares.md) | 20 | Gros diagnostic isolé | Prioritaire pour stabiliser le routage Verdict |
| 02 | [Verdict — fins de service et détail des lignes structurantes](02-verdict-fins-de-service-et-facts.md) | 1, 14 | Deux améliorations ciblées | Indépendant ; prendre les contrats actuels |
| 03 | [Verdict — trajets personnalisés, seuils et annuaire](03-verdict-trajets-personnalises-et-annuaire.md) | 15, 16, 17, 18, 19 | Grosse fonctionnalité cohérente | Après 01 recommandé |
| 04 | [Home — prochain passage immédiat et wording de la pluie](04-home-prochain-passage-et-pluie.md) | 2, 4 | Deux petites tâches sur la Home | Indépendant |
| 05 | [Home — classification omnibus / semi-direct selon les arrêts restants](05-home-classification-rer-omnibus-semi-direct.md) | 3 | Gros algorithme avec validation temps réel | Indépendant ; préserver 04 s’il est appliqué |
| 06 | [Commerces — cartes, fiche détaillée et loaders des transports](06-commerces-cartes-sidebars-et-loaders.md) | 5, 8, 9 | Lot transversal centré sur les commerces | Indépendant |
| 07 | [Feed quartier — renommage et actualités récentes](07-feed-quartier-et-sources-recentes.md) | 6 | Recherche et collecte isolées | Indépendant ; recherche Internet à l’exécution |
| 08 | [Combobox — harmonisation avec le composant générique existant](08-combobox-harmonisation-globale.md) | 7 | Audit transversal ciblé | Après les ajouts d’UI si possible |
| 09 | [Optimizer — distinguer marche jusqu’au quai et attente](09-optimizer-separer-marche-et-attente.md) | 10 | Correction ciblée du modèle de chronologie | Avant 10 |
| 10 | [Optimizer — carte itinéraire alimentée par la chronologie](10-optimizer-carte-synchronisee-sur-chronologie.md) | 11 | Grosse intégration de données et de carte | Après 09 |
| 11 | [Station fullscreen — scroll mobile et table des horaires réutilisée](11-station-fullscreen-scroll-et-horaires.md) | 12, 13 | Deux tâches sur le même panneau | Avant 12 |
| 12 | [Android — rebuild actuel et smoke E2E sur émulateur](12-android-rebuild-et-smoke-e2e.md) | 21 | Validation mobile complète | Après les lots fonctionnels de la release |
| 13 | [Android — APK final, publication R2 et téléchargement vérifié](13-android-apk-final-et-publication-r2.md) | 22 | Release isolée | Après 12 réussi |

## Ordre conseillé

1. Stabiliser le calcul Verdict avec le lot **01**, puis appliquer les lots **02** et **03**. Le passage 01 → 03 est recommandé pour construire les nouveaux trajets sur un calcul déjà vérifié.
2. Traiter les lots **04 à 07** et **11** dans l’ordre pratique ; ils ne nécessitent pas le chargement mutuel de leurs fichiers. Si 04 et 05 touchent les mêmes composants de départ, conserver les modifications de l’autre lot.
3. Exécuter **09 → 10** : la carte de l’optimizer consomme la chronologie dont la marche et l’attente sont déjà séparées.
4. Faire le lot **08** après les ajouts d’interface si possible, pour inclure leurs sélecteurs dans l’audit.
5. Terminer par **12 → 13** : validation Android de l’état intégré, puis APK final et publication vérifiée.

L’ordre ci-dessus reste un ordre de priorité. L’utilisateur autorise désormais jusqu’à trois lots indépendants en parallèle, avec réservations des fichiers communs ; les validations Android et la release restent finales et exclusives.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

Premier groupe parallèle : **03 (Verdict), 07 (feed), 09 (chronologie optimizer)**. Les traductions et les validations globales sont initialement réservées au lot 03.

## Correspondance complète avec la liste originale

| Tâche originale | Lot | Tâche originale | Lot |
| --- | --- | --- | --- |
| 1 | [02](02-verdict-fins-de-service-et-facts.md) | 12 | [11](11-station-fullscreen-scroll-et-horaires.md) |
| 2 | [04](04-home-prochain-passage-et-pluie.md) | 13 | [11](11-station-fullscreen-scroll-et-horaires.md) |
| 3 | [05](05-home-classification-rer-omnibus-semi-direct.md) | 14 | [02](02-verdict-fins-de-service-et-facts.md) |
| 4 | [04](04-home-prochain-passage-et-pluie.md) | 15 | [03](03-verdict-trajets-personnalises-et-annuaire.md) |
| 5 | [06](06-commerces-cartes-sidebars-et-loaders.md) | 16 | [03](03-verdict-trajets-personnalises-et-annuaire.md) |
| 6 | [07](07-feed-quartier-et-sources-recentes.md) | 17 | [03](03-verdict-trajets-personnalises-et-annuaire.md) |
| 7 | [08](08-combobox-harmonisation-globale.md) | 18 | [03](03-verdict-trajets-personnalises-et-annuaire.md) |
| 8 | [06](06-commerces-cartes-sidebars-et-loaders.md) | 19 | [03](03-verdict-trajets-personnalises-et-annuaire.md) |
| 9 | [06](06-commerces-cartes-sidebars-et-loaders.md) | 20 | [01](01-verdict-bug-hubs-et-grandes-gares.md) |
| 10 | [09](09-optimizer-separer-marche-et-attente.md) | 21 | [12](12-android-rebuild-et-smoke-e2e.md) |
| 11 | [10](10-optimizer-carte-synchronisee-sur-chronologie.md) | 22 | [13](13-android-apk-final-et-publication-r2.md) |

## Conventions utiles

- Les numéros 1 à 22 à l’intérieur des lots sont ceux de la todo originale ; les numéros de fichiers 01 à 13 désignent les lots.
- Les noms de composants de la todo sont conservés. Lorsqu’un nom actuel semble différent, le lot donne un point d’entrée à confirmer plutôt que d’imposer une nouvelle implémentation.
- La recherche d’articles, la comparaison temps réel des trains, les tests Android et la publication R2 sont à effectuer lors de l’application des lots concernés. Aucune de ces validations n’est supposée déjà acquise.
- Pour limiter le contexte, chercher les symboles utiles avant d’ouvrir les gros fichiers, et suivre les consignes du projet pour les dépendances partagées.
- Après chaque lot, garder un bref relevé des changements et validations ; les lots dépendants doivent s’appuyer sur le code et les preuves actuels.
