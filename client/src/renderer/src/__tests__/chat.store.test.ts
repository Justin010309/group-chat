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
  ]),
  createRoomApi: vi.fn(async (name: string) => ({
    id: 'r2',
    name,
    ownerId: 'u1',
    lastMessageAt: null,
    memberCount: 1,
    unread: 0
  }))
}))

describe('chat store', () => {
  beforeEach(() => {
    useChatStore.setState({ rooms: [], activeRoomId: null, messages: {}, online: {}, typing: {} })
  })

  it('loadRooms 填充房间列表', async () => {
    await useChatStore.getState().loadRooms()
    expect(useChatStore.getState().rooms).toHaveLength(1)
  })

  it('createRoom 新建并激活房间', async () => {
    await useChatStore.getState().createRoom('新群')
    const s = useChatStore.getState()
    expect(s.rooms[0].name).toBe('新群')
    expect(s.activeRoomId).toBe('r2')
  })

  it('sendMessage 先入 pending 列表', async () => {
    useChatStore.setState({ activeRoomId: 'r1', messages: { r1: [] } })
    await useChatStore.getState().sendMessage('hello')
    const list = useChatStore.getState().messages['r1']
    expect(list[0].status).toBe('sending')
  })

  it('applyMessage 重复到达只保留一条', () => {
    useChatStore.setState({ activeRoomId: 'r1', messages: { r1: [] } })
    const msg = {
      id: 'm1',
      roomId: 'r1',
      senderId: 'u1',
      senderNickname: 'A',
      type: 'text',
      content: 'hi',
      createdAt: new Date().toISOString()
    }
    const store = useChatStore.getState()
    store.applyMessage(msg)
    store.applyMessage(msg)
    expect(useChatStore.getState().messages['r1']).toHaveLength(1)
  })
})
