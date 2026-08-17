import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Input, Button } from 'antd'
import { SendOutlined, SmileOutlined } from '@ant-design/icons'
import { useChatStore } from '../stores/chat'
import { socketService } from '../services/socket'
import { MessageItem } from './MessageItem'

export function MessageList() {
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const messages = useChatStore((s) => (activeRoomId ? s.messages[activeRoomId] ?? [] : []))
  const sendMessage = useChatStore((s) => s.sendMessage)
  const typing = useChatStore((s) => (activeRoomId ? s.typing[activeRoomId] : false))
  const aiBuffer = useChatStore((s) => (activeRoomId ? s.aiBuffer[activeRoomId] ?? '' : ''))
  const [text, setText] = useState('')
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
    initialRect: { width: 400, height: 600 }
  })

  const submit = () => {
    if (!text.trim()) return
    sendMessage(text.trim())
    if (activeRoomId) socketService.emitTyping(activeRoomId, false)
    setText('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={parentRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {activeRoomId ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => (
              <div
                key={messages[vi.index].id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`
                }}
              >
                <div data-testid="message-item">
                  <MessageItem message={messages[vi.index]} />
                </div>
              </div>
            ))}
            {typing && (
              <div style={{ color: '#999', fontSize: 13, padding: '4px 2px' }}>
                AI 助手：{aiBuffer}
                <span style={{ marginLeft: 4 }}>▍</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 80 }}>
            选择一个房间开始聊天
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eee' }}>
        <Button type="text" icon={<SmileOutlined />} aria-label="表情" />
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (activeRoomId) socketService.emitTyping(activeRoomId, true)
          }}
          onPressEnter={submit}
          placeholder="输入消息，@ 唤起 AI 助手…"
        />
        <Button type="primary" icon={<SendOutlined />} onClick={submit} aria-label="发送" />
      </div>
    </div>
  )
}
