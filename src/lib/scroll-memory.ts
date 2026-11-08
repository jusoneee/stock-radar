import type { Router } from 'vue-router'

/**
 * Keeps one scroll offset per visited path for the current session.
 * Restores after the route flushes and keeps retrying while async data grows
 * the page, so the restored offset is not lost when content arrives late.
 */
export function installScrollMemory(router: Router): () => void {
  const positions = new Map<string, number>()
  let restoreStop: (() => void) | null = null

  const restore = (path: string): void => {
    const target = positions.get(path) ?? 0
    restoreStop?.()
    restoreStop = null
    if (target <= 0) return

    let stopped = false
    const stop = (): void => {
      stopped = true
      restoreStop = null
    }
    const deadline = performance.now() + 2500
    const step = (): void => {
      if (stopped) return
      const reachable = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      if (Math.abs(window.scrollY - target) < 2 && reachable >= target) {
        stop()
        return
      }
      window.scrollTo(0, Math.min(target, reachable))
      if (performance.now() >= deadline && reachable < target) stop()
      else requestAnimationFrame(step)
    }
    restoreStop = stop
    // Two frames: let the router reset to top and the first render flush.
    requestAnimationFrame(() => requestAnimationFrame(step))
  }

  const onIntent = (): void => restoreStop?.()

  // Saving only before navigation avoids persisting offsets caused by the
  // outgoing page collapsing its height (that would overwrite the real offset).
  const removeBefore = router.beforeEach(() => {
    positions.set(router.currentRoute.value.fullPath, window.scrollY)
  })
  const removeAfter = router.afterEach((to) => restore(to.fullPath))

  window.addEventListener('wheel', onIntent, { passive: true })
  window.addEventListener('touchstart', onIntent, { passive: true })
  window.addEventListener('keydown', onIntent)

  return () => {
    restoreStop?.()
    window.removeEventListener('wheel', onIntent)
    window.removeEventListener('touchstart', onIntent)
    window.removeEventListener('keydown', onIntent)
    removeBefore()
    removeAfter()
  }
}
