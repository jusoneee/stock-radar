import { describe, expect, it } from 'vitest'
import { analyzeNews } from '@/analysis/news/pipeline'
import { extractEvent } from '@/analysis/news/extractor'
import { makeNewsItem, evaluateFixtureSet } from './helpers'

const NOW = new Date('2026-11-05T04:00:00Z')

describe('news pipeline', () => {
  it('clusters near-duplicate headlines from different outlets', () => {
    const items = [
      makeNewsItem(1, '公司中标重大项目公告', '2026-11-05T03:00:00Z'),
      { ...makeNewsItem(2, '公司中标重大项目正式公告', '2026-11-05T03:10:00Z'), sourceId: 'eastmoney-news' },
    ]
    const result = analyzeNews(items, [], { 'test-news': 1, 'eastmoney-news': 0.8 }, NOW)
    expect(result).toHaveLength(1)
    expect(result[0]!.duplicateCount).toBe(2)
  })

  it('marks old coverage as stale and aligns it to a trading day', () => {
    const item = makeNewsItem(3, '公司获得政府补贴', '2026-11-01T02:00:00Z')
    const result = analyzeNews([item], [], { 'test-news': 1 }, NOW)
    expect(result[0]!.stale).toBe(true)
    expect(result[0]!.ageHours).toBeGreaterThan(72)
    expect(result[0]!.effectiveTradingDay).toBe('2026-11-02')
  })

  it('keeps fresh coverage out of the stale bucket', () => {
    const item = makeNewsItem(4, '公司签约海外订单', '2026-11-05T02:30:00Z')
    const result = analyzeNews([item], [], { 'test-news': 1 }, NOW)
    expect(result[0]!.stale).toBe(false)
  })
})

describe('event extraction fixture set', () => {
  it('contains at least 50 hand-labelled samples', () => {
    const stats = evaluateFixtureSet()
    expect(stats.total).toBeGreaterThanOrEqual(50)
  })

  it('keeps event-type accuracy above 85%', () => {
    const stats = evaluateFixtureSet()
    expect(stats.typeHits / stats.total).toBeGreaterThanOrEqual(0.85)
  })

  it('keeps sentiment accuracy above 85%', () => {
    const stats = evaluateFixtureSet()
    expect(stats.sentimentHits / stats.total).toBeGreaterThanOrEqual(0.85)
  })

  it('returns a deterministic keyword set for a sample', () => {
    const result = extractEvent({
      id: 'x',
      sourceId: 'fixture',
      title: '公司中标重大项目',
      content: '签订供货合同',
      publishedAt: '2026-11-05T09:00:00+08:00',
    })
    expect(result.eventType).toBe('contract')
    expect(result.sentiment).toBe('positive')
    expect(result.keywords).toContain('中标')
  })
})
