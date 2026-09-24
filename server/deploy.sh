#!/usr/bin/env bash
# Brings /opt/random-app to the tip of main. Run as the `random` user, by the
# timers before each pass and by hand after a change:
#
#   bash /opt/random-app/server/deploy.sh
#
# Clones on the first run; then `git pull --ff-only`, and `npm ci` only when
# the lock file changed. Never touches .env.ingest. The lines run through
# `tsx`, a development dependency: the timers run with NODE_ENV=production,
# under which `npm ci` drops it — hence `--include=dev`, or every
# `node --import tsx` line dies at the next lock change (24 September).
set -euo pipefail

APP_DIR=/opt/random-app
REPO=${RANDOM_REPO:-git@github.com:gorandomfun-ui/random-app.git}
BRANCH=${RANDOM_BRANCH:-main}

if [ ! -d "${APP_DIR}/.git" ]; then
  git clone --branch "${BRANCH}" --single-branch "${REPO}" "${APP_DIR}"
  cd "${APP_DIR}"
  npm ci --include=dev --ignore-scripts --no-audit --no-fund
  exit 0
fi

cd "${APP_DIR}"
before=$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)
git fetch --quiet origin "${BRANCH}"
git merge --ff-only --quiet "origin/${BRANCH}"
after=$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)
if [ "${before}" != "${after}" ] || [ ! -d node_modules ]; then
  npm ci --include=dev --ignore-scripts --no-audit --no-fund
fi
echo "déployé : $(git rev-parse --short HEAD)"
