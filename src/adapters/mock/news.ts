import type { RawNewsItem } from '@/types'

export type MockNewsChannelId = 'cls-news' | 'news-aggregator'

interface NewsSeed {
  id: string
  title: string
  content: string
  symbol?: string
  /** Hours ago, relative to the fetch time. */
  hoursAgo: number
  channels: MockNewsChannelId[]
}

/**
 * Mock headlines. Text deliberately contains the cues the rule-based event
 * extractor looks for, so the whole pipeline stays demonstrable offline.
 */
const NEWS_SEEDS: NewsSeed[] = [
  {
    id: 'n-300750-01',
    title: '宁德时代与欧洲储能客户签订 5GWh 供货合同',
    content: '公司公告显示，已与欧洲客户正式签约，合同金额约 42 亿元，将于明年开始分批交付。',
    symbol: '300750',
    hoursAgo: 6,
    channels: ['cls-news', 'news-aggregator'],
  },
  {
    id: 'n-002594-01',
    title: '比亚迪海外工厂正式投产，年产能 15 万辆',
    content: '据公司披露，泰国工厂已正式投产，主要供应东南亚市场，预计明年贡献增量销量。',
    symbol: '002594',
    hoursAgo: 15,
    channels: ['cls-news', 'news-aggregator'],
  },
  {
    id: 'n-002594-02',
    title: '比亚迪 9 月新能源汽车销量同比增长 26%',
    content: '公司发布产销快报，9 月新能源汽车销量 41.9 万辆，同比增长 26%，环比增长 8%。',
    symbol: '002594',
    hoursAgo: 30,
    channels: ['cls-news'],
  },
  {
    id: 'n-601899-01',
    title: '铜价维持高位，紫金矿业三季度矿产铜产量创新高',
    content: '受供给扰动影响，铜价维持高位震荡，公司三季度矿产铜产量环比增长 7%，机构预计全年业绩确定性强。',
    symbol: '601899',
    hoursAgo: 52,
    channels: ['news-aggregator'],
  },
  {
    id: 'n-000858-01',
    title: '五粮液提价传闻升温，经销商称尚未接到通知',
    content: '市场传闻公司拟上调核心单品出厂价，但多地经销商表示尚未接到正式通知。',
    symbol: '000858',
    hoursAgo: 8,
    channels: ['cls-news', 'news-aggregator'],
  },
  {
    id: 'n-002415-01',
    title: '海康威视海外业务或面临新一轮限制措施',
    content: '外媒报道称相关方面正在讨论新的出口限制清单，公司回应称尚未收到正式文件。',
    symbol: '002415',
    hoursAgo: 3,
    channels: ['cls-news', 'news-aggregator'],
  },
  {
    id: 'n-002304-01',
    title: '洋河股份渠道库存高企，动销不及预期',
    content: '多地经销商反馈库存周转天数上升，公司三季度回款进度不及预期，机构下调盈利预测。',
    symbol: '002304',
    hoursAgo: 20,
    channels: ['news-aggregator'],
  },
  {
    id: 'n-000001-01',
    title: '平安银行三季度不良率小幅上升，拨备覆盖率下降',
    content: '公司财报显示不良贷款率环比上升 3BP，拨备覆盖率下降，资产质量压力受到市场关注。',
    symbol: '000001',
    hoursAgo: 80,
    channels: ['news-aggregator'],
  },
  {
    id: 'n-600036-01',
    title: '市场预期四季度存在降准窗口，银行板块估值修复',
    content: '多家机构研报认为，若降准落地，银行负债成本有望改善，招商银行等零售银行受益明显。',
    symbol: '600036',
    hoursAgo: 12,
    channels: ['cls-news', 'news-aggregator'],
  },
  {
    id: 'n-600519-01',
    title: '贵州茅台获多家机构上调目标价，批价保持稳定',
    content: '近期多家券商上调公司目标价，飞天批价维持稳定，机构认为估值具备修复空间。',
    symbol: '600519',
    hoursAgo: 40,
    channels: ['news-aggregator'],
  },
  {
    id: 'n-601318-01',
    title: '中国平安公告完成 50 亿元股份回购',
    content: '公司公告称已完成本轮回购，累计回购金额 50 亿元，回购股份将用于员工持股计划。',
    symbol: '601318',
    hoursAgo: 26,
    channels: ['cls-news'],
  },
  {
    id: 'n-300750-02',
    title: '碳酸锂价格回落，电池环节成本压力缓解',
    content: '碳酸锂现货价格本周继续回落，机构认为电池厂商毛利率有望环比改善。',
    symbol: '300750',
    hoursAgo: 60,
    channels: ['news-aggregator'],
  },
  {
    id: 'm-policy-01',
    title: '监管层表态支持中长期资金入市',
    content: '监管层表示将进一步完善长期资金入市配套政策，市场风险偏好有所抬升。',
    hoursAgo: 2,
    channels: ['cls-news', 'news-aggregator'],
  },
  {
    id: 'm-macro-01',
    title: '10 月制造业 PMI 回升至荣枯线上方',
    content: '统计局公布 10 月制造业 PMI 为 50.3，环比回升，生产与新订单指数均有改善。',
    hoursAgo: 18,
    channels: ['news-aggregator'],
  },
]

export function buildNewsItems(channelId: MockNewsChannelId, now: Date): RawNewsItem[] {
  return NEWS_SEEDS.filter((seed) => seed.channels.includes(channelId)).map((seed) => ({
    id: `${channelId}:${seed.id}`,
    sourceId: channelId,
    title: seed.title,
    content: seed.content,
    publishedAt: new Date(now.getTime() - seed.hoursAgo * 3_600_000).toISOString(),
    symbols: seed.symbol ? [seed.symbol] : [],
  }))
}
