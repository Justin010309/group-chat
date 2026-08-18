import { useEffect, useState } from 'react'
import { Button, Layout } from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  CloseOutlined
} from '@ant-design/icons'
import type { MessageView } from '../api/messages'
import { RoomList } from '../components/RoomList'
import { MessageList } from '../components/MessageList'
import { MembersPanel } from '../components/MembersPanel'
import { useChatStore } from '../stores/chat'
import { socketService } from '../services/socket'
import { useSessionStore } from '../stores/session'

export function Chat() {
  const token = useSessionStore((s) => s.token)!
  const loadRooms = useChatStore((s) => s.loadRooms)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    const open = () => setPreviewOpen(true)
    window.addEventListener('gc:preview-open', open)
    return () => window.removeEventListener('gc:preview-open', open)
  }, [])

  useEffect(() => {
    const offInvite = window.chatAPI?.onInviteLink?.((roomId: string) => {
      window.dispatchEvent(new CustomEvent('gc:invite-open', { detail: { roomId } }))
    })
    socketService.connect(token)
    const onMessage = (msg: MessageView) => {
      useChatStore.getState().applyMessage(msg)
      const active = useChatStore.getState().activeRoomId
      const totalUnread = useChatStore
        .getState()
        .rooms.reduce((sum, r) => sum + (r.id === active ? 0 : r.unread), 0)
      if (msg.roomId !== active) {
        window.chatAPI?.notify(msg.senderNickname, msg.content)
      }
      window.chatAPI?.setBadge(totalUnread)
    }
    socketService.onMessageNew(onMessage)
    socketService.onTyping(({ roomId, uid, typing }) => {
      useChatStore.getState().applyTyping(roomId, uid, typing)
    })
    socketService.onAiDelta(({ roomId, content }) =>
      useChatStore.getState().applyAiDelta(roomId, content)
    )
    socketService.onAiDone(({ roomId, message }) => {
      if (message) useChatStore.getState().applyAiDone(roomId, message)
      else useChatStore.getState().applyTyping(roomId, 'ai', false)
    })
    socketService.onPresenceChanged(({ uid, online }) => {
      useChatStore.getState().applyPresence(uid, online)
    })
    loadRooms()
    return () => {
      offInvite?.()
      socketService.disconnect()
    }
  }, [token, loadRooms])

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Sider width={220} theme="light">
        <RoomList />
      </Layout.Sider>
      <Layout.Content>
        {previewOpen && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: '6px 12px',
              borderBottom: '1px solid #eee'
            }}
          >
            <Button
              size="small"
              icon={<ArrowLeftOutlined />}
              onClick={() => window.chatAPI?.previewNavigate('back')}
              aria-label="后退"
            />
            <Button
              size="small"
              icon={<ArrowRightOutlined />}
              onClick={() => window.chatAPI?.previewNavigate('forward')}
              aria-label="前进"
            />
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => window.chatAPI?.previewNavigate('reload')}
              aria-label="刷新"
            />
            <span style={{ flex: 1, fontSize: 12, color: '#999' }}>
              链接预览 · 独立 Session
            </span>
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={() => {
                window.chatAPI?.closeLinkPreview()
                setPreviewOpen(false)
              }}
              aria-label="关闭预览"
            />
          </div>
        )}
        <MessageList />
      </Layout.Content>
      <MembersPanel />
    </Layout>
  )
}
