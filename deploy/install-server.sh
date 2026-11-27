#!/usr/bin/env bash
# Called only after the Windows build and upload have completed.

select_api_port() {
    local listeners nginx_config candidate
    listeners=$(ss -H -lnt) || return 1
    nginx_config=$(nginx -T 2>&1) || return 1
    for candidate in $(seq 9111 9199); do
        if ! awk '{print $4}' <<< "$listeners" | grep -Eq ":${candidate}$" &&
            ! grep -Eq ":${candidate}([/;[:space:]]|$)" <<< "$nginx_config"; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    echo 'No unused API port in 9111..9199.' >&2
    return 1
}

verify_https() {
    local domain=$1 certificate=$2 diagnostics=$3
    local ide_auth=${4:-false}
    local attempts=${CFZN_TLS_ATTEMPTS:-30} delay=${CFZN_TLS_RETRY_DELAY:-1}
    local attempt endpoint code ready expected body_check
    local -a endpoints=(/ /openblock.html /api/v1/health /api/v1/custom-modules)
    if [[ $ide_auth == true ]]; then
        endpoints+=(/login /sso /api/v1/ide/auth/me/ /api/v1/projects)
    fi
    [[ $attempts =~ ^[1-9][0-9]*$ && $attempts -le 60 && $delay =~ ^[0-5]$ ]] || return 2
    # A reload signals the master; the new workers may not accept connections yet.
    # Use fresh direct connections and keep certificate/hostname validation enabled.
    for ((attempt=1; attempt<=attempts; attempt++)); do
        ready=1
        for endpoint in "${endpoints[@]}"; do
            expected=200
            case "$endpoint" in
                /api/v1/ide/auth/me/|/api/v1/projects) expected=401 ;;
            esac
            if ! code=$(curl -q --noproxy '*' --http1.1 --connect-timeout 3 --max-time 8 \
                -sS --resolve "$domain:443:127.0.0.1" "https://$domain$endpoint" \
                -o "$diagnostics/https-body" -w '%{http_code}' 2> "$diagnostics/https-error"); then
                ready=0
                break
            fi
            if [[ $code != "$expected" ]]; then
                printf 'Unexpected HTTP %s for %s\n' "$code" "$endpoint" > "$diagnostics/https-error"
                ready=0
                break
            fi
            body_check=''
            if [[ $endpoint == /api/v1/health ]]; then body_check=health; fi
            if [[ $expected == 401 ]]; then body_check=unauthorized; fi
            if [[ -n $body_check ]] &&
                ! node -e '
                    const [file, check, auth] = process.argv.slice(1);
                    const body = JSON.parse(require("fs").readFileSync(file,"utf8"));
                    const healthy = body.status === "ok" && (auth !== "true" || (body.auth === "maker" && body.storage === "minio"));
                    if (check === "health" ? !healthy : body.error?.code !== "UNAUTHORIZED") process.exit(1);
                ' "$diagnostics/https-body" "$body_check" "$ide_auth" 2> "$diagnostics/https-error"; then
                printf 'Unexpected API response for %s\n' "$endpoint" >> "$diagnostics/https-error"
                ready=0
                break
            fi
        done
        if [[ $ready == 1 ]]; then
            echo 'PASS direct HTTPS: certificate, homepage, editor and API.'
            return 0
        fi
        printf 'HTTPS readiness attempt %s/%s failed; waiting for Nginx workers.\n' "$attempt" "$attempts" >&2
        cat "$diagnostics/https-error" >&2
        if [[ $attempt -lt $attempts ]]; then sleep "$delay"; fi
    done
    echo 'HTTPS did not become healthy. Expected on-disk certificate:' >&2
    openssl x509 -in "$certificate" -noout -subject -issuer -dates -fingerprint -sha256 >&2 || true
    echo 'Certificate actually served on 127.0.0.1:443 with IDE SNI:' >&2
    timeout 8 openssl s_client -connect 127.0.0.1:443 -servername "$domain" < /dev/null \
        2> "$diagnostics/tls-handshake.log" |
        openssl x509 -noout -subject -issuer -dates -fingerprint -sha256 >&2 || true
    return 1
}

