# Feed transports

La page `/feed` agrège les actualités accessibles en Île-de-France. Le registre extensible est dans `src/features/transport-news/sources.ts` : URL, méthode RSS/HTML/article, couverture par mode et lignes. Il comprend 38 sources initiales, des blogs de lignes aux institutions, collectivités et médias locaux. Les liens du catalogue des projets IDFM ajoutent des sources lorsque son accès fonctionne.

## Collecte

- `GET /api/transport-news/sources` fournit le registre et les derniers états connus.
- `GET /api/transport-news/articles?sourceId=<identifiant>` collecte une source autorisée ; `refresh=1` demande un rafraîchissement, limité à une fois par minute.
- Le client passe par `toServerApiUrl()` et lance quatre sources à la fois. Le serveur limite également à quatre les documents téléchargés par instance.
- Cache en mémoire de trente minutes par source, nouvelles tentatives après cinq minutes en cas d'erreur. Les derniers articles réussis restent affichés avec l'état ancien si un rafraîchissement échoue.

Le cache est local à chaque instance Nitro/Cloudflare et disparaît à son redémarrage. Aucun archivage permanent ni collecte planifiée. Aucun proxy vers une URL fournie par le client. Les refus d'accès sont affichés sans contournement.

## Maintenance

Lancer `npx tsx scripts/check-transport-news.ts` pour vérifier les sources en direct, ou `--sources=rer-a,m4-chatenay --details` pour cibler des identifiants du registre. Les résultats dépendent des conditions d'accès au moment de la vérification. Un flux opérationnel peut ne contenir aucun article de transport pertinent.

La classification des modes, lignes et sujets repose sur des mentions explicites et sur la couverture déclarée des sources. Les dates absentes restent absentes. Les articles ouvrent leur source originale ; les extraits ne décrivent pas un avancement du projet absent du texte publié. Les préférences persistantes se règlent dans Paramètres ; les filtres de page et la ligne ouverte depuis une carte restent temporaires.

Au contrôle initial du 1er octobre 2026, les accès directs au catalogue et au projet T10 d'IDFM, à RATP et à certaines pages SNCF Réseau refusaient la collecte. La couverture inclut tous les modes, sans garantir un article pour chaque ligne.

Pour le prolongement du T10, le registre collecte aussi les pages dédiées de la CNDP, de Châtenay-Malabry et du Département des Hauts-de-Seine. Ces pages accessibles complètent les flux d'actualités généraux, qui ne contiennent pas toujours les dossiers de projets plus anciens. Elles conservent les dates et formulations du diffuseur : elles ne remplacent pas les dernières annonces IDFM lorsque son collecteur est bloqué.
