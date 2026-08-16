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