gzip_static_setting() {
    # gzip_static is optional; dynamic gzip remains available on stock Nginx builds.
    if nginx -V 2>&1 | grep -q -- '--with-http_gzip_static_module'; then
        printf 'gzip_static %s;\n' "$1"
    fi
}

ide_auth_locations() {
    local port=$1 path
    for path in '= /api/v1/projects' '^~ /api/v1/projects/'; do
        cat <<EOF
    location $path {
        client_max_body_size 80m;
        gzip off;
        $(gzip_static_setting off)
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
EOF
    done
    cat <<'NGINX'
    location ~ ^/(?<ide_auth_page>login|sso)(?:[.]html|/)?$ {
        access_log off;
        try_files /$ide_auth_page.html =404;
        add_header Cache-Control no-store always;
        add_header Referrer-Policy no-referrer always;
        add_header X-Content-Type-Options nosniff always;
        add_header Permissions-Policy "serial=(self), usb=(self)" always;
    }
NGINX
}

# Static representation negotiation for the one content-addressed startup file.
# Among acceptable positive-q encodings this site prefers br, then gzip, then identity.
# This is a server preference, not a claim to rank different positive q weights.
gui_representation_maps() {
    local coding fallback zero positive any wild_zero wild_positive
    wild_zero='(?:^|,)[[:blank:]]*[*][[:blank:]]*;[[:blank:]]*q[[:blank:]]*=[[:blank:]]*0(?:[.]0{0,3})?[[:blank:]]*(?:,|$)'
    wild_positive='(?:^|,)[[:blank:]]*[*](?:[[:blank:]]*;[[:blank:]]*q[[:blank:]]*=[[:blank:]]*(?:1(?:[.]0{0,3})?|0[.](?:[1-9][0-9]{0,2}|0[1-9][0-9]?|00[1-9])))?[[:blank:]]*(?:,|$)'
    for coding in br gzip identity; do
        fallback=0; [[ $coding != identity ]] || fallback=1
        zero="(?:^|,)[[:blank:]]*$coding[[:blank:]]*;[[:blank:]]*q[[:blank:]]*=[[:blank:]]*0(?:[.]0{0,3})?[[:blank:]]*(?:,|$)"
        positive="(?:^|,)[[:blank:]]*$coding(?:[[:blank:]]*;[[:blank:]]*q[[:blank:]]*=[[:blank:]]*(?:1(?:[.]0{0,3})?|0[.](?:[1-9][0-9]{0,2}|0[1-9][0-9]?|00[1-9])))?[[:blank:]]*(?:,|$)"
        any="(?:^|,)[[:blank:]]*$coding(?:[[:blank:]]*;[^,]*)?[[:blank:]]*(?:,|$)"
        printf 'map $http_accept_encoding $ccraft_gui_%s {\n    default %s;\n' "$coding" "$fallback"
        printf '    "~*%s" 0;\n    "~*%s" 1;\n    "~*%s" 0;\n' "$zero" "$positive" "$any"
        printf '    "~*%s" 0;\n' "$wild_zero"
        if [[ $coding != identity ]]; then printf '    "~*%s" 1;\n' "$wild_positive"; fi
        printf '}\n'
    done
    cat <<'NGINX'
map "$ccraft_gui_br:$ccraft_gui_gzip:$ccraft_gui_identity" $ccraft_gui_encoding {
    default none;
    "~^1:" br;
    "~^0:1:" gzip;
    "0:0:1" identity;
}
map $status $ccraft_gui_br_header { default ""; 200 br; 206 br; 304 br; }
map $status $ccraft_gui_gzip_header { default ""; 200 gzip; 206 gzip; 304 gzip; }
NGINX
}

gui_representation_headers() {
    cat <<'NGINX'
        etag on;
        expires off;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Vary Accept-Encoding always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Permissions-Policy "serial=(self), usb=(self)" always;
NGINX
}

gui_representation_locations() {
    local name=${1:?content-addressed GUI filename required} coding suffix
    [[ $name =~ ^openblock-gui\.[a-f0-9]{16}\.js$ ]] || return 2
    cat <<EOF
    location = /openblock-vendor/$name {
        gzip off;
        $(gzip_static_setting off)
        gzip_vary off;
        if (!-f \$request_filename) { return 404; }
        if (\$ccraft_gui_encoding = none) { return 406; }
        if (\$ccraft_gui_encoding = br) { rewrite ^ /openblock-vendor/$name.br last; }
        if (\$ccraft_gui_encoding = gzip) { rewrite ^ /openblock-vendor/$name.gz last; }
        try_files \$uri =404;
        types { application/javascript js; }
$(gui_representation_headers)
    }
EOF
    for coding in br gzip; do
        suffix=$coding; [[ $coding != gzip ]] || suffix=gz
        cat <<EOF
    location = /openblock-vendor/$name.$suffix {
        internal;
        try_files \$uri =404;
        types { }
        default_type application/javascript;
        gzip off;
        $(gzip_static_setting off)
        gzip_vary off;
        add_header Content-Encoding \$ccraft_gui_${coding}_header;
$(gui_representation_headers)
    }
EOF
    done
}

validated_fast_gui() {
    node - "${1:?web directory required}" <<'NODE'
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const web = process.argv[2], html = fs.readFileSync(path.join(web, 'openblock.html'), 'utf8');
const matches = [...html.matchAll(/<script\b[^>]*\bsrc="\/openblock-vendor\/(openblock-gui\.[a-f0-9]{16}\.js)"/g)];
if (!matches.length) process.exit(0); // Previous releases retain their existing gzip/identity route.
if (matches.length !== 1) throw Error('Exactly one fast GUI script is required');
const name = matches[0][1], file = path.join(web, 'openblock-vendor', name), raw = fs.readFileSync(file);
if (!name.includes(crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16))) throw Error('Fast GUI digest mismatch');
for (const [suffix, decode] of [['.gz', zlib.gunzipSync], ['.br', zlib.brotliDecompressSync]]) {
  if (!decode(fs.readFileSync(file + suffix)).equals(raw)) throw Error('Fast GUI representation mismatch: ' + suffix);
}
console.log(name);
NODE
}

