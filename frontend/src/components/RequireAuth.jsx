import { createContext, useContext, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { getMe, setUnauthorizedHandler } from '../api/client'
import { t } from '../i18n/no'
import Login from '../pages/Login'

const SessionContext = createContext(null)

/** { user, refresh } — the signed-in user, and a way to ask again. */
export const useSession = () => useContext(SessionContext)

/**
 * The gate in front of the whole app.
 *
 * /auth/me is the single question asked: a 401 means show the sign-in page,
 * anything else means carry on. Self-hosted installs running with
 * AUTH_MODE=single_user get a principal without signing in, so this never
 * appears for them and that path keeps working unchanged.
 */
export default function RequireAuth({ children }) {
  const qc = useQueryClient()
  const { data: session, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['session'],
    queryFn: getMe,
    // 401 is an answer, not a failure to retry.
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    setUnauthorizedHandler(() => refetch())
    return () => setUnauthorizedHandler(() => {})
  }, [refetch])

  const value = useMemo(() => ({ user: session, refresh: refetch }), [session, refetch])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        {t.auth.checking}
      </div>
    )
  }

  if (isError) {
    if (error?.response?.status === 401) {
      return <Login onSignedIn={() => refetch()} />
    }
    // Anything else — the API is down, the network is gone — is not a
    // sign-in problem, and pretending it is would send the user round a
    // loop of codes that cannot arrive.
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-red-600 max-w-sm text-center">
          {t.common.networkError}
        </p>
      </div>
    )
  }

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}
