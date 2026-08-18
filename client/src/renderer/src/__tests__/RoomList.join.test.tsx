import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomList } from '../components/RoomList'
import { useChatStore } from '../stores/chat'

vi.mock('../services/socket', () => ({
  socketService: { joinRooms: vi.fn(), emitTyping: vi.fn() }
}))

vi.mock('../api/rooms', () => ({
  listRoomsApi: vi.fn(),
  createRoomApi: vi.fn(),
  joinRoomApi: vi.fn(async (roomId: string) => ({
    id: roomId,
    name: '新房间',
    ownerId: 'u1',
    lastMessageAt: null,
    memberCount: 1,
    unread: 0
  })),
  markReadApi: vi.fn(),
  listMembersApi: vi.fn()
}))

describe('RoomList join', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useChatStore.setState({
      rooms: [],
      activeRoomId: null,
      messages: {},
      online: {},
      typing: {},
      aiBuffer: {}
    })
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
  })

  it('输入房间 ID 加入并激活', async () => {
    const { joinRoomApi } = await import('../api/rooms')
    const uuid = '3f2f7c4a-9d1e-4f3b-8a5c-6b7d8e9f0a1b'
    render(
      <AntApp>
        <RoomList />
      </AntApp>
    )
    fireEvent.click(screen.getByRole('button', { name: '加入房间' }))
    const input = screen.getByPlaceholderText(/粘贴邀请链接或输入房间 ID/)
    fireEvent.change(input, {
      target: { value: uuid }
    })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(joinRoomApi).toHaveBeenCalledWith(uuid))
    expect(useChatStore.getState().activeRoomId).toBe(uuid)
  })

  it('粘贴深链自动解析房间 ID', async () => {
    const { joinRoomApi } = await import('../api/rooms')
    const uuid = '3f2f7c4a-9d1e-4f3b-8a5c-6b7d8e9f0a1b'
    render(
      <AntApp>
        <RoomList />
      </AntApp>
    )
    fireEvent.click(screen.getByRole('button', { name: '加入房间' }))
    const input = screen.getByPlaceholderText(/粘贴邀请链接或输入房间 ID/)
    fireEvent.change(input, {
      target: { value: `groupchat://join?roomId=${uuid}` }
    })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(joinRoomApi).toHaveBeenCalledWith(uuid))
  })

  it('复制邀请链接写入剪贴板', async () => {
    useChatStore.setState({
      rooms: [
        { id: 'r1', name: '测试群', ownerId: 'u1', lastMessageAt: null, memberCount: 2, unread: 0 }
      ],
      activeRoomId: null
    })
    render(
      <AntApp>
        <RoomList />
      </AntApp>
    )
    fireEvent.click(screen.getByRole('button', { name: /复制邀请链接/ }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('groupchat://join?roomId=r1')
  })
})
