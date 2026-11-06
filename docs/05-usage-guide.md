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

# 3. 开发模式（默认 http://localhost:5173/stock-radar/，base 与 Pages 一致）
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
| `npm test` | vitest 单测（32 条，覆盖指标/趋势/评分/新闻/日历/适配器） |
| `npm run test:watch` | vitest 监听模式 |
| `npm run proxy` | 零依赖 Node 代理 + 托管 `dist/`（默认 8787） |

> 若 `npm install` 因网络失败，可切换镜像后重试：`npm config set registry https://registry.npmmirror.com`。

## 3. 页面使用

### 3.1 仪表盘 `/`

查看产品说明、分析流水线、启用渠道数、自选池规模、最近交易日与数据新鲜度、合规声明。右上角「运行分析」会执行一次分析并跳转结果页。

### 3.2 数据源配置 `/channels`

1. **开关渠道**：点击卡片右上角开关，即时生效。页面顶部显示已启用数量。
2. **设置权重**：拖动滑杆（0.05～1.00）。同类型渠道会归一化，卡片下方显示实际占比。
3. **填写密钥**：标记「需密钥」的渠道会显示输入框（如 Tushare、财联社）。密钥只保存在当前页面内存，**刷新页面即清除**。
4. **自选池**：已独立到 `/watchlist` 页面（见 3.3），本页只显示当前池子规模并提供跳转。
5. **评分权重**：五维权重（趋势结构 / 动量 / 量能 / 区间 / 事件）可拖动滑杆调整，页面实时显示归一化占比；「恢复默认」回到 40/15/15/15/15。
6. **AI 增强（未启用）**：提供 LLM 服务地址与 API Key 配置位，**默认关闭**，需要外部凭据；当前事件抽取仍以规则为主，不会伪造 LLM 结果。
7. **恢复默认**：一键回到默认启用组合（东方财富 + 腾讯证券 + 新浪财经资讯）。
8. **请求策略**：可调请求超时（2～60s）、失败重试次数（0～5）、响应缓存 TTL（0～600s）。缓存命中时不会重复请求上游，建议保持 30s 默认值。
9. **自定义数据源**：页面中部「自定义数据源」可新增/编辑/删除用户自己的行情或资讯接口，详见 3.7。

配置（开关、权重、评分权重、超时/重试/缓存）会自动写入 localStorage；密钥不会。

### 3.3 自选池 `/watchlist`

1. **加载全市场列表**：首次进入自动分页抓取沪深 + 北交所（约 60 页 / 5927 只，约 4～5s），失败会显示失败页号与「重试」，不会退回假数据。
2. **搜索新增**：输入 6 位代码或名称关键字（如 `600519`、`茅台`、`920992`），在结果中点「添加」。搜索在本地缓存上完成，不会逐字请求上游。
3. **分组与排序**：每只标的可填写分组名（默认「未分组」），顶部按分组筛选；排序支持手动顺序 / 名称 / 代码 / 添加时间，也可用上/下移微调顺序（仅手动顺序模式可用），设置会持久化。
4. **维护池子**：单个 `×` 删除、右上角「清空」、「恢复默认」（10 只演示标的）；上限 **50 只**，达到上限后添加按钮禁用。
5. **状态标签**：ST、停牌、北交所（`bj`）与行业标签直接来自全市场列表，便于识别风险标的。
6. **新鲜度**：顶部显示最近交易日与交易时段（盘中/午间休市/盘前/已收盘/休市）、列表更新时间、缓存有效期、行情时间戳。
7. **缓存**：列表写入 `localStorage`（`stock-radar:universe:v1`），有效期至下一个交易日 09:30；过期后再进入本页会自动刷新，旧数据保留并标注「缓存已过期」。
8. **收藏**：卡片右上角星标可切换收藏；勾选「只看收藏」后仅显示已收藏标的。旧版本数据迁移时缺省视为已收藏。
9. **多选预览**：点击卡片上的「对比」把标的加入多选（2～6 只），页面底部出现并列预览卡：迷你走势、最新价、20 日涨跌、20 日均量、5 日方向概率与 MAPE、新闻摘要；单卡加载失败可点「重试」。选满 6 只后其余按钮禁用。
10. **进入详情**：点击股票名称进入 `/stock/:symbol`。

### 3.4 分析结果 `/analysis`

