# 群聊桌面应用（Electron + Vue3 + Socket.io）设计方案

> 日期：2026-08-14
> 状态：待评审
> 目标：练透 Electron 技术栈，AI 作为点缀，复用已验证的 Node/MySQL/Docker 底座

---

## 1. 项目概述

开发一款 Electron 桌面群聊应用（名称暂定 group-chat），核心是多人实时文字聊天，包含房间、未读/已读、在线状态、桌面通知等 IM 基础能力。项目末尾接入一个 AI 机器人，以普通用户身份进群发言，作为练手彩蛋。

### 1.1 项目目标（按优先级）

1. **练透 Electron 技术栈**：主进程 / preload / 渲染进程分工、WebContentsView 多视图、系统托盘、桌面通知、安全模型（contextIsolation、CSP）、打包分发
2. **练实时通信**：Socket.io 房间、消息广播、在线状态、断线重连、消息可靠性
3. **补齐上轮项目短板**：Prisma ORM + 迁移、Controller/Service 分层、express-validator 校验
4. **AI 点缀**：AI 机器人进群、流式回复，与真人消息同一条链路

### 1.2 非目标（MVP 明确不做）

- 语音/视频通话
- 文件/图片上传（预留字段，不实现上传链路）
- 端到端加密
- 多端同步（只做桌面端）
- 富文本/表情包/贴纸

---

## 2. 技术栈

| 层级 | 技术 | 版本基线 | 说明 |
|------|------|----------|------|
| 桌面框架 | Electron | 30+ | 主进程 + preload + 渲染进程 |
| 多视图 | WebContentsView | Electron 30+ API | 取代 `<webview>` / BrowserView |
| 构建 | electron-vite | 2.x | 主/预加载/渲染三端打包，HMR |
| UI | Vue 3 + TypeScript + Naive UI + SCSS | Vue 3.4+ / TS 5.4 | 与已验证项目保持一致 |
| 状态 | Pinia | 2.x | 会话、房间列表、消息缓存 |
| HTTP | axios | 1.x | 复用统一封装模式 |
| 实时 | socket.io-client / socket.io | 4.x | 房间、广播、心跳、自动重连 |
| 后端 | Node.js + Express + TypeScript | Node 20 / Express 4 | 复用已验证骨架 |
| ORM | Prisma | 5.x | 类型安全建模 + 迁移（上轮欠债，本轮补上） |
| 数据库 | MySQL | 8.0 | utf8mb4、时区 +08:00 |
| 校验 | express-validator | 7.x | 结构化参数校验（上轮欠债，本轮补上） |
| 认证 | JWT + bcryptjs | — | REST 用 Bearer Token，Socket 握手鉴权 |
| 日志 | pino + pino-pretty | — | 服务端结构化日志 |
| 测试 | Vitest + supertest + Vue Test Utils | — | 后端单测/集成 + 前端组件测试 |
| 部署 | Docker Compose + Nginx + PM2（可选） | — | mysql + server 编排，Nginx 反向代理 |
| 服务器 | 阿里云轻量应用服务器 | 2C2G 起 | 与 Love Todo 同一部署模式 |

> 说明：不用 Redis。单实例 Socket.io 不需要跨进程 pub/sub，在线状态放内存 + MySQL，后续需要水平扩展再加。

---

## 3. 客户端架构

### 3.1 进程模型

```
Electron 主进程 (main)
├── BrowserWindow 主窗口
│   └── 渲染进程 (Vue SPA，聊天 UI)
│       └── preload 通过 contextBridge 暴露 window.chatAPI
└── WebContentsView：链接预览视图（聊天内点开 URL）
```

### 3.2 视图划分

**主窗口（Vue SPA）**：三栏布局

- 左侧：房间列表（含未读数角标）
- 中间：消息流（虚拟列表）
- 右侧：成员列表（可折叠）

**WebContentsView 链接预览**：聊天消息中出现 URL 时，点击后主进程创建/挂载独立 WebContentsView 加载该 URL，具备前进/后退/刷新/复制链接工具栏，并验证目标地址安全性（仅 http/https）。

