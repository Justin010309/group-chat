import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { Login } from '../pages/Login'
import { useSessionStore } from '../stores/session'

vi.mock('../api/auth', () => ({
  loginApi: vi.fn(async () => ({
    user: { id: 'u1', username: 'alice', nickname: 'Alice' },
    token: 'jwt-token',
  })),
}))

describe('Login', () => {
  beforeEach(() => {
    localStorage.clear()
    useSessionStore.setState({ token: null, user: null })
  })

  it('提交后写入会话', async () => {
    render(
      <AntApp>
        <Login onSuccess={() => {}} />
      </AntApp>
    )
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pass1234' } })
    fireEvent.click(screen.getByRole('button', { name: '登 录' }))
    await waitFor(() => {
      expect(useSessionStore.getState().token).toBe('jwt-token')
    })
  })
})
