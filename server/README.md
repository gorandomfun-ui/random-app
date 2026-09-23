# Le serveur d'ingestion

Une machine gratuite Google Cloud (`e2-micro`, Debian 12) qui fait tourner l'ingestion de RANDOM, directement contre la base, à la place des jobs GitHub. Rien d'autre n'y tourne ; aucun port ouvert à part SSH.

## Ce qu'il y a ici

- `setup.sh` : prépare la machine une fois (mises à jour automatiques, 2 Go d'échange, Node 22, utilisateur `random` sans sudo, journaux bornés, clé de déploiement).
- `deploy.sh` : amène `/opt/random-app` au dernier `main` (clone la première fois, puis `git pull --ff-only` ; `npm ci` seulement si `package-lock.json` a changé).
- `run-line.sh <ligne>` : un passage d'une ligne, les réglages lus dans `.env.ingest`. Lignes : `daily-auto-morning` (09:10 et 10:40), `daily-auto-evening` (21:10 et 22:40), `video-enrich`, `trend-subjects`, `discovery`, `web-embed` (les sites encadrables, 03:20).
- `units/` : les unités systemd ; un timer par ligne aux heures des jobs GitHub (Paris), un verrou par ligne, une durée maximale par passage ; `random-status` écrit la santé du serveur toutes les 10 minutes.
- `install-units.sh` : installe les unités et démarre les timers.

## Les secrets

`/opt/random-app/.env.ingest`, droits `600`, propriétaire `random` : uniquement les variables de l'ingestion (MongoDB, clés YouTube / Giphy / Tenor / Pexels / Pixabay / Custom Search, hôte Vercel et clé d'ingestion, variables `RANDOM_YT_*` et `DAILY_AUTO_*`). Copié par `gcloud compute scp`, jamais affiché.

## Regarder

```
systemctl list-timers 'random-*'
journalctl -u random-line@daily-auto-morning -n 100
```

Et la page `/admin/ingest-reports` du site : le journal des passages, et la santé du serveur.
