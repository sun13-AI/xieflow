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
  [ValidateSet("r1", "r2", "r3", "r4")]
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

  # 06-schedule-live (r3) shows the REAL calendar consuming real api data: seed one
  # todo, then set its dueDate to today via the link route -> its auto schedule
  # appears on the real month grid (link path proved end-to-end). Cleaned after shots.
  #
  # r3 rework#1 (B) root cause of 06 == 10 byte-identical: BOTH seeds (incl. the
  # due-date move) ran BEFORE any screenshot, so 06 and 10 captured the same db
  # state at the same URL. Now the seeds are split around the actual captures:
  #   06 first (only the today seed on the grid) -> PATCH due-date -> 10 after.
  # A third seed runs before 06 so the moved schedule lands INSIDE the pinned
  # narrow-shot window (rework#1 D). All seeds are cleaned after the batch.
  $r3TodayTodoId = $null
  $r3MovedTodoId = $null
  if ($Round -eq "r3") {
    $seedBody3 = [System.Text.Encoding]::UTF8.GetBytes(
      '{"title":"r3 live shot seed todo","quadrant":"q2","dueDate":null}'
    )
    try {
      $seeded = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $seedBody3
      $r3TodayTodoId = $seeded.id
      $todayIso = (Get-Date).ToString("yyyy-MM-dd")
      $dueBody = [System.Text.Encoding]::UTF8.GetBytes(('{"dueDate":"' + $todayIso + '"}'))
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos/$r3TodayTodoId/due-date" -Method Patch `
        -ContentType "application/json; charset=utf-8" -Body $dueBody | Out-Null
      Write-Output "seeded 1 live todo with dueDate=$todayIso for 06-schedule-live"
      # narrow-window seed (rework#1 D): due today+1 so the pinned 488px narrow
      # viewport (which shows the week of today) contains a linked schedule block
      # with its status badge.
      $narrowBody = [System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r3 narrow seed todo","quadrant":"q3","dueDate":null}'
      )
      $narrowTodo = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $narrowBody
      $plus1 = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
      $narrowDue = [System.Text.Encoding]::UTF8.GetBytes(('{"dueDate":"' + $plus1 + '"}'))
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos/$($narrowTodo.id)/due-date" -Method Patch `
        -ContentType "application/json; charset=utf-8" -Body $narrowDue | Out-Null
      Write-Output "seeded narrow todo: dueDate=$plus1 (auto schedule expected on $plus1)"
      # NO move-yet: the today+3 seed (10-schedule-moved) is created between the
      # 06 and 10 captures so the move action leaves a real before/after trace.
    } catch {
      Write-Output "warn: seed todo failed ($($_.Exception.Message)) - live shot may show empty data"
    }
  }

  # r4: live board shots follow the r3 lesson (06 == 10 byte-identical): seed a
  # project + 3 columns + cards FIRST, capture 04 (before state), then do a REAL
  # cross-column move via PATCH /api/cards/:id/move, then capture 05 (after state).
  # The move leaves a real before/after trace; hashes must differ. All ASCII.
  $r4CardToMoveId = $null
  $r4TargetColumnId = $null
  if ($Round -eq "r4") {
    try {
      $projBody4 = [System.Text.Encoding]::UTF8.GetBytes(
        '{"name":"r4 live shot project","description":"seeded for live board shots"}'
      )
      $proj4 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $projBody4
      $colTodo4 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj4.id)/columns" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"name":"To Do"}'))
      $colDoing4 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj4.id)/columns" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"name":"Doing"}'))
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj4.id)/columns" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"name":"Done"}')) | Out-Null
      $seedTodo4 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"title":"r4 badge seed todo","quadrant":"q2"}'))
      $c1 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj4.id)/columns/$($colTodo4.id)/cards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"title":"r4 card A measure"}'))
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj4.id)/columns/$($colTodo4.id)/cards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"title":"r4 card B plan"}')) | Out-Null
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj4.id)/columns/$($colTodo4.id)/cards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(('{"title":"r4 card C tiles","todoId":' + $seedTodo4.id + '}'))) | Out-Null
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj4.id)/columns/$($colDoing4.id)/cards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"title":"r4 card D budget"}')) | Out-Null
      $r4CardToMoveId = $c1.id
      $r4TargetColumnId = $colDoing4.id
      Write-Output "seeded r4 project id=$($proj4.id) card-to-move=$($c1.id) target-column=$($colDoing4.id)"
    } catch {
      Write-Output "warn: r4 seed failed ($($_.Exception.Message)) - live shots may show empty board"
    }
  }

  if ($Round -eq "r4") {
    # r4 projects/board pages: pinned states via ?page=projects|board&shot=*- seams.
    # 04 = live board BEFORE the move; 05 = AFTER (real PATCH between the two).
    # 06 = new-card modal; 07 = narrow board (488px, 1-col); 08 = projects tab live.
    $shots = @(
      @{ name = "01-project-empty";     url = "http://127.0.0.1:$WebPort/?page=projects&shot=project-empty"; width = 1280; height = 800 },
      @{ name = "02-project-list";      url = "http://127.0.0.1:$WebPort/?page=projects&shot=project-data";  width = 1280; height = 800 },
      @{ name = "03-project-modal";     url = "http://127.0.0.1:$WebPort/?page=projects&shot=project-modal"; width = 1280; height = 800 },
      @{ name = "04-board-live";        url = "http://127.0.0.1:$WebPort/?page=board"; width = 1280; height = 800 },
      @{ name = "05-board-moved";       url = "http://127.0.0.1:$WebPort/?page=board"; width = 1280; height = 800 },
      @{ name = "06-board-modal";       url = "http://127.0.0.1:$WebPort/?page=board&shot=board-modal"; width = 1280; height = 800 },
      @{ name = "07-board-narrow";      url = "http://127.0.0.1:$WebPort/?page=board&shot=board-narrow&narrow=1"; width = 488; height = 900 },
      @{ name = "08-projects-tab-live"; url = "http://127.0.0.1:$WebPort/?page=projects"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r3") {
    # r3 schedules page: pinned states via ?page=schedules&shot=schedule-* seams
    # (App.tsx / SchedulesPage.tsx). 07 = workbench with the new today-schedules card.
    # rework#1: 11 = real todos tab active (no shot param -> real data path, U1-2).
    $shots = @(
      @{ name = "01-schedule-empty";   url = "http://127.0.0.1:$WebPort/?page=schedules&shot=schedule-empty"; width = 1280; height = 800 },
      @{ name = "02-schedule-month";   url = "http://127.0.0.1:$WebPort/?page=schedules&shot=schedule-data";  width = 1280; height = 800 },
      @{ name = "03-schedule-modal";   url = "http://127.0.0.1:$WebPort/?page=schedules&shot=schedule-modal"; width = 1280; height = 800 },
      @{ name = "04-schedule-badge";   url = "http://127.0.0.1:$WebPort/?page=schedules&shot=schedule-badge"; width = 1280; height = 800 },
      @{ name = "05-schedule-narrow";  url = "http://127.0.0.1:$WebPort/?page=schedules&shot=schedule-narrow&narrow=1"; width = 488; height = 900 },
      @{ name = "06-schedule-live";    url = "http://127.0.0.1:$WebPort/?page=schedules"; width = 1280; height = 800 },
      @{ name = "07-workbench-today";  url = "http://127.0.0.1:$WebPort/?shot=workbench"; width = 1280; height = 800 },
      @{ name = "08-schedule-loading"; url = "http://127.0.0.1:$WebPort/?page=schedules&shot=schedule-loading"; width = 1280; height = 800 },
      @{ name = "09-schedule-error";   url = "http://127.0.0.1:$WebPort/?page=schedules&shot=schedule-error"; width = 1280; height = 800 },
      @{ name = "10-schedule-moved";   url = "http://127.0.0.1:$WebPort/?page=schedules"; width = 1280; height = 800 },
      @{ name = "11-todos-tab";        url = "http://127.0.0.1:$WebPort/?page=todos"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r2") {
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

    # r3 rework#1 (B): between 06 (before) and 10 (after) the MOVE really happens
    # over the link route: seeded todo dueDate today -> today+3, its auto schedule
    # follows. 06 therefore shows the today-only live grid; 10 shows the moved one.
    if ($Round -eq "r3" -and $s.name -eq "06-schedule-live") {
      if ($r3TodayTodoId) {
        try {
          $plus3 = (Get-Date).AddDays(3).ToString("yyyy-MM-dd")
          $moveBody = [System.Text.Encoding]::UTF8.GetBytes(('{"dueDate":"' + $plus3 + '"}'))
          $movedAfter = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos/$r3TodayTodoId/due-date" -Method Patch `
            -ContentType "application/json; charset=utf-8" -Body $moveBody
          Write-Output "moved live todo: dueDate $($movedAfter.dueDate) (auto schedule expected on $plus3)"
        } catch {
          Write-Output "warn: move between 06/10 failed ($($_.Exception.Message)) - 10 may equal 06"
        }
      } else {
        Write-Output "warn: no seeded todo id - skip move, 10 may equal 06"
      }
    }

    # r4 (r3 B lesson): between 04 (before) and 05 (after) a REAL cross-column move
    # happens over PATCH /api/cards/:id/move: seeded card A -> Doing column (pos 0).
    # 04 therefore shows A in the first column; 05 shows A in Doing with the source
    # column re-packed. Hashes of 04/05 must differ (byte-level check upstream).
    if ($Round -eq "r4" -and $s.name -eq "04-board-live") {
      if ($r4CardToMoveId -and $r4TargetColumnId) {
        try {
          $movedCard = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/cards/$($r4CardToMoveId)/move" -Method Patch `
            -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(('{"columnId":' + $r4TargetColumnId + ',"position":0}')))
          Write-Output "moved live card: id=$($movedCard.id) columnId=$($movedCard.columnId) position=$($movedCard.position)"
        } catch {
          Write-Output "warn: move between 04/05 failed ($($_.Exception.Message)) - 05 may equal 04"
        }
      } else {
        Write-Output "warn: no seeded card/column id - skip move, 05 may equal 04"
      }
    }
  }

  # r2 rework#1: delete the seeded live todo so repeat runs stay deterministic
  # (list grows by exactly 1 per run otherwise).
  # r3: same for the seeded live todo; deleting the todo also cascades its auto
  # schedule away (link cleanup proved on every run).
  # r4: delete the whole seeded project (columns + cards cascade) and the badge
  # seed todo, so repeat runs stay deterministic.
  if ($Round -eq "r4") {
    try {
      $projs = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects" -Method Get
      $seededProjects = $projs.projects | Where-Object { $_.name -eq "r4 live shot project" }
      foreach ($p in $seededProjects) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($p.id)" -Method Delete | Out-Null
      }
      $todoList = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos" -Method Get
      $seededTodos = $todoList.todos | Where-Object { $_.title -eq "r4 badge seed todo" }
      foreach ($t in $seededTodos) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos/$($t.id)" -Method Delete | Out-Null
      }
      Write-Output "cleaned seeded r4 project(s) and badge todo(s)"
    } catch {
      Write-Output "warn: r4 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r2" -or $Round -eq "r3") {
    try {
      $list = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos" -Method Get
      $seeded = $list.todos | Where-Object { $_.title -eq "r2 live shot seed todo" -or $_.title -eq "r3 live shot seed todo" -or $_.title -eq "r3 moved seed todo" -or $_.title -eq "r3 narrow seed todo" }
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
