import { useEffect } from 'react'
import { Layout } from 'antd'
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
    const onMessage = useChatStore.getState().applyMessage
    socketService.onMessageNew(onMessage)
    socketService.onPresenceChanged(({ uid, online }) => {
      useChatStore.setState((s) => ({ online: { ...s.online, [uid]: online } }))
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
