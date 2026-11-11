#!/bin/sh
# Installa o aggiorna Fluxboard su un host Debian raggiungibile via SSH come root.
# Copia solo il codice: config/ e cache/ sull'host non vengono toccati se esistono già
# (la configurazione "viva" è quella modificata dal web). Al primo giro copia anche config/.
#
#   deploy/installa.sh root@192.168.1.50                 solo il codice
#   deploy/installa.sh root@192.168.1.50 --anche-config  anche tile, sorgenti, certificati e
#                                                       global.yaml (non disposizioni né segreti),
#                                                       dopo una copia di sicurezza di config/
set -eu
DEST="${1:?uso: deploy/installa.sh utente@host [--anche-config]}"
ANCHE_CONFIG="${2:-}"
cd "$(dirname "$0")/.."

# Lo script remoto viaggia come argomento (in base64): lo standard input porta già l'archivio.
REMOTO=$(cat <<'FINE'
set -eu
id fluxboard >/dev/null 2>&1 || useradd --system --home-dir /opt/fluxboard --shell /usr/sbin/nologin fluxboard
mkdir -p /opt/fluxboard /tmp/fluxboard-nuovo
tar -xzf - -C /tmp/fluxboard-nuovo
for d in server public plugin catalogo generi deploy docs node_modules; do rm -rf /opt/fluxboard/$d; mv /tmp/fluxboard-nuovo/$d /opt/fluxboard/; done
mv -f /tmp/fluxboard-nuovo/*.json /tmp/fluxboard-nuovo/*.md /opt/fluxboard/
if [ ! -f /opt/fluxboard/config/global.yaml ]; then
  mkdir -p /opt/fluxboard/config && cp -an /tmp/fluxboard-nuovo/config/. /opt/fluxboard/config/ && echo "config/ copiata (primo giro)"
elif [ "$ANCHE_CONFIG" = "--anche-config" ]; then
  copia="/opt/fluxboard/config.bak-$(date +%Y%m%d-%H%M%S).tgz"
  tar -czf "$copia" -C /opt/fluxboard config
  for d in tile sorgenti certificati generi; do mkdir -p /opt/fluxboard/config/$d; cp -a /tmp/fluxboard-nuovo/config/$d/. /opt/fluxboard/config/$d/; done
  cp -a /tmp/fluxboard-nuovo/config/global.yaml /opt/fluxboard/config/global.yaml
  echo "config aggiornata (tile, sorgenti, certificati, global.yaml); copia di prima in $copia"
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
