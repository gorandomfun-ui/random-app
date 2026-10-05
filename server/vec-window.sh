#!/usr/bin/env bash
# The small model's window (server/run-line.sh, vec), under the dig's, the drift's and the previews' locks:
# the fingerprints first — today's and yesterday's entries, then the old stock — and, with the minutes the
# window has left, the look-alikes of the likes (lib/v3/ingest/lines/lookalike.ts). Both load the 700 MB
# model, one after the other, never beside another line.
set -uo pipefail
budget=${RANDOM_VEC_MINUTES:?the window in minutes}
start=$(date +%s)
node --import tsx scripts/v3/vec-direct.ts
status=$?
left=$(( budget - ($(date +%s) - start) / 60 ))
if [ "${left}" -ge "${RANDOM_LOOKALIKE_MIN_MINUTES:-4}" ]; then
  echo "[$(date -u +%FT%TZ)] lookalike: ${left} min left in the window"
  RANDOM_LOOKALIKE_MINUTES=${left} node --import tsx scripts/v3/lookalike-direct.ts || true
fi
exit ${status}
