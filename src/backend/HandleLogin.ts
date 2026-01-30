import { ipcMain } from 'electron'
import { Client } from 'ldapts'

export default function HandleLogin() {
  ipcMain.handle('handle-login', async (_event, { login, password }) => {
    const ldapUrl = 'ldaps://global.borgwarner.net:3269'

    const client = new Client({
      url: ldapUrl,
      tlsOptions: { rejectUnauthorized: false },
      timeout: 5000
    })

    try {
      await client.bind(login, password)

      const searchBase = 'DC=global,DC=borgwarner,DC=net'

      const { searchEntries } = await client.search(searchBase, {
        scope: 'sub',
        filter: `(|(userPrincipalName=${login})(sAMAccountName=${login})(mail=${login}))`,
        attributes: ['displayName', 'mail', 'title', 'department', 'cn', 'givenName', 'sn']
      })

      await client.unbind()
      const userData = searchEntries[0] || {}

      return {
        status: true,
        message: 'Zalogowano pomyślnie',
        data: {
          FullName: userData.cn,
          department: userData.department,
          title: userData.title
        }
      }
    } catch (error: any) {
      try {
        await client.unbind()
      } catch (e) {}

      let userMessage = 'Błąd logowania.'

      if (error.message.includes('InvalidCredentials') || error.message.includes('data 52e')) {
        userMessage = 'Nieprawidłowy login lub hasło.'
      } else if (error.message.includes('ETIMEDOUT')) {
        userMessage = 'Nie można połączyć się z serwerem logowania (Timeout).'
      }

      return {
        status: false,
        message: userMessage,
        rawError: error.message
      }
    }
  })
}
