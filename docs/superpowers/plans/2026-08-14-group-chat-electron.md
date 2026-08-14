# Group Chat Electron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Electron + React 桌面群聊应用：实时文字聊天、房间/未读/在线/桌面通知、WebContentsView 链接预览，AI 机器人进群流式回复，最终 Docker 部署到阿里云轻量服务器。

**Architecture:** monorepo（client / server）。client 为 electron-vite + React 19 渲染进程，主进程负责窗口、托盘、通知与 WebContentsView 链接预览，preload 经 contextBridge 暴露最小 API；server 为 Express + Socket.io + Prisma，REST 管认证/房间/历史消息，Socket 管实时消息/在线状态/AI 流式推送，MySQL 持久化，docker-compose 部署。

**Tech Stack:** Electron 30+、electron-vite、React 19 + TS、Ant Design、Zustand、@tanstack/react-virtual、axios、socket.io(-client)、Node 20、Express 4、Prisma 5、MySQL 8.0、express-validator、jsonwebtoken、bcryptjs、pino、Vitest + supertest + React Testing Library、Docker Compose + Nginx。

## Global Constraints

以下约束对每个任务都生效，取值为 spec 原文：

- Electron 30+，electron-vite，React 19 + TypeScript 5.4
- Node 20 LTS，Express 4，Socket.io 4，Prisma 5.x，MySQL 8.0（utf8mb4、时区 +08:00）
- 渲染进程：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，系统能力全部经 preload 白名单暴露
- 渲染进程 CSP 仅允许自身资源与 `ws(s)://` 后端连接
- WebContentsView 仅加载 http/https，独立 session，不共享主窗口 cookie/权限
- REST 统一响应：`{ success, data }` / `{ success: false, error: { code, message } }`
- 认证：JWT Bearer；Socket 连接握手校验 JWT
- 主键 uuid；消息表 `(roomId, createdAt)` 复合索引；消息幂等去重用 `(senderId, clientMsgId)` 唯一约束
- 不用 Redis；在线状态用内存 Map + Socket 生命周期维护
- docker-compose：mysql 仅内网 + server 内网 3001，Nginx 对外 80/443；安全组只开 80/443
- AI 机器人以普通 User 身份加入房间，消息 `type: 'ai'`，回复流式逐段推送
- 测试：服务端 Vitest + supertest；客户端 Vitest + React Testing Library + jsdom
- 每次任务结束必须 `git commit`，提交信息格式见各任务

---

## 文件结构总览（任务中逐步创建）

```
group-chat/
├── package.json                       # npm workspaces 根
├── .gitignore                         # 已存在
├── client/
│   ├── package.json
│   ├── electron.vite.config.ts
│   ├── src/
│   │   ├── main/index.ts              # 窗口、托盘、通知、链接预览
│   │   ├── preload/index.ts           # contextBridge 白名单 API
│   │   ├── preload/index.d.ts         # window.chatAPI 类型
│   │   └── renderer/
│   │       ├── index.html             # 含 CSP meta
│   │       └── src/
│   │           ├── main.tsx           # antd ConfigProvider 挂载
│   │           ├── App.tsx            # 登录态门禁
│   │           ├── api/request.ts     # axios 封装
│   │           ├── api/auth.ts / rooms.ts / messages.ts
│   │           ├── stores/session.ts / chat.ts
│   │           ├── services/socket.ts
│   │           ├── utils/url.ts
│   │           ├── pages/Login.tsx / Chat.tsx
│   │           └── components/ (RoomList / MessageList / MessageItem / MembersPanel / LinkCard)
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── prisma/schema.prisma
│   ├── .env.example
│   └── src/
│       ├── index.ts                   # 启动 HTTP + Socket
│       ├── app.ts                     # 中间件链 + 路由挂载
│       ├── config/env.ts
│       ├── utils/response.ts / logger.ts / prisma.ts / jwt.ts
│       ├── middleware/auth.ts / error.ts / validate.ts
│       ├── routes/auth.ts / rooms.ts / messages.ts
│       ├── controllers/*.ts
│       ├── services/auth.ts / room.ts / message.ts / unread.ts / presence.ts / ai.ts
│       ├── repositories/user.ts / room.ts / message.ts
│       └── sockets/index.ts / handlers.ts
├── docker-compose.yml
├── nginx.conf
├── deploy.sh
└── docs/
```

---

## Phase A：脚手架与地基（Week 1）

### Task 1: Monorepo 与双工程脚手架

**Files:**
- Create: `package.json`（根）
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/src/index.ts`
- Create: `client/`（脚手架命令生成）

**Interfaces:**
- Consumes: 无
- Produces: 根 `npm run dev:server` 与 `npm run dev:client` 两条可启动命令；server 暴露 `GET /health`

- [ ] **Step 1: 创建根 package.json（npm workspaces）**

```json
{
  "name": "group-chat",
  "private": true,
  "workspaces": ["client", "server"],
  "scripts": {
    "dev:server": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "build:server": "npm run build -w server",
    "build:client": "npm run build -w client",
    "test": "npm run test -w server && npm run test -w client"
  }
}
```

- [ ] **Step 2: 创建 server/package.json 与 tsconfig.json**

```json
{
  "name": "group-chat-server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-validator": "^7.1.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "pino": "^9.5.0",
    "socket.io": "^4.8.1"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.4.5",
    "vitest": "^2.1.0"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["tests", "**/*.test.ts"]
}
```

- [ ] **Step 3: 创建 server/.env.example 与最小启动文件**

```bash
PORT=3001
DATABASE_URL=mysql://root:YOUR_PASSWORD@localhost:3306/group_chat
TEST_DATABASE_URL=mysql://root:YOUR_PASSWORD@localhost:3306/group_chat_test
JWT_SECRET=change-me-to-a-long-random-string
AI_BASE_URL=https://api.deepseek.com/v1
AI_API_KEY=sk-xxx
AI_MODEL=deepseek-chat
```

```ts
import 'dotenv/config'
import express from 'express'

const app = express()
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } })
})

const port = Number(process.env.PORT || 3001)
app.listen(port, () => console.log(`[group-chat] server listening on ${port}`))
```

复制 `.env.example` 为 `server/.env` 并填入本机 MySQL 密码。

- [ ] **Step 4: 脚手架生成 client（electron-vite React + TS）**

```bash
npm create @quick-start/electron@latest client -- --template react-ts
```

生成后确认 `client/package.json` 的 name 为 `group-chat-client`，并执行 `npm install`（根目录统一安装）。

- [ ] **Step 5: 验证双工程启动**

```bash
npm run dev:server
curl http://localhost:3001/health
# 期望输出: {"success":true,"data":{"status":"ok"}}
```

另开终端：`npm run dev:client`，期望 Electron 窗口打开并渲染 React 脚手架首页。

- [ ] **Step 6: Commit**

```bash
git add package.json server client && git commit -m "chore: monorepo 脚手架（client + server 可启动）"
```

---

### Task 2: Server 骨架（统一响应 / 错误处理 / 日志 / 测试）

**Files:**
- Create: `server/src/app.ts`
- Create: `server/src/utils/response.ts`
- Create: `server/src/utils/logger.ts`
- Create: `server/src/middleware/error.ts`
- Create: `server/tests/health.test.ts`
- Create: `server/vitest.config.ts`
- Modify: `server/src/index.ts`
- Modify: `server/package.json`（追加 `vitest.config.ts` 所需配置无需改动，仅确认脚本）

**Interfaces:**
- Consumes: 无
- Produces:
  - `createApp(): express.Express` —— 测试与 `index.ts` 共用
  - `ok<T>(res, data: T): void`、`fail(res, status, code, message): void`
  - `logger: pino.Logger`

- [ ] **Step 1: 写失败测试**

`server/tests/health.test.ts`：

```ts
import request from 'supertest'
import { describe, it, expect } from 'vitest'
import { createApp } from '../src/app'

const app = createApp()

describe('health & error shape', () => {
  it('GET /health 返回统一成功结构', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } })
  })

  it('未知路由返回统一 404 结构', async () => {
    const res = await request(app).get('/no-such-path')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'resource not found' },
    })
  })
})
```

`server/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npm run test -w server
# 期望: FAIL，找不到 ../src/app 模块
```

- [ ] **Step 3: 最小实现**

`server/src/utils/response.ts`：

```ts
import type { Response } from 'express'

export function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data })
}

export function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } })
}
```

`server/src/utils/logger.ts`：

```ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
})
```

`server/src/middleware/error.ts`：

```ts
import type { NextFunction, Request, Response } from 'express'
import { fail } from '../utils/response'
import { logger } from '../utils/logger'

export function notFound(_req: Request, res: Response): void {
  fail(res, 404, 'NOT_FOUND', 'resource not found')
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error(err)
  fail(res, 500, 'INTERNAL_ERROR', 'internal server error')
}
```

`server/src/app.ts`：

```ts
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { errorHandler, notFound } from './middleware/error'
import { ok } from './utils/response'

export function createApp(): express.Express {
  const app = express()
  app.use(helmet())
  app.use(cors())
  app.use(express.json())
  app.get('/health', (_req, res) => ok(res, { status: 'ok' }))
  app.use(notFound)
  app.use(errorHandler)
  return app
}
```

`server/src/index.ts`（整体替换 Task 1 的最小版）：

```ts
import 'dotenv/config'
import { createApp } from './app'
import { logger } from './utils/logger'

const port = Number(process.env.PORT || 3001)
createApp().listen(port, () => logger.info(`[group-chat] server listening on ${port}`))
```

`server/package.json` 的 devDependencies 追加 `"pino-pretty": "^11.0.0"` 后重新 `npm install`。

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -w server
# 期望: 2 passed
```

- [ ] **Step 5: Commit**

```bash
git add server && git commit -m "feat(server): 应用骨架 + 统一响应/错误处理 + 健康检查测试"
```

---

### Task 3: Prisma + MySQL 接入

**Files:**
- Create: `server/prisma/schema.prisma`
- Create: `server/src/utils/prisma.ts`
- Modify: `server/package.json`（追加 prisma 依赖与脚本）
- Modify: `server/.env.example`（已在 Task 1 含 DATABASE_URL，无需改动）

**Interfaces:**
- Consumes: 本机 MySQL 8.0（`brew services start mysql@8.0`），库 `group_chat` 与 `group_chat_test`
- Produces: `prisma: PrismaClient` 单例；schema 中 User / Room / RoomMember / Message 四个模型

- [ ] **Step 1: 追加依赖与脚本**

```bash
npm install -w server @prisma/client
npm install -w server -D prisma
```

`server/package.json` scripts 追加：

```json
"prisma:generate": "prisma generate",
"prisma:migrate": "prisma migrate dev",
"prisma:deploy": "prisma migrate deploy"
```

- [ ] **Step 2: 写 schema**

`server/prisma/schema.prisma`：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id           String       @id @default(uuid())
  username     String       @unique
  passwordHash String
  nickname     String
  avatarUrl    String?
  status       String       @default("offline")
  createdAt    DateTime     @default(now())
  ownedRooms   Room[]       @relation("RoomOwner")
  memberships  RoomMember[]
  messages     Message[]
}

model Room {
  id            String       @id @default(uuid())
  name          String
  ownerId       String
  lastMessageAt DateTime?
  createdAt     DateTime     @default(now())
  owner         User         @relation("RoomOwner", fields: [ownerId], references: [id])
  members       RoomMember[]
  messages      Message[]
}

model RoomMember {
  id                String   @id @default(uuid())
  roomId            String
  userId            String
  lastReadMessageId String?
  joinedAt          DateTime @default(now())
  room              Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([roomId, userId])
  @@index([userId])
}

model Message {
  id           String   @id @default(uuid())
  roomId       String
  senderId     String
  clientMsgId  String?
  type         String   @default("text")
  content      String
  createdAt    DateTime @default(now())
  room         Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  sender       User     @relation(fields: [senderId], references: [id])

  @@unique([senderId, clientMsgId])
  @@index([roomId, createdAt])
}
```

- [ ] **Step 3: 建库并执行首次迁移**

```bash
mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS group_chat DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE DATABASE IF NOT EXISTS group_chat_test DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm run prisma:migrate -w server -- --name init
# 期望: 迁移成功，prisma client 生成
```

- [ ] **Step 4: Prisma 单例**

`server/src/utils/prisma.ts`：

```ts
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
```

- [ ] **Step 5: 连接验证测试**

`server/tests/db.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '../src/utils/prisma'

