import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChatStore } from '../stores/chat'

describe('typing & presence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useChatStore.setState({ typing: {}, online: {} })
  })
  afterEach(() => vi.useRealTimers())

  it('applyTyping 置位并 2 秒后清除', () => {
    useChatStore.getState().applyTyping('r1', 'u1', true)
    expect(useChatStore.getState().typing['r1']).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(useChatStore.getState().typing['r1']).toBe(false)
  })

  it('applyPresence 更新在线表', () => {
    useChatStore.getState().applyPresence('u1', true)
    expect(useChatStore.getState().online['u1']).toBe(true)
  })
})
