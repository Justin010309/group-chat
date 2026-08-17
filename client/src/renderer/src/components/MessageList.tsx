import { Input, Button } from 'antd'
import { SendOutlined, SmileOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useChatStore } from '../stores/chat'
import { MessageItem } from './MessageItem'

export function MessageList() {
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const messages = useChatStore((s) => (activeRoomId ? s.messages[activeRoomId] ?? [] : []))
  const sendMessage = useChatStore((s) => s.sendMessage)
  const [text, setText] = useState('')

  const submit = () => {
    if (!text.trim()) return
    sendMessage(text.trim())
    setText('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {activeRoomId ? (
          messages.map((m) => <MessageItem key={m.id} message={m} />)
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
          onChange={(e) => setText(e.target.value)}
          onPressEnter={submit}
          placeholder="输入消息，@ 唤起 AI 助手…"
        />
        <Button type="primary" icon={<SendOutlined />} onClick={submit} aria-label="发送" />
      </div>
    </div>
  )
}
