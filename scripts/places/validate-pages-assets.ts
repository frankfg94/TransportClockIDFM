import { readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';

// Free Pages/Wrangler limits, deliberately below the larger paid-plan allowance.
const root = resolve(process.argv.find(arg => arg.startsWith('--root='))?.slice(7) ?? 'dist');
async function inventory(dir: string): Promise<{ path: string; bytes: number }[]> {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await inventory(path));
    else if (entry.isFile()) result.push({ path: relative(root, path), bytes: (await stat(path)).size });
  }
  return result;
}
const files = await inventory(root);
const oversized = files.filter(file => file.bytes > 25 * 1024 ** 2);
const report = { root, fileLimit: 20_000, individualByteLimit: 25 * 1024 ** 2, fileCount: files.length,
  largestFiles: [...files].sort((a,b) => b.bytes-a.bytes).slice(0,10), oversized,
  passed: files.length <= 20_000 && oversized.length === 0 };
await mkdir(resolve('.data-update-evidence/place-footprints'), { recursive: true });
await writeFile(resolve('.data-update-evidence/place-footprints/pages-assets.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
