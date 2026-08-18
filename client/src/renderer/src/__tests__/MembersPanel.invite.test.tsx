import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MembersPanel } from '../components/MembersPanel'
import { useChatStore } from '../stores/chat'

vi.mock('../api/rooms', () => ({
  listMembersApi: vi.fn(async () => []),
  inviteMemberApi: vi.fn(async () => ({
    id: 'r1',
    name: '测试群',
    ownerId: 'u1',
    lastMessageAt: null,
    memberCount: 2,
    unread: 0
  }))
}))

describe('MembersPanel invite', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useChatStore.setState({
      rooms: [],
      activeRoomId: 'r1',
      messages: {},
      online: {},
      typing: {},
      aiBuffer: {}
    })
  })

  it('输入账号邀请成功并刷新成员', async () => {
    const { inviteMemberApi, listMembersApi } = await import('../api/rooms')
    render(
      <AntApp>
        <MembersPanel />
      </AntApp>
    )
    fireEvent.click(screen.getByRole('button', { name: '成员列表' }))
    fireEvent.click(screen.getByRole('button', { name: '邀请成员' }))
    const input = screen.getByPlaceholderText(/输入对方账号/)
    fireEvent.change(input, { target: { value: 'bob' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(inviteMemberApi).toHaveBeenCalledWith('r1', 'bob'))
    await waitFor(() => expect(listMembersApi).toHaveBeenCalled())
  })
})
