// XieFlow packages/shared/src/deploy.ts - r21 deployment contract (single source of truth).
// ASCII-only comments. Rules centralized here per AGENTS.md article 7:
// docker / portable / docs / verify-deploy / e2e / audit all consume these values.

/** Canonical ports for the three deployment paths. */
export const DEPLOY_PORTS = {
  web: 8080, // portable single-port web+api (also docker host port)
  api: 8787, // dev / standalone api
  apiAudit: 8788, // throwaway audit api
  verify: 8790, // verify-deploy.ps1 self-check api
} as const;

/** Canonical HTTP paths used by every deployment self-check. */
export const DEPLOY_PATHS = {
  health: "/api/health",
  mode: "/api/auth/mode",
  settings: "/api/settings",
  todos: "/api/todos",
  authMe: "/api/auth/me",
} as const;

/** Filesystem layout inside every deployment. */
export const DEPLOY_DATA = {
  dirName: "data",
  dbFileName: "xieflow.db",
  webDirName: "web",
  runtimeScript: "scripts/portable-serve.mjs",
} as const;

/** Mode each deployment path must use (matches shared/auth ServerMode). */
export const DEPLOY_MODES = {
  docker: "remote", // private docker-compose forces auth
  portable: "local", // single-machine portable is login-free
  cloud: "remote", // public network version forces auth
} as const;

/** First-run guide markers that MUST appear in the portable README.txt. */
export const DEPLOY_GUIDE_MARKERS = [
  "start.cmd",
  "start.sh",
  "http://127.0.0.1:8080",
  "./data/",
] as const;

export interface DeployRouteExpectation {
  readonly path: string;
  readonly localStatus: number;
  readonly remoteStatus: number;
}

/** Key routes every deployment self-check must probe, with expected status per mode.
 *  health/mode/settings are public in both modes; business routes 401 in remote mode;
 *  the always-protected probe is 401 in both modes. */
export const DEPLOY_ROUTES: readonly DeployRouteExpectation[] = [
  { path: DEPLOY_PATHS.health, localStatus: 200, remoteStatus: 200 },
  { path: DEPLOY_PATHS.mode, localStatus: 200, remoteStatus: 200 },
  { path: DEPLOY_PATHS.settings, localStatus: 200, remoteStatus: 200 },
  { path: DEPLOY_PATHS.todos, localStatus: 200, remoteStatus: 401 },
  { path: DEPLOY_PATHS.authMe, localStatus: 401, remoteStatus: 401 },
];

/** Expected HTTP status of a canonical deploy route in a given mode. */
export function expectedDeployStatus(route: DeployRouteExpectation, mode: string): number {
  return mode === "remote" ? route.remoteStatus : route.localStatus;
}

/** Return the guide markers missing from a text (real validator, not a tautology). */
export function missingDeployMarkers(text: string, markers: readonly string[]): readonly string[] {
  return markers.filter((m) => !text.includes(m));
}
