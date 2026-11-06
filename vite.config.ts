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
 * - money.finance.sina.com.cn / hq.sinajs.cn -> no CORS header, routed through
 *   `/api/sina-kline` and `/api/sina-hq` (GBK text needs the Referer header).
 * - api.tushare.pro -> optional POST proxy for users who provide a token.
 */
export default defineConfig({
  // GitHub Pages serves project sites from https://<user>.github.io/<repo>/.
  // Self-hosted proxy deployments can override with `VITE_BASE_PATH=/`.
  base: process.env.VITE_BASE_PATH ?? '/stock-radar/',
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
      '/api/sina-kline': {
        target: 'https://money.finance.sina.com.cn',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/sina-kline/, ''),
        headers: { Referer: 'https://finance.sina.com.cn/' },
      },
      '/api/sina-hq': {
        target: 'https://hq.sinajs.cn',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/sina-hq/, ''),
        headers: { Referer: 'https://finance.sina.com.cn/' },
      },
      '/api/tushare': {
        target: 'https://api.tushare.pro',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/tushare/, ''),
      },
      // User-defined sources go through the local allow-list proxy
      // (server/proxy.mjs, `npm run proxy`). No target is configured per user;
      // the target arrives as a validated `target` query parameter.
      '/api/custom': {
        target: 'http://localhost:8787',
        changeOrigin: false,
      },
    },
  },
})
