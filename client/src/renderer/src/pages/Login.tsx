import { useState } from 'react'
import { Button, Form, Input, Typography, App as AntApp } from 'antd'
import { loginApi } from '../api/auth'
import { useSessionStore } from '../stores/session'

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const setSession = useSessionStore((s) => s.setSession)
  const { message } = AntApp.useApp()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const { user, token } = await loginApi(values)
      setSession(token, user)
      onSuccess()
    } catch {
      message.error('账号或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto' }}>
      <Typography.Title level={3} style={{ textAlign: 'center' }}>
        GroupChat
      </Typography.Title>
      <Form layout="vertical" onFinish={onFinish}>
        <Form.Item label="账号" name="username" rules={[{ required: true, message: '请输入账号' }]}>
          <Input autoComplete="username" />
        </Form.Item>
        <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          登 录
        </Button>
      </Form>
    </div>
  )
}
