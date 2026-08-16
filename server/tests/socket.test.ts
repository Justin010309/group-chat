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
