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
    const m = await prisma.user.create({
      data: { username: 't_rm', passwordHash: 'x', nickname: 'RM' }
    })
    const o = await prisma.user.create({
      data: { username: 't_ro', passwordHash: 'x', nickname: 'RO' }
    })
    const room = await prisma.room.create({ data: { name: '已读群', ownerId: m.id } })
    await prisma.roomMember.createMany({
      data: [
        { roomId: room.id, userId: m.id },
        { roomId: room.id, userId: o.id }
      ]
    })
    member = { id: m.id, token: signToken(m.id) }
    other = { id: o.id, token: signToken(o.id) }
    roomId = room.id
  })

  afterAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
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
