import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLargeUnion } from "../../idfm-node-backend/src/transport/isochrones/largeUnion";
import { walkingPolygon } from "./fixtures/walkingIsochrones";

describe("isolated GEOS isochrone unions", () => {
  let directory: string;
  beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), "iso-union-test-")); });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  it("preserves holes, reports progress and reuses a verified checkpoint", async () => {
    const zones = Object.fromEntries([5, 10, 15, 20, 25, 30].map((minutes) => [minutes, walkingPolygon(2.35, 48.85, true)]));
    await fs.writeFile(join(directory, "origin.json"), JSON.stringify({ key: "origin", zones }));
    const reports: string[] = [];
    const result = await buildLargeUnion(directory, ["origin"], {}, (message) => reports.push(message));
    expect(Object.keys(result)).toHaveLength(6);
    expect(result[5].coordinates).toHaveLength(2);
    expect(reports.some((message) => message.includes("origins 1-1/1"))).toBe(true);
    await fs.unlink(join(directory, "origin.json"));
    expect(await buildLargeUnion(directory, ["origin"], {}, (message) => reports.push(message))).toEqual(result);
    expect(reports).toContain("verified union cache reused");
    await expect(buildLargeUnion(directory, ["missing"], {}, () => {})).rejects.toThrow();
  });
  it("terminates an operation exceeding its progress deadline", async () => {
    await expect(buildLargeUnion(directory, ["origin"], {}, () => {}, 1)).rejects.toThrow("timed out");
  });
  it("honors cancellation before launching a worker", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(buildLargeUnion(directory, [], {}, () => {}, 120_000, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
