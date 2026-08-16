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
