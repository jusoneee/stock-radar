import { defineStore } from 'pinia'

export type ThemeId = 'dark' | 'light' | 'midnight' | 'sand'
export type ThemeMode = 'system' | ThemeId

export interface ThemeMeta {
  id: ThemeId
  label: string
  hint: string
  scheme: 'dark' | 'light'
  swatches: [string, string, string]
  /** Browser chrome color used for the <meta name="theme-color"> tag. */
  themeColor: string
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'dark',
    label: '深空黑',
    hint: '默认深色',
    scheme: 'dark',
    swatches: ['#0a0c10', '#171b22', '#4c8dff'],
    themeColor: '#0a0c10',
  },
  {
    id: 'light',
    label: '明亮白',
    hint: '浅色高对比',
    scheme: 'light',
    swatches: ['#f5f7fb', '#ffffff', '#2f6bff'],
    themeColor: '#f5f7fb',
  },
  {
    id: 'midnight',
    label: '深海蓝',
    hint: '深蓝夜航',
    scheme: 'dark',
    swatches: ['#060d1c', '#111c31', '#5aa2ff'],
    themeColor: '#060d1c',
  },
  {
    id: 'sand',
    label: '暖沙米',
    hint: '暖调浅色',
    scheme: 'light',
    swatches: ['#f7f2e9', '#fffdf8', '#b97432'],
    themeColor: '#f7f2e9',
  },
]

const STORAGE_KEY = 'stock-radar:theme:v1'
const SYSTEM_DARK_THEME: ThemeId = 'dark'
const SYSTEM_LIGHT_THEME: ThemeId = 'light'

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

function metaOf(id: ThemeId): ThemeMeta {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!
}

/** Keep the browser UI (address bar) in sync with the active theme. */
function syncThemeColor(color: string): void {
  let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = 'theme-color'
    document.head.appendChild(tag)
  }
  tag.content = color
}

/**
 * Theme preference persisted in localStorage.
 *
 * `system` follows `prefers-color-scheme` and reacts to OS changes in real
 * time; explicit ids pin one of the bundled palettes. The palette itself is
 * applied through `data-theme` on <html>, so CSS owns the visual tokens and
 * this store only decides which set is active.
 */
export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: 'system' as ThemeMode,
    resolved: 'dark' as ThemeId,
    systemDark: false,
    initialized: false,
  }),
  getters: {
    isSystem: (state): boolean => state.mode === 'system',
    currentLabel: (state): string => metaOf(state.resolved).label,
    resolvedLabel: (state): string => {
      const meta = metaOf(state.resolved)
      return `${meta.label}（${meta.scheme === 'dark' ? '深色' : '浅色'}）`
    },
  },
  actions: {
    init(): void {
      if (this.initialized) return
      this.initialized = true

      const media = window.matchMedia('(prefers-color-scheme: dark)')
      this.systemDark = media.matches

      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const parsed = raw ? (JSON.parse(raw) as { mode?: unknown }) : null
        if (parsed?.mode === 'system' || isThemeId(parsed?.mode)) {
          this.mode = parsed.mode as ThemeMode
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }

      // React to OS light/dark switches even while the tab stays open.
      media.addEventListener('change', (event) => {
        this.systemDark = event.matches
        if (this.mode === 'system') this.apply()
      })

      this.apply()
    },
    setMode(mode: ThemeMode): void {
      this.mode = isThemeId(mode) ? mode : 'system'
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: this.mode }))
      } catch {
        // Quota/private-mode errors are non-fatal: the choice stays for this session.
      }
      this.apply()
    },
    apply(): void {
      this.resolved =
        this.mode === 'system'
          ? this.systemDark
            ? SYSTEM_DARK_THEME
            : SYSTEM_LIGHT_THEME
          : this.mode

      const meta = metaOf(this.resolved)
      const root = document.documentElement
      root.dataset.theme = this.resolved
      root.style.colorScheme = meta.scheme
      syncThemeColor(meta.themeColor)
    },
  },
})
