import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = process.platform === 'win32'
  ? execFileSync('where.exe', ['git.exe'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]
  : null;
const bash = process.platform === 'win32' ? join(dirname(dirname(git)), 'bin', 'bash.exe') : 'bash';
const temporary = resolve(root, 'build/deploy-tests');
mkdirSync(temporary, { recursive: true });

function run(script, extraEnv = {}) {
  return spawnSync(bash, ['--noprofile', '--norc', '-c', script], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, CFZN_TEST_NODE: process.execPath, ...extraEnv },
  });
}

test('chooses a port outside IPv4/IPv6 listeners and other Nginx upstreams', () => {
  const result = run(`
source deploy/install-server.sh
ss() { printf '%s\\n' 'LISTEN 0 128 [::]:9111 [::]:*'; }
nginx() { printf '%s\\n' 'proxy_pass http://127.0.0.1:9112;' 'server 127.0.0.1:9113;'; }
select_api_port
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '9114');
});

test('refuses to select a port if the entire range is occupied', () => {
  const result = run(`
source deploy/install-server.sh
ss() { for port in $(seq 9111 9199); do printf 'LISTEN 0 128 127.0.0.1:%s 0.0.0.0:*\\n' "$port"; done; }
nginx() { return 0; }
select_api_port
`);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /No unused API port/);
});

test('fails closed when Nginx configuration cannot be inspected', () => {
  const result = run(`
source deploy/install-server.sh
ss() { return 0; }
nginx() { return 1; }
select_api_port
`);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
});

const mockHttps = `
source deploy/install-server.sh
export CFZN_TLS_ATTEMPTS=3 CFZN_TLS_RETRY_DELAY=0
node() { "$CFZN_TEST_NODE" "$@"; }
sleep() { return 0; }
openssl() { printf '%s\\n' 'mock certificate diagnostics'; }
timeout() { shift; "$@"; }
curl() {
    local output= url= count=0 original=" $* "
    printf '%s\\n' "$original" >> "$CFZN_TEST_DIR/curl.calls"
    [[ $original == *' --noproxy * '* && $original == *' --http1.1 '* &&
        $original == *' --resolve ide.xiaodaiyang.top:443:127.0.0.1 '* &&
        $original == *' --max-time 8 '* ]] || return 96
    [[ $original != *' --insecure '* && $original != *' -k '* ]] || return 97
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -o) output=$2; shift 2 ;;
            https://*) url=$1; shift ;;
            *) shift ;;
        esac
    done
    if [[ -f $CFZN_TEST_DIR/count ]]; then read -r count < "$CFZN_TEST_DIR/count"; fi
    count=$((count + 1))
    printf '%s\\n' "$count" > "$CFZN_TEST_DIR/count"
    if [[ $CFZN_TEST_CASE == expired || ( $CFZN_TEST_CASE == reload && $count -le 2 ) ]]; then
        echo 'curl: (60) SSL certificate problem: certificate has expired' >&2
        return 60
    fi
    if [[ $url == */api/v1/health ]]; then
        if [[ $CFZN_TEST_CASE == wrong-api ]]; then
            printf '%s' '{"status":"unhealthy"}' > "$output"
        else
            printf '%s' '{"status":"ok"}' > "$output"
        fi
    else
        printf '%s' 'mock page' > "$output"
    fi
    if [[ $CFZN_TEST_CASE == redirect ]]; then printf '301'; else printf '200'; fi
}
verify_https ide.xiaodaiyang.top expected-cert.pem "$CFZN_TEST_DIR"
`;

test('gzip_static is enabled only on builds advertising its module', () => {
  const supported = run(`source deploy/install-server.sh
nginx() { echo 'configure arguments: --with-http_gzip_static_module' >&2; }
gzip_static_setting on
gzip_static_setting off`);
  assert.equal(supported.status, 0, supported.stderr);
  assert.equal(supported.stdout.trim(), 'gzip_static on;\ngzip_static off;');
  const unsupported = run(`source deploy/install-server.sh
nginx() { echo 'configure arguments: --with-http_ssl_module' >&2; }
gzip_static_setting on`);
  assert.equal(unsupported.status, 0, unsupported.stderr);
  assert.equal(unsupported.stdout, '');
});

function checkHttps(scenario) {
  const directory = mkdtempSync(join(temporary, `${scenario}-`));
  const result = run(mockHttps, { CFZN_TEST_DIR: directory.replaceAll('\\', '/'), CFZN_TEST_CASE: scenario });
  return { ...result, calls: readFileSync(join(directory, 'curl.calls'), 'utf8').trim().split(/\r?\n/) };
}

test('waits through expired certificates from old workers and verifies every endpoint', () => {
  const result = checkHttps('reload');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 6);
  assert.match(result.stdout, /PASS direct HTTPS/);
  for (const endpoint of ['/openblock.html', '/api/v1/health', '/api/v1/custom-modules']) {
    assert.ok(result.calls.some(call => call.includes(endpoint)), endpoint);
  }
});

test('persistent expired certificates fail with diagnostics and a bounded retry count', () => {
  const result = checkHttps('expired');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.calls.length, 3);
  assert.match(result.stderr, /Expected on-disk certificate/);
  assert.match(result.stderr, /actually served/);
  assert.doesNotMatch(result.stdout, /PASS/);
});

test('rejects a different or unhealthy API even when TLS succeeds', () => {
  const result = checkHttps('wrong-api');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.calls.length, 9);
  assert.doesNotMatch(result.stdout, /PASS/);
});

test('redirects do not count as a successfully deployed page', () => {
  const result = checkHttps('redirect');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.calls.length, 3);
  assert.match(result.stderr, /Unexpected HTTP 301/);
});
