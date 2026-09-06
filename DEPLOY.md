# AppUnions 生产部署（Ubuntu + 1Panel）

一套 Docker Compose 起全部服务：PostgreSQL、API（同时托管前端静态资源和定时任务）。域名和证书由 1Panel 反代处理，本仓库不碰 80/443。

```
浏览器 ──HTTPS──► 1Panel OpenResty（域名 / 证书）
                      │
                      ▼
              127.0.0.1:18080  API（Hono Node）
                      │
          /v1 /dashboard /admin /health /media /internal ──► Hono
          其它路径 ──► Vite 构建的 SPA
```

| 容器 | 作用 |
| --- | --- |
| `postgres` | 业务库，不对外暴露端口 |
| `migrate` | 启动时跑数据库迁移，跑完退出 |
| `api` | Hono：开放 API、后台 API、静态站、node-cron；只绑 `127.0.0.1:18080` |

图标落在 Docker 卷里，经 `/media/icons` 访问。不要水平扩 `api`：进程内缓存和图标卷都假定单实例。

---

## 0. 服务器准备

1. Ubuntu，已装 [1Panel](https://1panel.cn/)。它自带 Docker 和 Compose，不用再装一遍。
2. 1Panel 里确认 **容器 / Docker** 是运行状态。国内机器建议先配镜像加速：容器 → 设置 → 镜像加速，否则拉 `node` / `postgres` 可能超时。
3. 准备好以后要绑的域名（证书在 1Panel 里申请即可）。
4. **大陆机必须完成 ICP 备案**（含接入备案）。没过审时公网 HTTPS 会被拦截，只能本机 `curl http://127.0.0.1:18080/health` 验证服务本身。

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

首次部署后请立刻编辑 `deploy/.env`，填上 `SUPER_ADMIN_EMAIL` 和 SendCloud，再跑一次 `bash deploy/install.sh`。

---

## 2. 1Panel 反代（域名 / 证书）

服务只听本机 `18080`，公网不用放行这个端口。

1. 1Panel → **网站** → **创建网站** → **反向代理**
2. 主域名填你的域名
3. 代理地址只填 `127.0.0.1:18080`（**不要**带 `http://`）。若表单有协议下拉框，选 `http`，地址框仍只填 `127.0.0.1:18080`
4. 其它保持默认（会转发 `/v1`、`/dashboard`、页面路由）
5. 在该网站里申请 / 上传证书，打开 HTTPS

1Panel 会把这个值写进 nginx `upstream { server ... }`。写成 `http://127.0.0.1:18080` 会报 `invalid port in upstream`，保存失败。

不要再单独建一个「静态网站」指到前端 dist，也不要把 80/443 映射进 Compose，那些留给 1Panel。

用 HTTPS 访问时保持 `COOKIE_SECURE=true`（默认）。若暂时用 `http://IP:端口` 调试登录，把 `deploy/.env` 里改成 `COOKIE_SECURE=false` 再 `bash deploy/install.sh`。

---

## 3. 环境变量

密钥只写在服务器上的 `deploy/.env`，不要提交进 git。

| 变量 | 说明 |
| --- | --- |
| `PUBLISH_PORT` | 本机反代端口，默认 `18080` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | 库账号，脚本会随机密码 |
| `JWT_SECRET` | 登录 cookie，不要改来改去 |
| `COOKIE_SECURE` | 走 HTTPS 时保持 `true` |
| `AUTH_ECHO_CODE` | 生产务必 `false` |
| `SUPER_ADMIN_EMAIL` | 超管登录邮箱 |
| `ICONS_DIR` | Compose 已写死 `/app/data/icons` |
| `SENDCLOUD_API_USER` / `SENDCLOUD_API_KEY` / `SENDCLOUD_FROM` | 登录验证码发信 |
| `CRON_SECRET` | 可选，调内部定时接口 |

---

## 4. 发信（登录验证码）

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

## 5. 第一次登录

浏览器打开你的域名，用 `SUPER_ADMIN_EMAIL` 那个邮箱收验证码登录。左侧会出现审核 / 异常 / 设置 / 管理员。「设置」里能看到当前超管邮箱。

普通管理员由超管在「管理员」页把已注册用户标上去。

---

## 6. 日常运维

都在仓库根目录执行：

```bash
# 状态
docker compose -f docker-compose.prod.yml --env-file deploy/.env ps

# 日志
docker compose -f docker-compose.prod.yml --env-file deploy/.env logs -f api

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

1Panel 也可以备份对应 Docker 卷（`appunions_pgdata`、`appunions_icons`）。

### 改端口

改 `deploy/.env` 的 `PUBLISH_PORT`，再跑 `bash deploy/install.sh`。1Panel 反代地址跟着改。

---

## 排查

| 现象 | 处理 |
| --- | --- |
| `/health` 不通 | 看 `api` / `migrate` 日志；确认 Postgres 已 healthy |
| 启动报 `DATABASE_URL is required` | `deploy/.env` 没被 compose 读到，确认 `--env-file deploy/.env` |
| 登录没验证码 | 没配 SendCloud 三项，去 api 日志搜 `login code` |
| 登录成功立刻掉线 | 用了 HTTP 但 `COOKIE_SECURE=true`；域名必须 HTTPS |
| 进不去超管菜单 | `SUPER_ADMIN_EMAIL` 没填，或和登录邮箱不一致；改完要重建并重新登录 |
| 图标 404 | 确认 `api` 挂了 `icons` 卷，`ICONS_DIR=/app/data/icons` |
| 1Panel 保存反代报 `invalid port in upstream` | 代理地址写成了 `http://127.0.0.1:18080`。改成 `127.0.0.1:18080` 再保存 |
| 1Panel 502 | 服务没起来，或反代地址/端口不是 `127.0.0.1:18080` |
| 构建失败 / 拉镜像超时 | 确认在仓库根目录执行；1Panel 配镜像加速后再跑 `bash deploy/install.sh` |
| 公网打不开、本机 `/health` 正常 | 大陆机 ICP 备案或安全组/防火墙未放行 443 |
