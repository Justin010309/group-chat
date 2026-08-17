# GroupChat

Electron + React + Socket.io 桌面群聊应用。

## 技术栈

Electron 30+ / electron-vite / React 19 / Ant Design / Zustand / @tanstack/react-virtual /
Node 20 / Express 4 / Socket.io 4 / Prisma / MySQL 8.0 / Docker Compose / Nginx

## 本地开发

1. 启动本机 MySQL，创建 `group_chat` 与 `group_chat_test` 两个库
2. `cp server/.env.example server/.env` 并填入 MySQL 密码 / JWT_SECRET
3. `npm install`
4. `npm run dev:server`
5. `npm run dev:client`

## 测试

```bash
npm test
```

服务端测试使用 `group_chat_test` 库（`TEST_DATABASE_URL`），不会污染开发数据。

## AI 助手

在 `server/.env` 配置 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`，房间内发 `@AI 助手` 消息即可触发流式回复。

## 部署（阿里云轻量服务器）

1. 服务器安装 Docker + Docker Compose，安全组开放 80
2. 上传 `docker-compose.yml`、`nginx.conf`、`server/` 到 `/opt/group-chat`
3. 在 `/opt/group-chat/.env` 配置 `MYSQL_ROOT_PASSWORD` / `JWT_SECRET` / `AI_*`
4. 本地执行 `./deploy.sh`（需设置 `SERVER_IP`）

## 打包

```bash
npm run build:mac -w client   # macOS dmg（本机）
npm run build:win -w client   # Windows nsis（需 Windows 环境或 CI）
npm run build:linux -w client # Linux AppImage
```

## 验收清单

- [ ] 双账号实时收发、顺序一致、无丢消息
- [ ] 离线/重连后未读正确、消息不重复
- [ ] 万级历史消息分页与虚拟列表流畅
- [ ] 托盘未读角标 + 桌面通知
- [ ] @AI 助手 流式回复
- [ ] docker compose 一键部署，/health 通过
