#!/usr/bin/env bash
# Installs (or refreshes) the systemd units and starts the timers. Root, idempotent:
#
#   sudo bash /opt/random-app/server/install-units.sh
set -euo pipefail
cp /opt/random-app/server/units/*.service /opt/random-app/server/units/*.timer /etc/systemd/system/
# Per-line settings (units/<unit>.d/*.conf): the preview line runs Chromium, gently.
for dropins in /opt/random-app/server/units/*.d; do
  [ -d "${dropins}" ] || continue
  mkdir -p "/etc/systemd/system/$(basename "${dropins}")"
  cp "${dropins}"/*.conf "/etc/systemd/system/$(basename "${dropins}")/"
done
mkdir -p /home/random/locks && chown random:random /home/random/locks
systemctl daemon-reload
# Only the lines in service since 28 September (the owner paused the rest to keep the YouTube quota; the install of 1 October
# re-enabled them all by mistake and 2 October brought twenty thousand unsorted videos): the dig, the day's list, the drift,
# the sites' visits and framing checks (no Google search in them — the owner wants sites found without CSE), the status;
# the lines added since by hand (the look-alikes, the YouTube drift, the night checks of videos and images); and the like
# pool's count, which spends no YouTube unit and was stopped on 2 October by mistake (the likes made since stayed out of it);
# the languages of the world from Dailymotion (16 October).
for timer in random-line@fresh random-line@dig random-line@drift random-line@vec random-line@web-previews random-line@web-embed random-line@web-search random-line@web-commoncrawl random-line@lookalike random-line@youtube-drift random-line@obsolete random-line@image-obsolete random-line@like-pool random-line@languages random-status; do
  systemctl enable --now "${timer}.timer"
done
systemctl list-timers 'random-*' --no-pager
