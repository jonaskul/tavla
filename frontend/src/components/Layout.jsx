import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSystemPending, signOut } from '../api/client'
import { t } from '../i18n/no'
import { useSession } from './RequireAuth'

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const qc = useQueryClient()
  const { user, refresh } = useSession() ?? {}

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSettled: async () => {
      // Clear rather than invalidate: what is cached belonged to whoever was
      // signed in, and none of it is theirs to keep once they are not. Then
      // ask the gate again — clearing removes the session query rather than
      // reviving it, so on its own the app kept rendering as the old user.
      qc.clear()
      await refresh?.()
    },
  })

  const { data: pending } = useQuery({
    queryKey: ['system-pending'],
    queryFn: getSystemPending,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-0 flex items-center h-14 gap-8">
          <Link
            to="/"
            className="text-lg font-bold text-blue-700 tracking-tight shrink-0"
          >
            Tavla
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              to="/"
              className={
                pathname === '/'
                  ? 'text-blue-700 font-medium'
                  : 'text-gray-600 hover:text-blue-600'
              }
            >
              {t.nav.properties}
            </Link>
            <Link
              to="/innstillinger/modultyper"
              className={`relative ${
                pathname.startsWith('/innstillinger')
                  ? 'text-blue-700 font-medium'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              {t.nav.settings}
              {pending?.updates_available && (
                <span className="absolute -top-1 -right-2 w-2 h-2 bg-orange-500 rounded-full" />
              )}
            </Link>
          </nav>

          {user && (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="text-gray-500 hidden sm:inline" title={t.auth.signedInAs}>
                {user.email}
              </span>
              <button
                onClick={() => signOutMutation.mutate()}
                disabled={signOutMutation.isPending}
                className="text-gray-600 hover:text-blue-600 disabled:opacity-50"
              >
                {t.auth.signOut}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
