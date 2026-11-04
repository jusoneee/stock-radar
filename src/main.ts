import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useChannelsStore } from './stores/channels'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Load persisted channel configuration before the first paint.
useChannelsStore().init()

app.mount('#app')
