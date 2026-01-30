import { Socket } from 'net'
import { store } from './store'
import { SerialPort } from 'serialport'
import { ipcMain } from 'electron'

interface PrinterConfig {
  type: 'IP' | 'COM'
  ip?: string
  port?: number
  comPort?: string
}

export default async function IsOnline() {
  ipcMain.handle('Get-PrinterStatus', async () => {
    try {
      const config = store.get('printer') as PrinterConfig

      if (!config || !config.type) {
        throw new Error('Brak konfiguracji drukarki')
      }

      if (config.type === 'IP') {
        return new Promise((resolve) => {
          const socket = new Socket()

          socket.setTimeout(3000)

          socket.connect(config.port!, config.ip!, () => {
            socket.end()
            resolve({ status: true, message: 'Połączono z drukarką (IP).' })
          })

          socket.on('error', (err) => {
            socket.destroy()
            resolve({ status: false, message: `Błąd połączenia: ${err.message}` })
          })

          socket.on('timeout', () => {
            socket.destroy()
            resolve({ status: false, message: 'Upłynął limit czasu połączenia (Timeout).' })
          })
        })
      } else {
        if (!config.comPort) {
          return { status: false, message: 'Brak wybranego portu COM' }
        }

        return new Promise((resolve) => {
          const port = new SerialPort({ path: config.comPort!, baudRate: 9600, autoOpen: false })
          port.open((err) => {
            if (err) {
              resolve({ status: false, message: `Nie można otworzyć portu: ${err.message}` })
            } else {
              port.write('', (err) => {
                if (err) {
                  port.close()
                  resolve({ status: false, message: 'Błąd zapisu na COM: ' + err.message })
                } else {
                  port.drain(() => {
                    port.close()
                    resolve({ status: true, message: 'Wysłano etykietę testową (COM).' })
                  })
                }
              })
            }
          })
        })
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      return { status: false, message: errMsg }
    }
  })
}
