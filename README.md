# RANDOM — gorandom.fun

Une machine à surprise inutile. Chaque clic tire un contenu au hasard : vidéo, image ou GIF,
site web, citation, blague, fait insolite, quiz. Le bouton **Wave** propose ensuite des contenus
reliés au contenu affiché.

---

## Architecture

Trois briques, hébergées séparément :

| Brique | Rôle | Hébergeur |
|---|---|---|
| Site Next.js | pages publiques, API, pages d'administration | Vercel |
| Base MongoDB | catalogue des contenus, likes, rapports d'ingestion | ScaleGrid |
| Ingestion quotidienne | remplit le catalogue depuis YouTube, Dailymotion, Giphy… | GitHub Actions |

Le catalogue vit dans une seule collection `items`, tous types de contenus confondus.

---

## Démarrer en local

```bash
npm install
npm run dev          # http://localhost:3000
```

Il faut un fichier `.env.local` à la racine (voir les variables plus bas). Il n'est pas versionné.

---

## Organisation du code

```
app/
  page.tsx           page d'accueil
  random/            l'expérience principale (RandomExperience.tsx)
  admin/             pages d'administration (voir « Accès admin »)
  api/               toutes les routes serveur
components/          composants React partagés
lib/
  auth/              authentification des routes d'administration
  random/            moteur de tirage et Wave (version actuelle)
  discovery/         moteur de découverte et curation (version actuelle)
  ingest/            connecteurs des fournisseurs de contenus
  v3/                briques de la refonte en cours
scripts/             tâches lancées à la main ou par les workflows
tests/               tests automatiques (node --test)
```

### Groupes de routes API

| Préfixe | Accès | Rôle |
|---|---|---|
| `/api/random`, `/api/wave` | public | tirage et suggestions |
| `/api/feedback/*` | public, à débit limité | likes, signalements de contenus cassés |
| `/api/submissions`, `/api/likes/*` | public | propositions de contenus, likes |
| `/api/ingest/*` | **admin** | ingestion de contenus |
| `/api/cron/*` | **admin** | tâches planifiées |
| `/api/tools/*` | **admin** | maintenance du catalogue |
| `/api/admin/*` | **admin** | statistiques et pilotage |
| `/api/discovery/random`, `/api/discovery/wave` | public | moteur de tirage et Wave utilisé par le site |
| `/api/discovery/curation*` | curateur | curation privée |

---

## Accès admin

Deux mécanismes distincts, à ne pas confondre :

**1. Clé d'ingestion** — `ADMIN_INGEST_KEY`, envoyée dans l'en-tête `x-admin-ingest-key`.
Protège `/api/ingest/*`, `/api/cron/*`, `/api/tools/*` et `/api/admin/*`, ainsi que les pages
`/admin/ingest`, `/admin/ingest-reports`, `/admin/stats` et `/admin/import-ai`.

Une tâche planifiée peut aussi s'authentifier avec `Authorization: Bearer $CRON_SECRET`.

La clé **n'est jamais acceptée en paramètre d'URL** (`?key=`), et l'en-tête `x-vercel-cron` comme
le user-agent ne valent aucune preuve d'identité : un client les choisit librement.
Tout est centralisé dans `lib/auth/adminAuth.ts` — ne pas réécrire de contrôle d'accès ailleurs.

**2. Session curateur** — `RANDOM_CURATOR_SECRET`, saisi dans un formulaire qui pose un cookie
signé. Protège `/admin/curation/*` et `/api/discovery/curation/*` (`lib/discovery/curatorAuth.ts`).

Les pages `/admin/*` autres que `curation` et `ingest-reports` ne répondent qu'en local
(`middleware.ts`).

---

## Variables d'environnement

### Indispensables
| Variable | Rôle |
|---|---|
| `MONGODB_URI` | connexion à la base |
| `MONGODB_DB` | nom de la base |
| `ADMIN_INGEST_KEY` | clé des routes d'administration |
| `RANDOM_CURATOR_SECRET` | accès à la curation privée (32 caractères minimum) |

### Fournisseurs de contenus
`YOUTUBE_API_KEY`, `GIPHY_API_KEY`, `TENOR_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`,
`GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX`, `QUIZBASE_API_KEY`.

### Ingestion et quotas
| Variable | Rôle |
|---|---|
| `CRON_SECRET` | authentifie une tâche planifiée |
| `RANDOM_INGEST_HOST` | hôte appelé par les scripts d'ingestion |
| `RANDOM_YT_PACING_ENABLED`, `RANDOM_YOUTUBE_QUOTA_ENABLED` | pilotage du quota YouTube |
| `RANDOM_DM_DISCOVERY_ENABLED`, `RANDOM_DM_DISCOVERY_DAILY_LIMIT` | quota Dailymotion |
| `DAILY_AUTO_PROFILE`, `DAILY_AUTO_WEB_PROVIDERS` | réglages du job quotidien |
| `RANDOM_DISCOVERY_WORKER_ENABLED`, `RANDOM_SUBJECT_MAINTENANCE_ENABLED`, `RANDOM_METADATA_REPAIR_ENABLED` | activation des tâches de découverte |

### Rapports par e-mail
`SMTP_URL` (ou `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_SECURE`),
`REPORT_EMAIL_FROM`, `REPORT_EMAIL_TO`, `REPORT_TIMEZONE`.

### Divers
`NEXT_PUBLIC_BASE_URL`, `RANDOM_RATE_LIMIT_SALT` (sel du hachage des adresses IP),
`EFFECTS_TEST_PASSWORD_HASH`.

---

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | build de production |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | vérification des types |
| `npm run test:v3` | tests de la refonte (sans base de données) |
| `npm run test:v3:mongo` | tests de la refonte qui écrivent, dans `${MONGODB_DB}_test` |
| `npm run test:discovery` | tests du moteur de découverte |
| `npm run daily:auto` | lance l'ingestion quotidienne à la main |
| `npm run discovery:audit` | audit du moteur de découverte |

Les tests qui écrivent en base utilisent **toujours** une base séparée, jamais la production ;
ils s'arrêtent d'eux-mêmes s'ils se retrouvent ailleurs.

---

## Workflows GitHub

| Workflow | Déclenchement | Rôle |
|---|---|---|
| `daily-auto-ingest.yml` | 7 h 10 et 8 h 40 UTC, d'avril à octobre | ingestion quotidienne |
| `daily-video-enrich.yml` | 7 h 55 UTC, d'avril à octobre | enrichissement des métadonnées vidéo |

Les deux s'authentifient avec le secret GitHub `ADMIN_INGEST_KEY`, qui doit rester identique à
la valeur configurée sur Vercel.

---

## Déploiement

Tout envoi sur `main` déclenche un déploiement de production sur Vercel.
Les variables d'environnement se règlent dans les paramètres du projet Vercel ; une variable
modifiée n'est prise en compte qu'au déploiement suivant.
