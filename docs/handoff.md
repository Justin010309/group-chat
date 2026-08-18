# GroupChat 项目交接文档

> 更新日期：2026-08-17
> 用途：新会话/新窗口接手本项目时，先读本文档，再读 `docs/2026-08-17-项目数据流程图与架构图.md`（架构唯一基准，开发不得跑偏），最后读 `docs/superpowers/specs/2026-08-14-group-chat-electron-design.md` 与 `docs/superpowers/plans/2026-08-14-group-chat-electron.md`。

---

## 1. 项目一句话

Electron 30+ / React 19 桌面群聊应用：实时文字聊天（Socket.io）、房间/未读/在线状态、房间邀请与加入（输入 ID / 邀请链接深链 / 成员面板邀请）、虚拟列表、托盘通知、WebContentsView 链接预览、AI 机器人流式回复（SSE → Socket），后端 Node/Express + Prisma + MySQL 8，Docker 部署方案已就绪。

## 2. 当前状态

- **20 个实施任务、5 个 Phase 全部完成**，全部在分支 `feat/group-chat-implementation`（基于 `main`，main 上只有文档）
- 自动化测试：**server 32/32、client 24/24、tsc 类型检查干净**
- 服务端端到端验收脚本：**10/10 通过**（`.superpowers/sdd/smoke-test.cjs`，双账号实时收发/未读/已读/幂等）
- 已推送两个远程：GitHub `origin`（Justin010309/group-chat）、Gitee `gitee`（li-canyang/group-chat）
- PR 创建链接（未创建）：https://github.com/Justin010309/group-chat/pull/new/feat/group-chat-implementation

## 3. 如何启动（本地开发）

```bash
# 前置：本机 MySQL 8.0 已启动（brew services start mysql@8.0）
# server/.env 已配置（gitignored）：root 密码 Ljh@010309，DATABASE_URL 指向 group_chat

npm install          # 根目录 workspaces 安装
npm run dev:server   # 后端 :3001（tsx watch）
npm run dev:client   # Electron 客户端（electron-vite dev）
```

测试命令：

```bash
npm run test -w server   # 用 group_chat_test 库，不污染开发数据
npm run test -w client
npm run build -w client  # typecheck + electron-vite build
```

## 4. 验收账号（GUI 手动验证用）

| 账号 | 昵称 | 密码 |
|---|---|---|
| `t_smoke_a_1786948555605` | 验收A | `pass1234` |
| `t_smoke_b_1786948555605` | 验收B | `pass1234` |

两个账号都是"验收群"成员。双账号测试：Electron 窗口登 A，浏览器打开 http://localhost:5173 登 B（vite dev 代理 `/api`，socket 直连 ws://localhost:3001）。

> 客户端目前只有登录页，没有注册页；需要新账号用 API 注册：`POST /api/v1/auth/register`。

## 5. 验收进度

✅ 已完成：

- 服务端端到端 10/10（注册/登录/建房间/加入/Socket 收发/未读/已读/历史/幂等）
- 自动化测试全绿
- macOS 打包验证（`client/dist/mac-arm64/GroupChat.app`，未签名）

⏳ 待 GUI 手动验收（需要真人操作窗口）：

1. 双账号 GUI 互发消息（后端链路已验证）
2. 托盘：关闭窗口最小化到托盘、Dock 角标、桌面通知
3. 链接预览：发含 URL 的消息 → 点链接卡片 → WebContentsView 预览 + 工具条
4. AI 助手：`server/.env` 填 `AI_API_KEY`（真实 Key）后重启 server，发 `@AI 助手 ...` 看流式回复
5. 阿里云部署：`docker-compose.yml` / `nginx.conf` / `deploy.sh` 已就绪，服务器上建 `.env` 后执行
6. 加入房间三入口：① RoomList「加入房间」粘贴房间 ID/邀请链接；② 复制邀请链接后执行 `open "groupchat://join?roomId=<id>"` 验证深链自动打开弹窗；③ 成员面板「邀请成员」按账号拉人，对方在线时实时刷新房间列表

