import { useState } from 'react'
import { Button, Badge, Typography, Modal, Input } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useChatStore } from '../stores/chat'

export function RoomList() {
  const rooms = useChatStore((s) => s.rooms)
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const openRoom = useChatStore((s) => s.openRoom)
  const createRoom = useChatStore((s) => s.createRoom)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await createRoom(name.trim())
      setModalOpen(false)
      setName('')
    } finally {
      setLoading(false)
    }
  }

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
        <Button
          size="small"
          type="text"
          icon={<PlusOutlined />}
          aria-label="新建房间"
          onClick={() => setModalOpen(true)}
        />
      </div>
      {rooms.map((room) => (
        <div
          key={room.id}
          onClick={() => openRoom(room.id)}
          style={{
            cursor: 'pointer',
            borderRadius: 8,
            background: room.id === activeRoomId ? '#e6f4ff' : undefined,
            padding: '8px 10px',
            marginBottom: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text>{room.name}</Typography.Text>
            {room.unread > 0 && <Badge count={room.unread} />}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {room.memberCount} 人
          </Typography.Text>
        </div>
      ))}
      <Modal
        title="新建房间"
        open={modalOpen}
        onOk={submit}
        confirmLoading={loading}
        onCancel={() => setModalOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="房间名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={submit}
        />
      </Modal>
    </div>
  )
}
