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
# re-enabled them all by mistake and 2 October brought twenty thousand unsorted videos): the dig, the day's list, the drift, the status.
for timer in random-line@fresh random-line@dig random-line@drift random-status; do
  systemctl enable --now "${timer}.timer"
done
systemctl list-timers 'random-*' --no-pager
