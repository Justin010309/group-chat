import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '../stores/chat'

describe('ai streaming', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeRoomId: 'r1',
      messages: { r1: [] },
      typing: {},
      aiBuffer: {}
    })
  })

  it('delta 累积为 aiBuffer', () => {
    useChatStore.getState().applyAiDelta('r1', '你')
    useChatStore.getState().applyAiDelta('r1', '好')
    expect(useChatStore.getState().aiBuffer['r1']).toBe('你好')
    expect(useChatStore.getState().typing['r1']).toBe(true)
  })

  it('done 替换为完整消息并清空 buffer', () => {
    const done = {
      id: 'ai-1',
      roomId: 'r1',
      senderId: 'ai',
      senderNickname: 'AI 助手',
      type: 'ai',
      content: '你好',
      createdAt: new Date().toISOString()
    }
    useChatStore.getState().applyAiDone('r1', done)
    const msgs = useChatStore.getState().messages['r1']
    expect(msgs[0].content).toBe('你好')
    expect(useChatStore.getState().aiBuffer['r1']).toBe('')
    expect(useChatStore.getState().typing['r1']).toBe(false)
  })
})