describe('database', () => {
  it('SELECT 1 通过', async () => {
    const rows = await prisma.$queryRaw`SELECT 1 AS one`
    expect(rows).toEqual([{ one: 1 }])
  })
})
```

运行 `npm run test -w server`，期望 1 passed（其余 2 个仍通过）。

- [ ] **Step 6: Commit**

```bash
git add server && git commit -m "feat(server): Prisma + MySQL schema 与迁移（users/rooms/messages）"
```

---

### Task 4: 注册 / 登录 API

**Files:**
- Create: `server/src/config/env.ts`
- Create: `server/src/utils/jwt.ts`
- Create: `server/src/repositories/user.repo.ts`
- Create: `server/src/services/auth.service.ts`
- Create: `server/src/controllers/auth.controller.ts`
- Create: `server/src/routes/auth.ts`
- Create: `server/tests/auth.test.ts`
- Modify: `server/src/app.ts`（挂载 `/api/v1/auth`）

**Interfaces:**
- Consumes: `prisma`、`logger`、`ok/fail`、`DATABASE_URL`（Task 1/2/3）
- Produces:
  - `authService.register({ username, password, nickname }): Promise<{ user: SafeUser; token: string }>`
  - `authService.login({ username, password }): Promise<{ user: SafeUser; token: string }>`
  - `SafeUser = { id: string; username: string; nickname: string }`
  - `signToken(uid: string): string`、`verifyToken(token: string): { uid: string }`

- [ ] **Step 1: 写失败测试**

`server/tests/auth.test.ts`：

```ts
import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/utils/prisma'

const app = createApp()

describe('auth', () => {
  beforeAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: 't_' } } })
  })

  it('注册成功返回用户与 token，不暴露密码', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      username: 't_alice',
      password: 'pass1234',
      nickname: 'Alice',
    })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user).not.toHaveProperty('passwordHash')
    expect(typeof res.body.data.token).toBe('string')
  })

  it('重复用户名返回 409', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      username: 't_alice',
      password: 'pass1234',
      nickname: 'Alice2',
    })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('USERNAME_TAKEN')
  })

  it('登录成功返回 token', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 't_alice',
      password: 'pass1234',
    })
    expect(res.status).toBe(200)
    expect(typeof res.body.data.token).toBe('string')
  })

  it('密码错误返回 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 't_alice',
      password: 'wrong-pass',
    })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('BAD_CREDENTIALS')
  })

  it('参数缺失返回 400', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ username: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
```

注意：测试与本地开发默认共用 `DATABASE_URL`，请确保 `.env` 指向 `group_chat_test` 或先手动清空相关表；后续 Task 3 之后将引入 `TEST_DATABASE_URL` 隔离（见 Task 5 Step 4 的 setup 说明）。

- [ ] **Step 2: 运行确认失败**

```bash
npm run test -w server
# 期望: auth.test.ts FAIL（模块不存在）
```

- [ ] **Step 3: 实现**

`server/src/config/env.ts`：

```ts
export const env = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use',
}
```

`server/src/utils/jwt.ts`：

```ts
import jwt from 'jsonwebtoken'
import { env } from '../config/env'

export interface TokenPayload {
  uid: string
}

export function signToken(uid: string): string {
  return jwt.sign({ uid }, env.jwtSecret, { expiresIn: '7d' })
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload
}
```

`server/src/repositories/user.repo.ts`：

```ts
import { prisma } from '../utils/prisma'

export const userRepo = {
  findByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } })
  },
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } })
  },
  create(data: { username: string; passwordHash: string; nickname: string }) {
    return prisma.user.create({ data })
  },
}
```

`server/src/services/auth.service.ts`：

```ts
import bcrypt from 'bcryptjs'
import { userRepo } from '../repositories/user.repo'
import { signToken } from '../utils/jwt'

export interface SafeUser {
  id: string
  username: string
  nickname: string
}

function toSafeUser(user: { id: string; username: string; nickname: string }): SafeUser {
  return { id: user.id, username: user.username, nickname: user.nickname }
}

export const authService = {
  async register(input: { username: string; password: string; nickname: string }) {
    const existing = await userRepo.findByUsername(input.username)
    if (existing) {
      const err = new Error('USERNAME_TAKEN') as Error & { code: string }
      err.code = 'USERNAME_TAKEN'
      throw err
    }
    const passwordHash = await bcrypt.hash(input.password, 10)
    const user = await userRepo.create({
      username: input.username,
      passwordHash,
      nickname: input.nickname,
    })
    return { user: toSafeUser(user), token: signToken(user.id) }
  },

  async login(input: { username: string; password: string }) {
    const user = await userRepo.findByUsername(input.username)
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      const err = new Error('BAD_CREDENTIALS') as Error & { code: string }
      err.code = 'BAD_CREDENTIALS'
      throw err
    }
    return { user: toSafeUser(user), token: signToken(user.id) }
  },
}
```

`server/src/controllers/auth.controller.ts`：

```ts
import { body, validationResult } from 'express-validator'
import type { Request, Response } from 'express'
import { authService } from '../services/auth.service'
import { fail, ok } from '../utils/response'

export const registerRules = [
  body('username').trim().isLength({ min: 3, max: 24 }),
  body('password').isLength({ min: 8, max: 72 }),
  body('nickname').trim().isLength({ min: 1, max: 32 }),
]

export const loginRules = [
  body('username').trim().notEmpty(),
  body('password').notEmpty(),
]

function validate(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg)
    return false
  }
  return true
}

export async function register(req: Request, res: Response): Promise<void> {
  if (!validate(req, res)) return
  try {
    const result = await authService.register({
      username: req.body.username,
      password: req.body.password,
      nickname: req.body.nickname,
    })
    res.status(201)
    ok(res, result)
  } catch (e) {
    if ((e as Error & { code?: string }).code === 'USERNAME_TAKEN') {
      fail(res, 409, 'USERNAME_TAKEN', 'username already taken')
      return
    }
    throw e
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  if (!validate(req, res)) return
  try {
    const result = await authService.login({
      username: req.body.username,
      password: req.body.password,
    })
    ok(res, result)
  } catch (e) {
    if ((e as Error & { code?: string }).code === 'BAD_CREDENTIALS') {
      fail(res, 401, 'BAD_CREDENTIALS', 'username or password incorrect')
      return
    }
    throw e
  }
}
```

`server/src/routes/auth.ts`：

```ts
import { Router } from 'express'
import { login, loginRules, register, registerRules } from '../controllers/auth.controller'

export const authRouter = Router()

authRouter.post('/register', registerRules, register)
authRouter.post('/login', loginRules, login)
```

`server/src/app.ts` 修改为挂载 auth 路由：

```ts
import { authRouter } from './routes/auth'
// ...
app.use('/api/v1/auth', authRouter)
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -w server
# 期望: auth 5 个用例 + 既有用例全部 passed
```

- [ ] **Step 5: Commit**

```bash
git add server && git commit -m "feat(server): 注册/登录 API（bcrypt + JWT + 校验）"
```

---

### Task 5: JWT 认证中间件 + 测试环境隔离

**Files:**
- Create: `server/src/middleware/auth.ts`
- Create: `server/tests/setup-env.ts`
- Create: `server/tests/auth.middleware.test.ts`
- Modify: `server/vitest.config.ts`（追加 setupFiles / globalSetup）
- Modify: `server/package.json`（devDependencies 追加 `dotenv` 已存在，无需）

**Interfaces:**
- Consumes: `verifyToken`（Task 4）
- Produces: `requireAuth(req, res, next)`，成功挂载 `req.user = { uid }`，失败返回 401

- [ ] **Step 1: 测试环境隔离 setup**

`server/tests/setup-env.ts`：

```ts
import 'dotenv/config'

const testUrl = process.env.TEST_DATABASE_URL
if (testUrl) {
  process.env.DATABASE_URL = testUrl
}
```

`server/tests/global-setup.ts`：

```ts
import 'dotenv/config'
import { execSync } from 'child_process'

export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error('TEST_DATABASE_URL 未配置，请检查 server/.env')
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  })
}
```

`server/vitest.config.ts` 更新：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    globalSetup: 'tests/global-setup.ts',
    fileParallelism: false,
  },
})
```

- [ ] **Step 2: 写失败测试**

`server/tests/auth.middleware.test.ts`：

```ts
import express from 'express'
import request from 'supertest'
import { describe, it, expect } from 'vitest'
import { requireAuth } from '../src/middleware/auth'
import { signToken } from '../src/utils/jwt'

function buildApp() {
  const app = express()
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ success: true, data: { uid: (req as any).user.uid } })
  })
  return app
}

describe('requireAuth', () => {
  it('无 token 返回 401', async () => {
    const res = await request(buildApp()).get('/protected')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('非法 token 返回 401', async () => {
    const res = await request(buildApp()).get('/protected').set('Authorization', 'Bearer bad.token')
    expect(res.status).toBe(401)
  })

  it('合法 token 放行并挂载 uid', async () => {
    const token = signToken('u-test-1')
    const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.uid).toBe('u-test-1')
  })
})
```

- [ ] **Step 3: 实现**

`server/src/middleware/auth.ts`：

```ts
import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../utils/jwt'
import { fail } from '../utils/response'

export interface AuthedRequest extends Request {
  user?: { uid: string }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    fail(res, 401, 'UNAUTHORIZED', 'missing bearer token')
    return
  }
  try {
    req.user = { uid: verifyToken(header.slice(7)).uid }
    next()
  } catch {
    fail(res, 401, 'UNAUTHORIZED', 'invalid or expired token')
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -w server
# 期望: 全部 passed，且测试使用 group_chat_test 库
```

- [ ] **Step 5: Commit**

```bash
git add server && git commit -m "feat(server): JWT 认证中间件 + 测试库隔离"
```

---

### Task 6: Client 外壳（安全窗口 + 登录页 + 会话）

**Files:**
- Modify: `client/src/main/index.ts`
- Modify: `client/src/preload/index.ts`
- Modify: `client/src/preload/index.d.ts`
- Modify: `client/src/renderer/index.html`
- Create: `client/src/renderer/src/api/request.ts`
- Create: `client/src/renderer/src/api/auth.ts`
- Create: `client/src/renderer/src/stores/session.ts`
- Create: `client/src/renderer/src/pages/Login.tsx`
- Modify: `client/src/renderer/src/App.tsx`
- Modify: `client/src/renderer/src/main.tsx`
- Modify: `client/electron.vite.config.ts`
- Create: `client/src/renderer/src/__tests__/Login.test.tsx`

**Interfaces:**
- Consumes: 后端 `/api/v1/auth/*`（Task 4）
- Produces: `window.chatAPI`（notify/setBadge/openLink/window 控制）、`useSessionStore`（token/user/login/logout）、`request`（axios 实例）

- [ ] **Step 1: 写失败测试（Login 组件）**

`client/src/renderer/src/__tests__/Login.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Login } from '../pages/Login'
import { useSessionStore } from '../stores/session'

vi.mock('../api/auth', () => ({
  loginApi: vi.fn(async () => ({
    user: { id: 'u1', username: 'alice', nickname: 'Alice' },
    token: 'jwt-token',
  })),
}))

describe('Login', () => {
  beforeEach(() => {
    useSessionStore.setState({ token: null, user: null })
  })

  it('提交后写入会话', async () => {
    render(<Login onSuccess={() => {}} />)
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pass1234' } })
    fireEvent.click(screen.getByRole('button', { name: '登 录' }))
    await waitFor(() => {
      expect(useSessionStore.getState().token).toBe('jwt-token')
    })
  })
})
```

运行确认失败：`npm run test -w client`（需先建 vitest 配置与脚本，见 Step 3 前置）。

- [ ] **Step 2: 主进程安全窗口**

`client/src/main/index.ts`（整体替换脚手架默认实现）：

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`client/src/preload/index.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  notify: (title: string, body: string) => ipcRenderer.invoke('notify', { title, body }),
  setBadge: (count: number) => ipcRenderer.invoke('set-badge', count),
  openLink: (url: string) => ipcRenderer.invoke('open-link-preview', url),
  closeLinkPreview: () => ipcRenderer.invoke('close-link-preview'),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    closeToTray: () => ipcRenderer.send('window:close-to-tray'),
  },
}

contextBridge.exposeInMainWorld('chatAPI', api)

export type ChatAPI = typeof api
```

`client/src/preload/index.d.ts`（渲染进程全局类型）：

```ts
import type { ChatAPI } from './index'

declare global {
  interface Window {
    chatAPI: ChatAPI
  }
}

export {}
```

`client/src/renderer/index.html` 的 `<head>` 追加 CSP：

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:3001 http://localhost:3001"
/>
```

- [ ] **Step 3: 渲染进程基础设施**

`client/src/renderer/src/api/request.ts`：

```ts
import axios from 'axios'

export const request = axios.create({ baseURL: '/api/v1', timeout: 10000 })

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('gc_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

request.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gc_token')
      window.location.hash = '#/login'
    }
    return Promise.reject(err.response?.data?.error || err)
  },
)
```

`client/src/renderer/src/api/auth.ts`：

```ts
import { request } from './request'

export interface SafeUser {
  id: string
  username: string
  nickname: string
}

export async function loginApi(input: { username: string; password: string }) {
  const res = (await request.post('/auth/login', input)) as {
    success: true
    data: { user: SafeUser; token: string }
  }
  return res.data
}
```

`client/src/renderer/src/stores/session.ts`：

```ts
import { create } from 'zustand'
import type { SafeUser } from '../api/auth'

