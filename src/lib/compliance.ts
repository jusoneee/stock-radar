/**
 * Versioned compliance copy. Bump the version whenever the wording of the
 * disclaimer or the data-source list materially changes so screenshots and
 * exported reports can be traced back to a specific policy revision.
 */
export const COMPLIANCE_VERSION = '1.2.0'
export const COMPLIANCE_UPDATED_AT = '2026-11-05'

export interface ComplianceChange {
  version: string
  date: string
  summary: string
}

export const COMPLIANCE_CHANGELOG: ComplianceChange[] = [
  { version: '1.2.0', date: '2026-11-05', summary: '新增导出、快照对比、评分权重配置与数据源/隐私说明页' },
  { version: '1.1.0', date: '2026-11-04', summary: '接入真实行情与资讯源，补充限频与降级说明' },
  { version: '1.0.0', date: '2026-11-03', summary: '首版免责声明与合规提示' },
]

export const DATA_SOURCE_NOTES = [
  {
    name: '东方财富（行情列表 / 日 K / 快照）',
    scope: '全市场 A 股列表、前复权日线与实时快照',
    auth: '无需密钥，公开接口',
    limit: '列表分页串行/限并发抓取，日 K 每批 3 并发、约 120ms 间隔；结果按交易日缓存',
  },
  {
    name: '腾讯证券（日 K / 快照）',
    scope: '前复权日线与收盘价交叉校验',
    auth: '无需密钥，公开接口',
    limit: '每批 3 并发、约 120ms 间隔，命中缓存时不再请求',
  },
  {
    name: '新浪财经（未复权日 K / 快照 / 资讯）',
    scope: '价格交叉校验与财经资讯标题/时间/链接',
    auth: '无需密钥，但无 CORS，需要同源代理',
    limit: '建议 ≤2 请求/秒；未复权序列仅作校验，不作为主序列',
  },
  {
    name: 'Tushare Pro（可选）',
    scope: '历史日线',
    auth: '需要用户自有 Token',
    limit: '按账号积分限频，适配器串行请求并缓存；Token 仅存内存',
  },
  {
    name: 'AKShare（可选）',
    scope: '历史日线',
    auth: '需自行部署本地代理服务',
    limit: '未部署时渠道明确显示未启用，不返回模拟数据',
  },
  {
    name: '财联社（可选）',
    scope: '分钟级快讯',
    auth: '需签约开放平台账号',
    limit: '当前未接入，仅保留配置位',
  },
]
