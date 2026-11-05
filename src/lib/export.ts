import type { AnalysisReport, NewsAnalysis, Recommendation } from '@/types'
import { adviceLabels, eventTypeLabels, sentimentLabels, stageLabels, trendLabels } from '@/lib/labels'

export const DISCLAIMER =
  '本报告由 stock-radar 基于公开行情与公开资讯自动生成，仅用于研究与学习，不构成任何投资建议或买卖要约。'

function escapeCsv(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/** Build an RFC 4180 style CSV string (callers prepend a BOM for Excel). */
export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function timestampName(report: AnalysisReport): string {
  return report.generatedAt.replace(/[:.]/g, '-').slice(0, 19)
}

function trendText(item: Recommendation): string {
  return trendLabels[item.trend.label]?.text ?? item.trend.label
}

export function exportRecommendationsCsv(report: AnalysisReport): void {
  const headers = [
    '代码',
    '名称',
    '行业',
    '总分',
    '趋势',
    '最新价',
    '1日涨跌%',
    '5日涨跌%',
    '量比',
    '20日区间位置%',
    'MA5',
    'MA10',
    'MA20',
    '相关事件数',
    '数据源数',
    '风险提示',
  ]
  const rows = report.recommendations.map((item) => [
    item.symbol,
    item.name,
    item.sector,
    item.totalScore.toFixed(1),
    trendText(item),
    item.indicators.lastClose,
    item.indicators.pctChange1d,
    item.indicators.pctChange5d,
    item.indicators.volumeRatio,
    (item.indicators.rangePosition * 100).toFixed(0),
    item.indicators.ma5,
    item.indicators.ma10,
    item.indicators.ma20,
    item.news.length,
    item.sourceIds.length,
    item.riskFlags.join('；'),
  ])
  const csv = toCsv(headers, rows)
  downloadText(`stock-radar-${timestampName(report)}.csv`, `\uFEFF${csv}`, 'text/csv')
}

export function exportRecommendationsJson(report: AnalysisReport): void {
  const payload = {
    generatedAt: report.generatedAt,
    disclaimer: DISCLAIMER,
    market: report.market,
    recommendations: report.recommendations.map((item) => ({
      symbol: item.symbol,
      name: item.name,
      sector: item.sector,
      totalScore: item.totalScore,
      trend: { label: item.trend.label, score: item.trend.score, reasons: item.trend.reasons },
      indicators: item.indicators,
      breakdown: item.breakdown,
      entryAdvice: item.entryAdvice,
      riskFlags: item.riskFlags,
      sourceIds: item.sourceIds,
      news: item.news.map((news) => ({
        title: news.title,
        publishedAt: news.publishedAt,
        eventType: news.eventType,
        sentiment: news.sentiment,
        stage: news.stage,
        advice: news.advice,
        stale: news.stale,
        duplicateCount: news.duplicateCount,
        effectiveTradingDay: news.effectiveTradingDay,
      })),
    })),
  }
  downloadText(
    `stock-radar-${timestampName(report)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  )
}

function newsLine(item: NewsAnalysis): string {
  return [
    `- **${item.title}**`,
    `  - 时间：${item.publishedAt} · 来源：${item.sourceId}`,
    `  - 类型：${eventTypeLabels[item.eventType]} · 情绪：${sentimentLabels[item.sentiment].text} · 阶段：${stageLabels[item.stage].text}`,
    `  - 建议：${adviceLabels[item.advice].text}（${item.adviceReason}）`,
    `  - 关联标的：${item.symbols.join('、') || '未映射'}`,
    `  - 时效：${item.ageHours} 小时前${item.stale ? '（旧闻，已降权）' : ''}${item.duplicateCount > 1 ? ` · 合并重复报道 ${item.duplicateCount} 条` : ''}`,
    `  - 影响交易日：${item.effectiveTradingDay}`,
  ].join('\n')
}

/** Full Markdown report: market summary -> candidates -> events -> disclaimer. */
export function exportReportMarkdown(report: AnalysisReport): void {
  const lines: string[] = []
  lines.push(`# stock-radar 分析报告`)
  lines.push('')
  lines.push(`- 生成时间：${report.generatedAt}`)
  lines.push(`- 覆盖标的：${report.market.total} 只（上涨 ${report.market.advances} / 下跌 ${report.market.declines}）`)
  lines.push(`- 平均涨跌：${report.market.avgPctChange}%`)
  lines.push(`- 事件：利好 ${report.market.positiveNews} / 利空 ${report.market.negativeNews}`)
  lines.push('')
  lines.push('## 候选推荐')
  lines.push('')
  lines.push('| 代码 | 名称 | 行业 | 总分 | 趋势 | 最新价 | 1日涨跌 | 量比 | 风险提示 |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const item of report.recommendations) {
    lines.push(
      `| ${item.symbol} | ${item.name} | ${item.sector} | ${item.totalScore.toFixed(1)} | ${trendText(item)} | ${item.indicators.lastClose} | ${item.indicators.pctChange1d}% | ${item.indicators.volumeRatio} | ${item.riskFlags.join('；') || '—'} |`,
    )
  }
  lines.push('')
  lines.push('## 关键事件')
  lines.push('')
  if (report.news.length === 0) {
    lines.push('本次未匹配到关键事件。')
  } else {
    for (const item of report.news.slice(0, 30)) lines.push(newsLine(item))
  }
  lines.push('')
  lines.push('## 合规声明')
  lines.push('')
  lines.push(DISCLAIMER)
  lines.push('')
  downloadText(`stock-radar-${timestampName(report)}.md`, lines.join('\n'), 'text/markdown')
}
