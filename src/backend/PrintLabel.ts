import { ipcMain } from 'electron'
import { store } from './store'
import IpConnection from './PrinterConnections/IpConnection'
import COMConnection from './PrinterConnections/COMConnection'

import GenerateZPLString from './hooks/GenerateZPLString'
import { ConnectionResult } from './utils/PrinterConnectionBase'

export default function SetupLabelHandlers(): void {
  ipcMain.handle('print-label', async (_event, { part, quantity }) => {
    try {
      const printer = store.get('printer')

      const finalZpl = await GenerateZPLString(part, quantity, 'print')

      let response: ConnectionResult

      switch (printer.type) {
        case 'IP':
          if (!printer.ip || !printer.port) throw new Error('Brak konfiguracji IP')
          response = await IpConnection(printer, finalZpl)
          break
        case 'COM':
          if (!printer.comPort) throw new Error('Brak konfiguracji COM')
          response = await COMConnection(printer, finalZpl)
          break
        default:
          throw new Error(`Nieznany typ połączenia: ${printer.type}`)
      }
      return { status: response.status, message: response.message }
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : 'Błąd drukowania'
      return { status: false, message: errorMsg || 'Błąd drukowania' }
    }
  })
}