interface SessionState {
  token: string | null
  user: SafeUser | null
  setSession: (token: string, user: SafeUser) => void
  logout: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  token: localStorage.getItem('gc_token'),
  user: null,
  setSession: (token, user) => {
    localStorage.setItem('gc_token', token)
    set({ token, user })
  },
  logout: () => {
    localStorage.removeItem('gc_token')
    set({ token: null, user: null })
  },
}))
```

`client/src/renderer/src/pages/Login.tsx`：

```tsx
import { useState } from 'react'
import { Button, Form, Input, Typography, App as AntApp } from 'antd'
import { loginApi } from '../api/auth'
import { useSessionStore } from '../stores/session'

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const setSession = useSessionStore((s) => s.setSession)
  const { message } = AntApp.useApp()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const { user, token } = await loginApi(values)
      setSession(token, user)
      onSuccess()
    } catch {
      message.error('账号或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto' }}>
      <Typography.Title level={3} style={{ textAlign: 'center' }}>
        GroupChat
      </Typography.Title>
      <Form layout="vertical" onFinish={onFinish}>
        <Form.Item label="账号" name="username" rules={[{ required: true, message: '请输入账号' }]}>
          <Input autoComplete="username" />
        </Form.Item>
        <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          登 录
        </Button>
      </Form>
    </div>
  )
}
```

`client/src/renderer/src/App.tsx`：

```tsx
import { useState } from 'react'
import { Login } from './pages/Login'

export default function App() {
  const token = useSessionToken()
  const [ready, setReady] = useState(!!token)

  if (!ready) return <Login onSuccess={() => setReady(true)} />
  return <div>Chat 页面（Phase B 实现）</div>
}

function useSessionToken(): string | null {
  return useSessionStore((s) => s.token)
}
```

`client/src/renderer/src/main.tsx`：

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
)
```

`client/electron.vite.config.ts` 的 renderer 段追加开发代理：

```ts
renderer: {
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
},
```

`client/package.json` 追加测试脚本与依赖：

```json
"test": "vitest run"
```

```bash
npm install -w client -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

`client/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
})
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -w client
# 期望: Login.test.tsx 1 passed
```

- [ ] **Step 5: 手动验证登录闭环**

```bash
npm run dev:server & npm run dev:client
```

1. 打开 http://localhost:3001/api/v1/auth/register（POST）注册一个测试账号（可用 curl）
2. 在登录页输入账号密码，期望进入 Chat 占位页
3. 打开 DevTools 确认 `window.chatAPI` 存在且 `window.require` 为 undefined

- [ ] **Step 6: Commit**

```bash
git add client && git commit -m "feat(client): 安全窗口/preload + 登录页与会话状态"
```

---

## Phase B：实时聊天核心（Week 1-2）

### Task 7: Socket.io 服务端（握手鉴权 + 在线状态）

**Files:**
- Create: `server/src/services/presence.service.ts`
- Create: `server/src/sockets/index.ts`
- Create: `server/src/sockets/handlers.ts`
- Create: `server/tests/socket.test.ts`
- Modify: `server/src/index.ts`（启动时 initSocket）
- Modify: `server/package.json`（devDependencies 追加 `socket.io-client`）

**Interfaces:**
- Consumes: `verifyToken`（Task 4）
- Produces:
  - `initSocket(server: HttpServer): Server`
  - Socket 事件：`room:join`（收）、`room:joined`（发）、`presence:changed { uid, online }`（发）
  - `presenceService.online(uid, socketId)` / `offline(uid, socketId)` / `isOnline(uid)`

- [ ] **Step 1: 写失败测试**

`server/tests/socket.test.ts`：

```ts
import { createServer, type Server as HttpServer } from 'http'
import { io as ioc, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { initSocket } from '../src/sockets'
import { signToken } from '../src/utils/jwt'

describe('socket auth & presence', () => {
  let http: HttpServer
  let url: string

  beforeAll(async () => {
    http = createServer(createApp())
    initSocket(http)
    await new Promise<void>((resolve) => http.listen(0, resolve))
    const addr = http.address() as { port: number }
    url = `http://127.0.0.1:${addr.port}`
  })

  afterAll(() => http.close())

  it('非法 token 拒绝连接', async () => {
    const sock: Socket = ioc(url, { auth: { token: 'bad-token' }, transports: ['websocket'] })
    const err = await new Promise<string | null>((resolve) => {
      sock.on('connect_error', (e) => resolve(e.message))
      sock.on('connect', () => resolve(null))
    })
    sock.close()
    expect(err).toBe('UNAUTHORIZED')
  })

  it('合法 token 上线广播 presence:changed', async () => {
    const uid = 'presence-test-1'
    const token = signToken(uid)
    const sock: Socket = ioc(url, { auth: { token }, transports: ['websocket'] })
    const event = await new Promise<{ uid: string; online: boolean }>((resolve) => {
      sock.on('presence:changed', resolve)
    })
    expect(event).toEqual({ uid, online: true })
    sock.close()
  })
})
```

运行确认失败：`npm run test -w server`（`../src/sockets` 不存在）。

- [ ] **Step 2: 实现在线状态服务**

`server/src/services/presence.service.ts`：

```ts
export const presenceService = {
  socketsByUser: new Map<string, Set<string>>(),

  online(uid: string, socketId: string): void {
    const set = this.socketsByUser.get(uid) ?? new Set<string>()
    set.add(socketId)
    this.socketsByUser.set(uid, set)
  },

  offline(uid: string, socketId: string): void {
    const set = this.socketsByUser.get(uid)
    if (!set) return
    set.delete(socketId)
    if (set.size === 0) this.socketsByUser.delete(uid)
  },

  isOnline(uid: string): boolean {
    return (this.socketsByUser.get(uid)?.size ?? 0) > 0
  },
}
```

- [ ] **Step 3: 实现 Socket 初始化与处理器**

`server/src/sockets/index.ts`：

```ts
import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { verifyToken } from '../utils/jwt'
import { registerHandlers } from './handlers'

export function initSocket(server: HttpServer): Server {
  const io = new Server(server, { cors: { origin: true, credentials: true } })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('UNAUTHORIZED'))
    try {
      socket.data.uid = verifyToken(token).uid
      next()
    } catch {
      next(new Error('UNAUTHORIZED'))
    }
  })

  io.on('connection', (socket) => registerHandlers(io, socket))
  return io
}
```

`server/src/sockets/handlers.ts`：

```ts
import type { Server, Socket } from 'socket.io'
import { presenceService } from '../services/presence.service'

export function registerHandlers(io: Server, socket: Socket): void {
  const uid = socket.data.uid as string
  presenceService.online(uid, socket.id)
  socket.join(`user:${uid}`)
  io.emit('presence:changed', { uid, online: true })

  socket.on('room:join', (roomIds: string[]) => {
    const ids = Array.isArray(roomIds) ? roomIds : []
    ids.forEach((rid) => socket.join(`room:${rid}`))
    socket.emit('room:joined', { roomIds: ids })
  })

  socket.on('disconnect', () => {
    presenceService.offline(uid, socket.id)
    io.emit('presence:changed', { uid, online: presenceService.isOnline(uid) })
  })
}
```

`server/src/index.ts` 更新为启动 Socket：

```ts
import 'dotenv/config'
import http from 'http'
import { createApp } from './app'
import { initSocket } from './sockets'
import { logger } from './utils/logger'

const port = Number(process.env.PORT || 3001)
const server = http.createServer(createApp())
initSocket(server)
server.listen(port, () => logger.info(`[group-chat] server listening on ${port}`))
```

安装测试依赖：`npm install -w server -D socket.io-client`

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -w server
# 期望: socket 2 个用例 passed
```

- [ ] **Step 5: Commit**

```bash
git add server && git commit -m "feat(server): Socket.io 握手鉴权 + 在线状态广播"
```

---

### Task 8: 房间 REST API

**Files:**
- Create: `server/src/repositories/room.repo.ts`
- Create: `server/src/repositories/message.repo.ts`
- Create: `server/src/services/room.service.ts`
- Create: `server/src/controllers/room.controller.ts`
- Create: `server/src/routes/rooms.ts`
- Create: `server/tests/rooms.test.ts`
- Modify: `server/src/app.ts`（挂载 `/api/v1/rooms` + 用 `requireAuth` 保护）

**Interfaces:**
- Consumes: `prisma`、`requireAuth`、`ok/fail`（Task 2/5）
- Produces:
  - `roomService.create(uid, name): Promise<RoomView>`
  - `roomService.listForUser(uid): Promise<RoomView[]>`
  - `roomService.join(uid, roomId): Promise<RoomView>`
  - `roomService.members(roomId): Promise<MemberView[]>`
  - `RoomView = { id, name, ownerId, lastMessageAt, unread, memberCount, lastMessage? }`

- [ ] **Step 1: 写失败测试**

`server/tests/rooms.test.ts`：

