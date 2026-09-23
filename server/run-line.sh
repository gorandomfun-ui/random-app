#!/usr/bin/env bash
# One ingestion pass, as the timers run it: the code brought to main first,
# the settings read from .env.ingest, one pass at a time per line (flock),
# and the pass itself recorded by its own journal (ingest_runs_v3).
#
#   bash /opt/random-app/server/run-line.sh daily-auto-morning
#   bash /opt/random-app/server/run-line.sh daily-auto-evening
#   bash /opt/random-app/server/run-line.sh video-enrich
#   bash /opt/random-app/server/run-line.sh trend-subjects
#   bash /opt/random-app/server/run-line.sh discovery
#   bash /opt/random-app/server/run-line.sh web-embed
set -euo pipefail

APP_DIR=/opt/random-app
LINE=${1:?line name}
LOCK_DIR=/home/random/locks
mkdir -p "${LOCK_DIR}"

cd "${APP_DIR}"
bash server/deploy.sh > /dev/null
set -a
# shellcheck disable=SC1091
. "${APP_DIR}/.env.ingest"
set +a
export RANDOM_INGEST_SERVER=1

run() { echo "[$(date -u +%FT%TZ)] ${LINE}: $*"; "$@"; }

case "${LINE}" in
  daily-auto-morning|daily-auto-evening)
    # The GitHub job, step by step: the trending line directly, the daily pipeline, then the direct exploration.
    export DAILY_AUTO_PROFILE=${LINE#daily-auto-}
    export DAILY_AUTO_TRENDS_ON_GITHUB=1
    export DAILY_AUTO_SKIP_COMPLETED=true
    run node --import tsx scripts/v3/trending-direct.ts || true
    run node scripts/daily-auto-ingest.mjs
    if [ "${RANDOM_DISCOVERY_ON_SERVER:-1}" = "1" ]; then
      run node --import tsx scripts/discovery/repair-metadata.ts --apply || true
      run node --import tsx scripts/discovery/maintain-subjects.ts --apply || true
      run npm run -s discovery:explore || true
    fi
    ;;
  video-enrich)
    run node scripts/daily-video-enrich.mjs
    ;;
  trend-subjects)
    run node --import tsx scripts/v3/trend-subjects-direct.ts
    ;;
  discovery)
    run npm run -s discovery:explore
    ;;
  web-embed)
    # Which stored sites can be framed inside Random: the new entries first, then the stale verdicts.
    run node --import tsx scripts/v3/check-web-links.ts --apply --fresh --max="${RANDOM_WEB_EMBED_MAX:-2000}"
    ;;
  *)
    echo "ligne inconnue : ${LINE}" >&2
    exit 2
    ;;
esac
