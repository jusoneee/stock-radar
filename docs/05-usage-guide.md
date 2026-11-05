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

查看产品说明、分析流水线、启用渠道数、自选池规模、最近交易日与数据新鲜度、合规声明。右上角「运行分析」会执行一次分析并跳转结果页。

### 3.2 数据源配置 `/channels`

1. **开关渠道**：点击卡片右上角开关，即时生效。页面顶部显示已启用数量。
2. **设置权重**：拖动滑杆（0.05～1.00）。同类型渠道会归一化，卡片下方显示实际占比。
3. **填写密钥**：标记「需密钥」的渠道会显示输入框（如 Tushare、财联社）。密钥只保存在当前页面内存，**刷新页面即清除**。
4. **自选池**：已独立到 `/watchlist` 页面（见 3.3），本页只显示当前池子规模并提供跳转。
5. **恢复默认**：一键回到默认启用组合（东方财富 + 腾讯证券 + 新浪财经资讯）。
6. **请求策略**：可调请求超时（2～60s）、失败重试次数（0～5）、响应缓存 TTL（0～600s）。缓存命中时不会重复请求上游，建议保持 30s 默认值。

配置（开关、权重、超时/重试/缓存）会自动写入 localStorage；密钥不会。

### 3.3 自选池 `/watchlist`

1. **加载全市场列表**：首次进入自动分页抓取沪深 A 股（56 页 / 5563 只，约 4～5s），失败会显示错误与「重试」，不会退回假数据。
2. **搜索新增**：输入 6 位代码或名称关键字（如 `600519`、`茅台`），在结果中点「添加」。搜索在本地缓存上完成，不会逐字请求上游。
3. **维护池子**：单个 `×` 删除、右上角「清空」、「恢复默认」（10 只演示标的）；上限 **50 只**，达到上限后添加按钮禁用。
4. **新鲜度**：顶部显示最近交易日与交易时段（盘中/午间休市/盘前/已收盘/休市）、列表更新时间、缓存有效期、行情时间戳。
5. **缓存**：列表写入 `localStorage`（`stock-radar:universe:v1`），有效期至下一个交易日 09:30；过期后再进入本页会自动刷新，旧数据保留并标注「缓存已过期」。

### 3.4 分析结果 `/analysis`

- 首次进入会自动运行一次分析；若自选池为空，页面展示空状态并引导到 `/watchlist`。
- 顶部显示最近交易日、交易时段、自选池规模、日 K 截至日期与全市场列表更新时间。
- 顶部为市场概览与「渠道运行状态」：可看到每个渠道返回条数、耗时与失败原因。
- 中间为推荐表：点击任意标的，右侧详情面板联动。
- 右侧详情包含：价格与走势、指标网格、买卖时机参考、评分构成（含每项依据）、风险提示、相关事件。
- 底部为新闻事件时间线：可按利好/利空筛选，点击「关联标的」跳转到对应个股详情。

### 3.5 典型操作

| 目的 | 操作 |
| --- | --- |
| 换一批分析标的 | 到 `/watchlist` 搜索新增/删除，再回 `/analysis` 重新分析 |
| 验证空池保护 | 到 `/watchlist` 点「清空」→ 运行分析，应出现明确空池提示 |
| 只想看新闻驱动 | 数据源页关闭部分行情源，只留高权重的一个；分析页对比事件驱动分变化 |
| 验证多源校验 | 同时启用 3～4 个行情源，观察风险提示中的多源价差 |
| 验证降级 | 关闭全部新闻源 → 事件分固定为 50；关闭全部行情源 → 页面给出明确错误提示 |
| 验证持久化 | 调整配置与自选池后刷新页面，二者保持不变，密钥被清空 |

## 4. 真实数据源与部署

### 4.1 已接入的接口

