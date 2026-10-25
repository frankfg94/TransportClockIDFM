import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface SourceSnapshot {
  schemaVersion: 1;
  kind: "worktree-snapshot";
  baseCommit: string;
  sourceRevision: string;
  snapshotSha256: string;
  configuration: Record<string, string>;
  files: { path: string; sha256: string | null }[];
}

const roots = ["src", "pages", "layouts", "plugins", "composables", "shared", "server", "packages", "config", "public", "android", "scripts", "tests", "package.json", "package-lock.json", "nuxt.config.ts", "capacitor.config.ts", "app.vue"];
const ignored = /(?:^|\/)(?:node_modules|build|\.gradle|\.idea|dist|\.nuxt[^/]*|capacitor-cordova-android-plugins)(?:\/|$)|^android\/app\/src\/main\/(?:assets\/(?:public(?:\/|$)|capacitor\.(?:config|plugins)\.json$)|res\/xml\/config\.xml$)|^android\/local\.properties$/u;
const sensitive = /(?:^|\/)\.env(?:\.|$)|\.(?:jks|keystore|p12|pem|key)$/iu;
export const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");

export function snapshotIdentity(payload: Pick<SourceSnapshot, "baseCommit" | "configuration" | "files">): string {
  return sha256(JSON.stringify({ domain: "transport-clock-worktree-snapshot-v1", ...payload }));
}

export function captureSourceSnapshot(root: string, configuration: Record<string, string>): SourceSnapshot {
  const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const tracked = execFileSync("git", ["ls-files", "-z", "--", ...roots], { cwd: root }).toString().split("\0").filter(Boolean);
  const paths = new Set(tracked.filter(path => !ignored.test(path) && !sensitive.test(path)));
  const walk = (path: string): void => {
    if (ignored.test(path) || sensitive.test(path) || !existsSync(resolve(root, path))) return;
    const stats = lstatSync(resolve(root, path));
    if (stats.isSymbolicLink()) throw new Error(`Snapshot refuses symbolic link: ${path}`);
    if (stats.isDirectory()) for (const name of readdirSync(resolve(root, path))) walk(`${path}/${name}`);
    else if (stats.isFile()) paths.add(path);
  };
  roots.forEach(walk);
  const files = [...paths].sort().map(path => ({ path, sha256: existsSync(resolve(root, path)) ? sha256(readFileSync(resolve(root, path))) : null }));
  const payload = { baseCommit, configuration, files };
  const snapshotSha256 = snapshotIdentity(payload);
  // Existing public clients accept a 40-hex sourceRevision. This is a domain-
  // separated snapshot ID, explicitly distinguished from baseCommit in provenance.
  return { schemaVersion: 1, kind: "worktree-snapshot", ...payload, snapshotSha256, sourceRevision: snapshotSha256.slice(0, 40) };
}

export function assertSnapshotStable(expected: SourceSnapshot, actual: SourceSnapshot): void {
  if (expected.schemaVersion !== 1 || expected.kind !== "worktree-snapshot" ||
      expected.snapshotSha256 !== snapshotIdentity({ baseCommit: expected.baseCommit, configuration: expected.configuration, files: expected.files }) ||
      expected.sourceRevision !== expected.snapshotSha256.slice(0, 40) ||
      expected.snapshotSha256 !== actual.snapshotSha256) {
    throw new Error("Source snapshot changed or invalid; rebuild and revalidate before publication.");
  }
}

export function readAndVerifySnapshot(path: string, root: string, configuration: Record<string, string>): SourceSnapshot {
  const expected = JSON.parse(readFileSync(path, "utf8")) as SourceSnapshot;
  assertSnapshotStable(expected, captureSourceSnapshot(root, configuration));
  return expected;
}

export function snapshotArgument(args = process.argv): string | undefined {
  return args.find(value => value.startsWith("--worktree-snapshot="))?.slice("--worktree-snapshot=".length);
}

export function releaseConfiguration(): Record<string, string> {
  const api = process.env.NUXT_PUBLIC_API_BASE_URL?.trim() ?? "";
  const url = new URL(api);
  if (url.protocol !== "https:" || url.username || url.password || /^(?:localhost|127\.|10\.|192\.168\.|\[::1\])/iu.test(url.hostname)) {
    throw new Error("Final APK requires a production HTTPS API.");
  }
  if (process.env.CAPACITOR_LIVE_RELOAD === "true") throw new Error("Final APK refuses live reload.");
  const keys = ["NUXT_PUBLIC_API_BASE_URL", "NUXT_PUBLIC_MOBILE_RELEASE_BASE_URL", "MOBILE_RELEASE_VERSION_CODE", "MOBILE_RELEASE_VERSION_NAME", "DISALLOW_PLUGINS", "ENABLED_PLUGINS", "UNLIMITED_NETWORK", "NUXT_PUBLIC_NEXT_MAP_STYLE_URL"];
  const config = Object.fromEntries(keys.map(key => [key, process.env[key]?.trim() ?? ""]));
  const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  // Nuxt also reads .env; publish only its digest, never its contents.
  config.nuxtDotenvSha256 = existsSync(resolve(root, ".env")) ? sha256(readFileSync(resolve(root, ".env"))) : "absent";
  return config;
}
