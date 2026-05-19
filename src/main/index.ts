import { app, shell, BrowserWindow, ipcMain, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { CommonWindowEvent } from './commonWindowEvent'

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
import { startExpressServer, stopExpressServer, createUploadDirectory } from './server'
import path from 'path'

//暂时解决同源策略，有跨域攻击隐患
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { secure: false, standard: true, supportFetchAPI: true }
  }
])


createUploadDirectory(process.env.NODE_ENV)

// 添加单实例检查
const isSingleInstance = app.requestSingleInstanceLock()
if (!isSingleInstance) {
  app.quit()
  process.exit(0)
}
//处理应用程序单实例机制，当第二个实例启动时触发，将焦点切换到第一个实例
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

let mainWindow: BrowserWindow = null!
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth:688,
    minHeight: 488,
    icon: path.join(__dirname, '../../resources/icon.png'),
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: false,
      nodeIntegration: true,
      webviewTag: true
    },
    frame: false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    try {
      startExpressServer()
    } catch (error) {
      console.log(error)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('window-drag', (_event, pos) => {
    mainWindow &&
      mainWindow.setBounds({
        x: pos.posX,
        y: pos.posY,
        width: pos.width,
        height: pos.height
      })
  })
  ipcMain.on('reload', () => {
    mainWindow &&
      mainWindow.reload()
  })

  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

CommonWindowEvent.listen()

app.on('window-all-closed', () => {
  stopExpressServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
