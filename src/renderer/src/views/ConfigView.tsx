import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import CriticalErrorState from '../components/CriticalErrorState'
import StatusBanner from '../components/StatusBanner'
import ActionButton from '../components/ActionButton'
import { useAuth } from '@renderer/context/AuthContext'
import { FcPrint, FcElectronics, FcFlashOn } from 'react-icons/fc'
import { FaSatelliteDish } from 'react-icons/fa'
import { LuPlug2 } from 'react-icons/lu'

type ConnectionType = 'IP' | 'COM' | 'USB'

interface UiMessage {
  type: 'success' | 'error'
  text: string
  details?: string
}

export default function ConfigView(): React.JSX.Element {
  const { t } = useTranslation()
  const { CanEdit } = useAuth()

  const [criticalError, setCriticalError] = useState<string | null>(null)
  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const [connectionType, setConnectionType] = useState<ConnectionType>('IP')
  const [ipAddress, setIpAddress] = useState('')
  const [port, setPort] = useState('9100')
  const [selectedCom, setSelectedCom] = useState('')
  const [serialPorts, setSerialPorts] = useState<string[]>([])
  const [displayedCom, setDisplayedCom] = useState('')

  const [isProcessing, setIsProcessing] = useState(false)
  const [isEditing, setIsEditing] = useState(true)

  useEffect(() => {
    const init = async (): Promise<void> => {
      setIsInitializing(true)
      try {
        const serialPortsResp = await window.electron.ipcRenderer.invoke('get-serialPorts')

        if (serialPortsResp.status) setSerialPorts(serialPortsResp.data)

        const configResponse = await window.electron.ipcRenderer.invoke('get-printer-config')

        if (configResponse.status && configResponse.data) {
          const cfg = configResponse.data

          setConnectionType(cfg.type)
          if (cfg.ip) setIpAddress(cfg.ip)
          if (cfg.port) setPort(cfg.port.toString())
          if (cfg.comPort) {
            setDisplayedCom(cfg.comPort)
          }

          const isIpValid = cfg.type === 'IP' && cfg.ip
          const isComValid = cfg.type === 'COM' && cfg.comPort

          if (isIpValid || isComValid) {
            setIsEditing(false)
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        setCriticalError(errMsg)
      } finally {
        setIsInitializing(false)
      }
    }
    init()
  }, [])

  const handleAction = async (action: 'SAVE' | 'TEST'): Promise<void> => {
    setIsProcessing(true)
    setUiMessage(null)

    const payload = {
      type: connectionType,
      ip: connectionType === 'IP' ? ipAddress : null,
      port: connectionType === 'IP' ? parseInt(port) : null,
      comPort: connectionType === 'COM' ? selectedCom : null
    }

    const channel = action === 'SAVE' ? 'save-printer-config' : 'test-printer-connection'

    try {
      const resp = await window.electron.ipcRenderer.invoke(channel, payload)

      if (resp.status) {
        setUiMessage({
          type: 'success',
          text:
            action === 'SAVE'
              ? t('config_view.save_success', 'Konfiguracja zapisana')
              : t('config_view.test_success', 'Połączenie nawiązane'),
          details: resp.message !== 'label_sent_successfully' ? resp.message : undefined
        })

        if (action === 'SAVE') {
          const configResponse = await window.electron.ipcRenderer.invoke('get-printer-config')
          if (configResponse.status && configResponse.data) {
            const cfg = configResponse.data
            setConnectionType(cfg.type || 'IP')
            setIpAddress(cfg.ip || '')
            setPort((cfg.port || 9100).toString())
            setDisplayedCom(cfg.comPort || '')
            setSelectedCom('')
          }
          setIsEditing(false)
        }
      } else {
        setUiMessage({
          type: 'error',
          text:
            action === 'SAVE'
              ? t('config_view.save_error', 'Błąd zapisu')
              : t('config_view.test_error', 'Błąd połączenia'),
          details: resp.message
        })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setUiMessage({
        type: 'error',
        text: t('config_view.critical_error', 'Wystąpił błąd krytyczny'),
        details: errMsg
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const isValid =
    connectionType === 'IP' ? ipAddress.length >= 7 && port.length > 1 : selectedCom.length > 0

  if (criticalError) {
    return (
      <CriticalErrorState
        message={criticalError}
        onRetry={() => window.location.reload()}
        title={t('config_view.error')}
      />
    )
  }

  if (isInitializing) {
    return (
      <div className="p-8 font-sans text-slate-800">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
          </div>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 h-64 flex flex-col justify-center items-center">
            <div className="flex flex-col items-center gap-4 animate-pulse">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-slate-500 font-medium">
                {t('config_view.loading_system', 'Wczytywanie konfiguracji systemu...')}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {t('config_view.title', 'Konfiguracja Drukarki')}
            </h2>
            <p className="text-slate-500 mt-2">
              {t('config_view.subtitle', 'Zarządzaj połączeniem z drukarką Zebra.')}
            </p>
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

        {!isEditing ? (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative">
            <div className="p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div
                    className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-inner ${
                      connectionType === 'IP'
                        ? 'bg-indigo-50 text-indigo-600'
                        : connectionType === 'COM'
                          ? 'bg-orange-50 text-orange-600'
                          : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {connectionType === 'IP' && <FcElectronics className="text-5xl" />}
                    {connectionType === 'COM' && <FcFlashOn className="text-5xl" />}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      {t('config_view.active_connection', 'Aktywne połączenie')}
                    </h3>
                    {connectionType === 'IP' && (
                      <div>
                        <p className="text-3xl font-bold text-slate-900 font-mono tracking-tight">
                          {ipAddress}
                        </p>
                        <p className="text-slate-500 font-medium mt-1">
                          Port: <span className="text-slate-700">{port}</span>
                        </p>
                      </div>
                    )}
                    {connectionType === 'COM' && (
                      <div>
                        <p className="text-3xl font-bold text-slate-900 font-mono tracking-tight">
                          {displayedCom}
                        </p>
                        <p className="text-slate-500 font-medium mt-1">Typ: Serial Port (COM)</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="hidden md:block">
                  <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                    ● {t('config_view.configured', 'Skonfigurowano')}
                  </span>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-end gap-4">
                <button
                  onClick={() => handleAction('TEST')}
                  disabled={isProcessing}
                  className="text-md font-semibold text-slate-600 hover:text-indigo-600 p-2 transition-colors flex items-center gap-2"
                >
                  {isProcessing ? (
                    <span className="animate-pulse">Testowanie...</span>
                  ) : (
                    <>
                      <FcPrint />
                      {t('config_view.test_print', 'Test Połączenia')}
                    </>
                  )}
                </button>

                {CanEdit && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all active:scale-95"
                  >
                    {t('config_view.change_config', 'Zmień Konfigurację')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center border-b border-slate-100">
              <button
                onClick={() => setConnectionType('IP')}
                className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  connectionType === 'IP'
                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <FaSatelliteDish className="text-xl" />
                <span>{t('config_view.tabs_network', 'Sieć (IP)')}</span>
              </button>

              <button
                onClick={() => setConnectionType('COM')}
                className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  connectionType === 'COM'
                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <LuPlug2 className="text-xl" />
                <span>{t('config_view.tabs_com', 'Port Szeregowy (COM)')}</span>
              </button>
            </div>

            <div className="p-8">
              <div className="grid grid-cols-1 gap-6">
                {connectionType === 'IP' && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-1">
                        {t('config_view.ip_address', 'Adres IP')}
                      </label>
                      <input
                        className="p-2 block w-full rounded-lg border-0 py-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6 font-mono"
                        value={ipAddress}
                        onChange={(e) => setIpAddress(e.target.value)}
                        placeholder="192.168.x.x"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-1">
                        {t('config_view.port', 'Port')}
                      </label>
                      <input
                        className="p-2 block w-full rounded-lg border-0 py-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6 font-mono"
                        type="number"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        placeholder="9100"
                      />
                    </div>
                  </>
                )}

                {connectionType === 'COM' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-1">
                      {t('config_view.port_com', 'Wybierz Port COM')}
                    </label>
                    <select
                      className="block w-full rounded-lg border-0 py-3 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      value={selectedCom || ''}
                      onClick={async () => {
                        const serialPortsResp =
                          await window.electron.ipcRenderer.invoke('get-serialPorts')
                        if (serialPortsResp.status) setSerialPorts(serialPortsResp.data)
                      }}
                      onChange={(e) => setSelectedCom(e.target.value)}
                    >
                      <option value="" disabled>
                        {t('config_view.select_from_list', '-- Wybierz --')}
                      </option>
                      {serialPorts.length === 0 && (
                        <option disabled>{t('config_view.no_ports', 'Brak portów')}</option>
                      )}
                      {serialPorts.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  {t('config_view.cancel', 'Anuluj')}
                </button>

                <ActionButton
                  isLoading={isProcessing}
                  isDisabled={!isValid}
                  label={t('config_view.save', 'Zapisz Konfigurację')}
                  loadingLabel={t('config_view.saving', 'Zapisywanie...')}
                  onClick={() => handleAction('SAVE')}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
