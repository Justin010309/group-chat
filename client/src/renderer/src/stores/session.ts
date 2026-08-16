import { create } from 'zustand'
import type { SafeUser } from '../api/auth'

interface SessionState {
  token: string | null
  user: SafeUser | null
  setSession: (token: string, user: SafeUser) => void
  logout: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  token: localStorage.getItem('gc_token'),
  user: null,
  setSession: (token, user) => {
    localStorage.setItem('gc_token', token)
    set({ token, user })
  },
  logout: () => {
    localStorage.removeItem('gc_token')
    set({ token: null, user: null })
  }
}))
