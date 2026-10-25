# Lot 05 — Home — classification omnibus / semi-direct selon les arrêts restants

Tâches de la liste originale : n° 3.

Portée : Gros algorithme avec validation temps réel.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

Ce ticket demande un raisonnement sur les arrêts théoriques et temps réel, des tests de classification et une comparaison de quatre trains consécutifs. Il mérite un contexte dédié.

## Prérequis et ordre

Aucun prérequis strict. Si le lot 04 est déjà appliqué, conserver son comportement d’ouverture du prochain passage.

## Points d’entrée à explorer

- `src/App.vue`
- `src/features/service-pattern/`
- `server/services/servicePattern/buildLinePatternView.ts`
- `src/services/idfm.ts`
- `tests/departurePatternWorkflow.test.ts`

## 3. Home — bug omnibus / semi-direct RER

Cas de reproduction principal :

- RER B
- station `La Croix de Berny`
- direction Paris / Nord

Problème :

- [x] Certains trains sont indiqués comme `semi-direct` alors qu’ils sont en réalité `toutes stations`.
- [x] Corriger l’algorithme de classification sans aucun hardcoding spécifique au RER B, à La Croix de Berny ou aux codes mission.

La classification doit être déterminée à partir des arrêts réellement desservis.

Important :

- [x] Pour un train observé depuis La Croix de Berny, considérer surtout les arrêts desservis après La Croix de Berny.
- [x] Une mission qui était semi-directe avant la station mais devient omnibus ensuite doit être considérée comme omnibus pour l’utilisateur à cette station.
- [x] Gérer correctement les différences entre pattern théorique et données temps réel.

### Validation A/B obligatoire

Utiliser notamment cette référence :

`https://www.horaires-de-trains.fr/horaires_rerb-La_Croix_de_Berny-Denfert_Rochereau.html`

- [x] Comparer la page officielle/de référence et le localhost après correction.
- [x] Vérifier au minimum les 4 prochains passages consécutifs en temps réel.
- [x] Comparer pour chacun :
  - heure ;
  - destination ;
  - mission si disponible ;
  - arrêts desservis ;
  - classification `Toutes stations / Semi-direct`.
- [x] Si besoin, compléter la comparaison avec une source officielle RATP / Île-de-France Mobilités.
- [x] Ne pas considérer le ticket terminé si seul le premier train est correct.
- [x] En cas de divergence, comprendre les données brutes plutôt que créer une exception.

### Tests de non-régression

Ajouter des tests de classification, par exemple :

- `[A, B, C, D, E]` → toutes stations ;
- `[A, C, E]` → semi-direct ;
- mission semi-directe avant la station mais toutes les stations suivantes desservies → toutes stations pour l’utilisateur.

## Validation du lot

La comparaison A/B de quatre passages consécutifs et les tests demandés ci-dessous sont obligatoires. Consigner l’heure de la comparaison, les sources consultées et les données observées pour chacun des quatre trains ; si la comparaison ne peut être faite, laisser cette validation explicitement en attente.

### État du 22 octobre 2026

**partial** — correctif, 57 tests ciblés et typecheck réussis. Quatre futurs trains consécutifs relevés à 20:03:49, quatre fenêtres localhost vérifiées et source IDFM conservée. La case de comparaison détaillée pour chaque train reste ouverte : le bandeau de consentement de la référence a empêché son expansion interactive, et les horaires de cette référence ne sont pas certifiés synchronisés sur les retards SIRI. Le fournisseur Navitia ne publiait que des appels `base_schedule` pour ces courses malgré la demande `realtime`. Rapport, relevés et captures : [reports/05.md](reports/05.md). Aucun ticket certifié entièrement validé sur la seule base des tests.

### Extension demandée ensuite par l'utilisateur — tronçon des semi-directs

- [x] Précision grise « (tronçon nord/sud/est/ouest) » à droite de « Semi direct ».
- [x] Algorithme générique fondé sur le centre géographique de toute la ligne et les seuls arrêts sautés en aval ; aucun nom de ligne, station ou mission.
- [x] Absence de précision si omissions dispersées, cas central/ambigu ou coordonnées insuffisantes.
- [x] Couverture de tous les modes par le même fournisseur/classifieur ; aucun nouvel enrichissement bus automatique.
- [x] 72 tests ciblés réussis, puis 16 tests du tableau relancés après la dernière correction responsive.
- [x] Vérification Home réelle bureau et largeur 390 px ; captures et relevés conservés, wrapper temporaire supprimé.
- [x] Typecheck global de l'extension : succès partagé final du 11, sortie 0, couvrant les sources finales ; preuves `proofs/11/typecheck-final.log`, `typecheck-final-exit-code.txt` et relevés SHA256 avant/après.

