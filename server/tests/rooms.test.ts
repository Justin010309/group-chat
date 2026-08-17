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
      data: { username: 't_ra', passwordHash: 'x', nickname: 'RA' }
    })
    const b = await prisma.user.create({
      data: { username: 't_rb', passwordHash: 'x', nickname: 'RB' }
    })
    userA = { id: a.id, token: signToken(a.id) }
    userB = { id: b.id, token: signToken(b.id) }
  })

  afterAll(async () => {
    await prisma.message.deleteMany()
    await prisma.roomMember.deleteMany()
    await prisma.room.deleteMany()
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
