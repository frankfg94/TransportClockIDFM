import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { enrichCompiledPlaceSurfaces } from "./enrich-surfaces";

// Preserve every compiler argument and the backend's relative-path semantics.
const args = process.argv.slice(2);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run the places compiler through npm run places:compile");
const backendRoot = resolve("../idfm-node-backend");
const child = spawn(process.execPath, [npmCli, "--prefix", backendRoot, "run", "places:compile", "--", ...args], { stdio: "inherit" });
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("exit", (code) => {
  if (code !== 0) { process.exitCode = code ?? 1; return; }
  const output = args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
  const endpoint = args.find((arg) => arg.startsWith("--overpass="))?.slice("--overpass=".length);
  enrichCompiledPlaceSurfaces({ root: output ? resolve(backendRoot, output) : undefined, endpoint })
    .then(console.log).catch((error) => { console.error(error); process.exitCode = 1; });
});
