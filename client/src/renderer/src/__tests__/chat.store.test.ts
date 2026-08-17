import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChatStore } from '../stores/chat'

vi.mock('../services/socket', () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    joinRooms: vi.fn(),
    sendMessage: vi.fn(),
    onMessageNew: vi.fn(),
    onPresenceChanged: vi.fn(),
    onTyping: vi.fn()
  }
}))

vi.mock('../api/rooms', () => ({
  listRoomsApi: vi.fn(async () => [
    { id: 'r1', name: '测试群', ownerId: 'u1', lastMessageAt: null, memberCount: 2, unread: 0 }
  ])
}))

describe('chat store', () => {
  beforeEach(() => {
    useChatStore.setState({ rooms: [], activeRoomId: null, messages: {}, online: {}, typing: {} })
  })

  it('loadRooms 填充房间列表', async () => {
    await useChatStore.getState().loadRooms()
    expect(useChatStore.getState().rooms).toHaveLength(1)
  })

  it('sendMessage 先入 pending 列表', async () => {
    useChatStore.setState({ activeRoomId: 'r1', messages: { r1: [] } })
    await useChatStore.getState().sendMessage('hello')
    const list = useChatStore.getState().messages['r1']
    expect(list[0].status).toBe('sending')
  })
})
