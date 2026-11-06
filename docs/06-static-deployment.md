# 纯静态部署（GitHub Pages）

本项目默认按**纯静态站点**构建：运行时不需要 `server/proxy.mjs`，所有数据持久化都在浏览器内完成，可直接发布到 GitHub Pages。

## 1. 能力边界（默认纯静态构建）

| 能力 | 纯静态部署 | 说明 |
| --- | --- | --- |
| 东方财富全市场列表 | 可用 | 接口返回 `Access-Control-Allow-Origin: *`，浏览器可直连 |
| 东方财富行情（日 K / 快照） | 可用 | CORS 回显 Origin |
| 腾讯行情 | 可用 | 接口返回 `Access-Control-Allow-Origin: *` |
| 新浪行情（`sina-quote`） | **不可用，自动跳过** | 无 CORS 响应头，只能经同源 `/api/sina-*` 代理 |
| 新浪财经资讯（`sina-news`） | **不可用，自动跳过** | 无 CORS 响应头，只能经同源 `/api/sina` 代理 |
| Tushare / AKShare | **不可用，自动跳过** | 依赖 `/api/tushare`、`/api/akshare` 代理或服务端注入凭据 |
| 自定义数据源（直连） | 可用 | 仅限浏览器可直接访问、返回 CORS 头的 `https` 地址 |
| 自定义数据源（经代理） | **不可用** | 纯静态无 `/api/custom`，表单中该选项被禁用 |
| 数据持久化 | IndexedDB + localStorage | 见第 4 节 |

降级行为是**显式**的：

- 依赖代理的渠道在「数据源配置」页标记为「纯静态不可用」，开关禁用，并展示原因与影响范围；
- 已启用但不可达的资讯源会在个股详情页显示「纯静态降级」提示；
- 不会返回模拟/伪造数据，也不会因为缺少代理导致整页失败或白屏；
- 没有可用资讯源时，事件驱动分项按中性 50 分处理，并在页面说明。

## 2. GitHub Pages 部署

### 2.1 仓库内已提供的配置

- `vite.config.ts`：`base: '/stock-radar/'`（仓库名，Pages 项目站点路径）；
- 路由使用 hash 模式（`#/analysis`），无需服务端 rewrite；
- `public/.nojekyll`：跳过 Jekyll 处理，保证带下划线的构建资源可访问；
- `.github/workflows/deploy-pages.yml`：`npm ci` → `npm test` → `npm run build` → 上传 `dist` → 发布 Pages。

### 2.2 启用 Pages（必须手动点一步）

1. 打开仓库 **Settings → Pages**；
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**（不要选 “Deploy from a branch”）；
3. 保存后，向 `main` 推送（或手动运行 `Deploy to GitHub Pages` workflow）即会构建并发布；
4. 发布完成后站点地址为 `https://<用户名>.github.io/stock-radar/`。

仓库名不是 `stock-radar` 时，需同步修改 `vite.config.ts` 的 `base` 为 `/<仓库名>/`。

### 2.3 本地验证构建产物

```bash
npm run build
# 用任意静态服务器把 dist/ 挂到 /stock-radar/ 前缀
# 例如临时用 Node 静态服务或 Nginx：
#   location /stock-radar/ { alias /path/to/dist/; try_files $uri $uri/ /stock-radar/index.html; }
```

验证要点：

- `dist/index.html` 中的脚本/样式路径以 `/stock-radar/` 开头；
- `dist/.nojekyll` 存在；
- 打开 `http://localhost:<port>/stock-radar/` 能看到仪表盘，控制台无错误；
- `#/channels` 页出现「纯静态不可用」渠道标记。

## 3. 可选：自建代理部署

需要新浪行情/资讯或 Tushare/AKShare 时，可自建同源代理；这是**可选路径**，不影响纯静态默认构建。

```bash
npm run build
VITE_PROXY_AVAILABLE=true npm run build   # 构建时声明代理可用（PowerShell: $env:VITE_PROXY_AVAILABLE='true'; npm run build）
PORT=8787 ALLOWED_ORIGIN=https://your-domain npm run proxy
```

- `server/proxy.mjs` 转发 `/api/sina`、`/api/sina-kline`、`/api/sina-hq`、`/api/tushare`、`/api/custom`，并托管 `dist/`；
- `VITE_PROXY_AVAILABLE=true` 会让渠道可用性判断放行 `requiresProxy` 渠道；
- 代理地址不写入构建产物，`base` 仍由 `VITE_BASE_PATH` 覆盖（自建根路径可设 `VITE_BASE_PATH=/`）；
- `TUSHARE_TOKEN` 仅从服务端环境变量读取，不进入前端产物。

## 4. 前端存储模型

存储层是可替换适配器（`src/lib/storage/`），业务 store 只调用 `readJson` / `writeJson` / `removeJson`，不直接触达 IndexedDB。

| 数据 | 存储 | Key |
| --- | --- | --- |
| 全市场列表 | IndexedDB | `stock-radar:universe:v1` |
| 自选池 / 分组 / 收藏 / 排序 | IndexedDB | `stock-radar:watchlist:v1` |
| 分析快照 | IndexedDB | `stock-radar:snapshots:v1` |
| 渠道配置、评分权重、自定义源、对比列表 | localStorage | `stock-radar:*:v1` |

- 启动时先挂载页面，再后台水合 IndexedDB；存储慢或失败不会阻塞首帧；
- IndexedDB 不可用或超时（5s）会回退到 localStorage，并在页面顶部显示提示；
- 旧 localStorage 数据会迁移到 IndexedDB：写入并读回校验成功后才删除旧键；失败时**保留旧数据**并提示「旧数据迁移失败…仍完整保留在 localStorage」；
- 水合完成前产生的会话改动会先留在内存并标记待写，水合后回放，不会被旧数据覆盖。

清除站点数据会同时清除 IndexedDB 与 localStorage；多标签页并发写入以最后写入为准。

## 5. 凭据与安全

- 仓库与构建产物中不包含任何 API Key / Token；
- 页面输入的渠道密钥、自定义源 Token 仅保存在当前页面内存，刷新即清除；
- 自定义源地址必须是 `http(s)` 公网地址；直连模式下浏览器不会发送被禁止的自定义 Header 之外的凭据（Authorization 仅在直连可用）；
- 纯静态部署下不会向不存在 `/api/*` 发起请求：不可用渠道在请求前即被过滤。
