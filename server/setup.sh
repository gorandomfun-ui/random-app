#!/usr/bin/env bash
# The ingestion server, once: Debian 12 on an e2-micro, prepared for RANDOM's
# ingestion and nothing else. Run as root, right after the machine is created:
#
#   sudo bash /tmp/setup.sh
#
# Idempotent: running it twice changes nothing. No port is opened; SSH only.
set -euo pipefail

APP_DIR=/opt/random-app
APP_USER=random
NODE_MAJOR=22
SWAP_GB=2

echo "== système : mises à jour et sécurité automatique"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q unattended-upgrades apt-listchanges git curl ca-certificates gnupg util-linux
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== mémoire : ${SWAP_GB} Go de fichier d'échange (la machine n'a que 1 Go)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l "${SWAP_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 > /dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "== journaux : 200 Mo au plus"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/random.conf <<'CONF'
[Journal]
SystemMaxUse=200M
CONF
systemctl restart systemd-journald

echo "== Node ${NODE_MAJOR}"
if ! command -v node > /dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" != "${NODE_MAJOR}" ]; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -y -q nodejs
fi
node -v

echo "== utilisateur ${APP_USER}, sans sudo"
id "${APP_USER}" > /dev/null 2>&1 || useradd --system --create-home --home-dir "/home/${APP_USER}" --shell /bin/bash "${APP_USER}"
mkdir -p "${APP_DIR}"
chown "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "== clé de déploiement (lecture seule) pour GitHub"
sudo -u "${APP_USER}" bash -c '
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -C "random-ingest deploy key" -f ~/.ssh/id_ed25519 -q
  ssh-keyscan -t ed25519 github.com 2>/dev/null >> ~/.ssh/known_hosts
  sort -u ~/.ssh/known_hosts -o ~/.ssh/known_hosts
'
echo
echo "Clé publique à ajouter dans GitHub → Settings → Deploy keys (lecture seule) :"
cat "/home/${APP_USER}/.ssh/id_ed25519.pub"
echo
echo "== fini. Ensuite : cloner avec server/deploy.sh, déposer .env.ingest, installer les unités systemd."
