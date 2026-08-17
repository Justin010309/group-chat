# 加入房间三入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现「加入房间三入口」：① 输入房间 ID / 粘贴邀请链接加入；② 邀请链接复制 + `groupchat://` 系统深链；③ 成员面板按账号邀请并实时推送 `room:invited`。

**Architecture:** 严格遵循 `docs/2026-08-17-项目数据流程图与架构图.md`（v1.1，4.11 节）。后端在既有分层内新增 invite 接口（routes → controllers → room.service.invite → room.repo），通过 `user:{uid}` 频道推送邀请事件；客户端在 api → stores → components 分层内新增 joinRoom / inviteMember 能力，深链经主进程 → preload 白名单通道 → 渲染进程。

**Tech Stack:** Express 4 + Socket.io 4 + Prisma 6.19.3（MySQL 8）、Electron 30+（contextIsolation + sandbox）、React 19 + TypeScript + Zustand + Ant Design、Vitest + supertest + React Testing Library。

## Global Constraints

- REST 统一响应 `{ success, data }` / `{ success: false, error: { code, message } }`；错误码：`FORBIDDEN`(403)、`USER_NOT_FOUND`(404)、`ROOM_NOT_FOUND`(404)、`ALREADY_MEMBER`(409)、`VALIDATION_ERROR`(400)
- 服务端分层：routes → controllers → services → repositories，业务代码不直连 Prisma
- Socket 握手 JWT 鉴权；实时推送走 Socket，一次性写库走 REST
- 系统能力（深链、剪贴板若走 IPC）一律经 preload 白名单 `window.chatAPI`；渲染进程不直接使用 Node/Electron API
- 邀请权限：任意房间成员可邀请
- 邀请链接格式：`groupchat://join?roomId=<uuid>`；加入弹窗输入框兼容裸 UUID / 深链 / http(s) 链接
- 测试：服务端 Vitest + supertest（用 `group_chat_test` 库）；客户端 Vitest + RTL + jsdom
- 每个任务结束 `git commit`，信息格式 `feat(scope): ...` / `test(scope): ...`

---

## 文件结构总览

```
server/src
├── sockets/io.ts                     # 新增：io 实例注册/读取（供 REST 控制器推送）
├── sockets/index.ts                  # 修改：initSocket 内 setIo
├── services/room.service.ts          # 修改：新增 invite；join 补 ROOM_NOT_FOUND
├── controllers/room.controller.ts    # 修改：新增 invite + inviteRules
├── routes/rooms.ts                   # 修改：注册 POST /:roomId/invite
└── tests/rooms.invite.test.ts        # 新增：invite 接口 + join 404 + room:invited 推送

client/src
├── main/index.ts                     # 修改：setAsDefaultProtocolClient + open-url/second-instance
├── preload/index.ts                  # 修改：新增 onInviteLink 白名单通道
├── renderer/src/utils/url.ts         # 修改：buildInviteLink / parseJoinInput
├── renderer/src/api/rooms.ts         # 修改：joinRoomApi / inviteMemberApi
├── renderer/src/stores/chat.ts       # 修改：joinRoom / inviteMember
├── renderer/src/services/socket.ts   # 修改：onRoomInvited
├── renderer/src/pages/Chat.tsx       # 修改：深链监听 + room:invited 订阅
├── renderer/src/components/RoomList.tsx    # 修改：加入弹窗 + 复制邀请链接 + 深链事件
├── renderer/src/components/MembersPanel.tsx# 修改：邀请弹窗
└── renderer/src/__tests__/
    ├── url.test.ts                   # 修改：新增解析用例
    ├── chat.store.test.ts            # 修改：joinRoom / inviteMember 用例
    ├── RoomList.join.test.tsx        # 新增：加入弹窗 / 复制链接 / 深链事件
    └── MembersPanel.invite.test.tsx  # 新增：邀请弹窗
```

---

### Task 1: 后端 invite 接口 + join 404 修复 + room:invited 推送

**Files:**
- Create: `server/src/sockets/io.ts`
- Modify: `server/src/sockets/index.ts`
- Modify: `server/src/services/room.service.ts`
- Modify: `server/src/controllers/room.controller.ts`
- Modify: `server/src/routes/rooms.ts`
- Test: `server/tests/rooms.invite.test.ts`（新增）

**Interfaces:**
- Consumes: `roomRepo.findMembership / findById / members / addMember`、`userRepo.findByUsername`（均已存在）、`initSocket(server)`、`getIo()`
- Produces: `POST /api/v1/rooms/:roomId/invite`（body `{ username }`，成功 201 返回 RoomView）；`room.service.invite(roomId, inviterUid, username): Promise<{ room: RoomView; memberId: string }>`；Socket 事件 `room:invited { roomId }` 推送至 `user:{memberId}`；join 不存在的房间返回 404 `ROOM_NOT_FOUND`