- 首次进入会自动运行一次分析；若自选池为空，页面展示空状态并引导到 `/watchlist`。
- 顶部显示最近交易日、交易时段、自选池规模、日 K 截至日期与全市场列表更新时间。
- 市场概览与「渠道运行状态」：可看到每个渠道返回条数、耗时与失败原因（失败显示错误码，不静默降级）。
- **筛选与排序**：按行业、趋势状态、评分区间、事件阶段、新闻情绪筛选，并按评分 / 当日涨跌 / 量比 / 名称排序；「重置」清除全部条件。
- **推荐表**：点击任意标的，右侧详情面板联动。
- **详情面板**：价格与走势、K 线图（蜡烛 + MA5/10/20 + 成交量，最近 60 根）、指标网格、买卖时机参考、评分构成（含每项依据）、风险提示、相关事件。
- **导出**：推荐列表可导出 CSV / JSON（含 BOM 与免责声明）；单股报告可导出 Markdown。
- **快照对比**：可保存当前分析快照（localStorage 最多 8 条），展示评分、趋势与事件阶段相对上一轮的变化。
- **新闻时间线**：可按利好/利空筛选，显示「影响交易日」「旧闻降权」「合并 N 条重复报道」标签；点击「关联标的」跳转到对应个股详情。

### 3.5 典型操作

| 目的 | 操作 |
| --- | --- |
| 换一批分析标的 | 到 `/watchlist` 搜索新增/删除，再回 `/analysis` 重新分析 |
| 验证分组与排序 | 给标的填不同分组，切换分组筛选与排序方式，刷新后确认保留 |
| 验证空池保护 | 到 `/watchlist` 点「清空」→ 运行分析，应出现明确空池提示 |
| 只想看新闻驱动 | 数据源页关闭部分行情源，只留高权重的一个；分析页对比事件驱动分变化 |
| 验证多源校验 | 同时启用 3～4 个行情源，观察风险提示中的多源价差（新浪为未复权，仅比收盘价） |
| 验证权重 | 在 `/channels` 调整评分权重后重新分析，确认评分构成与排序变化 |
| 验证导出 | 分析页点「导出 CSV / JSON」，用表格软件打开确认中文与免责声明正常 |
| 验证快照 | 运行两次分析并分别保存快照，确认对比卡片显示评分/趋势变化 |
| 验证降级 | 关闭全部新闻源 → 事件分固定为 50；关闭全部行情源 → 页面给出明确错误提示 |
| 验证持久化 | 调整配置与自选池后刷新页面，二者保持不变，密钥被清空 |

### 3.6 合规与数据来源 `/legal/:doc`

- `/legal/terms`：使用条款与免责声明；`/legal/privacy`：隐私与本地存储说明；`/legal/sources`：数据来源、限频、字段稳定性与复权口径。
- 页面底部显示版本号（当前 `1.2.0`）与变更日期；对外展示或分发时应保留免责声明。
- 数据来源说明可通过 `src/lib/compliance.ts` 的 `DATA_SOURCE_NOTES` 与 `COMPLIANCE_VERSION` 统一维护。

### 3.7 自定义数据源（`/channels` 中部）

1. 展开「新增自定义源」，填写名称、类型（行情 / 资讯）、URL 模板。`{symbol}` 会被替换成 6 位代码，例如：
   `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.{symbol}&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&end=20500101&lmt=60`
2. 选择 GET / POST（POST 可填 JSON 模板）、超时（2～60s）、可选 Token（仅内存）与「经本地代理」。
3. 填写字段映射（点路径或简单 JSONPath）：
   - 行情默认：`price → data.price`、`name → data.name`、`bars → data.klines`；
   - 资讯默认：`items → data.items`、`title → title`、`url → url`、`time → ctime`、`summary → intro`、`source → media_name`；
   - 支持 `$.data.price`、`items[0].title`、`list[*].close` 等写法。
4. 点「测试连接」：成功会显示 HTTP 状态、耗时、解析出的样本条数与样例；失败会给出可读原因（如 `MISSING_FIELD: bars 未解析到任何行`）。**修改任何字段后需重新测试**，「保存配置」才会启用。
5. 保存后配置写入 localStorage；Token 刷新即失效（页面有风险提示）。
6. 启用后，自定义源与内置源一起参与分析，权重同样归一化；分析页「渠道运行状态」会显示自定义源名称与条数/耗时。

**CORS 失败怎么办**：若浏览器控制台显示跨域错误，可勾选「经本地代理」，请求会发往 `/api/custom`。服务端只允许 `CUSTOM_SOURCE_ALLOWLIST` 中的域名与前缀，不转发任何自定义 Header / Cookie / Authorization，因此需要鉴权的源只能直连（且目标需允许 CORS）。

