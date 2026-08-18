import { contextBridge, ipcRenderer } from 'electron'

const api = {
  notify: (title: string, body: string) => ipcRenderer.invoke('notify', { title, body }),
  setBadge: (count: number) => ipcRenderer.invoke('set-badge', count),
  copyText: (text: string) => ipcRenderer.invoke('copy-text', text),
  openLink: (url: string) => ipcRenderer.invoke('open-link-preview', url),
  closeLinkPreview: () => ipcRenderer.invoke('close-link-preview'),
  previewNavigate: (action: 'back' | 'forward' | 'reload') =>
    ipcRenderer.invoke('preview-navigate', action),
  onInviteLink: (cb: (roomId: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { roomId: string }) =>
      cb(payload.roomId)
    ipcRenderer.on('invite:open', listener)
    return () => ipcRenderer.removeListener('invite:open', listener)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    closeToTray: () => ipcRenderer.send('window:close-to-tray')
  }
}

contextBridge.exposeInMainWorld('chatAPI', api)

export type ChatAPI = typeof api
