# Lot 11 — Station fullscreen — scroll mobile et table des horaires réutilisée

Statut final : **completed pour le périmètre11**. Le coordinateur a repris les12 processus de l’éditeur sans erreur à23:54:14 (Paris), puis observé56 mesures espacées d’une seconde de23:54:17 à23:55:12 avec SHA2565ca78ef5… et mtime inchangés. Il confirme ensuite44/44 sources identiques à l’état validé et clôture la reprise (24 tests ciblés,6 contrôles web ; référence native corrigée). Preuve : proofs/11/coordinator-editor-resume-stability.json. Attente levée, réservations source/global libérées, aucune écriture ou validation restante. Auteur de la réécriture inconnu ; cette période stable n’est pas une garantie permanente. Clôture documentaire seule, sans modification de source ni nouvelle exécution. Détails dans handoffs/11.md et reports/11.md.

Audit global draggable sheets terminé : 7 usages conformes au générique, 2 migrations supplémentaires (sidebar globale et itinéraire). 34 tests ciblés, 20 contrôles d’acceptation et typecheck final réussis, 44/44 sources stables avant/après. Inventaire et exceptions détaillés dans reports/11.md et handoffs/11.md ; les panneaux modaux sans glissement vertical restent distincts.

Tâches de la liste originale : n° 12, n° 13.

Portée : Deux tâches sur le même panneau.

## Consigne pour l’IA

Applique uniquement ce lot dans le projet `TransportClockGPT` (racine contenant `AGENTS.md`). Lis les consignes applicables, puis explore seulement les points d’entrée utiles. Réutilise les composants et contrats existants, préserve les changements déjà présents et les fonctionnalités hors périmètre. Les chemins ci-dessous sont relatifs à cette racine et servent de repères à vérifier.

Ne charge pas les autres fichiers de cette série par défaut : les exigences de ce lot sont reproduites intégralement ci-dessous. Effectue les vérifications adaptées et termine par les changements réalisés, les preuves de validation et les points restant à vérifier. Ne coche une exigence qu’après sa réalisation et sa vérification.

## Serveur web local à réutiliser

Pour les vérifications web, utilise le serveur existant sur **http://localhost:3000/**. Vérifie d’abord qu’il répond avant toute commande de démarrage. Ne relance pas systématiquement `npm.cmd run dev` / `npm run dev` à chaque lot et ne crée pas une instance sur un autre port quand celle de 3000 fonctionne. Conserve le serveur partagé pour les lots suivants.

Si le serveur est réellement indisponible ou si une modification de configuration impose un redémarrage, diagnostique la situation puis effectue seulement le démarrage ou redémarrage nécessaire. Cette consigne concerne le serveur de développement web ; les tests et les builds Capacitor / Android / APK explicitement requis par les lots restent à effectuer.

## Coordination des travaux parallèles

Le coordinateur peut exécuter jusqu’à trois lots indépendants en parallèle. Respecte les périmètres et réservations indiqués dans `execution.json` et dans ta consigne de démarrage. Un seul lot écrit les traductions, settings ou contrats partagés à un instant donné. Si un fichier nécessaire est réservé à un autre lot, prépare la demande dans `handoffs/NN.md` et termine ton tour avec `awaiting_shared_files` ; le coordinateur te relancera. Les validations globales lourdes utilisent un seul créneau ; les tests ciblés restent possibles. Utilise un onglet navigateur dédié et le serveur localhost:3000 partagé. Aucun autre lot ne doit être lancé par toi. Les lots 12/13 et le commit/push conservent leurs prérequis finaux.

## Pourquoi ce regroupement

Ces tâches partagent le conteneur fullscreen, ses contrôles et sa navigation mobile. La table réutilisée doit aussi fonctionner avec le scroll corrigé : les valider ensemble réduit les allers-retours sur le même composant.

## Prérequis et ordre

Aucun prérequis strict. À terminer avant le lot 12 ; transmettre le scénario de liste dense aux smoke tests Android.

## Points d’entrée à explorer

- `src/components/FullscreenStationPanel.vue`
- `src/App.vue`
- `src/features/line-map/LineFrequencyTimetableModal.vue`
- `src/features/line-map/LineFrequencyTimetable.vue`
- `src/features/line-map/useLineFrequencyTimetable.ts`
- `pages/map/index.vue`

