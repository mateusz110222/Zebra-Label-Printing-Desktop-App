import { SerialPort } from 'serialport'
import {
  PrinterConnectionBase,
  ConnectionResult,
  PrinterConfig
} from '../utils/PrinterConnectionBase'

class COMConnectionImpl extends PrinterConnectionBase {
  constructor(config: PrinterConfig, label: string) {
    super(config, label)
  }

  validate(): boolean {
    return !!(this.config.comPort && this.config.comPort.trim().length > 0)
  }

  getConnectionTypeName(): string {
    return 'COM Connection'
  }

  async connect(): Promise<ConnectionResult> {
    const comPortName = (this.config.comPort || '').trim().toUpperCase()

    if (!comPortName) {
      return {
        status: false,
        message: 'Brak skonfigurowanego portu COM'
      }
    }

    try {
      const ports = await SerialPort.list()
      const portInfo = ports.find(
        (p) => p.path.toUpperCase() === comPortName || p.path.toUpperCase().includes(comPortName)
      )

      if (!portInfo) {
        const availablePorts = ports.map((p) => p.path).join(', ') || 'brak'
        return {
          status: false,
          message: `Port ${comPortName} nie znaleziony. Dostępne: [${availablePorts}]`
        }
      }

      return new Promise((resolve) => {
        const port = new SerialPort({
          path: portInfo.path,
          baudRate: 9600,
          autoOpen: false
        })

        port.on('error', () => {
          if (port.isOpen) {
            port.close(() => {})
          }
        })

        port.open((err) => {
          if (err) {
            const msg = err.message.includes('Access denied')
              ? `Port ${portInfo.path} jest zajęty przez inny program.`
              : `Błąd otwarcia portu: ${err.message}`

            resolve({ status: false, message: msg })
            return
          }

          port.write(this.label, (err) => {
            if (err) {
              port.close(() => {
                resolve({
                  status: false,
                  message: 'Błąd zapisu na COM: ' + err.message
                })
              })
            } else {
              port.drain(() => {
                port.close(() => {
                  resolve({
                    status: true,
                    message: 'label_sent_successfully'
                  })
                })
              })
            }
          })
        })
      })
    } catch (error: any) {
      throw new Error('Krytyczny błąd SerialPort: ' + (error?.message || String(error)))
    }
  }
}

export default function COMConnection(
  config: PrinterConfig,
  label: string
): Promise<ConnectionResult> {
  const connection = new COMConnectionImpl(config, label)
  return connection.execute()
}
