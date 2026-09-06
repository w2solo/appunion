#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file deploy/.env)
ENV_FILE="$ROOT/deploy/.env"
EXAMPLE="$ROOT/deploy/.env.example"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
info() { printf '\033[36m%s\033[0m\n' "$*"; }

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    red "缺少命令：$1"
    exit 1
  fi
}

need docker
need openssl
if ! docker compose version >/dev/null 2>&1; then
  red "需要 Docker Compose 插件（docker compose）。1Panel 默认已带，请确认 Docker 已安装。"
  exit 1
fi

if [[ ! -f "$EXAMPLE" ]]; then
  red "找不到 $EXAMPLE，请在仓库根目录执行本脚本。"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  jwt="$(openssl rand -hex 32)"
  pgpass="$(openssl rand -hex 16)"
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${jwt}/" "$ENV_FILE"
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${pgpass}/" "$ENV_FILE"
  green "已生成 deploy/.env（数据库密码和 JWT 已随机写入）"
else
  info "沿用已有 deploy/.env"
fi

if grep -q '^JWT_SECRET=CHANGE_ME' "$ENV_FILE" || grep -q '^POSTGRES_PASSWORD=CHANGE_ME' "$ENV_FILE"; then
  red "deploy/.env 里还有 CHANGE_ME，请改掉 JWT_SECRET / POSTGRES_PASSWORD 后再跑。"
  exit 1
fi

if [[ "${RESET_DB:-}" == "1" ]]; then
  red "RESET_DB=1：将删除 Postgres 数据卷。旧 1Panel 库无法自动升级到当前 schema。"
  "${COMPOSE[@]}" down --remove-orphans
  docker volume rm appunions_pgdata 2>/dev/null || true
  docker volume rm appunions_redisdata 2>/dev/null || true
fi

info "构建并启动 AppUnions..."
if ! "${COMPOSE[@]}" up -d --build --remove-orphans --force-recreate; then
  red "启动失败。migrate 日志："
  "${COMPOSE[@]}" logs migrate || true
  red "若是从旧 1Panel 迁回来，库结构已经对不上，需要清空后再装："
  red "  RESET_DB=1 bash deploy/install.sh"
  exit 1
fi

port="$(grep -E '^PUBLISH_PORT=' "$ENV_FILE" | tail -n1 | cut -d= -f2-)"
port="${port:-18080}"

probe() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$1" >/dev/null 2>&1
  else
    wget -qO- "$1" >/dev/null 2>&1
  fi
}

info "等待健康检查..."
ok=0
for _ in $(seq 1 60); do
  if probe "http://127.0.0.1:${port}/health"; then
    ok=1
    break
  fi
  sleep 2
done

echo
"${COMPOSE[@]}" ps
echo

if [[ "$ok" -eq 1 ]]; then
  green "服务已启动。本机探活：http://127.0.0.1:${port}/health"
else
  red "容器已拉起，但 /health 尚未通过。看日志：docker compose -f docker-compose.prod.yml --env-file deploy/.env logs -f api"
fi

cat <<EOF

接下来在 1Panel 做反向代理（域名和证书你自己配）：

  1. 网站 → 创建网站 → 反向代理
  2. 代理地址只填：127.0.0.1:${port}（不要加 http://）
  3. 域名、SSL 按 1Panel 流程处理即可

常用命令（在仓库根目录）：

  ${COMPOSE[*]} logs -f api
  ${COMPOSE[*]} ps
  ${COMPOSE[*]} restart

没配 SendCloud 时，登录验证码在 api 日志里，搜 login code。
EOF
