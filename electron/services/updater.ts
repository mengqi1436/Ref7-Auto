import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'

// 配置日志
autoUpdater.logger = log
;(autoUpdater.logger as typeof log).transports.file.level = 'info'

// 禁用自动下载，让用户确认后再下载
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let mainWindow: BrowserWindow | null = null

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  info?: UpdateInfo
  progress?: {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
  }
  error?: string
}

export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  // 检查更新时
  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ status: 'checking' })
  })

  // 有可用更新
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    sendUpdateStatus({ status: 'available', info })
  })

  // 没有可用更新
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    sendUpdateStatus({ status: 'not-available', info })
  })

  // 下载进度
  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      status: 'downloading',
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      }
    })
  })

  // 下载完成
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    sendUpdateStatus({ status: 'downloaded', info })
  })

  // 错误处理
  autoUpdater.on('error', (error: Error) => {
    sendUpdateStatus({ status: 'error', error: error.message })
  })

  // 注册 IPC 处理器
  registerIpcHandlers()
}

function sendUpdateStatus(status: UpdateStatus): void {
  mainWindow?.webContents.send('updater:status', status)
}

function registerIpcHandlers(): void {
  // 检查更新
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, updateInfo: result?.updateInfo }
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查更新失败'
      return { success: false, error: message }
    }
  })

  // 开始下载更新
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载更新失败'
      return { success: false, error: message }
    }
  })

  // 安装更新并重启
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })
}

export { autoUpdater }
