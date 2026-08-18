import { useEffect, useState } from 'react'
import { Button, Tooltip, Modal, Input, App as AntApp } from 'antd'
import { TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import { listMembersApi, type MemberView } from '../api/rooms'
import { useChatStore } from '../stores/chat'

export function MembersPanel() {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<MemberView[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const online = useChatStore((s) => s.online)
  const { message } = AntApp.useApp()

  useEffect(() => {
    if (open && activeRoomId) listMembersApi(activeRoomId).then(setMembers)
  }, [open, activeRoomId])

  const submitInvite = async () => {
    if (!inviteUsername.trim() || !activeRoomId) return
    setInviteLoading(true)
    try {
      await useChatStore.getState().inviteMember(activeRoomId, inviteUsername.trim())
      setInviteOpen(false)
      setInviteUsername('')
      if (open) listMembersApi(activeRoomId).then(setMembers)
      message.success('已发送邀请')
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'USER_NOT_FOUND') message.error('用户不存在')
      else if (code === 'ALREADY_MEMBER') message.info('对方已在房间中')
      else if (code === 'FORBIDDEN') message.error('无权邀请')
      else message.error('邀请失败，请稍后重试')
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', borderLeft: '1px solid #eee' }}>
      <div
        style={{
          width: 46,
          paddingTop: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Tooltip title="成员列表" placement="left">
          <Button
            type={open ? 'primary' : 'text'}
            icon={<TeamOutlined />}
            aria-label="成员列表"
            aria-pressed={open}
            onClick={() => setOpen((v) => !v)}
          />
        </Tooltip>
      </div>
      {open && (
        <div style={{ width: 176, padding: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: '#999',
              marginBottom: 8
            }}
          >
            <span>成员 · {members.length}</span>
            <Button
              size="small"
              type="text"
              icon={<UserAddOutlined />}
              aria-label="邀请成员"
              onClick={() => setInviteOpen(true)}
            />
          </div>
          {members.map((m) => (
            <div
              key={m.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: online[m.id] ? '#52c41a' : '#bbb',
                  flex: 'none'
                }}
                aria-label={online[m.id] ? '在线' : '离线'}
              />
              <span>{m.nickname}</span>
            </div>
          ))}
        </div>
      )}
      <Modal
        title="邀请成员"
        open={inviteOpen}
        onOk={submitInvite}
        confirmLoading={inviteLoading}
        onCancel={() => setInviteOpen(false)}
        okText="邀请"
        cancelText="取消"
      >
        <Input
          placeholder="输入对方账号（username）"
          value={inviteUsername}
          onChange={(e) => setInviteUsername(e.target.value)}
          onPressEnter={submitInvite}
        />
      </Modal>
    </div>
  )
}
