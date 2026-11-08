import { defineStore } from 'pinia'
import type { MarketPrefix, WatchItem } from '@/types'
import { STOCK_UNIVERSE } from '@/adapters/mock/universe'
import { marketOfSymbol } from '@/lib/market'
import { readJson, writeJson, isStorageReady } from '@/lib/storage'

const STORAGE_KEY = 'stock-radar:watchlist:v1'
const LEGACY_CHANNEL_KEY = 'stock-radar:channel-config:v1'
const DEFAULT_GROUP_NAME = '默认分组'

/** Hard cap keeps one analysis run inside a safe request budget. */
export const MAX_WATCHLIST = 50

export type AddResult = 'added' | 'exists' | 'full' | 'invalid'
export type WatchSortMode = 'manual' | 'name' | 'symbol' | 'added'

/** Groups are an independent, persisted list (not derived from memberships). */
export interface WatchGroup {
  id: string
  name: string
  isDefault: boolean
  /** Creation time; the sidebar lists newest custom groups first. */
  createdAt?: string
}

function marketOf(symbol: string): MarketPrefix {
  return marketOfSymbol(symbol)
}

function isValidSymbol(symbol: string): boolean {
  // Shanghai / Shenzhen main boards, STAR, ChiNext, Beijing Stock Exchange.
  return /^(0|3|4|6|8)\d{5}$/.test(symbol) || /^92\d{4}$/.test(symbol)
}

function normalizeNames(values: unknown): string[] {
  const names = new Set<string>()
  if (Array.isArray(values)) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) names.add(value.trim().slice(0, 12))
    }
  }
  return Array.from(names)
}

/** Legacy memberships: `groups` (names array) or the older single `group` string. */
function readLegacyNames(candidate: Partial<WatchItem>): string[] {
  const names = normalizeNames(candidate.groups)
  if (names.length) return names
  return typeof candidate.group === 'string' && candidate.group.trim()
    ? normalizeNames([candidate.group])
    : []
}

