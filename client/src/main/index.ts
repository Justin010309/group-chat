import {
  app,
  shell,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  Notification,
  ipcMain,
  WebContentsView,
  session,
  type BaseWindow,
  type WebContents
} from 'electron'
import { join } from 'path'

let tray: Tray | null = null
let isQuitting = false
let previewView: WebContentsView | null = null
let previewWindow: BaseWindow | null = null

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('GroupChat')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => BrowserWindow.getAllWindows()[0]?.show() },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
}

ipcMain.handle('notify', (_e, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) new Notification({ title, body }).show()
})

ipcMain.handle('set-badge', (_e, count: number) => {
  app.setBadgeCount(count)
  tray?.setToolTip(count > 0 ? `GroupChat · ${count} 条未读` : 'GroupChat')
})

ipcMain.on('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender as WebContents)?.minimize()
})

ipcMain.on('window:close-to-tray', (e) => {
  BrowserWindow.fromWebContents(e.sender as WebContents)?.hide()
})

function layoutPreview(): void {
  if (!previewView || !previewWindow) return
  const b = previewWindow.getContentBounds()
  previewView.setBounds({
    x: 220,
    y: 44,
    width: Math.max(b.width - 220 - 46, 0),
    height: Math.max(b.height - 44 - 52, 0)
  })
}

ipcMain.handle('open-link-preview', async (e, url: string) => {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
  const win = BrowserWindow.fromWebContents(e.sender as WebContents)
  if (!win || previewView) return
  const isolated = session.fromPartition('preview-session')
  isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  previewView = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: isolated
    }
  })
  previewWindow = win
  win.contentView.addChildView(previewView)
  layoutPreview()
  win.on('resize', layoutPreview)
  await previewView.webContents.loadURL(url)
})

ipcMain.handle('close-link-preview', () => {
  if (previewView && previewWindow) {
    previewWindow.contentView.removeChildView(previewView)
    previewView.webContents.close()
    previewView = null
    previewWindow = null
  }
})

ipcMain.handle('preview-navigate', (_e, action: 'back' | 'forward' | 'reload') => {
  const wc = previewView?.webContents
  if (!wc) return
  if (action === 'back') wc.goBack()
  if (action === 'forward') wc.goForward()
  if (action === 'reload') wc.reload()
})

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