# Sourcing this file exposes only the pure deployment helpers for local checks.
if [[ ${BASH_SOURCE[0]} != "$0" ]]; then return 0; fi
set -Eeuo pipefail
umask 022
DOMAIN=ide.xiaodaiyang.top
SERVER_IP=8.138.226.239
BASE=/home/wwwroot/cfzn-ide
CONF=/etc/nginx/conf.d/ide.xiaodaiyang.top.conf
UNIT=/etc/systemd/system/cfzn-ide.service
ENVFILE=/etc/cfzn-ide.env
INTEGRATION_ENVFILE=/etc/cfzn-ide-integration.env
release=${1:?release ID required}
checksum=${2:?SHA-256 required}
reuse_staged=0
if [[ ${3:-} == --reuse-staged ]]; then reuse_staged=1; elif [[ -n ${3:-} ]]; then exit 2; fi
[[ $release =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8,40}$ ]] || exit 2
[[ $checksum =~ ^[a-f0-9]{64}$ ]] || exit 2
[[ $EUID == 0 ]] || { echo 'Run this script as root.' >&2; exit 1; }
UPLOAD="/tmp/cfzn-ide-$release"
TARGET="$BASE/releases/$release"
# The existing Harness service keeps its Node distribution outside the system PATH.
if ! command -v node >/dev/null || ! command -v npm >/dev/null ||
    ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<12))process.exit(1)'; then
    export PATH="/home/wwwroot/harness-ota/runtime/node-v24.14.0-linux-x64/bin:$PATH"
