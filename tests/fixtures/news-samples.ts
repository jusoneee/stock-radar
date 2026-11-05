import type { EventType, Sentiment } from '@/types'

export interface NewsSample {
  title: string
  content: string
  /** Expected dominant event type. */
  eventType: EventType
  /** Expected sentiment label. */
  sentiment: Sentiment
}

/**
 * Hand-labelled regression set (55 samples) covering every event type.
 * The rule extractor is deterministic, so this file doubles as documentation of
 * the expected behaviour; a rule change that breaks labels must update the set
 * deliberately instead of silently lowering the bar.
 */
export const NEWS_SAMPLES: NewsSample[] = [
  { title: '央行宣布降准0.25个百分点', content: '释放流动性，支持实体经济发展', eventType: 'policy', sentiment: 'positive' },
  { title: '监管部门发布新规限制减持', content: '规范大股东减持行为', eventType: 'policy', sentiment: 'negative' },
  { title: '新能源汽车补贴政策延续', content: '补贴延长一年，支持消费', eventType: 'policy', sentiment: 'positive' },
  { title: '证监会启动上市公司监管试点', content: '试点方案支持中长期资金入市', eventType: 'policy', sentiment: 'positive' },
  { title: '增值税优惠政策落地', content: '减税支持中小企业', eventType: 'policy', sentiment: 'positive' },
  { title: '交易所发布降费政策', content: '降低市场参与成本', eventType: 'policy', sentiment: 'neutral' },
  { title: '监管部门出台支持并购重组政策', content: '鼓励产业整合', eventType: 'policy', sentiment: 'positive' },
  { title: '贵州茅台业绩预增公告', content: '净利润同比增长约20%', eventType: 'earnings', sentiment: 'positive' },
  { title: '公司财报净利润下滑', content: '营收下降，利润承压', eventType: 'earnings', sentiment: 'negative' },
  { title: '季度营收创新高', content: '同比增长超预期', eventType: 'earnings', sentiment: 'positive' },
  { title: '业绩快报不及预期', content: '净利润下调', eventType: 'earnings', sentiment: 'negative' },
  { title: '公司发布产销数据', content: '销量同比增长', eventType: 'earnings', sentiment: 'positive' },
  { title: '半年报净利润大幅下降', content: '营收同步回落', eventType: 'earnings', sentiment: 'negative' },
  { title: '公司业绩说明会预告增长', content: '管理层上调全年指引', eventType: 'earnings', sentiment: 'positive' },
  { title: '年报披露完成', content: '营收数据确认', eventType: 'earnings', sentiment: 'positive' },
  { title: '公司中标重大项目', content: '签订供货合同', eventType: 'contract', sentiment: 'positive' },
  { title: '获得采购订单', content: '合同金额超预期', eventType: 'contract', sentiment: 'positive' },
  { title: '签订战略合作协议', content: '项目正式落地', eventType: 'contract', sentiment: 'positive' },
  { title: '项目交付完成', content: '客户验收通过', eventType: 'contract', sentiment: 'positive' },
  { title: '合同终止公告', content: '项目取消', eventType: 'contract', sentiment: 'negative' },
  { title: '中标金额不及预期', content: '订单规模下调', eventType: 'contract', sentiment: 'negative' },
  { title: '签约落地', content: '正式公告合同', eventType: 'contract', sentiment: 'positive' },
  { title: '供货协议取消', content: '客户终止采购', eventType: 'contract', sentiment: 'negative' },
  { title: '拟收购标的公司股权', content: '交易尚待审批', eventType: 'mna', sentiment: 'neutral' },
  { title: '完成重大资产重组', content: '并购落地', eventType: 'mna', sentiment: 'positive' },
  { title: '回购股份方案获批', content: '回购金额上调', eventType: 'mna', sentiment: 'positive' },
  { title: '股权转让终止', content: '收购计划取消', eventType: 'mna', sentiment: 'negative' },
  { title: '参股新能源子公司', content: '股权比例提升', eventType: 'mna', sentiment: 'neutral' },
  { title: '上市公司被收购', content: '要约收购完成', eventType: 'mna', sentiment: 'positive' },
  { title: '资产重组传闻', content: '消息人士称正在讨论', eventType: 'mna', sentiment: 'neutral' },
  { title: '发布新一代技术产品', content: '研发完成，专利获批', eventType: 'product', sentiment: 'positive' },
  { title: '新产线正式投产', content: '产能释放', eventType: 'product', sentiment: 'positive' },
  { title: '研发投入同比增长', content: '技术突破', eventType: 'product', sentiment: 'positive' },
  { title: '新品量产进度不及预期', content: '产能爬坡延迟', eventType: 'product', sentiment: 'negative' },
  { title: '专利技术获得支持', content: '政策扶持研发', eventType: 'product', sentiment: 'positive' },
  { title: '产能扩张项目完成', content: '投产仪式举行', eventType: 'product', sentiment: 'positive' },
  { title: '技术发布会取消', content: '新品上市推迟', eventType: 'product', sentiment: 'negative' },
  { title: '碳酸锂价格回落', content: '库存下降，上游压力缓解', eventType: 'supply-chain', sentiment: 'negative' },
  { title: '铜价上涨带动成本上行', content: '原材料涨价', eventType: 'supply-chain', sentiment: 'neutral' },
  { title: '原材料价格高企', content: '下游成本压力加大', eventType: 'supply-chain', sentiment: 'negative' },
  { title: '产品提价公告', content: '价格上调', eventType: 'supply-chain', sentiment: 'positive' },
  { title: '库存高企', content: '上游去库存压力', eventType: 'supply-chain', sentiment: 'negative' },
  { title: '硅料价格下降', content: '下游成本改善', eventType: 'supply-chain', sentiment: 'negative' },
  { title: '公司被立案调查', content: '涉嫌信息披露违规', eventType: 'risk', sentiment: 'negative' },
  { title: '收到行政处罚决定', content: '因违规被处罚', eventType: 'risk', sentiment: 'negative' },
  { title: '大股东减持计划公布', content: '拟减持股份', eventType: 'risk', sentiment: 'negative' },
  { title: '面临退市风险', content: '连续亏损', eventType: 'risk', sentiment: 'negative' },
  { title: '产品召回公告', content: '存在安全风险', eventType: 'risk', sentiment: 'negative' },
  { title: '诉讼败诉', content: '业绩承压', eventType: 'risk', sentiment: 'negative' },
  { title: '澄清市场传闻', content: '相关消息不实', eventType: 'risk', sentiment: 'negative' },
  { title: '停产整改', content: '生产线受限', eventType: 'risk', sentiment: 'negative' },
  { title: '公司召开股东大会', content: '审议日常议案', eventType: 'other', sentiment: 'neutral' },
  { title: '董事长任期届满', content: '管理层正常更替', eventType: 'other', sentiment: 'neutral' },
  { title: '获得财政补贴', content: '支持研发投入', eventType: 'policy', sentiment: 'positive' },
  { title: '公司参加行业展会', content: '展示产品方案', eventType: 'other', sentiment: 'neutral' },
]
