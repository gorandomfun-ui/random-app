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
#   bash /opt/random-app/server/run-line.sh lookalike
#   bash /opt/random-app/server/run-line.sh obsolete
#   bash /opt/random-app/server/run-line.sh youtube-drift
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

# The money brake (the owner, 8 and 11 October: never more than 2 € a month on Google Cloud; 18 October: 2 to 2.50 €).
# What the server sent this month, counted on its own network card and kept across restarts in
# /home/random/egress/<month>: past 20 GiB (about 2 € at Google's 0.1056 € a GiB after the first) the lines that send the
# most wait for the 1st of the next month; past 23 GiB (about 2.32 €), every line does. A month sends about 20 GB
# (measured 15-17 October: ~0.7 GB a day).
EGRESS_DIR=/home/random/egress
mkdir -p "${EGRESS_DIR}"
egress_month_bytes() {
  local state tx
  state="${EGRESS_DIR}/$(date -u +%Y-%m)"
  tx=$(awk '$1 ~ /^(ens|eth)[0-9a-z]*:$/ { print $10; exit }' /proc/net/dev)
  (
    flock -w 10 9 || { echo 0; exit 0; }
    if read -r last sum < "${state}" 2>/dev/null; then :; else last=${tx}; sum=0; fi
    if [ "${tx}" -ge "${last}" ]; then sum=$(( sum + tx - last )); else sum=$(( sum + tx )); fi
    echo "${tx} ${sum}" > "${state}"
    echo "${sum}"
  ) 9>"${EGRESS_DIR}/.lock"
}
sent_gib=$(( $(egress_month_bytes || echo 0) / 1073741824 ))
case "${LINE}" in
  web-previews|web-embed|web-commoncrawl|web-search|drift|youtube-drift|image-obsolete) heavy=1 ;;
  *) heavy=0 ;;
esac
# 15 and 18 GiB until 18 October, which would have stopped the sites and the drifts around the 26th.
if [ "${sent_gib}" -ge "${RANDOM_BRAKE_ALL_GIB:-23}" ] || { [ "${heavy}" = 1 ] && [ "${sent_gib}" -ge "${RANDOM_BRAKE_GIB:-20}" ]; }; then
  echo "[$(date -u +%FT%TZ)] ${LINE}: frein des 2,50 € : ${sent_gib} Go envoyés ce mois-ci, en pause jusqu'au 1er du mois"
  exit 0