| 渠道 | 接口地址 | 返回内容 | CORS |
| --- | --- | --- | --- |
| 东方财富（全市场列表） | `https://push2.eastmoney.com/api/qt/clist/get` | 沪深 A 股代码/名称/最新价/涨跌幅/时间戳，每页 100 条 | `*`，可直连 |
| 东方财富行情 | `https://push2.eastmoney.com/api/qt/ulist.np/get` | 批量快照（价格/涨跌/成交量/成交额/今开/最高/最低） | 回显 Origin，可直连 |
| 东方财富行情 | `https://push2his.eastmoney.com/api/qt/stock/kline/get` | 前复权日 K（默认 120 根） | 同上 |
| 腾讯证券行情 | `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get` | 前复权日 K | `*` |
| 腾讯证券行情 | `https://qt.gtimg.cn/q=` | 实时快照（GBK 文本） | `*` |
| 新浪财经资讯 | `https://feed.mix.sina.com.cn/api/roll/get` | 滚动资讯 30 条（标题/摘要/时间/来源/链接） | **无**，需代理 |

实测（2026-11-05）：全市场列表 56 页、5563 只，单页 266ms、约 4.2s 完成 56 页；10 只标的全部返回日 K、30 条资讯、3/3 渠道成功，单渠道耗时 176～258ms。

> 东方财富搜索建议 `searchapi.eastmoney.com/api/suggest/get` 实测 HTTP 200、返回含 `PinYin` 的结构，但**无 CORS 头**，未在浏览器端采用；自选池搜索改为本地匹配已缓存的全市场列表。

### 4.2 开发环境

`npm run dev` 已内置 `/api/sina` → `https://feed.mix.sina.com.cn` 的代理（见 [vite.config.ts](../vite.config.ts)），无需额外配置。东方财富（含全市场列表）与腾讯接口返回 CORS 头，浏览器可直连。

### 4.3 静态部署

行情渠道与全市场列表可直接工作；新浪资讯需要同域反向代理，否则该渠道会在「渠道运行状态」中显示失败（不影响行情、自选池与评分）。Nginx 示例：

```nginx
location /api/sina/ {
    proxy_pass https://feed.mix.sina.com.cn/;
    proxy_set_header Host feed.mix.sina.com.cn;
    proxy_set_header Referer https://finance.sina.com.cn/;
}
```

### 4.4 限频与稳定性建议

- 东方财富、腾讯：单次分析中批量取数并发上限 3、每次请求前置约 120ms 间隔；全市场列表并发 3、间隔 150ms。
- 全市场列表：同一交易日内只抓取一次（缓存到下一个交易日 09:30），手动「刷新列表」不要连续点击。
- 新浪资讯：建议 ≤1 请求/秒。
- 保持默认 30s 响应缓存，避免连续点击「重新分析」触发限流。
- 公开接口无官方 SLA，字段可能调整；解析失败会以 `PARSE` 错误出现在渠道状态中，而不是静默返回空数据。

## 5. 目录说明

```
src/
├── adapters/                 # 数据源层
│   ├── types.ts              # 适配器契约与错误类型
│   ├── http.ts               # 统一 HTTP 客户端（超时/重试/缓存/GBK 解码）
│   ├── registry.ts           # 渠道注册表（新增数据源入口）
│   ├── universe/             # 全市场 A 股列表（东方财富 clist，分页抓取）
│   ├── quote/                # 行情适配器：eastmoney / tencent（真实）、sina / tushare / akshare（模拟兜底）
│   ├── news/                 # 新闻适配器：sina（真实）、cls / aggregator（模拟兜底）
│   └── mock/                 # 默认自选池、K 线生成器、新闻语料
├── analysis/                 # 纯逻辑层（不依赖 Vue）
│   ├── indicators.ts         # 技术指标
│   ├── trend.ts              # 趋势状态机
│   ├── scoring.ts            # 加权评分、时机建议、风险标记
│   ├── engine.ts             # 编排：拉取→合并→分析→推荐
│   └── news/                 # extractor / mapper / stage / advice / pipeline
├── stores/                   # Pinia
│   ├── channels.ts           # 渠道配置与持久化
│   ├── watchlist.ts          # 自选池（上限 50、localStorage）
│   ├── universe.ts           # 全市场列表缓存（TTL / 搜索 / 错误态）
│   └── analysis.ts           # 分析运行状态与报告
├── views/                    # 四个页面
├── components/               # 渠道卡、推荐表、时间线、走势图、徽章、统计块
├── types/index.ts            # 领域模型
├── lib/                      # 格式化、中文标签、交易日历、并发控制
├── router/                   # 路由
└── styles/main.css           # 主题样式
```