> AI 交互不做独立面板视图，直接在聊天内以消息形式完成（@机器人），避免功能重复、控制 MVP 范围。

### 3.3 preload 暴露的最小 API（window.chatAPI）

```ts
interface ChatAPI {
  notify: (title: string, body: string) => void;          // 桌面通知
  tray: { setBadge: (count: number) => void };            // 托盘未读角标
  openLink: (url: string) => Promise<void>;               // 主进程打开预览视图
  window: { minimize: () => void; closeToTray: () => void };
}
```

渲染进程绝不直接使用 Node API；所有系统能力经 preload 代理。消息与在线状态走渲染进程内的 Socket.io 连接，不需要经主进程中转。

---

## 4. 后端架构

### 4.1 分层

```
server/src
├── app.ts                 # helmet → cors → json → 路由 → 404 → 全局错误
├── index.ts               # 启动 HTTP + Socket.io
├── config/                # 环境变量读取与校验
├── routes/                # 路由定义（薄层）
├── controllers/           # 请求处理：参数校验、调用 service、统一响应
├── services/              # 业务逻辑（房间、消息、未读、AI）
├── repositories/          # Prisma 数据访问封装
├── middleware/            # auth（JWT）、validation、error
├── sockets/               # Socket.io 事件处理、连接管理、在线状态
├── utils/                 # response 统一格式、日志
├── prisma/                # schema.prisma + migrations
└── tests/                 # Vitest 测试
```

### 4.2 REST 与 Socket 分工

| 能力 | 通道 | 说明 |
|------|------|------|
| 注册 / 登录 / Token 校验 | REST `/api/v1/auth` | JWT Bearer |
| 房间 CRUD、加入/退出 | REST `/api/v1/rooms` | |
| 历史消息分页 | REST `/api/v1/rooms/:id/messages?cursor=` | 游标分页 |
| 已读上报 | REST `/api/v1/rooms/:id/read` | 更新 last_read_message_id |
| 用户信息 / 在线状态查询 | REST `/api/v1/users` | |
| 实时消息发送/广播 | Socket `message:send` / `message:new` | 落库后广播，ack 确认 |
| 在线状态 | Socket `presence:update` / `presence:changed` | 连接/断开驱动 |
| 输入状态 | Socket `typing` | 仅转发，不落库 |
| AI 流式回复 | Socket 事件流 | 服务端逐段推送 |

### 4.3 Socket.io 设计

- 连接握手：`io.use(authMiddleware)`，从 `auth.token` 校验 JWT，挂载 userId
- 房间映射：加入 Socket 房间 `room:{rid}`，退出时自动 leave
- 消息可靠性：客户端 emit `message:send`，服务端落库成功后 ack `{ mid, status: 'ok' }`，失败 ack `{ status: 'error', code }`；客户端未收到 ok 前显示"发送中"，失败可重发
- 心跳：依赖 Socket.io 默认 ping/pong；服务端维护 `onlineUsers: Map<uid, Set<socketId>>`
- 断线重连：socket.io-client 默认自动重连；重连后客户端重新加入房间并拉取增量

---

## 5. 数据模型（Prisma）

```prisma
model User {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String
  nickname     String
  avatarUrl    String?
  status       String   @default("offline") // online / offline
  createdAt    DateTime @default(now())
  memberships  RoomMember[]
  messages     Message[]
}

model Room {
  id            String    @id @default(uuid())
  name          String
  ownerId       String
  lastMessageAt DateTime?  // 房间按最近活跃排序
  createdAt     DateTime  @default(now())
  members       RoomMember[]
  messages      Message[]
}

model RoomMember {
  id                 String   @id @default(uuid())
  roomId             String
  userId             String
  lastReadMessageId  String?
  joinedAt           DateTime @default(now())

  @@unique([roomId, userId])
  @@index([userId])
}

model Message {
  id        String   @id @default(uuid())
  roomId    String
  senderId  String   // 真人或 AI 机器人同一张表
  type      String   @default("text") // text / system / ai
  content   String
  createdAt DateTime @default(now())

  @@index([roomId, createdAt])
}
```

