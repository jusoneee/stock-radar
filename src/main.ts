import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useChannelsStore } from './stores/channels'
import { useWatchlistStore } from './stores/watchlist'
import { useUniverseStore } from './stores/universe'
import { useSnapshotsStore } from './stores/snapshots'
import { useStorageStore } from './stores/storage'
import { flushStorage, initAppStorage, isStorageReady, useLocalStorageFallback } from './lib/storage'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Small configuration values still come from localStorage and can be read
// synchronously. Large datasets are hydrated right after the first paint.
useChannelsStore().init()
useStorageStore().init()
useWatchlistStore().init()
useUniverseStore().init()
useSnapshotsStore().init()

app.mount('#app')

const HYDRATION_TIMEOUT_MS = 5000

/**
 * Hydrate large datasets in the background. The shell is already mounted, so a
 * slow or blocked IndexedDB never delays (or blanks) the first frame; stores
 * re-read persisted values once hydration completes.
 */
async function bootstrapStorage(): Promise<void> {
  let timer: number | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = window.setTimeout(() => {
      if (!isStorageReady()) {
        useLocalStorageFallback('IndexedDB 初始化超时，已回退到 localStorage（容量有限，建议刷新页面重试）。')
      }
      resolve()
    }, HYDRATION_TIMEOUT_MS)
  })

  try {
    await Promise.race([initAppStorage(), timeout])
  } catch {
    useLocalStorageFallback('本地存储初始化失败，已回退到 localStorage（容量有限）。')
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }

  useStorageStore().init()
  useWatchlistStore().rehydrateFromStorage()
  useUniverseStore().rehydrateFromStorage()
  useSnapshotsStore().rehydrateFromStorage()
  await flushStorage()
}

void bootstrapStorage()
