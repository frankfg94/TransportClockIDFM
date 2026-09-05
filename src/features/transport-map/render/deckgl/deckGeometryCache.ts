import type { TransportMapBinaryPathPacket } from "../transportMapRenderModel";

export interface DeckGeometryCacheMetrics {
  bytes: number;
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
}

/**
 * Small bounded LRU for application-owned binary packets. It deliberately
 * stores no Deck/luma private buffers, so eviction cannot invalidate GPU
 * resources owned by the overlay.
 */
export class DeckGeometryCache {
  private readonly entriesByKey = new Map<string, TransportMapBinaryPathPacket>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): TransportMapBinaryPathPacket | undefined {
    const packet = this.entriesByKey.get(key);
    if (!packet) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    this.entriesByKey.delete(key);
    this.entriesByKey.set(key, packet);
    return packet;
  }

  set(packet: TransportMapBinaryPathPacket): void {
    const previous = this.entriesByKey.get(packet.key);
    if (previous) this.bytes -= previous.bytes;
    this.entriesByKey.delete(packet.key);
    if (packet.bytes > this.maxBytes) {
      this.evictions += 1;
      return;
    }
    this.entriesByKey.set(packet.key, packet);
    this.bytes += packet.bytes;
    while (this.bytes > this.maxBytes && this.entriesByKey.size > 0) {
      const oldestKey = this.entriesByKey.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const oldest = this.entriesByKey.get(oldestKey);
      this.entriesByKey.delete(oldestKey);
      this.bytes -= oldest?.bytes ?? 0;
      this.evictions += 1;
    }
  }

  clear(): void {
    this.entriesByKey.clear();
    this.bytes = 0;
  }

  metrics(): DeckGeometryCacheMetrics {
    return {
      bytes: this.bytes,
      entries: this.entriesByKey.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }
}
