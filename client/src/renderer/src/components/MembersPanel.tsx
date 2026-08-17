import { useEffect, useState } from 'react'
import { Button, Tooltip } from 'antd'
import { TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import { listMembersApi, type MemberView } from '../api/rooms'
import { useChatStore } from '../stores/chat'

export function MembersPanel() {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<MemberView[]>([])
  const activeRoomId = useChatStore((s) => s.activeRoomId)
  const online = useChatStore((s) => s.online)

  useEffect(() => {
    if (open && activeRoomId) listMembersApi(activeRoomId).then(setMembers)
  }, [open, activeRoomId])

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
            <Button size="small" type="text" icon={<UserAddOutlined />} aria-label="邀请成员" />
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
    </div>
  )
}