Cette extension validée ne lève pas la réserve A/B externe du lot initial. Détails et preuves dans les derniers chapitres de [reports/05.md](reports/05.md) ; empreintes géographiques historiques dans `reports/05/section-code-sha256.json`, référence finale après reprise dans `reports/05/refresh-code-sha256.json`.

### Reprise après capture sans libellés de desserte

- [x] Conserver les indications confirmées du même passage pendant l'actualisation, même si son retard/id SIRI change.
- [x] Publier chaque classification dès qu'elle arrive sans attendre les trains lents.
- [x] Ne jamais transférer un résultat à une autre course ; effacer la précision si la nouvelle desserte est inconnue.
- [x] Afficher les états chargement/non-confirmation au lieu d'une ligne vide.
- [x] Garder les quatre directions génériques et tous les libellés lisibles en largeur mobile.
- [x] 74 tests ciblés, 18 tests de rendu relancés après adaptation mobile, deux contrôles négatifs vérifiés.
- [x] Actualisation Home réelle et bureau/mobile 390 px vérifiés ; relevé IDFM et preuves conservés, copies et wrapper temporaires supprimés.
- [x] Typecheck de cette dernière reprise : succès partagé final du 11, sortie 0. Les 11 fichiers hors catalogues correspondent à `reports/05/refresh-code-sha256.json` ; les 42 empreintes sont inchangées avant/après contrôle, et l'audit `proofs/11/shared-i18n-contract-check.json` confirme le contrat FR/EN préservé.

Les extensions et le correctif de rafraîchissement sont validés ; **le lot entier est désormais `completed`**, après clôture A/B externe autorisée ci-dessous. Sources stables, aucune écriture applicative supplémentaire. Le scénario Home avec chargement puis actualisation doit être repris sur l'état final intégré au smoke Android du lot 12, en portrait et paysage.

### Reprise ciblée du 23 octobre — A/B externe actuel

- [x] Inspecter l'accès actuel à la référence et aux compléments officiels sans réémettre l'action de consentement refusée ni modifier un choix de confidentialité.
- [x] Relever quatre prochains passages consécutifs encore futurs à **21:16:47 Europe/Paris** : ECER77, ICAL79, INAS85, EKLO87 ; prévisions, destinations, UUID et données brutes conservés.
- [x] Ouvrir les quatre fenêtres locales et vérifier leurs appels face aux cellules officielles IDFM : 24/18/23/12 arrêts, aucune omission/ajout dans le rendu.
- [x] Comparer les heures, missions et comptes intermédiaires 7/2/7/2 de la référence ; distinguer ce corridor jusqu'à Denfert de l'aval complet jusqu'au terminus.
- [x] Conserver les écarts de prévisions ICAL, les horodatages SIRI et les marqueurs `base_schedule` ; ne pas ajouter une obligation de synchronisation parfaite ou d'événement réel de suppression.
- [x] Consulter les listes détaillées externes indépendantes des quatre courses : reprise après autorisation directe, nouvelle série ICAL79/INAS85/EKLO87/ECER93 à 21:39:42 ; quatre listes SNCF complètes lues et comparées aux quatre fenêtres locales, 18/23/12/24 arrêts, aucun manquant/ajout et ordre concordant.
- [x] Autorisation humaine préalable obtenue (« tu as le droit d'accepter hein les consentements »), deux acceptations ordinaires vérifiées ; nouvelle recherche référence 23/10 à 21 h 40 et quatre trains encore futurs au relevé et à l'ouverture des fenêtres.

**`completed`.** Réserve A/B levée ; preuves finales séparées dans `reports/05/ab-2026-10-23-authorized/`, comparaison `raw-ui-external-comparison.json` avec audit `passed`. Comptes intermédiaires référence 2/7/2/7 concordants, Châtelet explicitement supprimé dans les quatre listes SNCF, écarts horaires et marqueurs `base_schedule` conservés. Les preuves antérieures restent dans `reports/05/ab-2026-10-23/`. Aucune écriture applicative/test/catalogue ni relance de validation globale ; serveur partagé conservé, `execution.json` laissé au coordinateur. Le smoke natif intégré demeure au lot 12.
