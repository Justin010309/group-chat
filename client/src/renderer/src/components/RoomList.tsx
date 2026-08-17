import { Button, Badge, List, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useChatStore } from '../stores/chat'

export function RoomList() {
  const rooms = useChatStore((s) => s.rooms)
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const openRoom = useChatStore((s) => s.openRoom)

  return (
    <div style={{ padding: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <Typography.Text strong>房间</Typography.Text>
        <Button size="small" type="text" icon={<PlusOutlined />} aria-label="新建房间" />
      </div>
      <List
        size="small"
        dataSource={rooms}
        renderItem={(room) => (
          <List.Item
            onClick={() => openRoom(room.id)}
            style={{
              cursor: 'pointer',
              borderRadius: 8,
              background: room.id === activeRoomId ? '#e6f4ff' : undefined,
              padding: '8px 10px',
            }}
          >
            <List.Item.Meta
              title={<Typography.Text>{room.name}</Typography.Text>}
              description={`${room.memberCount} 人`}
            />
            {room.unread > 0 && <Badge count={room.unread} />}
          </List.Item>
        )}
      />
    </div>
  )
}
