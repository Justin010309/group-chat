import { useState } from 'react'
import { Button, Tooltip } from 'antd'
import { TeamOutlined } from '@ant-design/icons'

export function MembersPanel() {
  const [open, setOpen] = useState(false)
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
        <div style={{ width: 176, padding: 12, overflow: 'hidden' }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>成员</div>
          <div>（成员列表在 Task 15 接入在线状态）</div>
        </div>
      )}
    </div>
  )
}