```ts
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/utils/prisma'
import { signToken } from '../src/utils/jwt'

const app = createApp()

describe('rooms', () => {
  let userA: { id: string; token: string }
  let userB: { id: string; token: string }

  beforeAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
    await prisma.user.deleteMany()
    const a = await prisma.user.create({
      data: { username: 't_ra', passwordHash: 'x', nickname: 'RA' },
    })
    const b = await prisma.user.create({
      data: { username: 't_rb', passwordHash: 'x', nickname: 'RB' },
    })
    userA = { id: a.id, token: signToken(a.id) }
    userB = { id: b.id, token: signToken(b.id) }
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: 't_' } } })
  })

  it('创建房间自动成为成员', async () => {
    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ name: '前端交流群' })
    expect(res.status).toBe(201)
    expect(res.body.data.memberCount).toBe(1)
  })

  it('列表返回本人房间', async () => {
    const res = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${userA.token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBe(1)
  })

  it('加入房间后双方都在成员列表', async () => {
    const list = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${userA.token}`)
    const roomId = list.body.data[0].id

    const joined = await request(app)
      .post(`/api/v1/rooms/${roomId}/join`)
      .set('Authorization', `Bearer ${userB.token}`)
    expect(joined.status).toBe(200)

    const members = await request(app)
      .get(`/api/v1/rooms/${roomId}/members`)
      .set('Authorization', `Bearer ${userA.token}`)
    expect(members.body.data.length).toBe(2)
  })

  it('重复加入返回 409', async () => {
    const list = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${userA.token}`)
    const roomId = list.body.data[0].id
    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/join`)
      .set('Authorization', `Bearer ${userB.token}`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ALREADY_MEMBER')
  })

  it('未认证请求返回 401', async () => {
    const res = await request(app).get('/api/v1/rooms')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: 实现仓库与服务**

`server/src/repositories/room.repo.ts`：

```ts
import { prisma } from '../utils/prisma'

export const roomRepo = {
  create(ownerId: string, name: string) {
    return prisma.$transaction(async (tx) => {
      const room = await tx.room.create({ data: { name, ownerId } })
      await tx.roomMember.create({ data: { roomId: room.id, userId: ownerId } })
      return room
    })
  },
  findById(id: string) {
    return prisma.room.findUnique({ where: { id } })
  },
  findMembership(roomId: string, userId: string) {
    return prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    })
  },
  addMember(roomId: string, userId: string) {
    return prisma.roomMember.create({ data: { roomId, userId } })
  },
  members(roomId: string) {
    return prisma.roomMember.findMany({
      where: { roomId },
      include: {
        user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
      },
    })
  },
}
```

`server/src/repositories/message.repo.ts`：

```ts
import { prisma } from '../utils/prisma'

export const messageRepo = {
  create(input: {
    roomId: string
    senderId: string
    type: string
    content: string
    clientMsgId?: string
  }) {
    return prisma.message.create({ data: input })
  },
  findByClientId(senderId: string, clientMsgId: string) {
    return prisma.message.findUnique({
      where: { senderId_clientMsgId: { senderId, clientMsgId } },
    })
  },
  countAfter(roomId: string, after: Date | null) {
    return prisma.message.count({
      where: {
        roomId,
        ...(after ? { createdAt: { gt: after } } : {}),
      },
    })
  },
  latest(roomId: string) {
    return prisma.message.findFirst({ where: { roomId }, orderBy: { createdAt: 'desc' } })
  },
}
```

`server/src/services/room.service.ts`：

```ts
import { roomRepo } from '../repositories/room.repo'
import { messageRepo } from '../repositories/message.repo'

export interface RoomView {
  id: string
  name: string
  ownerId: string
  lastMessageAt: string | null
  memberCount: number
  unread: number
}

async function toRoomView(
  room: { id: string; name: string; ownerId: string; lastMessageAt: Date | null },
  lastReadAt: Date | null,
  memberCount: number,
): Promise<RoomView> {
  const unread = await messageRepo.countAfter(room.id, lastReadAt)
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    lastMessageAt: room.lastMessageAt?.toISOString() ?? null,
    memberCount,
    unread,
  }
}

import { prisma } from '../utils/prisma'

async function lastReadAt(roomId: string, userId: string): Promise<Date | null> {
  const membership = await roomRepo.findMembership(roomId, userId)
  if (!membership?.lastReadMessageId) return null
  const read = await prisma.message.findUnique({ where: { id: membership.lastReadMessageId } })
  return read?.createdAt ?? null
}

export const roomService = {
  async create(uid: string, name: string): Promise<RoomView> {
    const room = await roomRepo.create(uid, name)
    return toRoomView(room, null, 1)
  },

  async listForUser(uid: string): Promise<RoomView[]> {
    const memberships = await prisma.roomMember.findMany({
      where: { userId: uid },
      orderBy: { joinedAt: 'desc' },
    })
    return Promise.all(
      memberships.map(async (m) => {
        const room = await roomRepo.findById(m.roomId)
        if (!room) return null
        const readAt = await lastReadAt(room.id, uid)
        const memberCount = await roomRepo.members(room.id).then((ms) => ms.length)
        return toRoomView(room, readAt, memberCount)
      }),
    ).then((rooms) => rooms.filter((r): r is RoomView => r !== null))
  },

  async join(uid: string, roomId: string): Promise<RoomView> {
    if (await roomRepo.findMembership(roomId, uid)) {
      const err = new Error('ALREADY_MEMBER') as Error & { code: string }
      err.code = 'ALREADY_MEMBER'
      throw err
    }
    await roomRepo.addMember(roomId, uid)
    const room = await roomRepo.findById(roomId)
    if (!room) throw new Error('ROOM_NOT_FOUND')
    return toRoomView(room, null, (await roomRepo.members(roomId)).length)
  },

  async members(roomId: string) {
    const rows = await roomRepo.members(roomId)
    return rows.map((r) => ({
      id: r.user.id,
      nickname: r.user.nickname,
      username: r.user.username,
      avatarUrl: r.user.avatarUrl,
    }))
  },

  async isMember(roomId: string, uid: string): Promise<boolean> {
    return (await roomRepo.findMembership(roomId, uid)) !== null
  },
}
```

> 说明：`lastReadAt` 中按 `lastReadMessageId` 取消息时间计算未读；Task 12 会加入更直接的已读模型优化。

`server/src/controllers/room.controller.ts`：

```ts
import { body, param, validationResult } from 'express-validator'
import type { Request, Response } from 'express'
import { roomService } from '../services/room.service'
import { fail, ok } from '../utils/response'
import type { AuthedRequest } from '../middleware/auth'

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg)
    return false
  }
  return true
}

export const createRoomRules = [body('name').trim().isLength({ min: 1, max: 64 })]
export const roomIdRules = [param('roomId').isUUID()]

export async function listRooms(req: AuthedRequest, res: Response): Promise<void> {
  ok(res, await roomService.listForUser(req.user!.uid))
}

export async function createRoom(req: AuthedRequest, res: Response): Promise<void> {
  if (!validate(req, res)) return
  const room = await roomService.create(req.user!.uid, req.body.name)
  res.status(201)
  ok(res, room)
}

export async function joinRoom(req: AuthedRequest, res: Response): Promise<void> {
  if (!validate(req, res)) return
  try {
    ok(res, await roomService.join(req.user!.uid, req.params.roomId))
  } catch (e) {
    if ((e as Error & { code?: string }).code === 'ALREADY_MEMBER') {
      fail(res, 409, 'ALREADY_MEMBER', 'already a member')
      return
    }
    throw e
  }
}

export async function listMembers(req: AuthedRequest, res: Response): Promise<void> {
  const roomId = req.params.roomId
  if (!(await roomService.isMember(roomId, req.user!.uid))) {
    fail(res, 403, 'FORBIDDEN', 'not a member')
    return
  }
  ok(res, await roomService.members(roomId))
}
```

`server/src/routes/rooms.ts`：

```ts
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
  createRoom,
  createRoomRules,
  joinRoom,
  listMembers,
  listRooms,
  roomIdRules,
} from '../controllers/room.controller'

export const roomsRouter = Router()
roomsRouter.use(requireAuth)

roomsRouter.get('/', listRooms)
roomsRouter.post('/', createRoomRules, createRoom)
roomsRouter.post('/:roomId/join', roomIdRules, joinRoom)
roomsRouter.get('/:roomId/members', roomIdRules, listMembers)
```

`server/src/app.ts` 追加：

```ts
app.use('/api/v1/rooms', roomsRouter)
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npm run test -w server
# 期望: rooms 5 个用例 passed
```

- [ ] **Step 4: Commit**

```bash
git add server && git commit -m "feat(server): 房间创建/列表/加入/成员 API"
```

---

### Task 9: 消息发送与实时广播（Socket）

**Files:**
- Create: `server/src/services/message.service.ts`
- Modify: `server/src/sockets/handlers.ts`（message:send / typing）
- Create: `server/tests/message.socket.test.ts`

**Interfaces:**
- Consumes: `messageRepo`、`roomRepo`、`roomService.isMember`（Task 8）
- Produces:
  - `messageService.send(roomId, senderId, content, clientMsgId): Promise<MessageView>`
  - `MessageView = { id, roomId, senderId, senderNickname, type, content, createdAt, clientMsgId? }`
  - Socket 事件：`message:send`（收，带 ack）、`message:new`（发）、`typing`（转发）

- [ ] **Step 1: 写失败测试**

`server/tests/message.socket.test.ts`：

```ts
import { createServer, type Server as HttpServer } from 'http'
import { io as ioc, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { initSocket } from '../src/sockets'
import { prisma } from '../src/utils/prisma'
import { signToken } from '../src/utils/jwt'

describe('message send via socket', () => {
  let http: HttpServer
  let url: string
  let roomId: string
  let tokenA: string
  let tokenB: string

  beforeAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
    await prisma.user.deleteMany()

    const a = await prisma.user.create({ data: { username: 't_ma', passwordHash: 'x', nickname: 'MA' } })
    const b = await prisma.user.create({ data: { username: 't_mb', passwordHash: 'x', nickname: 'MB' } })
    const room = await prisma.room.create({ data: { name: '消息群', ownerId: a.id } })
    await prisma.roomMember.createMany({
      data: [
        { roomId: room.id, userId: a.id },
        { roomId: room.id, userId: b.id },
      ],
    })
    roomId = room.id
    tokenA = signToken(a.id)
    tokenB = signToken(b.id)

    http = createServer(createApp())
    initSocket(http)
    await new Promise<void>((resolve) => http.listen(0, resolve))
    const addr = http.address() as { port: number }
    url = `http://127.0.0.1:${addr.port}`
  })

  afterAll(() => http.close())

  it('A 发送，B 收到 message:new，ack 返回落库消息', async () => {
    const sockA: Socket = ioc(url, { auth: { token: tokenA }, transports: ['websocket'] })
    const sockB: Socket = ioc(url, { auth: { token: tokenB }, transports: ['websocket'] })

    await Promise.all([
      new Promise<void>((r) => sockA.on('connect', () => r())),
      new Promise<void>((r) => sockB.on('connect', () => r())),
    ])
    sockA.emit('room:join', [roomId])
    sockB.emit('room:join', [roomId])
    await new Promise((r) => setTimeout(r, 100))

    const received = new Promise<{ content: string; senderNickname: string }>((resolve) => {
      sockB.once('message:new', (msg: { content: string; senderNickname: string }) => resolve(msg))
    })
    const ack = new Promise<{ status: string }>((resolve) => {
      sockA.emit(
        'message:send',
        { roomId, content: 'hello', clientMsgId: 'cm-1' },
        (res: { status: string }) => resolve(res),
      )
    })

    const [ackRes, msg] = await Promise.all([ack, received])
    expect(ackRes.status).toBe('ok')
    expect(msg.content).toBe('hello')
    expect(msg.senderNickname).toBe('MA')
    sockA.close()
    sockB.close()
  })
})
```

- [ ] **Step 2: 实现消息服务**

`server/src/services/message.service.ts`：

```ts
import { messageRepo } from '../repositories/message.repo'
import { prisma } from '../utils/prisma'

export interface MessageView {
  id: string
  roomId: string
  senderId: string
  senderNickname: string
  type: string
  content: string
  createdAt: string
  clientMsgId?: string | null
}

function toView(msg: {
  id: string
  roomId: string
  senderId: string
  sender: { nickname: string }
  type: string
  content: string
  createdAt: Date
  clientMsgId: string | null
}): MessageView {
  return {
    id: msg.id,
    roomId: msg.roomId,
    senderId: msg.senderId,
    senderNickname: msg.sender.nickname,
    type: msg.type,
    content: msg.content,
    createdAt: msg.createdAt.toISOString(),
    clientMsgId: msg.clientMsgId,
  }
}

