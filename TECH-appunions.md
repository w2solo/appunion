# 技术方案：AppUnions 完整设计（V1）

| 字段 | 内容 |
| --- | --- |
| 对应产品 | [PRD-appunions.md](PRD-appunions.md) |
| 后端细节 | [TECH-appunions-backend.md](TECH-appunions-backend.md)（数据模型、开放 API、推荐池、反作弊） |
| 本文范围 | 整站：Web 后台、接入文档站、运营台，以及它们如何和 Node 后端拼在一起 |
| 状态 | 待评审 |

V1 对外交付的是一套网站 + 一套开放 API，不是「只有后端」。开发者在网站上注册、建 App、等审核、复制 `app_id`、读文档；Flutter 用官方 SDK `appunion_flutter`，其它宿主 App 直连 `/v1`。运营在同一套网站里审核。

---

## 1. 产品面（V1 要做齐）

| 面 | 给谁 | 形态 |
| --- | --- | --- |
| 开发者后台 | 独立开发者 | Web，要登录 |
| 接入文档 / 样式参考 | 开发者（可未登录阅读） | Web，公开页 |
| 运营台 | 内部审核 | Web，同一站点，`role = admin` 或超管才看见 |
| 开放 API | 宿主 App | HTTP JSON，查询参数 `app_id`，无网页 |
| Flutter SDK | Flutter 宿主 | [`appunion_flutter`](https://pub.dev/packages/appunion_flutter)，入口自绘，列表弹窗由 SDK 提供 |

不做：C 端用户站、独立运营后台域名（V1 同一套前端即可）。不提供带广告外观的 SDK；Flutter 官方库入口仍由接入方自己画。

---

## 2. 系统怎么拼

```mermaid
flowchart LR
  subgraph browser [浏览器]
    Web[Web 单页应用]
  end
  subgraph host [开发者的 App]
    Native[Android / iOS / 鸿蒙]
    Flutter[Flutter SDK]
  end
  subgraph server [Ubuntu_1Panel]
    Api[Hono Node]
  end
  PG[(PostgreSQL)]
  Mem[进程内缓存]
  Disk[图标卷]

  Web -->|cookie 登录| Api
  Native -->|query app_id| Api
  Flutter -->|query app_id| Api
  Api --> PG
  Api --> Mem
  Api --> Disk
```

生产建议 **一个域名**，由 Node 进程按路径分流：

| 路径前缀 | 交给谁 | 说明 |
| --- | --- | --- |
| `/v1/*` | Hono | 开放 API |
| `/dashboard/*` | Hono | 开发者后台 API |
| `/admin/*` | Hono | 运营 API |
| `/health` | Hono | 探活 |
| `/media/*` | Hono | 磁盘图标 |
| 其它所有路径 | Web 静态资源 | SPA，前端路由 |

因此 **页面路径不要用 `/dashboard`、`/admin`、`/v1`**。页面用 `/apps`、`/docs`、`/ops`。

本地开发：Vite 把上述 API 前缀代理到 Node API（`localhost:8787`），前端跑 `localhost:5173`。Cookie 在开发环境设 `SameSite=Lax`；生产同域后同样适用。

---

## 3. 技术栈

整站部署在 Ubuntu + 1Panel 上：Docker Compose 起一个 Node 进程托管 API 和静态资源，前面由 1Panel 反代域名和证书。

| 层 | 选择 |
| --- | --- |
| Web | React 18 + TypeScript + Vite + React Router，生产由 Node 托管 `dist` |
| UI | Tailwind CSS + 少量自研后台组件（表格、表单、对话框）。不引入很重的中台套件 |
| 图表 | 轻量折线图（如 uPlot 或 Recharts），只用于 7/30 天趋势 |
| 文档 | 仓库内 Markdown，构建时打进前端路由 `/docs/*` |
| 后端 | Node + Hono + PostgreSQL + 进程内缓存 + 本地图标卷 |
| 定时任务 | 同一进程的 node-cron |
| 仓库 | 单仓 monorepo：`apps/web`、`apps/api`、`packages/*` |

Web **不写业务规则**（是否在推荐池、去重、审核状态机都在服务端）。前端只展示接口返回值，并做表单校验、空态、权限显隐。

---

## 4. 角色与权限（页面层）

| 角色 | 来源 | 能进的页面 |
| --- | --- | --- |
| 未登录 | 无 cookie | 登录、注册、公开文档 |
| 开发者 | `role = developer` | 我的应用、应用详情、数据、文档 |
| 普通管理员 | `role = admin`，由超管标记已注册用户 | 开发者能进的全部 + `/ops/review` `/ops/anomalies` `/ops/config` `/ops/categories` |
| 超级管理员 | 环境变量 `SUPER_ADMIN_EMAIL` 对应的已登录用户 | 普通管理员能进的全部 + `/ops/admins` |

未登录访问 `/apps` → 跳 `/login?next=...`。开发者访问 `/ops` → 403 页（「没有权限」），不要伪装成 404。

会话：

1. 注册 / 登录成功，Worker 写 httpOnly cookie（access + refresh）。
2. 前端启动时 `GET /dashboard/auth/me`，拿到 `{ id, email, role, superAdmin }`。
3. 401 则清本地用户态，跳登录。
4. 登出：`POST /dashboard/auth/logout`，跳 `/login`。

V1 不验证邮箱、不找回密码（与后端 D2 一致）。忘记密码文案写「联系运营」，避免做一半的邮件链路。

---

## 5. 信息架构

```
公开
  /                    首页（一句话 + 注册/登录 + 链到文档）
  /login
  /register
  /docs                接入说明首页
  /docs/api            四个开放接口
  /docs/rules          同端、观察期、互惠门槛
  /docs/ui             样式参考
  /403

登录后（开发者）
  /apps                我的应用
  /apps/new            创建应用
  /apps/:id            应用详情（资料 / 凭证 / 状态）
  /apps/:id/stats      数据

登录后（运营额外）
  /ops/review          审核队列
  /ops/apps/:id        审核详情
  /ops/anomalies       异常 CTR
  /ops/config          门槛参数
  /ops/categories      分类
  /ops/admins          管理员（仅超管）
```

顶栏：产品名、文档、邮箱、退出。运营多一个「审核」。

侧栏仅登录后出现：我的应用、接入文档。运营再加：审核、异常、设置、分类。超管再加：管理员。

---

## 6. 关键用户流程

### 6.1 开发者从注册到接入

```mermaid
flowchart TD
  Home[打开首页] --> Reg[注册邮箱密码]
  Reg --> Apps[进入我的应用]
  Apps --> Create[填写并创建 App]
  Create --> Detail[应用详情：待审 / 接入]
  Detail --> Docs[去文档对接]
  Detail --> Wait[等审核]
  Wait -->|通过| Ready[开放 API 可用，观察期]
  Wait -->|拒绝| Edit[按原因改资料并重提]
  Edit --> Wait
  Ready --> Stats[看曝光点击和是否在池中]
```

创建成功后进入应用详情「接入」页，复制 `app_id`。Flutter 用官方 SDK [`appunion_flutter`](https://pub.dev/packages/appunion_flutter)（初始化填入当前 `app_id`）；其它客户端开放接口只用查询参数 `app_id`，直连，不需要 API Key。

### 6.2 运营审核

1. 进 `/ops/review`，默认筛 `pending`。
2. 打开详情：图标、名称、简介、各端包名、开发者邮箱。
3. 通过 / 拒绝（拒绝必须填原因）/ 暂停（必须填原因）。
4. 回到队列，下一条。

### 6.3 终端用户（不在我们的 Web 里）

发生在开发者自己的 App。Web 只通过文档告诉他们怎么做。流程：进页调 `/v1/info` 画一条入口 item → 用户点击后弹出列表弹窗（再拉 recommend，弹窗顶部用 `description` 解释联盟是做什么的）→ 弹窗内卡片进入可视区报曝光 → 点下载上报并跳转 → 「换一批」。不要把列表内嵌进宿主页。

---

## 7. 页面说明

每页写：目的、主操作、空/错态、调用的接口。接口形态以 [后端文档](TECH-appunions-backend.md) 为准。

### 7.1 首页 `/`

目的：让人 10 秒内知道这是免费互推联盟，并去注册。

- 一句话：接入后展示别人的 App，自己也有机会被展示。
- 按钮：注册、登录、读文档。
- 不放营销长文。不做 SEO 专项（V1 可索引但不必做落地页体系）。

### 7.2 注册 `/register`、登录 `/login`

| 字段 | 规则 |
| --- | --- |
| 邮箱 | 必填，前端格式校验，最终以后端为准 |
| 密码 | 至少 8 位 |

- 注册成功即登录并跳 `/apps`（或 `next`）。
- 邮箱已存在：提示去登录，不要泄露「是否注册过」以外的信息。
- 登录失败：统一「邮箱或密码不对」。
- 登录接口限流时展示「试太多次，请稍后再试」。

接口：`POST /dashboard/auth/register`、`POST /dashboard/auth/login`。

### 7.3 我的应用 `/apps`

表格列：图标、名称、端、审核状态、是否在推荐池、获得曝光（近 7 天）、操作。

状态徽章：

| 展示 | 条件 |
| --- | --- |
| 待审核 | `review_status = pending` |
| 已拒绝 | `rejected` |
| 观察期 | 已通过且 `grace_days_left > 0` |
| 推荐中 | `in_recommend_pool = true` 且不在观察期文案优先用「推荐中」；观察期也可同时标注 |
| 未达互惠 | 已通过、不在池、且非暂停 |
| 已隐藏 | `paused_by_developer` |
| 运营暂停 | `paused_by_ops`（开发者只读原因或固定文案「运营已暂停，请联系我们」） |

空态：还没有 App，主按钮「创建应用」。

接口：`GET /dashboard/apps`。若列表不带近 7 天曝光，详情再查；列表接口应带摘要字段，避免 N+1。**后端列表响应需包含**：`id, name, icon_url, platforms, review_status, paused_by_developer, paused_by_ops, in_recommend_pool, grace_days_left, impressions_received_7d`。

### 7.4 创建应用 `/apps/new`

表单：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| 名称 | 是 | |
| 图标 | 是 | png/jpeg/webp，≤ 512KB，创建接口支持 multipart |
| 描述 | 是 | 实时数字数，上限 30 |
| 分类 | 是 | 大分类 + 小分类。点输入框提示已有项，也可输入新分类 |

提交：`POST /dashboard/apps` → 成功去 `/apps/:id?tab=integrate`，在详情页勾选平台并填写包名。

失败：校验错误贴在字段下；500 用页顶提示。

建议创建分两步也可，V1 **一页提交** 更少流失。图标若需先有 `app_id`：先 `POST` 资料（icon 可暂空）再立刻 `POST /icon`，任一步失败要在页上说明「应用已创建但图标未传，请到详情页补传」。更干净的做法是创建接口走 `multipart` 一次完成。完整设计采用 **一次 multipart 创建**，详情页仍保留单独换图标。

### 7.5 应用详情 `/apps/:id`

锚点分区，单页不要拆太多子路由（数据除外）。

**状态条（最上方，必看）**

用后端字段拼一句人话，例如：

- 待审：「审核中可用 app_id 调 /v1 拉测试数据；通过后自动变为真实推荐。」
- 拒绝：红条 + `rejected_reason` + 按钮「修改并重新提交」。
- 通过 + 观察期：「观察期还剩 N 天。请尽快在 App 里真实展示列表并上报曝光，否则到期会暂时离开推荐池。」
- 通过 + 缺口：「还差 N 次有效曝光才能回到推荐池。全量列表里别人仍可能看到你。」
- 开发者关闭展示：「已隐藏互推：别人看不到你，info 与 recommend 都会返回 hidden，你也拿不到列表。」
- 运营暂停：「运营已暂停本应用，开放接口不可用。」

**资料**

与创建表单相同。保存 `PATCH /dashboard/apps/:id`。拒绝态保存后走 `POST .../resubmit`（或保存即重提，按钮文案写成「保存并重新提交」）。

**支持的平台**

勾选 Android / iOS / 鸿蒙，每端填写包名。Android 另填是否已上架应用商店和官网（至少一项）；商店跳转统一 `market://details?id=<包名>`，不区分各家应用市场。`PUT /dashboard/apps/:id/platforms` 覆盖保存。未配置任何端则无法进入推荐/全量列表。

**凭证**

- `app_id` 可复制，写在接入页。Flutter 引导用 [`appunion_flutter`](https://pub.dev/packages/appunion_flutter)；原生客户端请求 `/v1` 时带查询参数 `app_id`。
- 示例：`GET /v1/info?app_id=<uuid>` 画入口 item；用户点击入口后再 `GET /v1/apps/recommend?app_id=<uuid>&platform=android` 弹列表，弹窗顶部用 info 的 `description` 解释联盟。接入页「点击测试」先打 info 出示入口，点入口再拉列表，点行再拉详情；弹窗标明 mock 或真实数据。Flutter 接入页同时给出可复制的 `initialize` / `fetchInfo` / `show` 代码，Prompt 默认走 SDK。

**配置（展示开关 + 弹窗列表条数）**

- 展示开关在配置页，即时 pause / resume。关闭后自己不出现在别人列表，且宿主 info / recommend 返回 `hidden: true`、recommend 空列表。运营暂停时禁用恢复，提示联系运营。

接口：`GET /dashboard/apps/:id`、`PATCH`、`PUT .../platforms`、`resubmit`、`pause`、`resume`、`api-key/rotate`、`icon`。

### 7.6 数据 `/apps/:id/stats`

- 切换 7 天 / 30 天。
- 四张数字：获得曝光、获得点击、贡献曝光、贡献点击；CTR（无比数时显示「—」）。
- 是否在推荐池、观察期剩余、门槛、已贡献、缺口（与详情状态条重复也可以，数据页要自洽）。
- 一张按日折线图，四条序列可开关。

空数据：应用刚建完也要能打开，全 0 + 「通过并接入后这里会有数」。

接口：`GET /dashboard/apps/:id/stats?range=7d|30d`。

### 7.7 文档 `/docs/*`

公开，不登录也能读。登录态顶栏不变。

必须有四章（对应 PRD 支柱 C）：

1. **接入步骤**：注册 → 建 App → 填各端包名 → 等审核 → 拿 key → 带 `platform` 拉推荐 → 可视区报曝光 → 点击后上报再用 `package_name` 打开商店。
2. **API**：Base URL、鉴权、info / recommend / 详情 / 曝光 / 点击的请求/响应/错误码。从 `packages/shared` 生成或手写，但要和实现一致。
3. **规则**：同端、排除自己、观察期 7 天、近 7 天 100 次贡献曝光、开发者自隐藏互推（`hidden: true`）vs 运营暂停。
4. **样式参考**：卡片 = 图标 + 名称 + 一句话 + 按钮；「换一批」打 recommend；「查看全部」打分页全量。标明「不是强制组件，但曝光点击必须报」。给一张线框示意（静态图即可）。

文档里的门槛数字写「以后台显示为准」，避免运营改 `platform_config` 后文档过期。可以用「默认 7 天 / 100 次」。

### 7.8 运营：审核队列 `/ops/review`

筛选项：待审 / 已通过 / 已拒绝 / 运营暂停。

列：图标、名称、端、开发者邮箱、提交时间、状态。点行进详情。

空态：「没有待审应用」。

接口：`GET /admin/apps?status=`。

### 7.9 运营：审核详情 `/ops/apps/:id`

只读资料 + 外链点商店。操作：通过、拒绝（对话框填原因）、暂停（填原因）、恢复。

每次操作后留在本页并刷新状态，同时写入审核记录（后端已有 `app_reviews`）。V1 页面底部列最近操作即可，若接口暂不返回记录，可后补，不挡 V1。

### 7.10 运营：异常 `/ops/anomalies`、参数 `/ops/config`

- 异常：App、类型、窗口、时间。操作可跳到该 App 审核详情去暂停。
- 参数：对外名称、宣传语、解释说明、品牌 logo；观察天数、互惠曝光阈值、去重分钟、各限流。门槛数字保存前二次确认。改品牌文案或 logo 不重算推荐池。普通管理员可以改这些。

接口：`GET/PATCH /admin/config`，`POST /admin/config/logo`，`GET /admin/anomalies`。

### 7.11 运营：管理员 `/ops/admins`

仅超级管理员可见。搜索已注册用户，把对方标成普通管理员或取消。不能改超级管理员本人。未注册邮箱不能直接加进来，对方必须先登录一次。

接口：`GET /admin/users?q=`，`PATCH /admin/users/:id` `{ role }`。

### 7.12 运营：分类 `/ops/categories`

两级目录。点输入框提示已有名称，也可输入新的。可改名、删除未使用的项。开发者创建应用时走同一套提示。

接口：`GET/POST /admin/categories`，`PATCH/DELETE /admin/categories/:id`，开发者 `GET /dashboard/categories`。

---

## 8. Web 前端结构

```
apps/web
  src/pages/          与第 5 节路由 1:1
  src/layouts/        PublicLayout / AppLayout / OpsLayout
  src/features/apps/  表单、状态条、密钥模态框
  src/features/stats/
  src/features/ops/
  src/shared/api.ts   fetch 封装：credentials include、401 跳登录
  src/shared/auth.tsx 当前用户 context
```

约定：

- 所有 `/dashboard`、`/admin` 请求带 cookie，不把 JWT 放 localStorage。
- 不把服务端密钥写入前端。开放 API 只用查询参数 `app_id`。
- 表单提交 disable 按钮，防双击建两个 App。
- 时间全部按用户本地时区显示，接口仍是 UTC。

---

## 9. 和后端的衔接补丁

下列能力 Web 要用，若后端文档尚未写细则，按这里补：

| 项 | 说明 |
| --- | --- |
| `GET /dashboard/auth/me` | 返回 `{ id, email, role, superAdmin }`，供刷新页面恢复会话 |
| `GET /dashboard/apps` 摘要字段 | 见 7.3，减少列表页再打 N 次 stats |
| 创建 App | 支持 `multipart/form-data` 一次提交资料+图标 |
| 列表/详情的人话状态 | 后端给原始字段，**文案由前端拼**，方便改字不改 API |
| 同域部署 | 生产关掉跨域 CORS；开发 Vite 代理 |

开放 API 由宿主 App 用 `app_id` 直连。接入页「点击测试」同源调 `/v1` 做预览，不代发曝光/点击。

---

## 10. 样式与体验（后台自己的 UI）

开发者后台要干净、偏文档站，不要做成广告后台。

- 桌面优先，最小宽度约 1024。V1 不做独立移动端后台。
- 主色一条，状态靠灰/蓝/绿/红徽章，不要彩虹。
- 关键破坏操作（重置密钥、暂停、拒绝）用确认框。
- 中文文案短句，和 PRD 用词一致：曝光、点击、推荐池、观察期。

样式参考页（给开发者抄的那页）和后台视觉可以不同：参考页按「手机列表卡片」画线框，不要直接截后台表格。

---

## 11. 部署

```mermaid
flowchart TB
  User[浏览器] --> Node
  App[宿主 App] --> Node
  Node -->|"/" 静态"| WebDist[apps/web 构建产物]
  Node -->|"/v1 /dashboard /admin /health /media"| Hono[Hono]
  Hono --> PG[(PostgreSQL)]
  Hono --> Mem[进程内缓存]
  Hono --> Disk[图标卷]
```

- Web：`vite build` 出静态文件，生产由 Node 托管，SPA 回退 `index.html`。
- API 与 Cron：同一 Node 进程，只绑本机端口，1Panel 反代 80/443。
- 密钥写在服务器 `deploy/.env`，不进前端 bundle、不进 git。

---

## 12. 仓库目录

```
apps/web          Vite React 后台 + 文档
apps/api          Hono Node：/v1 /dashboard /admin + Cron
packages/db       Drizzle schema + Postgres 迁移
packages/shared   Zod、分类枚举、错误码、文档可引用的 API 类型
```

---

## 13. 实施顺序（全栈）

按这个切，每一段都可以演示：

1. **骨架**：monorepo、Postgres 迁移、注册登录、`/me`、空白 `/apps` 页。
2. **建 App**：创建表单、图标上传、详情接入页复制 `app_id`。
3. **运营审核**：`/ops/review` 通过/拒绝，开发者侧状态条跟着变。
4. **开放 API**：recommend / list，文档页写出来，用 curl 就能调。
5. **上报与看板**：impressions/clicks → `/apps/:id/stats` 出数。
6. **规则**：worker 进出池，详情/列表徽章显示观察期和缺口。
7. **反作弊与参数**：限流、去重、异常页、运营改门槛。
8. **文档与样式参考** 收尾，对照 PRD 支柱 C 勾一遍。

---

## 14. 测试要点（Web）

手动即可先过 V1，不必强上 E2E，但这些路径必须点过：

1. 注册 → 自动进后台 → 退出 → 再登录。
2. 未登录打 `/apps` 会跳登录，登录后回到原地址。
3. 创建 App → 进入接入页，可复制 `app_id`。
4. 缺 `app_id` 或无效 UUID 调 `/v1` 为 401。
5. 待审 / 拒绝 / 通过 / 暂停 四种状态条文案正确。
6. 开发者看不到 `/ops`；运营能审，拒绝必填原因。
7. 文档未登录可读。
8. 桌面宽度下表单、表格不横向撑破。

后端规则测试仍见 [TECH-appunions-backend.md](TECH-appunions-backend.md) 第 14 节。

---

## 15. 待拍板

后端 D1～D6 仍然有效。Web 额外：

| ID | 决策 | 本文默认 | 备选 |
| --- | --- | --- | --- |
| W1 | 是否做独立营销站 | **不做**。`/` 一屏带注册即可 | 另做官网 |
| W2 | 文档是否登录后才显示完整 API | **公开**，降低接入摩擦 | 登录才显示 key 相关章节 |
| W3 | 创建 App 是否一次 multipart | **是** | 先建后传图标 |
| W4 | 后台是否做手机版 | **不做**，桌面优先 | 响应式表格 |

已拍板：Node.js 后端；不用 Cloudflare / Render；开发者和运营共用一个 Web；生产部署 Ubuntu + 1Panel。
