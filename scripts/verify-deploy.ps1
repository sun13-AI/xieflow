# XieFlow scripts/verify-deploy.ps1 - deploy self-check (ASCII only, PS 5.1 compatible).
# Starts a THROWAWAY api on a scratch db, waits for health 200, probes the key
# deployment routes from the shared contract, then kills the api and cleans up.
# Never leaves a resident process (headless: -WindowStyle Hidden on Windows).
# Usage:
#   pwsh scripts/verify-deploy.ps1           # default port 8790
#   pwsh scripts/verify-deploy.ps1 -Port 8799
param(
  [int]$Port = 8790
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ScratchDir = Join-Path $Root "scripts\.tmp-verify-$Port"
$ScratchDb = Join-Path $ScratchDir "verify.db"
$ApiLog = Join-Path $ScratchDir "api.log"
$Base = "http://127.0.0.1:$Port"

if (Test-Path $ScratchDir) { Remove-Item $ScratchDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ScratchDir | Out-Null

$env:XIEFLOW_API_PORT = "$Port"
$env:XIEFLOW_DB_PATH = $ScratchDb
$env:XIEFLOW_MODE = "local"

$onWindows = $null -ne $env:ComSpec
if ($onWindows) {
  $proc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "pnpm exec tsx apps/api/src/server.ts < NUL > `"$ApiLog`" 2>&1" `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru
} else {
  $proc = Start-Process -FilePath "pnpm" `
    -ArgumentList "exec", "tsx", "apps/api/src/server.ts" `
    -WorkingDirectory $Root -PassThru `
    -RedirectStandardOutput $ApiLog -RedirectStandardError "$ApiLog.err"
}

$passed = 0
$failed = 0

function Check-Status([string]$Path, [int]$Want, [string]$Label) {
  try {
    $res = Invoke-WebRequest -Uri "$Base$Path" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    $code = [int]$res.StatusCode
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  }
  if ($code -eq $Want) {
    $script:passed++
    Write-Output "  ok  $Label ($Path -> $code)"
  } else {
    $script:failed++
    Write-Output "  FAIL $Label ($Path -> $code, want $Want)"
  }
}

try {
  # wait for health 200 (up to ~20s)
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "$Base/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ([int]$r.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw "health /api/health never returned 200" }

  Write-Output "Deploy r21 self-check on $Base"
  Check-Status "/api/health" 200 "health probe"
  Check-Status "/api/auth/mode" 200 "mode probe"
  Check-Status "/api/settings" 200 "settings probe"
  Check-Status "/api/todos" 200 "business route (local mode)"
  Check-Status "/api/auth/me" 401 "always-protected probe (401 expected)"

  Write-Output "verify-deploy: $passed ok / $failed failed"
  if ($failed -gt 0) { exit 1 }
  Write-Output "VERIFY-DEPLOY: ALL GREEN"
} catch {
  Write-Output "verify-deploy crashed: $($_.Exception.Message)"
  if (Test-Path $ApiLog) { Get-Content $ApiLog | Select-Object -Last 20 | Write-Output }
  exit 1
} finally {
  # kill the api process tree and any listener left on the port
  if ($onWindows) {
    if ($proc -and -not $proc.HasExited) { & taskkill /PID $proc.Id /T /F 2>$null | Out-Null }
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      if ($c.OwningProcess -and $c.OwningProcess -ne $PID) {
        & taskkill /PID $c.OwningProcess /T /F 2>$null | Out-Null
      }
    }
  } else {
    & pkill -f "apps/api/src/server.ts" 2>$null | Out-Null
    if ($proc -and -not $proc.HasExited) { try { $proc.Kill() } catch {} }
  }
  Remove-Item Env:XIEFLOW_API_PORT -ErrorAction SilentlyContinue
  Remove-Item Env:XIEFLOW_DB_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:XIEFLOW_MODE -ErrorAction SilentlyContinue
  if (Test-Path $ScratchDir) { Remove-Item $ScratchDir -Recurse -Force -ErrorAction SilentlyContinue }
}
