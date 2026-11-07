<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  COMPLIANCE_CHANGELOG,
  COMPLIANCE_UPDATED_AT,
  COMPLIANCE_VERSION,
  DATA_SOURCE_NOTES,
} from '@/lib/compliance'

type LegalDoc = 'terms' | 'privacy' | 'sources'

const route = useRoute()
const doc = computed<LegalDoc>(() => {
  const value = String(route.params.doc ?? 'terms')
  return value === 'privacy' || value === 'sources' ? value : 'terms'
})

const titles: Record<LegalDoc, string> = {
  terms: '使用条款与免责声明',
  privacy: '隐私与本地数据说明',
  sources: '数据来源、限频与合规提示',
}

const title = computed(() => titles[doc.value])
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>{{ title }}</h1>
        <p>合规文案版本 v{{ COMPLIANCE_VERSION }} · 更新于 {{ COMPLIANCE_UPDATED_AT }}</p>
      </div>
    </header>

    <div v-if="doc === 'terms'" class="card legal-card">
      <h2>服务性质</h2>
      <p>
        Stock Radar 是一个本地运行的 A 股行情与公开资讯分析工具，所有指标、趋势判定、事件阶段与操作参考均由公开数据经规则化计算得出，
        仅用于学习、研究与技术演示。
      </p>
      <p><strong>本项目不构成任何投资建议、投资咨询、要约或承诺，也不对任何交易结果承担责任。</strong></p>
      <h2>使用限制</h2>
      <ul>
        <li>不得将本工具的输出作为唯一决策依据，投资决策应结合自身风险承受能力并咨询持牌专业人士。</li>
        <li>不得用于高频、自动化交易或其他可能违反交易所与数据提供方规则的用途。</li>
        <li>不得绕过数据提供方的鉴权、限频与授权范围；需要商业授权时请自行取得许可。</li>
      </ul>
      <h2>数据与可用性</h2>
      <p>
        行情与资讯来自第三方公开接口，可能存在延迟、缺失、限流或字段调整；本项目不保证数据的完整性、准确性与持续可用性，
        也不保证分析结论适用于任何特定标的或市场环境。
      </p>
    </div>

    <div v-else-if="doc === 'privacy'" class="card legal-card">
      <h2>本地优先</h2>
      <p>
        本项目没有账号体系与云端数据库。自选池、渠道配置、评分权重与分析快照都保存在当前浏览器的 localStorage 中，
        可随时通过页面按钮或清除浏览器数据删除。
      </p>
      <h2>网络请求</h2>
      <p>
        页面会直接或经同源代理请求第三方公开行情/资讯接口；请求中不包含个人身份信息。若自行配置 Tushare 等需要密钥的渠道，
        密钥仅保存在当前会话内存，不写入 localStorage、不进入仓库。
      </p>
      <h2>导出文件</h2>
      <p>
        CSV / JSON / Markdown 导出完全在浏览器本地生成，不会上传到任何服务器。请在分享前自行检查是否包含敏感信息。
      </p>
      <h2>AI 增强</h2>
      <p>
        当前版本的 LLM / NER 增强仅为配置位，默认关闭且不会发起请求。若未来启用，需由使用者自行确认第三方服务的隐私政策与数据处理条款。
      </p>
    </div>

    <div v-else class="card legal-card">
      <h2>数据源清单</h2>
      <div class="table-wrap">
        <table class="snapshot-table">
          <thead>
            <tr><th>数据源</th><th>用途</th><th>鉴权</th><th>限频与保护</th></tr>
          </thead>
          <tbody>
            <tr v-for="source in DATA_SOURCE_NOTES" :key="source.name">
              <td>{{ source.name }}</td>
              <td>{{ source.scope }}</td>
              <td>{{ source.auth }}</td>
              <td>{{ source.limit }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2>限频与风控</h2>
      <p>
        全市场列表按页抓取并限制并发（默认 3），日 K 批量取数同样限制 3 并发并加入请求间隔；所有响应按 TTL 缓存，
        重复分析会优先命中缓存。请勿通过脚本高频重放请求。
      </p>
      <h2>字段稳定性</h2>
      <p>
        公开接口并非正式承诺的 API，字段名与返回结构可能变化。适配器在解析失败或数量异常时会明确报错，不会静默替换为模拟数据；
        模拟渠道（如有）会被显式标注为 simulated。
      </p>
      <h2>合规提醒</h2>
      <p>
        使用前请阅读并遵守各数据提供方的服务条款、robots 协议与授权范围；本项目不提供任何数据再分发授权。
        所有分析结论均为规则化结果，不构成投资建议。
      </p>
    </div>

    <details class="section-collapse">
      <summary>文案版本记录</summary>
      <div class="collapse-body legal-card">
        <ul>
          <li v-for="change in COMPLIANCE_CHANGELOG" :key="change.version">
            v{{ change.version }} · {{ change.date }}：{{ change.summary }}
          </li>
        </ul>
      </div>
    </details>
  </section>
</template>
