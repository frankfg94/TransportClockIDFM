export interface BoundedCacheMetrics {
  entries: number;
  bytes: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface CacheEntry<T> {
  value: T;
  bytes: number;
  dispose?: (value: T) => void;
}

export class BoundedLruCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key: string, entry: CacheEntry<T>): void {
    this.delete(key);
    this.entries.set(key, entry);
    this.bytes += entry.bytes;
    this.evictIfNeeded();
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.bytes -= entry.bytes;
    entry.dispose?.(entry.value);
    return true;
  }

  clear(): void {
    for (const key of [...this.entries.keys()]) this.delete(key);
  }

  values(): T[] {
    return [...this.entries.values()].map((entry) => entry.value);
  }

  metrics(): BoundedCacheMetrics {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      if (this.delete(oldest)) this.evictions += 1;
    }
  }
}

