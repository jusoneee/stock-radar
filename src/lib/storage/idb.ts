import type { StorageAdapter, StorageKind } from './types'

const DB_NAME = 'stock-radar'
const DB_VERSION = 1
const STORE_NAME = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'))
      request.onblocked = () => reject(new Error('IndexedDB 被其他标签页阻塞'))
    })
  }
  return dbPromise
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = run(tx.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'))
  })
}

export const idbAdapter: StorageAdapter = {
  kind: 'indexeddb' satisfies StorageKind,
  async get(key: string): Promise<string | null> {
    const value = await withStore('readonly', (store) => store.get(key))
    return typeof value === 'string' ? value : null
  },
  async set(key: string, value: string): Promise<void> {
    await withStore('readwrite', (store) => store.put(value, key))
  },
  async remove(key: string): Promise<void> {
    await withStore('readwrite', (store) => store.delete(key))
  },
}
