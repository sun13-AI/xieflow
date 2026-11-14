# XieFlow scripts/shot.ps1 - screenshot helper (ASCII only for PS 5.1 compatibility)
# Usage:
#   powershell -File scripts\shot.ps1 up      # start api + web dev servers
#   powershell -File scripts\shot.ps1 shots   # capture 5 states to docs/ui/r1/
#   powershell -File scripts\shot.ps1 down    # stop servers
#   powershell -File scripts\shot.ps1 status  # show port status
#   powershell -File scripts\shot.ps1 all     # up + shots + down
param(
  [Parameter(Position = 0)]
  [ValidateSet("up", "shots", "down", "status", "all")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$UiDir = Join-Path $Root "docs\ui\r1"
$ApiPort = 8787
$WebPort = 5173

function Test-Port([int]$p) {
  $c = Test-NetConnection -ComputerName 127.0.0.1 -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue
  return $c
}

function Start-Servers {
  if ((Test-Port $ApiPort) -and (Test-Port $WebPort)) {
    Write-Output "servers already up"
    return
  }
  if (-not (Test-Port $ApiPort)) {
    # P1 (r1 verify): tsx watch exits in a detached process group without a console;
    # "< NUL" gives it a stdin handle so the watcher survives.
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm dev:api < NUL > scripts\.shot-api.log 2>&1" -WorkingDirectory $Root -WindowStyle Hidden
    Start-Sleep -Seconds 3
  }
  if (-not (Test-Port $WebPort)) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm dev:web > scripts\.shot-web.log 2>&1" -WorkingDirectory $Root -WindowStyle Hidden
    Start-Sleep -Seconds 3
  }
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    if ((Test-Port $ApiPort) -and (Test-Port $WebPort)) { break }
    Start-Sleep -Milliseconds 800
  }
  if (-not (Test-Port $ApiPort)) { throw "api:$ApiPort not ready, see scripts/.shot-api.log" }
  if (-not (Test-Port $WebPort)) { throw "web:$WebPort not ready, see scripts/.shot-web.log" }
  Write-Output "servers up: api:$ApiPort web:$WebPort"
}

function Stop-Servers {
  foreach ($p in ($ApiPort, $WebPort)) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      $procId = $c.OwningProcess
      if ($procId -and $procId -ne $PID) {
        & taskkill /PID $procId /T /F 2>$null | Out-Null
      }
    }
  }
  Write-Output "servers down"
}

function Find-Browser {
  $edgeCandidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
  )
  $browser = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $browser) { throw "Edge/Chrome not found" }
  return $browser
}

function Invoke-Shots {
  if (-not (Test-Port $ApiPort) -or -not (Test-Port $WebPort)) {
    throw "servers not ready, run: powershell -File scripts\shot.ps1 up"
  }
  New-Item -ItemType Directory -Force -Path $UiDir | Out-Null
  $browser = Find-Browser
  Write-Output "browser: $browser"

  $shots = @(
    @{ name = "01-loading"; url = "http://127.0.0.1:$WebPort/?shot=loading"; width = 1280; height = 800 },
    @{ name = "02-empty"; url = "http://127.0.0.1:$WebPort/?shot=empty"; width = 1280; height = 800 },
    @{ name = "03-ready"; url = "http://127.0.0.1:$WebPort/?shot=ready"; width = 1280; height = 800 },
    @{ name = "04-error"; url = "http://127.0.0.1:$WebPort/?shot=error"; width = 1280; height = 800 },
    @{ name = "05-narrow"; url = "http://127.0.0.1:$WebPort/?shot=ready&narrow=1"; width = 488; height = 760 }
  )

  foreach ($s in $shots) {
    $out = Join-Path $UiDir ($s.name + ".png")
    $args = @(
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--screenshot=$out", "--window-size=$($s.width),$($s.height)",
      "--virtual-time-budget=6000", $s.url
    )
    # one-shot headless process: exits by itself after capture, nothing resident
    $proc = Start-Process -FilePath $browser -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
    if ($proc.ExitCode -ne 0) { Write-Output "warn: $($s.name) exit=$($proc.ExitCode)" }
    if (Test-Path $out) {
      $kb = [math]::Round((Get-Item $out).Length / 1KB)
      Write-Output "shot ok: $($s.name).png ($kb KB)"
    } else {
      throw "screenshot failed: $out"
    }
  }
  Write-Output "shots done -> $UiDir"
}

switch ($Action) {
  "up"     { Start-Servers }
  "shots"  { Invoke-Shots }
  "down"   { Stop-Servers }
  "status" {
    $a = Test-Port $ApiPort; $w = Test-Port $WebPort
    Write-Output "api:$ApiPort=$a web:$WebPort=$w"
  }
  "all"    {
    Start-Servers
    try { Invoke-Shots } finally { Stop-Servers }
  }
}
