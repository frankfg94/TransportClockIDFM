import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureSourceSnapshot, assertSnapshotStable, snapshotArgument } from "../scripts/mobile-release/sourceSnapshot";

describe("explicit worktree release provenance", () => {
  it("binds tracked changes, new sources, deletions and build configuration while excluding credentials and generated outputs", () => {
    const root = mkdtempSync(join(tmpdir(), "release-snapshot-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    try {
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src/app.ts"), "accepted source");
      git("init"); git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "base");
      const config = { api: "https://production.example", versionCode: "1003" };
      const first = captureSourceSnapshot(root, config);
      expect(captureSourceSnapshot(root, config)).toEqual(first);
      expect(first.sourceRevision).not.toBe(first.baseCommit);
      writeFileSync(join(root, "src/app.ts"), "changed source");
      expect(() => assertSnapshotStable(first, captureSourceSnapshot(root, config))).toThrow("changed");
      writeFileSync(join(root, "src/app.ts"), "accepted source");
      writeFileSync(join(root, "src/new.ts"), "untracked source");
      expect(() => assertSnapshotStable(first, captureSourceSnapshot(root, config))).toThrow();
      rmSync(join(root, "src/new.ts")); rmSync(join(root, "src/app.ts"));
      expect(captureSourceSnapshot(root, config).files).toContainEqual({ path: "src/app.ts", sha256: null });
      writeFileSync(join(root, "src/app.ts"), "accepted source");
      expect(() => assertSnapshotStable(first, captureSourceSnapshot(root, { ...config, versionCode: "1004" }))).toThrow();
      mkdirSync(join(root, "android/app/build"), { recursive: true });
      writeFileSync(join(root, "android/app/build/generated.apk"), "generated");
      writeFileSync(join(root, "android/signing.jks"), "secret");
      assertSnapshotStable(first, captureSourceSnapshot(root, config));
      expect(() => assertSnapshotStable({ ...first, baseCommit: "f".repeat(40) }, first)).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("requires an explicit snapshot argument", () => {
    expect(snapshotArgument(["node", "build.ts"])).toBeUndefined();
    expect(snapshotArgument(["--worktree-snapshot=proofs/source.json"])).toBe("proofs/source.json");
  });
});