export const messageService = {
  async send(
    roomId: string,
    senderId: string,
    content: string,
    clientMsgId?: string,
  ): Promise<MessageView> {
    if (clientMsgId) {
      const dup = await messageRepo.findByClientId(senderId, clientMsgId)
      if (dup) {
        const full = await prisma.message.findUnique({
          where: { id: dup.id },
          include: { sender: { select: { nickname: true } } },
        })
        if (full) return toView(full)
      }
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          roomId,
          senderId,
          type: 'text',
          content,
          clientMsgId: clientMsgId || null,
        },
        include: { sender: { select: { nickname: true } } },
      })
      await tx.room.update({ where: { id: roomId }, data: { lastMessageAt: created.createdAt } })
      return created
    })
    return toView(message)
  },

  async history(
    roomId: string,
    cursor: string | null,
    limit: number,
  ): Promise<{ messages: MessageView[]; nextCursor: string | null }> {
    const rows = await prisma.message.findMany({
      where: {
        roomId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: { sender: { select: { nickname: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const messages = page.reverse().map(toView)
    const nextCursor = hasMore ? messages[0].createdAt : null
    return { messages, nextCursor }
  },
}
```

- [ ] **Step 3: 扩展 Socket 处理器**

`server/src/sockets/handlers.ts` 追加：

```ts
import { roomService } from '../services/room.service'
import { messageService } from '../services/message.service'

// 在 registerHandlers 内部，socket.on('room:join') 之后追加：
socket.on('message:send', async (payload, ack) => {
  const roomId = payload?.roomId as string
  const content = String(payload?.content ?? '').trim()
  const clientMsgId = payload?.clientMsgId as string | undefined
  if (!roomId || !content) {
    ack?.({ status: 'error', code: 'VALIDATION_ERROR' })
    return
  }
  if (!(await roomService.isMember(roomId, uid))) {
    ack?.({ status: 'error', code: 'FORBIDDEN' })
    return
  }
  try {
    const message = await messageService.send(roomId, uid, content, clientMsgId)
    io.to(`room:${roomId}`).emit('message:new', message)
    ack?.({ status: 'ok', message })
  } catch {
    ack?.({ status: 'error', code: 'INTERNAL_ERROR' })
  }
})

socket.on('typing', (payload: { roomId: string; typing: boolean }) => {
  if (!payload?.roomId) return
  socket.to(`room:${payload.roomId}`).emit('typing', {
    roomId: payload.roomId,
    uid,
    typing: !!payload.typing,
  })
})
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -w server
# 期望: message.socket 1 个用例 passed
```

- [ ] **Step 5: Commit**

```bash
git add server && git commit -m "feat(server): Socket 消息发送落库 + 房间广播 + 幂等去重"
```

---

### Task 10: 历史消息游标分页

**Files:**
- Create: `server/src/controllers/message.controller.ts`
- Create: `server/src/routes/messages.ts`
- Create: `server/tests/messages.history.test.ts`
- Modify: `server/src/app.ts`（挂载 messages 路由）

**Interfaces:**
- Consumes: `messageService.history`、`roomService.isMember`（Task 8/9）
- Produces: `GET /api/v1/rooms/:roomId/messages?cursor=&limit=` → `{ messages: MessageView[]; nextCursor: string | null }`

- [ ] **Step 1: 写失败测试**

`server/tests/messages.history.test.ts`：

```ts
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/utils/prisma'
import { signToken } from '../src/utils/jwt'

const app = createApp()

describe('message history pagination', () => {
  let user: { id: string; token: string }
  let outsider: { id: string; token: string }
  let roomId: string

  beforeAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
    await prisma.user.deleteMany()
    const u = await prisma.user.create({ data: { username: 't_hu', passwordHash: 'x', nickname: 'HU' } })
    const o = await prisma.user.create({ data: { username: 't_ho', passwordHash: 'x', nickname: 'HO' } })
    const room = await prisma.room.create({ data: { name: '历史群', ownerId: u.id } })
    await prisma.roomMember.create({ data: { roomId: room.id, userId: u.id } })
    user = { id: u.id, token: signToken(u.id) }
    outsider = { id: o.id, token: signToken(o.id) }
    roomId = room.id

    await prisma.message.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        roomId,
        senderId: u.id,
        type: 'text',
        content: `msg-${i}`,
      })),
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: 't_' } } })
  })

  it('第一页返回 limit 条且带 nextCursor', async () => {
    const res = await request(app)
      .get(`/api/v1/rooms/${roomId}/messages?limit=20`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.messages).toHaveLength(20)
    expect(typeof res.body.data.nextCursor).toBe('string')
    expect(res.body.data.messages[0].content).toBe('msg-0')
  })

  it('用 nextCursor 取下一页得到剩余 5 条且无游标', async () => {
    const first = await request(app)
      .get(`/api/v1/rooms/${roomId}/messages?limit=20`)
      .set('Authorization', `Bearer ${user.token}`)
    const cursor = first.body.data.nextCursor
    const res = await request(app)
      .get(`/api/v1/rooms/${roomId}/messages?limit=20&cursor=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(res.body.data.messages).toHaveLength(5)
    expect(res.body.data.nextCursor).toBeNull()
  })

  it('非成员访问返回 403', async () => {
    const res = await request(app)
      .get(`/api/v1/rooms/${roomId}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: 实现控制器与路由**

`server/src/controllers/message.controller.ts`：

```ts
import { query } from 'express-validator'
import type { Request, Response } from 'express'
import { messageService } from '../services/message.service'
import { roomService } from '../services/room.service'
import { fail, ok } from '../utils/response'
import type { AuthedRequest } from '../middleware/auth'

export const historyRules = [
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('cursor').optional().isISO8601(),
]

export async function history(req: AuthedRequest, res: Response): Promise<void> {
  const roomId = req.params.roomId
  if (!(await roomService.isMember(roomId, req.user!.uid))) {
    fail(res, 403, 'FORBIDDEN', 'not a member')
    return
  }
  const limit = Number(req.query.limit ?? 20)
  const cursor = (req.query.cursor as string | undefined) ?? null
  ok(res, await messageService.history(roomId, cursor, limit))
}
```

`server/src/routes/messages.ts`：

```ts
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { history, historyRules } from '../controllers/message.controller'

export const messagesRouter = Router()
messagesRouter.use(requireAuth)
messagesRouter.get('/rooms/:roomId/messages', historyRules, history)
```

`server/src/app.ts` 追加：`app.use('/api/v1', messagesRouter)`

- [ ] **Step 3: 运行测试确认通过**

```bash
npm run test -w server
# 期望: history 3 个用例 passed
```

- [ ] **Step 4: Commit**

```bash
git add server && git commit -m "feat(server): 历史消息游标分页 API"
```

---

### Task 11: 客户端聊天核心（Socket 服务 + 房间/消息 UI）

**Files:**
- Create: `client/src/renderer/src/api/rooms.ts`
- Create: `client/src/renderer/src/api/messages.ts`
- Create: `client/src/renderer/src/services/socket.ts`
- Create: `client/src/renderer/src/stores/chat.ts`
- Create: `client/src/renderer/src/pages/Chat.tsx`
- Create: `client/src/renderer/src/components/RoomList.tsx`
- Create: `client/src/renderer/src/components/MessageList.tsx`
- Create: `client/src/renderer/src/components/MessageItem.tsx`
- Create: `client/src/renderer/src/components/MembersPanel.tsx`
- Create: `client/src/renderer/src/styles.css`
- Modify: `client/src/renderer/src/App.tsx`（登录后进入 Chat）
- Create: `client/src/renderer/src/__tests__/chat.store.test.ts`

**Interfaces:**
- Consumes: `useSessionStore`、`request`（Task 6）；后端 rooms/messages API 与 Socket 事件（Task 7-10）
- Produces:
  - `socketService.connect(token)` / `disconnect()` / `sendMessage(roomId, content, clientMsgId)`
  - `useChatStore`：rooms / activeRoomId / messages / unread / online / typing
  - 布局：左房间列表 + 中消息流 + 右成员工具栏（可折叠，按原型）

- [ ] **Step 1: 写失败测试（chat store 发送流）**

`client/src/renderer/src/__tests__/chat.store.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChatStore } from '../stores/chat'

vi.mock('../services/socket', () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    onMessageNew: vi.fn(),
    onPresenceChanged: vi.fn(),
    onTyping: vi.fn(),
  },
}))

vi.mock('../api/rooms', () => ({
  listRoomsApi: vi.fn(async () => [
    { id: 'r1', name: '测试群', ownerId: 'u1', lastMessageAt: null, memberCount: 2, unread: 0 },
  ]),
}))

describe('chat store', () => {
  beforeEach(() => {
    useChatStore.setState({ rooms: [], activeRoomId: null, messages: {}, online: {}, typing: {} })
  })

  it('loadRooms 填充房间列表', async () => {
    await useChatStore.getState().loadRooms()
    expect(useChatStore.getState().rooms).toHaveLength(1)
  })

  it('sendMessage 先入 pending 列表', async () => {
    useChatStore.setState({ activeRoomId: 'r1', messages: { r1: [] } })
    await useChatStore.getState().sendMessage('hello')
    const list = useChatStore.getState().messages['r1']
    expect(list[0].status).toBe('sending')
  })
})
```

- [ ] **Step 2: 实现 API 与 Socket 服务**

`client/src/renderer/src/api/rooms.ts`：

```ts
import { request } from './request'

export interface RoomView {
  id: string
  name: string
  ownerId: string
  lastMessageAt: string | null
  memberCount: number
  unread: number
}

export const listRoomsApi = async (): Promise<RoomView[]> => {
  const res = (await request.get('/rooms')) as { success: true; data: RoomView[] }
  return res.data
}

export const createRoomApi = async (name: string): Promise<RoomView> => {
  const res = (await request.post('/rooms', { name })) as { success: true; data: RoomView }
  return res.data
}
```

`client/src/renderer/src/api/messages.ts`：

```ts
import { request } from './request'

export interface MessageView {
  id: string
  roomId: string
  senderId: string
  senderNickname: string
  type: string
  content: string
  createdAt: string
  clientMsgId?: string | null
}

export async function fetchHistoryApi(
  roomId: string,
  cursor?: string | null,
): Promise<{ messages: MessageView[]; nextCursor: string | null }> {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  const res = (await request.get(`/rooms/${roomId}/messages?${params.toString()}`)) as {
    success: true
    data: { messages: MessageView[]; nextCursor: string | null }
  }
  return res.data
}
```

`client/src/renderer/src/services/socket.ts`：

```ts
import { io, type Socket } from 'socket.io-client'
import type { MessageView } from '../api/messages'

class SocketService {
  private socket: Socket | null = null

  connect(token: string): void {
    this.socket = io('ws://localhost:3001', {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    })
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
  }

  joinRooms(roomIds: string[]): void {
    this.socket?.emit('room:join', roomIds)
  }

  sendMessage(
    roomId: string,
    content: string,
    clientMsgId: string,
    cb: (res: { status: string; message?: MessageView }) => void,
  ): void {
    this.socket?.emit('message:send', { roomId, content, clientMsgId }, cb)
  }

  emitTyping(roomId: string, typing: boolean): void {
    this.socket?.emit('typing', { roomId, typing })
  }

  onMessageNew(cb: (msg: MessageView) => void): void {
    this.socket?.on('message:new', cb)
  }

  onPresenceChanged(cb: (p: { uid: string; online: boolean }) => void): void {
    this.socket?.on('presence:changed', cb)
  }

  onTyping(cb: (p: { roomId: string; uid: string; typing: boolean }) => void): void {
    this.socket?.on('typing', cb)
  }
}

export const socketService = new SocketService()
```

`client/src/renderer/src/stores/chat.ts`：

```ts
import { create } from 'zustand'
import type { RoomView } from '../api/rooms'
import type { MessageView } from '../api/messages'
import { listRoomsApi } from '../api/rooms'
import { fetchHistoryApi } from '../api/messages'
import { socketService } from '../services/socket'

export type LocalMessage = MessageView & { status?: 'sending' | 'sent' }

interface ChatState {
  rooms: RoomView[]
  activeRoomId: string | null
  messages: Record<string, LocalMessage[]>
  online: Record<string, boolean>
  typing: Record<string, boolean>
  loadRooms: () => Promise<void>
  openRoom: (roomId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  applyMessage: (msg: MessageView) => void
}

function clientMsgId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  online: {},
  typing: {},

  async loadRooms() {
    const rooms = await listRoomsApi()
    set({ rooms })
    socketService.joinRooms(rooms.map((r) => r.id))
  },

  async openRoom(roomId) {
    set({ activeRoomId: roomId })
    const existing = get().messages[roomId]
    if (!existing) {
      const { messages } = await fetchHistoryApi(roomId, null)
      set((s) => ({ messages: { ...s.messages, [roomId]: messages } }))
    }
  },

  async sendMessage(content) {
    const { activeRoomId } = get()
    if (!activeRoomId) return
    const id = clientMsgId()
    const pending: LocalMessage = {
      id,
      roomId: activeRoomId,
      senderId: 'me',
      senderNickname: '我',
      type: 'text',
      content,
      createdAt: new Date().toISOString(),
      clientMsgId: id,
      status: 'sending',
    }
    set((s) => ({
      messages: { ...s.messages, [activeRoomId]: [...(s.messages[activeRoomId] ?? []), pending] },
    }))
    socketService.sendMessage(activeRoomId, content, id, (res) => {
      if (res.status === 'ok' && res.message) {
        get().applyMessage(res.message)
      }
    })
  },

  applyMessage(msg) {
    set((s) => {
      const roomMsgs = s.messages[msg.roomId] ?? []
      const filtered = roomMsgs.filter(
        (m) => !(m.status === 'sending' && m.clientMsgId && m.clientMsgId === msg.clientMsgId),
      )
      const next = [...filtered, msg]
      const rooms = s.rooms.map((r) =>
        r.id === msg.roomId ? { ...r, lastMessageAt: msg.createdAt } : r,
      )
      return { messages: { ...s.messages, [msg.roomId]: next }, rooms }
    })
  },
}))
```

- [ ] **Step 3: 实现页面与组件**

`client/src/renderer/src/pages/Chat.tsx`：

```tsx
import { useEffect } from 'react'
import { Layout } from 'antd'
import { RoomList } from '../components/RoomList'
import { MessageList } from '../components/MessageList'
import { MembersPanel } from '../components/MembersPanel'
import { useChatStore } from '../stores/chat'
import { socketService } from '../services/socket'
import { useSessionStore } from '../stores/session'

export function Chat() {
  const token = useSessionStore((s) => s.token)!
  const loadRooms = useChatStore((s) => s.loadRooms)

  useEffect(() => {
    socketService.connect(token)
    const onMessage = useChatStore.getState().applyMessage
    socketService.onMessageNew(onMessage)
    socketService.onPresenceChanged(({ uid, online }) => {
      useChatStore.setState((s) => ({ online: { ...s.online, [uid]: online } }))
    })
    loadRooms()
    return () => socketService.disconnect()
  }, [token, loadRooms])

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Sider width={220} theme="light">
        <RoomList />
      </Layout.Sider>
      <Layout.Content>
        <MessageList />
      </Layout.Content>
      <MembersPanel />
    </Layout>
  )
}
```

`client/src/renderer/src/components/RoomList.tsx`：

```tsx
import { Button, Badge, List, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useChatStore } from '../stores/chat'

export function RoomList() {
  const rooms = useChatStore((s) => s.rooms)
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const openRoom = useChatStore((s) => s.openRoom)

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text strong>房间</Typography.Text>
        <Button size="small" type="text" icon={<PlusOutlined />} aria-label="新建房间" />
      </div>
      <List
        size="small"
        dataSource={rooms}
        renderItem={(room) => (
          <List.Item
            onClick={() => openRoom(room.id)}
            style={{
              cursor: 'pointer',
              borderRadius: 8,
              background: room.id === activeRoomId ? '#e6f4ff' : undefined,
              padding: '8px 10px',
            }}
          >
            <List.Item.Meta
              title={<Typography.Text>{room.name}</Typography.Text>}
              description={`${room.memberCount} 人`}
            />
            {room.unread > 0 && <Badge count={room.unread} />}
          </List.Item>
        )}
      />
    </div>
  )
}
```

`client/src/renderer/src/components/MessageList.tsx`：

```tsx
import { Input, Button } from 'antd'
import { SendOutlined, SmileOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useChatStore } from '../stores/chat'
import { MessageItem } from './MessageItem'

export function MessageList() {
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const messages = useChatStore((s) => (activeRoomId ? s.messages[activeRoomId] ?? [] : []))
  const sendMessage = useChatStore((s) => s.sendMessage)
  const [text, setText] = useState('')

  const submit = () => {
    if (!text.trim()) return
    sendMessage(text.trim())
    setText('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {activeRoomId ? (
          messages.map((m) => <MessageItem key={m.id} message={m} />)
        ) : (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 80 }}>选择一个房间开始聊天</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eee' }}>
        <Button type="text" icon={<SmileOutlined />} aria-label="表情" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={submit}
          placeholder="输入消息，@ 唤起 AI 助手…"
        />
        <Button type="primary" icon={<SendOutlined />} onClick={submit} aria-label="发送" />
      </div>
    </div>
  )
}
```

`client/src/renderer/src/components/MessageItem.tsx`：

```tsx
import { Typography } from 'antd'
import type { LocalMessage } from '../stores/chat'

export function MessageItem({ message }: { message: LocalMessage }) {
  const mine = message.senderId === 'me'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div style={{ maxWidth: '70%' }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 2, textAlign: mine ? 'right' : 'left' }}>
          {message.senderNickname}
        </div>
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            background: mine ? '#1677ff' : '#f0f0f0',
            color: mine ? '#fff' : 'inherit',
          }}
        >
          <Typography.Text style={{ color: 'inherit' }}>{message.content}</Typography.Text>
          {message.status === 'sending' && (
            <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.7 }}>发送中…</span>
          )}
        </div>
      </div>
    </div>
  )
}
```

`client/src/renderer/src/components/MembersPanel.tsx`：

```tsx
import { useState } from 'react'
import { Button, Tooltip } from 'antd'
import { TeamOutlined } from '@ant-design/icons'

export function MembersPanel() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'flex', borderLeft: '1px solid #eee' }}>
      <div style={{ width: 46, paddingTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Tooltip title="成员列表" placement="left">
          <Button
            type={open ? 'primary' : 'text'}
            icon={<TeamOutlined />}
            aria-label="成员列表"
            aria-pressed={open}
            onClick={() => setOpen((v) => !v)}
          />
        </Tooltip>
      </div>
      {open && (
        <div style={{ width: 176, padding: 12, overflow: 'hidden' }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>成员</div>
          <div>（成员列表在 Task 15 接入在线状态）</div>
        </div>
      )}
    </div>
  )
}
```

`client/src/renderer/src/styles.css`（若脚手架已有则合并）：

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
}
```

`client/src/renderer/src/App.tsx` 替换 Chat 占位：

```tsx
import { Chat } from './pages/Chat'

export default function App() {
  const token = useSessionStore((s) => s.token)
  const [ready, setReady] = useState(!!token)
  if (!ready) return <Login onSuccess={() => setReady(true)} />
  return <Chat />
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -w client
# 期望: chat.store 2 个用例 + Login 用例 passed
```

- [ ] **Step 5: 手动验证双账号收发**

```bash
npm run dev:server & npm run dev:client
```

1. 注册两个账号，分别登录（可开两个窗口）
2. A 创建房间，B 加入同一房间
3. A 发消息，B 窗口实时收到；刷新后历史消息存在

- [ ] **Step 6: Commit**

```bash
git add client && git commit -m "feat(client): 房间/消息 UI + Socket 实时收发"
```

---

## Phase C：IM 高级能力（Week 3）

### Task 12: 未读 / 已读

**Files:**
- Create: `server/src/controllers/read.controller.ts`
- Modify: `server/src/routes/rooms.ts`（追加 `POST /:roomId/read`）
- Create: `server/tests/read.test.ts`
- Modify: `client/src/renderer/src/api/rooms.ts`（追加 `markReadApi`）
- Modify: `client/src/renderer/src/stores/chat.ts`（openRoom 后 markRead + 清零未读）

**Interfaces:**
- Consumes: `roomRepo`、`messageRepo`（Task 8/9）
- Produces: `POST /api/v1/rooms/:roomId/read { lastReadMessageId }`；`chatStore.markRead(roomId)`

- [ ] **Step 1: 写失败测试**

`server/tests/read.test.ts`：

```ts
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/utils/prisma'
import { signToken } from '../src/utils/jwt'
import { messageService } from '../src/services/message.service'

const app = createApp()

describe('unread / read', () => {
  let member: { id: string; token: string }
  let other: { id: string; token: string }
  let roomId: string

  beforeAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
    await prisma.user.deleteMany()
    const m = await prisma.user.create({ data: { username: 't_rm', passwordHash: 'x', nickname: 'RM' } })
    const o = await prisma.user.create({ data: { username: 't_ro', passwordHash: 'x', nickname: 'RO' } })
    const room = await prisma.room.create({ data: { name: '已读群', ownerId: m.id } })
    await prisma.roomMember.createMany({
      data: [
        { roomId: room.id, userId: m.id },
        { roomId: room.id, userId: o.id },
      ],
    })
    member = { id: m.id, token: signToken(m.id) }
    other = { id: o.id, token: signToken(o.id) }
    roomId = room.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: 't_' } } })
  })

  it('别人发 3 条后未读为 3', async () => {
    for (let i = 0; i < 3; i++) {
      await messageService.send(roomId, other.id, `unread-${i}`)
    }
    const res = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${member.token}`)
    const view = res.body.data.find((r: { id: string }) => r.id === roomId)
    expect(view.unread).toBe(3)
  })

  it('标记已读后未读为 0', async () => {
    const history = await request(app)
      .get(`/api/v1/rooms/${roomId}/messages`)
      .set('Authorization', `Bearer ${member.token}`)
    const last = history.body.data.messages[history.body.data.messages.length - 1]
    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/read`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ lastReadMessageId: last.id })
    expect(res.status).toBe(200)

    const list = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${member.token}`)
    const view = list.body.data.find((r: { id: string }) => r.id === roomId)
    expect(view.unread).toBe(0)
  })
})
```

