import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useChannelsStore } from './stores/channels'
import { useWatchlistStore } from './stores/watchlist'
import { useUniverseStore } from './stores/universe'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Load persisted configuration before the first paint. The universe store only
// reads its local cache here; a network sync is triggered by the watchlist page.
useChannelsStore().init()
useWatchlistStore().init()
useUniverseStore().init()

app.mount('#app')
