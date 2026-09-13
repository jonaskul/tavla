import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { requestLoginCode, verifyLoginCode } from '../api/client'
import { errorMessage } from '../api/errors'
import { t } from '../i18n/no'

/**
 * Two steps: ask for a code, then enter it.
 *
 * Note what happens when the address has no account: nothing visible. The
 * server answers identically whether or not it knows the address, so that
 * this page cannot be used to find out who its customers are — and the page
 * has to keep that promise by advancing to the code step regardless. Saying
 * "no such user" here would give away exactly what the server refuses to.
 */
export default function Login({ onSignedIn }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const requestMutation = useMutation({
    mutationFn: () => requestLoginCode(email.trim()),
    onSuccess: () => {
      setSent(true)
      setCode('')
      setError(null)
    },
    onError: (err) => setError(errorMessage(err, {}, t.common.unknownError)),
  })

  const verifyMutation = useMutation({
    mutationFn: () => verifyLoginCode(email.trim(), code.trim()),
    onSuccess: async () => {
      // Whoever is signed in has changed, so nothing cached belongs to them.
      qc.clear()
      // Then let the gate ask again who that is. Doing this through the
      // cache does not work: the session query sits in its 401 error state
      // with retry off, clearing removes it rather than reviving it, and
      // refetchQueries then finds nothing to refetch. The cookie was set and
      // the app never noticed. Calling the gate's own refetch is unambiguous.
      await onSignedIn?.()
    },
    onError: (err) =>
      setError(errorMessage(err, { 400: t.auth.invalidCode }, t.common.unknownError)),
  })

  const submitEmail = (e) => {
    e.preventDefault()
    const value = email.trim()
    if (!value) return setError(t.auth.emailRequired)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setError(t.auth.emailInvalid)
    setError(null)
    requestMutation.mutate()
  }

  const submitCode = (e) => {
    e.preventDefault()
    if (!code.trim()) return setError(t.auth.codeRequired)
    setError(null)
    verifyMutation.mutate()
  }

  const startOver = () => {
    setSent(false)
    setCode('')
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">{t.auth.title}</h1>

        {!sent ? (
          <>
            <p className="text-sm text-gray-500 mb-6">{t.auth.intro}</p>
            <form onSubmit={submitEmail} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t.auth.email}
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && (
                <p data-testid="login-error" className="text-red-600 text-sm">{error}</p>
              )}
              <button
                type="submit"
                disabled={requestMutation.isPending}
                className="w-full px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {requestMutation.isPending ? t.auth.sending : t.auth.sendCode}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-1">
              {t.auth.codeSent.replace('{email}', email.trim())}
            </p>
            <p className="text-sm text-gray-400 mb-6">{t.auth.codeValidity}</p>
            <form onSubmit={submitCode} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-code"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t.auth.code}
                </label>
                <input
                  id="login-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-lg tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && (
                <p data-testid="login-error" className="text-red-600 text-sm">{error}</p>
              )}
              <button
                type="submit"
                disabled={verifyMutation.isPending}
                className="w-full px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {verifyMutation.isPending ? t.auth.signingIn : t.auth.signIn}
              </button>
            </form>
            <div className="flex justify-between mt-4 text-sm">
              <button onClick={startOver} className="text-gray-500 hover:text-gray-700">
                {t.auth.useAnotherEmail}
              </button>
              <button
                onClick={() => requestMutation.mutate()}
                disabled={requestMutation.isPending}
                className="text-blue-600 hover:underline disabled:opacity-50"
              >
                {t.auth.resend}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