- [ ] **Step 1: 写失败测试**

新建 `server/tests/rooms.invite.test.ts`：

```ts
import { createServer, type Server as HttpServer } from 'http'
import request from 'supertest'
import { io as ioc, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { initSocket } from '../src/sockets'
import { setIo } from '../src/sockets/io'
import { prisma } from '../src/utils/prisma'
import { signToken } from '../src/utils/jwt'

const app = createApp()

describe('rooms invite', () => {
  let userA: { id: string; username: string; token: string }
  let userB: { id: string; username: string; token: string }
  let userC: { id: string; username: string; token: string }
  let roomId: string

  beforeAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
    await prisma.user.deleteMany()
    const a = await prisma.user.create({
      data: { username: 't_ia', passwordHash: 'x', nickname: 'IA' }
    })
    const b = await prisma.user.create({
      data: { username: 't_ib', passwordHash: 'x', nickname: 'IB' }
    })
    const c = await prisma.user.create({
      data: { username: 't_ic', passwordHash: 'x', nickname: 'IC' }
    })
    userA = { id: a.id, username: a.username, token: signToken(a.id) }
    userB = { id: b.id, username: b.username, token: signToken(b.id) }
    userC = { id: c.id, username: c.username, token: signToken(c.id) }
    const room = await prisma.room.create({ data: { name: '邀请群', ownerId: a.id } })
    await prisma.roomMember.create({ data: { roomId: room.id, userId: a.id } })
    roomId = room.id
    setIo(null)
  })

  afterAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
    await prisma.user.deleteMany({ where: { username: { startsWith: 't_' } } })
  })

  it('非成员邀请返回 403', async () => {
    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/invite`)
      .set('Authorization', `Bearer ${userC.token}`)
      .send({ username: userB.username })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('成员邀请成功后目标用户进入房间', async () => {
    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/invite`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ username: userB.username })
    expect(res.status).toBe(201)
    expect(res.body.data.memberCount).toBe(2)

    const members = await request(app)
      .get(`/api/v1/rooms/${roomId}/members`)
      .set('Authorization', `Bearer ${userA.token}`)
    expect(members.body.data.map((m: { username: string }) => m.username)).toContain('t_ib')

    const listB = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${userB.token}`)
    expect(listB.body.data.map((r: { id: string }) => r.id)).toContain(roomId)
  })

  it('重复邀请返回 409', async () => {
    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/invite`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ username: userB.username })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ALREADY_MEMBER')
  })

  it('目标用户不存在返回 404', async () => {
    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/invite`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ username: 't_nobody' })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('USER_NOT_FOUND')
  })

  it('未认证请求返回 401', async () => {
    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/invite`)
      .send({ username: userB.username })
    expect(res.status).toBe(401)
  })

  it('加入不存在的房间返回 404', async () => {
    const res = await request(app)
      .post('/api/v1/rooms/00000000-0000-4000-8000-000000000000/join')
      .set('Authorization', `Bearer ${userA.token}`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('ROOM_NOT_FOUND')
  })

  it('目标用户在线时收到 room:invited', async () => {
    const room2 = await prisma.room.create({ data: { name: '邀请群2', ownerId: userA.id } })
    await prisma.roomMember.create({ data: { roomId: room2.id, userId: userA.id } })

    const http: HttpServer = createServer(createApp())
    initSocket(http)
    await new Promise<void>((resolve) => http.listen(0, resolve))
    const addr = http.address() as { port: number }
    const url = `http://127.0.0.1:${addr.port}`

    const sock: Socket = ioc(url, {
      auth: { token: userC.token },
      transports: ['websocket']
    })
    await new Promise<void>((resolve) => sock.on('connect', () => resolve()))

    const received = new Promise<{ roomId: string }>((resolve) => {
      sock.once('room:invited', resolve)
    })
    const res = await request(app)
      .post(`/api/v1/rooms/${room2.id}/invite`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ username: userC.username })
    expect(res.status).toBe(201)

    const payload = await received
    expect(payload.roomId).toBe(room2.id)
    sock.close()
    http.close()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w server -- rooms.invite`
Expected: FAIL（`Cannot find module '../src/sockets/io'` 或 404 断言失败），证明测试指向未实现功能。

- [ ] **Step 3: 最小实现**

新建 `server/src/sockets/io.ts`：

```ts
import type { Server } from 'socket.io'

let ioInstance: Server | null = null

export function setIo(io: Server): void {
  ioInstance = io
}

export function getIo(): Server | null {
  return ioInstance
}
```

修改 `server/src/sockets/index.ts`（initSocket 内注册 io 实例）：

```ts
import { Server } from 'socket.io'
import { verifyToken } from '../utils/jwt'
import { registerHandlers } from './handlers'
import { setIo } from './io'

export function initSocket(server: HttpServer): Server {
  const io = new Server(server, { cors: { origin: true, credentials: true } })
  setIo(io)
  // ...原有 io.use / io.on('connection') 不变
}
```

修改 `server/src/services/room.service.ts`（顶部增加 `import { userRepo } from '../repositories/user.repo'`；`join` 先查房间并抛出带 code 的错误；新增 `invite`）：

```ts
async join(uid: string, roomId: string): Promise<RoomView> {
  const room = await roomRepo.findById(roomId)
  if (!room) {
    const err = new Error('ROOM_NOT_FOUND') as Error & { code: string }
    err.code = 'ROOM_NOT_FOUND'
    throw err
  }
  if (await roomRepo.findMembership(roomId, uid)) {
    const err = new Error('ALREADY_MEMBER') as Error & { code: string }
    err.code = 'ALREADY_MEMBER'
    throw err
  }
  await roomRepo.addMember(roomId, uid)
  return toRoomView(room, null, (await roomRepo.members(roomId)).length, uid)
},

async invite(
  roomId: string,
  inviterUid: string,
  username: string
): Promise<{ room: RoomView; memberId: string }> {
  if (!(await roomRepo.findMembership(roomId, inviterUid))) {
    const err = new Error('FORBIDDEN') as Error & { code: string }
    err.code = 'FORBIDDEN'
    throw err
  }
  const target = await userRepo.findByUsername(username)
  if (!target) {
    const err = new Error('USER_NOT_FOUND') as Error & { code: string }
    err.code = 'USER_NOT_FOUND'
    throw err
  }
  if (await roomRepo.findMembership(roomId, target.id)) {
    const err = new Error('ALREADY_MEMBER') as Error & { code: string }
    err.code = 'ALREADY_MEMBER'
    throw err
  }
  await roomRepo.addMember(roomId, target.id)
  const room = await roomRepo.findById(roomId)
  if (!room) throw new Error('ROOM_NOT_FOUND')
  return {
    room: toRoomView(room, null, (await roomRepo.members(roomId)).length, inviterUid),
    memberId: target.id
  }
}
```

修改 `server/src/controllers/room.controller.ts`（新增 `inviteRules` 与 `invite`；顶部补 `import { getIo } from '../sockets/io'`）：

```ts
export const inviteRules = [
  param('roomId').isUUID(),
  body('username').trim().isLength({ min: 3, max: 24 })
]

export async function invite(req: AuthedRequest, res: Response): Promise<void> {
  if (!validate(req, res)) return
  try {
    const { room, memberId } = await roomService.invite(
      req.user!.uid,
      req.params.roomId,
      req.body.username.trim()
    )
    getIo()?.to(`user:${memberId}`).emit('room:invited', { roomId: req.params.roomId })
    res.status(201)
    ok(res, room)
  } catch (e) {
    const code = (e as Error & { code?: string }).code
    if (code === 'FORBIDDEN') {
      fail(res, 403, 'FORBIDDEN', 'not a member')
      return
    }
    if (code === 'USER_NOT_FOUND') {
      fail(res, 404, 'USER_NOT_FOUND', 'user not found')
      return
    }
    if (code === 'ALREADY_MEMBER') {
      fail(res, 409, 'ALREADY_MEMBER', 'already a member')
      return
    }
    throw e
  }
}
```

修改 `server/src/routes/rooms.ts`（导入并注册）：

```ts
import {
  createRoom,
  createRoomRules,
  invite,
  inviteRules,
  joinRoom,
  listMembers,
  listRooms,
  roomIdRules
} from '../controllers/room.controller'

roomsRouter.post('/:roomId/invite', inviteRules, invite)
```

同时修改 `server/src/controllers/room.controller.ts` 的 `joinRoom`，把 `ROOM_NOT_FOUND` 映射为 404：

```ts
} catch (e) {
  if ((e as Error & { code?: string }).code === 'ALREADY_MEMBER') {
    fail(res, 409, 'ALREADY_MEMBER', 'already a member')
    return
  }
  if ((e as Error & { code?: string }).code === 'ROOM_NOT_FOUND') {
    fail(res, 404, 'ROOM_NOT_FOUND', 'room not found')
    return
  }
  throw e
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -w server -- rooms.invite`
Expected: 7/7 PASS；随后 `npm run test -w server` 全量 PASS（现有 25 项不回归）。

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests/rooms.invite.test.ts
git commit -m "feat(server): 房间邀请接口 + room:invited 推送 + join 404"
```

---

### Task 2: 客户端 API + store joinRoom + RoomList 加入弹窗/邀请链接

**Files:**
- Modify: `client/src/renderer/src/utils/url.ts`
- Modify: `client/src/renderer/src/api/rooms.ts`
- Modify: `client/src/renderer/src/stores/chat.ts`
- Modify: `client/src/renderer/src/components/RoomList.tsx`
- Test: `client/src/renderer/src/__tests__/url.test.ts`（修改）、`client/src/renderer/src/__tests__/chat.store.test.ts`（修改）、`client/src/renderer/src/__tests__/RoomList.join.test.tsx`（新增）

**Interfaces:**
- Consumes: 现有 `request`、`useChatStore`、`socketService`、antd `Modal/Input/Badge/Button`
- Produces: `buildInviteLink(roomId): string`、`parseJoinInput(input): string | null`、`joinRoomApi(roomId): Promise<RoomView>`、`useChatStore.joinRoom(roomId): Promise<void>`

- [ ] **Step 1: 写失败测试**

`client/src/renderer/src/__tests__/url.test.ts` 追加：

```ts
import { buildInviteLink, parseJoinInput } from '../utils/url'

describe('join input parsing', () => {
  const uuid = '3f2f7c4a-9d1e-4f3b-8a5c-6b7d8e9f0a1b'

  it('buildInviteLink 生成深链', () => {
    expect(buildInviteLink(uuid)).toBe(`groupchat://join?roomId=${uuid}`)
  })

  it('parseJoinInput 识别裸 UUID', () => {
    expect(parseJoinInput(uuid)).toBe(uuid)
    expect(parseJoinInput(`  ${uuid.toUpperCase()}  `)).toBe(uuid)
  })

  it('parseJoinInput 识别深链与 web 链接', () => {
    expect(parseJoinInput(`groupchat://join?roomId=${uuid}`)).toBe(uuid)
    expect(parseJoinInput(`http://localhost:5173/#/join?roomId=${uuid}`)).toBe(uuid)
  })

  it('parseJoinInput 非法输入返回 null', () => {
    expect(parseJoinInput('not-a-room-id')).toBeNull()
    expect(parseJoinInput('')).toBeNull()
  })
})
```

`client/src/renderer/src/__tests__/chat.store.test.ts`：在 `vi.mock('../api/rooms')` 中追加 `joinRoomApi`，并新增用例：

```ts
joinRoomApi: vi.fn(async (roomId: string) => ({
  id: roomId,
  name: '已加入群',
  ownerId: 'u2',
  lastMessageAt: null,
  memberCount: 2,
  unread: 0
}))
```

```ts
it('joinRoom 加入并激活房间', async () => {
  const { joinRoomApi } = await import('../api/rooms')
  await useChatStore.getState().joinRoom('r3')
  const s = useChatStore.getState()
  expect(joinRoomApi).toHaveBeenCalledWith('r3')
  expect(s.rooms.map((r) => r.id)).toContain('r3')
  expect(s.activeRoomId).toBe('r3')
})

