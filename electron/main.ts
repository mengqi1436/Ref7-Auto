import { app, BrowserWindow, ipcMain, nativeTheme, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc/handlers'
import { initAutoUpdater } from './services/updater'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const isDev = process.env.NODE_ENV === 'development'

function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('REF7 Auto Register')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

function createWindow() {
  const isDark = nativeTheme.shouldUseDarkColors

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: isDark ? '#0B0B10' : '#f8fafc',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:8961')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerWindowHandlers() {
  ipcMain.on('window:minimize', () => mainWindow?.minimize())

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window:close', () => mainWindow?.hide())

  ipcMain.handle('theme:getSystem', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send(
      'theme:systemChanged',
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    )
  })
}

app.whenReady().then(async () => {
  registerWindowHandlers()
  createWindow()
  createTray()
  await registerIpcHandlers(mainWindow!)
  initAutoUpdater(mainWindow!)
})

app.on('window-all-closed', () => {
  // 保持托盘图标运行，不退出应用
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

export { mainWindow }
