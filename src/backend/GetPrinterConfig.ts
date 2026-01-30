import { ipcMain } from 'electron'
import { store } from './store'

export default function GetPrinterConfig() {
  ipcMain.handle('get-printer-config', async () => {
    try {
      const config = store.get('printer')
      console.log('[GetPrinterConfig] Retrieved:', config)
      return { status: true, data: config }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Nie udało się odczytać konfiguracji'
      console.error('[GetPrinterConfig] Error:', errorMsg)
      return { status: false, message: errorMsg }
    }
  })
}
