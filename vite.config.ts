import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * CORS status of the live providers (verified 2026-11-04):
 * - push2/push2his.eastmoney.com -> echoes the caller Origin, direct call works
 * - web.ifzq.gtimg.cn / qt.gtimg.cn -> `Access-Control-Allow-Origin: *`
 * - feed.mix.sina.com.cn -> no CORS header, so the Sina news feed is routed
 *   through `/api/sina` here (dev server only). Production needs the same
 *   reverse-proxy rule, see docs/05-usage-guide.md.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/sina': {
        target: 'https://feed.mix.sina.com.cn',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/sina/, ''),
        headers: { Referer: 'https://finance.sina.com.cn/' },
      },
    },
  },
})