it('joinRoom 已是成员(409)时打开已有房间', async () => {
  useChatStore.setState({ rooms: [{ id: 'r1', name: '测试群', ownerId: 'u1', lastMessageAt: null, memberCount: 2, unread: 0 }], activeRoomId: null })
  const { joinRoomApi } = await import('../api/rooms')
  vi.mocked(joinRoomApi).mockRejectedValueOnce({ code: 'ALREADY_MEMBER', message: 'already a member' })
  await useChatStore.getState().joinRoom('r1')
  expect(useChatStore.getState().activeRoomId).toBe('r1')
})
```

新建 `client/src/renderer/src/__tests__/RoomList.join.test.tsx`：

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomList } from '../components/RoomList'
import { useChatStore } from '../stores/chat'

vi.mock('../services/socket', () => ({
  socketService: { joinRooms: vi.fn(), emitTyping: vi.fn() }
}))

vi.mock('../api/rooms', () => ({
  listRoomsApi: vi.fn(),
  createRoomApi: vi.fn(),
  joinRoomApi: vi.fn(async (roomId: string) => ({
    id: roomId,
    name: '新房间',
    ownerId: 'u1',
    lastMessageAt: null,
    memberCount: 1,
    unread: 0
  })),
  markReadApi: vi.fn(),
  listMembersApi: vi.fn()
}))

describe('RoomList join', () => {
  beforeEach(() => {
    useChatStore.setState({ rooms: [], activeRoomId: null, messages: {}, online: {}, typing: {}, aiBuffer: {} })
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
  })

  it('输入房间 ID 加入并激活', async () => {
    const { joinRoomApi } = await import('../api/rooms')
    const uuid = '3f2f7c4a-9d1e-4f3b-8a5c-6b7d8e9f0a1b'
    render(
      <AntApp>
        <RoomList />
      </AntApp>
    )
    fireEvent.click(screen.getByRole('button', { name: '加入房间' }))
    fireEvent.change(screen.getByPlaceholderText(/粘贴邀请链接或输入房间 ID/), {
      target: { value: uuid }
    })
    fireEvent.click(screen.getByRole('button', { name: '加入' }))
    await waitFor(() => expect(joinRoomApi).toHaveBeenCalledWith(uuid))
    expect(useChatStore.getState().activeRoomId).toBe(uuid)
  })

  it('粘贴深链自动解析房间 ID', async () => {
    const { joinRoomApi } = await import('../api/rooms')
    const uuid = '3f2f7c4a-9d1e-4f3b-8a5c-6b7d8e9f0a1b'
    render(
      <AntApp>
        <RoomList />
      </AntApp>
    )
    fireEvent.click(screen.getByRole('button', { name: '加入房间' }))
    fireEvent.change(screen.getByPlaceholderText(/粘贴邀请链接或输入房间 ID/), {
      target: { value: `groupchat://join?roomId=${uuid}` }
    })
    fireEvent.click(screen.getByRole('button', { name: '加入' }))
    await waitFor(() => expect(joinRoomApi).toHaveBeenCalledWith(uuid))
  })

  it('复制邀请链接写入剪贴板', async () => {
    useChatStore.setState({ rooms: [{ id: 'r1', name: '测试群', ownerId: 'u1', lastMessageAt: null, memberCount: 2, unread: 0 }], activeRoomId: null })
    render(
      <AntApp>
        <RoomList />
      </AntApp>
    )
    fireEvent.click(screen.getByRole('button', { name: /复制邀请链接/ }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('groupchat://join?roomId=r1')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w client`
Expected: 新增用例 FAIL（`joinRoom` 不存在 / `parseJoinInput` 不存在），原有 12 项不受影响。

- [ ] **Step 3: 最小实现**

`client/src/renderer/src/utils/url.ts` 追加：

```ts
const ROOM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INVITE_LINK_RE = /roomId=([0-9a-f-]{36})/i

export function buildInviteLink(roomId: string): string {
  return `groupchat://join?roomId=${roomId}`
}

export function parseJoinInput(input: string): string | null {
  const trimmed = input.trim()
  if (ROOM_ID_RE.test(trimmed)) return trimmed.toLowerCase()
  const match = trimmed.match(INVITE_LINK_RE)
  if (match && ROOM_ID_RE.test(match[1])) return match[1].toLowerCase()
  return null
}
```

`client/src/renderer/src/api/rooms.ts` 追加：

```ts
export const joinRoomApi = async (roomId: string): Promise<RoomView> => {
  const res = (await request.post(`/rooms/${roomId}/join`)) as { success: true; data: RoomView }
  return res.data
}
```

`client/src/renderer/src/stores/chat.ts`：`ChatState` 增加 `joinRoom: (roomId: string) => Promise<void>`；import `joinRoomApi`；实现：

```ts
async joinRoom(roomId) {
  try {
    const room = await joinRoomApi(roomId)
    set((s) => ({
      rooms: [room, ...s.rooms.filter((r) => r.id !== room.id)],
      activeRoomId: room.id,
      messages: { ...s.messages, [room.id]: s.messages[room.id] ?? [] }
    }))
    socketService.joinRooms([room.id])
  } catch (e) {
    const err = e as { code?: string }
    if (err.code === 'ALREADY_MEMBER') {
      let room = get().rooms.find((r) => r.id === roomId)
      if (!room) {
        await get().loadRooms()
        room = get().rooms.find((r) => r.id === roomId)
      }
      if (room) {
        set({ activeRoomId: room.id })
        socketService.joinRooms([roomId])
      }
      return
    }
    throw e
  }
}
```

`client/src/renderer/src/components/RoomList.tsx`：头部增加「加入房间」按钮；每个房间行右侧增加复制链接按钮；加入弹窗（解析输入 → `joinRoom` → 成功/错误提示）。错误映射：`ROOM_NOT_FOUND` →「房间不存在」、`ALREADY_MEMBER` →「你已在房间中」。

```tsx
import { useEffect, useState } from 'react'
import { Button, Badge, Typography, Modal, Input, App as AntApp } from 'antd'
import { PlusOutlined, UserAddOutlined, LinkOutlined } from '@ant-design/icons'
import { useChatStore } from '../stores/chat'
import { buildInviteLink, parseJoinInput } from '../utils/url'

export function RoomList() {
  const rooms = useChatStore((s) => s.rooms)
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const openRoom = useChatStore((s) => s.openRoom)
  const createRoom = useChatStore((s) => s.createRoom)
  const joinRoom = useChatStore((s) => s.joinRoom)
  const { message } = AntApp.useApp()
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinInput, setJoinInput] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)

  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<{ roomId?: string }>).detail
      setJoinInput(detail?.roomId ?? '')
      setJoinOpen(true)
    }
    window.addEventListener('gc:invite-open', open)
    return () => window.removeEventListener('gc:invite-open', open)
  }, [])

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await createRoom(name.trim())
      setModalOpen(false)
      setName('')
    } finally {
      setLoading(false)
    }
  }

  const submitJoin = async () => {
    const roomId = parseJoinInput(joinInput)
    if (!roomId) {
      message.warning('请输入有效的房间 ID 或邀请链接')
      return
    }
    setJoinLoading(true)
    try {
      await joinRoom(roomId)
      setJoinOpen(false)
      setJoinInput('')
      message.success('已加入房间')
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'ROOM_NOT_FOUND') message.error('房间不存在')
      else if (code === 'ALREADY_MEMBER') message.info('你已在房间中')
      else message.error('加入失败，请稍后重试')
    } finally {
      setJoinLoading(false)
    }
  }

  const copyInvite = async (roomId: string) => {
    await navigator.clipboard.writeText(buildInviteLink(roomId))
    message.success('邀请链接已复制')
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text strong>房间</Typography.Text>
        <div>
          <Button size="small" type="text" icon={<UserAddOutlined />} aria-label="加入房间" onClick={() => setJoinOpen(true)} />
          <Button size="small" type="text" icon={<PlusOutlined />} aria-label="新建房间" onClick={() => setModalOpen(true)} />
        </div>
      </div>
      {rooms.map((room) => (
        <div key={room.id} onClick={() => openRoom(room.id)} style={{ cursor: 'pointer', borderRadius: 8, background: room.id === activeRoomId ? '#e6f4ff' : undefined, padding: '8px 10px', marginBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text>{room.name}</Typography.Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {room.unread > 0 && <Badge count={room.unread} />}
              <Button size="small" type="text" icon={<LinkOutlined />} aria-label={`复制邀请链接 ${room.name}`} onClick={(e) => { e.stopPropagation(); void copyInvite(room.id) }} />
            </div>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{room.memberCount} 人</Typography.Text>
        </div>
      ))}
      <Modal title="新建房间" open={modalOpen} onOk={submit} confirmLoading={loading} onCancel={() => setModalOpen(false)} okText="创建" cancelText="取消">
        <Input placeholder="房间名称" value={name} onChange={(e) => setName(e.target.value)} onPressEnter={submit} />
      </Modal>
      <Modal title="加入房间" open={joinOpen} onOk={submitJoin} confirmLoading={joinLoading} onCancel={() => setJoinOpen(false)} okText="加入" cancelText="取消">
        <Input placeholder="粘贴邀请链接或输入房间 ID" value={joinInput} onChange={(e) => setJoinInput(e.target.value)} onPressEnter={submitJoin} />
      </Modal>
    </div>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -w client`
Expected: 全部 PASS（原 12 项 + 新增用例）。

- [ ] **Step 5: Commit**

```bash
git add client/src/renderer/src
git commit -m "feat(client): 输入房间 ID 加入 + 复制邀请链接"
```

---

### Task 3: 系统深链（main + preload + Chat 事件桥接）

**Files:**
- Modify: `client/src/main/index.ts`
- Modify: `client/src/preload/index.ts`
- Modify: `client/src/renderer/src/pages/Chat.tsx`
- Test: `client/src/renderer/src/__tests__/RoomList.join.test.tsx`（追加深链用例）

**Interfaces:**
- Consumes: `app.setAsDefaultProtocolClient`、`app.on('open-url')`、`requestSingleInstanceLock`、`webContents.send`
- Produces: `window.chatAPI.onInviteLink(cb): () => void`；渲染进程自定义事件 `gc:invite-open`（detail `{ roomId }`）

- [ ] **Step 1: 写失败测试**

`client/src/renderer/src/__tests__/RoomList.join.test.tsx` 追加：

```tsx
it('收到 gc:invite-open 事件自动打开弹窗并预填', () => {
  const uuid = '9f2f7c4a-9d1e-4f3b-8a5c-6b7d8e9f0a1b'
  render(
    <AntApp>
      <RoomList />
    </AntApp>
  )
  window.dispatchEvent(new CustomEvent('gc:invite-open', { detail: { roomId: uuid } }))
  expect(screen.getByDisplayValue(uuid)).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w client -- RoomList.join`
Expected: 新增用例 FAIL（弹窗未自动打开）。主进程/preload 改动无法用 jsdom 单测，靠类型检查 + 手动 GUI 验证。

- [ ] **Step 3: 最小实现**

`client/src/main/index.ts` 追加：

```ts
function parseRoomIdFromUrl(url: string): string | null {
  const match = url.match(/roomId=([0-9a-f-]{36})/i)
  return match?.[1] ?? null
}

function registerDeepLink(): void {
  app.setAsDefaultProtocolClient('groupchat')
  app.on('open-url', (event, url) => {
    event.preventDefault()
    const roomId = parseRoomIdFromUrl(url)
    if (!roomId) return
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('invite:open', { roomId })
  })
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith('groupchat://'))
    const roomId = url ? parseRoomIdFromUrl(url) : null
    const win = BrowserWindow.getAllWindows()[0]
    if (roomId) win?.webContents.send('invite:open', { roomId })
    win?.show()
    if (win?.isMinimized()) win.restore()
  })
}
```

在 `app.whenReady().then(() => { ... })` 内首行调用 `registerDeepLink()`。

`client/src/preload/index.ts` 追加：

```ts
onInviteLink: (cb: (roomId: string) => void) => {
  const listener = (_e: Electron.IpcRendererEvent, payload: { roomId: string }) => cb(payload.roomId)
  ipcRenderer.on('invite:open', listener)
  return () => ipcRenderer.removeListener('invite:open', listener)
}
```

`client/src/renderer/src/pages/Chat.tsx` 的 `useEffect` 内（`socketService.connect(token)` 之前）追加：

```tsx
const offInvite = window.chatAPI?.onInviteLink?.((roomId: string) => {
  window.dispatchEvent(new CustomEvent('gc:invite-open', { detail: { roomId } }))
})
```

并把清理函数改为 `return () => { offInvite?.(); socketService.disconnect() }`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -w client` + `npm run build -w client`（类型检查覆盖 preload/main 类型）
Expected: 全部 PASS，typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add client/src/main client/src/preload client/src/renderer/src
git commit -m "feat(electron): groupchat:// 深链打开加入弹窗"
```

---

### Task 4: 成员面板邀请 + room:invited 实时刷新

**Files:**
- Modify: `client/src/renderer/src/api/rooms.ts`
- Modify: `client/src/renderer/src/stores/chat.ts`
- Modify: `client/src/renderer/src/services/socket.ts`
- Modify: `client/src/renderer/src/pages/Chat.tsx`
- Modify: `client/src/renderer/src/components/MembersPanel.tsx`
- Test: `client/src/renderer/src/__tests__/chat.store.test.ts`（修改）、`client/src/renderer/src/__tests__/MembersPanel.invite.test.tsx`（新增）

**Interfaces:**
- Consumes: `inviteMemberApi`、`useChatStore.inviteMember`、`socketService.onRoomInvited`
- Produces: `inviteMemberApi(roomId, username): Promise<RoomView>`、`useChatStore.inviteMember(roomId, username): Promise<void>`、`socketService.onRoomInvited(cb)`

- [ ] **Step 1: 写失败测试**

`client/src/renderer/src/__tests__/chat.store.test.ts`：mock 中追加 `inviteMemberApi` 并新增用例：

```ts
inviteMemberApi: vi.fn(async () => ({
  id: 'r1', name: '测试群', ownerId: 'u1', lastMessageAt: null, memberCount: 3, unread: 0
}))
```

```ts
it('inviteMember 调用接口并刷新房间列表', async () => {
  const { inviteMemberApi, listRoomsApi } = await import('../api/rooms')
  vi.mocked(listRoomsApi).mockResolvedValueOnce([
    { id: 'r1', name: '测试群', ownerId: 'u1', lastMessageAt: null, memberCount: 3, unread: 0 }
  ])
  await useChatStore.getState().inviteMember('r1', 'bob')
  expect(inviteMemberApi).toHaveBeenCalledWith('r1', 'bob')
  expect(listRoomsApi).toHaveBeenCalled()
})
```

新建 `client/src/renderer/src/__tests__/MembersPanel.invite.test.tsx`：

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MembersPanel } from '../components/MembersPanel'
import { useChatStore } from '../stores/chat'

vi.mock('../api/rooms', () => ({
  listMembersApi: vi.fn(async () => []),
  inviteMemberApi: vi.fn(async () => ({
    id: 'r1', name: '测试群', ownerId: 'u1', lastMessageAt: null, memberCount: 2, unread: 0
  }))
}))

describe('MembersPanel invite', () => {
  beforeEach(() => {
    useChatStore.setState({ rooms: [], activeRoomId: 'r1', messages: {}, online: {}, typing: {}, aiBuffer: {} })
  })

  it('输入账号邀请成功并刷新成员', async () => {
    const { inviteMemberApi, listMembersApi } = await import('../api/rooms')
    render(
      <AntApp>
        <MembersPanel />
      </AntApp>
    )
    fireEvent.click(screen.getByRole('button', { name: '成员列表' }))
    fireEvent.click(screen.getByRole('button', { name: '邀请成员' }))
    fireEvent.change(screen.getByPlaceholderText(/输入对方账号/), { target: { value: 'bob' } })
    fireEvent.click(screen.getByRole('button', { name: '邀请' }))
    await waitFor(() => expect(inviteMemberApi).toHaveBeenCalledWith('r1', 'bob'))
    await waitFor(() => expect(listMembersApi).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -w client`
Expected: 新增用例 FAIL（`inviteMember` / `inviteMemberApi` / 邀请弹窗不存在）。

- [ ] **Step 3: 最小实现**

`client/src/renderer/src/api/rooms.ts` 追加：

```ts
export const inviteMemberApi = async (roomId: string, username: string): Promise<RoomView> => {
  const res = (await request.post(`/rooms/${roomId}/invite`, { username })) as {
    success: true
    data: RoomView
  }
  return res.data
}
```

`client/src/renderer/src/stores/chat.ts`：`ChatState` 增加 `inviteMember: (roomId: string, username: string) => Promise<void>`；import `inviteMemberApi`；实现：

```ts
async inviteMember(roomId, username) {
  await inviteMemberApi(roomId, username)
  await get().loadRooms()
}
```

`client/src/renderer/src/services/socket.ts` 追加：

```ts
onRoomInvited(cb: (p: { roomId: string }) => void): void {
  this.socket?.on('room:invited', cb)
}
```

`client/src/renderer/src/pages/Chat.tsx` 的 Socket 订阅区追加：

```tsx
socketService.onRoomInvited(() => {
  useChatStore.getState().loadRooms()
})
```

`client/src/renderer/src/components/MembersPanel.tsx`：把无逻辑的「邀请成员」按钮改为打开邀请弹窗：

```tsx
const [inviteOpen, setInviteOpen] = useState(false)
const [inviteUsername, setInviteUsername] = useState('')
const [inviteLoading, setInviteLoading] = useState(false)
const { message } = AntApp.useApp()

const submitInvite = async () => {
  if (!inviteUsername.trim() || !activeRoomId) return
  setInviteLoading(true)
  try {
    await useChatStore.getState().inviteMember(activeRoomId, inviteUsername.trim())
    setInviteOpen(false)
    setInviteUsername('')
    if (open) listMembersApi(activeRoomId).then(setMembers)
    message.success('已发送邀请')
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'USER_NOT_FOUND') message.error('用户不存在')
    else if (code === 'ALREADY_MEMBER') message.info('对方已在房间中')
    else if (code === 'FORBIDDEN') message.error('无权邀请')
    else message.error('邀请失败，请稍后重试')
  } finally {
    setInviteLoading(false)
  }
}
```

邀请按钮绑定 `onClick={() => setInviteOpen(true)}`，并在面板末尾追加 Modal：

```tsx
<Modal title="邀请成员" open={inviteOpen} onOk={submitInvite} confirmLoading={inviteLoading} onCancel={() => setInviteOpen(false)} okText="邀请" cancelText="取消">
  <Input placeholder="输入对方账号（username）" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} onPressEnter={submitInvite} />
</Modal>
```

顶部导入补 `Modal, Input, App as AntApp`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -w client` + `npm run build -w client`
Expected: 全部 PASS，typecheck 干净。

- [ ] **Step 5: Commit**

```bash
git add client/src/renderer/src
git commit -m "feat(client): 成员面板邀请 + room:invited 实时刷新"
```

---

### Task 5: 全量验证 + 文档同步

**Files:**
- Modify: `docs/2026-08-17-项目数据流程图与架构图.md`
- Modify: `docs/handoff.md`

- [ ] **Step 1: 全量验证**

Run: `npm run test -w server`、`npm run test -w client`、`npm run build -w client`
Expected: server 全绿（原 25 + 新增 invite 用例）、client 全绿、typecheck 无错误。

- [ ] **Step 2: 更新架构文档**

`docs/2026-08-17-项目数据流程图与架构图.md`：
- 头部版本改 v1.2，状态行去掉「规划中」；
- 4.11 标题与引言去掉「规划中」；
- 5.1 表格 invite 行去掉「（v1.1 规划中，见 4.11.3）」→「邀请用户入房 `{ username }`（见 4.11.3）」；
- 5.2 表格 `room:invited` 行去掉规划标注；
- 5.3 标题去掉「规划中」；
- 8 节「邀请成员按钮」行改为「已实现：成员面板邀请弹窗 + room:invited 实时刷新（见 4.11.3）」；
- 10 节追加 v1.2 变更记录。

- [ ] **Step 3: 更新交接文档**

`docs/handoff.md`：
- 第 1 节一句话补充「支持房间邀请/加入（输入 ID、邀请链接深链、成员面板邀请）」；
- 第 5 节验收进度「待 GUI 手动验收」增加一项：加入房间三入口（深链需 `open groupchat://join?roomId=<id>` 验证）。

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: 加入房间三入口落地，架构文档升级 v1.2"
```

---

## Self-Review 结论

1. **Spec 覆盖**：4.11.1（Task 2）、4.11.2（Task 3）、4.11.3（Task 4）全部有对应任务；接口清单（Task 1 后端 + 各客户端任务）同步；已知边界（Task 5 文档）同步。
2. **占位符扫描**：无 TBD/TODO；每个代码步骤均含完整代码。
3. **类型一致性**：`parseJoinInput` / `buildInviteLink` / `joinRoomApi` / `inviteMemberApi` / `joinRoom` / `inviteMember` / `onRoomInvited` / `onInviteLink` 名称与签名在各任务间一致。
