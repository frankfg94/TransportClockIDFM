# ADR-001 — décisions de l’implémentation Global Transport Plan V2

Date : 2026-08-02  
Statut : adopté pour le prototype V2, gates Android et couverture source encore ouverts

## Contexte

La V2 doit fonctionner hors ligne, ne pas parser NeTEx dans la WebView, ne pas charger 2 011 lignes séparément et conserver une coordonnée unique indépendante du zoom. Aucune dépendance de production n’a été ajoutée pour cette implémentation.

## Décisions

1. **Projection.** Lambert-93 EPSG:2154 est transformé par la référence pure `lambert93-ntf-v1`, puis WGS84 et Web Mercator normalisé sont conservés en `number` Float64. Le runtime refuse un CRS ou une version inconnus. Référence : `idfm-node-backend/src/transport/global-map/coordinates.ts` et les tests golden/round-trip.

2. **Identité station.** La version V1 du catalogue fusionne uniquement un identifiant de nœud source identique (`station:<raw-id>`). Elle conserve source, aliases et commune ; aucun merge par nom seul n’est autorisé. Une résolution StopPlace officielle pourra remplacer cette politique dans une version de données ultérieure.

3. **Géométrie.** Une shape GTFS locale est utilisée quand ses extrémités sont à moins de 300 m et ses stations projetées à moins de 150 m. Sinon, le segment reste `netex-schematic-fallback`, `complete=false`, avec provenance et qualité explicites. Le dernier audit produit 8 733 chemins GTFS et 5 777 fallbacks.

4. **Format d’assets.** `rows-v1` JSON compact est retenu pour la première version parce qu’il est inspectable, atomique et directement compatible avec Capacitor. Le bootstrap reste limité à 1 706 501 octets ; le LOD régional est partitionné en `regional.json` core (405 795 octets, 742 chemins) et `regional-bus.json` (4 819 825 octets, 13 768 chemins), puis les chunks prennent le relais au zoom. Mesure actuelle : manifeste 95 945 octets, catalogue 6 270 446, 204 chunks (100 core + 104 Bus), plus gros chunk 3 660 337. Le runtime ne parse jamais NeTEx. Un conteneur binaire reste une optimisation séparée et ne doit pas être introduit sans benchmark Android comparable.

5. **Partition spatiale.** Une grille déterministe z11 produit 149 chunks. Le manifeste ne contient que les descripteurs ; les listes de membres restent dans les chunks. Le bootstrap régional reste sous 2 Mo et le compilateur vérifie checksum, taille, bornes et membership.

6. **LOD/simplification.** Douglas–Peucker est appliqué hors ligne avec les ancres station comme frontières de simplification. Le détail complet est conservé ; le LOD 1 GTFS est pré-compilé dans `regional.json`, les LOD 1/2 sont aussi pré-calculés dans les chunks, et le LOD 3 réutilise le détail. Les validateurs vérifient les ancres et leurs erreurs métriques dans le regional asset et les chunks.

7. **Index spatial.** Le backend écrit les index stations/paths pré-calculés pour audit et planification. Le runtime utilise un index packed borné construit sur les objets visibles afin de ne pas rendre réactif le catalogue complet ; le hit-test privilégie toujours les stations.

8. **Renderer.** Canvas2D main-thread est le renderer de référence/fallback. Un Worker pool de 1–2 Workers peut culler les candidats détaillés ; son absence retombe sur le même calcul pur. WebGL2 n’est pas promu : aucun benchmark Android reproductible ne justifie encore ce changement.

9. **Labels/accessibilité.** Le réseau reste dans Canvas ; le DOM est réservé aux contrôles, tooltip et panneaux de sélection. Le clavier fournit déplacement, zoom, reset, sélection, focus cyclique et Escape. Cette stratégie évite un nœud Vue par station.

10. **Offline Capacitor.** `build:capacitor` et `cap sync android` copient les assets sous `android/app/src/main/assets/public`. Le réseau, les stations et les interactions restent fonctionnels sans URL externe. Le fond Carto raster est une couche d’habillage optionnelle, bornée à 48 tuiles dans les vues régionales et à 128 tuiles dans les vues détaillées, avec fond neutre immédiat hors ligne ou en cas d’échec ; il ne participe jamais aux coordonnées transport. Le trafic est un canal optionnel séparé avec état `ready/stale/offline/error`.

