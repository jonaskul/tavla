import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ToastContext = createContext(() => {})

// The MutationCache is built before the React tree exists, so it cannot use
// the hook. It calls notify(); ToastProvider registers the real shower when
// it mounts, and before that a message has nowhere to go but the console.
let shower = (message) => console.error('Toast før oppstart:', message)

export const notify = (message, type) => shower(message, type)

export const useToast = () => useContext(ToastContext)

/**
 * A place for failures nothing else claimed.
 *
 * Mutations that handle their own errors keep showing them inline, next to
 * the thing that failed, which is better. This exists so the ones that do
 * not are still visible: before it, roughly three quarters of the mutations
 * in this app failed in complete silence — the user pressed a button and
 * nothing happened at all.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef([])

  const show = useCallback((message, type = 'error') => {
    if (!message) return
    const id = Math.random().toString(36).slice(2)
    setToasts((current) => [...current, { id, message, type }])
    timers.current.push(
      setTimeout(
        () => setToasts((current) => current.filter((toast) => toast.id !== id)),
        6000,
      ),
    )
  }, [])

  useEffect(() => {
    shower = show
    return () => { shower = (message) => console.error('Toast etter avmontering:', message) }
  }, [show])

  // Without this, a timer that outlives the provider sets state on an
  // unmounted component.
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-testid="toast"
            className={`px-4 py-3 rounded-lg shadow-lg text-sm text-white max-w-sm ${
              toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
