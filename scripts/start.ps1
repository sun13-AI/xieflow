# XieFlow scripts/start.ps1 - one-click local launcher (ASCII only, PS 5.1 compatible)
# Usage:
#   powershell -File scripts\start.ps1 start   # start api + web dev servers, then open browser
#   powershell -File scripts\start.ps1 stop    # stop servers
#   powershell -File scripts\start.ps1 status  # show port status
# Double-click entry: start.cmd at repo root.
# Note: does NOT trust shot.ps1 up's exit code (known race: it can throw while both
# servers are actually fine). We poll the ports ourselves and only open the browser
# when BOTH really serve HTTP 200.
param([string]$Action = "start")

$ErrorActionPreference = "Stop"
$Shot = Join-Path $PSScriptRoot "shot.ps1"
$WebUrl = "http://127.0.0.1:5173"

function Test-HttpOk([string]$url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch { return $false }
}

function Wait-Servers {
  # give servers up to 60s to actually serve HTTP (poll, not sleep-and-pray)
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    if ((Test-HttpOk $WebUrl) -and (Test-HttpOk "http://127.0.0.1:8787/api/health")) { return $true }
    Start-Sleep -Milliseconds 800
  }
  return $false
}

switch ($Action.ToLower()) {
  "start" {
    & $Shot up
    if (Wait-Servers) {
      Write-Output ""
      Write-Output "XieFlow is running:"
      Write-Output "  web  $WebUrl   (log: scripts/.shot-web.log)"
      Write-Output "  api  http://127.0.0.1:8787   (log: scripts/.shot-api.log)"
      Write-Output "  stop with: powershell -File scripts\start.ps1 stop"
      Start-Process $WebUrl
    } else {
      Write-Output "servers did not become ready within 60s."
      Write-Output "check scripts/.shot-api.log and scripts/.shot-web.log, then retry:"
      Write-Output "  powershell -File scripts\start.ps1 start"
      exit 1
    }
  }
  "stop"   { & $Shot down }
  "status" { & $Shot status }
  default  { throw "unknown action: $Action (use start | stop | status)" }
}
