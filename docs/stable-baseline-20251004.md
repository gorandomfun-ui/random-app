# Stable Baseline – 2025-10-04

## Objectif
Ce document fige l’état stable actuel de l’application Random App afin de pouvoir y revenir si de futures expérimentations (quiz, contenus IA, etc.) posent problème.

## Référence du snapshot
- Branche de référence : `main`
- Commit exact : `aa723b600354f7722ec21e3a8b5d028b9a23d03f`
- Date du snapshot : 2025-10-04 (UTC+0)
- Version Node recommandée : même que l’environnement de dev courant (consulter `.nvmrc` s’il existe ou `node -v` sur la machine de build avant de figer la version).

## Comment valider la stabilité
1. Repartir d’un clone propre :
   ```bash
   git checkout main
   git fetch origin
   git reset --hard aa723b600354f7722ec21e3a8b5d028b9a23d03f
   npm ci
   npm run lint
   npm run build
   ```
2. Vérifier le démarrage en local :
   ```bash
   npm run dev
   ```
   et confirmer que les pages principales (accueil, random, modals) fonctionnent.

## Étiqueter / tagger la version
- Créer un tag annoté pour la stabilité :
  ```bash
  git tag -a stable-20251004 aa723b600354f7722ec21e3a8b5d028b9a23d03f -m "Stable baseline 2025-10-04"
  git push origin stable-20251004
  ```
- Optionnel : créer une branche de maintenance dédiée :
  ```bash
  git branch stable/2025-10-04 aa723b600354f7722ec21e3a8b5d028b9a23d03f
  git push origin stable/2025-10-04
  ```

## Variables d’environnement essentielles
Sauvegarder le contenu actuel de `.env.local` et des variables de déploiement avant toute modification. Points critiques identifiés dans le code :
- **Base de données** : `MONGO_URI` ou `MONGODB_URI`, `MONGODB_DB`
- **Clés d’ingestion** : `ADMIN_INGEST_KEY`, `REPORT_CRON_KEY`, `REPORT_EMAIL_*`
- **Services médias** : `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `GIPHY_API_KEY`, `TENOR_API_KEY`, `YOUTUBE_API_KEY`, `UNSPLASH_ACCESS_KEY`
- **Configuration front** : `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_PROPELLER_ADS_ID`
- **Email / SMTP** : `SMTP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `REPORT_EMAIL_FROM`, `REPORT_EMAIL_TO`

Conseil : stocker ces valeurs dans un coffre de secrets (1Password, Vault, etc.) et versionner un `.env.example` anonymisé si nécessaire.

## Procédure de retour arrière
1. Stopper les déploiements en cours et prévenir l’équipe.
2. Revenir sur la version taggée :
   ```bash
   git fetch origin --tags
   git checkout stable-20251004
   npm ci
   npm run build
   ```
3. Déployer cette révision sur l’environnement cible (ex : Vercel) en s’assurant que les variables d’environnement sont identiques à celles sauvegardées.
4. Après stabilisation, revenir à `main` pour continuer le développement :
   ```bash
   git checkout main
   ```

## Quand mettre à jour ce document
- Après chaque nouvelle version jugée stable (post-déploiement validé), répéter la procédure : noter le commit, actualiser la date, et créer un nouveau tag `stable-YYYYMMDD`.
- L’ancienne version du document peut être archivée dans `docs/archive/` si besoin pour garder l’historique des étapes précédentes.

## Checklist rapide
- [ ] Les builds CI/passent sur le commit `aa723b600354f7722ec21e3a8b5d028b9a23d03f`
- [ ] Les variables d’environnement existantes sont sauvegardées
- [ ] Le tag `stable-20251004` est poussé sur le remote
- [ ] La procédure de retour arrière est testée (facultatif mais recommandé)

Conserver ce document à jour garantit un filet de sécurité avant d’introduire le quiz, les contenus IA ou tout autre changement majeur.
