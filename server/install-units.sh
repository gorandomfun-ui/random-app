#!/usr/bin/env bash
# Installs (or refreshes) the systemd units and starts the timers. Root, idempotent:
#
#   sudo bash /opt/random-app/server/install-units.sh
set -euo pipefail
cp /opt/random-app/server/units/*.service /opt/random-app/server/units/*.timer /etc/systemd/system/
mkdir -p /home/random/locks && chown random:random /home/random/locks
systemctl daemon-reload
for timer in random-line@daily-auto-morning random-line@daily-auto-evening random-line@video-enrich random-line@trend-subjects random-line@web-embed random-line@like-pool random-line@pools random-line@feeds random-status; do
  systemctl enable --now "${timer}.timer"
done
systemctl list-timers 'random-*' --no-pager
