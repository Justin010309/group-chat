import type { ChatAPI } from './index'

declare global {
  interface Window {
    chatAPI: ChatAPI
  }
}

export {}
