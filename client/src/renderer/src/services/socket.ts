import { io, type Socket } from 'socket.io-client'
import type { MessageView } from '../api/messages'

class SocketService {
  private socket: Socket | null = null

  connect(token: string): void {
    this.socket = io('ws://localhost:3001', {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    })
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
  }

  joinRooms(roomIds: string[]): void {
    this.socket?.emit('room:join', roomIds)
  }

  sendMessage(
    roomId: string,
    content: string,
    clientMsgId: string,
    cb: (res: { status: string; message?: MessageView }) => void,
  ): void {
    this.socket?.emit('message:send', { roomId, content, clientMsgId }, cb)
  }

  emitTyping(roomId: string, typing: boolean): void {
    this.socket?.emit('typing', { roomId, typing })
  }

  onMessageNew(cb: (msg: MessageView) => void): void {
    this.socket?.on('message:new', cb)
  }

  onPresenceChanged(cb: (p: { uid: string; online: boolean }) => void): void {
    this.socket?.on('presence:changed', cb)
  }

  onTyping(cb: (p: { roomId: string; uid: string; typing: boolean }) => void): void {
    this.socket?.on('typing', cb)
  }

  onAiDelta(cb: (p: { roomId: string; content: string }) => void): void {
    this.socket?.on('ai:delta', cb)
  }

  onAiDone(cb: (p: { roomId: string; message: MessageView | null }) => void): void {
    this.socket?.on('ai:done', cb)
  }
}

export const socketService = new SocketService()
