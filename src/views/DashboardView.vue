<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChannelsStore } from '@/stores/channels'
import { useAnalysisStore } from '@/stores/analysis'
import { STOCK_UNIVERSE } from '@/adapters/mock/universe'
import StatTile from '@/components/StatTile.vue'

const router = useRouter()
const channels = useChannelsStore()
const analysis = useAnalysisStore()

const pipeline = [
  { step: '01', title: '渠道选择', desc: '按行情源 / 新闻源分类，开关渠道并设置权重，配置持久化到本地。' },
  { step: '02', title: '多源拉取', desc: '并行调用适配器，按权重合并收盘价，单渠道失败自动降级。' },
  { step: '03', title: '双引擎分析', desc: '行情侧计算均线 / 量比 / 区间突破；新闻侧做事件抽取、情绪与阶段判定。' },
  { step: '04', title: '推荐输出', desc: '趋势 + 事件共振打分，输出候选列表、买卖时机参考与风险提示。' },
]

const modules = [
  {
    title: '行情趋势分析',
    tag: 'quote engine',
    points: [
      'MA5 / MA10 / MA20 均线结构与 5 日动量',
      '量比与 20 日区间位置，识别放量突破',
      '趋势状态机：强势上行 / 温和上行 / 震荡 / 回调 / 下行',
    ],
  },
  {
    title: '新闻事件分析',
    tag: 'news engine',
    points: [
      '规则化事件抽取：政策、业绩、订单、并购、风险等',
      '情绪标签与个股映射（显式代码优先，其次名称匹配）',
      '事件生命周期：发酵 → 确认 → 衰退，并给出时机参考',
    ],
  },
]

const newsChannelCount = computed(() => channels.newsCatalog.length)
const quoteChannelCount = computed(() => channels.quoteCatalog.length)
</script>

<template>
  <section class="page">
    <div class="hero card">
      <div class="hero-copy">
        <span class="eyebrow">FRAMEWORK EDITION · 模拟数据</span>
        <h1>把「行情趋势」和「新闻事件」放在同一张雷达图上</h1>
        <p>
          选择你信任的信息渠道，Stock Radar 会并行拉取行情与新闻，先判断个股处于什么趋势，再推断事件处于
          发酵 / 确认 / 衰退 哪个阶段，最后给出可解释的候选清单与时机参考。
        </p>
        <div class="hero-actions">
          <button class="btn btn-primary" @click="router.push('/channels')">配置数据源</button>
          <button class="btn btn-ghost" @click="router.push('/analysis')">查看分析结果</button>
        </div>
      </div>
      <div class="hero-panel">
        <p class="hero-panel-title">当前配置</p>
        <dl>
          <div><dt>行情渠道</dt><dd>{{ channels.quoteSettings.length }} / {{ quoteChannelCount }}</dd></div>
          <div><dt>新闻渠道</dt><dd>{{ channels.newsSettings.length }} / {{ newsChannelCount }}</dd></div>
          <div><dt>股票池</dt><dd>{{ channels.symbols.length }} 只</dd></div>
          <div><dt>最近分析</dt><dd>{{ analysis.report ? '已生成' : '尚未运行' }}</dd></div>
        </dl>
        <button class="btn btn-secondary full" :disabled="analysis.loading" @click="analysis.run()">
          {{ analysis.loading ? '正在拉取与分析…' : '立即运行一次' }}
        </button>
        <p v-if="analysis.error" class="inline-error">{{ analysis.error }}</p>
      </div>
    </div>

    <div class="stat-grid">
      <StatTile label="启用渠道" :value="channels.enabledCount" hint="可在数据源页随时调整" tone="neutral" />
      <StatTile label="覆盖标的" :value="channels.symbols.length" hint="演示用 A 股池" tone="neutral" />
      <StatTile
        label="最高评分"
        :value="analysis.report ? analysis.topScore.toFixed(1) : '—'"
        hint="趋势 40% + 事件 15% 等加权"
        tone="up"
      />
      <StatTile
        label="事件条数"
        :value="analysis.report ? analysis.report.news.length : '—'"
        hint="去重后的新闻事件"
        tone="warn"
      />
    </div>

    <div class="card">
      <header class="card-head">
        <h2>分析流水线</h2>
        <span class="tag">adapters → analysis → stores → views</span>
      </header>
      <div class="pipeline">
        <div v-for="item in pipeline" :key="item.step" class="pipeline-step">
          <span class="step-index">{{ item.step }}</span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.desc }}</p>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div v-for="module in modules" :key="module.title" class="card">
        <header class="card-head">
          <h2>{{ module.title }}</h2>
          <span class="tag">{{ module.tag }}</span>
        </header>
        <ul class="bullet-list">
          <li v-for="point in module.points" :key="point">{{ point }}</li>
        </ul>
      </div>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>演示股票池</h2>
        <span class="tag">{{ STOCK_UNIVERSE.length }} 只 · 模拟</span>
      </header>
      <div class="stock-pool">
        <div v-for="stock in STOCK_UNIVERSE" :key="stock.symbol" class="pool-item">
          <strong>{{ stock.name }}</strong>
          <span>{{ stock.symbol }} · {{ stock.sector }}</span>
        </div>
      </div>
    </div>

    <div class="notice">
      <strong>合规声明</strong>
      <p>
        本项目为产品框架与算法演示，所有行情、新闻与评分均由本地模拟数据生成，不构成投资建议。
        接入真实数据前，请确认数据源授权范围，并遵守《证券法》及交易所信息披露相关规定。
      </p>
    </div>
  </section>
</template>
