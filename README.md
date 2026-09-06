# AppUnions

应用互推联盟：开发者后台 + 开放 API + 运营审核。生产环境跑在 Cloudflare Workers 上（D1 + KV + R2）。Web 为 React + Vite。

## 本地启动

```bash
cp .dev.vars.example .dev.vars
pnpm install
pnpm db:migrate
pnpm cf:types
pnpm dev
```

- Web：http://localhost:5173
- API：http://localhost:8787（Vite 会把 `/v1` `/dashboard` `/admin` `/health` `/media` 代理过去）

默认超级管理员邮箱固定为 `cmlanche@qq.com`。用这个邮箱登录后，左侧会出现「审核 / 异常 / 设置 / 管理员」。普通管理员由超管在「管理员」页搜索已注册用户后标记，只能审核和改门槛参数，不能再管管理员。登录走邮箱验证码，不用密码。发信走 [SendCloud](https://www.sendcloud.net/)（`SENDCLOUD_API_USER` / `SENDCLOUD_API_KEY` / `SENDCLOUD_FROM`）。没配时页面上会直接显示验证码。

## 演示路径

1. 用邮箱验证码登录（新邮箱会自动注册），创建应用（名称、描述、图标），到详情页勾选平台并填写包名。
2. 用运营账号登录，打开「审核」通过该应用。
3. 用 curl 调开放接口（把 app_id 换成你的应用 ID）：

```bash
curl -s 'http://localhost:8787/v1/apps/recommend?app_id=<你的 app_id>&platform=android'
```

上报曝光 / 点击时必须带设备上持久化的 `client_id`（UUID）。卡片进入可视区后再报曝光。

## 生产部署（Cloudflare Workers）

前端静态资源和 API 部署到同一个 Worker，数据在 D1，缓存/验证码在 KV，图标在 R2：

```bash
pnpm run deploy
```

说明见 [DEPLOY.md](DEPLOY.md)。

## 仓库

- `apps/web` 开发者后台、文档、运营台
- `apps/api` Hono Worker：`/v1` `/dashboard` `/admin`，以及定时任务
- `packages/db` Drizzle schema 与 D1 迁移
- `packages/shared` 枚举与错误码

产品说明见 `PRD-appunions.md`，设计见 `TECH-appunions.md`。