fi

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
    # Then, in the minutes the pass leaves, the look-alikes of the likes, the same model (server/vec-window.sh).
    # The pass's budget by the hour (Paris): twelve minutes before the 11:30 dig, forty when the next dig is an hour away or more, forty-five at night.
    case "$(TZ=Europe/Paris date +%H)" in
      11) vec_minutes=12 ;;
      00|01) vec_minutes=45 ;;
      *) vec_minutes=40 ;;
    esac
    echo "[$(date -u +%FT%TZ)] ${LINE}: budget ${RANDOM_VEC_MINUTES:-${vec_minutes}} min"
    RANDOM_VEC_MINUTES="${RANDOM_VEC_MINUTES:-${vec_minutes}}" RANDOM_VEC_MAX="${RANDOM_VEC_MAX:-20000}" RANDOM_MODELS_DIR="${RANDOM_MODELS_DIR:-/home/random/models}" run flock -w 900 /home/random/locks/dig.lock flock -w 600 /home/random/locks/drift.lock flock -w 900 /home/random/locks/web-previews.lock bash server/vec-window.sh
    ;;
  lookalike)
    # The look-alikes of the likes in windows of their own, thirty minutes each (the owner, 6 October: 44 a day was the minutes
    # they had after the fingerprints, not the idea). The same 700 MB model, alone on the machine under the same locks as the fingerprints;
    # the dig's lock also keeps the two model lines apart. The fingerprints' window still lends its leftover minutes (server/vec-window.sh).
    # Twelve windows since 7 October (the owner: more look-alikes, none of them junk — the model judges every one).
    # The previews' lock is waited for up to twenty-five minutes: their run lasts twenty at most, and the 07:15 window of 7 October gave up at fifteen.
    # The night site check's too (the 03:50 window follows it): twenty minutes a night, seventy-five at most.
    # Since 15 October each window ends at a set time, before the next line that needs the same locks or the memory — a dig, a
    # drift, the night's site check, the images' check, the YouTube drift, the day's list: a line whose own lock is held does not
    # run at all. Waiting for a lock shortens the window instead. They fill the machine's free time, 549 minutes a day instead
    # of 360: the likes made since 2 October had never been visited, and there are twice as many likes to visit. The two after
    # the morning's and the evening's dig spend no YouTube unit: the hundred searches a day are taken (the dig about
    # fifty-five, the other windows three each).
    until=""
    case "$(TZ=Europe/Paris date +%H%M)" in
      23[3-5]?) until="tomorrow 00:15" ;;
      01[3-5]?) until="today 02:30" ;;
      02[3-5]?) until="today 03:15" ;;
      03[4-5]?) until="today 04:30" ;;
      04[3-5]?) until="today 05:03" ;;
      06[3-5]?) until="today 07:30" ;;
      07[3-5]?) until="today 08:30" ;;
      08[3-5]?) until="today 09:03" ;;
      10[0-2]?) until="today 10:37"; export YOUTUBE_API_KEY="" ;;
      12[3-5]?) until="today 13:25" ;;
      16[3-5]?) until="today 17:30" ;;
      17[3-5]?) until="today 18:03" ;;
      19[0-2]?) until="today 19:37"; export YOUTUBE_API_KEY="" ;;
      22[3-5]?) until="today 23:05" ;;
    esac
    end=""
    minutes="${RANDOM_LOOKALIKE_MINUTES:-30}"
    if [ -n "${until}" ]; then end=$(TZ=Europe/Paris date -d "${until}" +%s); minutes="${RANDOM_LOOKALIKE_MINUTES:-60}"; fi
    RANDOM_LOOKALIKE_END="${end}" RANDOM_LOOKALIKE_MINUTES="${minutes}" RANDOM_MODELS_DIR="${RANDOM_MODELS_DIR:-/home/random/models}" run flock -w 900 /home/random/locks/dig.lock flock -w 600 /home/random/locks/drift.lock flock -w 1500 /home/random/locks/web-previews.lock flock -w 1500 /home/random/locks/web-embed.lock node --import tsx scripts/v3/lookalike-direct.ts
    ;;
  youtube-drift)
    # The channels of the YouTube videos the base took, ten new uploads each, in the YouTube units the searches leave
    # (the owner, 11 October: the whole quota, for the ingestion). No model; it ends before the small model's next window.
    RANDOM_YT_DRIFT_MINUTES="${RANDOM_YT_DRIFT_MINUTES:-25}" run node --import tsx scripts/v3/youtube-drift-direct.ts
    ;;
  image-obsolete)
    # The night's check of the pictures and GIFs: the reported ones, then thirty-five thousand of the stock in turn (each once a
    # month), a HEAD each; the dead wait for the owner's button. About 20 MB sent: under the 2 € brake with the heavy lines.
    RANDOM_IMAGE_OBSOLETE_MINUTES="${RANDOM_IMAGE_OBSOLETE_MINUTES:-30}" run node --import tsx scripts/v3/image-obsolete-direct.ts
    ;;
  obsolete)
    # The nightly check of the stored videos: the dead are marked and hidden, the owner deletes them from the page
    # (public/erase-obsolete-videos.html). No model, little memory; it ends before the 06:35 look-alikes (35 minutes).
    RANDOM_OBSOLETE_MINUTES="${RANDOM_OBSOLETE_MINUTES:-35}" run node --import tsx scripts/v3/obsolete-direct.ts
    ;;
  dm-bait)
    # Piracy bait on Dailymotion (24 October: account x1cfbdd, thirty-eight stills of 302 s with a fake player): the
    # accounts whose undescribed videos entered in the last day, then a bounded number of the base's, each asked once,
    # two a second at most; a bait account is listed for the door, its rows saved under /home/random/backups/dm-bait,
    # then deleted. No model, no YouTube unit, little memory; it ends before the 03:42 previews (25 minutes).
    RANDOM_DM_BAIT_MINUTES="${RANDOM_DM_BAIT_MINUTES:-25}" RANDOM_BACKUP_DIR="${RANDOM_BACKUP_DIR:-/home/random/backups}" run node --import tsx scripts/v3/dm-bait-direct.ts --base
    ;;
  drift)
    # Dailymotion's related videos and small uploaders, from the likes and the weird themes: the owner's way of browsing, no YouTube unit.
    run node --import tsx scripts/v3/drift-direct.ts
    ;;
  languages)
    # Dailymotion asked language by language for the world card (16 October): the scarce languages of Europe, in Latin
    # letters, Cyrillic or Greek, a declaration the title contradicts refused. Free, no YouTube unit, no model; a few MB a run.
    RANDOM_LANGUAGES_MINUTES="${RANDOM_LANGUAGES_MINUTES:-15}" run node --import tsx scripts/v3/languages-direct.ts
    ;;
  bilibili)
    # Bilibili's videos for a computer (16 October): its player plays nothing on a phone outside China, so they go to a
    # collection no card reads but the world card, for a computer. Free, no YouTube unit, no model; a few MB a run.
    RANDOM_BILIBILI_MINUTES="${RANDOM_BILIBILI_MINUTES:-10}" run node --import tsx scripts/v3/bilibili-direct.ts
    ;;
  anecdotes)
    # Wikipedia's "Did you know" anecdotes, once a week (24 October): the current and the previous month in French, English
    # and German, only those not stored yet, in one grouped write. Six pages a second apart, about a megabyte read; free,
    # no YouTube unit, no model.
    RANDOM_ANECDOTES_MINUTES="${RANDOM_ANECDOTES_MINUTES:-10}" run node --import tsx scripts/v3/anecdotes-direct.ts
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
    # The key goes through a private file, never through the journal (the run's echo logged it on 3 October).
    header_file="/home/random/.admin-header"
    (umask 077; printf 'x-admin-ingest-key: %s\n' "${ADMIN_INGEST_KEY:?}" > "${header_file}")
    # Since 12 October also Neocities' gallery read as pages and two lists of handmade and toy sites ("lists"): onto the waiting list.
    run curl -sS -m 280 -H "@${header_file}" "${RANDOM_INGEST_HOST:?}/api/ingest/web?providers=hn,curated,neocities,lists,wikipedia&per=10&pages=3"
    ;;
  web-commoncrawl)
    # One country a day from Common Crawl's public index: the live front pages under its domain, onto the waiting list (lib/v3/web/commoncrawl.ts). Free, no key.
    RANDOM_CC_CACHE="${RANDOM_CC_CACHE:-/home/random/cache/cc}" run node --import tsx scripts/v3/web-commoncrawl.ts
    ;;
  web-embed)
    # Which stored sites can be framed inside Random: the never asked first, then the stale verdicts. Five thousand a night
    # from 12 October (about 23 minutes at 217 a minute): the 46,428 never asked caught up in about ten nights, since only
    # these are drawn; a new site is asked at its visit (scripts/v3/web-previews.ts).
    run node --import tsx scripts/v3/check-web-links.ts --apply --fresh --max="${RANDOM_WEB_EMBED_MAX:-5000}"
    ;;
  *)
    echo "ligne inconnue : ${LINE}" >&2
    exit 2
    ;;
esac
