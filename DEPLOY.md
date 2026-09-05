# AppUnions 生产部署（Ubuntu + 1Panel）

一套 Docker Compose 起全部服务：PostgreSQL、Redis、API、Worker、Web。域名和证书由 1Panel 反代处理，本仓库不碰 80/443。

```
浏览器 ──HTTPS──► 1Panel OpenResty（域名 / 证书）
                      │
                      ▼
              127.0.0.1:18080  Web(nginx)
                      │
          /v1 /dashboard /admin /health /media ──► API
          其它路径 ──► 前端静态资源
```

| 容器 | 作用 |
| --- | --- |
| `postgres` | 业务库，不对外暴露端口 |
| `redis` | 验证码、推荐池缓存，不对外暴露 |
| `migrate` | 启动时跑数据库迁移，跑完退出 |
| `api` | Fastify，只在内部网络听 3000 |
| `worker` | 推荐池刷新、异常 CTR、日对账 |
| `web` | nginx 静态站 + 反代 API，只绑 `127.0.0.1:18080` |

图标默认落在 Docker 卷里，经 `/media/icons` 访问，不必再单独开 MinIO。

---

## 0. 服务器准备

1. Ubuntu，已装 [1Panel](https://1panel.cn/)。它自带 Docker 和 Compose，不用再装一遍。
2. 1Panel 里确认 **容器 / Docker** 是运行状态。国内机器建议先配镜像加速：容器 → 设置 → 镜像加速，否则拉 `node` / `postgres` 可能超时。
3. 准备好以后要绑的域名（证书在 1Panel 里申请即可）。

建议代码目录：

```bash
sudo mkdir -p /opt/appunions
sudo chown "$USER":"$USER" /opt/appunions
```

---

## 1. 一键部署

在 1Panel 终端，或 SSH 进机器后：

```bash
cd /opt
git clone <本仓库地址> appunions
cd appunions
bash deploy/install.sh
```

脚本会：

1. 若还没有 `deploy/.env`，从模板复制，并随机生成 `POSTGRES_PASSWORD`、`JWT_SECRET`
2. `docker compose` 构建并启动全部服务
3. 探活 `http://127.0.0.1:18080/health`

已经存在的 `deploy/.env` **不会被覆盖**。改配置后重新执行同一条命令即可（等价于更新发布）。

---

## 2. 1Panel 反代（域名 / 证书）

服务只听本机 `18080`，公网不用放行这个端口。

1. 1Panel → **网站** → **创建网站** → **反向代理**
2. 主域名填你的域名
3. 代理地址填：`http://127.0.0.1:18080`
4. 其它保持默认（会转发 `/v1`、`/dashboard`、页面路由）
5. 在该网站里申请 / 上传证书，打开 HTTPS

不要再单独建一个「静态网站」指到前端 dist，也不要把 80/443 映射进 Compose，那些留给 1Panel。

用 HTTPS 访问时保持 `COOKIE_SECURE=true`（默认）。若暂时用 `http://IP:端口` 调试登录，把 `deploy/.env` 里改成 `COOKIE_SECURE=false` 再 `bash deploy/install.sh`。

---

## 3. 发信（登录验证码）

登录走邮箱验证码。在 `deploy/.env` 填 SendCloud：

```bash
SENDCLOUD_API_USER=...
SENDCLOUD_API_KEY=...
SENDCLOUD_FROM=noreply@your-domain.com
SENDCLOUD_FROM_NAME=AppUnions
```

然后：

```bash
cd /opt/appunions
bash deploy/install.sh
```

没配发信时，验证码只打在 API 日志里：

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env logs -f api
```

搜 `login code`。生产环境请尽快配上发信，并保持 `AUTH_ECHO_CODE=false`。

---

## 4. 第一次登录

浏览器打开你的域名，用超级管理员邮箱 `cmlanche@qq.com` 收验证码登录。左侧会出现审核 / 异常 / 设置 / 管理员。

普通管理员由超管在「管理员」页把已注册用户标上去。

---

## 5. 日常运维

都在仓库根目录执行：

```bash
# 状态
docker compose -f docker-compose.prod.yml --env-file deploy/.env ps

# 日志
docker compose -f docker-compose.prod.yml --env-file deploy/.env logs -f api worker web

# 更新代码并重建
git pull
bash deploy/install.sh

# 停服务（保留数据卷）
docker compose -f docker-compose.prod.yml --env-file deploy/.env down
```

### 备份数据库

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env exec -T postgres \
  pg_dump -U appunions appunions > appunions-$(date +%F).sql
```

1Panel 也可以备份对应 Docker 卷（`appunions_pgdata`、`appunions_redisdata`、`appunions_icons`）。

### 改端口

改 `deploy/.env` 的 `PUBLISH_PORT`，再跑 `bash deploy/install.sh`。1Panel 反代地址跟着改。

---

## 6. 用 1Panel Compose 面板（可选）

更省事的是上一节脚本。若一定要用面板：

1. 先 `git clone` 到 `/opt/appunions`，并复制 `deploy/.env.example` → `deploy/.env`，改掉 `CHANGE_ME`
2. 1Panel → **容器** → **Compose** → **创建**
3. **工作目录必须是仓库根** `/opt/appunions`（构建上下文要包含源码）
4. Compose 文件选 `docker-compose.prod.yml`
5. 环境变量文件选 `deploy/.env`

不要只把 `docker-compose.prod.yml` 拷进 1Panel 自己的应用目录，那样镜像构建找不到源码。

---

## 7. 排查

| 现象 | 处理 |
| --- | --- |
| `/health` 返回 503 | Postgres / Redis 没好，看 `logs postgres redis` |
| 页面开得开，登录没验证码 | 没配 SendCloud，看 `logs api` 里的 `login code` |
| 登录成功但立刻掉线 | 用了 HTTP 却 `COOKIE_SECURE=true`，或反代没把 Cookie 转给后端 |
| 1Panel 502 | 服务没起来，或反代地址不是 `http://127.0.0.1:18080` |
| 构建失败 / 拉镜像超时 | 确认在仓库根目录执行；1Panel 配镜像加速后再跑 `bash deploy/install.sh` |

本地开发仍用根目录 `docker-compose.yml` 和 `.env`，与生产的 `docker-compose.prod.yml` / `deploy/.env` 互不影响。
