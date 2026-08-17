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

    const a = await prisma.user.create({
      data: { username: 't_ma', passwordHash: 'x', nickname: 'MA' }
    })
    const b = await prisma.user.create({
      data: { username: 't_mb', passwordHash: 'x', nickname: 'MB' }
    })
    const room = await prisma.room.create({ data: { name: '消息群', ownerId: a.id } })
    await prisma.roomMember.createMany({
      data: [
        { roomId: room.id, userId: a.id },
        { roomId: room.id, userId: b.id }
      ]
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

  afterAll(() => {
    http.close()
  })

  it('A 发送，B 收到 message:new，ack 返回落库消息', async () => {
    const sockA: Socket = ioc(url, { auth: { token: tokenA }, transports: ['websocket'] })
    const sockB: Socket = ioc(url, { auth: { token: tokenB }, transports: ['websocket'] })

    await Promise.all([
      new Promise<void>((r) => sockA.on('connect', () => r())),
      new Promise<void>((r) => sockB.on('connect', () => r()))
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
        (res: { status: string }) => resolve(res)
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
