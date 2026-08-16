#!/usr/bin/env bash
# Hardening origin VPS: Docker bypass, nginx block IP diretto, fail2ban.
# Eseguire come root sulla VPS.
# NOTA: non limitare SSH UFW a un solo IP — con IP dinamico ti blocchi fuori.
#       fail2ban basta per SSH; in emergenza usa console PebbleHost (VNC).
set -euo pipefail

KNOWN_IPS="${KNOWN_IPS:-37.101.247.129 151.45.80.158}"

echo "=== A) Blocca bypass Docker su 8080/3000 (ufw non basta da solo) ==="
mkdir -p /etc/ufw
AFTER=/etc/ufw/after.rules
if ! grep -q "BEGIN DOCKER-UFW-BLOCK" "$AFTER" 2>/dev/null; then
  cat >>"$AFTER" <<'EOF'

# BEGIN DOCKER-UFW-BLOCK
*filter
:ufw-docker-user - [0:0]
-A DOCKER-USER -j ufw-docker-user
-A ufw-docker-user -i docker0 -j RETURN
-A ufw-docker-user -i br+ -j RETURN
-A ufw-docker-user -p tcp -m tcp --dport 8080 -j DROP
-A ufw-docker-user -p tcp -m tcp --dport 3000 -j DROP
-A ufw-docker-user -j RETURN
COMMIT
# END DOCKER-UFW-BLOCK
EOF
  ufw reload
fi

iptables -C DOCKER-USER -j ufw-docker-user 2>/dev/null || iptables -I DOCKER-USER 1 -j ufw-docker-user

echo "=== B) Nginx: rifiuta accesso diretto via IP (return 444) ==="
BLOCK=/etc/nginx/sites-available/block-ip-direct
if [ ! -f "$BLOCK" ]; then
  cat >"$BLOCK" <<'EOF'
server {
    listen 80 default_server;
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate /etc/letsencrypt/live/viniliecaffe.it/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/viniliecaffe.it/privkey.pem;
    return 444;
}
EOF
  ln -sf /etc/nginx/sites-available/block-ip-direct /etc/nginx/sites-enabled/00-block-ip-direct
  nginx -t
  systemctl reload nginx
fi

echo "=== C) SSH: porta 22 aperta + fail2ban (no whitelist UFW per IP) ==="
export DEBIAN_FRONTEND=noninteractive
apt-get install -y fail2ban
ufw allow 22/tcp comment "SSH (fail2ban)" 2>/dev/null || true
install -d -m 0755 /etc/fail2ban/jail.d
cat >/etc/fail2ban/jail.d/sshd.local <<EOF
[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 10
bantime = 30m
findtime = 15m
ignoreip = 127.0.0.1/8 ${KNOWN_IPS}
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "=== D) Verifica finale ==="
ufw status verbose | head -30
echo "---"
ss -tlnp | awk 'NR==1 || /:22 |:80 |:443 |:3000 |:8080 /'
echo "---"
iptables -S DOCKER-USER | head -10
echo "---"
systemctl is-active fail2ban
echo "Fatto. SSH: porta 22 aperta; fail2ban attivo. IP noti in ignoreip: ${KNOWN_IPS}"
