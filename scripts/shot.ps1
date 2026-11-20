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
#   powershell -File scripts\shot.ps1 shots -Round r13 # capture r13 RAG chat / citation cards / traceback / no-hit states
#   powershell -File scripts\shot.ps1 shots -Round r14 # capture r14 mindmap markdown / tree / collapse states
#   powershell -File scripts\shot.ps1 shots -Round r15 # capture r15 whiteboard canvas / notes / drag / ai / export states
#   powershell -File scripts\shot.ps1 shots -Round r16 # capture r16 approval form / todo / timeline / approved states
#   powershell -File scripts\shot.ps1 shots -Round r17 # capture r17 assets / transactions / unit task tree states
#   powershell -File scripts\shot.ps1 shots -Round r18 # capture r18 login / register / logout / 401 / mode switch states
#   powershell -File scripts\shot.ps1 shots -Round r19 # capture r19 multi-device sync card / conflict modal states
#   powershell -File scripts\shot.ps1 shots -Round r20 # capture r20 PWA / online-offline / replay / mobile 390px states
#   powershell -File scripts\shot.ps1 shots -Round r22 # capture r22 narrow-seam matrix + 14-tab shell baseline
#     (01/02 true-390px shots are CDP device-metrics captures, r20 06 precedent: headless
#      --window-size clamps narrow widths to 500px; see docs/ui/r22/README.md)
#   powershell -File scripts\shot.ps1 shots -Round r23 # capture r23 org matrix + 15-tab shell baseline
#   powershell -File scripts\shot.ps1 shots -Round r25 # capture r25 actor-badge / dept-filter / manual-hint matrix + 15-tab shell baseline
#   powershell -File scripts\shot.ps1 shots -Round r26 # capture r26 notification center matrix + 16-tab shell baseline
#   powershell -File scripts\shot.ps1 shots -Round r27 # capture r27 report center matrix + 17-tab shell baseline
#   powershell -File scripts\shot.ps1 shots -Round r28 # capture r28 meeting management matrix + 18-tab shell baseline
#   powershell -File scripts\shot.ps1 shots -Round r29 # capture r29 version history / recycle bin matrix + 18-tab shell baseline
#   powershell -File scripts\shot.ps1 shots -Round r24 # capture r24 member-picker matrix + 15-tab shell baseline
#   powershell -File scripts\shot.ps1 shots -Round r11 -Shot 08-docs-diff-inline # rework#1: re-capture ONLY the diff-inline evidence (no other matrix/shell re-shot)
#   powershell -File scripts\shot.ps1 shots -Round r26 -Shot 09-notif-deeplink-target # r26 rework#2: seed 3 pending approvals, CDP-click the SECOND notification, capture ONLY 09 (no other matrix/shell re-shot)
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
# r14: a TENTH tab (mindmap) was added -> the baseline now captures ten active states.
# r15: an ELEVENTH tab (whiteboard) was added -> the baseline now captures eleven active states.
# r16: a TWELFTH tab (approval) was added -> the baseline now captures twelve active states.
# r17: TWO tabs (assets + unit-tasks) were added -> the baseline now captures fourteen active states.
param(
  [Parameter(Position = 0)]
  [ValidateSet("up", "shots", "down", "status", "all")]
  [string]$Action = "status",
  [ValidateSet("r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15", "r16", "r17", "r18", "r19", "r20", "r21", "r22", "r23", "r24", "r25", "r26", "r27", "r28", "r29", "r30")]
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
# r14: the TENTH tab (mindmap) was added -> ten active states in one batch.
# r15: the ELEVENTH tab (whiteboard) was added -> eleven active states in one batch.
# r16: the TWELFTH tab (approval) was added -> twelve active states in one batch.
# r17: the THIRTEENTH/FOURTEENTH tabs (assets + unit-tasks) were added -> fourteen active states.
# r23: the FIFTEENTH tab (org) was added -> fifteen active states in one batch.
# r26: the SIXTEENTH tab (notifications) was added -> sixteen active states in one batch.
# r27: the SEVENTEENTH tab (reports) was added -> seventeen active states in one batch.
# r28: the EIGHTEENTH tab (meetings) was added -> eighteen active states in one batch.
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
    @{ page = "knowledge"; file = "knowledge-tab-active" },
    @{ page = "mindmap";   file = "mindmap-tab-active" },
    @{ page = "whiteboard"; file = "whiteboard-tab-active" },
    @{ page = "approval";   file = "approval-tab-active" },
    @{ page = "assets";     file = "assets-tab-active" },
    @{ page = "unit-tasks"; file = "unit-tasks-tab-active" },
    @{ page = "org";       file = "org-tab-active" },
    @{ page = "notifications"; file = "notifications-tab-active" },
    @{ page = "reports";       file = "reports-tab-active" },
    @{ page = "meetings";      file = "meetings-tab-active" }
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

  # r14: REAL mindmap via HTTP. The map holds a real Markdown source so the edit /
  # tree / collapse shots render the shared-parsed tree of a persisted record.
  # All Chinese is \uXXXX escaped (ASCII-only file, PS 5.1 safe).
  $r14MapId = 0
  if ($Round -eq "r14") {
    try {
      $r14TitleBytes = [System.Text.Encoding]::UTF8.GetBytes('{"title":"r14 \u5bfc\u56fe\u6f14\u793a"}')
      $r14Map = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/mindmaps" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r14TitleBytes
      $r14MapId = $r14Map.id
      $r14MdBytes = [System.Text.Encoding]::UTF8.GetBytes('{"contentMarkdown":"# \u4ea7\u54c1\u8def\u7ebf\u56fe\n\n## M7 \u5bfc\u56fe\n- \u5de6\u4fa7 Markdown\n  - \u5b9e\u65f6\u89e3\u6790\n- \u53f3\u4fa7\u6811\u89c6\u56fe\n  1. \u8282\u70b9\u6298\u53e0"}')
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/mindmaps/$r14MapId/content" -Method Put `
        -ContentType "application/json; charset=utf-8" -Body $r14MdBytes | Out-Null
      Write-Output "seeded r14 mindmap=$r14MapId"
    } catch {
      Write-Output "warn: r14 seed failed ($($_.Exception.Message)) - live mindmap shots may show empty state"
    }
  }

  # r15: REAL whiteboards + notes + ai-create via HTTP. Shot 02/03 share one real
  # board (03 gets a real POST /items/move between captures); 04 uses a second
  # board filled by the mock ai-create endpoint. All Chinese is \uXXXX escaped.
  $r15BoardId = 0
  $r15AiBoardId = 0
  $r15NoteIds = @()
  if ($Round -eq "r15") {
    try {
      $r15TitleBytes = [System.Text.Encoding]::UTF8.GetBytes('{"title":"r15 \u767d\u677f\u6f14\u793a"}')
      $r15Board = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/whiteboards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r15TitleBytes
      $r15BoardId = $r15Board.id
      $r15Notes = @(
        '{"type":"note","x":80,"y":80,"content":"\u4ea7\u54c1\u65b9\u5411"}',
        '{"type":"note","x":340,"y":80,"content":"\u672c\u5468\u4efb\u52a1"}',
        '{"type":"note","x":600,"y":80,"content":"\u98ce\u9669\u4e0e\u4f9d\u8d56"}'
      )
      foreach ($seed15 in $r15Notes) {
        $note15 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/whiteboards/$r15BoardId/items" -Method Post `
          -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($seed15))
        $r15NoteIds += $note15.id
      }
      $r15AiTitleBytes = [System.Text.Encoding]::UTF8.GetBytes('{"title":"r15 AI \u5efa\u677f"}')
      $r15AiBoard = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/whiteboards" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r15AiTitleBytes
      $r15AiBoardId = $r15AiBoard.id
      $r15AiBytes = [System.Text.Encoding]::UTF8.GetBytes('{"theme":"\u5b63\u5ea6\u590d\u76d8"}')
      $r15Ai = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/whiteboards/$r15AiBoardId/ai-create" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r15AiBytes
      Write-Output "seeded r15 board=$r15BoardId notes=$($r15NoteIds -join ',') aiBoard=$r15AiBoardId aiCount=$($r15Ai.count)"
    } catch {
      Write-Output "warn: r15 seed failed ($($_.Exception.Message)) - live whiteboard shots may show empty state"
    }
  }

  # r16: REAL approvals via HTTP. A1 stays pending for the todo list; A2 is
  # submitted at seed, then delegated (03->04) and approved (04->05) between
  # captures, so the timeline screenshots reflect real state-machine transitions.
  # All Chinese is \uXXXX escaped (ASCII-only file, PS 5.1 safe).
  $r16A1Id = 0
  $r16A2Id = 0
  if ($Round -eq "r16") {
    try {
      $r16A1Body = [System.Text.Encoding]::UTF8.GetBytes('{"title":"r16 \u8bf7\u5047\u5ba1\u6279","type":"leave","applicantId":"alice","currentAssignee":"bob","cc":["dave"]}')
      $r16A1 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r16A1Body
      $r16A1Id = $r16A1.id
      $r16A2Body = [System.Text.Encoding]::UTF8.GetBytes('{"title":"r16 \u62a5\u9500\u5ba1\u6279","type":"expense","applicantId":"alice","currentAssignee":"bob","cc":["erin"]}')
      $r16A2 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r16A2Body
      $r16A2Id = $r16A2.id
      $r16Submit = [System.Text.Encoding]::UTF8.GetBytes('{"actor":"alice","comment":"\u8bf7\u5ba1\u6279"}')
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals/$r16A2Id/submit" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r16Submit | Out-Null
      Write-Output "seeded r16 approvals A1=$r16A1Id A2=$r16A2Id (A2 submitted)"
    } catch {
      Write-Output "warn: r16 seed failed ($($_.Exception.Message)) - live approval shots may show empty state"
    }
  }

  # r17: REAL assets + unit tasks via HTTP. One asset is inbounded/outbounded
  # between captures so the timeline reflects real ledger transactions; one
  # parent/child task pair is seeded, then the child transitions to done.
  # All Chinese is \uXXXX escaped (ASCII-only file, PS 5.1 safe).
  $r17AssetId = 0
  $r17TaskId = 0
  $r17ChildId = 0
  if ($Round -eq "r17") {
    try {
      $r17AssetBody = [System.Text.Encoding]::UTF8.GetBytes('{"name":"r17 \u6295\u5f71\u4eea","category":"equipment","quantity":5,"unit":"\u53f0","location":"\u4ed3\u5e93A","custodian":"\u5f20\u4e09"}')
      $r17Asset = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/assets" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r17AssetBody
      $r17AssetId = $r17Asset.id
      $r17TaskBody = [System.Text.Encoding]::UTF8.GetBytes('{"title":"r17 \u5e74\u5ea6\u5ba1\u8ba1","assigneeUnit":"\u5ba1\u8ba1\u90e8","dueDate":"2026-12-31"}')
      $r17Task = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/unit-tasks" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r17TaskBody
      $r17TaskId = $r17Task.id
      $r17ChildBody = [System.Text.Encoding]::UTF8.GetBytes('{"title":"r17 \u5ba1\u8ba1\u5b50\u9879","assigneeUnit":"\u5ba1\u8ba1\u4e8c\u7ec4","parentId":' + $r17TaskId + '}')
      $r17Child = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/unit-tasks" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r17ChildBody
      $r17ChildId = $r17Child.id
      Write-Output "seeded r17 asset=$r17AssetId task=$r17TaskId"
    } catch {
      Write-Output "warn: r17 seed failed ($($_.Exception.Message)) - live shots may show empty state"
    }
  }

  # r18: REAL account chain over HTTP (register -> login -> guard -> logout).
  # Token stays in this process only; no key file, no external IdP.
  $r18UserId = 0
  $r18Token = ""
  $r18CleanupToken = ""
  if ($Round -eq "r18") {
    try {
      $r18AuthBody = [System.Text.Encoding]::UTF8.GetBytes('{"username":"r18_shot_user","password":"r18-Strong-Pass-2026"}')
      $r18Reg = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/auth/register" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r18AuthBody
      $r18UserId = $r18Reg.user.id
      $r18Login = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/auth/login" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r18AuthBody
      $r18Token = $r18Login.token
      $r18Guard = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/auth/guard" -Method Get `
        -Headers @{ Authorization = "Bearer $r18Token" }
      $r18LogoutBody = [System.Text.Encoding]::UTF8.GetBytes('{"token":"' + $r18Token + '"}')
      $r18Logout = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/auth/logout" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r18LogoutBody
      # fresh token for later cleanup (logout invalidated the first one)
      $r18CleanupLogin = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/auth/login" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r18AuthBody
      $r18CleanupToken = $r18CleanupLogin.token
      Write-Output "r18 real chain: register=$r18UserId guard=$($r18Guard.ok) logout=$($r18Logout.cleared)"
    } catch {
      Write-Output "warn: r18 seed failed ($($_.Exception.Message)) - auth shots are pinned states"
    }
  }

  # r13: REAL knowledge docs + RAG conversations via HTTP. The hit and no-hit
  # chats are seeded before capture so every citation card shows real citations;
  # the jump shot uses the cited doc/chunk ids from the chat response itself.
  # All Chinese is \uXXXX escaped (ASCII-only file, PS 5.1 safe).
  $r13DocIds = @()
  $r13ConvIds = @()
  $r13CiteDoc = 0
  $r13CiteChunk = 0
  if ($Round -eq "r13") {
    try {
      $r13Seeds = @(
        '{"title":"r13 \u79d1\u6280\u7a3f","sourceType":"text","content":"\u82f9\u679c \u624b\u673a \u624b\u673a \u624b\u673a \u5e73\u677f"}',
        '{"title":"r13 \u679c\u56ed\u7a3f","sourceType":"text","content":"\u82f9\u679c \u9999\u8549 \u6c34\u679c"}'
      )
      foreach ($seed13 in $r13Seeds) {
        $r13Ingested = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/knowledge/ingest" -Method Post `
          -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($seed13))
        $r13DocIds += $r13Ingested.doc.id
      }
      $r13TitleBytes = [System.Text.Encoding]::UTF8.GetBytes('{"title":"r13 RAG \u4f1a\u8bdd"}')
      $r13HitConv = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r13TitleBytes
      $r13ConvIds += $r13HitConv.id
      $r13HitBytes = [System.Text.Encoding]::UTF8.GetBytes('{"message":"\u6839\u636e\u77e5\u8bc6\u5e93\uff0c\u82f9\u679c \u624b\u673a"}')
      $r13Hit = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$($r13HitConv.id)/chat" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r13HitBytes
      if ($r13Hit.citations.Count -gt 0) {
        $r13CiteDoc = $r13Hit.citations[0].docId
        $r13CiteChunk = $r13Hit.citations[0].chunkId
      }
      $r13NoHitConv = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r13TitleBytes
      $r13ConvIds += $r13NoHitConv.id
      $r13NoHitBytes = [System.Text.Encoding]::UTF8.GetBytes('{"message":"\u6839\u636e\u77e5\u8bc6\u5e93\uff0cqqqzzz\u4e0d\u5b58\u5728"}')
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$($r13NoHitConv.id)/chat" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $r13NoHitBytes | Out-Null
      Write-Output "seeded r13 docs=$($r13DocIds -join ',') convs=$($r13ConvIds -join ',') cited=$r13CiteDoc/$r13CiteChunk citations=$($r13Hit.citations.Count)"
    } catch {
      Write-Output "warn: r13 seed failed ($($_.Exception.Message)) - live RAG shots may show no citations"
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

  # r26 rework#2 (UI U1-1): real deep-link target evidence. Seed three pending
  # approvals with DIFFERENT assignees, refresh notifications, then shot 09 uses a
  # one-shot headless CDP browser to really click the SECOND notification row
  # (refId=2) and capture the approval target page. Seeded rows are deleted below.
  # All literals stay ASCII (PS 5.1 safe); Chinese is produced by the api templates.
  $r26Fix2ApprovalIds = @()
  $r26Fix2NotifIds = @()
  if ($Round -eq "r26" -and ($Shot -eq "" -or $Shot -eq "09-notif-deeplink-target")) {
    try {
      $r26Fix2Seeds = @(
        @{ title = "r26fix2-A-first";   assignee = "fixerYi" },
        @{ title = "r26fix2-B-target";  assignee = "fixerBing" },
        @{ title = "r26fix2-C-third";   assignee = "fixerDing" }
      )
      foreach ($seed in $r26Fix2Seeds) {
        $apBody = [System.Text.Encoding]::UTF8.GetBytes(
          ('{"title":"' + $seed.title + '","type":"leave","applicantId":"r26fix2-yanfa","currentAssignee":"' + $seed.assignee + '","cc":[]}')
        )
        $ap26 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals" -Method Post `
          -ContentType "application/json; charset=utf-8" -Body $apBody
        $r26Fix2ApprovalIds += $ap26.id
        $submit26 = [System.Text.Encoding]::UTF8.GetBytes('{"actor":"r26fix2-yanfa","comment":"pending for deep-link shot"}')
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals/$($ap26.id)/submit" -Method Post `
          -ContentType "application/json; charset=utf-8" -Body $submit26 | Out-Null
      }
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/notifications/refresh" -Method Post `
        -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes('{}')) | Out-Null
      $notifList26 = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/notifications?pageSize=100" -Method Get
      $r26Fix2NotifIds = @($notifList26.notifications | Where-Object { $_.title -like "*r26fix2-*" } | ForEach-Object { $_.id })
      Write-Output "r26 rework#2 seed: approvals=$($r26Fix2ApprovalIds -join ',') notifications=$($r26Fix2NotifIds -join ',')"
    } catch {
      Write-Output "warn: r26 rework#2 seed failed ($($_.Exception.Message)) - 09 deep-link shot may miss target"
    }
  }

  if ($Round -eq "r30") {
    # r30: all matrix states are deterministic ?shot= pins over the real bases page;
    # no HTTP seeding needed (computed values are locked by e2e + audit).
    Write-Output "r30: formula matrix uses deterministic pins (no seed)"
  } elseif ($Round -eq "r29") {
    # r29: version history + recycle bin matrix. Seed real documents/versions over HTTP;
    # every probe is permanently deleted in the cleanup block below (user data untouched).
    $r29Stamp = "r29-shot-" + (Get-Date -Format "yyyyMMddHHmmss")
    $r29BaseApi = "http://127.0.0.1:$ApiPort/api/documents"
    $r29MainId = 0
    $r29EmptyId = 0
    $r29TrashId = 0
    $emptyJson = [System.Text.Encoding]::UTF8.GetBytes('{}')
    try {
      $mainBody = [System.Text.Encoding]::UTF8.GetBytes('{"title":"' + $r29Stamp + '-version-history"}')
      $mainDoc = Invoke-RestMethod -Uri $r29BaseApi -Method Post -ContentType "application/json; charset=utf-8" -Body $mainBody
      $r29MainId = $mainDoc.id
      $emptyBody = [System.Text.Encoding]::UTF8.GetBytes('{"title":"' + $r29Stamp + '-no-versions"}')
      $r29EmptyId = (Invoke-RestMethod -Uri $r29BaseApi -Method Post -ContentType "application/json; charset=utf-8" -Body $emptyBody).id
      $trashBody = [System.Text.Encoding]::UTF8.GetBytes('{"title":"' + $r29Stamp + '-trashed"}')
      $r29TrashId = (Invoke-RestMethod -Uri $r29BaseApi -Method Post -ContentType "application/json; charset=utf-8" -Body $trashBody).id

      $md1 = [System.Text.Encoding]::UTF8.GetBytes('{"markdown":"# r29 version one\n\nfirst paragraph\n\nsecond paragraph"}')
      $md2 = [System.Text.Encoding]::UTF8.GetBytes('{"markdown":"# r29 version two\n\nfirst paragraph changed\n\nsecond paragraph\n\nthird paragraph"}')
      $md3 = [System.Text.Encoding]::UTF8.GetBytes('{"markdown":"# r29 version three\n\nfirst paragraph changed again\n\nsecond paragraph"}')
      foreach ($md in @($md1, $md2, $md3)) {
        Invoke-RestMethod -Uri "$r29BaseApi/$r29MainId/import.md" -Method Post -ContentType "application/json; charset=utf-8" -Body $md | Out-Null
        Invoke-RestMethod -Uri "$r29BaseApi/$r29MainId/versions" -Method Post -ContentType "application/json; charset=utf-8" -Body $emptyJson | Out-Null
      }
      # real restore: generates v4, keeps v1-v3 (also locked by e2e + HTTP audit)
      Invoke-RestMethod -Uri "$r29BaseApi/$r29MainId/versions/1/restore" -Method Post -ContentType "application/json; charset=utf-8" -Body $emptyJson | Out-Null
      # put the third probe into the recycle bin via the real soft-delete route
      Invoke-RestMethod -Uri "$r29BaseApi/$r29TrashId" -Method Delete | Out-Null
      Write-Output "r29 seed: main=$r29MainId empty=$r29EmptyId trash=$r29TrashId"
    } catch {
      Write-Output "warn: r29 seed failed ($($_.Exception.Message)) - matrix may show empty states"
    }
  }

  if ($Round -eq "r30") {
    # r30: formula field matrix. Every state is a deterministic ?shot= pin
    # (real data shape + real computed values); truth is locked by e2e + HTTP audit.
    $r30Base = "http://127.0.0.1:$WebPort/?page=bases"
    $shots = @(
      @{ name = "01-formula-empty";  url = "$r30Base&shot=bases-formula-empty";  width = 1280; height = 900 },
      @{ name = "02-expression-edit"; url = "$r30Base&shot=bases-formula-edit";  width = 1280; height = 900 },
      @{ name = "03-live-preview";    url = "$r30Base&shot=bases-formula-preview"; width = 1280; height = 900 },
      @{ name = "04-grid-computed";   url = "$r30Base&shot=bases-formula-grid";   width = 1280; height = 900 },
      @{ name = "05-error-red";       url = "$r30Base&shot=bases-formula-error";  width = 1280; height = 900 },
      @{ name = "06-narrow";          url = "$r30Base&shot=bases-formula-narrow&narrow=1"; width = 488; height = 1000 },
      @{ name = "07-cycle-error";     url = "$r30Base&shot=bases-formula-cycle";  width = 1280; height = 900 }
    )
  } elseif ($Round -eq "r29") {
    # r29: version history side panel + recycle bin. 7 states; restore/new-version
    # truth is already locked by e2e + audit, so pins focus on observable UI states.
    $r29Base = "http://127.0.0.1:$WebPort/?page=docs"
    $shots = @(
      @{ name = "01-versions-empty";  url = "$r29Base&docId=$r29EmptyId&shot=docs-versions-empty"; width = 1280; height = 900 },
      @{ name = "02-versions-list";   url = "$r29Base&docId=$r29MainId&shot=docs-versions-list";  width = 1280; height = 900 },
      @{ name = "03-version-summary"; url = "$r29Base&docId=$r29MainId&shot=docs-version-summary"; width = 1280; height = 900 },
      @{ name = "04-version-preview"; url = "$r29Base&docId=$r29MainId&shot=docs-version-preview"; width = 1280; height = 900 },
      @{ name = "05-after-restore";   url = "$r29Base&docId=$r29MainId&shot=docs-after-restore";  width = 1280; height = 900 },
      @{ name = "06-trash";           url = "$r29Base&shot=docs-trash";                           width = 1280; height = 900 },
      @{ name = "07-narrow";          url = "$r29Base&docId=$r29MainId&shot=docs-versions-list&narrow=1"; width = 488; height = 1600 }
    )
  } elseif ($Round -eq "r28") {
    # r28: meeting management matrix. All states use deterministic ?shot= pins;
    # conflict/booking rules are locked by e2e + real HTTP audit.
    $r28Base = "http://127.0.0.1:$WebPort/?page=meetings"
    $shots = @(
      @{ name = "01-meetings-empty";    url = "$r28Base&shot=meetings-empty";    width = 1280; height = 900 },
      @{ name = "02-meetings-list";     url = "$r28Base&shot=meetings-list";     width = 1280; height = 900 },
      @{ name = "03-meetings-grid";     url = "$r28Base&shot=meetings-grid";     width = 1280; height = 900 },
      @{ name = "04-meetings-form";     url = "$r28Base&shot=meetings-form";     width = 1280; height = 900 },
      @{ name = "05-meetings-conflict"; url = "$r28Base&shot=meetings-conflict"; width = 1280; height = 900 },
      @{ name = "06-narrow";            url = "$r28Base&shot=meetings-grid&narrow=1"; width = 488; height = 1000 },
      @{ name = "07-error";             url = "$r28Base&shot=meetings-error";    width = 1280; height = 900 }
    )
  } elseif ($Round -eq "r27") {
    # r27: report center matrix. All states use deterministic ?shot= pins; the
    # shared/reports algorithms and the real HTTP assembly are locked by e2e + audit.
    $r27Base = "http://127.0.0.1:$WebPort/?page=reports"
    $shots = @(
      @{ name = "01-reports-overview"; url = "$r27Base&shot=reports-overview"; width = 1280; height = 900 },
      @{ name = "02-reports-empty";    url = "$r27Base&shot=reports-empty";    width = 1280; height = 900 },
      @{ name = "03-reports-range";    url = "$r27Base&shot=reports-range";    width = 1280; height = 900 },
      @{ name = "04-reports-drilldown"; url = "$r27Base&shot=reports-drilldown"; width = 1280; height = 900 },
      @{ name = "05-reports-six-cards"; url = "$r27Base&shot=reports-six-cards"; width = 1280; height = 900 },
      @{ name = "06-narrow";           url = "$r27Base&shot=reports-overview&narrow=1"; width = 488; height = 1000 },
      @{ name = "07-error";            url = "$r27Base&shot=reports-error";   width = 1280; height = 900 }
    )
  } elseif ($Round -eq "r26") {
    # r26: notification center matrix. All eight states use deterministic ?shot= pins;
    # real aggregation / idempotency / navigation are locked by audit-http + CDP assertions.
    # 08 is rework#1: badge decrements 3 -> 2 in the same shot as the read-state change.
    # 09 is rework#2: real CDP click of the SECOND approval notification -> target row
    # selected + #2 detail + actor switch + deep-link URL (captured by helper below).
    $r26Base = "http://127.0.0.1:$WebPort/?page=notifications"
    $shots = @(
      @{ name = "01-notif-empty";      url = "$r26Base&shot=notif-empty";    width = 1280; height = 900 },
      @{ name = "02-notif-unread";     url = "$r26Base&shot=notif-unread";   width = 1280; height = 900 },
      @{ name = "03-notif-filtered";   url = "$r26Base&shot=notif-filtered"; width = 1280; height = 900 },
      @{ name = "04-notif-read";       url = "$r26Base&shot=notif-read";     width = 1280; height = 900 },
      @{ name = "05-notif-refreshed";  url = "$r26Base&shot=notif-refreshed"; width = 1280; height = 900 },
      @{ name = "06-narrow";           url = "$r26Base&shot=notif-unread&narrow=1"; width = 488; height = 1000 },
      @{ name = "07-error";            url = "$r26Base&shot=notif-error";   width = 1280; height = 900 },
      @{ name = "08-notif-badge-decrement"; url = "$r26Base&shot=notif-read-badge"; width = 1280; height = 900 },
      @{ name = "09-notif-deeplink-target"; url = "$r26Base"; width = 1280; height = 900 }
    )
  } elseif ($Round -eq "r25") {
    # r25: approval action actor badge / picker department filter / named badge /
    # manual-edit hint / assets detail badge / narrow / error. All states are
    # deterministic ?shot= pins; real link + usage are locked by HTTP/CDP assertions.
    $r25Approval = "http://127.0.0.1:$WebPort/?page=approval"
    $r25Assets = "http://127.0.0.1:$WebPort/?page=assets"
    $shots = @(
      @{ name = "01-approval-actor-badge"; url = "$r25Approval&shot=approval-actor-badge"; width = 1280; height = 900 },
      @{ name = "02-picker-dept-filter";  url = "$r25Approval&shot=approval-picker"; width = 1280; height = 900 },
      @{ name = "03-badge-named";         url = "$r25Approval&shot=approval-picked"; width = 1280; height = 900 },
      @{ name = "04-manual-hint";         url = "$r25Approval&shot=approval-manual-hint"; width = 1280; height = 900 },
      @{ name = "05-assets-detail-badge"; url = "$r25Assets&shot=assets-detail-badge"; width = 1280; height = 900 },
      @{ name = "06-narrow";              url = "$r25Approval&shot=approval-picker&narrow=1"; width = 488; height = 1000 },
      @{ name = "07-error";               url = "$r25Approval&shot=approval-r25-error"; width = 1280; height = 900 }
    )
  } elseif ($Round -eq "r24") {
    # r24: member picker / selected state / department badges on approval + assets.
    # All seven states use deterministic ?shot= pins; real CRUD / 4xx / usage are
    # locked by e2e + audit-http + headless CDP first-use chain.
    $r24Approval = "http://127.0.0.1:$WebPort/?page=approval"
    $r24Assets = "http://127.0.0.1:$WebPort/?page=assets"
    $shots = @(
      @{ name = "01-approval-picker";   url = "$r24Approval&shot=approval-picker"; width = 1280; height = 900 },
      @{ name = "02-approval-picked";   url = "$r24Approval&shot=approval-picked"; width = 1280; height = 900 },
      @{ name = "03-timeline-badge";    url = "$r24Approval&shot=approval-timeline-badge"; width = 1280; height = 900 },
      @{ name = "04-assets-picker";     url = "$r24Assets&shot=assets-picker"; width = 1280; height = 900 },
      @{ name = "05-assets-badge";      url = "$r24Assets&shot=assets-custodian-badge"; width = 1280; height = 900 },
      @{ name = "06-narrow";            url = "$r24Approval&shot=approval-picker&narrow=1"; width = 488; height = 1000 },
      @{ name = "07-error";             url = "$r24Approval&shot=approval-error"; width = 1280; height = 900 }
    )
  } elseif ($Round -eq "r23") {
    # r23: org tab matrix. All states are deterministic ?shot= pins on the new tab.
    # Real CRUD / cycle rejection is locked by e2e + audit-http + headless CDP first-use.
    $r23Base = "http://127.0.0.1:$WebPort/?page=org"
    $shots = @(
      @{ name = "01-org-empty";   url = "$r23Base&shot=org-empty";   width = 1280; height = 800 },
      @{ name = "02-org-tree";    url = "$r23Base&shot=org-tree";    width = 1280; height = 800 },
      @{ name = "03-org-members"; url = "$r23Base&shot=org-list";    width = 1280; height = 800 },
      @{ name = "04-org-form";    url = "$r23Base&shot=org-form";    width = 1280; height = 800 },
      @{ name = "05-org-search";  url = "$r23Base&shot=org-search";  width = 1280; height = 800 },
      @{ name = "06-narrow";      url = "$r23Base&shot=org-tree&narrow=1"; width = 488; height = 900 },
      @{ name = "07-error";       url = "$r23Base&shot=org-error";   width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r22") {
    # r22: only the 488px force-narrow seam is deterministic via --window-size.
    # 01/02 are true 390x844 CDP device-metrics captures (r20 06 precedent:
    # headless --window-size clamps to 500px), see docs/ui/r22/README.md.
    $shots = @(
      @{ name = "03-narrow-docs-more"; url = "http://127.0.0.1:$WebPort/?page=docs&narrow=1"; width = 488; height = 900 }
    )
  } elseif ($Round -eq "r15") {
    # 01 = pinned first-use empty; 02/03 = ONE real board with 3 real notes,
    # 03 after a REAL batch move between captures; 04 = mock AI board (7 notes);
    # 05 = real GET /export.md notice + real .md bytes on disk; 06 = narrow seam;
    # 07 = pinned error. All Chinese in seed is \uXXXX escaped above.
    $r15Base = "http://127.0.0.1:$WebPort/?page=whiteboard&boardId=$r15BoardId"
    $shots = @(
      @{ name = "01-whiteboard-empty"; url = "http://127.0.0.1:$WebPort/?page=whiteboard&shot=whiteboard-empty"; width = 1280; height = 800 },
      @{ name = "02-board-notes";      url = "$r15Base&shot=whiteboard-notes"; width = 1280; height = 800 },
      @{ name = "03-after-drag";       url = "$r15Base&shot=whiteboard-dragged"; width = 1280; height = 800 },
      @{ name = "04-ai-created";       url = "http://127.0.0.1:$WebPort/?page=whiteboard&boardId=$r15AiBoardId&shot=whiteboard-ai"; width = 1280; height = 800 },
      @{ name = "05-export";           url = "$r15Base&shot=whiteboard-export"; width = 1280; height = 800 },
      @{ name = "06-narrow";           url = "$r15Base&narrow=1"; width = 488; height = 1100 },
      @{ name = "07-error";            url = "http://127.0.0.1:$WebPort/?page=whiteboard&shot=whiteboard-error"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r16") {
    # 01 = pinned empty; 02 = first-use form; 03/04/05 = ONE real approval,
    # real submit/delegate/approve between captures; 06 = narrow seam; 07 = error.
    $r16Base = "http://127.0.0.1:$WebPort/?page=approval"
    $shots = @(
      @{ name = "01-approval-empty";   url = "$r16Base&shot=approval-empty"; width = 1280; height = 800 },
      @{ name = "02-approval-form";    url = "$r16Base&shot=approval-form"; width = 1280; height = 800 },
      @{ name = "03-todo-list";        url = "$r16Base&view=todo&actor=bob&shot=approval-todo"; width = 1280; height = 800 },
      @{ name = "04-detail-timeline";  url = "$r16Base&approvalId=$r16A2Id&actor=carol&shot=approval-detail"; width = 1280; height = 800 },
      @{ name = "05-approved";         url = "$r16Base&approvalId=$r16A2Id&actor=carol&shot=approval-approved"; width = 1280; height = 800 },
      @{ name = "06-narrow";           url = "$r16Base&view=todo&actor=bob&narrow=1"; width = 488; height = 1100 },
      @{ name = "07-error";            url = "$r16Base&shot=approval-error"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r18") {
    # Auth pages are standalone routes (no extra tab). 01/02/03/04/05/07 are
    # deterministic pinned states; 06 is the workbench mode card on a real api.
    # 08 pins the logged-in topbar (real token is held by the HTTP chain in seed).
    $r18LoginBase = "http://127.0.0.1:$WebPort/?page=login"
    $r18RegisterBase = "http://127.0.0.1:$WebPort/?page=register"
    $shots = @(
      @{ name = "01-login";           url = "$r18LoginBase&shot=login"; width = 1280; height = 900 },
      @{ name = "02-register";        url = "$r18RegisterBase&shot=register"; width = 1280; height = 900 },
      @{ name = "03-login-error";     url = "$r18LoginBase&shot=login-error"; width = 1280; height = 900 },
      @{ name = "04-401-redirect";    url = "$r18LoginBase&reason=401"; width = 1280; height = 900 },
      @{ name = "05-after-logout";    url = "$r18LoginBase&reason=logout"; width = 1280; height = 900 },
      @{ name = "06-settings-mode";   url = "http://127.0.0.1:$WebPort/?shot=mode-settings"; width = 1280; height = 900 },
      @{ name = "07-narrow";          url = "$r18LoginBase&narrow=1"; width = 488; height = 900 },
      @{ name = "08-logged-in";       url = "http://127.0.0.1:$WebPort/?shot=ready&auth=in"; width = 1280; height = 900 }
    )
  } elseif ($Round -eq "r20") {
    # r20 (M10 start): all seven states are deterministic ?shot= pins on the workbench
    # shell (no new tab). Real offline/queue/replay behavior is locked by audit-http
    # and by headless CDP offline emulation in the yanfa report.
    $r20Base = "http://127.0.0.1:$WebPort/"
    $shots = @(
      @{ name = "01-manifest-install"; url = "$r20Base`?shot=pwa-install"; width = 1280; height = 900 },
      @{ name = "02-sw-registered";    url = "$r20Base`?shot=sw-ready"; width = 1280; height = 900 },
      @{ name = "03-net-online";       url = "$r20Base`?shot=net-online"; width = 1280; height = 900 },
      @{ name = "04-net-offline-queue";url = "$r20Base`?shot=offline-queue"; width = 1280; height = 900 },
      @{ name = "05-replay-success";   url = "$r20Base`?shot=replay-success"; width = 1280; height = 900 },
      @{ name = "06-mobile-390";       url = "$r20Base`?shot=offline-queue"; width = 390; height = 844 },
      @{ name = "07-net-error";        url = "$r20Base`?shot=offline-error"; width = 1280; height = 900 }
    )
  } elseif ($Round -eq "r19") {
    # r19: sync card lives inside the workbench settings area (no new tab).
    # All seven states are deterministic ?shot= pins; real HTTP sync behavior is
    # locked by the audit suite (409 conflict field list / optimistic lock / idempotency).
    $r19Base = "http://127.0.0.1:$WebPort/"
    $shots = @(
      @{ name = "01-sync-idle";      url = "$r19Base`?shot=sync-idle"; width = 1280; height = 900 },
      @{ name = "02-sync-pending";   url = "$r19Base`?shot=sync-pending"; width = 1280; height = 900 },
      @{ name = "03-sync-conflicts"; url = "$r19Base`?shot=sync-conflicts"; width = 1280; height = 900 },
      @{ name = "04-sync-modal";     url = "$r19Base`?shot=sync-modal"; width = 1280; height = 900 },
      @{ name = "05-sync-success";   url = "$r19Base`?shot=sync-success"; width = 1280; height = 900 },
      @{ name = "06-sync-narrow";    url = "$r19Base`?shot=sync-pending&narrow=1"; width = 488; height = 900 },
      @{ name = "07-sync-error";     url = "$r19Base`?shot=sync-error"; width = 1280; height = 900 }
    )
  } elseif ($Round -eq "r17") {
    # 01 = pinned empty; 02 = first-use form; 03 = real asset ledger; 04 = real
    # transaction timeline (in/out between captures); 05 = real task tree;
    # 06 = after real task transition; 07 = narrow seam; 08 = pinned error.
    $r17AssetsBase = "http://127.0.0.1:$WebPort/?page=assets"
    $r17TasksBase = "http://127.0.0.1:$WebPort/?page=unit-tasks"
    $shots = @(
      @{ name = "01-assets-empty";      url = "$r17AssetsBase&shot=assets-empty"; width = 1280; height = 800 },
      @{ name = "02-assets-form";       url = "$r17AssetsBase&shot=assets-form"; width = 1280; height = 800 },
      @{ name = "03-assets-ledger";     url = "$r17AssetsBase&assetId=$r17AssetId&shot=assets-list"; width = 1280; height = 800 },
      @{ name = "04-tx-timeline";       url = "$r17AssetsBase&assetId=$r17AssetId&shot=assets-timeline"; width = 1280; height = 800 },
      @{ name = "05-unit-tasks-tree";   url = "$r17TasksBase&shot=tasks-tree"; width = 1280; height = 800 },
      @{ name = "06-task-transitioned"; url = "$r17TasksBase&taskId=$r17TaskId&shot=tasks-transitioned"; width = 1280; height = 800 },
      @{ name = "07-narrow";            url = "$r17AssetsBase&narrow=1"; width = 488; height = 1100 },
      @{ name = "08-error";             url = "$r17AssetsBase&shot=assets-error"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r14") {
    # 01 = pinned empty state; 02/03/04 = ONE real seeded mindmap, three views
    # (Markdown editor / parsed tree / collapsed branch); 05 = narrow seam;
    # 06 = pinned error state. All Chinese in seed is \uXXXX escaped above.
    $r14Base = "http://127.0.0.1:$WebPort/?page=mindmap&mapId=$r14MapId"
    $shots = @(
      @{ name = "01-mindmap-empty"; url = "http://127.0.0.1:$WebPort/?page=mindmap&shot=mindmap-empty"; width = 1280; height = 800 },
      @{ name = "02-markdown-edit"; url = "$r14Base&shot=mindmap-edit"; width = 1280; height = 800 },
      @{ name = "03-tree-view";     url = "$r14Base&shot=mindmap-tree"; width = 1280; height = 800 },
      @{ name = "04-collapsed";     url = "$r14Base&shot=mindmap-collapsed"; width = 1280; height = 800 },
      @{ name = "05-narrow";        url = "$r14Base&narrow=1"; width = 488; height = 1100 },
      @{ name = "06-error";         url = "http://127.0.0.1:$WebPort/?page=mindmap&shot=mindmap-error"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r13") {
    # 01 = real RAG conversation (AI bubble + citation cards from real chat);
    # 02 = citation-card spotlight (same data); 03 = citation jump -> knowledge doc
    # traceback (real GET /api/knowledge/docs/:id?chunkId=); 04 = artifact citation list;
    # 05 = no-hit honest answer; 06 = narrow 488x900; 07 = pinned error state.
    $r13ChatBase = "http://127.0.0.1:$WebPort/?page=chat"
    $r13HitConvId = 0
    $r13NoHitConvId = 0
    if ($r13ConvIds.Count -gt 0) { $r13HitConvId = $r13ConvIds[0] }
    if ($r13ConvIds.Count -gt 1) { $r13NoHitConvId = $r13ConvIds[1] }
    $shots = @(
      @{ name = "01-rag-chat";           url = "$r13ChatBase&convId=$r13HitConvId"; width = 1280; height = 900 },
      @{ name = "02-citation-card";      url = "$r13ChatBase&convId=$r13HitConvId&shot=rag-citation-card"; width = 1280; height = 900 },
      @{ name = "03-citation-jump";      url = "http://127.0.0.1:$WebPort/?page=knowledge&docId=$r13CiteDoc&chunkId=$r13CiteChunk"; width = 1280; height = 800 },
      @{ name = "04-artifact-citations"; url = "$r13ChatBase&convId=$r13HitConvId&shot=rag-artifact-citations"; width = 1280; height = 1100 },
      @{ name = "05-no-hit";             url = "$r13ChatBase&convId=$r13NoHitConvId"; width = 1280; height = 800 },
      @{ name = "06-narrow";             url = "$r13ChatBase&convId=$r13HitConvId&narrow=1"; width = 488; height = 1400 },
      @{ name = "07-error";              url = "$r13ChatBase&shot=chat-error"; width = 1280; height = 800 }
    )
  } elseif ($Round -eq "r12") {
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

    # r26 rework#2 U1-1: 09 is not a ?shot= pin - it needs a REAL click on the second
    # notification row. Delegate to a one-shot headless CDP helper (own browser,
    # Input.dispatchMouseEvent, real location.href banner, Page.captureScreenshot).
    if ($Round -eq "r26" -and $s.name -eq "09-notif-deeplink-target") {
      $out = Join-Path $UiDir ($s.name + ".png")
      if (Test-Path $out) { Remove-Item $out -Force }
      $helper = Join-Path $Root "scripts\r26-deeplink-shot.mjs"
      & node $helper --browser "$browser" --web-port $WebPort --out "$out" --target-id "2" --target-title "r26fix2-B-target" --expected-row "2"
      if ($LASTEXITCODE -ne 0) { throw "r26 deep-link CDP shot failed (node exit $LASTEXITCODE)" }
      Write-Output "shot ok: $($s.name).png (CDP real click, deep-link target)"
      continue
    }

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

    # r15 (r3 B lesson): 02 -> 03 a REAL batch move persists a note at new coords;
    # 03 -> 05 real export.md bytes are saved beside the matrix as landing evidence.
    # 04 uses a separate AI-seeded board, so its data differs from 02/03 by design.
    if ($Round -eq "r15" -and $s.name -eq "02-board-notes") {
      if ($r15BoardId -and $r15NoteIds.Count -gt 0) {
        try {
          $r15MoveBody = '{"moves":[{"id":' + $r15NoteIds[0] + ',"x":120,"y":300}]}'
          $r15Moved = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/whiteboards/$r15BoardId/items/move" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($r15MoveBody))
          Write-Output "r15 real move: id=$($r15Moved.items[0].id) -> ($($r15Moved.items[0].x),$($r15Moved.items[0].y))"
        } catch {
          Write-Output "warn: r15 move between 02/03 failed ($($_.Exception.Message))"
        }
      }
    }
    if ($Round -eq "r15" -and $s.name -eq "03-after-drag") {
      if ($r15BoardId) {
        try {
          $r15MdPath = Join-Path $UiDir "whiteboard-export.md"
          Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/api/whiteboards/$r15BoardId/export.md" -OutFile $r15MdPath
          Write-Output "r15 real export: $((Get-Item $r15MdPath).Length) bytes -> whiteboard-export.md"
        } catch {
          Write-Output "warn: r15 export download failed ($($_.Exception.Message))"
        }
      }
    }

    if ($Round -eq "r16" -and $s.name -eq "02-approval-form") {
      if ($r16A1Id -gt 0) {
        try {
          $r16Submit = [System.Text.Encoding]::UTF8.GetBytes('{"actor":"alice","comment":"\u8bf7\u5ba1\u6279"}')
          $r16Submitted = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals/$r16A1Id/submit" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body $r16Submit
          Write-Output "r16 real submit: A1=$r16A1Id -> $($r16Submitted.status)"
        } catch {
          Write-Output "warn: r16 submit between 02/03 failed ($($_.Exception.Message))"
        }
      }
    }
    if ($Round -eq "r16" -and $s.name -eq "03-todo-list") {
      if ($r16A2Id -gt 0) {
        try {
          $r16Delegate = [System.Text.Encoding]::UTF8.GetBytes('{"actor":"bob","targetAssignee":"carol","comment":"\u4ea4\u7ed9 carol"}')
          $r16Delegated = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals/$r16A2Id/delegate" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body $r16Delegate
          Write-Output "r16 real delegate: A2=$r16A2Id -> $($r16Delegated.currentAssignee) status=$($r16Delegated.status)"
        } catch {
          Write-Output "warn: r16 delegate between 03/04 failed ($($_.Exception.Message))"
        }
      }
    }
    if ($Round -eq "r16" -and $s.name -eq "04-detail-timeline") {
      if ($r16A2Id -gt 0) {
        try {
          $r16Approve = [System.Text.Encoding]::UTF8.GetBytes('{"actor":"carol","comment":"\u540c\u610f"}')
          $r16Approved = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals/$r16A2Id/approve" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body $r16Approve
          Write-Output "r16 real approve: A2=$r16A2Id -> $($r16Approved.status)"
        } catch {
          Write-Output "warn: r16 approve between 04/05 failed ($($_.Exception.Message))"
        }
      }
    }

    if ($Round -eq "r17" -and $s.name -eq "03-assets-ledger") {
      if ($r17AssetId -gt 0) {
        try {
          $r17In = [System.Text.Encoding]::UTF8.GetBytes('{"type":"in","quantity":3,"to":"\u4ed3\u5e93A","operator":"\u5165\u5e93\u5458"}')
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/assets/$r17AssetId/transactions" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body $r17In | Out-Null
          $r17Out = [System.Text.Encoding]::UTF8.GetBytes('{"type":"out","quantity":2,"from":"\u4ed3\u5e93A","operator":"\u51fa\u5e93\u5458"}')
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/assets/$r17AssetId/transactions" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body $r17Out | Out-Null
          Write-Output "r17 real in/out: asset=$r17AssetId -> 2 transactions"
        } catch {
          Write-Output "warn: r17 in/out between 03/04 failed ($($_.Exception.Message))"
        }
      }
    }
    if ($Round -eq "r17" -and $s.name -eq "05-unit-tasks-tree") {
      if ($r17ChildId -gt 0) {
        try {
          $r17Start = [System.Text.Encoding]::UTF8.GetBytes('{"to":"in_progress"}')
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/unit-tasks/$r17ChildId/transition" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body $r17Start | Out-Null
          $r17Done = [System.Text.Encoding]::UTF8.GetBytes('{"to":"done"}')
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/unit-tasks/$r17ChildId/transition" -Method Post `
            -ContentType "application/json; charset=utf-8" -Body $r17Done | Out-Null
          Write-Output "r17 real transition: child=$r17ChildId -> done"
        } catch {
          Write-Output "warn: r17 transition between 05/06 failed ($($_.Exception.Message))"
        }
      }
    }
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
  # r26 rework#2: delete only the three approvals + notifications this run seeded
  # (scratch db stays clean, repeat runs stay deterministic).
  if ($Round -eq "r26" -and $r26Fix2ApprovalIds.Count -gt 0) {
    try {
      foreach ($nid26 in $r26Fix2NotifIds) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/notifications/$nid26" -Method Delete | Out-Null
      }
      foreach ($aid26 in $r26Fix2ApprovalIds) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals/$aid26" -Method Delete | Out-Null
      }
      Write-Output "cleaned r26 rework#2 seed: approvals=$($r26Fix2ApprovalIds -join ',') notifications=$($r26Fix2NotifIds -join ',')"
    } catch {
      Write-Output "warn: r26 rework#2 cleanup failed ($($_.Exception.Message))"
    }
  }

  if ($Round -eq "r16") {
    # r16: delete only the two approvals this run seeded (steps + cc cascade).
    try {
      if ($r16A1Id -gt 0) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals/$r16A1Id" -Method Delete | Out-Null
        Write-Output "cleaned seeded r16 approval=$r16A1Id"
      }
      if ($r16A2Id -gt 0) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/approvals/$r16A2Id" -Method Delete | Out-Null
        Write-Output "cleaned seeded r16 approval=$r16A2Id"
      }
    } catch {
      Write-Output "warn: r16 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r18") {
    # r18: delete only the seeded account; its sessions cascade. No key file touched.
    try {
      if ($r18UserId -gt 0) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/auth/users/$r18UserId" -Method Delete `
          -Headers @{ Authorization = "Bearer $r18CleanupToken" } | Out-Null
        Write-Output "cleaned seeded r18 user=$r18UserId"
      }
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/auth/mode" -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes('{"mode":"local"}')) | Out-Null
      Write-Output "r18 service mode restored to local"
    } catch {
      Write-Output "warn: r18 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r19") {
    # r19: no seeded entities (all seven states are ?shot= pins). Restore mode to local.
    try {
      Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/auth/mode" -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes('{"mode":"local"}')) | Out-Null
      Write-Output "r19 service mode restored to local"
    } catch {
      Write-Output "warn: r19 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r17") {
    # r17: delete only the asset and tasks this run seeded (transactions cascade).
    try {
      if ($r17AssetId -gt 0) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/assets/$r17AssetId" -Method Delete | Out-Null
        Write-Output "cleaned seeded r17 asset=$r17AssetId"
      }
      if ($r17TaskId -gt 0) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/unit-tasks/$r17TaskId" -Method Delete | Out-Null
        Write-Output "cleaned seeded r17 task=$r17TaskId"
      }
    } catch {
      Write-Output "warn: r17 cleanup failed ($($_.Exception.Message))"
    }  } elseif ($Round -eq "r15") {
    # r15: delete only the two whiteboards this run seeded (items cascade), so
    # repeat runs stay deterministic and the shell baseline shows first-use empty.
    try {
      if ($r15BoardId -gt 0) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/whiteboards/$r15BoardId" -Method Delete | Out-Null
        Write-Output "cleaned seeded r15 board=$r15BoardId"
      }
      if ($r15AiBoardId -gt 0) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/whiteboards/$r15AiBoardId" -Method Delete | Out-Null
        Write-Output "cleaned seeded r15 ai board=$r15AiBoardId"
      }
    } catch {
      Write-Output "warn: r15 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r14") {
    # r14: delete only the mindmap this run seeded (repeat runs stay deterministic).
    try {
      if ($r14MapId -gt 0) {
        Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/mindmaps/$r14MapId" -Method Delete | Out-Null
        Write-Output "cleaned seeded r14 mindmap=$r14MapId"
      }
    } catch {
      Write-Output "warn: r14 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r13") {
    # r13: delete seeded RAG conversations (messages + artifacts cascade) and the
    # two knowledge docs so repeat runs stay deterministic (no user data touched).
    try {
      foreach ($cid13 in $r13ConvIds) {
        if ($cid13) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/conversations/$cid13" -Method Delete | Out-Null
        }
      }
      foreach ($kid13 in $r13DocIds) {
        if ($kid13) {
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/knowledge/docs/$kid13" -Method Delete | Out-Null
        }
      }
      Write-Output "cleaned seeded r13 conversations and knowledge docs"
    } catch {
      Write-Output "warn: r13 cleanup failed ($($_.Exception.Message))"
    }
  } elseif ($Round -eq "r12") {
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
  } elseif ($Round -eq "r29") {
    # r29: soft-delete then permanently delete ONLY this round's probe documents.
    try {
      $confirmBody = [System.Text.Encoding]::UTF8.GetBytes('{"confirm":"PERMANENTLY_DELETE"}')
      foreach ($did29 in @($r29MainId, $r29EmptyId, $r29TrashId)) {
        if ($did29) {
          try {
            Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/$did29" -Method Delete | Out-Null
          } catch {
            # already soft-deleted (trash probe) -> 404 is expected, continue to permanent delete
          }
          Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/documents/trash/$did29" -Method Delete `
            -ContentType "application/json; charset=utf-8" -Body $confirmBody | Out-Null
        }
      }
      Write-Output "cleaned seeded r29 documents (probe only)"
    } catch {
      Write-Output "warn: r29 cleanup failed ($($_.Exception.Message))"
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