- [ ] **Step 2: 实现已读接口**

`server/src/controllers/read.controller.ts`：

```ts
import { body, param } from 'express-validator'
import type { Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { roomRepo } from '../repositories/room.repo'
import { fail, ok } from '../utils/response'
import type { AuthedRequest } from '../middleware/auth'

export const markReadRules = [
  param('roomId').isUUID(),
  body('lastReadMessageId').isUUID(),
]

export async function markRead(req: AuthedRequest, res: Response): Promise<void> {
  const roomId = req.params.roomId
  const uid = req.user!.uid
  if (!(await roomRepo.findMembership(roomId, uid))) {
    fail(res, 403, 'FORBIDDEN', 'not a member')
    return
  }
  const message = await prisma.message.findUnique({
    where: { id: req.body.lastReadMessageId },
  })
  if (!message || message.roomId !== roomId) {
    fail(res, 400, 'VALIDATION_ERROR', 'message not in room')
    return
  }
  await prisma.roomMember.update({
    where: { roomId_userId: { roomId, userId: uid } },
    data: { lastReadMessageId: message.id },
  })
  ok(res, { marked: true })
}
```

`server/src/routes/rooms.ts` 追加：

```ts
roomsRouter.post('/:roomId/read', markReadRules, markRead)
```

- [ ] **Step 3: 客户端接入**

`client/src/renderer/src/api/rooms.ts` 追加：

```ts
export const markReadApi = async (roomId: string, lastReadMessageId: string): Promise<void> => {
  await request.post(`/rooms/${roomId}/read`, { lastReadMessageId })
}
```

`client/src/renderer/src/stores/chat.ts` 顶部追加 `import { markReadApi } from '../api/rooms'`，并在 `openRoom` 取到历史消息后追加：

```ts
const last = messages[messages.length - 1]
if (last) {
  markReadApi(roomId, last.id)
  set((s) => ({
    rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, unread: 0 } : r)),
  }))
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -w server
# 期望: read 2 个用例 passed
```

- [ ] **Step 5: Commit**

```bash
git add server client && git commit -m "feat: 未读计数与已读上报"
```

---

### Task 13: 消息流虚拟列表

**Files:**
- Modify: `client/src/renderer/src/components/MessageList.tsx`（接入 @tanstack/react-virtual）
- Create: `client/src/renderer/src/__tests__/MessageList.virtual.test.tsx`
- Modify: `client/package.json`（依赖 @tanstack/react-virtual）

**Interfaces:**
- Consumes: `useChatStore`（Task 11）
- Produces: 万级消息下 DOM 节点恒定（可见区 + overscan）

- [ ] **Step 1: 安装依赖并写失败测试**

```bash
npm install -w client @tanstack/react-virtual
```

`client/src/renderer/src/__tests__/MessageList.virtual.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageList } from '../components/MessageList'
import { useChatStore } from '../stores/chat'

vi.mock('../services/socket', () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    onMessageNew: vi.fn(),
    onPresenceChanged: vi.fn(),
    onTyping: vi.fn(),
  },
}))

describe('MessageList virtualization', () => {
  beforeEach(() => {
    const big = Array.from({ length: 500 }, (_, i) => ({
      id: `m${i}`,
      roomId: 'r1',
      senderId: 'u1',
      senderNickname: `用户${i}`,
      type: 'text',
      content: `消息 ${i}`,
      createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    }))
    useChatStore.setState({ activeRoomId: 'r1', messages: { r1: big } })
  })

  it('只挂载可见区附近的消息节点', () => {
    render(<MessageList />)
    const count = document.querySelectorAll('[data-testid="message-item"]').length
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(80)
  })
})
```

- [ ] **Step 2: 重写 MessageList 为虚拟滚动**

`client/src/renderer/src/components/MessageList.tsx`（整体替换）：

```tsx
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button, Input } from 'antd'
import { SendOutlined, SmileOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useChatStore } from '../stores/chat'
import { MessageItem } from './MessageItem'

export function MessageList() {
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const messages = useChatStore((s) => (activeRoomId ? s.messages[activeRoomId] ?? [] : []))
  const sendMessage = useChatStore((s) => s.sendMessage)
  const typing = useChatStore((s) => (activeRoomId ? s.typing[activeRoomId] : false))
  const [text, setText] = useState('')
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  })

  const submit = () => {
    if (!text.trim()) return
    sendMessage(text.trim())
    setText('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={parentRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {activeRoomId ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => (
              <div
                key={messages[vi.index].id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
              >
                <div data-testid="message-item">
                  <MessageItem message={messages[vi.index]} />
                </div>
              </div>
            ))}
            {typing && (
              <div style={{ color: '#999', fontSize: 13, padding: '4px 2px' }}>AI 助手 正在输入…</div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 80 }}>选择一个房间开始聊天</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eee' }}>
        <Button type="text" icon={<SmileOutlined />} aria-label="表情" />
        <Input value={text} onChange={(e) => setText(e.target.value)} onPressEnter={submit} placeholder="输入消息，@ 唤起 AI 助手…" />
        <Button type="primary" icon={<SendOutlined />} onClick={submit} aria-label="发送" />
      </div>
    </div>
  )
}
```

`MessageItem.tsx` 最外层 div 追加 `data-testid="message-item"` 与 `style={{ paddingBottom: 12 }}`。

- [ ] **Step 3: 运行测试确认通过**

```bash
npm run test -w client
# 期望: MessageList.virtual 通过（挂载节点 < 80）
```

- [ ] **Step 4: Commit**

```bash
git add client && git commit -m "feat(client): 消息流虚拟滚动（万级消息 DOM 恒定）"
```

---

### Task 14: 托盘 / 桌面通知 / 关闭到托盘

**Files:**
- Modify: `client/src/main/index.ts`（Tray、Notification、ipcMain 处理器）
- Create: `client/resources/tray.png`（占位 16x16 图标，实现时放入任意 png）
- Modify: `client/src/renderer/src/pages/Chat.tsx`（新消息通知 + 未读角标）
- Modify: `client/electron.vite.config.ts`（resources 配置）

**Interfaces:**
- Consumes: `window.chatAPI.notify / setBadge / window.closeToTray`（Task 6 已暴露）
- Produces: 托盘图标 + 未读角标；新消息桌面通知；关闭窗口最小化到托盘

- [ ] **Step 1: 主进程托盘与通知**

`client/src/main/index.ts` 追加（并引入 `Tray, Menu, nativeImage, Notification, ipcMain`）：

```ts
import { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, type WebContents } from 'electron'

let tray: Tray | null = null
let isQuitting = false

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray.png'))
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('GroupChat')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => BrowserWindow.getAllWindows()[0]?.show() },
      { label: '退出', click: () => { isQuitting = true; app.quit() } },
    ]),
  )
}

ipcMain.handle('notify', (_e, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) new Notification({ title, body }).show()
})

ipcMain.handle('set-badge', (_e, count: number) => {
  app.setBadgeCount(count)
  tray?.setToolTip(count > 0 ? `GroupChat · ${count} 条未读` : 'GroupChat')
})

ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender as WebContents)?.minimize())
ipcMain.on('window:close-to-tray', (e) => BrowserWindow.fromWebContents(e.sender as WebContents)?.hide())
```

`createWindow` 内追加关闭拦截与窗口引用保存：

```ts
const win = new BrowserWindow({ ... })
win.on('close', (e) => {
  if (!isQuitting) {
    e.preventDefault()
    win.hide()
  }
})
```

`app.whenReady()` 内 `createTray()` 在 `createWindow()` 之后调用。

`client/electron.vite.config.ts` 主进程 build 段追加：

```ts
main: {
  build: {
    rollupOptions: {
      external: [],
    },
  },
},
```

并将 `resources/` 复制到打包目录（开发阶段直接引用 `join(__dirname, '../../resources/tray.png')`；打包阶段由 electron-builder `extraResources` 处理，见 Task 20）。

- [ ] **Step 2: 渲染进程触发通知与角标**

`client/src/renderer/src/pages/Chat.tsx` 的 `onMessageNew` 处理改为（顶部追加 `import type { MessageView } from '../api/messages'`）：

```tsx
const onMessage = (msg: MessageView) => {
  useChatStore.getState().applyMessage(msg)
  const active = useChatStore.getState().activeRoomId
  const totalUnread = useChatStore
    .getState()
    .rooms.reduce((sum, r) => sum + (r.id === active ? 0 : r.unread), 0)
  if (msg.roomId !== active) {
    window.chatAPI?.notify(msg.senderNickname, msg.content)
  }
  window.chatAPI?.setBadge(totalUnread)
}
```

- [ ] **Step 3: 手动验证**

```bash
npm run dev:client
```

1. 关闭窗口 → 期望最小化到托盘而非退出
2. 从托盘菜单恢复窗口
3. 另一个账号发消息 → 期望弹桌面通知、Dock 显示未读角标
4. 托盘图标"退出"能真正退出

- [ ] **Step 4: Commit**

```bash
git add client && git commit -m "feat(client): 托盘/桌面通知/关闭到托盘"
```

---

### Task 15: 在线状态与输入状态 UI

