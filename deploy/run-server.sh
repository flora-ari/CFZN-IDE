#!/usr/bin/env bash
# A transient system service keeps deployment alive when the SSH client disconnects.
set -Eeuo pipefail
umask 077
worker=0
if [[ ${1:-} == --worker ]]; then worker=1; shift; fi
retry_failed=0
if [[ ${1:-} == --retry-failed ]]; then retry_failed=1; shift; fi
release=${1:?release ID required}
checksum=${2:?SHA-256 required}
[[ $release =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8,40}$ ]] || exit 2
[[ $checksum =~ ^[a-f0-9]{64}$ ]] || exit 2
[[ $EUID == 0 ]] || { echo 'Run this script as root.' >&2; exit 1; }
UPLOAD="/tmp/cfzn-ide-$release"
LOG="$UPLOAD/install.log"
RESULT="$UPLOAD/install.exit"
UNIT="cfzn-ide-deploy-$release.service"
[[ -s $UPLOAD/cfzn-ide.tar.gz && -s $UPLOAD/install-server.sh ]] || {
    echo "The uploaded bundle or installer is missing from $UPLOAD" >&2; exit 1;
}
if [[ $worker == 1 ]]; then
    # Always record the real installer result, independently of the SSH monitor.
    set +e
    installer_args=("$release" "$checksum")
    if [[ $retry_failed == 1 ]]; then installer_args+=(--reuse-staged); fi
    bash "$UPLOAD/install-server.sh" "${installer_args[@]}" > "$LOG" 2>&1
    result=$?
    printf '%s\n' "$result" > "$RESULT.tmp"
    mv -f "$RESULT.tmp" "$RESULT"
    exit "$result"
fi
for binary in systemd-run systemctl flock tail; do
    command -v "$binary" >/dev/null || { echo "Missing dependency: $binary" >&2; exit 1; }
done
exec 8>"$UPLOAD/launch.lock"
flock -x 8
if [[ $retry_failed == 1 ]] && ! systemctl is-active --quiet "$UNIT"; then
    [[ -f $RESULT ]] || { echo 'Recovery requires a recorded failed installation result.' >&2; exit 1; }
    previous_result=$(cat "$RESULT")
    [[ $previous_result =~ ^[0-9]+$ && $previous_result -gt 0 && $previous_result -le 255 ]] || {
        echo 'Refusing to retry an installation without a nonzero failure result.' >&2; exit 1;
    }
    # Keep both the original error log and exit code for later investigation.
    attempt=$(date -u +%Y%m%dT%H%M%SZ)-$$
    mv -- "$RESULT" "$UPLOAD/install.failed-$attempt.exit"
    if [[ -f $LOG ]]; then mv -- "$LOG" "$UPLOAD/install.failed-$attempt.log"; fi
fi
if [[ ! -f $RESULT ]] && ! systemctl is-active --quiet "$UNIT"; then
    # Do not replace an existing live unit; systemd also rejects duplicate unit names.
    touch "$LOG"
    worker_args=(--worker)
    if [[ $retry_failed == 1 ]]; then worker_args+=(--retry-failed); fi
    systemd-run --collect --unit="$UNIT" /bin/bash "$UPLOAD/run-server.sh" "${worker_args[@]}" "$release" "$checksum"
fi
flock -u 8
echo "Deployment directory: /home/wwwroot/cfzn-ide"
echo "Nginx host: ide.xiaodaiyang.top"
echo "Installation log: $LOG"
tail -n +1 -f "$LOG" &
follower=$!
trap 'kill "$follower" 2>/dev/null || true' EXIT
missing=0
while [[ ! -f $RESULT ]]; do
    if ! systemctl is-active --quiet "$UNIT"; then
        missing=$((missing + 1))
        if [[ $missing -ge 5 ]]; then
            echo "The deployment job stopped without recording a result. Check: journalctl -u $UNIT --no-pager" >&2
            exit 1
        fi
    else
        missing=0
    fi
    sleep 2
done
kill "$follower" 2>/dev/null || true
wait "$follower" 2>/dev/null || true
# Include the final lines even if the tail process had not flushed them yet.
tail -n 12 "$LOG"
result=$(cat "$RESULT")
[[ $result =~ ^[0-9]+$ && $result -le 255 ]] || { echo 'Invalid installation result.' >&2; exit 1; }
echo "Server installation exit code: $result"
exit "$result"
