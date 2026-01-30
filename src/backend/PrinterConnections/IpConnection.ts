import net from 'net'
import {
  PrinterConnectionBase,
  ConnectionResult,
  PrinterConfig
} from '../utils/PrinterConnectionBase'

class IpConnectionImpl extends PrinterConnectionBase {
  constructor(config: PrinterConfig, label: string) {
    super(config, label)
  }

  validate(): boolean {
    return !!(
      this.config.ip &&
      this.config.port &&
      this.config.port > 0 &&
      this.config.port < 65536
    )
  }

  getConnectionTypeName(): string {
    return 'IP Connection'
  }

  async connect(): Promise<ConnectionResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(3000)

      const responseTimeout = setTimeout(() => {
        socket.destroy()
        resolve({
          status: false,
          message: 'Drukarka nie przysłała potwierdzenia w czasie 5s (Timeout)'
        })
      }, 5000)

      socket.connect(this.config.port!, this.config.ip!, () => {
        socket.write(this.label, 'utf8', (err) => {
          if (err) {
            clearTimeout(responseTimeout)
            socket.destroy()
            resolve({
              status: false,
              message: 'Błąd wysyłania danych: ' + err.message
            })
          }
        })
      })

      socket.on('data', (data) => {
        const response = data.toString()
        console.log('Odpowiedź drukarki:', response)

        if (response.includes('LABEL_VERIFICATION') || response.length > 0) {
          clearTimeout(responseTimeout)
          socket.destroy()

          resolve({
            status: true,
            message: 'Potwierdzono wydruk: ' + response
          })
        }
      })

      socket.on('error', (err) => {
        socket.destroy()
        resolve({
          status: false,
          message: `Błąd połączenia: ${err.message}`
        })
      })

      socket.on('timeout', () => {
        socket.destroy()
        resolve({
          status: false,
          message: 'Upłynął limit czasu połączenia (Timeout).'
        })
      })
    })
  }
}

export default function IpConnection(
  config: PrinterConfig,
  label: string
): Promise<ConnectionResult> {
  const connection = new IpConnectionImpl(config, label)
  return connection.execute()
}
