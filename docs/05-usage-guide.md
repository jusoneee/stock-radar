# 使用说明

## 1. 环境要求

| 依赖 | 版本 |
| --- | --- |
| Node.js | ≥ 18（实测 26.11） |
| npm | ≥ 9（实测 11.20） |
| 浏览器 | Chrome / Edge / Firefox 最近两个大版本 |

## 2. 安装与运行

```bash
# 1. 进入项目目录
cd stock-radar

# 2. 安装依赖
npm install

# 3. 开发模式（默认 http://localhost:5173）
npm run dev

# 4. 类型检查 + 生产构建，产物在 dist/
npm run build

# 5. 本地预览构建产物（默认 http://localhost:4173）
npm run preview
```

常用脚本：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器，支持热更新 |
| `npm run build` | `vue-tsc --noEmit` 类型检查 + `vite build` |
| `npm run typecheck` | 只做类型检查 |
| `npm run preview` | 预览 `dist/` 产物 |

> 若 `npm install` 因网络失败，可切换镜像后重试：`npm config set registry https://registry.npmmirror.com`。

## 3. 页面使用

### 3.1 仪表盘 `/`

查看产品说明、分析流水线、当前启用渠道数、股票池规模与合规声明。右上角「运行分析」会直接执行一次分析并跳转结果页。

### 3.2 数据源配置 `/channels`

1. **开关渠道**：点击卡片右上角开关，即时生效。页面顶部显示已启用数量。
2. **设置权重**：拖动滑杆（0.05～1.00）。同类型渠道会归一化，卡片下方显示实际占比。
3. **填写密钥**：标记「需密钥」的渠道会显示输入框（如 Tushare、财联社）。密钥只保存在当前页面内存，**刷新页面即清除**。
4. **选择股票池**：点击股票标签切换，至少保留 1 只。
5. **恢复默认**：一键回到默认启用组合（东方财富 + 新浪 + 财联社）。

配置（开关、权重、股票池）会自动写入 localStorage；密钥不会。

### 3.3 分析结果 `/analysis`

- 首次进入会自动运行一次分析。
- 顶部为市场概览与「渠道运行状态」：可看到每个渠道返回条数、耗时与失败原因。
- 中间为推荐表：点击任意标的，右侧详情面板联动。
- 右侧详情包含：价格与走势、指标网格、买卖时机参考、评分构成（含每项依据）、风险提示、相关事件。
- 底部为新闻事件时间线：可按利好/利空筛选，点击「关联标的」跳转到对应个股详情。

### 3.4 典型操作

| 目的 | 操作 |
| --- | --- |
| 只想看新闻驱动 | 数据源页关闭部分行情源，只留高权重的一个；分析页对比事件驱动分变化 |
| 验证多源校验 | 同时启用 3～4 个行情源，观察风险提示中的多源价差 |
| 验证降级 | 关闭全部新闻源 → 事件分固定为 50；关闭全部行情源 → 页面给出明确错误提示 |
| 验证持久化 | 调整配置后刷新页面，开关与权重保持不变，密钥被清空 |

## 4. 目录说明

```
src/
├── adapters/                 # 数据源层
│   ├── types.ts              # 适配器契约与错误类型
│   ├── registry.ts           # 渠道注册表（新增数据源入口）
│   ├── quote/                # 行情适配器：eastmoney / sina / tushare / akshare
│   ├── news/                 # 新闻适配器：cls / aggregator
│   └── mock/                 # 股票池、K 线生成器、新闻语料
├── analysis/                 # 纯逻辑层（不依赖 Vue）
│   ├── indicators.ts         # 技术指标
│   ├── trend.ts              # 趋势状态机
│   ├── scoring.ts            # 加权评分、时机建议、风险标记
│   ├── engine.ts             # 编排：拉取→合并→分析→推荐
│   └── news/                 # extractor / mapper / stage / advice / pipeline
├── stores/                   # Pinia
│   ├── channels.ts           # 渠道配置与持久化
│   └── analysis.ts           # 分析运行状态与报告
├── views/                    # 三个页面
├── components/               # 渠道卡、推荐表、时间线、走势图、徽章、统计块
├── types/index.ts            # 领域模型
├── lib/                      # 格式化与中文标签
├── router/                   # 路由
└── styles/main.css           # 主题样式
```

数据流：`views/components → stores → analysis/engine → adapters`。`analysis` 只接收标准化的 `QuoteSnapshot` / `RawNewsItem`，因此可以整体迁移到服务端运行。

