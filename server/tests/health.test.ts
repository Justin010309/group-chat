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
