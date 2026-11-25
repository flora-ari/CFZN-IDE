# Local orchestration checks: ssh/scp/HTTP are mocked and never contacted.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$ManifestPath)
$ErrorActionPreference = 'Stop'
$state = @{
    TransportCalls = [System.Collections.Generic.List[object]]::new()
    HttpCalls = [System.Collections.Generic.List[string]]::new()
    SshExit = 0
}
# Capture this test's state: the deployed script has a different $script scope.
Set-Item Function:ssh.exe -Value ({
    $state.TransportCalls.Add([pscustomobject]@{ Tool = 'ssh'; Arguments = @($args) })
    $global:LASTEXITCODE = $state.SshExit
}.GetNewClosure())
Set-Item Function:scp.exe -Value ({
    $state.TransportCalls.Add([pscustomobject]@{ Tool = 'scp'; Arguments = @($args) })
    $global:LASTEXITCODE = 0
}.GetNewClosure())
Set-Item Function:Invoke-WebRequest -Value ({
    param($Uri, [switch]$UseBasicParsing, $TimeoutSec, $Proxy)
    $state.HttpCalls.Add("$Uri|$Proxy")
    [pscustomobject]@{ StatusCode = 200; Content = '{"status":"ok"}' }
}.GetNewClosure())
function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
$deployment = Join-Path $PSScriptRoot 'Deploy-Ide.ps1'
& $deployment -Resume -ManifestPath $ManifestPath
Assert-True ($state.TransportCalls.Count -eq 2) 'Resume must use one small script upload and one SSH monitor.'
$upload = $state.TransportCalls | Where-Object Tool -eq scp
Assert-True (-not (@($upload.Arguments | Where-Object { $_ -like '*.tar.gz' }).Count)) 'Resume must not upload the compiled bundle again.'
Assert-True (@($upload.Arguments | Where-Object { $_ -like '*.sh.next' }).Count -eq 2) 'Both scripts must upload under temporary names.'
$monitor = $state.TransportCalls | Where-Object Tool -eq ssh
Assert-True ($monitor.Arguments -ccontains '-T') 'SSH must not request a PTY.'
Assert-True ($monitor.Arguments -contains 'ServerAliveInterval=15') 'SSH must enable keepalive.'
Assert-True ($monitor.Arguments[-1] -like '*mv -f*run-server.sh*') 'SSH must activate scripts and use the detached runner.'
Assert-True ($state.HttpCalls.Count -eq 4) 'Public verification must follow a successful server job.'
Write-Output 'PASS resume reuses the uploaded archive and verifies the public site.'
$state.TransportCalls.Clear()
$state.HttpCalls.Clear()
& $deployment -Resume -RetryFailed -ManifestPath $ManifestPath
$recoveryMonitor = $state.TransportCalls | Where-Object Tool -eq ssh
Assert-True ($recoveryMonitor.Arguments[-1] -like '*run-server.sh*--retry-failed*') 'Explicit failed recovery must reach the server runner.'
Assert-True ($state.TransportCalls.Count -eq 2) 'Recovery must reuse the uploaded archive.'
Assert-True ($state.HttpCalls.Count -eq 4) 'Recovery must retain public verification.'
Write-Output 'PASS explicit failed recovery reuses the uploaded archive and keeps public verification.'
$state.TransportCalls.Clear()
$caught = $null
try { & $deployment -RetryFailed -ManifestPath $ManifestPath } catch { $caught = $_ }
Assert-True ($null -ne $caught) 'RetryFailed must require Resume.'
Assert-True ($state.TransportCalls.Count -eq 0) 'Invalid recovery options must not contact the server.'
Write-Output 'PASS recovery requires an explicit resume request.'
$state.TransportCalls.Clear()
$state.HttpCalls.Clear()
& $deployment -ManifestPath $ManifestPath -ProxyHost 127.0.0.1 -ProxyPort 7897
Assert-True ($state.TransportCalls.Count -eq 4) 'Proxy deployment must create the remote directory, upload archive/scripts and monitor installation.'
foreach ($call in $state.TransportCalls) {
    $proxyOptions = @($call.Arguments | Where-Object { $_ -like 'ProxyCommand=*' })
    Assert-True ($proxyOptions.Count -eq 1) 'Every SSH and SCP call must use the explicit proxy.'
    Assert-True ($proxyOptions[0] -like '*ssh-proxy.mjs*--proxy-host 127.0.0.1 --proxy-port 7897 --target-host %h --target-port %p') 'ProxyCommand must pass the SSH target and configured proxy.'
}
Assert-True ($state.HttpCalls.Count -eq 4) 'Proxy deployment must verify all public endpoints.'
foreach ($call in $state.HttpCalls) {
    Assert-True ($call.EndsWith('|http://127.0.0.1:7897')) 'Public verification must use the same proxy.'
}
Write-Output 'PASS all SSH/SCP and public HTTPS checks use the configured proxy.'
$state.TransportCalls.Clear()
$state.HttpCalls.Clear()
$state.SshExit = 255
$caught = $null
try { & $deployment -Resume -ManifestPath $ManifestPath } catch { $caught = $_ }
Assert-True ($null -ne $caught) 'SSH disconnect must surface as an error.'
Assert-True ($caught.Exception.Message -like '*may still be running*install.log*install.exit*') 'Disconnect must preserve uncertainty and include server log paths.'
Assert-True ($state.HttpCalls.Count -eq 0) 'Do not claim public verification after disconnected monitoring.'
Write-Output 'PASS disconnected SSH reports unknown installation state without claiming rollback.'
