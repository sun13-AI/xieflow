# XieFlow scripts/shot-r18-rework.ps1 - r18 rework#1 screenshot matrix (ASCII only, PS 5.1 safe)
# Headless-only capture of the changed render layer:
#   docs/ui/r18-rework1/01..08 : login/register/error/401-pinned/logout/mode card/narrow/logged-in
#   docs/ui/r18-rework1/shell/ : fourteen tab active states (App.tsx shell changed)
# Uses a scratch DB (never data/xieflow.db), starts/stops its own hidden servers,
# and kills any lingering browser tree after each capture. No visible windows.
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$UiDir = Join-Path $Root "docs\ui\r18-rework1"
$ShellDir = Join-Path $UiDir "shell"
$Scratch = Join-Path $Root "scripts\.tmp-r18-rework-shots"
$ApiPort = 8787
$WebPort = 5173

function Test-Port([int]$p) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

function Find-Browser {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
  )
  $browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $browser) { throw "Edge/Chrome not found" }
  return $browser
}

function Stop-Servers {
  foreach ($p in ($ApiPort, $WebPort)) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      if ($c.OwningProcess -and $c.OwningProcess -ne $PID) {
        & taskkill /PID $c.OwningProcess /T /F 2>$null | Out-Null
      }
    }
  }
}

function Shot([string]$browser, [string]$out, [string]$url, [int]$w, [int]$h) {
  if (Test-Path $out) { Remove-Item $out -Force }
  $args = @(
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--screenshot=$out",
    "--window-size=$w,$h", "--virtual-time-budget=6000", $url
  )
  $proc = Start-Process -FilePath $browser -ArgumentList $args -PassThru -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(45)
  while ((-not (Test-Path $out)) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 300 }
  $ok = Test-Path $out
  $exited = $proc.WaitForExit(5000)
  if (-not $exited) {
    & taskkill /PID $proc.Id /T /F 2>$null | Out-Null
  }
  if (-not $ok) { throw "screenshot failed: $out" }
  $kb = [math]::Round((Get-Item $out).Length / 1KB)
  Write-Output ("shot ok: {0} ({1} KB)" -f (Split-Path -Leaf $out), $kb)
}

New-Item -ItemType Directory -Force -Path $UiDir | Out-Null
New-Item -ItemType Directory -Force -Path $ShellDir | Out-Null
New-Item -ItemType Directory -Force -Path $Scratch | Out-Null

try {
  if (Test-Port $ApiPort) { throw "api:$ApiPort already listening; refusing to hijack" }
  $env:XIEFLOW_DB_PATH = Join-Path $Scratch "shots.db"
  $env:XIEFLOW_MODE = "local"
  $env:XIEFLOW_API_PORT = "$ApiPort"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm exec tsx apps/api/src/server.ts < NUL > scripts\.shot-r18fix-api.log 2>&1" `
    -WorkingDirectory $Root -WindowStyle Hidden | Out-Null
  if (-not (Test-Port $WebPort)) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm dev:web < NUL > scripts\.shot-r18fix-web.log 2>&1" `
      -WorkingDirectory $Root -WindowStyle Hidden | Out-Null
  }
  $deadline = (Get-Date).AddSeconds(60)
  $apiReady = $false
  $webReady = $false
  while ((Get-Date) -lt $deadline) {
    if (-not $apiReady) {
      try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/api/health" -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $apiReady = $true } } catch { }
    }
    if (-not $webReady) {
      try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort" -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $webReady = $true } } catch { }
    }
    if ($apiReady -and $webReady) { break }
    Start-Sleep -Milliseconds 800
  }
  if (-not $apiReady -or -not $webReady) { throw "servers not ready api=$apiReady web=$webReady" }
  Write-Output "servers up (scratch db, local mode)"

  $browser = Find-Browser
  $login = "http://127.0.0.1:$WebPort/?page=login"
  $register = "http://127.0.0.1:$WebPort/?page=register"
  $shots = @(
    @{ name = "01-login";         url = "$login&shot=login"; width = 1280; height = 900 },
    @{ name = "02-register";      url = "$register&shot=register"; width = 1280; height = 900 },
    @{ name = "03-login-error";   url = "$login&shot=login-error"; width = 1280; height = 900 },
    @{ name = "04-401-redirect";  url = "$login&reason=401"; width = 1280; height = 900 },
    @{ name = "05-after-logout";  url = "$login&reason=logout"; width = 1280; height = 900 },
    @{ name = "06-settings-mode"; url = "http://127.0.0.1:$WebPort/?shot=mode-settings"; width = 1280; height = 900 },
    @{ name = "07-narrow";        url = "$login&narrow=1"; width = 488; height = 900 },
    @{ name = "08-logged-in";     url = "http://127.0.0.1:$WebPort/?shot=ready&auth=in"; width = 1280; height = 900 }
  )
  foreach ($s in $shots) {
    Shot $browser (Join-Path $UiDir ($s.name + ".png")) $s.url $s.width $s.height
  }

  $tabs = @(
    @{ page = "";           file = "workbench-tab-active" },
    @{ page = "todos";      file = "todos-tab-active" },
    @{ page = "schedules";  file = "schedules-tab-active" },
    @{ page = "projects";   file = "projects-tab-active" },
    @{ page = "board";      file = "board-tab-active" },
    @{ page = "bases";      file = "bases-tab-active" },
    @{ page = "docs";       file = "docs-tab-active" },
    @{ page = "chat";       file = "chat-tab-active" },
    @{ page = "knowledge";  file = "knowledge-tab-active" },
    @{ page = "mindmap";    file = "mindmap-tab-active" },
    @{ page = "whiteboard"; file = "whiteboard-tab-active" },
    @{ page = "approval";   file = "approval-tab-active" },
    @{ page = "assets";     file = "assets-tab-active" },
    @{ page = "unit-tasks"; file = "unit-tasks-tab-active" }
  )
  foreach ($t in $tabs) {
    $url = "http://127.0.0.1:$WebPort/"
    if ($t.page -ne "") { $url = $url + "?page=" + $t.page }
    Shot $browser (Join-Path $ShellDir ($t.file + ".png")) $url 1280 800
  }

  Write-Output "SHA256 of new matrix:"
  foreach ($f in (Get-ChildItem $UiDir -Filter "*.png" | Sort-Object Name)) {
    $h = (Get-FileHash -Algorithm SHA256 $f.FullName).Hash.Substring(0, 8)
    Write-Output ("{0}={1}" -f $f.Name, $h)
  }
} finally {
  Stop-Servers
  if (Test-Path $Scratch) { Remove-Item -Recurse -Force $Scratch }
  Write-Output "servers stopped, scratch removed"
}
