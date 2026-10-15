# Châtenay-Malabry — mesure du 15 octobre 2026

## Conclusion

**Optimisation non validée.** Aucun fait n'a disparu, mais trois libellés Éducation ont changé et aucun gain de chargement reproductible n'a été établi. Les trois fichiers de production ont été remis exactement dans leur état du début de cette tentative. Les autres modifications préexistantes du dépôt ont été conservées.

## Référence demandée

`before-open-tab.json` et `before-open-tab.png` proviennent de l'onglet déjà ouvert, sans rechargement préalable : 277 avenue de la Division Leclerc, coordonnées 48.764151, 2.267785. Le JSON conserve le texte et les catégories affichés. La catégorie Transports contient **32 faits** et un bouton supplémentaire « Voir le classement des lignes » (33 boutons, pas 33 faits).

Les départs comparés sont le 16 octobre 2026 à 09:00 et 03:00. Le dataset GTFS est daté du 14 octobre 2026. L'alerte de quota ORS était déjà présente dans la référence.

## Mesures observées

Les temps incluent le chargement complet de la page et de ses critères, y compris fréquences et derniers passages. Mesures dans Chrome sur localhost:3000, mode debugVerdict.

| Version / passage | Chargement complet | Faits du modèle, toutes catégories | Faits Transports |
| --- | ---: | ---: | ---: |
| Avant, premier passage | 174,272 s | 58 | 32 |
| Avant, passage avec caches chauds | 36,631 s | 58 | 32 |
| Tentative intermédiaire | 60,497 s | 58 | 32 |
| Tentative avec persistance en arrière-plan | 274,351 s | 58 | 32 |

Le passage de 60,497 s a coïncidé avec la vérification TypeScript et des expirations de cache : il ne constitue pas une comparaison isolée. Le passage de 274,351 s comprend un démarrage de page de 44,502 s et une lecture de current.json de 151,482 s. Cette instrumentation mesure toute la lecture du manifeste : elle ne permet pas de séparer rétrospectivement le délai réseau du délai du cache disque.

Le passage intermédiaire conserve les 58 faits, leurs libellés et leurs valeurs. Les boutons de toutes les catégories ont également été comparés à l'onglet d'origine pour ce passage : aucun élément perdu.

`comparison.json` compare la référence chaude au passage de 274,351 s, sans tenir compte de l'ordre des clés JSON : aucun des 58 identifiants ne manque et les 32 faits Transports sont identiques. Trois faits Éducation changent : certains temps estimés deviennent des temps de marche calculés, plus longs (par exemple Pierre Brossolette passe d'environ 13 à 17 minutes). Ce changement ne constitue pas un meilleur accès et ne satisfait donc pas la condition stricte de conservation demandée.

Les exports initiaux `before-run-1.json`, `before-warm.json` et `after-warm-1.json` ont subi la limite de profondeur du transport d'automatisation : certains détails imbriqués sont remplacés par `[MaxDepth]`. Les faits et leurs libellés sont complets. `after-full-first.json` a été exporté en fragments de texte pour conserver les détails imbriqués intégralement.

## Tentative conservée pour examen, pas activée

Les fichiers `source-before/*.txt` conservent les versions initiales. `source-after/*.txt` conserve la proposition et ses tests :

- protéger les requêtes piétonnes en cours contre l'éviction du cache de 1024 paires ;
- partager les lectures disque concurrentes pour une même paire ;
- déplacer les écritures et le nettoyage du cache disque hors du chemin de retour d'un résultat calculé ;
- demander le manifeste mutable au réseau sans attendre l'ouverture du cache, en conservant le secours disque en cas d'échec.

Deux tests ont d'abord reproduit les défauts d'éviction et d'attente du nettoyage sur le code initial. La dernière proposition passait 30 tests ciblés (caches, accès finaux et performances GTFS). Le typecheck était passé sur la proposition intermédiaire ; il n'a pas été répété après les derniers ajustements. Aucun test n'est une preuve de gain de vitesse réel.

La comparaison finale en mode debugTiming n'a pas pu aboutir : le serveur existant restait sur l'écran de démarrage. Une instance isolée sur le port 3001, avec `.nuxt-chatenay-benchmark`, n'a pas répondu au contrôle HTTP dans les 12 secondes et a été arrêtée. Aucun résultat de cette instance n'est compté comme mesure.

Le critère demandé (plus rapide ET faits conservés ou améliorés) n'est donc pas satisfait. Les changements expérimentaux ont été retirés des sources actives, et les tests de la proposition sont conservés comme texte avec celle-ci.
