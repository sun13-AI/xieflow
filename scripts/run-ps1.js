// XieFlow scripts/run-ps1.js - cross-platform wrapper to run a repo PowerShell script.
// Windows: powershell.exe (PS 5.1, always present). Unix: pwsh if installed (skip with
// exit 0 otherwise, so test:all stays green on CI runners without PowerShell).
// Why: package.json scripts spawn via cmd.exe, where "pwsh" is not on PATH on Windows
// boxes that only have PS 5.1 (observed on the r2 dev box).
// ASCII only. No dependencies.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const script = process.argv[2];
const extraArgs = process.argv.slice(3);
if (!script || !existsSync(script)) {
  console.error(`usage: node scripts/run-ps1.js <script.ps1> [args...] (not found: ${script})`);
  process.exit(1);
}

const isWindows = process.platform === "win32";
if (!isWindows) {
  const probe = spawnSync("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
    encoding: "utf8",
  });
  if (probe.error || probe.status !== 0) {
    console.log("SKIP: pwsh not installed on this runner; ps1 scripts are windows-first.");
    process.exit(0);
  }
}

const exe = isWindows ? "powershell.exe" : "pwsh";
const res = spawnSync(exe, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...extraArgs], {
  stdio: "inherit",
});
process.exit(res.status ?? 1);
