import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { verifyToken } from '../utils/jwt'
import { registerHandlers } from './handlers'

export function initSocket(server: HttpServer): Server {
  const io = new Server(server, { cors: { origin: true, credentials: true } })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('UNAUTHORIZED'))
    try {
      socket.data.uid = verifyToken(token).uid
      next()
    } catch {
      next(new Error('UNAUTHORIZED'))
    }
  })

  io.on('connection', (socket) => registerHandlers(io, socket))
  return io
}
