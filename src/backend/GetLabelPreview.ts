import { ipcMain } from 'electron'
import GenerateZPLString from './hooks/GenerateZPLString'
import sharp from 'sharp'

export default function GetLabelPreview(): void {
  ipcMain.handle('get-label-preview', async (_event, { part }) => {
    try {
      if (!part || !part.Label_Format) {
        throw new Error('Invalid part data provided')
      }

      const filledZpl = await GenerateZPLString(part, 1, 'preview')

      const { ready } = await import('zpl-renderer-js')
      const { api } = await ready

      const rawBase64 = await api.zplToBase64Async(filledZpl, 50.6, 50.6, 24)
      const imgBuffer = Buffer.from(rawBase64, 'base64')

      const trimmedBuffer = await sharp(imgBuffer).trim().toBuffer()
      const finalBase64 = trimmedBuffer.toString('base64')

      return {
        status: true,
        data: `data:image/png;base64,${finalBase64}`
      }
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : 'Nie udało się wygenerować podglądu'

      return {
        status: false,
        message: errorMsg,
        data: null
      }
    }
  })
}
