import { t } from '../i18n/no'

export default function ConfirmDialog({ open, message, error, errorTestId, onConfirm, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        {error ? (
          <p data-testid={errorTestId} className="text-red-600 text-sm mb-4">{error}</p>
        ) : (
          <p className="text-sm text-gray-700 mb-4">{message}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t.common.cancel}
          </button>
          {!error && (
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
            >
              {t.common.delete}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
