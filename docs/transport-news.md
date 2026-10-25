# Feed quartier

La page `/feed` agrège les actualités accessibles en Île-de-France sur les transports, l'urbanisme et le logement. Le registre extensible est dans `src/features/transport-news/sources.ts` : URL, méthode RSS/HTML/article, couverture par mode et lignes. Il comprend des blogs de lignes, institutions, collectivités, médias locaux et une association identifiée dans son nom. Les liens du catalogue des projets IDFM ajoutent des sources lorsque son accès fonctionne.

## Collecte

- `GET /api/transport-news/sources` fournit le registre et les derniers états connus.
- `GET /api/transport-news/articles?sourceId=<identifiant>` collecte une source autorisée ; `refresh=1` demande un rafraîchissement, limité à une fois par minute.
- Le client passe par `toServerApiUrl()` et lance quatre sources à la fois. Le serveur limite également à quatre les documents téléchargés par instance.
- Cache en mémoire de trente minutes par source, nouvelles tentatives après cinq minutes en cas d'erreur. Les derniers articles réussis restent affichés avec l'état ancien si un rafraîchissement échoue.

Le cache est local à chaque instance Nitro/Cloudflare et disparaît à son redémarrage. Aucun archivage permanent ni collecte planifiée. Aucun proxy vers une URL fournie par le client. Les refus d'accès sont affichés sans contournement.

## Maintenance

Lancer `npx tsx scripts/check-transport-news.ts` pour vérifier les sources en direct, ou `--sources=rer-a,m4-chatenay --details` pour cibler des identifiants du registre. Les résultats dépendent des conditions d'accès au moment de la vérification. Un flux opérationnel peut ne contenir aucun article de transport pertinent.

La classification des modes, lignes et sujets repose sur des mentions explicites et sur la couverture déclarée des sources. Les dates absentes restent absentes. Les dates françaises affichées dans les métadonnées de publication sont reconnues ; les jalons du corps d'un dossier ne servent pas de date de publication. Les articles ouvrent leur source originale ; les extraits ne décrivent pas un avancement du projet absent du texte publié. Les préférences persistantes se règlent dans Paramètres ; les filtres de page et la ligne ouverte depuis une carte restent temporaires.

La page affiche par défaut les publications datées des 90 derniers jours, triées de la plus récente à la plus ancienne. Le filtre de période permet aussi 30 jours ou toutes les dates, y compris les dossiers sans date. Les archives restent collectées et consultables ; une date future n'entre pas dans la vue récente. Le filtrage est local, sans nouvelle collecte et sans modifier les consommateurs existants du module de filtrage.

## Sources vérifiées le 22 octobre 2026

Le flux Citoyens utilise désormais la rubrique [Cadre de vie](https://citoyens.com/rubrique/urbanisme/feed), qui couvre transports, aménagement et logement. Il retourne notamment le [nouveau bus 314](https://citoyens.com/2026/val-de-marne-seine-saint-denis-nouveau-bus-314-et-changements-sur-une-vingtaine-de-lignes,22-10-2026.html) du 22 octobre et les [stations du Tzen5](https://citoyens.com/2026/paris-choisy-le-roi-en-une-demi-heure-le-tzen5-devoile-les-noms-definitifs-de-ses-19-stations,20-10-2026.html) du 20 octobre, absentes du court flux général initial au contrôle. L'identifiant `citoyens` est conservé pour les préférences existantes.

Le nouveau [flux M4 Sud](https://m4sud.fr/feed/) est celui d'une association qui soutient le prolongement. Il n'est pas assimilé à une autorité organisatrice. Son article du [4 octobre 2026 sur l'atelier M4](https://m4sud.fr/nous-avons-visite-latelier-de-maintenance-de-la-ligne-m4/) est récent ; les articles plus anciens sur le prolongement restent dans les archives. Les articles RER B de cette association ne sont pas automatiquement attribués au métro 4.

Le [dossier municipal de Châtenay-Malabry](https://www.chatenay-malabry.fr/prolongement-de-la-ligne-4-du-metro-jusqua-chatenay-malabry/) porte la date du 6 mai 2025. Il décrit le prolongement souhaité de Bagneux–Lucie Aubrac vers le T10 à Châtenay-Malabry, via Bourg-la-Reine et Sceaux, et mentionne le financement d'études ainsi qu'une annonce d'études de faisabilité en juin 2025. Cela ne constitue pas une annonce de travaux engagés ou de date de mise en service. La publication d'origine n'est pas redatée à partir de ces ajouts.

Au contrôle direct du 22 octobre, le catalogue et le projet T10 IDFM renvoient HTTP 403 au collecteur. Les [actualités T10 de Clamart](https://www.clamart.fr/fr/actualites) fournissent des publications datées des 15 et 20 octobre. Les refus restent visibles ; aucune date ou actualité de remplacement n'est fabriquée. Les preuves de collecte et les limites de validation sont consignées dans `docs/tasks/2026-10-22/reports/07.md`.

Au contrôle initial du 1er octobre 2026, les accès directs au catalogue et au projet T10 d'IDFM, à RATP et à certaines pages SNCF Réseau refusaient la collecte. La couverture inclut tous les modes, sans garantir un article pour chaque ligne.

Pour le prolongement du T10, le registre collecte aussi les pages dédiées de la CNDP, de Châtenay-Malabry et du Département des Hauts-de-Seine. Ces pages accessibles complètent les flux d'actualités généraux, qui ne contiennent pas toujours les dossiers de projets plus anciens. Elles conservent les dates et formulations du diffuseur : elles ne remplacent pas les dernières annonces IDFM lorsque son collecteur est bloqué.

## Complément : sources transport officielles

Le contrôle complémentaire du 22 octobre 2026 ajoute le [site Grand Paris Express](https://www.grandparisexpress.fr/actualites), publié par la Société des grands projets : actualités des chantiers, gares, essais et aménagements des nouvelles lignes de métro. Il complète le site institutionnel général déjà enregistré. La collecte vérifiée retourne 11 articles, dont 4 publiés dans les 90 derniers jours. Aucune ligne n'est attribuée à un article sans mention explicite ; le contexte d'un éditeur exclusivement métro permet de reconnaître « ligne 18 » ou « lignes 16 et 17 » sans confondre avec un numéro de bus.

La source officielle [T1 Bobigny – Val de Fontenay](https://www.t1bobigny-valdefontenay.fr/fr/actualites) était déjà présente, mais son horodatage dans l'en-tête HTML échappait au parseur. La correction récupère la vraie date de publication, avant celle d'éventuels articles associés : 4 publications datées d'août/septembre apparaissent désormais dans la vue récente. Les dernières publications EOLE observées remontent à juillet ; aucun nouveau flux d'archives EOLE n'a été ajouté. Les pages générales RATP consultées n'ont pas été retenues comme source complémentaire, faute d'apport ciblé et daté suffisant dans le collecteur actuel. Voir le [contrôle complémentaire](tasks/2026-10-22/reports/07-sources-complement.md).
