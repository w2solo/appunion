# AppUnions

应用互推联盟：开发者后台 + 开放 API + 运营审核。生产环境跑在 Ubuntu + 1Panel 上（Docker：Node + PostgreSQL + 图标卷）。Web 为 React + Vite。

## 本地启动

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

- Web：http://localhost:5173
- API：http://localhost:8787（Vite 会把 `/v1` `/dashboard` `/admin` `/health` `/media` 代理过去）
- 本地 Postgres 映射在 `localhost:55432`（避免和本机其它 Postgres 抢 5432）

默认超级管理员由环境变量 `SUPER_ADMIN_EMAIL` 指定（本地写在 `.env`，生产写在 `deploy/.env`）。用这个邮箱登录后，左侧会出现「审核 / 异常 / 设置 / 管理员」。普通管理员由超管在「管理员」页搜索已注册用户后标记，只能审核和改门槛参数，不能再管管理员。登录走邮箱验证码，不用密码。发信走 [SendCloud](https://www.sendcloud.net/)（`SENDCLOUD_API_USER` / `SENDCLOUD_API_KEY` / `SENDCLOUD_FROM`）。没配时页面上会直接显示验证码。

## 演示路径

1. 用邮箱验证码登录（新邮箱会自动注册），创建应用（名称、描述、图标），到详情页勾选平台并填写包名。
2. 用运营账号登录，打开「审核」通过该应用。
3. 用 curl 调开放接口（把 app_id 换成你的应用 ID）：

```bash
curl -s 'http://localhost:8787/v1/info?app_id=<你的 app_id>'
curl -s 'http://localhost:8787/v1/apps/recommend?app_id=<你的 app_id>&platform=android'
```

上报曝光 / 点击时必须带设备上持久化的 `client_id`（UUID）。卡片进入可视区后再报曝光。

## 生产部署（Ubuntu + 1Panel）

一个 Node 进程托管前端静态资源和 API，数据在 Compose 里的 PostgreSQL，图标在 Docker 卷，定时任务跑在同一进程。域名和证书由 1Panel 反代。

服务器上一键启动：

```bash
cd /opt
git clone <本仓库地址> appunions
cd appunions
bash deploy/install.sh
```

完整步骤见 [DEPLOY.md](DEPLOY.md)。密钥只写在 `deploy/.env`，不要进仓库。

## 仓库

- `apps/web` 开发者后台、文档、运营台
- `apps/api` Hono（Node）：`/v1` `/dashboard` `/admin`，以及定时任务
- `packages/db` Drizzle schema 与 Postgres 迁移
- `packages/shared` 枚举与错误码

产品说明见 `PRD-appunions.md`，设计见 `TECH-appunions.md`。
