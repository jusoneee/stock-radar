import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: '仪表盘' },
    },
    {
      path: '/watchlist',
      name: 'watchlist',
      component: () => import('@/views/WatchlistView.vue'),
      meta: { title: '自选池' },
    },
    {
      path: '/compare',
      name: 'compare',
      component: () => import('@/views/CompareView.vue'),
      meta: { title: '多股对比' },
    },
    {
      path: '/stock/:symbol',
      name: 'stock',
      component: () => import('@/views/StockDetailView.vue'),
      meta: { title: '个股详情' },
    },
    {
      path: '/channels',
      name: 'channels',
      component: () => import('@/views/ChannelsView.vue'),
      meta: { title: '数据源配置' },
    },
    {
      path: '/analysis',
      name: 'analysis',
      component: () => import('@/views/AnalysisView.vue'),
      meta: { title: '分析结果' },
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
