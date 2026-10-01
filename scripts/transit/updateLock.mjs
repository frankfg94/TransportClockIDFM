import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Exclusive per-target lock shared by CLI and Workbench. Never steal a live lock. */
export async function acquireUpdateLock(output) {
  const lock = `${path.resolve(output)}.update.lock`;
  await fs.mkdir(path.dirname(lock), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(lock, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return async () => { await handle.close(); await fs.unlink(lock); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await fs.readFile(lock, 'utf8').then(JSON.parse).catch(() => undefined);
      if (!Number.isInteger(owner?.pid) || owner.pid <= 0) throw new Error(`Update lock needs inspection: ${lock}`);
      try { process.kill(owner.pid, 0); }
      catch (probe) {
        if (probe.code === 'ESRCH') throw new Error(`Interrupted dataset update; inspect and remove its lock before retrying: ${lock}`);
      }
      throw new Error(`A dataset update is already running (PID ${owner.pid}).`);
    }
  }
  throw new Error(`Could not acquire dataset update lock: ${lock}`);
}