fi
for binary in nginx node npm systemctl ss curl tar sha256sum openssl getent flock runuser useradd timeout; do
    command -v "$binary" >/dev/null || { echo "Missing dependency: $binary" >&2; exit 1; }
done
exec 9>/run/lock/cfzn-ide-deploy.lock
flock -n 9 || { echo 'Another IDE deployment is running.' >&2; exit 1; }
NODE=$(readlink -f "$(command -v node)")
NODE_VERSION=$(node -p 'process.versions.node')
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<12))process.exit(1)' || {
    echo 'Install Node.js >=22.12 with npm before deployment.' >&2; exit 1;
}
systemctl is-active --quiet nginx || { echo 'Existing nginx.service is not active.' >&2; exit 1; }
nginx -t
nginx_dump=$(nginx -T 2>&1)
[[ $nginx_dump == *'include /etc/nginx/conf.d/'* ]] || {
    echo 'Nginx does not include /etc/nginx/conf.d; inspect its existing configuration first.' >&2; exit 1;
}
conflicts=$(printf '%s\n' "$nginx_dump" | awk -v wanted="$CONF" '
    /^# configuration file / {file=$4; sub(/:$/, "", file)}
    /^[[:space:]]*server_name[[:space:]]/ && /ide\.xiaodaiyang\.top/ && file != wanted {print file}')
[[ -z $conflicts ]] || { echo "Domain is already configured elsewhere: $conflicts" >&2; exit 1; }
for owned in "$CONF" "$UNIT" "$ENVFILE"; do
    if [[ -e $owned ]] && ! grep -q '^# Managed by CFZN-IDE deployment$' "$owned"; then
        echo "Refusing to replace an unmanaged file: $owned" >&2; exit 1
    fi
done
[[ ! -e $BASE || -f $BASE/.cfzn-ide-managed ]] || {
    echo "Refusing to adopt an existing directory: $BASE" >&2; exit 1;
}
getent ahostsv4 "$DOMAIN" | awk '{print $1}' | grep -Fxq "$SERVER_IP" || {
    echo "Set DNS A record $DOMAIN -> $SERVER_IP first (remove any incorrect AAAA record)." >&2; exit 1;
}
printf '%s  %s\n' "$checksum" "$UPLOAD/cfzn-ide.tar.gz" | sha256sum -c -
if [[ -e $TARGET || -L $TARGET ]]; then
    [[ $reuse_staged == 1 && -d $TARGET && ! -L $TARGET ]] || {
        echo 'This release has already been staged; use explicit failed-deployment recovery.' >&2; exit 1;
    }
    [[ $(readlink -f "$BASE/current" || true) != "$(readlink -f "$TARGET")" ]] || {
        echo 'Refusing to overwrite the active release.' >&2; exit 1;
    }
    node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).release!==process.argv[2])process.exit(1)' \
        "$TARGET/release.json" "$release" || { echo 'Staged release identity mismatch.' >&2; exit 1; }
fi
CERTDIR="/etc/nginx/ssl/$DOMAIN"
CERT=${TLS_CERT:-$CERTDIR/fullchain.pem}
KEY=${TLS_KEY:-$CERTDIR/privkey.pem}
ACME=${ACME_SH:-/root/.acme.sh/acme.sh}
need_cert=1
if [[ -s $CERT && -s $KEY ]] && openssl x509 -in "$CERT" -noout -checkhost "$DOMAIN" >/dev/null &&
    openssl x509 -in "$CERT" -noout -checkend 3600 >/dev/null; then
    need_cert=0
fi
[[ $need_cert == 0 || -f $ACME ]] || {
    echo 'A valid TLS certificate or the existing acme.sh installation is required.' >&2; exit 1;
}
install -d -m 755 "$BASE" "$BASE/releases" "$BASE/backups" "$BASE/runtime" "$TARGET" "$BASE/data"
touch "$BASE/.cfzn-ide-managed"
tar -xzf "$UPLOAD/cfzn-ide.tar.gz" -C "$TARGET"
[[ -s $TARGET/web/index.html && -s $TARGET/web/openblock.html && -s $TARGET/api/dist/main.js ]]
ide_auth=$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).ideAuth === true))' "$TARGET/release.json")
if [[ $ide_auth == true ]]; then
    [[ -s $TARGET/web/login.html && -s $TARGET/web/sso.html && -s $INTEGRATION_ENVFILE ]] || {
        echo 'Authenticated releases require login.html, sso.html and the server integration environment file.' >&2; exit 1;
    }
