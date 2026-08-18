import { create } from 'zustand'
import type { RoomView } from '../api/rooms'
import type { MessageView } from '../api/messages'
import {
  listRoomsApi,
  createRoomApi,
  joinRoomApi,
  inviteMemberApi,
  markReadApi
} from '../api/rooms'
import { fetchHistoryApi } from '../api/messages'
import { socketService } from '../services/socket'

export type LocalMessage = MessageView & { status?: 'sending' | 'sent' }

interface ChatState {
  rooms: RoomView[]
  activeRoomId: string | null
  messages: Record<string, LocalMessage[]>
  online: Record<string, boolean>
  typing: Record<string, boolean>
  aiBuffer: Record<string, string>
  loadRooms: () => Promise<void>
  createRoom: (name: string) => Promise<RoomView>
  joinRoom: (roomId: string) => Promise<void>
  inviteMember: (roomId: string, username: string) => Promise<void>
  openRoom: (roomId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  applyMessage: (msg: MessageView) => void
  applyTyping: (roomId: string, uid: string, typing: boolean) => void
  applyPresence: (uid: string, online: boolean) => void
  applyAiDelta: (roomId: string, content: string) => void
  applyAiDone: (roomId: string, message: MessageView) => void
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
  aiBuffer: {},

  async loadRooms() {
    const rooms = await listRoomsApi()
    set({ rooms })
    socketService.joinRooms(rooms.map((r) => r.id))
  },

  async createRoom(name) {
    const room = await createRoomApi(name)
    set((s) => ({
      rooms: [room, ...s.rooms],
      activeRoomId: room.id,
      messages: { ...s.messages, [room.id]: [] }
    }))
    socketService.joinRooms([room.id])
    return room
  },

  async joinRoom(roomId) {
    try {
      const room = await joinRoomApi(roomId)
      set((s) => ({
        rooms: [room, ...s.rooms.filter((r) => r.id !== room.id)],
        activeRoomId: room.id,
        messages: { ...s.messages, [room.id]: s.messages[room.id] ?? [] }
      }))
      socketService.joinRooms([room.id])
    } catch (e) {
      const err = e as { code?: string }
      if (err.code === 'ALREADY_MEMBER') {
        let room = get().rooms.find((r) => r.id === roomId)
        if (!room) {
          await get().loadRooms()
          room = get().rooms.find((r) => r.id === roomId)
        }
        if (room) {
          set({ activeRoomId: room.id })
          socketService.joinRooms([roomId])
        }
        return
      }
      throw e
    }
  },

  async inviteMember(roomId, username) {
    await inviteMemberApi(roomId, username)
    await get().loadRooms()
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
      const withoutPending = roomMsgs.filter(
        (m) => !(m.status === 'sending' && m.clientMsgId && m.clientMsgId === msg.clientMsgId),
      )
      if (withoutPending.some((m) => m.id === msg.id)) {
        return {
          messages: { ...s.messages, [msg.roomId]: withoutPending },
          rooms: s.rooms.map((r) =>
            r.id === msg.roomId ? { ...r, lastMessageAt: msg.createdAt } : r
          )
        }
      }
      const next = [...withoutPending, msg]
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
  },

  applyAiDelta(roomId, content) {
    set((s) => ({
      aiBuffer: { ...s.aiBuffer, [roomId]: (s.aiBuffer[roomId] ?? '') + content },
      typing: { ...s.typing, [roomId]: true }
    }))
  },

  applyAiDone(roomId, message) {
    set((s) => ({
      aiBuffer: { ...s.aiBuffer, [roomId]: '' },
      typing: { ...s.typing, [roomId]: false },
      messages: {
        ...s.messages,
        [roomId]: [...(s.messages[roomId] ?? []), message]
      }
    }))
  }
}))
