/**
 * Run async tasks with a fixed concurrency limit.
 *
 * Public quote endpoints are not rate-limited by contract, so adapters must
 * self-throttle. `spacingMs` adds a small pause before every task after the
 * first slot, keeping the average request rate well below provider thresholds.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  spacingMs = 0,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  const size = Math.max(1, Math.min(limit, items.length))
  let cursor = 0

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      if (index > 0 && spacingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, spacingMs))
      }
      results[index] = await worker(items[index] as T, index)
    }
  }

  await Promise.all(Array.from({ length: size }, run))
  return results
}