数据流：`views/components → stores → analysis/engine → adapters`。`analysis` 只接收标准化的 `QuoteSnapshot` / `RawNewsItem`，因此可以整体迁移到服务端运行。

## 6. 如何新增一个数据源适配器

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
- 真实请求统一使用 `src/adapters/http.ts` 的 `fetchJson` / `fetchText`：自动应用 `ctx.timeoutMs`、`ctx.retryCount`、`ctx.cacheTtlMs`，并把失败归一化为 `AdapterError`。
- 跨域受限的接口在 `vite.config.ts` 增加 `server.proxy` 规则；纯静态部署需自行提供同路径反向代理。

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

## 7. 常见问题

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 提示「所有行情渠道均未取到数据」 | 网络不通、被限流或接口结构变化 | 查看「渠道运行状态」里的失败原因；降低刷新频率，等待缓存 TTL 结束再试 |
| 自选池页提示「全市场列表抓取不完整」 | 分页请求部分失败（限流/网络抖动） | 点击「重试」；避免连续刷新，等待 1～2 分钟后重试 |
| 自选池搜索无结果 | 全市场列表尚未加载成功 | 先点「加载全市场列表」；错误态下搜索框会禁用 |
| 运行分析提示自选池为空 | 池子被清空或旧数据被删除 | 到 `/watchlist` 搜索新增，或「恢复默认」 |
| 顶部提示「全市场列表缓存已过期」 | 已跨交易日或超过缓存有效期 | 进入 `/watchlist` 会自动刷新，也可手动「刷新列表」 |
| 新浪资讯渠道失败，行情正常 | 接口无 CORS 头且未配置代理 | 开发环境用 `npm run dev`；静态部署按 4.3 配置 `/api/sina` 反向代理 |
| 渠道卡片显示「模拟数据」 | 该渠道为离线兜底实现 | 在 `/channels` 关闭模拟渠道，只保留「真实数据」渠道 |
| 运行分析提示「未启用任何行情渠道」 | 所有行情源被关闭 | 到 `/channels` 打开至少一个行情源 |
| 新闻事件为空 | 所有新闻源关闭，或新闻未匹配到股票池 | 开启新闻源；或确认新闻正文包含股票名称/代码 |
| 评分与昨天的不完全一致 | 新闻发布时间相对当前时间变化导致阶段判定变化 | 属预期；阶段判定依赖发布时间 |
| 刷新后密钥消失 | 设计如此（密钥只存内存） | 重新输入；生产环境应由后端持钥 |
| `npm install` 卡住 | 网络或 npm 源问题 | 切换镜像后重试 |
| 构建报类型错误 | 修改了类型或未同步标签 | 运行 `npm run typecheck` 定位具体文件 |

## 8. 安全与合规提示

- 仓库内不得出现任何真实 API Key、Cookie、账号密码；`.gitignore` 已排除 `.env` 与常见密钥文件。
- 自选池与全市场列表仅保存在浏览器 `localStorage`，不上传服务器；清除浏览器数据会丢失配置。
- 上线前请补齐后端代理、鉴权与访问审计；前端直连第三方接口存在密钥泄露风险。
- 本工具输出不构成投资建议，对外展示时须保留免责声明。
