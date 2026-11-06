/** Replaceable persistence contract: the rest of the app never touches IndexedDB directly. */
export interface StorageAdapter {
  readonly kind: StorageKind
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export type StorageKind = 'indexeddb' | 'localstorage'

/** Large, machine-generated datasets live in IndexedDB. Small configs stay in localStorage. */
export const LARGE_DATA_KEYS = [
  'stock-radar:universe:v1',
  'stock-radar:watchlist:v1',
  'stock-radar:snapshots:v1',
] as const

export type LargeDataKey = (typeof LARGE_DATA_KEYS)[number]

/** Minimal subset of the Web Storage API used by the migration routine. */
export interface LegacyStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
}
