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
for timer in random-line@daily-auto-morning random-line@daily-auto-evening random-line@video-enrich random-line@trend-subjects random-line@web-embed random-line@like-pool random-line@pools random-line@feeds random-line@authors random-line@music-live random-line@fresh random-line@web-previews random-line@dig random-line@drift random-status; do
  systemctl enable --now "${timer}.timer"
done
systemctl list-timers 'random-*' --no-pager
