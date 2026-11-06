import { describe, expect, it } from 'vitest'
import { LARGE_DATA_KEYS, migrateLegacyData, type StorageAdapter } from '@/lib/storage'

function fakeAdapter(kind: 'indexeddb' | 'localstorage', initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  let failWrites = false
  const adapter: StorageAdapter & { store: Map<string, string>; setFail: (value: boolean) => void } = {
    kind,
    store,
    setFail(value: boolean) {
      failWrites = value
    },
    async get(key: string) {
      return store.get(key) ?? null
    },
    async set(key: string, value: string) {
      if (failWrites) throw new Error('write failed')
      store.set(key, value)
    },
    async remove(key: string) {
      store.delete(key)
    },
  }
  return adapter
}

function fakeLegacy(values: Record<string, string>) {
  const store = new Map(Object.entries(values))
  return {
    store,
    getItem(key: string) {
      return store.get(key) ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
  }
}

describe('legacy localStorage migration', () => {
  it('copies each large payload into IndexedDB and removes the legacy copy afterwards', async () => {
    const adapter = fakeAdapter('indexeddb')
    const legacy = fakeLegacy({
      [LARGE_DATA_KEYS[0]]: '{"items":[{"symbol":"600519"}]}',
      [LARGE_DATA_KEYS[1]]: '{"items":[]}',
    })

    const failures = await migrateLegacyData(adapter, legacy)

    expect(failures).toEqual([])
    expect(adapter.store.get(LARGE_DATA_KEYS[0])).toBe('{"items":[{"symbol":"600519"}]}')
    expect(adapter.store.get(LARGE_DATA_KEYS[1])).toBe('{"items":[]}')
    expect(legacy.store.size).toBe(0)
  })

  it('never overwrites an existing IndexedDB value but still clears the legacy key', async () => {
    const adapter = fakeAdapter('indexeddb', { [LARGE_DATA_KEYS[0]]: '{"fresh":true}' })
    const legacy = fakeLegacy({ [LARGE_DATA_KEYS[0]]: '{"stale":true}' })

    const failures = await migrateLegacyData(adapter, legacy)

    expect(failures).toEqual([])
    expect(adapter.store.get(LARGE_DATA_KEYS[0])).toBe('{"fresh":true}')
    expect(legacy.store.has(LARGE_DATA_KEYS[0])).toBe(false)
  })

  it('keeps the legacy copy and reports the key when a write fails', async () => {
    const adapter = fakeAdapter('indexeddb')
    adapter.setFail(true)
    const legacy = fakeLegacy({ [LARGE_DATA_KEYS[0]]: '{"items":[]}' })

    const failures = await migrateLegacyData(adapter, legacy)

    expect(failures).toEqual([LARGE_DATA_KEYS[0]])
    expect(legacy.store.get(LARGE_DATA_KEYS[0])).toBe('{"items":[]}')
  })

  it('does nothing when the selected adapter is localStorage', async () => {
    const adapter = fakeAdapter('localstorage')
    const legacy = fakeLegacy({ [LARGE_DATA_KEYS[0]]: '{"items":[]}' })

    const failures = await migrateLegacyData(adapter, legacy)

    expect(failures).toEqual([])
    expect(adapter.store.size).toBe(0)
    expect(legacy.store.has(LARGE_DATA_KEYS[0])).toBe(true)
  })
})