要点：

- 主键 uuid（沿用上轮实践），消息表 `(roomId, createdAt)` 复合索引支撑游标分页
- 已读状态用 `RoomMember.lastReadMessageId`，未读数 = 该房间 `createdAt > lastReadAt` 的消息数
- 不单独建 bots 表；AI 机器人由系统创建专属 User，消息带 `type: 'ai'` 便于前端渲染差异

---

## 6. 核心流程

### 6.1 登录 → 建连 → 进房

1. 客户端登录拿到 JWT，存入 Pinia + localStorage
2. 连接 Socket，握手带 token；成功后 emit `room:join`（携带全部房间 id）
3. 服务端将 socket 加入对应 room，返回各房间最新消息时间，客户端按需拉取增量

### 6.2 发消息

1. 客户端 emit `message:send { roomId, content, clientMsgId }`
2. 服务端校验 → 事务落库 → 更新房间 lastMessageAt → ack ok
3. 服务端向 room 广播 `message:new`（含消息 + 发送者信息）
4. 其他成员收到后：当前房间直接追加，非当前房间更新未读数并触发桌面通知（仅前台不活跃时）

### 6.3 已读

- 切换房间时 REST 上报已读；切走时再次上报
- 客户端未读数 = 服务端下发 + 本地收到的实时增量

### 6.4 在线状态

- 服务端以 `onlineUsers` Map 记录 uid → socketIds；首连广播上线，最后一个连接断开广播下线
- 客户端通过 `presence:changed` 更新成员列表状态

### 6.5 AI 机器人（最后阶段）

- 每个房间可选绑定一个 AI 机器人（房间创建时勾选）
- 真人 @机器人 或机器人收到新消息后，服务端调 LLM API（DeepSeek/GPT，流式）
- AI 回复以 `type: 'ai'` 消息逐段推送 `message:typing` → 完成后发完整 `message:new`
- Prompt 携带最近 10 条房间消息作上下文；失败时回复兜底文案

### 6.6 链接预览（WebContentsView）

- 渲染进程解析消息文本中的 URL，展示链接卡片
- 点击后调用 `window.chatAPI.openLink(url)`，主进程校验协议后挂载 WebContentsView
- 预览视图工具栏提供前进/后退/刷新/复制/关闭；关闭时销毁视图

---

## 7. Electron 安全实践

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- 所有系统能力经 preload + contextBridge 暴露，白名单事件通道
- 渲染进程 CSP：仅允许自身资源与 `ws(s)://` 连接后端；禁止 `unsafe-inline` 脚本
- WebContentsView 加载外部 URL 前校验协议（仅 http/https），并设置独立 session（不共享主窗口 cookie/权限）
- 后端：helmet、CORS 白名单、JWT_SECRET 强随机、密码 bcrypt、SQL 全部走 Prisma 参数化

---

## 8. 错误处理与日志

- REST 统一响应：`{ success, data }` / `{ success: false, error: { code, message } }`（沿用上轮）
- 全局错误中间件兜底，未知错误返回 500 + 通用文案，日志记录堆栈
- Socket：业务错误通过 ack 返回 `{ status: 'error', code, message }`，不直接断开连接
- 服务端日志用 pino：请求日志、Socket 事件日志（级别控制）、AI 调用耗时
- 客户端：全局 toast 展示错误；网络断开时顶部横幅提示，自动重连后消失

---

## 9. 测试策略

**后端（Vitest + supertest）**

- auth：注册/登录/Token 校验/过期
- rooms：创建、加入、重复加入、权限
- messages：发送落库、分页边界、非法 roomId
- read：已读上报与未读数计算
- sockets：握手鉴权失败拒绝、广播到达目标房间

**前端（Vitest + Vue Test Utils）**

- 消息列表虚拟滚动渲染数量恒定
- 未读数角标更新逻辑
- preload API mock 下的通知/托盘调用