**Files:**
- Modify: `client/src/renderer/src/api/rooms.ts`（追加 `listMembersApi`）
- Modify: `client/src/renderer/src/components/MembersPanel.tsx`（成员 + 在线圆点）
- Modify: `client/src/renderer/src/components/MessageList.tsx`（typing 提示已含，见 Task 13）
- Modify: `client/src/renderer/src/services/socket.ts`（已暴露 onTyping，无需改动）
- Modify: `client/src/renderer/src/stores/chat.ts`（typing 应用）
- Create: `client/src/renderer/src/__tests__/presence.test.ts`

**Interfaces:**
- Consumes: `GET /rooms/:id/members`（Task 8）、Socket `typing` / `presence:changed`（Task 9/7）
- Produces: `chatStore.applyTyping(roomId, uid, typing)`（2 秒自动清除）、成员在线圆点

- [ ] **Step 1: 写失败测试（store 逻辑）**

`client/src/renderer/src/__tests__/presence.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChatStore } from '../stores/chat'

describe('typing & presence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useChatStore.setState({ typing: {}, online: {} })
  })
  afterEach(() => vi.useRealTimers())

  it('applyTyping 置位并 2 秒后清除', () => {
    useChatStore.getState().applyTyping('r1', 'u1', true)
    expect(useChatStore.getState().typing['r1']).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(useChatStore.getState().typing['r1']).toBe(false)
  })

  it('applyPresence 更新在线表', () => {
    useChatStore.getState().applyPresence('u1', true)
    expect(useChatStore.getState().online['u1']).toBe(true)
  })
})
```

- [ ] **Step 2: 实现 store 动作与成员面板**

`client/src/renderer/src/stores/chat.ts` 追加：

```ts
applyTyping: (roomId: string, uid: string, typing: boolean) => {
  if (!typing) {
    set((s) => ({ typing: { ...s.typing, [roomId]: false } }))
    return
  }
  set((s) => ({ typing: { ...s.typing, [roomId]: true } }))
  setTimeout(() => {
    set((s) => ({ typing: { ...s.typing, [roomId]: false } }))
  }, 2000)
},
applyPresence: (uid: string, online: boolean) => {
  set((s) => ({ online: { ...s.online, [uid]: online } }))
},
```

`client/src/renderer/src/api/rooms.ts` 追加：

```ts
export interface MemberView {
  id: string
  nickname: string
  username: string
  avatarUrl: string | null
}

export const listMembersApi = async (roomId: string): Promise<MemberView[]> => {
  const res = (await request.get(`/rooms/${roomId}/members`)) as { success: true; data: MemberView[] }
  return res.data
}
```

`client/src/renderer/src/components/MembersPanel.tsx` 整体替换：

```tsx
import { useEffect, useState } from 'react'
import { Button, Tooltip } from 'antd'
import { TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import { listMembersApi, type MemberView } from '../api/rooms'
import { useChatStore } from '../stores/chat'

export function MembersPanel() {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<MemberView[]>([])
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const online = useChatStore((s) => s.online)

  useEffect(() => {
    if (open && activeRoomId) listMembersApi(activeRoomId).then(setMembers)
  }, [open, activeRoomId])

  return (
    <div style={{ display: 'flex', borderLeft: '1px solid #eee' }}>
      <div style={{ width: 46, paddingTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Tooltip title="成员列表" placement="left">
          <Button
            type={open ? 'primary' : 'text'}
            icon={<TeamOutlined />}
            aria-label="成员列表"
            aria-pressed={open}
            onClick={() => setOpen((v) => !v)}
          />
        </Tooltip>
      </div>
      {open && (
        <div style={{ width: 176, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#999', marginBottom: 8 }}>
            <span>成员 · {members.length}</span>
            <Button size="small" type="text" icon={<UserAddOutlined />} aria-label="邀请成员" />
          </div>
          {members.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: online[m.id] ? '#52c41a' : '#bbb',
                  flex: 'none',
                }}
                aria-label={online[m.id] ? '在线' : '离线'}
              />
              <span>{m.nickname}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

`Chat.tsx` 的 socket 事件回调改接 store：

```tsx
socketService.onTyping(({ roomId, uid, typing }) => {
  useChatStore.getState().applyTyping(roomId, uid, typing)
})
socketService.onPresenceChanged(({ uid, online }) => {
  useChatStore.getState().applyPresence(uid, online)
})
```

发送输入状态（输入框 onChange 时节流调用 `socketService.emitTyping(activeRoomId, true)`，提交后置 false）。

- [ ] **Step 3: 运行测试确认通过**

```bash
npm run test -w client
# 期望: presence 2 个用例 passed
```

- [ ] **Step 4: Commit**

```bash
git add client && git commit -m "feat(client): 在线状态与输入状态 UI"
```

---

## Phase D：链接预览与 AI（Week 4）

### Task 16: WebContentsView 链接预览

**Files:**
- Modify: `client/src/main/index.ts`（open-link-preview / close-link-preview / preview-navigate）
- Modify: `client/src/preload/index.ts`（openLink 已存在，追加 previewNavigate）
- Create: `client/src/renderer/src/utils/url.ts`
- Create: `client/src/renderer/src/components/LinkCard.tsx`
- Modify: `client/src/renderer/src/components/MessageItem.tsx`（渲染链接卡片）
- Modify: `client/src/renderer/src/pages/Chat.tsx`（预览工具栏条）
- Create: `client/src/renderer/src/__tests__/url.test.ts`

**Interfaces:**
- Consumes: `window.chatAPI.openLink / closeLinkPreview / previewNavigate`
- Produces: `extractUrls(text): string[]`；链接卡片点击后主进程挂载独立 WebContentsView（仅 http/https，独立 session）

- [ ] **Step 1: 写失败测试（URL 提取）**

`client/src/renderer/src/__tests__/url.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { extractUrls } from '../utils/url'

describe('extractUrls', () => {
  it('提取纯链接', () => {
    expect(extractUrls('看这个 https://example.com/a?b=1 文档')).toEqual([
      'https://example.com/a?b=1',
    ])
  })
  it('忽略非 http 协议', () => {
    expect(extractUrls('本地文件 file:///etc/passwd')).toEqual([])
  })
})
```

- [ ] **Step 2: 实现 URL 工具与链接卡片**

`client/src/renderer/src/utils/url.ts`：

```ts
const URL_RE = /https?:\/\/[^\s<>"']+/g

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.replace(/[.,;:!?]+$/, '')))]
}
```

`client/src/renderer/src/components/LinkCard.tsx`：

```tsx
import { Button, Tooltip } from 'antd'
import { LinkOutlined, ArrowUpOutlined } from '@ant-design/icons'

export function LinkCard({ url }: { url: string }) {
  return (
    <Tooltip title="在独立预览视图中打开">
      <Button
        type="link"
        icon={<LinkOutlined />}
        onClick={() => window.chatAPI?.openLink(url)}
      >
        {url}
        <ArrowUpOutlined style={{ marginLeft: 4 }} />
      </Button>
    </Tooltip>
  )
}
```

`MessageItem.tsx` 的消息内容渲染改为：先 `extractUrls(content)`，有链接时在气泡下渲染 `LinkCard`。

- [ ] **Step 3: 主进程 WebContentsView 管理**

`client/src/main/index.ts` 追加：

```ts
import { WebContentsView, session, type BaseWindow } from 'electron'

let previewView: WebContentsView | null = null
let previewWindow: BaseWindow | null = null

function layoutPreview(): void {
  if (!previewView || !previewWindow) return
  const b = previewWindow.getContentBounds()
  previewView.setBounds({ x: 220, y: 44, width: Math.max(b.width - 220 - 46, 0), height: Math.max(b.height - 44 - 52, 0) })
}

ipcMain.handle('open-link-preview', async (e, url: string) => {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
  const win = BrowserWindow.fromWebContents(e.sender as WebContents)
  if (!win || previewView) return
  const isolated = session.fromPartition('preview-session')
  isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  previewView = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: isolated,
    },
  })
  previewWindow = win
  win.contentView.addChildView(previewView)
  layoutPreview()
  win.on('resize', layoutPreview)
  await previewView.webContents.loadURL(url)
})

ipcMain.handle('close-link-preview', () => {
  if (previewView && previewWindow) {
    previewWindow.contentView.removeChildView(previewView)
    previewView.webContents.close()
    previewView = null
    previewWindow = null
  }
})

ipcMain.handle('preview-navigate', (_e, action: 'back' | 'forward' | 'reload') => {
  const wc = previewView?.webContents
  if (!wc) return
  if (action === 'back') wc.goBack()
  if (action === 'forward') wc.goForward()
  if (action === 'reload') wc.reload()
})
```

`client/src/preload/index.ts` 追加 `previewNavigate: (action: 'back' | 'forward' | 'reload') => ipcRenderer.invoke('preview-navigate', action)`。

- [ ] **Step 4: 渲染进程预览工具栏**

`client/src/renderer/src/pages/Chat.tsx` 追加状态与工具栏条（放在 Chat 主区域顶部；需引入 `useState`，`ArrowLeftOutlined / ArrowRightOutlined / ReloadOutlined / CloseOutlined` 从 `@ant-design/icons` 引入）：

```tsx
const [previewOpen, setPreviewOpen] = useState(false)

// openLink 触发后：window.chatAPI?.openLink(url); setPreviewOpen(true)
// 预览工具条（previewOpen 时显示在消息区上方）：
<div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid #eee' }}>
  <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => window.chatAPI?.previewNavigate('back')} aria-label="后退" />
  <Button size="small" icon={<ArrowRightOutlined />} onClick={() => window.chatAPI?.previewNavigate('forward')} aria-label="前进" />
  <Button size="small" icon={<ReloadOutlined />} onClick={() => window.chatAPI?.previewNavigate('reload')} aria-label="刷新" />
  <span style={{ flex: 1, fontSize: 12, color: '#999' }}>链接预览 · 独立 Session</span>
  <Button
    size="small"
    icon={<CloseOutlined />}
    onClick={() => {
      window.chatAPI?.closeLinkPreview()
      setPreviewOpen(false)
    }}
    aria-label="关闭预览"
  />
</div>
```

需要的图标从 `@ant-design/icons` 引入。

- [ ] **Step 5: 运行测试 + 手动验证**

```bash
npm run test -w client
# 期望: url 2 个用例 passed
```

手动：聊天中发一条含 `https://developer.mozilla.org` 的消息 → 点链接卡片 → 期望主区域出现网页预览，顶部工具条可用，关闭后恢复聊天。

- [ ] **Step 6: Commit**

```bash
git add client && git commit -m "feat(client): WebContentsView 链接预览（独立 session + 工具条）"
```

---

### Task 17: AI 机器人服务端（流式回复）

**Files:**
- Create: `server/src/services/ai.service.ts`
- Create: `server/tests/ai.service.test.ts`
- Modify: `server/src/sockets/handlers.ts`（触发 AI 回复 + ai:delta / ai:done）
- Modify: `server/src/services/message.service.ts`（支持 `type` 参数）

**Interfaces:**
- Consumes: `AI_BASE_URL / AI_API_KEY / AI_MODEL` 环境变量（Task 1 .env.example）；`messageService.send`（Task 9）
- Produces:
  - `streamAiReply(input: { baseUrl, apiKey, model, messages: Array<{ role: 'system'|'user'|'assistant'; content: string }> }, onDelta: (text: string) => void): Promise<string>`
  - Socket 事件：`ai:delta { roomId, content }`、`ai:done { roomId, message }`

- [ ] **Step 1: 写失败测试（mock fetch 流）**

`server/tests/ai.service.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { streamAiReply } from '../src/services/ai.service'

function sseChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)))
      controller.close()
    },
  })
}

describe('streamAiReply', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('解析 SSE delta 并拼接完整回复', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: sseChunks([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const deltas: string[] = []
    const full = await streamAiReply(
      {
        baseUrl: 'https://api.test/v1',
        apiKey: 'sk-test',
        model: 'test-model',
        messages: [{ role: 'user', content: 'hi' }],
      },
      (t) => deltas.push(t),
    )
    expect(full).toBe('你好')
    expect(deltas).toEqual(['你', '好'])
  })
})
```

- [ ] **Step 2: 实现 AI 服务**

`server/src/services/ai.service.ts`：

