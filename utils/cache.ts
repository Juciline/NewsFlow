export interface CacheItem<T> {
  data: T;
  timestamp: number;
}

export class SimpleCache<T> {
  private cache = new Map<string, CacheItem<T>>();
  private ttl: number;

  constructor(ttlMs: number) {
    this.ttl = ttlMs;
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get size(): number {
    return this.cache.size;
  }
}
