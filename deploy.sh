#!/usr/bin/env bash
set -euo pipefail

SERVER_IP="${SERVER_IP:?请设置 SERVER_IP}"
SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/group-chat}"

echo "==> 同步代码到服务器"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git --exclude client \
  ./ "$SSH_USER@$SERVER_IP:$REMOTE_DIR/"

echo "==> 远程构建并启动"
ssh "$SSH_USER@$SERVER_IP" "cd $REMOTE_DIR && docker compose up -d --build"

echo "==> 健康检查"
sleep 5
curl -fsS "http://$SERVER_IP/health" || { echo "健康检查失败"; exit 1; }
echo "部署完成: http://$SERVER_IP/health"