**实测样例**：东财 K 线模板 → HTTP 200 / 109ms / 60 条；保存后分析显示「东财K线自定义 6 条 · 629ms」（其余标的因 `secid` 市场前缀不符而失败）。

### 3.8 个股详情 `/stock/:symbol`

- 直接访问 `#/stock/600519`，或在分析表 / 自选池点击股票名称进入。
- 展示最新收盘、当日涨跌、60 或 120 日区间涨跌、区间最高/最低、成交量（最近 / 5 日均 / 20 日均）、日 K 与成交量图。
- **趋势预测面板**：5 / 10 / 20 日中枢价与涨跌幅、上行概率、80% 区间，以及 walk-forward 的 MAE / MAPE / 方向命中率。样本不足 60 根时只显示原因、不给出预测。面板固定展示免责声明。
- **公司资料**：东财 F10 数据；无数据时显示「暂无可用资料」并降级为行情 + 新闻画像，不显示编造字段。
- **相关资讯**：情绪分布、事件阶段、最近摘要与新闻列表；无命中显示「暂无相关资讯」。
- 顶部可加入/移出自选、切换收藏、加入多股对比。

### 3.9 多股对比 `/compare`

- 从自选池点选或手动输入 6 位代码，支持 2～6 只；少于 2 只会提示继续添加。
- 图表取所有股票的共同交易日（最近 120 个），首日收盘价归一化为 100；表格给出最新价、区间涨跌、5 日方向概率、日均量能、数据覆盖率与来源。
- 缺失交易日不插值：表格标注「缺 N 日」，区间外无数据会显示「所选区间内无共同交易日」。停牌、上市时间不足或数据源缺日都表现为缺失交易日。
- 图表下方提供文字摘要（各标的归一化区间涨跌），便于无图形环境阅读。

### 3.10 收藏与多选预览

- `/watchlist` 顶部勾选「只看收藏」；卡片星标切换收藏状态（旧数据迁移默认收藏）。
- 选中 2～6 只后底部生成预览卡，可并行查看走势小图、关键指标、预测摘要与新闻摘要；失败单卡可重试。
- 收藏状态与多选列表分别持久化在 `stock-radar:watchlist:v1` 与 `stock-radar:compare:v1`。

## 4. 真实数据源与部署

### 4.1 已接入的接口

| 渠道 | 接口地址 | 返回内容 | CORS |
| --- | --- | --- | --- |
| 东方财富（全市场列表） | `https://push2.eastmoney.com/api/qt/clist/get` | 沪深 + 北交所代码/名称/最新价/涨跌幅/行业/时间戳，每页 100 条 | `*`，可直连 |
| 东方财富行情 | `https://push2.eastmoney.com/api/qt/ulist.np/get` | 批量快照（价格/涨跌/成交量/成交额/今开/最高/最低） | 回显 Origin，可直连 |
| 东方财富行情 | `https://push2his.eastmoney.com/api/qt/stock/kline/get` | 前复权日 K（默认 120 根） | 同上 |
| 腾讯证券行情 | `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get` | 前复权日 K | `*` |
| 腾讯证券行情 | `https://qt.gtimg.cn/q=` | 实时快照（GBK 文本） | `*` |
| 新浪行情 | `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData` | 未复权日 K（120 根，交叉校验） | **无**，需代理 |
| 新浪行情 | `https://hq.sinajs.cn/list=` | 实时快照（GBK 文本，交叉校验） | **无**，需代理 |
| 新浪财经资讯 | `https://feed.mix.sina.com.cn/api/roll/get` | 滚动资讯 30 条（标题/摘要/时间/来源/链接） | **无**，需代理 |
| 东方财富 F10 | `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_BASIC_ORGINFO` | 公司全称、注册资本、成立日期、注册地址、网站、主营/经营范围、简介 | `*`，可直连（实测 200 / ~370ms） |

实测（2026-11-05）：全市场列表约 60 页、约 5927 只（沪深 5563 + 北交所 364），单页 266ms、约 4～5s 完成；10 只标的全部返回日 K、30 条资讯、3/3 渠道成功，单渠道耗时 176～258ms。新浪日 K / GBK 快照与北交所 `bj920992` 均实测 HTTP 200。

**依赖外部凭据/后端（当前未启用）**：

