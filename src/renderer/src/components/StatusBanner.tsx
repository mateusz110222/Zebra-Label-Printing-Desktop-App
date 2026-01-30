import { useTranslation } from 'react-i18next'
import React from 'react'

interface StatusBannerProps {
  type: 'success' | 'error'
  message: string
  details?: string
  onClose: () => void
}

export default function StatusBanner({
  type,
  message,
  details,
  onClose
}: StatusBannerProps): React.JSX.Element {
  const { t } = useTranslation()
  const isSuccess = type === 'success'

  return (
    <div
      className={`mb-6 rounded-xl border p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 flex items-start gap-4 ${
        isSuccess
          ? 'bg-green-50 border-green-200 text-green-900'
          : 'bg-red-50 border-red-200 text-red-900'
      }`}
    >
      <div
        className={`mt-0.5 p-1.5 rounded-full shrink-0 ${
          isSuccess ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'
        }`}
      >
        {isSuccess ? (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <h3 className="font-bold text-sm uppercase tracking-wide opacity-90">
          {isSuccess ? t('status_banner.success') : t('status_banner.error')}
        </h3>
        <p className="font-medium mt-1">{message}</p>
        {details && (
          <p className="mt-2 text-xs font-mono bg-white/50 p-2 rounded border border-black/5 break-all">
            {details}
          </p>
        )}
      </div>
      <button onClick={onClose} className="opacity-50 hover:opacity-100 transition">
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
