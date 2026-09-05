# AppUnions 生产部署（Cloudflare Workers）

前端静态资源、开放 API、开发者后台 API 和定时任务都跑在同一个 Worker 上。不再需要 1Panel / Docker / 自建 Postgres / Redis。

```
浏览器 ──HTTPS──► Cloudflare Worker（appunions）
                    │
                    ├─ /v1 /dashboard /admin /health /media ──► Hono API
                    ├─ 其它路径 ──► Vite 构建的 SPA
                    ├─ D1 业务库
                    ├─ KV 验证码、限流、推荐池缓存
                    └─ R2 应用图标
```

Cron：每 5 分钟刷新推荐池，每 6 小时扫异常 CTR，每天 00:15 UTC 对账昨日统计。

## 0. 一次性准备

已在仓库里配好 `wrangler.jsonc`，对应账号资源：

| 资源 | 名称 |
| --- | --- |
| Worker | `appunions` |
| D1 | `appunions` |
| KV | `appunions-cache` |
| R2 | `appunions-icons` |

本机需要 [Node.js 22+](https://nodejs.org/) 和已登录的 Wrangler：

```bash
pnpm install
npx wrangler login
npx wrangler whoami
```

生产密钥不要写进 git。在仓库根执行（交互输入，不要把值贴进命令行）：

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put SENDCLOUD_API_USER
npx wrangler secret put SENDCLOUD_API_KEY
npx wrangler secret put SENDCLOUD_FROM
```

`JWT_SECRET` 至少 8 位，建议随机长串。SendCloud 三项配齐后才能给用户发登录验证码；没配时生产环境不会在接口里回显验证码。

## 1. 发布

```bash
pnpm run deploy
```

这条命令会：构建 Web、对远程 D1 跑迁移、把 Worker（含静态资源）推上去。

第一次请求会写入默认分类和超级管理员 `cmlanche@qq.com`。

探活：

```bash
curl -s https://appunions.<你的子域>.workers.dev/health
```

Wrangler 发布结束时会打印实际 URL。

## 2. 自定义域名

Cloudflare Dashboard → **Workers & Pages** → `appunions` → **Settings** → **Domains & Routes** → **Add**，绑上你的域名（域名需要已经在同一个 Cloudflare 账号下）。

绑 HTTPS 域名后保持 `COOKIE_SECURE=true`（`wrangler.jsonc` 里已是默认）。

## 3. 第一次登录

浏览器打开 Worker URL 或自定义域名，用超级管理员邮箱 `cmlanche@qq.com` 收验证码登录。左侧会出现审核 / 异常 / 设置 / 管理员。

普通管理员由超管在「管理员」页把已注册用户标上去。

本地没配发信时，`.dev.vars` 里 `AUTH_ECHO_CODE=true`，页面会直接显示验证码。

## 4. 日常运维

都在仓库根目录执行：

```bash
# 本地
pnpm dev

# 类型（改 wrangler.jsonc 之后）
pnpm cf:types

# 远程迁移
pnpm db:migrate:remote

# 发布
pnpm run deploy

# 实时日志
npx wrangler tail appunions
```

改非密钥配置（例如 `AUTH_ECHO_CODE`）编辑 `wrangler.jsonc` 的 `vars` 再 `pnpm run deploy`。改密钥用 `wrangler secret put`。

## 5. 排查

| 现象 | 处理 |
| --- | --- |
| `/health` 返回 503 | D1 没就绪或迁移没跑，执行 `pnpm db:migrate:remote` |
| 页面开得开，登录没验证码 | 没配 SendCloud secret，看 `wrangler tail` |
| 登录成功但立刻掉线 | 用了 HTTP 却 `COOKIE_SECURE=true`；自定义域名要用 HTTPS |
| 图标 404 | 确认 R2 桶 `appunions-icons` 存在，Worker binding 名为 `ICONS` |
| `wrangler deploy` 找不到 assets | 先 `pnpm --filter @appunions/web build`，或直接 `pnpm run deploy` |

本地开发用根目录 `.dev.vars`，与生产 secrets 互不影响。
