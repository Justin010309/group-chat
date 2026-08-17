import type { Server, Socket } from 'socket.io'
import { presenceService } from '../services/presence.service'
import { roomService } from '../services/room.service'
import { messageService } from '../services/message.service'
import { streamAiReply } from '../services/ai.service'

async function getOrCreateAiBot() {
  const { prisma } = await import('../utils/prisma')
  const existing = await prisma.user.findUnique({ where: { username: 'ai-assistant' } })
  if (existing) return existing
  return prisma.user.create({
    data: { username: 'ai-assistant', passwordHash: 'x', nickname: 'AI 助手' }
  })
}

async function handleAiReply(io: Server, roomId: string, prompt: string): Promise<void> {
  try {
    const bot = await getOrCreateAiBot()
    const recent = await messageService.history(roomId, null, 10)
    const context = recent.messages.map((m) => ({
      role: m.senderId === bot.id ? ('assistant' as const) : ('user' as const),
      content: m.content
    }))
    const full = await streamAiReply(
      {
        baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
        apiKey: process.env.AI_API_KEY || '',
        model: process.env.AI_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是群聊里的 AI 助手，用中文简洁回答。' },
          ...context
        ]
      },
      (delta) => io.to(`room:${roomId}`).emit('ai:delta', { roomId, content: delta })
    )
    const message = await messageService.send(
      roomId,
      bot.id,
      full,
      `ai_${Date.now()}_${roomId}`,
      'ai'
    )
    io.to(`room:${roomId}`).emit('ai:done', { roomId, message })
  } catch {
    io.to(`room:${roomId}`).emit('ai:done', {
      roomId,
      message: null,
      error: 'AI 暂时无法回复'
    })
  }
}

export function registerHandlers(io: Server, socket: Socket): void {
  const uid = socket.data.uid as string
  presenceService.online(uid, socket.id)
  socket.join(`user:${uid}`)
  io.emit('presence:changed', { uid, online: true })

  socket.on('room:join', (roomIds: string[]) => {
    const ids = Array.isArray(roomIds) ? roomIds : []
    ids.forEach((rid) => socket.join(`room:${rid}`))
    socket.emit('room:joined', { roomIds: ids })
  })

  socket.on('message:send', async (payload, ack) => {
    const roomId = payload?.roomId as string
    const content = String(payload?.content ?? '').trim()
    const clientMsgId = payload?.clientMsgId as string | undefined
    if (!roomId || !content) {
      ack?.({ status: 'error', code: 'VALIDATION_ERROR' })
      return
    }
    if (!(await roomService.isMember(roomId, uid))) {
      ack?.({ status: 'error', code: 'FORBIDDEN' })
      return
    }
    try {
      const message = await messageService.send(roomId, uid, content, clientMsgId)
      socket.to(`room:${roomId}`).emit('message:new', message)
      ack?.({ status: 'ok', message })
    if (/@AI|@ai|@ai助手/i.test(content)) {
      void handleAiReply(io, roomId, content)
    }
    } catch {
      ack?.({ status: 'error', code: 'INTERNAL_ERROR' })
    }
  })

  socket.on('typing', (payload: { roomId: string; typing: boolean }) => {
    if (!payload?.roomId) return
    socket.to(`room:${payload.roomId}`).emit('typing', {
      roomId: payload.roomId,
      uid,
      typing: !!payload.typing
    })
  })

  socket.on('disconnect', () => {
    presenceService.offline(uid, socket.id)
    io.emit('presence:changed', { uid, online: presenceService.isOnline(uid) })
  })
}
