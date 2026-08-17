import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MessageList } from '../components/MessageList'
import { useChatStore } from '../stores/chat'

vi.mock('../services/socket', () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    joinRooms: vi.fn(),
    sendMessage: vi.fn(),
    emitTyping: vi.fn(),
    onMessageNew: vi.fn(),
    onPresenceChanged: vi.fn(),
    onTyping: vi.fn()
  }
}))

describe('MessageList virtualization', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 600
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 400
    })
    const big = Array.from({ length: 500 }, (_, i) => ({
      id: `m${i}`,
      roomId: 'r1',
      senderId: 'u1',
      senderNickname: `用户${i}`,
      type: 'text',
      content: `消息 ${i}`,
      createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString()
    }))
    useChatStore.setState({ activeRoomId: 'r1', messages: { r1: big } })
  })

  it('只挂载可见区附近的消息节点', () => {
    render(<MessageList />)
    const count = document.querySelectorAll('[data-testid="message-item"]').length
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(80)
  })
})
