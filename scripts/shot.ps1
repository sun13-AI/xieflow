# XieFlow scripts/shot.ps1 - screenshot helper (ASCII only for PS 5.1 compatibility)
# Usage:
#   powershell -File scripts\shot.ps1 up              # start api + web dev servers
#   powershell -File scripts\shot.ps1 shots           # capture current round states
#   powershell -File scripts\shot.ps1 shots -Round r4 # capture r4 project/board states
#   powershell -File scripts\shot.ps1 shots -Round r5 # capture r5 board stats + CSV export states
#   powershell -File scripts\shot.ps1 shots -Round r6 # capture r6 bases grid states
#   powershell -File scripts\shot.ps1 shots -Round r7 # capture r7 views + CSV import states
#   powershell -File scripts\shot.ps1 shots -Round r8 # capture r8 document block editor states
#   powershell -File scripts\shot.ps1 shots -Round r9 # capture r9 document import/export/revise states
#   powershell -File scripts\shot.ps1 shots -Round r10 # capture r10 AI workbench chat/tool/artifact states
#   powershell -File scripts\shot.ps1 shots -Round r11 # capture r11 multi-turn context / artifact / diff-inline states
#   powershell -File scripts\shot.ps1 shots -Round r12 # capture r12 knowledge ingest / TF-IDF search / source refs states
#   powershell -File scripts\shot.ps1 shots -Round r11 -Shot 08-docs-diff-inline # rework#1: re-capture ONLY the diff-inline evidence (no other matrix/shell re-shot)
#   powershell -File scripts\shot.ps1 down            # stop servers
#   powershell -File scripts\shot.ps1 status          # show port status
#   powershell -File scripts\shot.ps1 all             # up + shots + down
#
# SHELL BASELINE (rework#1 B, ui-reviewer U1-1 3-round lesson): any -Round r4+ run
# of `shots` ALSO captures the tab shell active states into docs\ui\shell\. The shell
# is a render-layer change whenever its tabs change; the inherited pages' active
# states must have evidence in the SAME round, automatically. Keep the list in sync
# with App.tsx PageTab.
# r6: a sixth tab (bases) was added -> six active states.
# r8: a SEVENTH tab (docs) was added -> the baseline now captures seven active states.
# r9: Markdown import/export + AI revise states (real HTTP between captures).
# r10: an EIGHTH tab (AI workbench) was added -> the baseline now captures eight active states.
# r11: multi-turn context / artifact generators / 12-tool pagination states.
# r12: a NINTH tab (knowledge) was added -> the baseline now captures nine active states.
param(
  [Parameter(Position = 0)]
  [ValidateSet("up", "shots", "down", "status", "all")]
  [string]$Action = "status",
  [ValidateSet("r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12")]
  [string]$Round = "r1",
  [Parameter()]
  [string]$Shot = ""
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

# SHELL BASELINE: seven-tab shell active states (rework#1 B). Fired automatically on
# every r4+ shots run so a shell change can never leave inherited pages without
# evidence again (r2/r3/r4 three-round U1-1 lesson). Landing dir: docs\ui\shell\.
# r8: the SEVENTH tab (docs) was added -> all seven active states are re-shot.
# r10: the EIGHTH tab (chat / AI workbench) was added -> eight active states in one batch.
# r12: the NINTH tab (knowledge) was added -> nine active states in one batch.
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
    @{ page = "bases";     file = "bases-tab-active" },
    @{ page = "docs";      file = "docs-tab-active" },
    @{ page = "chat";      file = "chat-tab-active" },
    @{ page = "knowledge"; file = "knowledge-tab-active" }
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

  # r8: seed THREE real documents (one with all 10 block types via REAL api),
  # a short split-demo document, and one table for the r7 U2 import-dialog fix
  # evidence. All Chinese is \uXXXX escapes so this script stays pure ASCII.
  # Between shot 07 and 08 a REAL POST /api/blocks/:id/split happens, leaving a
  # real before/after trace (r3 B lesson: seeds must be split around the capture).
  $r8MainDocId = $null
  $r8ListDocId = $null
  $r8SplitDocId = $null
  $r8SplitBlockId = $null
  $r8TableId = $null
  if ($Round -eq "r8") {
    try {
      $r8Doc1 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r8 \u6587\u6863\u5757\u7f16\u8f91\u5668"}'))
      $r8Doc2 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"\u9879\u76ee\u5468\u62a5"}'))
      $r8Doc3 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"\u9700\u6c42\u8ba8\u8bba\u7eaa\u8981"}'))
      # main doc: default first block -> heading1 with real text (two REAL api calls)
      $r8First = (Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$($r8Doc1.id)/blocks" -Method Get).blocks[0]
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/blocks/$($r8First.id)/convert" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"type":"heading1"}')) | Out-Null
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/blocks/$($r8First.id)" -Method Patch `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"content":"\u534f\u6d41 M4 \u00b7 \u6587\u6863\u5757\u7f16\u8f91\u5668"}')) | Out-Null
      # append the remaining 13 blocks covering all 10 types
      $r8Bodies = @(
        '{"type":"paragraph","content":"\u5757\u7ea7\u6587\u6863\uff1a\u4e00\u4e2a\u5757\u662f\u4e00\u79cd\u5185\u5bb9\uff0c\u56de\u8f66\u62c6\u3001\u9000\u683c\u5408\u3001\u4e0a\u4e0b\u79fb\u3001\u7c7b\u578b\u968f\u65f6\u5207\u6362\u3002"}',
        '{"type":"heading2","content":"\u672c\u5468\u8fdb\u5c55"}',
        '{"type":"bullet","content":"schema v6\u2192v7\uff1adocuments / blocks \u4e24\u8868\u843d\u5e93"}',
        '{"type":"bullet","content":"\u5757\u7c7b\u578b\u5f15\u64ce\u5168\u90e8\u96c6\u4e2d\u5728 shared\uff0capi \u5c42\u96f6\u7c7b\u578b\u5206\u652f"}',
        '{"type":"heading3","content":"\u9a8c\u6536\u8981\u70b9"}',
        '{"type":"numbered","content":"\u5757\u987a\u5e8f\u62c6 / \u5408 / \u79fb\u52a8\u540e\u6301\u4e45\u5316\u4e14\u91cd\u5f00\u4e0d\u4e22"}',
        '{"type":"numbered","content":"\u6253\u5370\u9884\u89c8\u8d70 window.print() + \u6253\u5370\u6837\u5f0f\u8868"}',
        '{"type":"todo","content":{"text":"\u8865 6 \u5f20\u622a\u56fe\u77e9\u9635 + \u4e03 tab \u58f3\u57fa\u7ebf","checked":true}}',
        '{"type":"todo","content":{"text":"waizhuan \u590d\u9a8c\u53cc VERDICT","checked":false}}',
        '{"type":"quote","content":"\u65ad\u8a00\u53ea\u6da8\u4e0d\u7f29\uff0c\u5173\u952e\u884c\u4e3a\u505a\u53d8\u5f02\u7ea2\u76f8\u7559\u75d5\u3002"}',
        '{"type":"code","content":{"text":"POST /api/blocks/:id/split { caret }\nPOST /api/blocks/:id/merge","language":"http"}}',
        '{"type":"divider","content":""}',
        '{"type":"paragraph","content":"\u6253\u5370\u65f6\u53ea\u8f93\u51fa\u6587\u6863\u6b63\u6587\uff0c\u5de5\u5177\u680f\u4e0e\u5757\u64cd\u4f5c\u6309\u94ae\u7531 @media print \u9690\u85cf\u3002"}'
      )
      foreach ($r8b in $r8Bodies) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$($r8Doc1.id)/blocks" -Method Post `
          -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r8b)) | Out-Null
      }
      # list shot: doc2 gets two short blocks so the sidebar + a light editor show
      $r8L1 = (Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$($r8Doc2.id)/blocks" -Method Get).blocks[0]
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/blocks/$($r8L1.id)" -Method Patch `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"content":"\u672c\u5468\u5b8c\u6210\uff1a\u6587\u6863\u5757\u7f16\u8f91\u5668\u4e0a\u7ebf"}')) | Out-Null
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$($r8Doc2.id)/blocks" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"type":"todo","content":{"text":"\u4e0b\u5468\u6392\u671f\uff1a\u6587\u6863\u5bfc\u5165\u5bfc\u51fa","checked":false}}')) | Out-Null
      # split demo document: one paragraph with a known caret position
      $r8S1 = (Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$($r8Doc3.id)/blocks" -Method Get).blocks[0]
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/blocks/$($r8S1.id)" -Method Patch `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"content":"\u56de\u8f66\u62c6\u5757\u6f14\u793a"}')) | Out-Null
      # one table (8 default fields) for the r7 U2 import-dialog fix evidence shot
      $r8Table = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"name":"r8 U2 \u4fee\u590d\u9a8c\u8bc1\u8868"}'))
      $r8MainDocId = $r8Doc1.id
      $r8ListDocId = $r8Doc2.id
      $r8SplitDocId = $r8Doc3.id
      $r8SplitBlockId = $r8S1.id
      $r8TableId = $r8Table.id
      Write-Output "seeded r8 docs main=$r8MainDocId list=$r8ListDocId split=$r8SplitDocId (block=$r8SplitBlockId), u2 table=$r8TableId"
    } catch {
      Write-Output "warn: r8 seed failed ($($_.Exception.Message)) - live shots may show empty docs"
    }
  }

  # r10: two REAL conversations. A carries three real chats (create_todo + list +
  # list boards), B stays empty for the conversation-list state. One real todo is
  # created by the first chat and removed in cleanup; all text uses \uXXXX escapes.
  $r10ConvAId = $null
  $r10ConvBId = $null
  $r10CreatedTodoId = $null
  if ($Round -eq "r10") {
    try {
      $r10ConvA = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r10 \u5bf9\u8bdd\u6f14\u793a"}'))
      $r10ConvB = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r10 \u7a7a\u4f1a\u8bdd"}'))
      $r10ConvAId = $r10ConvA.id
      $r10ConvBId = $r10ConvB.id
      $r10Chat1 = '{"message":"\u5e2e\u6211\u65b0\u5efa\u4e00\u4e2a\u5f85\u529e\uff1ar10 \u622a\u56fe\u6f14\u793a\uff0c\u7136\u540e\u5217\u51fa\u6587\u6863"}'
      $r10First = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$r10ConvAId/chat" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r10Chat1))
      $r10CreatedTodoId = $r10First.toolCalls[0].data.todo.id
      Write-Output "seeded r10 conversations A=$r10ConvAId B=$r10ConvBId first-chat-tools=$($r10First.toolCalls.Count) todo=$r10CreatedTodoId"
    } catch {
      Write-Output "warn: r10 seed failed ($($_.Exception.Message)) - live shots may show empty chats"
    }
  }

  # r11: four REAL conversations. A = two-turn context chain (chat2 sent between
  # captures), B = empty list state, Html/Table = one generated artifact each.
  # All Chinese is \uXXXX escaped; this file stays pure ASCII for PS 5.1.
  $r11ConvAId = $null
  $r11ConvBId = $null
  $r11ConvHtmlId = $null
  $r11ConvTableId = $null
  $r11TodoIds = @()
  $r11DiffDocId = $null
  $r11DiffBlockId = $null
  if ($Round -eq "r11") {
    try {
      $r11A = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r11 \u591A\u8F6E\u5BF9\u8BDD\u6F14\u793A"}'))
      $r11B = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r11 \u7A7A\u4F1A\u8BDD"}'))
      $r11H = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r11 \u4EA7\u7269 HTML"}'))
      $r11T = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r11 \u4EA7\u7269\u8868\u683C"}'))
      $r11ConvAId = $r11A.id
      $r11ConvBId = $r11B.id
      $r11ConvHtmlId = $r11H.id
      $r11ConvTableId = $r11T.id
      $r11Chat1 = '{"message":"\u65B0\u5EFA\u5F85\u529E\uFF1Ar11 \u622A\u56FE\u5B9E\u4F53\uFF0C\u7136\u540E\u5217\u51FA\u6587\u6863"}'
      $r11First = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$r11ConvAId/chat" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r11Chat1))
      $r11TodoIds += $r11First.toolCalls[0].data.todo.id
      $r11Chat2 = '{"message":"\u518D\u5EFA\u4E00\u4E2A"}'
      $r11Second = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$r11ConvAId/chat" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r11Chat2))
      $r11TodoIds += $r11Second.toolCalls[0].data.todo.id
      $r11HtmlChat = '{"message":"\u76D8\u70B9\u5F85\u529E","artifactType":"html-report"}'
      $r11Html = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$r11ConvHtmlId/chat" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r11HtmlChat))
      $r11TableChat = '{"message":"\u76D8\u70B9\u5F85\u529E","artifactType":"markdown-table"}'
      $r11Table = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$r11ConvTableId/chat" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r11TableChat))
      Write-Output "seeded r11 conversations A=$r11ConvAId B=$r11ConvBId html=$r11ConvHtmlId table=$r11ConvTableId htmlType=$($r11Html.artifact.type) tableType=$($r11Table.artifact.type) secondResolution=$($r11Second.resolution.referenceKind)"
      # r11 UI rework#1 (U1): ONE real document + paragraph block as the target of
      # the docs-revise-diff seam. The panel calls the REAL /revise endpoint with
      # adopt=false (zero writes) and renders computeInlineDiff spans. Chinese is
      # \uXXXX escaped so this file stays pure ASCII for PS 5.1.
      $r11DiffDoc = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r11 diff \u884c\u5185\u9ad8\u4eae\u6f14\u793a"}'))
      $r11DiffDocId = $r11DiffDoc.id
      $r11DiffMd = '{"markdown":"# r11 diff \u8bc1\u636e\u6587\u6863\n\n\u8fd9\u662f\u4e00\u6bb5\u5f88\u957f\u7684\u6b63\u6587\u5185\u5bb9\uff0c\u7528\u6765\u9a8c\u8bc1\u7a84\u5c4f\u957f\u6587\u672c\u81ea\u52a8\u6491\u9ad8\u4e0d\u88ab\u88c1\u5207\u3002\u540e\u9762\u8fd8\u6709\u4e00\u53e5\u5197\u4f59\u8bf4\u660e\u3002"}'
      $r11DiffImported = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$r11DiffDocId/import.md" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r11DiffMd))
      $r11DiffBlockId = $r11DiffImported.blocks[1].id
      Write-Output "seeded r11 diff doc=$r11DiffDocId block=$r11DiffBlockId (paragraph for inline diff panel)"
    } catch {
      Write-Output "warn: r11 seed failed ($($_.Exception.Message)) - live shots may show empty chats/diff"
    }
  }

  # r12: three REAL knowledge docs via POST /api/knowledge/ingest (real TF-IDF data
  # for the search/source-highlight shots). All Chinese is \uXXXX escaped so this
  # file stays pure ASCII for PS 5.1. Docs are deleted after the matrix (cleanup).
  $r12DocIds = @()
  $r12Query = [uri]::EscapeDataString(([string][char]0x624b) + ([string][char]0x673a))
  if ($Round -eq "r12") {
    try {
      $r12Seeds = @(
        '{"title":"r12 \u79d1\u6280\u7a3f","sourceType":"text","content":"\u82f9\u679c \u624b\u673a \u624b\u673a \u624b\u673a \u624b\u673a"}',
        '{"title":"r12 \u679c\u56ed\u7a3f","sourceType":"text","content":"\u82f9\u679c \u6c34\u679c \u9999\u8549"}',
        '{"title":"r12 \u6570\u7801\u7a3f","sourceType":"text","content":"\u82f9\u679c \u624b\u673a \u5e73\u677f"}'
      )
      foreach ($seed in $r12Seeds) {
        $r12Ingested = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/knowledge/ingest" -Method Post `
          -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($seed))
        $r12DocIds += $r12Ingested.doc.id
      }
      Write-Output "seeded r12 knowledge docs=$($r12DocIds -join ',') query=$r12Query"
    } catch {
      Write-Output "warn: r12 seed failed ($($_.Exception.Message)) - live search shots may show no hits"
    }
  }

  # r9: three REAL documents. Doc A demonstrates import/export (import happens
  # between shots 01/02); doc B demonstrates discard (never written); doc C
  # demonstrates adoption (a REAL revise adopt=true happens between 04/05).
  # All Chinese is \uXXXX escaped; this file stays pure ASCII for PS 5.1.
  $r9DocAId = $null
  $r9DocBId = $null
  $r9DocCId = $null
  $r9BlockAId = $null
  $r9BlockBId = $null
  $r9BlockCId = $null
  $r9MdJson = '{"markdown":"# r9 \u5bfc\u5165\u6807\u9898\n\n\u8fd9\u662f\u4e00\u6bb5\u5f88\u957f\u7684\u6b63\u6587\u5185\u5bb9\uff0c\u7528\u6765\u9a8c\u8bc1\u7a84\u5c4f\u957f\u6587\u672c\u81ea\u52a8\u6491\u9ad8\u4e0d\u88ab\u88c1\u5207\u3002\u540e\u9762\u8fd8\u6709\u4e00\u53e5\u5197\u4f59\u8bf4\u660e\u3002\n\n- \u65e0\u5e8f\u8981\u70b9\u7532\n\n1. \u6709\u5e8f\u8981\u70b9\u4e00\n\n- [x] \u5df2\u5b8c\u6210\u7684\u5f85\u529e\n\n> \u5f15\u7528\u4e00\u53e5\u8bdd\n\n```ts\nlet x = 1;\n```\n\n---"}'
  if ($Round -eq "r9") {
    try {
      $r9DocA = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r9 \u5bfc\u5165\u5bfc\u51fa\u6f14\u793a"}'))
      $r9DocB = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r9 \u653e\u5f03\u4fee\u8ba2\u6f14\u793a"}'))
      $r9DocC = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(
        '{"title":"r9 \u91c7\u7eb3\u4fee\u8ba2\u6f14\u793a"}'))
      $r9DocAId = $r9DocA.id
      $r9DocBId = $r9DocB.id
      $r9DocCId = $r9DocC.id
      # B and C are imported at seed time; A stays at its default first block
      # until shot 01 is captured (so 01 preview never writes to that document).
      foreach ($r9DocId in @($r9DocBId, $r9DocCId)) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$r9DocId/import.md" -Method Post `
          -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r9MdJson)) | Out-Null
      }
      $r9BlockBId = (Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$r9DocBId/blocks" -Method Get).blocks[1].id
      $r9BlockCId = (Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$r9DocCId/blocks" -Method Get).blocks[1].id
      Write-Output "seeded r9 docs A=$r9DocAId B=$r9DocBId(block=$r9BlockBId) C=$r9DocCId(block=$r9BlockCId)"
    } catch {
      Write-Output "warn: r9 seed failed ($($_.Exception.Message)) - live shots may show empty docs"
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

  if ($Round -eq "r12") {
    # 01 = pinned first-use empty state; 02 = ingest dialog (seeded docs behind it);
    # 03 = real seeded doc list (3 ingested docs); 04 = real TF-IDF search results;
    # 05 = source-reference spotlight (same hits, highlight emphasis); 06 = narrow 488x900;
    # 07 = pinned error state. All search hits come from GET /api/knowledge/search.
    $r12Base = "http://127.0.0.1:$WebPort/?page=knowledge"
    $shots = @(
      @{ name = "01-knowledge-empty";    url = "$r12Base&shot=knowledge-empty"; width = 1280; height = 800 },
      @{ name = "02-ingest-dialog";      url = "$r12Base&shot=knowledge-ingest-dialog"; width = 1280; height = 800 },
      @{ name = "03-after-ingest";       url = "$r12Base"; width = 1280; height = 800 },
      @{ name = "04-search-results";     url = "$r12Base&q=$r12Query"; width = 1280; height = 800 },
      @{ name = "05-source-highlight";   url = "$r12Base&shot=knowledge-source-highlight&q=$r12Query"; width = 1280; height = 800 },
      @{ name = "06-narrow";             url = "$r12Base&q=$r12Query&narrow=1"; width = 488; height = 900 },
      @{ name = "07-error";              url = "$r12Base&shot=knowledge-error"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r11") {
    # 01 = two-turn conversation A (second chat sent between seed and capture);
    # 02 = same data + pinned context-hint note; 03/04 = real generated HTML/Markdown artifacts;
    # 05 = 12-tool catalogue page 2 with expanded tool-call receipts; 06 = narrow; 07 = error.
    # 08 = r11 UI rework#1 (U1): r9 U2 diff-inline evidence, REAL docs-revise-diff seam.
    $r11Base = "http://127.0.0.1:$WebPort/?page=chat"
    $shots = @(
      @{ name = "01-multiturn-chat"; url = "$r11Base&convId=$r11ConvAId"; width = 1280; height = 800 },
      @{ name = "02-context-hint";   url = "$r11Base&convId=$r11ConvAId&shot=chat-context"; width = 1280; height = 800 },
      @{ name = "03-artifact-html";  url = "$r11Base&convId=$r11ConvHtmlId&shot=chat-artifact-html"; width = 1280; height = 800 },
      @{ name = "04-artifact-table"; url = "$r11Base&convId=$r11ConvTableId&shot=chat-artifact-table"; width = 1280; height = 800 },
      @{ name = "05-tools-page2";    url = "$r11Base&convId=$r11ConvAId&shot=chat-tools2&toolsPage=2"; width = 1280; height = 800 },
      @{ name = "06-narrow";         url = "$r11Base&convId=$r11ConvAId&narrow=1"; width = 488; height = 900 },
      @{ name = "07-error";          url = "$r11Base&shot=chat-error"; width = 1280; height = 800 },
      @{ name = "08-docs-diff-inline"; url = "http://127.0.0.1:$WebPort/?page=docs&docId=$r11DiffDocId&shot=docs-revise-diff"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r10") {
    # 01 = pinned empty state (before any conversation is selected/created in the UI);
    # 02 = two REAL conversations, B selected (empty stream) -> list state;
    # 03 = conversation A with a REAL 3-tool-call chat stream;
    # 04 = tool-call bubbles expanded (shot=chat-tools), after a REAL second chat;
    # 05 = artifact preview expanded (shot=chat-artifact), after a REAL third chat;
    # 06 = narrow 488x900; 07 = pinned error state.
    $r10Base = "http://127.0.0.1:$WebPort/?page=chat"
    $shots = @(
      @{ name = "01-chat-empty";        url = "$r10Base&shot=chat-empty"; width = 1280; height = 800 },
      @{ name = "02-conversation-list"; url = "$r10Base&convId=$r10ConvBId"; width = 1280; height = 800 },
      @{ name = "03-chat-stream";       url = "$r10Base&convId=$r10ConvAId"; width = 1280; height = 800 },
      @{ name = "04-tool-call-bubbles"; url = "$r10Base&convId=$r10ConvAId&shot=chat-tools"; width = 1280; height = 800 },
      @{ name = "05-artifact-preview";  url = "$r10Base&convId=$r10ConvAId&shot=chat-artifact"; width = 1280; height = 800 },
      @{ name = "06-narrow";            url = "$r10Base&convId=$r10ConvAId&narrow=1"; width = 488; height = 900 },
      @{ name = "07-error";             url = "$r10Base&shot=chat-error"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r9") {
    # 01 = import preview dialog (REAL preview endpoint, document unchanged);
    # 02 = after a REAL import.md commit between 01/02 (blocks replaced);
    # 03 = export snapshot + a real .md file downloaded by Invoke-WebRequest;
    # 04 = AI revise diff (REAL revise endpoint, adopt=false, zero writes);
    # 05 = after a REAL revise adopt=true between 04/05 on document C;
    # 06 = discard state on document B (never written);
    # 07 = narrow 488x900 (r8 U2-1 auto-height + list markers fixed);
    # 08 = narrow import dialog (preview-only, no writes).
    $r9Base = "http://127.0.0.1:$WebPort/?page=docs"
    $shots = @(
      @{ name = "01-import-preview";   url = "$r9Base&docId=$r9DocAId&shot=docs-import-preview"; width = 1280; height = 800 },
      @{ name = "02-import-success";   url = "$r9Base&docId=$r9DocAId"; width = 1280; height = 800 },
      @{ name = "03-export-download";  url = "$r9Base&docId=$r9DocAId&shot=docs-export"; width = 1280; height = 800 },
      @{ name = "04-revise-diff";      url = "$r9Base&docId=$r9DocBId&shot=docs-revise-diff"; width = 1280; height = 800 },
      @{ name = "05-revise-adopted";   url = "$r9Base&docId=$r9DocCId&shot=docs-revise-adopted"; width = 1280; height = 800 },
      @{ name = "06-revise-discarded"; url = "$r9Base&docId=$r9DocBId&shot=docs-revise-discarded"; width = 1280; height = 800 },
      @{ name = "07-narrow-u2-fixes";  url = "$r9Base&docId=$r9DocAId&narrow=1"; width = 488; height = 900 },
      @{ name = "08-import-narrow";    url = "$r9Base&docId=$r9DocAId&narrow=1&shot=docs-import-preview"; width = 488; height = 900 }
    )
  } elseif ($Round -eq "r8") {
    # r8: document block editor states (all real api data; only empty/loading/error
    # and the type-switch / print overlays are pinned seams).
    # 01 = document empty state (pinned first-use guidance);
    # 02 = document list (3 REAL docs in the sidebar + a light editor);
    # 03 = editor with all 10 REAL block types;
    # 04 = block type switch dropdown open (canConvertBlockType disables divider);
    # 05 = print preview sheet (window.print + @media print stylesheet);
    # 06 = narrow 488x900; 07/08 = REAL split before/after (POST between captures);
    # 09/10 = loading / error states; 11 = r7 U2 import-dialog fixes evidence.
    $r8Base = "http://127.0.0.1:$WebPort/?page=docs"
    $shots = @(
      @{ name = "01-docs-empty";          url = "$r8Base&shot=docs-empty"; width = 1280; height = 800 },
      @{ name = "02-docs-list";           url = "$r8Base&docId=$r8ListDocId"; width = 1280; height = 800 },
      @{ name = "03-docs-editor";         url = "$r8Base&docId=$r8MainDocId"; width = 1280; height = 800 },
      @{ name = "04-docs-type-switch";    url = "$r8Base&docId=$r8MainDocId&shot=docs-type-switch"; width = 1280; height = 800 },
      @{ name = "05-docs-print-preview";  url = "$r8Base&docId=$r8MainDocId&shot=docs-print"; width = 1280; height = 900 },
      @{ name = "06-docs-narrow";         url = "$r8Base&docId=$r8MainDocId&narrow=1"; width = 488; height = 900 },
      @{ name = "07-docs-split-before";   url = "$r8Base&docId=$r8SplitDocId"; width = 1280; height = 800 },
      @{ name = "08-docs-split-after";    url = "$r8Base&docId=$r8SplitDocId"; width = 1280; height = 800 },
      @{ name = "09-docs-loading";        url = "$r8Base&shot=docs-loading"; width = 1280; height = 800 },
      @{ name = "10-docs-error";          url = "$r8Base&shot=docs-error"; width = 1280; height = 800 },
      @{ name = "11-import-u2-fixes";     url = "http://127.0.0.1:$WebPort/?page=bases&tableId=$r8TableId&shot=bases-import-errors"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r7") {
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
    # -Shot <name> re-captures ONE matrix item only (rework#1 U1: supplement 08
    # without re-shooting the already-accepted 7 + shell 8 whose hashes are indexed).
    if ($Shot -ne "" -and $s.name -ne $Shot) { continue }
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

    # r8 (r3 B lesson): between 07 (before) and 08 (after) a REAL split happens
    # over POST /api/blocks/:id/split. 07 shows one paragraph; 08 shows two blocks
    # with consecutive positions. Hashes of 07/08 must differ.
    if ($Round -eq "r8" -and $s.name -eq "07-docs-split-before") {
      if ($r8SplitBlockId) {
        try {
          $splitRes = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/blocks/$r8SplitBlockId/split" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{"caret":4}'))
          Write-Output "r8 real split: before=$($splitRes.before.content.text) after=$($splitRes.after.content.text) blocks=$($splitRes.blocks.Count)"
        } catch {
          Write-Output "warn: split between 07/08 failed ($($_.Exception.Message)) - 08 may equal 07"
        }
      } else {
        Write-Output "warn: no r8 split block id - 08 may equal 07"
      }
    }

    # r11: the two-turn anaphora chat is seeded before capture 01 (verified real
    # HTTP), so 01 and 02 show the same genuine 2-round data; 02 adds only the
    # pinned context-hint note. No artificial between-capture state change.

    # r10 (r3 B lesson): real HTTP between captures so 03/04/05 are different states.
    # 03 -> 04: a REAL second chat with three read-only tool calls (boards/tables).
    if ($Round -eq "r10" -and $s.name -eq "03-chat-stream") {
      if ($r10ConvAId) {
        try {
          $r10Chat2 = '{"message":"\u5217\u51fa\u9879\u76ee\u3001\u770b\u677f\u548c\u8868\u683c"}'
          $r10Second = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$r10ConvAId/chat" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r10Chat2))
          Write-Output "r10 real second chat: tools=$($r10Second.toolCalls.Count) intent=$($r10Second.intent)"
        } catch {
          Write-Output "warn: r10 second chat between 03/04 failed ($($_.Exception.Message))"
        }
      }
    }
    # 04 -> 05: a REAL third chat with two read-only tool calls (new artifact).
    if ($Round -eq "r10" -and $s.name -eq "04-tool-call-bubbles") {
      if ($r10ConvAId) {
        try {
          $r10Chat3 = '{"message":"\u76d8\u70b9\u5f85\u529e\u548c\u6587\u6863"}'
          $r10Third = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$r10ConvAId/chat" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r10Chat3))
          Write-Output "r10 real third chat: tools=$($r10Third.toolCalls.Count) intent=$($r10Third.intent)"
        } catch {
          Write-Output "warn: r10 third chat between 04/05 failed ($($_.Exception.Message))"
        }
      }
    }

    # r9 (r3 B lesson): real HTTP side effects between capture points.
    # 01 -> 02: Markdown import commit (zero half state); record block id for revise.
    if ($Round -eq "r9" -and $s.name -eq "01-import-preview") {
      if ($r9DocAId) {
        try {
          $r9Imported = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$r9DocAId/import.md" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r9MdJson))
          $r9BlockAId = $r9Imported.blocks[1].id
          Write-Output "r9 real import: imported=$($r9Imported.imported) doc=$r9DocAId block=$r9BlockAId"
        } catch {
          Write-Output "warn: r9 import between 01/02 failed ($($_.Exception.Message))"
        }
      }
    }
    # 02 -> 03: download the real .md bytes to docs/ui/r9/ as landing evidence.
    if ($Round -eq "r9" -and $s.name -eq "02-import-success") {
      if ($r9DocAId) {
        try {
          $r9MdPath = Join-Path $UiDir "r9-export-evidence.md"
          Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/api/documents/$r9DocAId/export.md" -OutFile $r9MdPath
          Write-Output "r9 real export: $((Get-Item $r9MdPath).Length) bytes -> r9-export-evidence.md"
        } catch {
          Write-Output "warn: r9 export download failed ($($_.Exception.Message))"
        }
      }
    }
    # 04 -> 05: real AI revision ADOPT on document C; doc B stays untouched (discard path).
    if ($Round -eq "r9" -and $s.name -eq "04-revise-diff") {
      if ($r9DocCId -and $r9BlockCId) {
        try {
          $r9ReviseBody = '{"instruction":"\u7cbe\u7b80","adopt":true}'
          $r9RevRes = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$r9DocCId/blocks/$r9BlockCId/revise" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r9ReviseBody))
          Write-Output "r9 real revise: applied=$($r9RevRes.applied) provider=$($r9RevRes.provider) block=$r9BlockCId"
        } catch {
          Write-Output "warn: r9 adopt between 04/05 failed ($($_.Exception.Message))"
        }
      }
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
  if ($Round -eq "r12") {
    # r12: delete the three seeded knowledge docs (chunks cascade) so repeat runs
    # stay deterministic and the shell baseline shows first-use empty knowledge.
    try {
      foreach ($kid12 in $r12DocIds) {
        if ($kid12) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/knowledge/docs/$kid12" -Method Delete | Out-Null
        }
      }
      Write-Output "cleaned seeded r12 knowledge docs"
    } catch {
      Write-Output "warn: r12 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r11") {
    # r11: delete four seeded conversations (messages + artifacts cascade) and the
    # two todos really created by the two chats so repeat runs stay deterministic.
    try {
      foreach ($cid11 in @($r11ConvAId, $r11ConvBId, $r11ConvHtmlId, $r11ConvTableId)) {
        if ($cid11) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$cid11" -Method Delete | Out-Null
        }
      }
      foreach ($tid11 in $r11TodoIds) {
        if ($tid11) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos/$tid11" -Method Delete | Out-Null
        }
      }
      if ($r11DiffDocId) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$r11DiffDocId" -Method Delete | Out-Null
      }
      Write-Output "cleaned seeded r11 conversations, created todos and diff doc"
    } catch {
      Write-Output "warn: r11 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r10") {
    # r10: delete the two seeded conversations (messages + artifacts cascade) and the
    # todo really created by the first chat so repeat runs stay deterministic.
    try {
      foreach ($cid10 in @($r10ConvAId, $r10ConvBId)) {
        if ($cid10) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$cid10" -Method Delete | Out-Null
        }
      }
      if ($r10CreatedTodoId) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/todos/$r10CreatedTodoId" -Method Delete | Out-Null
      }
      Write-Output "cleaned seeded r10 conversations and created todo"
    } catch {
      Write-Output "warn: r10 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r9") {
    # r9: delete the three seeded documents so repeat runs stay deterministic and
    # the shell baseline still shows the first-use empty docs state.
    try {
      foreach ($did9 in @($r9DocAId, $r9DocBId, $r9DocCId)) {
        if ($did9) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$did9" -Method Delete | Out-Null
        }
      }
      Write-Output "cleaned seeded r9 documents"
    } catch {
      Write-Output "warn: r9 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r8") {
    # r8: delete the seeded documents + table so repeat runs stay deterministic
    # and the shell baseline still shows the first-use empty docs state.
    try {
      foreach ($did8 in @($r8MainDocId, $r8ListDocId, $r8SplitDocId)) {
        if ($did8) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$did8" -Method Delete | Out-Null
        }
      }
      if ($r8TableId) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/tables/$r8TableId" -Method Delete | Out-Null
      }
      Write-Output "cleaned seeded r8 documents and u2 table"
    } catch {
      Write-Output "warn: r8 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r7") {
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
  "shots"  { Invoke-Shots; if (-not $Shot -and $Round -ne "r1" -and $Round -ne "r2" -and $Round -ne "r3") { Invoke-ShellBaseline -BrowserPath (Find-Browser) } }
  "down"   { Stop-Servers }
  "status" {
    $a = Test-Port $ApiPort; $w = Test-Port $WebPort
    Write-Output "api:$ApiPort=$a web:$WebPort=$w"
  }
  "all"    {
    Start-Servers
    try {
      Invoke-Shots
      if (-not $Shot -and $Round -ne "r1" -and $Round -ne "r2" -and $Round -ne "r3") { Invoke-ShellBaseline -BrowserPath (Find-Browser) }
    } finally { Stop-Servers }
  }
}
