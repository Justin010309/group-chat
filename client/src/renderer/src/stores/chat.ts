import { create } from 'zustand'
import type { RoomView } from '../api/rooms'
import type { MessageView } from '../api/messages'
import { listRoomsApi } from '../api/rooms'
import { markReadApi } from '../api/rooms'
import { fetchHistoryApi } from '../api/messages'
import { socketService } from '../services/socket'

export type LocalMessage = MessageView & { status?: 'sending' | 'sent' }

interface ChatState {
  rooms: RoomView[]
  activeRoomId: string | null
  messages: Record<string, LocalMessage[]>
  online: Record<string, boolean>
  typing: Record<string, boolean>
  loadRooms: () => Promise<void>
  openRoom: (roomId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  applyMessage: (msg: MessageView) => void
  applyTyping: (roomId: string, uid: string, typing: boolean) => void
  applyPresence: (uid: string, online: boolean) => void
}

function clientMsgId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  online: {},
  typing: {},

  async loadRooms() {
    const rooms = await listRoomsApi()
    set({ rooms })
    socketService.joinRooms(rooms.map((r) => r.id))
  },

  async openRoom(roomId) {
    set({ activeRoomId: roomId })
    const existing = get().messages[roomId]
    if (!existing) {
      const { messages } = await fetchHistoryApi(roomId, null)
      set((s) => ({ messages: { ...s.messages, [roomId]: messages } }))
      const last = messages[messages.length - 1]
      if (last) {
        markReadApi(roomId, last.id)
        set((s) => ({
          rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, unread: 0 } : r))
        }))
      }
    }
  },

  async sendMessage(content) {
    const { activeRoomId } = get()
    if (!activeRoomId) return
    const id = clientMsgId()
    const pending: LocalMessage = {
      id,
      roomId: activeRoomId,
      senderId: 'me',
      senderNickname: '我',
      type: 'text',
      content,
      createdAt: new Date().toISOString(),
      clientMsgId: id,
      status: 'sending',
    }
    set((s) => ({
      messages: { ...s.messages, [activeRoomId]: [...(s.messages[activeRoomId] ?? []), pending] },
    }))
    socketService.sendMessage(activeRoomId, content, id, (res) => {
      if (res.status === 'ok' && res.message) {
        get().applyMessage(res.message)
      }
    })
  },

  applyMessage(msg) {
    set((s) => {
      const roomMsgs = s.messages[msg.roomId] ?? []
      const filtered = roomMsgs.filter(
        (m) => !(m.status === 'sending' && m.clientMsgId && m.clientMsgId === msg.clientMsgId),
      )
      const next = [...filtered, msg]
      const rooms = s.rooms.map((r) =>
        r.id === msg.roomId ? { ...r, lastMessageAt: msg.createdAt } : r,
      )
      return { messages: { ...s.messages, [msg.roomId]: next }, rooms }
    })
  },

  applyTyping(roomId, _uid, typing) {
    if (!typing) {
      set((s) => ({ typing: { ...s.typing, [roomId]: false } }))
      return
    }
    set((s) => ({ typing: { ...s.typing, [roomId]: true } }))
    setTimeout(() => {
      set((s) => ({ typing: { ...s.typing, [roomId]: false } }))
    }, 2000)
  },

  applyPresence(uid, online) {
    set((s) => ({ online: { ...s.online, [uid]: online } }))
  }
}))
