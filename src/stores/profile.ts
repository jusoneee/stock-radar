import { defineStore } from 'pinia'

/** Emoji presets keep the local avatar lightweight (no upload / no server). */
export const AVATAR_OPTIONS = ['🐷', '🦊', '🐯', '🐼', '🦉', '🐳', '🦄', '🦁']

export interface LocalProfile {
  nickname: string
  email: string
  avatar: string
  focus: string
}

const STORAGE_KEY = 'stock-radar:local-profile:v1'

const EMPTY_PROFILE: LocalProfile = {
  nickname: '',
  email: '',
  avatar: AVATAR_OPTIONS[0]!,
  focus: '',
}

function normalize(input: Partial<LocalProfile> | null | undefined): LocalProfile {
  const nickname = typeof input?.nickname === 'string' ? input.nickname.trim().slice(0, 16) : ''
  const email = typeof input?.email === 'string' ? input.email.trim().slice(0, 80) : ''
  const focus = typeof input?.focus === 'string' ? input.focus.trim().slice(0, 40) : ''
  const avatar =
    typeof input?.avatar === 'string' && AVATAR_OPTIONS.includes(input.avatar)
      ? input.avatar
      : AVATAR_OPTIONS[0]!
  return { nickname, email, avatar, focus }
}

/**
 * Purely local, simulated account.
 *
 * There is no backend: the "session" is a boolean in localStorage, and no
 * password / token / server-side auth is involved. Logging out removes the
 * stored profile from this device.
 */
export const useProfileStore = defineStore('profile', {
  state: () => ({
    initialized: false,
    loggedIn: false,
    profile: { ...EMPTY_PROFILE } as LocalProfile,
  }),
  getters: {
    avatar(): string {
      return this.profile.avatar || AVATAR_OPTIONS[0]!
    },
    initial(): string {
      return this.profile.nickname.trim().slice(0, 1).toUpperCase() || '我'
    },
  },
  actions: {
    init(): void {
      if (this.initialized) return
      this.initialized = true
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as { loggedIn?: unknown; profile?: Partial<LocalProfile> }
        const profile = normalize(parsed.profile)
        if (parsed.loggedIn === true && profile.nickname) {
          this.loggedIn = true
          this.profile = profile
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    },
    save(profile: LocalProfile): void {
      this.profile = normalize(profile)
      this.loggedIn = Boolean(this.profile.nickname)
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ loggedIn: this.loggedIn, profile: this.profile }),
        )
      } catch {
        // Quota / private mode: the session still works until reload.
      }
    },
    logout(): void {
      this.loggedIn = false
      this.profile = { ...EMPTY_PROFILE }
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Non-fatal: state is already cleared for this session.
      }
    },
  },
})