## 5. 如何新增一个数据源适配器

以新增「同花顺行情」为例，共 3 步。

### 第 1 步：实现适配器

新建 `src/adapters/quote/ths.ts`：

```ts
import type { ChannelMeta, QuoteSnapshot } from '@/types'
import { delay, type AdapterContext, type QuoteAdapter } from '@/adapters/types'

const META: ChannelMeta = {
  id: 'ths-quote',            // 全局唯一，配置持久化以此为 key
  name: '同花顺行情',
  kind: 'quote',
  provider: '同花顺',
  description: 'A股行情源，需在服务端代理后接入。',
  requiresKey: false,
  docsUrl: 'https://www.10jqka.com.cn/',
  reliability: 0.88,
  latencyMs: 300,
  simulated: false,           // 真实接入时置为 false
}

export const thsQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    // Real implementation:
    // const res = await fetch(`https://your-gateway.example.com/quote?codes=${symbols.join(',')}`, {
    //   signal: AbortSignal.timeout(ctx.timeoutMs),
    //   headers: { Authorization: `Bearer ${ctx.apiKey}` },
    // })
    // return res.json() 后映射为标准 QuoteSnapshot（含 bars: date/open/high/low/close/volume）
    await delay(META.latencyMs)
    return []
  },
}
```

关键约束：

- **只返回标准结构**：`QuoteSnapshot` 内含 `bars`（日期升序，至少 20 根），不要把厂商字段泄漏到分析层。
- **错误统一抛出** `AdapterError`（`NETWORK` / `TIMEOUT` / `PARSE` / `MISSING_KEY`），编排层会捕获并把失败显示在「渠道运行状态」。
- **密钥从 `ctx.apiKey` 读取**，不要写死在文件里，也不要提交到仓库。
- 真实请求需处理超时（`ctx.timeoutMs`）、限频与重试；必要时走后端代理解决跨域。

### 第 2 步：注册渠道

编辑 `src/adapters/registry.ts`：

```ts
import { thsQuoteAdapter } from './quote/ths'

const ALL_ADAPTERS: ChannelAdapter[] = [
  // ...
  thsQuoteAdapter,
]
```

### 第 3 步：验证

1. 打开 `/channels`，应出现新卡片（默认关闭），权重初始值为 `reliability`；
2. 启用后运行分析，在「渠道运行状态」中确认返回条数与耗时；
3. 若返回空数组，检查是否抛出 `PARSE` 错误，以及 `symbols` 是否为标准 6 位代码。

新闻适配器同理：实现 `NewsAdapter.fetchNews(ctx): Promise<RawNewsItem[]>`，返回标题、正文、发布时间（ISO 格式）与可选的 `symbols`，然后在 `registry.ts` 注册。

### 新增分析规则

- 指标 → `src/analysis/indicators.ts`
- 趋势判定 → `src/analysis/trend.ts`（注意保持状态优先级顺序）
- 评分权重 → `src/analysis/scoring.ts`
- 事件类型/关键词 → `src/analysis/news/extractor.ts`
- 阶段线索 → `src/analysis/news/stage.ts`
- 时机矩阵 → `src/analysis/news/advice.ts`

以上改动不需要触碰页面组件；如新增枚举值，需同步 `src/types/index.ts` 与 `src/lib/labels.ts` 的中文标签。

## 6. 常见问题

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 运行分析提示「未启用任何行情渠道」 | 所有行情源被关闭 | 到 `/channels` 打开至少一个行情源 |
| 新闻事件为空 | 所有新闻源关闭，或新闻未匹配到股票池 | 开启新闻源；或确认新闻正文包含股票名称/代码 |
| 评分与昨天的不完全一致 | 新闻发布时间相对当前时间变化导致阶段判定变化 | 属预期；阶段判定依赖发布时间 |
| 刷新后密钥消失 | 设计如此（密钥只存内存） | 重新输入；生产环境应由后端持钥 |
| `npm install` 卡住 | 网络或 npm 源问题 | 切换镜像后重试 |
| 构建报类型错误 | 修改了类型或未同步标签 | 运行 `npm run typecheck` 定位具体文件 |

## 7. 安全与合规提示

- 仓库内不得出现任何真实 API Key、Cookie、账号密码；`.gitignore` 已排除 `.env` 与常见密钥文件。
- 上线前请补齐后端代理、鉴权与访问审计；前端直连第三方接口存在密钥泄露风险。
- 本工具输出不构成投资建议，对外展示时须保留免责声明。
