import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/trenches' },
  {
    path: '/trenches',
    name: 'trenches',
    component: () => import('@/pages/TrenchesPage.vue'),
    meta: { title: '探方清单' }
  },
  {
    path: '/strata',
    name: 'strata',
    component: () => import('@/pages/StrataPage.vue'),
    meta: { title: '地层单位编目' }
  },
  {
    path: '/artifacts',
    name: 'artifacts',
    component: () => import('@/pages/ArtifactsPage.vue'),
    meta: { title: '出土物登记' }
  },
  {
    path: '/relations',
    name: 'relations',
    component: () => import('@/pages/RelationsPage.vue'),
    meta: { title: '层位关系' }
  },
  {
    path: '/sections',
    name: 'sections',
    component: () => import('@/pages/SectionsPage.vue'),
    meta: { title: '四壁剖面示意' }
  },
  { path: '/:pathMatch(.*)*', redirect: '/trenches' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? '考古探方地层编目台'
  document.title = `${title} · 考古探方地层编目台`
})

export default router
