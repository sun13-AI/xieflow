# XieFlow scripts/shot.ps1 - screenshot helper (ASCII only for PS 5.1 compatibility)
# Usage:
#   powershell -File scripts\shot.ps1 up              # start api + web dev servers
#   powershell -File scripts\shot.ps1 shots           # capture current round states
#   powershell -File scripts\shot.ps1 shots -Round r4 # capture r4 project/board states
#   powershell -File scripts\shot.ps1 shots -Round r5 # capture r5 board stats + CSV export states
#   powershell -File scripts\shot.ps1 shots -Round r6 # capture r6 bases grid states
#   powershell -File scripts\shot.ps1 shots -Round r7 # capture r7 views + CSV import states
#   powershell -File scripts\shot.ps1 down            # stop servers
#   powershell -File scripts\shot.ps1 status          # show port status
#   powershell -File scripts\shot.ps1 all             # up + shots + down
#
# SHELL BASELINE (rework#1 B, ui-reviewer U1-1 3-round lesson): any -Round r4+ run
# of `shots` ALSO captures the five-tab shell active states (workbench / todos /
# schedules / projects / board) into docs\ui\shell\. The shell is a render-layer
# change whenever its tabs change; the inherited pages' active states must have
# evidence in the SAME round, automatically. Rule: whenever you add or rename a
# tab (shell change), the five active states are re-shot by this block - no
# manual checklist needed. Keep the list in sync with App.tsx PageTab.
# r6: a sixth tab (bases) was added -> the baseline now captures six active states.
param(
  [Parameter(Position = 0)]
  [ValidateSet("up", "shots", "down", "status", "all")]
  [string]$Action = "status",
  [ValidateSet("r1", "r2", "r3", "r4", "r5", "r6", "r7")]
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

# SHELL BASELINE: five-tab shell active states (rework#1 B). Fired automatically on
# every r4+ shots run so a shell change can never leave inherited pages without
# evidence again (r2/r3/r4 three-round U1-1 lesson). Landing dir: docs\ui\shell\.
function Invoke-ShellBaseline {
  param([string]$BrowserPath)
  $shellDir = Join-Path $Root "docs\ui\shell"
  New-Item -ItemType Directory -Force -Path $shellDir | Out-Null
  # keep in sync with App.tsx PageTab: url param ?page= value -> file prefix
  $tabs = @(
    @{ page = "";          file = "workbench-tab-active" },
    @{ page = "todos";     file = "todos-tab-active" },
    @{ page = "schedules"; file = "schedules-tab-active" },
    @{ page = "projects";  file = "projects-tab-active" },
    @{ page = "board";     file = "board-tab-active" },
    @{ page = "bases";     file = "bases-tab-active" }
  )
  foreach ($t in $tabs) {
    $url = "http://127.0.0.1:$WebPort/"
    if ($t.page -ne "") { $url = $url + "?page=" + $t.page }
    $out = Join-Path $shellDir ($t.file + ".png")
    if (Test-Path $out) { Remove-Item $out -Force }
    $args = @(
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--screenshot=$out", "--window-size=1280,800",
      "--virtual-time-budget=6000", $url
    )
    # r5 fix: same hang-proof capture as the round matrix (wait for the png,
    # then kill a lingering browser tree - never leave a headless browser behind)
    $proc = Start-Process -FilePath $BrowserPath -ArgumentList $args -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(45)
    while ((-not (Test-Path $out)) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 300 }
    $captured = Test-Path $out
    $exited = $proc.WaitForExit(5000)
    if (-not $exited) {
      & taskkill /PID $proc.Id /T /F 2>$null | Out-Null
      Write-Output "note: shell $($t.file) browser lingered -> killed"
    } elseif ($proc.ExitCode -ne 0) {
      Write-Output "warn: shell $($t.file) exit=$($proc.ExitCode)"
    }
    if ($captured) {
      $kb = [math]::Round((Get-Item $out).Length / 1KB)
      Write-Output "shell baseline ok: $($t.file).png ($kb KB)"
    } else {
      throw "shell baseline failed: $out"
    }
  }
  Write-Output "shell baseline done -> $shellDir"
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
  # project FIRST, capture 04 (before state), then do a REAL cross-column move via
  # PATCH /api/cards/:id/move, then capture 05 (after state).
  # rework#1 (A): POST /api/projects now auto-creates the three default columns
  # (ToDo/Doing/Done template = todo/doing/done), so the seed consumes THAT real
  # user path - no explicit column POSTs anymore (the r4-verify P1 dead-end path).
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
      # rework#1: default columns come with the project (0=To Do,1=Doing,2=Done).
      # Rename via PATCH keeps them the real auto-created columns.
      $dfltCols = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj4.id)/columns" -Method Get
      $colTodo4 = $dfltCols.columns | Where-Object { $_.position -eq 0 } | Select-Object -First 1
      $colDoing4 = $dfltCols.columns | Where-Object { $_.position -eq 1 } | Select-Object -First 1
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/board-columns/$($colTodo4.id)" -Method Patch `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"name":"To Do"}')) | Out-Null
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/board-columns/$($colDoing4.id)" -Method Patch `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"name":"Doing"}')) | Out-Null
      $colDone4 = $dfltCols.columns | Where-Object { $_.position -eq 2 } | Select-Object -First 1
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/board-columns/$($colDone4.id)" -Method Patch `
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
      # second project exists only to prove the D rework: project switch dropdown
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"name":"r4 switch target project"}')) | Out-Null
      $r4CardToMoveId = $c1.id
      $r4TargetColumnId = $colDoing4.id
      Write-Output "seeded r4 project id=$($proj4.id) with default columns + 1 switch-target; card-to-move=$($c1.id) target-column=$($colDoing4.id)"
    } catch {
      Write-Output "warn: r4 seed failed ($($_.Exception.Message)) - live shots may show empty board"
    }
  }

  # r5: seed a board with cards + linked todos so the stats card (completion
  # rate bars) and the CSV export have REAL data. The seed JSON uses \u escapes
  # so this script stays pure ASCII (PS 5.1 cannot read UTF-8 literals); the api
  # decodes them into Chinese. One card title carries an ASCII comma + quotes
  # and its description carries a newline -> the CSV escaping is visible in the
  # exported ledger (r5 audit asserts the same escaping over HTTP).
  $r5ProjectId = $null
  $r5EmptyProjectId = $null
  $r5TodoDoneId = $null
  $r5TodoOpenId = $null
  if ($Round -eq "r5") {
    try {
      $projBody5 = [System.Text.Encoding]::UTF8.GetBytes(
        '{"name":"r5 \u7edf\u8ba1\u5bfc\u51fa\u9879\u76ee","description":"seeded for r5 stats and export shots"}'
      )
      $proj5 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $projBody5
      $cols5 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj5.id)/columns" -Method Get
      $cTodo5 = $cols5.columns | Where-Object { $_.position -eq 0 } | Select-Object -First 1
      $cDoing5 = $cols5.columns | Where-Object { $_.position -eq 1 } | Select-Object -First 1
      $cDone5 = $cols5.columns | Where-Object { $_.position -eq 2 } | Select-Object -First 1
      # two linked todos: one done (counts as completed), one open
      $todoDone5 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"title":"\u5df2\u5b8c\u6210\u5f85\u529e","quadrant":"q1"}'))
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos/$($todoDone5.id)" -Method Patch `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"status":"done"}')) | Out-Null
      $todoOpen5 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"title":"\u8fdb\u884c\u4e2d\u5f85\u529e","quadrant":"q2"}'))
      # todo column: 3 cards (plain / comma+quote title with newline desc / done-linked)
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj5.id)/columns/$($cTodo5.id)/cards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"title":"\u91cf\u623f"}')) | Out-Null
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj5.id)/columns/$($cTodo5.id)/cards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
          ('{"title":"\u9009\u74f7\u7816 \"A\" \u578b, \u7279\u4ef7","description":"line1\nline2","todoId":' + $todoOpen5.id + '}')
        )) | Out-Null
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj5.id)/columns/$($cTodo5.id)/cards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
          ('{"title":"\u9009\u74f7\u7816","todoId":' + $todoDone5.id + '}')
        )) | Out-Null
      # doing column: 1 card linked to the done todo -> completion rate 100%
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj5.id)/columns/$($cDoing5.id)/cards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
          ('{"title":"\u5199 r5 \u6750\u6599","todoId":' + $todoDone5.id + '}')
        )) | Out-Null
      # done column: 1 card without todo -> completion rate 0%
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$($proj5.id)/columns/$($cDone5.id)/cards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"title":"\u5b9a\u9884\u7b97"}')) | Out-Null
      # second project: default three columns, zero cards -> the "empty project" stats state
      $emptyBody5 = [System.Text.Encoding]::UTF8.GetBytes('{"name":"r5 \u7a7a\u9879\u76ee"}')
      $empty5 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $emptyBody5
      $r5ProjectId = $proj5.id
      $r5EmptyProjectId = $empty5.id
      $r5TodoDoneId = $todoDone5.id
      $r5TodoOpenId = $todoOpen5.id
      Write-Output "seeded r5 project id=$($proj5.id) (5 cards + 2 linked todos), empty project id=$($empty5.id)"
    } catch {
      Write-Output "warn: r5 seed failed ($($_.Exception.Message)) - live shots may show empty board"
    }
  }

  # r7: seed ONE real table with the 8 default fields, 3 real records, 4 SAVED
  # views (multi-condition AND / hidden columns / sorted / imported-only) and a
  # REAL CSV import over HTTP (the imported row count is read back from the api
  # response and injected into the success shot's URL). All Chinese is written
  # as \uXXXX escapes so this script stays pure ASCII (PS 5.1 UTF-8 trap).
  # CSV headers use numeric field ids (mapCsvHeadersToFields supports them), so
  # no Chinese column names are needed in the script either.
  $r7TableId = $null
  $r7ViewEditId = $null
  $r7ViewHiddenId = $null
  $r7ViewImportedId = $null
  $r7ImportedCount = 0
  if ($Round -eq "r7") {
    try {
      $tableBody7 = [System.Text.Encoding]::UTF8.GetBytes(
        '{"name":"r7 \u89c6\u56fe\u4e0e\u5bfc\u5165","description":"seeded for r7 view and import shots"}'
      )
      $table7 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $tableBody7
      $f7 = (Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table7.id)/fields" -Method Get).fields | Sort-Object position
      $fName7 = $f7[0].id
      $fStatus7 = $f7[1].id
      $fOwner7 = $f7[2].id
      $fAmount7 = $f7[3].id
      $fDue7 = $f7[4].id
      $fTag7 = $f7[5].id
      $fDone7 = $f7[6].id
      $fLink7 = $f7[7].id
      $row7A = '{"data":{"' + $fName7 + '":"\u91cf\u623f","' + $fStatus7 + '":"\u5df2\u5b8c\u6210","' + $fOwner7 + '":"\u5c0f\u534f","' + $fAmount7 + '":1200,"' + $fDue7 + '":"2026-11-20","' + $fTag7 + '":["\u91cd\u8981"],"' + $fDone7 + '":true,"' + $fLink7 + '":"https://example.com/measure"}}'
      $row7B = '{"data":{"' + $fName7 + '":"\u9009\u74f7\u7816","' + $fStatus7 + '":"\u8fdb\u884c\u4e2d","' + $fOwner7 + '":"\u5c0f\u6d41","' + $fAmount7 + '":300,"' + $fDue7 + '":"2026-12-01","' + $fTag7 + '":["\u91cd\u8981","\u7d27\u6025"],"' + $fDone7 + '":false,"' + $fLink7 + '":"https://example.com/tiles"}}'
      $row7C = '{"data":{"' + $fName7 + '":"\u5b9a\u9884\u7b97","' + $fStatus7 + '":"\u672a\u5f00\u59cb","' + $fOwner7 + '":"\u5c0f\u534f","' + $fAmount7 + '":9000,"' + $fDue7 + '":null,"' + $fTag7 + '":[],"' + $fDone7 + '":false,"' + $fLink7 + '":null}}'
      foreach ($r7row in @($row7A, $row7B, $row7C)) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table7.id)/records" -Method Post `
          -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r7row)) | Out-Null
      }
      # view 1 (edit-panel shot): status=in-progress, sort amount desc, 4 visible cols
      $view7A = '{"name":"\u8fdb\u884c\u4e2d\u4e8b\u9879","filterSpec":[{"fieldId":' + $fStatus7 + ',"value":"\u8fdb\u884c\u4e2d"}],"sortSpec":[{"fieldId":' + $fAmount7 + ',"direction":"desc"}],"visibleFields":[' + $fName7 + ',' + $fStatus7 + ',' + $fOwner7 + ',' + $fAmount7 + ']}'
      $vEdit7 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table7.id)/views" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($view7A))
      # view 2 (hidden-columns shot): only 4 of 8 columns survive the projection
      $view7B = '{"name":"\u5df2\u5b8c\u6210 \u00b7 \u7cbe\u7b80","filterSpec":[{"fieldId":' + $fStatus7 + ',"value":"\u5df2\u5b8c\u6210"}],"sortSpec":[{"fieldId":' + $fAmount7 + ',"direction":"asc"}],"visibleFields":[' + $fName7 + ',' + $fStatus7 + ',' + $fAmount7 + ',' + $fDone7 + ']}'
      $vHidden7 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table7.id)/views" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($view7B))
      # view 3: no filter, amount desc (a third chip in the switcher)
      $view7C = '{"name":"\u5168\u90e8\u91d1\u989d\u964d\u5e8f","filterSpec":[],"sortSpec":[{"fieldId":' + $fAmount7 + ',"direction":"desc"}],"visibleFields":[]}'
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table7.id)/views" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($view7C)) | Out-Null
      # REAL CSV import: 3 rows, headers are numeric field ids, newlines are \n JSON escapes
      $csvHeader7 = ($f7 | ForEach-Object { $_.id }) -join ','
      $csvRow7A = 'CSV A,\u5df2\u5b8c\u6210,CSV \u5bfc\u5165,7701,2026-12-01,\u91cd\u8981,true,https://example.com/import-a'
      $csvRow7B = 'CSV B,\u8fdb\u884c\u4e2d,CSV \u5bfc\u5165,7702,2026-12-02,\u7d27\u6025,false,https://example.com/import-b'
      $csvRow7C = 'CSV C,\u672a\u5f00\u59cb,CSV \u5bfc\u5165,7703,2026-12-03,,false,'
      $csvBody7 = '{"csv":"' + $csvHeader7 + '\n' + $csvRow7A + '\n' + $csvRow7B + '\n' + $csvRow7C + '"}'
      $importRes7 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table7.id)/import.csv" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($csvBody7))
      $r7ImportedCount = [int]$importRes7.imported
      # view 4 (import-success shot): filter on the imported rows' owner column
      $view7D = '{"name":"\u672c\u6b21\u5bfc\u5165","filterSpec":[{"fieldId":' + $fOwner7 + ',"value":"CSV \u5bfc\u5165"}],"sortSpec":[{"fieldId":' + $fAmount7 + ',"direction":"asc"}],"visibleFields":[' + $fName7 + ',' + $fOwner7 + ',' + $fAmount7 + ',' + $fStatus7 + ']}'
      $vImported7 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table7.id)/views" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($view7D))
      $r7TableId = $table7.id
      $r7ViewEditId = $vEdit7.id
      $r7ViewHiddenId = $vHidden7.id
      $r7ViewImportedId = $vImported7.id
      Write-Output "seeded r7 table id=$($table7.id) with 4 views; real CSV imported $r7ImportedCount rows; editor view=$($vEdit7.id) hidden view=$($vHidden7.id) imported view=$($vImported7.id)"
    } catch {
      Write-Output "warn: r7 seed failed ($($_.Exception.Message)) - live shots may show empty table"
    }
  }

  if ($Round -eq "r6") {
    # r6: seed a multi-dim table with the seven field types and three records so
    # the grid view, the field panel and the filtered/sorted view all show REAL
    # api data (no fake pixels). The seed JSON uses \u escapes so this script
    # stays pure ASCII (PS 5.1 cannot read UTF-8 literals); the api decodes them
    # into Chinese. Field ids come from the default template ORDER (position
    # 0..7), so no Chinese field names are needed in this script either.
    $r6TableId = $null
    $r6EmptyTableId = $null
    $r6FieldAmount = $null
    $r6FieldTag = $null
    try {
      $tableBody6 = [System.Text.Encoding]::UTF8.GetBytes(
        '{"name":"r6 \u591a\u7ef4\u8868\u683c","description":"seeded for r6 grid shots"}'
      )
      $table6 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $tableBody6
      $fields6 = (Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table6.id)/fields" -Method Get).fields | Sort-Object position
      $fName = $fields6[0].id
      $fStatus = $fields6[1].id
      $fOwner = $fields6[2].id
      $fAmount = $fields6[3].id
      $fDue = $fields6[4].id
      $fTag = $fields6[5].id
      $fDone = $fields6[6].id
      $fLink = $fields6[7].id
      # row A: text / select / text / number / date / multi-select / checkbox / url
      $rowA = '{"data":{"' + $fName + '":"\u91cf\u623f","' + $fStatus + '":"\u5df2\u5b8c\u6210","' + $fOwner + '":"\u5c0f\u534f","' + $fAmount + '":1200,"' + $fDue + '":"2026-11-20","' + $fTag + '":["\u91cd\u8981"],"' + $fDone + '":true,"' + $fLink + '":"https://example.com/measure"}}'
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table6.id)/records" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($rowA)) | Out-Null
      # row B: two multi-select tags -> shows the multi-value pill form
      $rowB = '{"data":{"' + $fName + '":"\u9009\u74f7\u7816","' + $fStatus + '":"\u8fdb\u884c\u4e2d","' + $fOwner + '":"\u5c0f\u6d41","' + $fAmount + '":300,"' + $fDue + '":"2026-12-01","' + $fTag + '":["\u91cd\u8981","\u7d27\u6025"],"' + $fDone + '":false,"' + $fLink + '":"https://example.com/tiles"}}'
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table6.id)/records" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($rowB)) | Out-Null
      # row C: empty date / empty tags / empty link -> shows the empty-cell form
      $rowC = '{"data":{"' + $fName + '":"\u5b9a\u9884\u7b97","' + $fStatus + '":"\u672a\u5f00\u59cb","' + $fOwner + '":"\u5c0f\u534f","' + $fAmount + '":9000,"' + $fDue + '":null,"' + $fTag + '":[],"' + $fDone + '":false,"' + $fLink + '":null}}'
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$($table6.id)/records" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($rowC)) | Out-Null
      $r6TableId = $table6.id
      $r6FieldAmount = $fAmount
      $r6FieldTag = $fTag
      # a second table with ZERO rows -> the real empty-grid state (field headers
      # stay visible); the "no table at all" first-use state lives in the shell
      # baseline (captured after this seed is cleaned up).
      $emptyBody6 = [System.Text.Encoding]::UTF8.GetBytes(
        '{"name":"r6 \u7a7a\u8868"}'
      )
      $emptyTable6 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $emptyBody6
      $r6EmptyTableId = $emptyTable6.id
      Write-Output "seeded r6 table id=$($table6.id) with 8 default fields + 3 records; empty table id=$($emptyTable6.id)"
    } catch {
      Write-Output "warn: r6 seed failed ($($_.Exception.Message)) - live grid shots may show empty table"
    }
  }

  if ($Round -eq "r7") {
    # r7: view switcher / view editor / hidden columns / CSV import states.
    # 01 = view switcher with 4 saved views (REAL api views, all-records active);
    # 02 = view editor panel (?editView=<id> opens the panel with REAL saved spec);
    # 03 = hidden-columns grid (?viewId=<id> -> real /api/views/:id/records projection);
    # 04 = import preview dialog (?shot=bases-import-preview -> REAL preview api call, 5 rows);
    # 05 = import error rows (?shot=bases-import-errors -> REAL api returns row 2/3 errors);
    # 06 = import success (?viewId=<imported view>&imported=<REAL response count> -> banner + rows);
    # 07 = narrow view (488x900, ?narrow=1 seam);
    # 08 = cell editor with FIXED column widths (r6 U2-1 fix evidence, pinned editor state);
    # 09 = filter feedback (r6 U2-2 fix evidence: real "apply filter" handler -> success
    #      banner with the real hit count + disabled direction dropdown hint).
    $r7Base = "http://127.0.0.1:$WebPort/?page=bases"
    if ($r7TableId) { $r7Base = $r7Base + "&tableId=$r7TableId" }
    $shots = @(
      @{ name = "01-views-switcher";      url = $r7Base; width = 1280; height = 800 },
      @{ name = "02-view-editor";         url = ($r7Base + "&editView=$r7ViewEditId"); width = 1280; height = 800 },
      @{ name = "03-hidden-columns";      url = ($r7Base + "&viewId=$r7ViewHiddenId"); width = 1280; height = 800 },
      @{ name = "04-import-preview";      url = ($r7Base + "&shot=bases-import-preview"); width = 1280; height = 800 },
      @{ name = "05-import-errors";       url = ($r7Base + "&shot=bases-import-errors"); width = 1280; height = 800 },
      @{ name = "06-import-success";      url = ($r7Base + "&viewId=$r7ViewImportedId&imported=$r7ImportedCount"); width = 1280; height = 800 },
      @{ name = "07-views-narrow";        url = ($r7Base + "&viewId=$r7ViewHiddenId&narrow=1"); width = 488; height = 900 },
      @{ name = "08-cell-editor-fixed";   url = "http://127.0.0.1:$WebPort/?page=bases&shot=bases-edit"; width = 1280; height = 800 },
      @{ name = "09-filter-feedback";     url = ($r7Base + "&filterFieldId=$fStatus7&filterValue=%E5%B7%B2%E5%AE%8C%E6%88%90&shot=bases-filter-feedback"); width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r6") {
    # r6 bases page: grid view states.
    # 01 = live grid with all seven field types (real api data);
    # 02 = empty state (no table at all -> first-use guidance);
    # 03 = field management panel (pinned, 8 default fields);
    # 04 = filtered + sorted (real query: filter by tag, sort by amount desc);
    # 05 = narrow grid (?narrow=1 seam, 488x900);
    # 06 = error state (pinned); 07 = loading state (pinned);
    # 08 = cell editor open (pinned) -> shows the per-type editor controls.
    $r6Base = "http://127.0.0.1:$WebPort/?page=bases"
    if ($r6TableId) {
      $r6Base = $r6Base + "&tableId=$r6TableId"
    }
    $r6Empty = "http://127.0.0.1:$WebPort/?page=bases"
    if ($r6EmptyTableId) {
      $r6Empty = $r6Empty + "&tableId=$r6EmptyTableId"
    }
    $r6Filter = ""
    if ($r6TableId -and $r6FieldTag -and $r6FieldAmount) {
      # tag filter (multi-select contains) + amount sort desc -> a real filtered view
      $r6Filter = "&filterFieldId=$r6FieldTag&filterValue=%E9%87%8D%E8%A6%81&sortFieldId=$r6FieldAmount&sortDirection=desc"
    }
    $shots = @(
      @{ name = "01-bases-grid-live";   url = $r6Base; width = 1280; height = 800 },
      @{ name = "02-bases-empty";       url = $r6Empty; width = 1280; height = 800 },
      @{ name = "03-bases-fields-panel"; url = "http://127.0.0.1:$WebPort/?page=bases&shot=bases-fields"; width = 1280; height = 800 },
      @{ name = "04-bases-filtered-sorted"; url = ($r6Base + $r6Filter); width = 1280; height = 800 },
      @{ name = "05-bases-narrow";      url = ($r6Base + "&narrow=1"); width = 488; height = 900 },
      @{ name = "06-bases-error";       url = "http://127.0.0.1:$WebPort/?page=bases&shot=bases-error"; width = 1280; height = 800 },
      @{ name = "07-bases-loading";     url = "http://127.0.0.1:$WebPort/?page=bases&shot=bases-loading"; width = 1280; height = 800 },
      @{ name = "08-bases-cell-editor"; url = "http://127.0.0.1:$WebPort/?page=bases&shot=bases-edit"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r5") {
    # r5 board page: stats card + CSV export states.
    # 01 = live board with cards (stats card carries real counts + rate bars);
    # 02 = live EMPTY project (default three columns, zero cards -> all stats 0);
    # 03 = export really triggered (?export=1) -> feedback banner with the real
    #      row/byte count of the produced CSV;
    # 04 = the exported CSV content (captured after the batch from the file that
    #      was really downloaded to disk);
    # 05 = narrow board (?narrow=1 seam, 488x900);
    # 06 = new-card modal (pinned) with the r5 toolbar (export button in place);
    # 07/08 = board loading / error states (pinned).
    $shots = @(
      @{ name = "01-board-stats-live"; url = "http://127.0.0.1:$WebPort/?page=board&projectId=$r5ProjectId"; width = 1280; height = 800 },
      @{ name = "02-board-stats-empty"; url = "http://127.0.0.1:$WebPort/?page=board&projectId=$r5EmptyProjectId"; width = 1280; height = 800 },
      @{ name = "03-board-export-done"; url = "http://127.0.0.1:$WebPort/?page=board&projectId=$r5ProjectId&export=1"; width = 1280; height = 800 },
      @{ name = "05-board-stats-narrow"; url = "http://127.0.0.1:$WebPort/?page=board&projectId=$r5ProjectId&narrow=1"; width = 488; height = 900 },
      @{ name = "06-board-modal"; url = "http://127.0.0.1:$WebPort/?page=board&shot=board-modal"; width = 1280; height = 800 },
      @{ name = "07-board-loading"; url = "http://127.0.0.1:$WebPort/?page=board&shot=board-loading"; width = 1280; height = 800 },
      @{ name = "08-board-error"; url = "http://127.0.0.1:$WebPort/?page=board&shot=board-error"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r4") {
    # r4 projects/board pages: pinned states via ?page=projects|board&shot=*- seams.
    # 04 = live board BEFORE the move; 05 = AFTER (real PATCH between the two).
    # 06 = new-card modal; 07 = narrow board (488px, 1-col); 08 = projects tab live.
    # rework#1 additions: 09/10 = projects loading/error (U1-2); 11/12 = board
    # loading/error (U1-2); 13 = board tab direct entry (no project context);
    # 14 = new-card modal no-column warning (A2 defensive, pinned); 15 = board
    # no-columns alert banner (A2 defensive); 16 = A3 empty-state copy re-shot.
    # 17/18/19 = REWORK PROOF batch (created AFTER the main batch by the live
    # probe): real user path create-project -> board -> move, captured in
    # scripts\shot-rework.ps1 (this array keeps the reproducible matrix).
    $shots = @(
      @{ name = "01-project-empty";     url = "http://127.0.0.1:$WebPort/?page=projects&shot=project-empty"; width = 1280; height = 800 },
      @{ name = "02-project-list";      url = "http://127.0.0.1:$WebPort/?page=projects&shot=project-data";  width = 1280; height = 800 },
      @{ name = "03-project-modal";     url = "http://127.0.0.1:$WebPort/?page=projects&shot=project-modal"; width = 1280; height = 800 },
      @{ name = "04-board-live";        url = "http://127.0.0.1:$WebPort/?page=board"; width = 1280; height = 800 },
      @{ name = "05-board-moved";       url = "http://127.0.0.1:$WebPort/?page=board"; width = 1280; height = 800 },
      @{ name = "06-board-modal";       url = "http://127.0.0.1:$WebPort/?page=board&shot=board-modal"; width = 1280; height = 800 },
      @{ name = "07-board-narrow";      url = "http://127.0.0.1:$WebPort/?page=board&shot=board-narrow&narrow=1"; width = 488; height = 900 },
      @{ name = "08-projects-tab-live"; url = "http://127.0.0.1:$WebPort/?page=projects"; width = 1280; height = 800 },
      @{ name = "09-projects-loading";  url = "http://127.0.0.1:$WebPort/?page=projects&shot=project-loading"; width = 1280; height = 800 },
      @{ name = "10-projects-error";    url = "http://127.0.0.1:$WebPort/?page=projects&shot=project-error"; width = 1280; height = 800 },
      @{ name = "11-board-loading";     url = "http://127.0.0.1:$WebPort/?page=board&shot=board-loading"; width = 1280; height = 800 },
      @{ name = "12-board-error";       url = "http://127.0.0.1:$WebPort/?page=board&shot=board-error"; width = 1280; height = 800 },
      @{ name = "13-board-direct";      url = "http://127.0.0.1:$WebPort/?page=board"; width = 1280; height = 800 },
      @{ name = "14-board-no-columns-modal"; url = "http://127.0.0.1:$WebPort/?page=board&shot=board-no-columns-modal"; width = 1280; height = 800 },
      @{ name = "15-board-no-columns";  url = "http://127.0.0.1:$WebPort/?page=board&shot=board-no-columns"; width = 1280; height = 800 },
      @{ name = "16-project-empty-rework"; url = "http://127.0.0.1:$WebPort/?page=projects&shot=project-empty"; width = 1280; height = 800 }
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
    # delete any stale png first: a failed capture must never look like a success
    if (Test-Path $out) { Remove-Item $out -Force }
    $args = @(
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--screenshot=$out", "--window-size=$($s.width),$($s.height)",
      "--virtual-time-budget=6000", $s.url
    )
    # one-shot headless process: nothing resident stays behind (r1 lesson).
    # r5 fix: a page that triggers a file download (CSV export) writes the png
    # but keeps the browser alive forever -> capture by waiting for the png and
    # then killing the browser tree if it lingers (no resident headless browser).
    $proc = Start-Process -FilePath $browser -ArgumentList $args -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(45)
    while ((-not (Test-Path $out)) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 300 }
    $captured = Test-Path $out
    $exited = $proc.WaitForExit(5000)
    if (-not $exited) {
      & taskkill /PID $proc.Id /T /F 2>$null | Out-Null
      Write-Output "note: $($s.name) browser lingered after capture -> killed (headless cleanup)"
    } elseif ($proc.ExitCode -ne 0) {
      Write-Output "warn: $($s.name) exit=$($proc.ExitCode)"
    }
    if (-not $captured) { throw "screenshot failed: $out" }
    $kb = [math]::Round((Get-Item $out).Length / 1KB)
    Write-Output "shot ok: $($s.name).png ($kb KB)"

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

  # r5: CSV export evidence. Download the real export over HTTP with RAW bytes
  # (so the UTF-8 BOM survives), write it to disk as the landing evidence, then
  # render exactly those bytes as plain text in the headless browser for
  # 04-board-export-csv.png (a data: URL keeps the file bytes byte-identical).
  if ($Round -eq "r5") {
    if ($r5ProjectId) {
      try {
        $csvPath = Join-Path $UiDir "board-export.csv"
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile("http://127.0.0.1:$ApiPort/api/projects/$r5ProjectId/export.csv", $csvPath)
        $csvBytes = [System.IO.File]::ReadAllBytes($csvPath)
        $sha = (Get-FileHash -Path $csvPath -Algorithm SHA256).Hash
        Write-Output "downloaded r5 CSV -> $csvPath ($($csvBytes.Length) bytes, sha256=$sha)"
        $b64 = [System.Convert]::ToBase64String($csvBytes)
        $dataUrl = "data:text/plain;charset=utf-8;base64,$b64"
        $outCsv = Join-Path $UiDir "04-board-export-csv.png"
        if (Test-Path $outCsv) { Remove-Item $outCsv -Force }
        $csvArgs = @(
          "--headless=new", "--disable-gpu", "--hide-scrollbars",
          "--force-device-scale-factor=1",
          "--screenshot=$outCsv", "--window-size=1280,520",
          "--virtual-time-budget=6000", $dataUrl
        )
        $csvProc = Start-Process -FilePath $browser -ArgumentList $csvArgs -PassThru -WindowStyle Hidden
        $csvDeadline = (Get-Date).AddSeconds(45)
        while ((-not (Test-Path $outCsv)) -and ((Get-Date) -lt $csvDeadline)) { Start-Sleep -Milliseconds 300 }
        $csvCaptured = Test-Path $outCsv
        $csvExited = $csvProc.WaitForExit(5000)
        if (-not $csvExited) {
          & taskkill /PID $csvProc.Id /T /F 2>$null | Out-Null
          Write-Output "note: csv content browser lingered -> killed"
        }
        if ($csvCaptured) {
          Write-Output "shot ok: 04-board-export-csv.png ($([math]::Round((Get-Item $outCsv).Length / 1KB)) KB)"
        } else {
          throw "csv content screenshot failed: $outCsv"
        }
      } catch {
        Write-Output "warn: r5 CSV evidence failed ($($_.Exception.Message))"
      }
    } else {
      Write-Output "warn: no r5 project id - skip CSV evidence"
    }
  }

  # r2 rework#1: delete the seeded live todo so repeat runs stay deterministic
  # (list grows by exactly 1 per run otherwise).
  # r3: same for the seeded live todo; deleting the todo also cascades its auto
  # schedule away (link cleanup proved on every run).
  # r4: delete the whole seeded project (columns + cards cascade) and the badge
  # seed todo, so repeat runs stay deterministic.
  # r5: delete both seeded projects (by id - the script stays ASCII) and the two
  # seeded todos.
  if ($Round -eq "r7") {
    # r7: delete the seeded table (views + records cascade) so repeat runs stay
    # deterministic and the shell baseline still shows the first-use empty state.
    try {
      if ($r7TableId) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$r7TableId" -Method Delete | Out-Null
      }
      Write-Output "cleaned seeded r7 table(s) and views"
    } catch {
      Write-Output "warn: r7 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r6") {
    # r6: delete the seeded tables (fields + records cascade) so repeat runs stay
    # deterministic and the real db keeps no leftover rows.
    try {
      foreach ($tid6 in @($r6TableId, $r6EmptyTableId)) {
        if ($tid6) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$tid6" -Method Delete | Out-Null
        }
      }
      Write-Output "cleaned seeded r6 table(s)"
    } catch {
      Write-Output "warn: r6 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r5") {
    try {
      foreach ($pid5 in @($r5ProjectId, $r5EmptyProjectId)) {
        if ($pid5) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects/$pid5" -Method Delete | Out-Null
        }
      }
      foreach ($tid5 in @($r5TodoDoneId, $r5TodoOpenId)) {
        if ($tid5) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos/$tid5" -Method Delete | Out-Null
        }
      }
      Write-Output "cleaned seeded r5 project(s) and todo(s)"
    } catch {
      Write-Output "warn: r5 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r4") {
    try {
      $projs = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/projects" -Method Get
      $seededProjects = $projs.projects | Where-Object { $_.name -eq "r4 live shot project" -or $_.name -eq "r4 switch target project" }
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
  "shots"  { Invoke-Shots; if ($Round -ne "r1" -and $Round -ne "r2" -and $Round -ne "r3") { Invoke-ShellBaseline -BrowserPath (Find-Browser) } }
  "down"   { Stop-Servers }
  "status" {
    $a = Test-Port $ApiPort; $w = Test-Port $WebPort
    Write-Output "api:$ApiPort=$a web:$WebPort=$w"
  }
  "all"    {
    Start-Servers
    try {
      Invoke-Shots
      if ($Round -ne "r1" -and $Round -ne "r2" -and $Round -ne "r3") { Invoke-ShellBaseline -BrowserPath (Find-Browser) }
    } finally { Stop-Servers }
  }
}
