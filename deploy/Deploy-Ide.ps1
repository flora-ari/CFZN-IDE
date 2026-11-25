[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9.-]+$')][string]$Server = '8.138.226.239',
    [ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$SshUser = 'root',
    [ValidateRange(1, 65535)][int]$SshPort = 22,
    [ValidatePattern('^[a-zA-Z0-9.-]+$')][string]$ProxyHost = '127.0.0.1',
    [ValidateRange(0, 65535)][int]$ProxyPort = 0,
    [switch]$PackageOnly,
    [switch]$Resume,
    [switch]$RetryFailed,
    [string]$ManifestPath
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Push-Location $repo
try {
    if ($Resume -and -not $ManifestPath) { throw 'Resume requires -ManifestPath for the already uploaded release.' }
    if ($RetryFailed -and (-not $Resume -or -not $ManifestPath)) { throw 'RetryFailed requires -Resume and -ManifestPath for a recorded failed deployment.' }
    $env:npm_config_cache = Join-Path $repo '.runtime\npm-cache'
    if (-not $ManifestPath) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
        $result = & node.exe (Join-Path $PSScriptRoot 'package.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'Packaging failed.' }
        $bundle = ($result | Select-Object -Last 1) | ConvertFrom-Json
    } else {
        $bundle = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    }
    if ($bundle.release -notmatch '^\d{8}T\d{6}Z-[a-f0-9]{8,40}$') { throw 'Invalid release ID.' }
    if ($bundle.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid bundle checksum.' }
    $actual = (Get-FileHash -LiteralPath $bundle.archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $bundle.sha256) { throw 'Bundle checksum mismatch.' }
    Write-Host "Prepared $($bundle.archive)"
    if ($PackageOnly) { return }

    $target = "${SshUser}@${Server}"
    $remote = "/tmp/cfzn-ide-$($bundle.release)"
    $sshOptions = @('-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3')
    $httpOptions = @{}
    if ($ProxyPort -gt 0) {
        $nodePath = (& node.exe -p 'process.execPath' | Select-Object -Last 1)
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $nodePath)) { throw 'Cannot locate Node.js for the SSH proxy.' }
        $proxyHelper = Join-Path $PSScriptRoot 'ssh-proxy.mjs'
        if (-not (Test-Path -LiteralPath $proxyHelper)) { throw 'SSH proxy helper is missing.' }
        if ($nodePath -match '["%\r\n]' -or $proxyHelper -match '["%\r\n]') { throw 'SSH proxy paths cannot contain quotes, percent signs or newlines.' }
        $proxyCommand = '"{0}" "{1}" --proxy-host {2} --proxy-port {3} --target-host %h --target-port %p' -f $nodePath, $proxyHelper, $ProxyHost, $ProxyPort
        $sshOptions += @('-o', "ProxyCommand=$proxyCommand")
        $httpOptions.Proxy = "http://${ProxyHost}:$ProxyPort"
        Write-Host "Using HTTP CONNECT proxy ${ProxyHost}:$ProxyPort for SSH/SCP and public HTTPS verification."
    }
    # Run in the user's terminal so existing SSH keys/agent/password prompts work normally.
    if (-not $Resume) {
        & ssh.exe @sshOptions -T -p $SshPort $target "umask 077 && mkdir -p '$remote'"
        if ($LASTEXITCODE -ne 0) { throw 'SSH connection failed before upload.' }
        & scp.exe @sshOptions -P $SshPort $bundle.archive "${target}:${remote}/"
        if ($LASTEXITCODE -ne 0) { throw 'Bundle upload failed. Installation was not started by this invocation.' }
    } else {
        Write-Host 'Resuming the uploaded release; the compiled website bundle will not be uploaded again.'
    }
    # Upload under temporary names, then replace atomically so a running worker keeps its open file.
    $transport = Join-Path (Split-Path $bundle.archive -Parent) 'transport'
    New-Item -ItemType Directory -Path $transport -Force | Out-Null
    $installerUpload = Join-Path $transport 'install-server.sh.next'
    $runnerUpload = Join-Path $transport 'run-server.sh.next'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install-server.sh') -Destination $installerUpload -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-server.sh') -Destination $runnerUpload -Force
    & scp.exe @sshOptions -P $SshPort $installerUpload $runnerUpload "${target}:${remote}/"
    if ($LASTEXITCODE -ne 0) { throw 'Deployment script upload failed. Installation state is unknown; resume after SSH connectivity recovers.' }
    $privilege = if ($SshUser -eq 'root') { '' } else { 'sudo -n ' }
    $activateScripts = "mv -f '$remote/install-server.sh.next' '$remote/install-server.sh' && mv -f '$remote/run-server.sh.next' '$remote/run-server.sh'"
    $retryOption = if ($RetryFailed) { '--retry-failed ' } else { '' }
    & ssh.exe @sshOptions -T -p $SshPort $target "$activateScripts && ${privilege}bash '$remote/run-server.sh' ${retryOption}'$($bundle.release)' '$($bundle.sha256)'"
    if ($LASTEXITCODE -ne 0) {
        throw "SSH monitoring ended or server installation failed. The server job may still be running. Log: $remote/install.log ; result: $remote/install.exit . Run again with -Resume and the same -ManifestPath to check this release."
    }

    foreach ($path in @('/', '/openblock.html', '/api/v1/health', '/api/v1/custom-modules')) {
        $response = Invoke-WebRequest -Uri "https://ide.xiaodaiyang.top$path" -UseBasicParsing -TimeoutSec 45 @httpOptions
        if ($response.StatusCode -ne 200) { throw "Public verification failed: $path" }
        if ($path -eq '/api/v1/health' -and ($response.Content | ConvertFrom-Json).status -ne 'ok') {
            throw 'The public hostname is not serving the expected IDE API.'
        }
        Write-Host "PASS https://ide.xiaodaiyang.top$path"
    }
    Write-Host 'Deployment verified: https://ide.xiaodaiyang.top'
} finally {
    Pop-Location
}
