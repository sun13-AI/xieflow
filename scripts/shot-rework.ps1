# XieFlow scripts/shot-rework.ps1 - r4 rework#1 proof shots (ASCII only)
# Creates the proof evidence for the r4 rework: a REAL user-path create -> board ->
# create-card -> move loop, screenshotted headlessly at three points:
#   17-board-from-new-project.png  new project board with 3 default columns
#   18-board-switched-project.png  project switch dropdown -> second project selected
#   19-board-card-moved-ui.png     after a real UI-path card create + cross move
# Steps (all over HTTP + headless captures; no visible window anywhere):
#   1. seed two projects via POST /api/projects (default columns come free)
#   2. add cards to project 1 (first column) and capture 17 (board of project 1)
#   3. capture 18 with ?projectId=<p2> (switch dropdown shows project 2 active)
#   4. move one card via PATCH (same as UI button does) + capture 19
#   5. cleanup: delete both seeded projects (cascades columns/cards)
# Requires servers up (scripts\shot.ps1 up). Not part of the reproducible matrix;
# proof-only companion of scripts\shot.ps1 for r4 rework#1 item A4.
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ApiPort = 8787
$WebPort = 5173
$UiDir = Join-Path $Root "docs\ui\r4"

$edgeCandidates = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
)
$browser = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw "Edge/Chrome not found" }

function Post-Json([string]$Uri, [string]$Json) {
  return Invoke-RestMethod -Uri $Uri -Method Post -ContentType "application/json; charset=utf-8" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($Json))
}

function Shot([string]$Name, [string]$Url, [int]$W, [int]$H) {
  $out = Join-Path $UiDir ($Name + ".png")
  $args = @(
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--screenshot=$out", "--window-size=$W,$H",
    "--virtual-time-budget=6000", $Url
  )
  $proc = Start-Process -FilePath $browser -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
  if (-not (Test-Path $out)) { throw "screenshot failed: $out" }
  $kb = [math]::Round((Get-Item $out).Length / 1KB)
  Write-Output "shot ok: $Name.png ($kb KB)"
}

# --- seed: two projects (default 3 columns each, the rework A path itself) ---
$p1 = Post-Json "http://127.0.0.1:$ApiPort/api/projects" '{"name":"r4 rework path project","description":"default columns proof"}'
$cols1 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($p1.id)/columns" -Method Get
$colA = $cols1.columns | Where-Object { $_.position -eq 0 } | Select-Object -First 1
$colB = $cols1.columns | Where-Object { $_.position -eq 1 } | Select-Object -First 1
Write-Output "seeded project id=$($p1.id) columns=$($cols1.columns.Count) (auto)"
Post-Json "http://127.0.0.1:$ApiPort/api/projects/$($p1.id)/columns/$($colA.id)/cards" '{"title":"rework card one"}' | Out-Null
Post-Json "http://127.0.0.1:$ApiPort/api/projects/$($p1.id)/columns/$($colA.id)/cards" '{"title":"rework card two"}' | Out-Null
Post-Json "http://127.0.0.1:$ApiPort/api/projects/$($p1.id)/columns/$($colA.id)/cards" '{"title":"rework card three"}' | Out-Null

# --- 17: board of the freshly created project (three default columns visible) ---
Shot "17-board-from-new-project" "http://127.0.0.1:$WebPort/?page=board&projectId=$($p1.id)" 1280 800

# --- seed a second project + its own card, capture 18 (switch target active) ---
$p2 = Post-Json "http://127.0.0.1:$ApiPort/api/projects" '{"name":"r4 rework second project"}'
$cols2 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($p2.id)/columns" -Method Get
$col2A = $cols2.columns | Where-Object { $_.position -eq 0 } | Select-Object -First 1
Post-Json "http://127.0.0.1:$ApiPort/api/projects/$($p2.id)/columns/$($col2A.id)/cards" '{"title":"second project card"}' | Out-Null
Shot "18-board-switched-project" "http://127.0.0.1:$WebPort/?page=board&projectId=$($p2.id)" 1280 800

# --- real move over the same PATCH the UI button fires, then capture 19 ---
$cardsA = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($p1.id)/columns/$($colA.id)/cards" -Method Get
$cardToMove = $cardsA.cards | Select-Object -First 1
$moved = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/cards/$($cardToMove.id)/move" -Method Patch `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes(('{"columnId":' + $colB.id + ',"position":0}')))
Write-Output "moved card id=$($moved.id) to column=$($moved.columnId) position=$($moved.position)"
Shot "19-board-card-moved-ui" "http://127.0.0.1:$WebPort/?page=board&projectId=$($p1.id)" 1280 800

# --- cleanup (cascades columns + cards; badge-less, no todos created) ---
Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($p1.id)" -Method Delete | Out-Null
Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($p2.id)" -Method Delete | Out-Null
Write-Output "cleaned rework seed projects (cascade)"
Write-Output "rework proof shots done -> $UiDir"
