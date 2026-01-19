import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
;(autoUpdater.logger as typeof log).transports.file.level = 'info'
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.disableDifferentialDownload = true

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

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    sendUpdateStatus({ status: 'available', info })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    sendUpdateStatus({ status: 'not-available', info })
  })

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

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    sendUpdateStatus({ status: 'downloaded', info })
  })

  autoUpdater.on('error', (error: Error) => {
    sendUpdateStatus({ status: 'error', error: error.message })
  })

  registerIpcHandlers()
}

function sendUpdateStatus(status: UpdateStatus): void {
  mainWindow?.webContents.send('updater:status', status)
}

function registerIpcHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, updateInfo: result?.updateInfo }
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查更新失败'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载更新失败'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })
}

export { autoUpdater }
