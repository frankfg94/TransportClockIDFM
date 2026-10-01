export function acquireUpdateLock(output: string): Promise<() => Promise<void>>;
