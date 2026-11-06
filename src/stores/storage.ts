import { defineStore } from 'pinia'
import { getStorageKind, getStorageNotice, subscribeStorage, type StorageKind } from '@/lib/storage'

export const useStorageStore = defineStore('storage', {
  state: () => ({
    notice: '',
    kind: 'indexeddb' as StorageKind,
    initialized: false,
    unsubscribe: null as (() => void) | null,
  }),
  getters: {
    kindLabel: (state): string => (state.kind === 'indexeddb' ? 'IndexedDB' : 'localStorage'),
  },
  actions: {
    init(): void {
      if (this.initialized) return
      this.initialized = true
      this.notice = getStorageNotice()
      this.kind = getStorageKind()
      this.unsubscribe = subscribeStorage((notice, kind) => {
        this.notice = notice
        this.kind = kind
      })
    },
    dismiss(): void {
      this.notice = ''
    },
  },
})