11. **Vélos.** La source vélo n’est pas présente dans le cache local : le mode est désactivé et l’audit porte `optional-source-unavailable: BIKE`. Aucun faux objet vélo n’est injecté.

12. **URL `/map`.** La route canonique de la V2 est `/map`. Les paramètres minimaux `station` et `line` sont validés par le catalogue et restaurent la sélection. Le zoom et le centre restent un état de caméra local jusqu’à une décision produit dédiée.

13. **Migration V1.** `DetailedLineMapPicker.vue` n’est pas réécrit. L’expérience globale V1 Canvas2D/raster reste accessible sous `/map/legacy`, tandis que `/map` est la V2 canonique. Toute suppression de cette voie de compatibilité est explicitement reportée à un Goal distinct après parité et accord produit. L’ancien `/map/next` redirige vers `/map`.

14. **Bus isolé à l’activation.** Le filtre global par défaut sélectionne tous les modes sauf `BUS`. Le Bus dispose d’une commande et d’un masque de visibilité propres. Le compilateur écrit désormais deux couches physiques par cellule peuplée : `*-core` pour les autres modes et `*-bus` pour Bus. Le pack courant contient 100 chunks core et 104 chunks Bus, sans chunk mélangeant Bus et un autre mode ; quand Bus est inactif, ses fichiers ne sont ni planifiés ni conservés en cache après le changement de filtre. Le catalogue et l’index de stations restent partagés pour préserver les correspondances.

15. **Couleurs, source unique et couverture.** Le runtime V2 réutilise `createLinePresentation` de `src/services/linePresentation.ts`, la même résolution que la V1, pour les couleurs officielles connues et leurs couleurs de texte. Le pack préchargé expose bien `color`/`textColor`, mais l’audit du pack courant montre un fallback uniforme par famille pour les 2 011 lignes ; il ne contient donc pas encore une palette réelle ligne par ligne. Le compilateur accepte maintenant ces champs facultatifs dans les données source et inscrit un warning `line-color-palette-missing` tant que la palette complète n’est pas fournie.

## Regional layer addendum

The regional LOD is physically split like the detailed chunks: `regional.json` contains the 742 non-Bus paths (405,795 bytes) and `regional-bus.json` contains the 13,768 Bus paths (4,819,825 bytes). The default distant view loads only the core asset; the Bus asset is loaded on demand when the separate Bus filter is active.

## Renderer cache note

The optional Carto raster layer is presentation-only. It is capped at 48
visible/overscan tiles, sits behind the transport canvas, and is skipped when
the WebView is offline or a tile fails. The embedded neutral background keeps
the static network usable without any external basemap URL.

The interaction-only path raster cache is capped at 1.5 CSS pixels; the main canvas remains at full DPR and stations/entrances are redrawn from the canonical transform. This bounds the GPU surface without changing semantic coordinates and is covered by the cache, renderer-parity and coordinate-battery tests.

## Rollback

Le rollback consiste à retirer/masquer la route `/map`, conserver `/map/legacy` comme voie de secours Canvas2D/raster, supprimer le pack `data/global-map/v1` de l’artefact Capacitor si nécessaire et garder la V1 inchangée. Les versions de données sont immuables et le compilateur écrit dans un dossier temporaire avant promotion.

## Gates encore ouverts

- les lignes Noctilien locales sont classées depuis leur libellé normalisé (`N01`…`N161`) ; BIKE reste la seule source optionnelle absente ;
- une APK release v2-signée est reproductiblement produite avec les variables locales de `.env.mobile-release` ; les secrets ne sont ni affichés ni commités ;
- aucun appareil ADB de référence n’est connecté ; les seuils delivered-frame/mémoire Android ne sont donc pas prouvés ;
- le benchmark binaire/WebGL2 et la phase mode-ligne/parité restent séparés du MVP global.
- le pack préchargé doit encore être enrichi par la palette officielle complète par ligne ; le fallback V1 couvre les identifiants connus mais ne remplace pas cette préparation de données.
