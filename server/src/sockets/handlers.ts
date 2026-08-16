import type { Server, Socket } from 'socket.io'
import { presenceService } from '../services/presence.service'

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

  socket.on('disconnect', () => {
    presenceService.offline(uid, socket.id)
    io.emit('presence:changed', { uid, online: presenceService.isOnline(uid) })
  })
}
