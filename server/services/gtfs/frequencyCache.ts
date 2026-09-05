/** Small LRU with expiring promises, including bounded in-flight work. */
export class FrequencyCache<T> {
  private readonly entries = new Map<string, { expiresAt: number; promise: Promise<T> }>();

  constructor(
    readonly capacity = 64,
    readonly ttlMs = 5 * 60_000,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("Invalid frequency cache limits");
    }
  }

  get size(): number {
    return this.entries.size;
  }
  clear(): void {
    this.entries.clear();
  }
  delete(key: string, expected?: Promise<T>): void {
    if (!expected || this.entries.get(key)?.promise === expected) this.entries.delete(key);
  }

  getOrLoad(key: string, load: () => T | Promise<T>, now = Date.now()): Promise<T> {
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id);
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.promise;
    }
    const promise = Promise.resolve().then(load);
    this.entries.set(key, { expiresAt: now + this.ttlMs, promise });
    while (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
    void promise.catch(() => {
      // A rejected old request must not evict a newer replacement.
      if (this.entries.get(key)?.promise === promise) this.entries.delete(key);
    });
    return promise;
  }
}