```ts
interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamAiInput {
  baseUrl: string
  apiKey: string
  model: string
  messages: AiMessage[]
}

export async function streamAiReply(
  input: StreamAiInput,
  onDelta: (text: string) => void,
): Promise<string> {
  const res = await fetch(`${input.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({ model: input.model, messages: input.messages, stream: true }),
  })
  if (!res.ok || !res.body) throw new Error(`AI request failed: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          full += delta
          onDelta(delta)
        }
      } catch {
        // 跳过无法解析的行
      }
    }
  }
  return full
}
```

- [ ] **Step 3: 消息服务支持 type，Socket 触发 AI**

`server/src/services/message.service.ts` 的 `send` 签名改为：

```ts
send(roomId: string, senderId: string, content: string, clientMsgId?: string, type = 'text')
```

`create` 的 data 中 `type` 使用该参数。

`server/src/sockets/handlers.ts` 追加：

```ts
import { streamAiReply } from '../services/ai.service'

async function getOrCreateAiBot() {
  const { prisma } = await import('../utils/prisma')
  const existing = await prisma.user.findUnique({ where: { username: 'ai-assistant' } })
  if (existing) return existing
  return prisma.user.create({
    data: { username: 'ai-assistant', passwordHash: 'x', nickname: 'AI 助手' },
  })
}

async function handleAiReply(io: Server, roomId: string, prompt: string): Promise<void> {
  try {
    const bot = await getOrCreateAiBot()
    const recent = await messageService.history(roomId, null, 10)
    const context = recent.messages.map((m) => ({
      role: m.senderId === bot.id ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }))
    const full = await streamAiReply(
      {
        baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
        apiKey: process.env.AI_API_KEY || '',
        model: process.env.AI_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是群聊里的 AI 助手，用中文简洁回答。' },
          ...context,
        ],
      },
      (delta) => io.to(`room:${roomId}`).emit('ai:delta', { roomId, content: delta }),
    )
    const message = await messageService.send(
      roomId,
      bot.id,
      full,
      `ai_${Date.now()}_${roomId}`,
      'ai',
    )
    io.to(`room:${roomId}`).emit('ai:done', { roomId, message })
  } catch (e) {
    io.to(`room:${roomId}`).emit('ai:done', {
      roomId,
      message: null,
      error: 'AI 暂时无法回复',
    })
  }
}
```

在 `message:send` 成功 ack 后追加触发：

```ts
if (/@AI|@ai|@ai助手/i.test(content)) {
  void handleAiReply(io, roomId, content)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -w server
# 期望: ai.service 1 个用例 passed
```

- [ ] **Step 5: Commit**

```bash
git add server && git commit -m "feat(server): AI 机器人流式回复（SSE → Socket）"
```

---

### Task 18: AI 流式 UI

**Files:**
- Modify: `client/src/renderer/src/services/socket.ts`（onAiDelta / onAiDone）
- Modify: `client/src/renderer/src/stores/chat.ts`（applyAiDelta / applyAiDone）
- Modify: `client/src/renderer/src/components/MessageList.tsx`（AI typing 气泡展示增量）
- Modify: `client/src/renderer/src/components/MessageItem.tsx`（`type === 'ai'` 差异化样式）
- Create: `client/src/renderer/src/__tests__/ai.ui.test.ts`

**Interfaces:**
- Consumes: `ai:delta` / `ai:done`（Task 17）
- Produces: 机器人消息流式上屏、完成后替换为完整消息

- [ ] **Step 1: 写失败测试**

`client/src/renderer/src/__tests__/ai.ui.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '../stores/chat'

describe('ai streaming', () => {
  beforeEach(() => {
    useChatStore.setState({ activeRoomId: 'r1', messages: { r1: [] }, typing: {} })
  })

  it('delta 累积为 aiBuffer', () => {
    useChatStore.getState().applyAiDelta('r1', '你')
    useChatStore.getState().applyAiDelta('r1', '好')
    expect(useChatStore.getState().aiBuffer['r1']).toBe('你好')
    expect(useChatStore.getState().typing['r1']).toBe(true)
  })

  it('done 替换为完整消息并清空 buffer', () => {
    const done = {
      id: 'ai-1',
      roomId: 'r1',
      senderId: 'ai',
      senderNickname: 'AI 助手',
      type: 'ai',
      content: '你好',
      createdAt: new Date().toISOString(),
    }
    useChatStore.getState().applyAiDone('r1', done)
    const msgs = useChatStore.getState().messages['r1']
    expect(msgs[0].content).toBe('你好')
    expect(useChatStore.getState().aiBuffer['r1']).toBe('')
    expect(useChatStore.getState().typing['r1']).toBe(false)
  })
})
```

- [ ] **Step 2: 实现 store 与 socket 接线**

`client/src/renderer/src/stores/chat.ts` state 追加 `aiBuffer: Record<string, string>`，并实现：

```ts
applyAiDelta: (roomId: string, content: string) =>
  set((s) => ({
    aiBuffer: { ...s.aiBuffer, [roomId]: (s.aiBuffer[roomId] ?? '') + content },
    typing: { ...s.typing, [roomId]: true },
  })),

applyAiDone: (roomId: string, message: MessageView) => {
  set((s) => ({
    aiBuffer: { ...s.aiBuffer, [roomId]: '' },
    typing: { ...s.typing, [roomId]: false },
    messages: {
      ...s.messages,
      [roomId]: [...(s.messages[roomId] ?? []), message],
    },
  }))
},
```

`client/src/renderer/src/services/socket.ts` 追加：

```ts
onAiDelta(cb: (p: { roomId: string; content: string }) => void): void {
  this.socket?.on('ai:delta', cb)
}
onAiDone(cb: (p: { roomId: string; message: MessageView | null }) => void): void {
  this.socket?.on('ai:done', cb)
}
```

`Chat.tsx` 接线：

```tsx
socketService.onAiDelta(({ roomId, content }) => useChatStore.getState().applyAiDelta(roomId, content))
socketService.onAiDone(({ roomId, message }) => {
  if (message) useChatStore.getState().applyAiDone(roomId, message)
  else useChatStore.getState().applyTyping(roomId, 'ai', false)
})
```

`MessageList.tsx` 的 typing 占位改为显示 `aiBuffer[roomId]` 增量文本：

```tsx
{typing && (
  <div style={{ color: '#999', fontSize: 13, padding: '4px 2px' }}>
    AI 助手：{aiBuffer[activeRoomId] ?? ''}
    <span style={{ marginLeft: 4 }}>▍</span>
  </div>
)}
```

`MessageItem.tsx` 对 `message.type === 'ai'` 使用 AI 主题色气泡（如 `#7c5cff` 背景 + 白色文字）并显示机器人标签。

- [ ] **Step 3: 运行测试确认通过**

```bash
npm run test -w client
# 期望: ai.ui 2 个用例 passed
```

- [ ] **Step 4: 手动验证（需真实 AI Key）**

在 `server/.env` 配置 `AI_API_KEY` 后重启，在房间内发 `@AI 助手 帮我总结一下这个项目的技术栈`，期望：顶部出现"AI 助手：…▍"逐字跳动，随后变成完整消息。

- [ ] **Step 5: Commit**

```bash
git add client && git commit -m "feat(client): AI 流式回复 UI"
```

---

## Phase E：部署与收尾（Week 5）

### Task 19: Docker 化 + 部署脚本

**Files:**
- Create: `server/Dockerfile`
- Create: `server/.dockerignore`
- Create: `docker-compose.yml`
- Create: `nginx.conf`
- Create: `deploy.sh`

**Interfaces:**
- Consumes: 阿里云轻量服务器（Linux，已装 Docker + docker-compose）；安全组开放 80/443
- Produces: `docker compose up -d --build` 一键启动 mysql + server + nginx；`/health` 可访问

- [ ] **Step 1: 后端多阶段 Dockerfile**

`server/Dockerfile`：

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm install --no-save --no-audit --no-fund prisma@5.22.0
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

`server/.dockerignore`：

```dockerignore
node_modules
dist
.env
tests
```

- [ ] **Step 2: docker-compose 编排**

`docker-compose.yml`：

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: group_chat
      TZ: Asia/Shanghai
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 12
    restart: unless-stopped

  server:
    build: ./server
    environment:
      PORT: 3001
      DATABASE_URL: mysql://root:${MYSQL_ROOT_PASSWORD}@mysql:3306/group_chat
      JWT_SECRET: ${JWT_SECRET}
      AI_BASE_URL: ${AI_BASE_URL}
      AI_API_KEY: ${AI_API_KEY}
      AI_MODEL: ${AI_MODEL}
    depends_on:
      mysql:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    image: nginx:stable-alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - server
    restart: unless-stopped

volumes:
  mysql_data:
```

`nginx.conf`：

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 10m;

    location /health {
        proxy_pass http://server:3001;
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://server:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://server:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

- [ ] **Step 3: 部署脚本**

`deploy.sh`：

```bash
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
```

执行：`chmod +x deploy.sh`，并在服务器上创建 `.env`（MYSQL_ROOT_PASSWORD / JWT_SECRET / AI_*，模板见 `server/.env.example`）。

- [ ] **Step 4: 本地校验配置**

```bash
docker compose config -q
# 期望: 无错误输出
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml nginx.conf deploy.sh server/Dockerfile server/.dockerignore
git commit -m "feat(deploy): Docker Compose + Nginx + 部署脚本"
```

---

### Task 20: 打包分发 + 项目 README

**Files:**
- Modify: `client/package.json`（electron-builder 配置与脚本）
- Create: `README.md`

**Interfaces:**
- Consumes: electron-vite 构建产物
- Produces: macOS dmg（本机）；Windows exe 需在 Windows/CI 上构建（文档说明）；开发/部署手册

- [ ] **Step 1: electron-builder 配置**

`client/package.json` 追加：

```json
"scripts": {
  "build": "electron-vite build",
  "pack": "electron-vite build && electron-builder --dir",
  "dist": "electron-vite build && electron-builder"
},
"build": {
  "appId": "com.groupchat.desktop",
  "productName": "GroupChat",
  "directories": { "output": "release" },
  "files": ["out/**/*"],
  "extraResources": [{ "from": "resources", "to": "resources" }],
  "mac": { "target": ["dmg"], "category": "public.app-category.social-networking" },
  "win": { "target": ["nsis"] },
  "linux": { "target": ["AppImage"] }
}
```

安装：`npm install -w client -D electron-builder`

- [ ] **Step 2: 构建与打包验证**

```bash
npm run build -w client
# 期望: electron-vite 三端构建成功（main / preload / renderer）

npm run pack -w client
# 期望: release/ 下生成未压缩的应用目录（macOS 本机）
```

> Windows 安装包需要 Windows 环境或 CI（如 GitHub Actions windows runner），本计划不覆盖，README 中说明。

- [ ] **Step 3: 写 README**

`README.md` 内容要点（完整写出）：

```markdown
# GroupChat

Electron + React + Socket.io 桌面群聊应用。

## 技术栈
Electron 30+ / electron-vite / React 19 / Ant Design / Zustand / @tanstack/react-virtual /
Node 20 / Express 4 / Socket.io 4 / Prisma 5 / MySQL 8.0 / Docker Compose / Nginx

## 本地开发
1. 启动 MySQL，创建 group_chat 与 group_chat_test 库
2. cp server/.env.example server/.env 并填入密码/JWT_SECRET
3. npm install
4. npm run dev:server
5. npm run dev:client

## 测试
npm test

## AI 助手
在 server/.env 配置 AI_BASE_URL / AI_API_KEY / AI_MODEL，
房间内发 @AI 助手 消息即可触发流式回复。

## 部署（阿里云轻量服务器）
1. 服务器安装 Docker + Docker Compose，安全组开放 80
2. 上传 docker-compose.yml、nginx.conf、server/ 到 /opt/group-chat
3. 在 /opt/group-chat/.env 配置 MYSQL_ROOT_PASSWORD / JWT_SECRET / AI_*
4. 本地执行 ./deploy.sh

## 打包
macOS: npm run dist -w client
Windows: 需在 Windows 环境构建

## 验收清单
- [ ] 双账号实时收发、顺序一致、无丢消息
- [ ] 离线/重连后未读正确、消息不重复
- [ ] 万级历史消息分页与虚拟列表流畅
- [ ] 托盘未读角标 + 桌面通知
- [ ] @AI 助手 流式回复
- [ ] docker compose 一键部署，/health 通过
```

- [ ] **Step 4: Commit**

```bash
git add client/package.json README.md && git commit -m "docs+chore: 打包配置与项目 README"
```

---

## Spec 覆盖对照（自检）

| Spec 章节 | 覆盖任务 |
|-----------|----------|
| 3.1 进程模型 / 3.3 preload API | Task 6、14、16 |
| 3.2 三栏布局 + 成员折叠工具栏 | Task 11、15 |
| 4.1 后端分层 | Task 2、4-5、8-10、17 |
| 4.2 REST/Socket 分工 | Task 7-10、12 |
| 5 数据模型 | Task 3 |
| 6.1 登录建连进房 | Task 4-7、11 |
| 6.2 发消息 | Task 9、11 |
| 6.3 已读 | Task 12 |
| 6.4 在线状态 | Task 7、15 |
| 6.5 AI 机器人 | Task 17、18 |
| 6.6 链接预览 | Task 16 |
| 7 Electron 安全 | Task 6、16 |
| 8 错误处理与日志 | Task 2、7 |
| 9 测试策略 | 各任务 TDD 步骤 |
| 11 部署 | Task 19 |
| 12 路线图 | Phase A-E 与 Week 1-5 对应 |
| 14 验收标准 | README 验收清单（Task 20） |

## 已知简化与后续扩展（有意为之，不在本计划范围）

- 文件/图片上传：spec 1.2 明确不做，消息表已预留 `type` 字段
- 未读计数当前按消息时间差计算，已读模型（lastReadMessageId）已落地，可后续优化为游标计数
- AI 触发规则为简单关键词（@AI），后续可做斜杠命令或机器人配置面板
- 链接预览的 bounds 计算基于固定侧栏宽度 220/46，后续可改为响应式计算
