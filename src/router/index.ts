import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: '概览' },
    },
    {
      path: '/sectors',
      name: 'sectors',
      component: () => import('@/views/SectorRankView.vue'),
      meta: { title: '行业排行' },
    },
    {
      path: '/index/:code',
      name: 'index-detail',
      component: () => import('@/views/IndexDetailView.vue'),
      meta: { title: '指数详情' },
    },
    {
      path: '/sector/:name',
      name: 'sector-detail',
      component: () => import('@/views/SectorDetailView.vue'),
      meta: { title: '行业详情' },
    },
    {
      path: '/watchlist',
      name: 'watchlist',
      component: () => import('@/views/WatchlistView.vue'),
      meta: { title: '收藏' },
    },
    {
      path: '/compare',
      name: 'compare',
      component: () => import('@/views/CompareView.vue'),
      meta: { title: '对比' },
    },
    {
      path: '/screener',
      name: 'screener',
      component: () => import('@/views/ScreenerView.vue'),
      meta: { title: '选股筛选' },
    },
    {
      path: '/sources',
      name: 'sources',
      component: () => import('@/views/SourcesView.vue'),
      meta: { title: '数据源管理' },
    },
    {
      path: '/stock/:symbol',
      name: 'stock',
      component: () => import('@/views/StockDetailView.vue'),
      meta: { title: '个股详情' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: '设置' },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue'),
      meta: { title: '关于' },
    },
    {
      // Old links/README references keep working.
      path: '/channels',
      redirect: '/settings',
    },
    {
      path: '/analysis',
      name: 'analysis',
      component: () => import('@/views/AnalysisView.vue'),
      meta: { title: '分析' },
    },
    {
      path: '/legal/:doc',
      name: 'legal',
      component: () => import('@/views/LegalView.vue'),
      meta: { title: '合规与数据来源' },
    },
    {
      // Unknown hashes must not render a blank page.
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
