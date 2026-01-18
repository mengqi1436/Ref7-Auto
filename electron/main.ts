import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development'

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
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 窗口控制
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })

  // 获取系统主题
  ipcMain.handle('theme:getSystem', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  // 监听系统主题变化
  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('theme:systemChanged', 
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    )
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  createWindow()
  await registerIpcHandlers(mainWindow!)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 导出以供其他模块使用
export { mainWindow }
