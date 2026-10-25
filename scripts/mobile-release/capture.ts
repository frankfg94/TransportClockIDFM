import { writeFileSync } from "node:fs";
import { projectRoot } from "./common";
import { captureSourceSnapshot, releaseConfiguration } from "./sourceSnapshot";

const output = process.argv[2];
if (!output) throw new Error("A snapshot output file is required.");
const snapshot = captureSourceSnapshot(projectRoot, releaseConfiguration());
writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Snapshot ${snapshot.sourceRevision}: ${snapshot.files.length} files; base commit ${snapshot.baseCommit}`);
