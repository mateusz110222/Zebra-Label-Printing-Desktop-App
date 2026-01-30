import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import StatusBanner from '../components/StatusBanner'
import ActionButton from '../components/ActionButton'
import { useNavigate } from 'react-router-dom'
import PasswordInput from '@renderer/components/PasswordInput'
import EmailInput from '@renderer/components/EmailInput'

interface UiMessage {
  type: 'success' | 'error'
  text: string
  details?: string
}

export default function Login() {
  const { t } = useTranslation()
  const { setLogin } = useAuth()

  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)

  const [login, setLoginState] = useState<string>('')
  const [password, setPasswordState] = useState<string>('')

  const navigate = useNavigate()

  const HandleLogin = async () => {
    if (!login || !password) return

    setIsProcessing(true)
    try {
      const response = await window.electron.ipcRenderer.invoke('handle-login', {
        login: login,
        password: password
      })

      if (!response.status) {
        throw new Error(response.message || 'Fail while trying to login')
      }

      const FullName = response.data.FullName
      const CanEdit = response.data.department.includes('IT')

      setUiMessage({
        type: 'success',
        text: t('login.login_sucessful', 'Udało się zalogować'),
        details: response.message || String(response)
      })

      setLogin(FullName, CanEdit)
      navigate('/')
    } catch (error: any) {
      setUiMessage({
        type: 'error',
        text: t('login.login_error', 'Błąd podczas logowania się'),
        details: error.message || String(error)
      })
    }
    setIsProcessing(false)
  }

  return (
    <div className="p-8 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {t('login.title')}
            </h2>
            <p className="text-slate-500 mt-2">{t('login.subtitle')}</p>
          </div>
        </div>

        {uiMessage && (
          <StatusBanner
            type={uiMessage.type}
            message={uiMessage.text}
            details={uiMessage.details}
            onClose={() => setUiMessage(null)}
          />
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            HandleLogin()
          }}
        >
          <div className="p-8">
            <div className="grid grid-cols-1 gap-6">
              <EmailInput value={login} onChange={setLoginState} onEnter={HandleLogin} />
              <PasswordInput value={password} onChange={setPasswordState} onEnter={HandleLogin} />

              <ActionButton
                isLoading={isProcessing}
                isDisabled={!login || !password}
                label={t('login.login_btn')}
                loadingLabel={t('login.logon', 'Logowanie...')}
                onClick={() => HandleLogin()}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