| 渠道 | 依赖 | 当前行为 |
| --- | --- | --- |
| Tushare Pro | `TUSHARE_TOKEN`（页面或服务端环境变量） | 已实现 `daily` POST、串行限速；无 Token 抛 `MISSING_KEY` |
| AKShare | 自建 `/api/akshare` Python 服务 | 无服务时抛 `NOT_IMPLEMENTED`，不返回假数据 |
| 财联社电报 | 签约授权与 Key | 无 Key 抛 `MISSING_KEY`；协议未公开，不猜测 |
| LLM 复核 | API Key + 服务地址 | `/channels` 配置位，默认关闭 |

> 东方财富搜索建议 `searchapi.eastmoney.com/api/suggest/get` 实测 HTTP 200、返回含 `PinYin` 的结构，但**无 CORS 头**，未在浏览器端采用；自选池搜索改为本地匹配已缓存的全市场列表。

### 4.2 开发环境

`npm run dev` 已内置 `/api/sina` → `https://feed.mix.sina.com.cn`、`/api/sina-kline` → `money.finance.sina.com.cn`、`/api/sina-hq` → `hq.sinajs.cn`、`/api/tushare` → `api.tushare.pro` 的代理（见 [vite.config.ts](../vite.config.ts)），无需额外配置。东方财富（含全市场列表）与腾讯接口返回 CORS 头，浏览器可直连。

### 4.3 部署

**方式一：零依赖 Node 代理（推荐）**

```bash
npm run build
PORT=8787 ALLOWED_ORIGIN=https://your-domain npm run proxy
# 可选：TUSHARE_TOKEN=xxx npm run proxy   # 服务端注入，前端不再传 Token
```

`server/proxy.mjs` 会转发 `/api/sina`、`/api/sina-kline`、`/api/sina-hq`、`/api/tushare`，提供 40 次/分钟限流、CORS 白名单，并托管 `dist/`；适合单机小规模部署。密钥仅从环境变量读取。

自定义源经代理时还需配置白名单（**默认为空，即拒绝所有自定义代理请求**）：

```bash
CUSTOM_SOURCE_ALLOWLIST="push2his.eastmoney.com|/api/qt/stock/kline/get" PORT=8787 npm run proxy
# 多条用英文逗号分隔；host 支持精确或子域匹配，pathPrefix 为必填前缀
```

`/api/custom` 只接受 GET/POST，不转发 Authorization/Cookie/任意 Header，响应超过 5MB 截断，20s 超时；不在白名单的域名、内网地址、带凭据的 URL 一律 403。

**方式二：Nginx / 自建网关**

行情与全市场列表可直接工作；新浪三个接口需要同域反向代理，否则相关渠道会在「渠道运行状态」中显示失败（不影响行情主源、自选池与评分）。Nginx 示例：

```nginx
location /api/sina/ {
    proxy_pass https://feed.mix.sina.com.cn/;
    proxy_set_header Host feed.mix.sina.com.cn;
    proxy_set_header Referer https://finance.sina.com.cn/;
}
location /api/sina-kline/ {
    proxy_pass https://money.finance.sina.com.cn/;
    proxy_set_header Host money.finance.sina.com.cn;
    proxy_set_header Referer https://finance.sina.com.cn/;
}
location /api/sina-hq/ {
    proxy_pass https://hq.sinajs.cn/;
    proxy_set_header Host hq.sinajs.cn;
    proxy_set_header Referer https://finance.sina.com.cn/;
}
```

### 4.4 限频与稳定性建议

- 东方财富、腾讯、新浪行情：单次分析中批量取数并发上限 3、每次请求前置约 120ms 间隔；全市场列表并发 3、间隔 150ms。
- 全市场列表：同一交易日内只抓取一次（缓存到下一个交易日 09:30），手动「刷新列表」不要连续点击。
- 新浪资讯：建议 ≤1 请求/秒；代理层默认 40 次/分钟。
- 保持默认 30s 响应缓存，避免连续点击「重新分析」触发限流。
- 公开接口无官方 SLA，字段可能调整；解析失败会以 `PARSE` 错误出现在渠道状态中，而不是静默返回空数据。

## 5. 目录说明

