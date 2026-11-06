import { idbAdapter } from './idb'
import { localStorageAdapter } from './local'
import { LARGE_DATA_KEYS, type LegacyStorage, type StorageAdapter, type StorageKind } from './types'

export type { StorageAdapter, StorageKind } from './types'
export { LARGE_DATA_KEYS } from './types'

const cache = new Map<string, string>()
/** Writes issued before hydration: replayed once an adapter is ready. */
const pendingOps = new Map<string, string | null>()
const listeners = new Set<(notice: string, kind: StorageKind) => void>()

let adapter: StorageAdapter = localStorageAdapter
let initialized = false
let adapterReady = false
let notice = ''
let queue: Promise<void> = Promise.resolve()

function publish(message: string): void {
  notice = message
  for (const listener of listeners) listener(message, adapter.kind)
}

/** Replay session writes so nothing made during hydration is lost or clobbered. */
function flushPendingOps(): void {
  if (pendingOps.size === 0) return
  const ops = Array.from(pendingOps.entries())
  pendingOps.clear()
  for (const [key, value] of ops) {
    queue = queue
      .then(() => (value === null ? adapter.remove(key) : adapter.set(key, value)))
      .catch(() => {
        publish('浏览器存储写入失败：本次改动仅保留在内存中，刷新后可能丢失。')
      })
  }
  void queue
}

export function getStorageNotice(): string {
  return notice
}

export function getStorageKind(): StorageKind {
  return adapter.kind
}

/** Large-data hydration has finished and writes are being persisted. */
export function isStorageReady(): boolean {
  return adapterReady
}

/**
 * Called when IndexedDB cannot be opened in time. Keep the app fully usable by
 * switching writes to localStorage and hydrating the legacy keys directly.
 */
export function useLocalStorageFallback(reason: string): void {
  if (adapterReady) return
  adapter = localStorageAdapter
  if (typeof localStorage !== 'undefined') {
    for (const key of LARGE_DATA_KEYS) {
      // Never overwrite a value the user changed before hydration finished.
      if (pendingOps.has(key)) continue
      try {
        const raw = localStorage.getItem(key)
        if (raw !== null) cache.set(key, raw)
      } catch {
        // Reading is best-effort; the notice already explains the fallback.
      }
    }
  }
  adapterReady = true
  flushPendingOps()
  publish(reason)
}

export function subscribeStorage(listener: (notice: string, kind: StorageKind) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readJson<T>(key: string): T | null {
  const raw = cache.get(key)
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Writes update the in-memory cache immediately and persist asynchronously. */
export function writeJson(key: string, value: unknown): void {
  let raw: string
  try {
    raw = JSON.stringify(value)
  } catch {
    publish('数据序列化失败：本次改动仅保留在内存中。')
    return
  }
  cache.set(key, raw)
  // Before hydration finishes, persist nothing: a seed value written now could
  // clobber the stored dataset. Keep the latest session value to replay later.
  if (!adapterReady) {
    pendingOps.set(key, raw)
    return
  }
  queue = queue.then(() => adapter.set(key, raw)).catch(() => {
    publish('浏览器存储写入失败：本次改动仅保留在内存中，刷新后可能丢失。')
  })
  void queue
}

export function removeJson(key: string): void {
  cache.delete(key)
  if (!adapterReady) {
    pendingOps.set(key, null)
    return
  }
  queue = queue.then(() => adapter.remove(key)).catch(() => {
    publish('浏览器存储删除失败：刷新后旧数据可能仍会恢复。')
  })
  void queue
}

export async function flushStorage(): Promise<void> {
  await queue
}

/**
 * Copy large legacy localStorage payloads into IndexedDB. Values are verified
 * before removal; any failure keeps the legacy copy untouched and reports the
 * affected key so no data is silently lost.
 */
export async function migrateLegacyData(adapterToUse: StorageAdapter, legacy: LegacyStorage): Promise<string[]> {
  const failures: string[] = []
  if (adapterToUse.kind !== 'indexeddb') return failures

  for (const key of LARGE_DATA_KEYS) {
    let legacyValue: string | null
    try {
      legacyValue = legacy.getItem(key)
    } catch {
      failures.push(key)
      continue
    }
    if (!legacyValue) continue

    try {
      const existing = await adapterToUse.get(key)
      if (existing === null) {
        await adapterToUse.set(key, legacyValue)
        const check = await adapterToUse.get(key)
        if (check !== legacyValue) throw new Error('migration verification failed')
      }
      legacy.removeItem(key)
    } catch {
      failures.push(key)
    }
  }
  return failures
}

/** Pick the best available adapter, hydrate the cache and migrate legacy data. */
export async function initAppStorage(): Promise<void> {
  if (initialized) return
  initialized = true

  if (typeof indexedDB !== 'undefined') {
    try {
      await idbAdapter.get('__probe__')
      // A timeout may already have fallen back while the probe was pending.
      if (adapterReady) return
      adapter = idbAdapter
    } catch {
      if (adapterReady) return
      adapter = localStorageAdapter
      publish('IndexedDB 不可用，已回退到 localStorage（容量有限；无痕模式或浏览器存储被禁用时可能出现）。')
    }
  } else {
    publish('当前浏览器不支持 IndexedDB，已回退到 localStorage（容量有限）。')
  }

  for (const key of LARGE_DATA_KEYS) {
    // Session writes issued before hydration take precedence over stored data.
    if (pendingOps.has(key)) continue
    try {
      const raw = await adapter.get(key)
      if (raw !== null) cache.set(key, raw)
    } catch {
      publish('读取本地数据失败：本次会话可能看不到历史缓存。')
    }
  }

  if (adapter.kind === 'indexeddb' && typeof localStorage !== 'undefined') {
    const failures = await migrateLegacyData(adapter, localStorage)
    if (failures.length > 0) {
      publish(`旧数据迁移失败：${failures.join('、')}。旧数据仍完整保留在 localStorage，未删除，可稍后重试。`)
    }
  }

  adapterReady = true
  flushPendingOps()
}