**可选 E2E**：Playwright（Electron 支持），覆盖"登录 → 建房间 → 收发消息"主链路，放到后期。

---

## 10. 项目结构（Monorepo）

```
group-chat/
├── client/                 # electron-vite + Vue3
│   ├── electron/           # main / preload / WebContentsView 管理
│   ├── src/                # Vue 渲染进程
│   └── package.json
├── server/                 # Express + Socket.io + Prisma
│   ├── src/
│   ├── prisma/
│   └── package.json
├── docs/
│   ├── 多人聊天桌面应用技术可行性分析报告.md
│   └── superpowers/specs/2026-08-14-group-chat-electron-design.md
├── docker-compose.yml
└── deploy.sh
```

---

## 11. 部署方案（阿里云轻量服务器）

### 11.1 服务编排

| 服务 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| mysql | mysql:8.0 | 仅内网 | healthcheck + 数据卷 |
| server | 本地构建 node:20-alpine | 3001 内网 | tini init + pino 日志卷 |
| nginx | nginx:stable-alpine | 80/443 → 80 | API 反向代理 + HTTPS（后续） |

- `depends_on: condition: service_healthy` 保证 MySQL 就绪
- Prisma 迁移在 server 容器启动时执行（`prisma migrate deploy`）
- `.env` 管理 JWT_SECRET、DB 密码等敏感项，不入库

### 11.2 安全组

- 仅开放 80（HTTP，后续 443）；MySQL 3306 与后端 3001 不对外
- 客户端连接走 Nginx 反代，统一入口

### 11.3 资源预算（2C2G）

- MySQL 容器：约 400MB（调小 buffer pool）
- server 容器：约 250MB
- Nginx：约 50MB
- 总占用 < 1G，余量充足

### 11.4 部署脚本（deploy.sh，复用上轮模式）

- 本地构建 → rsync 上传 → SSH `docker compose up -d --build` → `/health` 健康检查

---

## 12. 开发路线图

**Week 1：骨架与地基**

- 初始化 client（electron-vite + Vue3 + TS）与 server（Express + TS + Prisma）
- 主进程最小可用：窗口、preload 通道、contextIsolation
- Prisma schema + 首次迁移；注册/登录 + JWT
- Socket 握手鉴权 + 连接测试

**Week 2：核心聊天**

- 房间创建/加入/列表
- 消息发送 → 落库 → 广播 → 前端消息流（先普通滚动）
- 历史消息游标分页

**Week 3：IM 高级能力**

- 未读/已读、在线状态、输入状态
- 虚拟列表（消息量千级验证）
- 系统托盘 + 桌面通知 + 关闭到托盘

**Week 4：多视图与 AI**

- WebContentsView 链接预览视图
- AI 机器人进群 + 流式回复

**Week 5：部署与打磨（可选）**

- docker-compose + deploy.sh 上线轻量服务器
- 打包（electron-builder）产出 dmg/exe
- Playwright 主链路 E2E（可选）

---

## 13. 风险与对策

| 风险 | 对策 |
|------|------|
| Electron 内存占用高 | 虚拟列表控制 DOM 量；WebContentsView 用后即毁；懒加载非当前视图 |
| Socket 消息丢失/重复 | 客户端 clientMsgId 幂等去重；ack 重试 |
| 轻量服务器带宽/连接数限制 | MVP 单实例 + 限制房间数；在线状态聚合下发 |
| 外部链接内容恶意 | 独立 session、协议白名单、禁止脚本注入主窗口 |
| LLM 接口超时/限流 | 流式 + 超时兜底文案；AI 请求与聊天主链路解耦 |

---

## 14. 验收标准

- 两台电脑（或两个账号）可实时互发文字消息，顺序一致、无丢消息
- 离线/重连后未读数量正确，消息不重复
- 历史消息万级分页无卡顿（虚拟列表）
- 托盘图标显示未读数，新消息弹桌面通知
- AI 机器人能在群里被 @ 并流式回复
- 客户端禁 Node 权限，preload 白名单 API 可审计
- docker-compose 一键部署，`/health` 通过