fi
fast_gui=$(validated_fast_gui "$TARGET/web")
(cd "$TARGET/api" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
# The IDE service does not need access to Harness's private runtime directories.
if [[ ! -x $BASE/runtime/node-$NODE_VERSION ]]; then
    install -m 755 "$NODE" "$BASE/runtime/node-$NODE_VERSION"
fi
NODE="$BASE/runtime/node-$NODE_VERSION"
id cfzn-ide >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin cfzn-ide
runuser -u cfzn-ide -- "$NODE" -e 'require("fs").accessSync(process.argv[1])' "$TARGET/api/dist/main.js" || {
    echo 'Node and release files must be accessible to the cfzn-ide service account.' >&2; exit 1;
}
chown cfzn-ide:cfzn-ide "$BASE/data"
backup="$BASE/backups/$release"
if [[ $reuse_staged == 1 ]]; then backup="$backup-retry-$(date -u +%Y%m%dT%H%M%SZ)-$$"; fi
install -d -m 700 "$backup"
for entry in "$CONF" "$UNIT" "$ENVFILE"; do
    [[ ! -e $entry ]] || cp -p "$entry" "$backup/$(basename "$entry")"
done
previous=$(readlink "$BASE/current" || true)
was_active=0
was_enabled=0
systemctl is-active --quiet cfzn-ide.service && was_active=1
systemctl is-enabled --quiet cfzn-ide.service 2>/dev/null && was_enabled=1
rollback() {
    trap - ERR
    set +e
    echo "Deployment failed; restoring previous IDE configuration from $backup" >&2
    for entry in "$CONF" "$UNIT" "$ENVFILE"; do
        if [[ -e $backup/$(basename "$entry") ]]; then
            cp -p "$backup/$(basename "$entry")" "$entry"
        else
            rm -f -- "$entry"
        fi
    done
    if [[ -n $previous ]]; then ln -sfnT "$previous" "$BASE/current"; else rm -f -- "$BASE/current"; fi
    if [[ $was_enabled == 0 ]]; then systemctl disable cfzn-ide.service; fi
    systemctl daemon-reload
    if [[ $was_active == 1 ]]; then systemctl restart cfzn-ide.service; else systemctl stop cfzn-ide.service; fi
    nginx -t && systemctl reload nginx
    echo 'Release files and project data have been retained for inspection.' >&2
    exit 1
}
trap rollback ERR
CHALLENGE=/var/lib/cfzn-ide-acme
install -d -m 755 "$CHALLENGE/.well-known/acme-challenge"
if [[ $need_cert == 1 ]]; then
    # First deployment only: HTTP serves ACME challenges until the cert is ready.
    cat > "$CONF" <<EOF
# Managed by CFZN-IDE deployment
server {
    listen 80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $CHALLENGE; }
    location / { return 503; }
}
EOF
    nginx -t
    systemctl reload nginx
    bash "$ACME" --issue --server letsencrypt -d "$DOMAIN" --keylength ec-256 --webroot "$CHALLENGE"
    install -d -m 700 "$CERTDIR"
    bash "$ACME" --install-cert -d "$DOMAIN" --ecc --key-file "$KEY" --fullchain-file "$CERT" \
        --reloadcmd 'nginx -t && systemctl reload nginx'
