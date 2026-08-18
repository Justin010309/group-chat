import { useEffect, useState } from 'react'
import { Button, Badge, Typography, Modal, Input, App as AntApp } from 'antd'
import { PlusOutlined, UserAddOutlined, LinkOutlined } from '@ant-design/icons'
import { useChatStore } from '../stores/chat'
import { buildInviteLink, parseJoinInput } from '../utils/url'

export function RoomList() {
  const rooms = useChatStore((s) => s.rooms)
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const openRoom = useChatStore((s) => s.openRoom)
  const createRoom = useChatStore((s) => s.createRoom)
  const joinRoom = useChatStore((s) => s.joinRoom)
  const { message } = AntApp.useApp()
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinInput, setJoinInput] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)

  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<{ roomId?: string }>).detail
      setJoinInput(detail?.roomId ?? '')
      setJoinOpen(true)
    }
    window.addEventListener('gc:invite-open', open)
    return () => window.removeEventListener('gc:invite-open', open)
  }, [])

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

  const submitJoin = async () => {
    const roomId = parseJoinInput(joinInput)
    if (!roomId) {
      message.warning('请输入有效的房间 ID 或邀请链接')
      return
    }
    setJoinLoading(true)
    try {
      await joinRoom(roomId)
      setJoinOpen(false)
      setJoinInput('')
      message.success('已加入房间')
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'ROOM_NOT_FOUND') message.error('房间不存在')
      else if (code === 'ALREADY_MEMBER') message.info('你已在房间中')
      else message.error('加入失败，请稍后重试')
    } finally {
      setJoinLoading(false)
    }
  }

  const copyInvite = async (roomId: string) => {
    const link = buildInviteLink(roomId)
    if (window.chatAPI?.copyText) await window.chatAPI.copyText(link)
    else await navigator.clipboard.writeText(link)
    message.success('邀请链接已复制')
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
        <div>
          <Button
            size="small"
            type="text"
            icon={<UserAddOutlined />}
            aria-label="加入房间"
            onClick={() => setJoinOpen(true)}
          />
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            aria-label="新建房间"
            onClick={() => setModalOpen(true)}
          />
        </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {room.unread > 0 && <Badge count={room.unread} />}
              <Button
                size="small"
                type="text"
                icon={<LinkOutlined />}
                aria-label={`复制邀请链接 ${room.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void copyInvite(room.id)
                }}
              />
            </div>
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
      <Modal
        title="加入房间"
        open={joinOpen}
        onOk={submitJoin}
        confirmLoading={joinLoading}
        onCancel={() => setJoinOpen(false)}
        okText="加入"
        cancelText="取消"
      >
        <Input
          placeholder="粘贴邀请链接或输入房间 ID"
          value={joinInput}
          onChange={(e) => setJoinInput(e.target.value)}
          onPressEnter={submitJoin}
        />
      </Modal>
    </div>
  )
}
