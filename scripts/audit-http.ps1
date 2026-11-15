# XieFlow scripts/audit-http.ps1 - HTTP audit runner (ASCII only, PS 5.1 compatible)
# Cross-platform: starts a THROWAWAY api on a scratch db (scripts/.tmp-audit/), runs
# scripts/audit-http.ts against it, then kills the api process tree. Never leaves a
# resident process behind (r1 lesson). Works on Windows / linux / macos pwsh 7.
# Usage:
#   pwsh scripts/audit-http.ps1            # default port 8788
#   pwsh scripts/audit-http.ps1 -Port 8799 # custom port
param(
  [int]$Port = 8788
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ScratchDir = Join-Path $Root "scripts\.tmp-audit"
$ScratchDb = Join-Path $ScratchDir "audit.db"
$ApiLog = Join-Path $ScratchDir "api.log"

# fresh scratch dir every run (our own temp fixture, not user data)
if (Test-Path $ScratchDir) { Remove-Item $ScratchDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ScratchDir | Out-Null

# scratch db must not exist so the api migrates it from v0 (fresh schema each run)
$env:XIEFLOW_API_PORT = "$Port"
$env:XIEFLOW_DB_PATH = $ScratchDb

# start api: production tsx (no watch -> no stdin watcher issue, r1 P1 lesson).
# Windows needs cmd.exe to resolve pnpm.cmd; "< NUL" gives stdin so the process tree
# survives detached start. Unix pwsh resolves pnpm directly.
# NB: do NOT name this $isWindows - it is a read-only automatic variable in pwsh 7
# (CI failure lesson, v0.0.3).
$onWindows = $null -ne $env:ComSpec
if ($onWindows) {
  $proc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "pnpm exec tsx apps/api/src/server.ts < NUL > `"$ApiLog`" 2>&1" `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru
} else {
  $proc = Start-Process -FilePath "pnpm" `
    -ArgumentList "exec", "tsx", "apps/api/src/server.ts" `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $ApiLog -RedirectStandardError "$ApiLog.err"
}

try {
  Push-Location $Root
  $env:XIEFLOW_API_PORT = "$Port"
  & pnpm exec tsx scripts/audit-http.ts
  $auditExit = $LASTEXITCODE
  Pop-Location
  if ($auditExit -ne 0) {
    Write-Output "audit failed, api log:"
    if (Test-Path $ApiLog) { Get-Content $ApiLog | Select-Object -Last 20 | Write-Output }
    exit 1
  }
  Write-Output "AUDIT-HTTP WRAPPER: ALL GREEN"
} finally {
  # kill the whole api process tree (PS 5.1 has no Kill(bool) overload -> taskkill /T)
  if ($onWindows) {
    if ($proc -and -not $proc.HasExited) {
      & taskkill /PID $proc.Id /T /F 2>$null | Out-Null
    }
    # belt and braces: kill any listener left on the audit port
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      if ($c.OwningProcess -and $c.OwningProcess -ne $PID) {
        & taskkill /PID $c.OwningProcess /T /F 2>$null | Out-Null
      }
    }
  } else {
    # unix: pattern kill catches pnpm/tsx/node chain (all carry the server path in cmdline)
    & pkill -f "apps/api/src/server.ts" 2>$null | Out-Null
    if ($proc -and -not $proc.HasExited) { try { $proc.Kill() } catch {} }
  }
  Remove-Item Env:XIEFLOW_API_PORT -ErrorAction SilentlyContinue
  Remove-Item Env:XIEFLOW_DB_PATH -ErrorAction SilentlyContinue
}