fi
# Select immediately before starting the API, after the potentially slow ACME step.
# Both live listeners and ports referenced by other Nginx sites remain reserved.
PORT=$(select_api_port)
printf 'Selected unused API port: 127.0.0.1:%s\n' "$PORT"
cat > "$ENVFILE" <<EOF
# Managed by CFZN-IDE deployment
NODE_ENV=production
PORT=$PORT
PROJECT_DATA_DIR=$BASE/data
CUSTOM_MODULE_ORIGINS=https://$DOMAIN
$(if [[ $ide_auth == true ]]; then printf 'IDE_AUTH_MODE=maker\n'; fi)
EOF
chmod 640 "$ENVFILE"
cat > "$UNIT" <<EOF
# Managed by CFZN-IDE deployment
[Unit]
Description=CFZN IDE project API
After=network.target
[Service]
Type=simple
User=cfzn-ide
Group=cfzn-ide
WorkingDirectory=$BASE/current/api
EnvironmentFile=$ENVFILE
$(if [[ $ide_auth == true ]]; then printf 'EnvironmentFile=%s\n' "$INTEGRATION_ENVFILE"; fi)
ExecStart=$NODE $BASE/current/api/dist/main.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$BASE/data
UMask=0077
[Install]
WantedBy=multi-user.target
EOF
ln -sfnT "$TARGET" "$BASE/current"
systemctl daemon-reload
systemctl enable cfzn-ide.service
systemctl restart cfzn-ide.service
healthy=0
for attempt in $(seq 1 30); do
    main_pid=$(systemctl show -p MainPID --value cfzn-ide.service)
    port_owner=$(ss -H -lntp "sport = :$PORT")
    if [[ $main_pid =~ ^[1-9][0-9]*$ && $port_owner == *"pid=$main_pid,"* ]] &&
        curl -q --noproxy '*' --connect-timeout 2 --max-time 5 -fsS \
            "http://127.0.0.1:$PORT/api/v1/health" > "$backup/health.json" 2> "$backup/api-error.log" &&
        node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).status!=="ok")process.exit(1)' "$backup/health.json"; then
        healthy=1
        break
    fi
    sleep 1
done
if [[ $healthy != 1 ]]; then
    journalctl -u cfzn-ide.service -n 40 --no-pager >&2 || true
    ss -H -lntp "sport = :$PORT" >&2 || true
fi
[[ $healthy == 1 ]]
cat > "$CONF" <<EOF
# Managed by CFZN-IDE deployment
$(if [[ -n $fast_gui ]]; then gui_representation_maps; fi)
server {
    listen 80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $CHALLENGE; }
$(if [[ $ide_auth == true ]]; then printf '    location ~ ^/(login|sso)(?:[.]html|/)?$ { access_log off; return 301 https://%s$request_uri; }\n' "$DOMAIN"; fi)
    location / { return 301 https://$DOMAIN\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate $CERT;
    ssl_certificate_key $KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
    root $BASE/current/web;
    index index.html;
    client_max_body_size 21m;
    # Limit transfer changes to this IDE site. Stable URLs keep validator-based caching.
    gzip on;
    $(gzip_static_setting on)
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types application/javascript text/javascript text/css application/json image/svg+xml application/wasm;
    etag on;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "serial=(self), usb=(self)" always;
$(if [[ -n $fast_gui ]]; then gui_representation_locations "$fast_gui"; fi)
$(if [[ $ide_auth == true ]]; then ide_auth_locations "$PORT"; fi)
    location /api/ {
        gzip off;
        $(gzip_static_setting off)
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
    location ~ \\.mjs$ { types { application/javascript mjs; } try_files \$uri =404; expires -1; }
    location ~ \\.html$ { try_files \$uri =404; expires -1; }
    location /assets/ { try_files \$uri =404; expires 1y; }
    location / { try_files \$uri \$uri/ =404; expires -1; }
    location ~ /\\. { deny all; }
}
EOF
nginx -t
systemctl reload nginx
verify_https "$DOMAIN" "$CERT" "$backup" "$ide_auth"
trap - ERR
printf 'DEPLOYED https://%s\nAPI: 127.0.0.1:%s\nRelease: %s\nBackup: %s\n' "$DOMAIN" "$PORT" "$TARGET" "$backup"
