import type { StorageAdapter } from './types'

/** Small-configuration adapter. Large datasets should use the IndexedDB adapter. */
export const localStorageAdapter: StorageAdapter = {
  kind: 'localstorage',
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value)
  },
  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key)
    } catch {
      // Removing an absent key is not an error.
    }
  },
}