```
.
├── server/proxy.mjs          # 零依赖代理 + 静态托管（可选生产网关）
├── tests/                    # vitest 单测 + 55 条手标新闻样本
src/
├── adapters/                 # 数据源层
│   ├── types.ts              # 适配器契约与错误类型
│   ├── http.ts               # 统一 HTTP 客户端（超时/重试/缓存/GBK/POST）
│   ├── registry.ts           # 渠道注册表（新增数据源入口）
│   ├── universe/             # 全市场 A 股列表（东方财富 clist，分页抓取）
│   ├── quote/                # 行情：eastmoney / tencent / sina（真实）、tushare / akshare（需凭据或后端）
│   ├── news/                 # 新闻：sina（真实）、cls（需授权）、aggregator（离线兜底）
│   └── mock/                 # 默认自选池、K 线生成器、新闻语料
├── analysis/                 # 纯逻辑层（不依赖 Vue）
│   ├── indicators.ts         # 技术指标
│   ├── trend.ts              # 趋势状态机
│   ├── scoring.ts            # 加权评分（可配置权重）、时机建议、风险标记
│   ├── engine.ts             # 编排：拉取→合并→分析→推荐
│   └── news/                 # extractor / mapper / stage / advice / pipeline
├── stores/                   # Pinia
│   ├── channels.ts           # 渠道配置与持久化
│   ├── watchlist.ts          # 自选池（上限 50、分组、排序、localStorage）
│   ├── universe.ts           # 全市场列表缓存（TTL / 搜索 / 错误态）
│   ├── analysis.ts           # 分析运行状态与报告
│   ├── analysis-settings.ts  # 评分权重 + LLM 配置位
│   └── snapshots.ts          # 分析快照（最多 8 条）
├── views/                    # 五个页面（含 /legal/:doc）
├── components/               # 渠道卡、推荐表、时间线、K 线图、徽章、统计块
├── types/index.ts            # 领域模型
├── lib/                      # 格式化、交易日历、并发、市场前缀、导出、合规版本
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
| 新浪资讯 / 新浪行情渠道失败，行情主源正常 | 接口无 CORS 头且未配置代理 | 开发环境用 `npm run dev`；部署按 4.3 使用 `npm run proxy` 或配置 `/api/sina*` 反向代理 |
| Tushare 提示 `MISSING_KEY` | 未填写 Token | 在 `/channels` 输入 Token（仅内存），或服务端设置 `TUSHARE_TOKEN` 后经代理访问 |
| AKShare 提示 `NOT_IMPLEMENTED` | 未自建 `/api/akshare` 服务 | 部署 Python 侧服务后按适配器注释接入；或关闭该渠道 |
| 财联社渠道失败 | 需要签约授权与 Key，接口协议未公开 | 暂无公开接入方案；保持关闭，使用新浪资讯 |
| 渠道卡片显示「模拟数据」 | 该渠道为离线兜底实现 | 在 `/channels` 关闭模拟渠道，只保留「真实数据」渠道 |
| 运行分析提示「未启用任何行情渠道」 | 所有行情源被关闭 | 到 `/channels` 打开至少一个行情源 |
| 新闻事件为空 | 所有新闻源关闭，或新闻未匹配到股票池 | 开启新闻源；或确认新闻正文包含股票名称/代码 |
| 评分与昨天的不完全一致 | 新闻发布时间相对当前时间变化导致阶段判定变化 | 属预期；阶段判定依赖发布时间与「影响交易日」 |
| 自选池分组/排序重启后丢失 | localStorage 被清除或浏览器隐私模式 | 重新设置；数据只存本地 |
| 导出文件中文乱码 | 用非 UTF-8 方式打开 CSV | CSV 已带 BOM，建议用 Excel / Numbers 直接打开 |
| 刷新后密钥消失 | 设计如此（密钥只存内存） | 重新输入；生产环境应由后端持钥 |
| `npm install` 卡住 | 网络或 npm 源问题 | 切换镜像后重试 |
| 构建报类型错误 | 修改了类型或未同步标签 | 运行 `npm run typecheck` 定位具体文件 |
| 单测失败 | 修改了指标/评分/新闻规则但未同步样本 | 运行 `npm test` 查看失败用例，更新 `tests/` 期望 |

## 8. 安全与合规提示

- 仓库内不得出现任何真实 API Key、Cookie、账号密码；`.gitignore` 已排除 `.env` 与常见密钥文件。
- 自选池、分组/排序、评分权重与分析快照仅保存在浏览器 `localStorage`，不上传服务器；清除浏览器数据会丢失配置。
- 生产环境建议使用 `server/proxy.mjs` 或自建网关：密钥从环境变量读取、限流 40 次/分钟、CORS 白名单；不要在前端硬编码密钥。
- 上线前请补齐鉴权与访问审计；前端直连第三方接口存在密钥泄露与限流风险。
- 本工具输出不构成投资建议，对外展示时须保留免责声明（合规页版本 `1.2.0`）。
