import type { Server, Socket } from 'socket.io'
import { presenceService } from '../services/presence.service'
import { roomService } from '../services/room.service'
import { messageService } from '../services/message.service'

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
      io.to(`room:${roomId}`).emit('message:new', message)
      ack?.({ status: 'ok', message })
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
