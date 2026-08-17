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
    const u = await prisma.user.create({
      data: { username: 't_hu', passwordHash: 'x', nickname: 'HU' }
    })
    const o = await prisma.user.create({
      data: { username: 't_ho', passwordHash: 'x', nickname: 'HO' }
    })
    const room = await prisma.room.create({ data: { name: '历史群', ownerId: u.id } })
    await prisma.roomMember.create({ data: { roomId: room.id, userId: u.id } })
    user = { id: u.id, token: signToken(u.id) }
    outsider = { id: o.id, token: signToken(o.id) }
    roomId = room.id

    const base = Date.now() - 25 * 60_000
    await prisma.message.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        roomId,
        senderId: u.id,
        type: 'text',
        content: `msg-${i}`,
        createdAt: new Date(base + i * 1000)
      }))
    })
  })

  afterAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
    await prisma.user.deleteMany({ where: { username: { startsWith: 't_' } } })
  })

  it('第一页返回 limit 条且带 nextCursor', async () => {
    const res = await request(app)
      .get(`/api/v1/rooms/${roomId}/messages?limit=20`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.messages).toHaveLength(20)
    expect(typeof res.body.data.nextCursor).toBe('string')
    expect(res.body.data.messages[0].content).toBe('msg-5')
  })

  it('用 nextCursor 取更早一页得到剩余 5 条且无游标', async () => {
    const first = await request(app)
      .get(`/api/v1/rooms/${roomId}/messages?limit=20`)
      .set('Authorization', `Bearer ${user.token}`)
    const cursor = first.body.data.nextCursor
    const res = await request(app)
      .get(`/api/v1/rooms/${roomId}/messages?limit=20&cursor=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${user.token}`)
    expect(res.body.data.messages).toHaveLength(5)
    expect(res.body.data.messages[0].content).toBe('msg-0')
    expect(res.body.data.nextCursor).toBeNull()
  })

  it('非成员访问返回 403', async () => {
    const res = await request(app)
      .get(`/api/v1/rooms/${roomId}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
    expect(res.status).toBe(403)
  })
})
