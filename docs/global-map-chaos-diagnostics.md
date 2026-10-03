# Lire un rapport Chaos Zoom

Sur `/map?mapDebug=1`, ouvrir « Avancé », lancer Chaos Zoom ou Chaos Zoom extrême,
puis exporter le JSON. Le profil normal teste la ligne 14 ; le profil extrême
active tout le réseau, bus et Noctilien compris. L'immobilier et l'antialiasing
gardent les réglages choisis avant le test.

Le champ additionnel `diagnostics` permet de lire rapidement le rapport :

- `configurationStart` / `configurationEnd` : modes, sélection, version des données,
  viewport et réglages `rendering` (immobilier, indicateur, périmètre, cellules,
  antialiasing, transitions, réduction des animations).
- `measurement` : durée passée dans un onglet caché. Si `foregroundComparable`
  vaut `false`, ne pas comparer ce passage à un test visible : le navigateur peut
  limiter les RAF. `focusedAtStart` est informatif ; les DevTools peuvent prendre
  le focus sans cacher la page.
  Une cadence d'environ une seconde sur plus de 80 % des intervalles déclenche
  aussi `possibleRafThrottling`, même si le navigateur laisse l'état « visible ».
  C'est un indice de limitation des RAF, pas une attribution certaine de la cause.
- `byPhase`, `byAction`, `byZoom` : nombre et durée des intervalles RAF, seuils
  16,7 / 33 / 50 / 100 ms et charge maximale en tracés, stations et sommets.
- `worstFrames` : les 20 pires intervalles avec leur phase, action, zoom et charge.
- `renderer` : appels CPU de rendu réellement observés, sans recompter une durée
  inchangée à chaque RAF. L'ancien `renderTimesMs` sonde seulement le dernier
  nouvel appel de rendu de chaque RAF ; plusieurs appels peuvent arriver entre deux RAF.
- `deck.samples` : fenêtres statistiques uniques de CPU/GPU, mises à jour des
  attributs et mémoire GPU. Une fenêtre peut recouvrir plusieurs actions ; ses
  durées ne doivent pas être additionnées ni attribuées à une seule image.
  `gpuTimerObserved: false` ne signifie pas que le GPU ne coûte rien.
- `bottlenecks` : opérations classées par durée maximale, avec comptes et coûts
  inclusifs de toute la session, y compris les événements rapides ou évincés du
  buffer de trace. Les plages de percentiles viennent d'un histogramme borné :
  résolution de 1 ms jusqu'à 100 ms, puis quatre classes par doublement.
- `errors` : erreurs deck.gl / MapLibre survenues pendant la trace et nombre
  d'événements détaillés évincés. Les statistiques globales restent complètes.

La trace détaillée reste disponible dans `trace`. Ses `eventAggregates` distinguent
les spans du thread principal, les délais asynchrones et les fenêtres statistiques.
Ne pas additionner des spans imbriqués comme s'ils étaient des coûts CPU indépendants.
Les `spikes` utilisent l'union des intervalles instrumentés pour leur couverture CPU.
`longTasks` donne les 20 plus longues tâches ; `longAnimationFrames`, quand le
navigateur le permet, ajoute le temps bloquant, le début du rendu/layout et les
scripts les plus longs. Les paramètres et fragments des URL de scripts sont retirés.

Pour comparer deux passages, garder le même profil/version/seed, navigateur,
viewport/DPR, modes, immobilier et antialiasing, et préciser si les caches sont chauds.
Le profil extrême est déterministe. Le profil normal génère des gestes aléatoires :
son `seed: 0` ne permet pas de les rejouer ; consulter aussi les gestes de `steps`
avant de comparer ses résultats.
Le profil normal exclut les captures d'image de ses fenêtres de gestes ; son
sondage `performance` continu couvre aussi les attentes et captures entre gestes.
L'extrême mesure activation, mouvements et récupération ; ses 500 ms de post-roll
causal ne sont pas inclus dans le calcul FPS des gestes.

`capabilities.basemapPixelCoverage` indique si une vraie mesure de couverture des
images raster est disponible. Sur MapLibre, cette valeur est `false` : le rapport
utilise `maplibreAudit` et `capabilities.basemapReadiness` pour le chargement des
styles/tuiles, sans prétendre que ces états prouvent l'absence de trous dans les pixels.
