# AppUnions 生产部署（Render）

前端静态资源、开放 API、开发者后台 API 和定时任务都跑在同一个 Node Web Service 上。数据在 Render PostgreSQL，图标在 Persistent Disk。

```
浏览器 ──HTTPS──► Render Web Service（Node）
                    │
                    ├─ /v1 /dashboard /admin /health /media /internal ──► Hono API
                    ├─ 其它路径 ──► Vite 构建的 SPA
                    ├─ PostgreSQL 业务库
                    ├─ 进程内 TTL 缓存（验证码、限流、推荐池）
                    └─ Persistent Disk 应用图标（/var/data/icons）
```

Cron：同一进程内每 5 分钟刷新推荐池，每 6 小时扫异常 CTR，每天 00:15 UTC 对账昨日统计。Web 实例必须常驻（Persistent Disk 需要付费机型）。

## 0. 一次性准备

仓库根目录已有 `render.yaml`。本机需要 [Node.js 22+](https://nodejs.org/)、pnpm、Docker（只为本地 Postgres）：

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

生产密钥在 Render Dashboard 的 Environment 里配置，不要写进 git。Blueprint 会生成 `JWT_SECRET` 和 `CRON_SECRET`。SendCloud 三项需手动填写后才能给用户发登录验证码；没配时生产环境不会在接口里回显验证码。

## 1. 用 Blueprint 发布

1. 把仓库推到 GitHub / GitLab。
2. Render Dashboard → **New** → **Blueprint**，选中该仓库。
3. 确认会创建：
   - Web Service `appunions`（Node 22，Disk 挂载 `/var/data`）
   - PostgreSQL `appunions-db`
4. 填 SendCloud 三个环境变量（可稍后补）。
5. 创建并等待第一次构建。`startCommand` 会先跑迁移再启动 API。

第一次请求会写入默认分类和超级管理员 `cmlanche@qq.com`。

探活：

```bash
curl -s https://<你的服务>.onrender.com/health
```

Render 控制台会显示实际 URL。

## 2. 自定义域名

Render Dashboard → 该 Web Service → **Settings** → **Custom Domains**，按提示加 DNS。HTTPS 由 Render 签发。

绑 HTTPS 域名后保持 `COOKIE_SECURE=true`（`render.yaml` 里已是默认）。

## 3. 第一次登录

浏览器打开服务 URL 或自定义域名，用超级管理员邮箱 `cmlanche@qq.com` 收验证码登录。左侧会出现审核 / 异常 / 设置 / 管理员。

普通管理员由超管在「管理员」页把已注册用户标上去。

本地没配发信时，`.env` 里 `AUTH_ECHO_CODE=true`，页面会直接显示验证码。

## 4. 日常运维

都在仓库根目录执行：

```bash
# 本地
docker compose up -d
pnpm dev

# 迁移
pnpm db:migrate

# 单测
pnpm test

# 构建前端（生产构建由 Render 执行）
pnpm build
```

改非密钥配置（例如 `AUTH_ECHO_CODE`）在 Render 环境变量里改，会触发重新部署。图标目录是 `/var/data/icons`，不要改成临时盘路径。

可选：用 `CRON_SECRET` 调 `POST /internal/jobs/{pool|anomalies|reconcile}`，方便以后改成独立 Cron Job。V1 默认已在进程内调度。

## 5. 排查

| 现象 | 处理 |
| --- | --- |
| `/health` 返回 503 | Postgres 没连上或迁移没跑，看 `DATABASE_URL` 和构建日志里的 `pnpm db:migrate` |
| 页面开得开，登录没验证码 | 没配 SendCloud；本地可开 `AUTH_ECHO_CODE=true` |
| 登录成功但立刻掉线 | 用了 HTTP 却 `COOKIE_SECURE=true`；自定义域名要用 HTTPS |
| 图标 404 | 确认 Disk 挂在 `/var/data`，且 `ICONS_DIR=/var/data/icons` |
| 构建找不到 pnpm | `package.json` 已声明 `packageManager`；`buildCommand` 会 `corepack enable` |

本地开发用根目录 `.env`，与 Render 环境变量互不影响。本地 Postgres 默认映射 `localhost:55432`。这是单实例部署：不要水平扩 Web Service，进程内缓存和图标磁盘都假定只有一个进程。
