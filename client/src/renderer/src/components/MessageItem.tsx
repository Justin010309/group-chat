import { Typography } from 'antd'
import type { LocalMessage } from '../stores/chat'
import { extractUrls } from '../utils/url'
import { LinkCard } from './LinkCard'

export function MessageItem({ message }: { message: LocalMessage }) {
  const mine = message.senderId === 'me'
  const isAi = message.type === 'ai'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div style={{ maxWidth: '70%' }}>
        <div
          style={{
            fontSize: 12,
            color: '#999',
            marginBottom: 2,
            textAlign: mine ? 'right' : 'left',
          }}
        >
          {message.senderNickname}
        </div>
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            background: isAi ? '#7c5cff' : mine ? '#1677ff' : '#f0f0f0',
            color: isAi || mine ? '#fff' : 'inherit',
          }}
        >
          {isAi && (
            <span style={{ fontSize: 11, opacity: 0.85, marginRight: 6 }}>AI 助手</span>
          )}
          <Typography.Text style={{ color: 'inherit' }}>{message.content}</Typography.Text>
          {extractUrls(message.content).map((url) => (
            <div key={url}>
              <LinkCard url={url} />
            </div>
          ))}
          {message.status === 'sending' && (
            <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.7 }}>发送中…</span>
          )}
        </div>
      </div>
    </div>
  )
}
