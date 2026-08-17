import { useEffect } from 'react'
import { Layout } from 'antd'
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

  useEffect(() => {
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
    socketService.onPresenceChanged(({ uid, online }) => {
      useChatStore.getState().applyPresence(uid, online)
    })
    loadRooms()
    return () => socketService.disconnect()
  }, [token, loadRooms])

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Sider width={220} theme="light">
        <RoomList />
      </Layout.Sider>
      <Layout.Content>
        <MessageList />
      </Layout.Content>
      <MembersPanel />
    </Layout>
  )
}
