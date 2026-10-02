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
#   bash /opt/random-app/server/run-line.sh like-pool
#   bash /opt/random-app/server/run-line.sh pools
#   bash /opt/random-app/server/run-line.sh dig
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
    # Four full passes a day, as GitHub actually ran them: its second pass of each half-day was meant to skip a
    # profile already completed and never did (four times ~4,000 contents on 22 September). Two passes gave half.
    export DAILY_AUTO_SKIP_COMPLETED=false
    run node --import tsx scripts/v3/trending-direct.ts || true
    run node scripts/daily-auto-ingest.mjs
    if [ "${RANDOM_DISCOVERY_ON_SERVER:-1}" = "1" ]; then
      run node --import tsx scripts/discovery/repair-metadata.ts --apply || true
      run node --import tsx scripts/discovery/maintain-subjects.ts --apply || true
      run npm run -s discovery:explore || true
    fi
    # The like pool right after the pass: the journal shows how much the ingestion grew it.
    run node --import tsx scripts/v3/like-pool.ts || true
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
  pools)
    # The big universes grown a little every night, on Dailymotion only: no YouTube unit spent.
    run node --import tsx scripts/v3/pools-direct.ts
    ;;
  like-pool)
    # The zones around the likes and their sizes, as the like tickets draw them.
    run node --import tsx scripts/v3/like-pool.ts
    ;;
  authors)
    # The people whose work was liked, and what they have published since.
    run node --import tsx scripts/v3/authors-direct.ts
    ;;
  fresh)
    # The charts of the moment, zone by zone, and the day's list the sessions open on.
    run node --import tsx scripts/v3/fresh-direct.ts
    ;;
  dig)
    # The four bases, one line: people, keywords, trends, likes, each subject dug top, around, channels, Dailymotion.
    run node --import tsx scripts/v3/dig-direct.ts
    ;;
  vec)
    # The fingerprints: the small model writes what each new video is about, then the old stock a slice at a time (lib/v3/ai/fingerprint.ts).
    # Alone on the machine: the model fills 700 MB of its 969, so beside the dig, the drift or the previews' Chromium it swaps to a
    # standstill (2 October, twice). It waits for their locks and holds them while it runs — twelve to forty-five minutes — so a run of
    # theirs that fires meanwhile skips once (the previews come back half an hour later); its timer sits after the drift's, before the dig's.
    # The pass's budget by the hour (Paris): twelve minutes before the 11:30 dig, forty when the next dig is an hour away or more, forty-five at night.
    case "$(TZ=Europe/Paris date +%H)" in
      11) vec_minutes=12 ;;
      00|01) vec_minutes=45 ;;
      *) vec_minutes=40 ;;
    esac
    RANDOM_VEC_MINUTES="${RANDOM_VEC_MINUTES:-${vec_minutes}}" RANDOM_VEC_MAX="${RANDOM_VEC_MAX:-20000}" RANDOM_MODELS_DIR="${RANDOM_MODELS_DIR:-/home/random/models}" run flock -w 900 /home/random/locks/dig.lock flock -w 600 /home/random/locks/drift.lock flock -w 900 /home/random/locks/web-previews.lock node --import tsx scripts/v3/vec-direct.ts
    ;;
  drift)
    # Dailymotion's related videos and small uploaders, from the likes and the weird themes: the owner's way of browsing, no YouTube unit.
    run node --import tsx scripts/v3/drift-direct.ts
    ;;
  music-live)
    # Concerts from everywhere and recent clips off the charts; a small YouTube allowance, paid by the old pass running twice a day.
    run node --import tsx scripts/v3/music-live-direct.ts
    ;;
  feeds)
    # Communities where people already did the sorting; the videos found cost one unit per fifty checked.
    run node --import tsx scripts/v3/feeds-direct.ts
    ;;
  web-previews)
    # The sites waiting for a visit: alive or not, their own image or a capture by Chromium, then into the catalogue.
    run node --import tsx scripts/v3/web-previews.ts --minutes="${RANDOM_WEB_PREVIEW_MINUTES:-20}" --max="${RANDOM_WEB_PREVIEW_MAX:-300}"
    ;;
  web-search)
    # New small sites, once a day, from the sources that cost nothing — Hacker News, the curated lists, Neocities, Wikipedia — never Google (the owner, 2 October).
    run curl -sS -m 280 -H "x-admin-ingest-key: ${ADMIN_INGEST_KEY:?}" "${RANDOM_INGEST_HOST:?}/api/ingest/web?providers=hn,curated,neocities,wikipedia&per=10&pages=3"
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
