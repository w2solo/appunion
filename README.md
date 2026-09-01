# AppUnions

应用互推联盟：开发者后台 + 开放 API + 运营审核。技术栈为 Node.js / Fastify / PostgreSQL / Redis / MinIO，Web 为 React + Vite。

## 本地启动

```bash
cp .env.example .env
docker compose up -d postgres
# 若 6379 上还没有 Redis：docker compose up -d redis
# MinIO 可选：docker compose --profile full up -d minio
pnpm install
pnpm db:migrate
pnpm dev
```

- Web：http://localhost:5173
- API：http://localhost:3000
- Postgres：本机 `55432`（避免和常见的 5432 冲突）
- 图标：MinIO 不可用时会存到仓库 `data/icons`，经 `/media/icons` 访问

默认运营账号（`.env` 里可改）：

- 邮箱：`admin@appunions.local`
- 密码：`admin123456`

开发者走网站注册即可。

## 演示路径

1. 用开发者账号注册，创建应用，保存一次性 API Key。
2. 用运营账号登录，打开「审核」通过该应用。
3. 用 curl 调开放接口（把 Key 换成你的明文）：

```bash
curl -s http://localhost:3000/v1/apps/recommend \
  -H "Authorization: Bearer auk_live_xxx"
```

上报曝光 / 点击时必须带设备上持久化的 `client_id`（UUID）。卡片进入可视区后再报曝光。

## 仓库

- `apps/web` 开发者后台、文档、运营台
- `apps/api` Fastify：`/v1` `/dashboard` `/admin`
- `apps/worker` 推荐池、异常 CTR、日统计对账
- `packages/db` Drizzle schema 与迁移
- `packages/shared` 枚举与错误码

产品说明见 `PRD-appunions.md`，设计见 `TECH-appunions.md`。
