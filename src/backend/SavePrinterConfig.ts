import { ipcMain } from 'electron'
import { store, PrinterConfig } from './store'

export default function SavePrinterConfig() {
  ipcMain.handle('save-printer-config', async (_event, config: PrinterConfig) => {
    try {
      if (config.type === 'IP' && (!config.ip || !config.port)) {
        return { status: false, message: 'Błędny adres IP lub port.' }
      }
      if (config.type === 'COM' && !config.comPort) {
        return { status: false, message: 'Nie wybrano portu COM.' }
      }

      console.log('[SavePrinterConfig] Saving:', config)
      store.set('printer', config)
      console.log('[SavePrinterConfig] Saved successfully')

      return { status: true, message: 'Konfiguracja zapisana pomyślnie.' }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Błąd zapisu konfiguracji'
      console.error('[SavePrinterConfig] Error:', errorMsg)
      return { status: false, message: errorMsg || 'Błąd zapisu pliku konfiguracyjnego.' }
    }
  })
}
