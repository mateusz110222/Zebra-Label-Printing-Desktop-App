import { ipcMain } from 'electron'

export default function GetLabelsFormats() {
  ipcMain.handle('GetLabelsFormats', async () => {
    return { status: true }
  })
}