function newGroupId(): string {
  return `g-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function defaultItems(): WatchItem[] {
  return STOCK_UNIVERSE.map((stock) => ({
    symbol: stock.symbol,
    name: stock.name,
    market: marketOf(stock.symbol),
    favorite: true,
    addedAt: 'default',
  }))
}

/** Old builds stored the pool inside the channel config; reuse it once. */
function readLegacySymbols(): WatchItem[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_CHANNEL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { symbols?: unknown }
    if (!Array.isArray(parsed.symbols)) return null
    const items: WatchItem[] = []
    for (const value of parsed.symbols) {
      if (typeof value !== 'string' || !isValidSymbol(value)) continue
      const profile = STOCK_UNIVERSE.find((stock) => stock.symbol === value)
      items.push({ symbol: value, name: profile?.name ?? value, market: marketOf(value), favorite: true, addedAt: 'migrated' })
    }
    return items.length > 0 ? items : null
  } catch {
    return null
  }
}

export const useWatchlistStore = defineStore('watchlist', {
  state: () => ({
    items: [] as WatchItem[],
    /** Independent group list; always contains exactly one default group. */
    groups: [] as WatchGroup[],
    initialized: false,
    /** True when the user changed the pool before IndexedDB hydration finished. */
    dirty: false,
    /** Last user-facing rejection reason, e.g. pool full. */
    notice: '',
    /** Manual order follows the array; other modes are applied by the view. */
    sortMode: 'manual' as WatchSortMode,
  }),
  getters: {
    count: (state): number => state.items.length,
    symbols: (state): string[] => state.items.map((item) => item.symbol),
    favorites: (state): WatchItem[] => state.items.filter((item) => item.favorite !== false),
    favoriteSymbols: (state): string[] => state.items.filter((item) => item.favorite !== false).map((item) => item.symbol),
    isEmpty: (state): boolean => state.items.length === 0,
    isFull: (state): boolean => state.items.length >= MAX_WATCHLIST,
    defaultGroup: (state): WatchGroup => state.groups.find((group) => group.isDefault) ?? state.groups[0],
    defaultGroupName(): string {
      return this.defaultGroup?.name ?? DEFAULT_GROUP_NAME
    },
  },
  actions: {
    init(): void {
      if (this.initialized) return
      this.initialized = true
      this.items = defaultItems()
      // Before hydration the cache is empty; seeding defaults must not overwrite
      // the persisted pool, so only read storage once it is ready.
      if (isStorageReady()) this.loadPersisted()
      this.ensureDefaultGroup()
    },
    /** Re-read the persisted pool once IndexedDB hydration has completed. */
    rehydrateFromStorage(): void {
      if (this.dirty) {
        this.persist()
        return
      }
      this.initialized = false
      this.init()
    },
    loadPersisted(): void {
      const parsed = readJson<{ items?: unknown; sortMode?: unknown; groups?: unknown; defaultGroup?: unknown }>(
        STORAGE_KEY,
      )
      if (!parsed) {
        const legacy = readLegacySymbols()
        if (legacy) {
          this.items = legacy
          this.persist()
        }
        return
      }
      if (!Array.isArray(parsed.items)) return
      const seen = new Set<string>()
      const rawItems: WatchItem[] = []
      const legacyNames: string[][] = []
      for (const value of parsed.items) {
        const candidate = value as Partial<WatchItem> | null
        if (!candidate || typeof candidate.symbol !== 'string') continue
        if (!isValidSymbol(candidate.symbol) || seen.has(candidate.symbol)) continue
        seen.add(candidate.symbol)
        rawItems.push({
          symbol: candidate.symbol,
          name: typeof candidate.name === 'string' && candidate.name ? candidate.name : candidate.symbol,
          market:
            candidate.market === 'SH' || candidate.market === 'SZ' || candidate.market === 'BJ'
              ? candidate.market
              : marketOf(candidate.symbol),
          groupIds: Array.isArray(candidate.groupIds)
            ? candidate.groupIds.filter((id): id is string => typeof id === 'string')
            : undefined,
          favorite: candidate.favorite !== false,
          addedAt: candidate.addedAt,
        })
        legacyNames.push(readLegacyNames(candidate))
        if (rawItems.length >= MAX_WATCHLIST) break
      }

      const groups: WatchGroup[] = []
      const ids = new Set<string>()
      const names = new Set<string>()
      const legacyDefaultName =
        typeof parsed.defaultGroup === 'string' && parsed.defaultGroup.trim()
          ? parsed.defaultGroup.trim().slice(0, 12)
          : DEFAULT_GROUP_NAME

      /** Adds a definition once, keeping ids/names unique. */
      const addGroup = (id: string, name: string, isDefault: boolean, createdAt?: string): WatchGroup => {
        const uniqueId = ids.has(id) ? newGroupId() : id
        const uniqueName = names.has(name) ? `${name.slice(0, 10)}${groups.length}` : name
        const group: WatchGroup = { id: uniqueId, name: uniqueName, isDefault, createdAt: createdAt ?? 'legacy' }
        ids.add(uniqueId)
        names.add(uniqueName)
        groups.push(group)
        return group
      }

      if (Array.isArray(parsed.groups)) {
        for (const value of parsed.groups) {
          const candidate = value as Partial<WatchGroup> | null
          if (!candidate || typeof candidate.id !== 'string' || typeof candidate.name !== 'string') continue
          const name = candidate.name.trim().slice(0, 12)
          if (!name) continue
          addGroup(candidate.id, name, candidate.isDefault === true, candidate.createdAt)
        }
      }

      // Ensure exactly one default group and keep it first.
      let defaultGroup = groups.find((group) => group.isDefault)
      if (!defaultGroup) {
        const named = groups.find((group) => group.name === legacyDefaultName)
        if (named) {
          named.isDefault = true
          defaultGroup = named
        } else {
          defaultGroup = addGroup(newGroupId(), names.has(legacyDefaultName) ? DEFAULT_GROUP_NAME : legacyDefaultName, true)
        }
      }
      for (const group of groups) if (group !== defaultGroup) group.isDefault = false
      const defaultIndex = groups.indexOf(defaultGroup)
      if (defaultIndex > 0) {
        groups.splice(defaultIndex, 1)
        groups.unshift(defaultGroup)
      }

      // Legacy memberships carry names; create definitions for any unknown names.
      const nameToId = new Map(groups.map((group) => [group.name, group.id]))
      rawItems.forEach((_, index) => {
        for (const name of legacyNames[index] ?? []) {
          if (nameToId.has(name)) continue
          const created = addGroup(newGroupId(), name, false)
          nameToId.set(created.name, created.id)
        }
      })

      // Rewrite memberships as ids, dropping unknown/duplicate references.
      rawItems.forEach((item, index) => {
        const resolved = new Set<string>()
        for (const id of item.groupIds ?? []) {
          if (ids.has(id)) resolved.add(id)
        }
        for (const name of legacyNames[index] ?? []) {
          const id = nameToId.get(name)
          if (id) resolved.add(id)
        }
        item.groupIds = resolved.size ? Array.from(resolved) : undefined
      })

      this.items = rawItems
      this.groups = groups
      if (parsed.sortMode === 'name' || parsed.sortMode === 'symbol' || parsed.sortMode === 'added') {
        this.sortMode = parsed.sortMode
      } else if (parsed.sortMode === 'manual') {
        this.sortMode = 'manual'
      }
      // Persist the migrated shape so ids stay stable across reloads.
      this.persist()
    },
    persist(): void {
      writeJson(STORAGE_KEY, { items: this.items, sortMode: this.sortMode, groups: this.groups })
    },
    ensureDefaultGroup(): void {
      if (this.groups.some((group) => group.isDefault)) {
        const [defaultGroup] = this.groups.filter((group) => group.isDefault)
        if (defaultGroup) {
          const index = this.groups.indexOf(defaultGroup)
          if (index > 0) {
            this.groups.splice(index, 1)
            this.groups.unshift(defaultGroup)
          }
        }
        return
      }
      this.groups.unshift({ id: newGroupId(), name: DEFAULT_GROUP_NAME, isDefault: true, createdAt: 'legacy' })
    },
    /** Create a group; returns its id, or null when the name is empty/duplicated. */
    addGroup(name: string): string | null {
      const next = name.trim().slice(0, 12)
      if (!next) return null
      if (this.groups.some((group) => group.name === next)) return null
      const group: WatchGroup = { id: newGroupId(), name: next, isDefault: false, createdAt: new Date().toISOString() }
      this.groups.push(group)
      this.dirty = true
      this.persist()
      return group.id
    },
    /** Rename any group (default group included); default role is preserved. */
    renameGroup(id: string, name: string): boolean {
      const group = this.groups.find((entry) => entry.id === id)
      const next = name.trim().slice(0, 12)
      if (!group || !next) return false
      if (this.groups.some((entry) => entry.id !== id && entry.name === next)) return false
      if (group.name === next) return true
      group.name = next
      this.dirty = true
      this.persist()
      return true
    },
    /** Delete a custom group and clean its memberships; the default group cannot be deleted. */
    deleteGroup(id: string): boolean {
      const group = this.groups.find((entry) => entry.id === id)
      if (!group || group.isDefault) return false
      this.groups = this.groups.filter((entry) => entry.id !== id)
      for (const item of this.items) {
        if (!item.groupIds?.length) continue
        const next = item.groupIds.filter((entry) => entry !== id)
        item.groupIds = next.length ? next : undefined
      }
      this.dirty = true
      this.persist()
      return true
    },
    has(symbol: string): boolean {
      return this.items.some((item) => item.symbol === symbol)
    },
    add(stock: { symbol: string; name: string; market?: MarketPrefix; groupIds?: string[] }): AddResult {
      const symbol = stock.symbol.trim()
      if (!isValidSymbol(symbol)) return 'invalid'
      if (this.has(symbol)) return 'exists'
      if (this.items.length >= MAX_WATCHLIST) return 'full'
      const groupIds = Array.from(new Set(stock.groupIds ?? []))
      this.items.push({
        symbol,
        name: stock.name.trim() || symbol,
        market: stock.market ?? marketOf(symbol),
        groupIds: groupIds.length ? groupIds : undefined,
        favorite: true,
        addedAt: new Date().toISOString(),
      })
      this.notice = ''
      this.dirty = true
      this.persist()
      return 'added'
    },
    toggleFavorite(symbol: string): void {
      const item = this.items.find((entry) => entry.symbol === symbol)
      if (!item) return
      item.favorite = item.favorite === false
      this.dirty = true
      this.persist()
    },
    remove(symbol: string): void {
      this.items = this.items.filter((item) => item.symbol !== symbol)
      this.dirty = true
      this.persist()
    },
    /** Group ids one symbol currently belongs to. */
    groupIdsOf(symbol: string): string[] {
      return this.items.find((entry) => entry.symbol === symbol)?.groupIds ?? []
    },
    groupNamesOf(symbol: string): string[] {
      const ids = this.groupIdsOf(symbol)
      const names = ids.map((id) => this.groups.find((group) => group.id === id)?.name).filter(Boolean) as string[]
      return names
    },
    /** Replace all group memberships of one symbol. */
    setGroupIds(symbol: string, groupIds: string[]): void {
      const item = this.items.find((entry) => entry.symbol === symbol)
      if (!item) return
      const ids = Array.from(new Set(groupIds.filter((id) => this.groups.some((group) => group.id === id))))
      item.groupIds = ids.length ? ids : undefined
      this.dirty = true
      this.persist()
    },
    /** Add or remove one group membership (multi-select in the join popover). */
    toggleGroup(symbol: string, groupId: string): void {
      const item = this.items.find((entry) => entry.symbol === symbol)
      if (!item || !this.groups.some((group) => group.id === groupId)) return
      const current = item.groupIds ?? []
      item.groupIds = current.includes(groupId)
        ? current.filter((entry) => entry !== groupId)
        : [...current, groupId]
      if (!item.groupIds.length) item.groupIds = undefined
      this.dirty = true
      this.persist()
    },
    /** Move one item up or down in manual order. */
    move(symbol: string, direction: -1 | 1): void {
      const index = this.items.findIndex((item) => item.symbol === symbol)
      const target = index + direction
      if (index < 0 || target < 0 || target >= this.items.length) return
      const [item] = this.items.splice(index, 1)
      if (!item) return
      this.items.splice(target, 0, item)
      this.sortMode = 'manual'
      this.dirty = true
      this.persist()
    },
    setSortMode(mode: WatchSortMode): void {
      this.sortMode = mode
      this.dirty = true
      this.persist()
    },
    clear(): void {
      this.items = []
      this.notice = ''
      this.dirty = true
      this.persist()
    },
    /** Restore the built-in 10-stock demo pool. */
    reset(): void {
      this.items = defaultItems()
      this.notice = ''
      this.dirty = true
      this.persist()
    },
  },
})
