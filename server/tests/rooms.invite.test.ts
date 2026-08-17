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
