#!/bin/sh
# Installs or updates Fluxboard on a Debian host reachable via SSH as root.
# Copies only the code: config/ and cache/ on the host are not touched if they already exist
# (the "live" configuration is the one changed from the web). On the first run it copies config/ too.
#
#   deploy/installa.sh root@192.168.1.50                 code only
#   deploy/installa.sh root@192.168.1.50 --with-config   tiles, sources, certificates and
#                                                       global.yaml too (not layouts nor secrets),
#                                                       after a backup copy of config/
set -eu
DEST="${1:?usage: deploy/installa.sh user@host [--with-config]}"
ANCHE_CONFIG="${2:-}"
# --with-config is the English spelling of --anche-config.
[ "$ANCHE_CONFIG" = "--with-config" ] && ANCHE_CONFIG="--anche-config"
cd "$(dirname "$0")/.."

# The remote script travels as an argument (in base64): standard input already carries the archive.
REMOTO=$(cat <<'FINE'
set -eu
id fluxboard >/dev/null 2>&1 || useradd --system --home-dir /opt/fluxboard --shell /usr/sbin/nologin fluxboard
mkdir -p /opt/fluxboard /tmp/fluxboard-nuovo
tar -xzf - -C /tmp/fluxboard-nuovo
for d in server public plugin catalogo generi deploy docs node_modules; do rm -rf /opt/fluxboard/$d; mv /tmp/fluxboard-nuovo/$d /opt/fluxboard/; done
mv -f /tmp/fluxboard-nuovo/*.json /tmp/fluxboard-nuovo/*.md /opt/fluxboard/
if [ ! -f /opt/fluxboard/config/global.yaml ]; then
  mkdir -p /opt/fluxboard/config && cp -an /tmp/fluxboard-nuovo/config/. /opt/fluxboard/config/ && echo "config/ copied (first run)"
elif [ "$ANCHE_CONFIG" = "--anche-config" ]; then
  copia="/opt/fluxboard/config.bak-$(date +%Y%m%d-%H%M%S).tgz"
  tar -czf "$copia" -C /opt/fluxboard config
  for d in tile sorgenti certificati generi; do mkdir -p /opt/fluxboard/config/$d; cp -a /tmp/fluxboard-nuovo/config/$d/. /opt/fluxboard/config/$d/; done
  cp -a /tmp/fluxboard-nuovo/config/global.yaml /opt/fluxboard/config/global.yaml
  echo "config updated (tiles, sources, certificates, global.yaml); previous copy in $copia"
fi
rm -rf /tmp/fluxboard-nuovo
mkdir -p /opt/fluxboard/cache
chown -R fluxboard:fluxboard /opt/fluxboard/config /opt/fluxboard/cache
cp /opt/fluxboard/deploy/fluxboard.service /etc/systemd/system/fluxboard.service
systemctl daemon-reload
systemctl enable --quiet fluxboard
systemctl restart fluxboard
sleep 2
systemctl is-active fluxboard
FINE
)
CODICE=$(printf '%s\n' "$REMOTO" | base64 | tr -d '\n')

COPYFILE_DISABLE=1 tar -czf - --exclude=.git --exclude=.env --exclude=.claude --exclude=cache --exclude=.DS_Store \
    --exclude=config/.storico --exclude=config/.cestino --exclude=config/segreti.env \
    package.json package-lock.json node_modules server public plugin catalogo generi deploy docs config \
    README.md CHANGELOG.md AGENTS.md \
  | ssh "$DEST" "echo $CODICE | base64 -d > /tmp/fluxboard-installa.sh && ANCHE_CONFIG='$ANCHE_CONFIG' sh /tmp/fluxboard-installa.sh; esito=\$?; rm -f /tmp/fluxboard-installa.sh; exit \$esito"
