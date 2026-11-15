# XieFlow scripts/shot.ps1 - screenshot helper (ASCII only for PS 5.1 compatibility)
# Usage:
#   powershell -File scripts\shot.ps1 up              # start api + web dev servers
#   powershell -File scripts\shot.ps1 shots           # capture current round states
#   powershell -File scripts\shot.ps1 shots -Round r2 # capture r2 todo-page states
#   powershell -File scripts\shot.ps1 down            # stop servers
#   powershell -File scripts\shot.ps1 status          # show port status
#   powershell -File scripts\shot.ps1 all             # up + shots + down
param(
  [Parameter(Position = 0)]
  [ValidateSet("up", "shots", "down", "status", "all")]
  [string]$Action = "status",
  [ValidateSet("r1", "r2")]
  [string]$Round = "r1"
)

# rework#1 (C): 06-todo-live needs real api data behind it. Before the live shot runs,
# create one seeded todo via the api (then leave it: the live page shows real data).
# Other r2 shots are seam-pinned and unaffected.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$UiDir = Join-Path $Root ("docs\ui\" + $Round)
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
  # r2 verify P1 fix: tsx watch dies silently in a detached process group
  # (3 cold starts -> 1 alive). Use production tsx (no watch), like audit-http.ps1.
  # Readiness is judged by a real HTTP 200, not just a TCP listen (a zombie api
  # can hold the port without serving).
  if (-not (Test-Port $ApiPort)) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm exec tsx apps/api/src/server.ts < NUL > scripts\.shot-api.log 2>&1" -WorkingDirectory $Root -WindowStyle Hidden
    Start-Sleep -Seconds 2
  }
  if (-not (Test-Port $WebPort)) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm dev:web < NUL > scripts\.shot-web.log 2>&1" -WorkingDirectory $Root -WindowStyle Hidden
    Start-Sleep -Seconds 2
  }
  $deadline = (Get-Date).AddSeconds(60)
  $apiReady = $false
  $webReady = $false
  while ((Get-Date) -lt $deadline) {
    if (-not $apiReady) {
      try {
        $h = Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/api/health" -UseBasicParsing -TimeoutSec 2
        if ($h.StatusCode -eq 200) { $apiReady = $true }
      } catch { }
    }
    if (-not $webReady) {
      try {
        $w = Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort" -UseBasicParsing -TimeoutSec 2
        if ($w.StatusCode -eq 200) { $webReady = $true }
      } catch { }
    }
    if ($apiReady -and $webReady) { break }
    Start-Sleep -Milliseconds 800
  }
  if (-not $apiReady) { throw "api:$ApiPort not ready (no HTTP 200 in 60s), see scripts/.shot-api.log" }
  if (-not $webReady) { throw "web:$WebPort not ready (no HTTP 200 in 60s), see scripts/.shot-web.log" }
  Write-Output "servers up: api:$ApiPort web:$WebPort (http-verified)"
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

  # 06-todo-live shows the page consuming REAL api data (no seam): seed one todo first.
  # Keep it ASCII-safe; UTF-8 bytes are sent explicitly (PS 5.1 Invoke-RestMethod ANSI trap).
  if ($Round -eq "r2") {
    $seedTitle = "r2 live shot seed todo"
    $seedBody = [System.Text.Encoding]::UTF8.GetBytes(
      '{"title":"' + $seedTitle + '","quadrant":"q2","dueDate":null}'
    )
    try {
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $seedBody | Out-Null
      Write-Output "seeded 1 live todo for 06-todo-live"
    } catch {
      Write-Output "warn: seed todo failed ($($_.Exception.Message)) - live shot may show empty data"
    }
  }

  if ($Round -eq "r2") {
    # r2 todo page: pinned states via ?page=todos&shot=todo-* seams (App.tsx / TodosPage.tsx)
    # rework#1: +06 live shot (C), +07 workbench tab active (E), +08/09/10 loading/error/empty-title (F)
    $shots = @(
      @{ name = "01-todo-empty";      url = "http://127.0.0.1:$WebPort/?page=todos&shot=todo-empty"; width = 1280; height = 800 },
      @{ name = "02-todo-modal";      url = "http://127.0.0.1:$WebPort/?page=todos&shot=todo-modal"; width = 1280; height = 800 },
      @{ name = "03-todo-quadrants";  url = "http://127.0.0.1:$WebPort/?page=todos&shot=todo-data";  width = 1280; height = 800 },
      @{ name = "04-todo-done";       url = "http://127.0.0.1:$WebPort/?page=todos&shot=todo-done";  width = 1280; height = 800 },
      @{ name = "05-todo-narrow";     url = "http://127.0.0.1:$WebPort/?page=todos&shot=todo-data&narrow=1"; width = 488; height = 760 },
      @{ name = "06-todo-live";       url = "http://127.0.0.1:$WebPort/?page=todos"; width = 1280; height = 800 },
      @{ name = "07-workbench-tab";   url = "http://127.0.0.1:$WebPort/?shot=workbench"; width = 1280; height = 800 },
      @{ name = "08-todo-loading";    url = "http://127.0.0.1:$WebPort/?page=todos&shot=todo-loading"; width = 1280; height = 800 },
      @{ name = "09-todo-error";      url = "http://127.0.0.1:$WebPort/?page=todos&shot=todo-error"; width = 1280; height = 800 },
      @{ name = "10-todo-empty-title"; url = "http://127.0.0.1:$WebPort/?page=todos&shot=todo-modal-empty-title"; width = 1280; height = 800 }
    )
  } else {
    $shots = @(
      @{ name = "01-loading"; url = "http://127.0.0.1:$WebPort/?shot=loading"; width = 1280; height = 800 },
      @{ name = "02-empty";   url = "http://127.0.0.1:$WebPort/?shot=empty";   width = 1280; height = 800 },
      @{ name = "03-ready";   url = "http://127.0.0.1:$WebPort/?shot=ready";   width = 1280; height = 800 },
      @{ name = "04-error";   url = "http://127.0.0.1:$WebPort/?shot=error";   width = 1280; height = 800 },
      @{ name = "05-narrow";  url = "http://127.0.0.1:$WebPort/?shot=ready&narrow=1"; width = 488; height = 760 }
    )
  }

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

  # r2 rework#1: delete the seeded live todo so repeat runs stay deterministic
  # (list grows by exactly 1 per run otherwise).
  if ($Round -eq "r2") {
    try {
      $list = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos" -Method Get
      $seeded = $list.todos | Where-Object { $_.title -eq "r2 live shot seed todo" }
      foreach ($t in $seeded) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos/$($t.id)" -Method Delete | Out-Null
      }
      Write-Output "cleaned seeded live todo(s)"
    } catch {
      Write-Output "warn: cleanup failed ($($_.Exception.Message))"
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