## Précisions de cadrage

FullscreenStationModal est le nom fonctionnel de la todo. Retrouver le composant réel et son conteneur ; FullscreenStationPanel.vue est un point d’entrée actuel, pas une instruction de créer une seconde modal.

## 12. FullscreenStationModal — scroll mobile cassé

Bug :

- [x] Corrigé : en mode liste dense sur mobile, `FullscreenStationModal` permet le défilement vertical.

Vérifier notamment :

- `overflow: hidden` ;
- `height` / `max-height` ;
- scroll lock de la modal ;
- `touch-action` ;
- `overscroll-behavior` ;
- événements tactiles.

Après correction :

- [x] La liste doit scroller naturellement au doigt. (ADB touchscreen réel, portrait et paysage, aller-retour complet.)
- [x] Le header / les contrôles doivent rester utilisables. (Web et Android, alarme du dernier départ et rafraîchir.)
- [x] Le body derrière la modal doit rester bloqué. (Web et Android ; déverrouillage et swipe du body après fermeture confirmés.)
- [x] Tester avec une liste suffisamment longue. (60 lignes en DOM, navigateur et Android.)
- [x] Tester sur émulateur Android. (Pixel 3a Android 14, WebView 113, 14 contrôles réussis.)

Ajouter ce scénario aux smoke tests.

## 13. FullscreenStationModal — table des horaires

- [x] Ajouter la possibilité de consulter depuis `FullscreenStationModal` la même table des horaires que celle déjà utilisée dans `/map`.
- [x] Réutiliser le composant existant.
- [x] Ne pas créer une deuxième implémentation.
- [x] Passer automatiquement :
  - station ;
  - ligne ;
  - direction.
- [x] Conserver une source of truth unique pour :
  - horaires théoriques ;
  - directions ;
  - périodes de service ;
  - données temps réel éventuelles.
- [x] Ajouter un bouton/action `Horaires` clair.
- [x] Prévoir une UX adaptée au mobile/fullscreen. (Web et Android portrait/paysage.)
- [x] Le retour vers `FullscreenStationModal` doit être simple.
- [x] Vérifier que `/map` et `FullscreenStationModal` affichent exactement les mêmes horaires pour le même contexte. (Web et Android, trois contextes réels : tous sens, sens automatique, station/sens modifiés ; dataset 2026-10-14, service 20261022.)

## Validation du lot

Tester au doigt une longue liste dense dans l’émulateur Android, avec contrôles utilisables et body bloqué. Vérifier l’aller-retour vers Horaires et la parité exacte avec /map pour la même station, ligne et direction.

## Extension humaine — Explore networks sur mobile

- [x] Rechercher la bottom sheet existante, puis l'extraire à la demande humaine dans `DraggableBottomSheet.vue`, indépendante de la carte et utilisable avec un simple slot. `AppRightPanel.vue` retiré ; adaptation bureau/mobile dans `ResponsiveSidePanel.vue`.
- [x] L'icône du mode bouton mobile ouvre une bottom sheet avec les mêmes filtres, listes et personnalisation ; bureau conserve son panneau gauche.
- [x] Vérifier le scroll, les paliers et les fermetures dans le navigateur et au toucher Android ; vérifier le clavier et le focus, ainsi que la rotation réelle.
- [x] Migrer et couvrir les utilisateurs affectés : 24 tests ciblés finaux réussis, 26 contrôles web/Android de l'extraction réussis ; transmettre ce scénario au smoke final 12.
- [x] Vérifier les slots par défaut/header/footer, les modèles d'ouverture/palier facultatifs, la saisie et le scroll ; supprimer les anciennes références runtime/tests.
- [x] Typecheck final partagé 05/06/11 réussi (exit 0), 42 empreintes avant/après identiques et contrats i18n conservés.

Suivi : **`completed` pour le périmètre 11**. Typecheck final partagé exit 0 ; implémentation/tests ciblés/web/Android réalisés, configurations temporaires retirées, réservations et créneaux rendus. Échecs préexistants de la passe élargie et réserves des autres lots distingués dans [reports/11.md](reports/11.md) ; scénario de smoke final dans [handoffs/11.md](handoffs/11.md).