## 6. 近期已修复的问题（避免重复排查）

| 问题 | 根因 | 修复 |
|---|---|---|
| npm install 卡死 | client 脚手架 postinstall（electron-builder install-app-deps）嵌套安装挂起 | 已从 client/package.json 删除该脚本 |
| 登录后无限重渲染崩溃 | MessageList 选择器每次返回新空数组引用 | 改用模块级 EMPTY_MESSAGES 常量 |
| 登录后布局被压缩 | 脚手架 main.css 的 body/#root flex 居中 + 深色波浪背景 | 重写 main.css（浅色全高无居中） |
| 发消息报重复 key | 发送者同时收到 ack 追加 + 房间广播 | 服务端 socket.to(room) 排除发送者 + 客户端按 id 去重 |
| 未读计数含自己的消息 | countAfter 未排除发送者 | countAfter 增加 exceptSenderId 参数 |
| 不能新建房间 | 新建按钮当时未接逻辑 | RoomList 弹窗 + store.createRoom + joinRooms |
| 房间列表显示为空 | 客户端状态（HMR 重置 store 未重载） | 刷新/重登即可；服务端数据未丢 |
| antd List 废弃警告 | antd 6 移除了 List | RoomList 改为原生 div 布局 |

## 7. 环境与坑位备忘

- **沙箱限制**：沙箱禁止回环监听/联网；server 启动、测试、mysql、npm install、git 写操作都要 `require_escalated` 提权（已批准前缀：npm install/run test/run dev、npx prisma、mysql、git add/commit/push、curl）
- **npm 源**：已是国内镜像 registry.npmmirror.com；Electron 二进制镜像未配置（首次已下载完成）
- **Prisma 版本**：实际安装 6.19.3（计划写 5.x）；server/Dockerfile runner 阶段固定 prisma@6.19.3 供 migrate deploy
- **表名**：Prisma 默认不转小写，表名为 User / Room / RoomMember / Message
- **测试库隔离**：server/tests/setup-env.ts + global-setup.ts（vitest 自动 migrate deploy 到 group_chat_test）
- **client vitest 配置**：文件名 vitest.config.mts（ESM，加载 @vitejs/plugin-react 需要）
- **jsdom 测试虚拟列表**：MessageList 测试 mock 了 HTMLElement.prototype.offsetHeight/offsetWidth（TanStack Virtual 用 offsetHeight 测量）
- **子代理消息通道**：本会话多代理消息投递不可靠（多次丢消息）；后续如需子代理模式先探测或重启应用

## 8. 目录速览

```
client/  electron-vite + React 19（main/preload/renderer）
  src/main/index.ts        窗口、托盘、通知、WebContentsView 链接预览
  src/preload/index.ts     window.chatAPI 白名单
  src/renderer/src/        api / stores(chat,session) / services(socket) / pages(Login,Chat) / components
server/  Express + Socket.io + Prisma
  src/routes,controllers,services,repositories,middleware,sockets,utils
  prisma/schema.prisma + migrations
docs/  可行性报告、设计文档、实施计划、架构与数据流图（唯一基准）、本文档
docker-compose.yml  nginx.conf  deploy.sh  README.md
```

## 9. 下一步建议

1. 完成第 5 节 GUI 验收，修掉发现的问题（提交到同一分支，PR 会自动包含）
2. 在 GitHub 或 Gitee 创建 PR（base=main，head=feat/group-chat-implementation），验收通过后合入
3. 合入后：git checkout main && git pull，后续开发从 main 开新分支
4. 部署阿里云：服务器建 /opt/group-chat/.env（MYSQL_ROOT_PASSWORD/JWT_SECRET/AI_*），执行 ./deploy.sh
5. 需要新账号时用 API 注册，或在客户端补注册页（未在 20 任务范围内）
